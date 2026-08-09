#!/usr/bin/env node
/**
 * The full Release Candidate battery, in order, with the mirror checked
 * between the steps that can damage it.
 *
 * It exists because running these by hand is how the order gets lost, and the
 * order matters. Two examples from the run that produced this file:
 *
 *   - `--reset` drops the `autocraw_ingest` role, so the AutoCraw suite fails
 *     to authenticate unless the credential is reissued first. The error it
 *     gives — `user not found in the database` — names neither the role nor the
 *     reset.
 *   - the HTTP and AutoCraw suites used to delete a catalogue row on their way
 *     out. The damage surfaced two steps later, as a foreign key error in the
 *     account QA. `--check-catalog` between steps turns that into an immediate,
 *     named failure.
 *
 * Every step is a command this repository already has. Nothing is reimplemented
 * here; this file is an order and a record.
 *
 *   node scripts/release-candidate.mjs            run everything
 *   node scripts/release-candidate.mjs --local    stop before anything remote
 */

import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL_ONLY = process.argv.includes('--local');

const PREVIEW = 'https://free-ai-radar-git-opus5-premium-rebuild-nada-de-pro.vercel.app';

/**
 * `remote` marks a step that talks to Supabase staging or the deployment.
 * `expect` is a substring the output must contain — a step that exits zero
 * while printing a failure is a step that lied, and several of these report
 * their own totals.
 */
const STEPS = [
  { id: 'lint', label: 'lint', run: ['npm', 'run', 'lint'] },
  { id: 'typecheck', label: 'typecheck', run: ['npm', 'run', 'typecheck'], expect: '0 errors' },
  { id: 'unit', label: 'pruebas unitarias', run: ['npm', 'test'], expect: 'passed' },
  { id: 'build', label: 'build', run: ['npm', 'run', 'build'], expect: 'Complete!' },

  {
    id: 'migrate',
    label: 'migración desde cero + sincronización',
    run: ['npm', 'run', 'db:reset:staging'],
    remote: true,
    expect: 'Instalación coherente',
  },
  {
    id: 'credential',
    label: 'credencial de AutoCraw (el reset la elimina)',
    run: ['npm', 'run', 'autocraw:credential'],
    remote: true,
    // The issuer now proves the credential authenticates before returning, so
    // this waits for a working credential rather than for an ALTER to return.
    expect: 'Comprobada: autentica',
  },
  { id: 'mirror-1', label: 'espejo tras migrar', run: ['npm', 'run', 'db:check:staging'], remote: true, expect: 'coincide' },

  { id: 'rls', label: 'RLS SQL', run: ['npm', 'run', 'rls:staging'], remote: true, expect: '51/51' },
  { id: 'mirror-2', label: 'espejo tras RLS', run: ['npm', 'run', 'db:check:staging'], remote: true, expect: 'coincide' },

  { id: 'http', label: 'HTTP / Auth', run: ['npm', 'run', 'http:staging'], remote: true, expect: '49/49' },
  { id: 'mirror-3', label: 'espejo tras HTTP', run: ['npm', 'run', 'db:check:staging'], remote: true, expect: 'coincide' },

  { id: 'autocraw', label: 'AutoCraw', run: ['npm', 'run', 'autocraw:staging'], remote: true, expect: 'Bypass: 0' },
  { id: 'mirror-4', label: 'espejo tras AutoCraw', run: ['npm', 'run', 'db:check:staging'], remote: true, expect: 'coincide' },

  {
    id: 'settled',
    label: 'el despliegue ha dejado de moverse',
    run: ['node', 'scripts/preview-settled.mjs', PREVIEW],
    remote: true,
    expect: 'despliegue estable',
  },
  {
    id: 'accounts',
    label: 'QA de cuentas reales',
    run: ['node', 'scripts/preview-account-qa.mjs'],
    remote: true,
    expect: '0 fallos',
  },
  {
    id: 'regression',
    label: 'regresión pública del Preview',
    run: [
      'npx', 'playwright', 'test', 'public.spec.ts', 'crawl.spec.ts',
      '--project=chromium', '--project=firefox', '--project=webkit',
      '--project=mobile', '--project=mobile-safari', '--reporter=line',
    ],
    remote: true,
    env: { E2E_BASE_URL: PREVIEW },
    expect: 'passed',
  },
];

/** Never let a step's output carry a connection string or a key into the log. */
function scrub(text) {
  return String(text)
    .replace(/postgres(ql)?:\/\/[^\s'"]+/gi, '«cadena de conexión omitida»')
    .replace(/\b(eyJ[A-Za-z0-9_-]{10,})\b/g, '«token omitido»')
    .replace(/\b([a-z0-9]{4})[a-z0-9]{4,}\.(supabase\.(?:co|com|net))/gi, (_m, h, t) => `${h}….${t}`);
}

function runStep(step) {
  const started = Date.now();
  const result = spawnSync(step.run[0], step.run.slice(1), {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: { ...process.env, ...(step.env ?? {}) },
  });

  const output = scrub(`${result.stdout ?? ''}${result.stderr ?? ''}`);
  const exited = result.status ?? 1;
  const satisfied = !step.expect || output.includes(step.expect);

  return {
    id: step.id,
    label: step.label,
    command: step.run.join(' '),
    remote: Boolean(step.remote),
    exitCode: exited,
    expected: step.expect ?? null,
    expectationMet: satisfied,
    pass: exited === 0 && satisfied,
    seconds: Math.round((Date.now() - started) / 1000),
    /*
     * Six lines was enough for the steps that end in a one-line verdict, and
     * useless for the one that does not. A Playwright failure prints the error,
     * the diff and the trace path above the summary, and keeping only the tail
     * threw all of that away — leaving four spec names and no reason, which
     * cost a re-run to rediscover.
     *
     * A passing step still only needs its verdict; a failing one gets enough to
     * act on.
     */
    tail: output.trimEnd().split('\n').slice(exited === 0 && satisfied ? -6 : -60).join('\n'),
  };
}

const results = [];
let stopped = null;

for (const step of STEPS) {
  if (LOCAL_ONLY && step.remote) break;

  process.stdout.write(`  ${step.label.padEnd(42)}`);
  const result = runStep(step);
  results.push(result);

  if (result.pass) {
    console.log(`✓ ${result.seconds}s`);
    continue;
  }

  console.log(`✗ ${result.seconds}s`);
  console.log(
    `\n  salida (exit ${result.exitCode}${result.expectationMet ? '' : `, no contiene "${result.expected}"`}):`
  );
  for (const line of result.tail.split('\n')) console.log(`    ${line}`);

  /*
   * Stops at the first failure rather than carrying on. Later steps run against
   * the state this one left, so their results would describe a database nobody
   * meant to build.
   */
  stopped = step.id;
  break;
}

const failed = results.filter((r) => !r.pass).length;

console.log('\n───────────────────────────────────────────────');
console.log(
  `${results.length - failed}/${results.length} pasos correctos` +
    (stopped ? ` · detenido en "${stopped}"` : '') +
    (LOCAL_ONLY ? ' · sólo local' : '')
);

mkdirSync(join(ROOT, 'docs/evidence'), { recursive: true });
writeFileSync(
  join(ROOT, 'docs/evidence/release-candidate.json'),
  `${JSON.stringify(
    {
      ranAt: new Date().toISOString(),
      scope: LOCAL_ONLY ? 'local' : 'completo (local + staging + preview)',
      totals: { total: results.length, passed: results.length - failed, failed },
      stoppedAt: stopped,
      steps: results,
    },
    null,
    2
  )}\n`,
  'utf8'
);
console.log('Evidencia: docs/evidence/release-candidate.json\n');

process.exit(failed > 0 ? 1 : 0);
