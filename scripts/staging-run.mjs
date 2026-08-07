#!/usr/bin/env node
/**
 * Applies the migrations and runs the adversarial suite against Supabase
 * staging.
 *
 * Deliberately thin. It reads the same `.sql` files the preflight read, sends
 * them, and reports what came back — it does not reimplement a single rule.
 * The suite is the source of truth for what an attack is; this file is a pipe.
 *
 * Nothing here runs until `staging-guard.mjs` has passed, and nothing here
 * prints a connection string, a password or a key.
 *
 *   node scripts/staging-run.mjs --migrate   apply 0001→0004 to a clean base
 *   node scripts/staging-run.mjs --suite     run the 51 probes, roll back
 *   node scripts/staging-run.mjs --verify    confirm a fresh install is sane
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const MIGRATIONS = [
  'supabase/migrations/0001_core_schema.sql',
  'supabase/migrations/0002_rls_policies.sql',
  'supabase/migrations/0003_autocraw_affiliate.sql',
  'supabase/migrations/0004_rls_hardening.sql',
];

const SUITE = 'supabase/tests/rls_adversarial.sql';

function loadEnv() {
  const merged = { ...process.env };
  for (const name of ['.env', '.env.local']) {
    const path = join(ROOT, name);
    if (!existsSync(path)) continue;
    // CRLF as well as LF — see the note in staging-guard.mjs.
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!match) continue;
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (value) merged[match[1]] = value;
    }
  }
  return merged;
}

/**
 * The guard runs as a separate process on purpose.
 *
 * Importing it would let a future edit here accidentally bypass it — a
 * try/catch in the wrong place, an early return. A non-zero exit code from
 * another process cannot be swallowed by mistake.
 */
function enforceGuard() {
  try {
    const output = execFileSync('node', [join(ROOT, 'scripts/staging-guard.mjs')], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    console.log(output.trim());
  } catch (error) {
    console.error(error.stdout ?? '');
    console.error('\nEl guardián ha detenido la ejecución. No se ha conectado con nada.\n');
    process.exit(1);
  }
}

/**
 * Never let a driver error carry anything identifying into a log.
 *
 * Widened after a real leak: an error read `getaddrinfo ENOTFOUND
 * db.<ref>.supabase.co` and printed straight to the console, because the
 * previous version only looked for `postgres://` strings and a bare hostname
 * walked past it. A project ref is not a hard secret — it is in every public
 * API URL — but the promise was that this prints no host details, and a
 * promise with an exception in it is not a promise.
 */
function safeError(error) {
  return String(error instanceof Error ? error.message : error)
    .replace(/postgres(ql)?:\/\/[^\s'"]+/gi, '«cadena de conexión omitida»')
    .replace(
      /\b([a-z0-9]{4})[a-z0-9]*\.(supabase\.(?:co|com|net))/gi,
      (_m, head, tail) => head + '….' + tail
    )
    .replace(
      /\b(db|aws-\d)\.([a-z0-9]{4})[a-z0-9]*\./gi,
      (_m, prefix, head) => prefix + '.' + head + '….'
    );
}

function connect(env) {
  return postgres(env['SUPABASE_DB_URL_STAGING'], {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 30,
    // Supabase terminates TLS with its own chain; the pooler needs this.
    ssl: 'require',
    onnotice: () => {},
  });
}

async function migrate(sql) {
  console.log('\nAplicando migraciones desde cero');
  console.log('───────────────────────────────────────────────');

  for (const file of MIGRATIONS) {
    const content = readFileSync(join(ROOT, file), 'utf8');
    const label = file.split('/').pop();
    process.stdout.write(`  ${label.padEnd(34)}`);
    try {
      await sql.unsafe(content).simple();
      console.log('✓');
    } catch (error) {
      console.log('✗');
      console.error(`\n  ${safeError(error)}\n`);
      throw new Error(`La migración ${label} ha fallado.`);
    }
  }
}

/**
 * A fresh install has to be more than "no statement errored".
 *
 * These are the shapes the preflight taught us to check: the enum types exist,
 * RLS is on everywhere, the policies are actually there, and the AutoCraw role
 * can reach the commercial tables and nothing else.
 */
async function verify(sql) {
  console.log('\nVerificando la instalación');
  console.log('───────────────────────────────────────────────');

  const [{ count: tables }] = await sql`
    select count(*)::int from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'`;

  const [{ count: policies }] = await sql`
    select count(*)::int from pg_policies where schemaname = 'public'`;

  const unprotected = await sql`
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false
    order by c.relname`;

  const [{ exists: hasRole }] = await sql`
    select exists(select 1 from pg_roles where rolname = 'autocraw_ingest') as exists`;

  const reach = await sql`
    select table_name, string_agg(distinct privilege_type, ', ' order by privilege_type) as privileges
    from information_schema.role_table_grants
    where grantee = 'autocraw_ingest'
    group by table_name order by table_name`;

  const [{ writable: roleWritable }] = await sql`
    select exists(
      select 1 from information_schema.column_privileges
      where grantee = 'authenticated' and table_name = 'profiles'
        and column_name = 'role' and privilege_type = 'UPDATE'
    ) as writable`;

  console.log(`  Tablas:                        ${tables}`);
  console.log(`  Políticas:                     ${policies}`);
  console.log(`  Rol autocraw_ingest:           ${hasRole ? 'existe' : 'AUSENTE'}`);
  console.log(`  Tablas que alcanza:            ${reach.length}`);
  console.log(`  Defensa por columna en role:   ${roleWritable ? 'ANULADA' : 'intacta'}`);
  console.log(`  Tablas sin RLS:                ${unprotected.length}`);

  const problems = [];
  if (!hasRole) problems.push('el rol autocraw_ingest no existe');
  if (roleWritable) problems.push('authenticated puede escribir profiles.role');
  if (unprotected.length) {
    problems.push(`sin RLS: ${unprotected.map((r) => r.relname).join(', ')}`);
  }
  for (const row of reach) {
    // The whole point of the role. If an editorial or user table appears here,
    // least privilege has failed however good the document describing it is.
    if (!/^(affiliate_|tool_product_relations|placement_slots|categories)/.test(row.table_name)) {
      problems.push(`autocraw_ingest alcanza ${row.table_name}`);
    }
  }

  if (problems.length) {
    console.log('\n  ✗ Problemas:');
    for (const problem of problems) console.log(`     · ${problem}`);
    throw new Error('La instalación no es correcta.');
  }

  console.log('\n  ✓ Instalación coherente.');
  return { tables, policies, autocrawReach: reach, columnDefenceIntact: !roleWritable };
}

/**
 * Runs the suite inside a transaction we control, so the results table can be
 * read before the rollback takes it away.
 *
 * The file's own `begin;`/`rollback;` and its final `raise exception` gate are
 * removed for exactly that reason — the same thing the PGlite harness does, and
 * for the same reason. The gate is then reapplied here, so the rule is
 * identical and only the plumbing differs.
 */
async function runSuite(sql) {
  const raw = readFileSync(join(ROOT, SUITE), 'utf8');
  const body = raw
    .replace(/^begin;\s*$/m, '')
    .replace(/do \$\$\s*declare failures int;[\s\S]*?end \$\$;\s*/m, '')
    .replace(/^rollback;\s*$/m, '');

  console.log('\nEjecutando la suite adversarial');
  console.log('───────────────────────────────────────────────');

  let results = [];
  let policies = [];

  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(body).simple();
      await tx.unsafe("select set_config('role', 'none', true)");

      results = await tx`
        select id, severity, outcome, scenario, coalesce(detail, '') as detail
        from rls_results order by seq`;

      policies = await tx`
        select tablename, policyname, cmd, roles::text as roles
        from pg_policies where schemaname = 'public'
        order by tablename, policyname`;

      // Nothing this suite writes may survive. Aborting is the exit path.
      throw new Error('__rollback__');
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== '__rollback__') {
      console.error(`\n  ${safeError(error)}\n`);
      throw new Error('La suite no ha podido ejecutarse.');
    }
  }

  return { results, policies };
}

function printResults(results) {
  for (const row of results) {
    const mark = row.outcome === 'PASA' ? '✓ PASA  ' : '✗ FALLA ';
    console.log(`  ${row.id.padEnd(9)} ${row.severity.padEnd(9)} ${mark}  ${row.scenario.slice(0, 58)}`);
    if (row.outcome === 'FALLA') console.log(`${' '.repeat(31)}↳ ${row.detail}`);
  }
}

async function main() {
  const wants = {
    migrate: process.argv.includes('--migrate'),
    suite: process.argv.includes('--suite'),
    verify: process.argv.includes('--verify'),
  };

  if (!wants.migrate && !wants.suite && !wants.verify) {
    console.error('Indica --migrate, --verify o --suite.');
    process.exit(2);
  }

  enforceGuard();

  const env = loadEnv();
  const sql = connect(env);
  const evidence = { ranAt: new Date().toISOString(), target: 'supabase-staging' };
  let failed = 0;

  try {
    const [{ version }] = await sql`select version()`;
    // The version string names the engine, never the host.
    console.log(`\nMotor: ${version.split(' on ')[0]}`);
    evidence.engine = version.split(' on ')[0];

    if (wants.migrate) await migrate(sql);
    if (wants.verify || wants.migrate) evidence.install = await verify(sql);

    if (wants.suite) {
      const { results, policies } = await runSuite(sql);
      printResults(results);
      failed = results.filter((r) => r.outcome === 'FALLA').length;
      evidence.results = results;
      evidence.policies = policies;
      evidence.totals = { total: results.length, passed: results.length - failed, failed };

      console.log('───────────────────────────────────────────────');
      console.log(`\n${results.length - failed}/${results.length} bloqueados · ${failed} bypass`);
      console.log(`Políticas aplicadas: ${policies.length}`);
    }

    mkdirSync(join(ROOT, 'docs/evidence'), { recursive: true });
    writeFileSync(
      join(ROOT, 'docs/evidence/rls-staging-run.json'),
      `${JSON.stringify(evidence, null, 2)}\n`,
      'utf8'
    );
    console.log('\nEvidencia: docs/evidence/rls-staging-run.json\n');
  } catch (error) {
    console.error(`\n✗ ${safeError(error)}\n`);
    failed = failed || 1;
  } finally {
    await sql.end({ timeout: 5 });
  }

  process.exit(failed > 0 ? 1 : 0);
}

await main();
