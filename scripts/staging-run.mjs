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
 *   node scripts/staging-run.mjs --reset     drop and recreate schema public
 *
 * --reset exists because "migrations from clean" must stay repeatable: fixing
 * a migration and re-running it against a half-built schema proves nothing.
 * It runs only after the guard passes, and the guard's job is making sure the
 * schema it is about to drop belongs to staging.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from './db-connect.mjs';
import { loadEnv, readDbUrl } from './staging-guard.mjs';
import { catalogRows } from './catalog-source.mjs';
import { syncCatalog, verifyMirror } from './catalog-sync.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const MIGRATIONS = [
  'supabase/migrations/0001_core_schema.sql',
  'supabase/migrations/0002_rls_policies.sql',
  'supabase/migrations/0003_autocraw_affiliate.sql',
  'supabase/migrations/0004_rls_hardening.sql',
  'supabase/migrations/0005_postgrest_grants.sql',
  'supabase/migrations/0006_auth_user_trigger.sql',
  'supabase/migrations/0007_amazon_cache_instant.sql',
  'supabase/migrations/0008_amazon_creators_state.sql',
  'supabase/migrations/0009_free_model_unknown.sql',
  'supabase/migrations/0010_capabilities_start_effort.sql',
  'supabase/migrations/0011_start_effort_reason.sql',
  'supabase/migrations/0012_licence_layers.sql',
  'supabase/migrations/0013_model_access_and_openness.sql',
];

const SUITE = 'supabase/tests/rls_adversarial.sql';

/*
 * Every table AutoCraw is allowed to reach.
 *
 * An allowlist rather than a denylist, so a table added by a future migration
 * is a failure until somebody widens this on purpose. It has already earned
 * its keep once: adding the Creators API state tables made this check fail
 * immediately, which is the behaviour that catches an accidental grant.
 */
const AUTOCRAW_ALLOWED_TABLES =
  /^(affiliate_|tool_product_relations|placement_slots|categories|amazon_api_usage|amazon_api_quota|amazon_lwa_token)/;

/*
 * Environment reading is imported, not reimplemented.
 *
 * It was duplicated here, and the copy drifted: it read only
 * SUPABASE_DB_URL_STAGING while the guard had learned to accept
 * SUPABASE_DATABASE_URL too. The result was the worst possible shape of
 * failure — the guard approved the real staging database, then the runner got
 * `undefined` for a connection string, and postgres.js quietly fell back to
 * localhost. ECONNREFUSED, from a script that had just announced it was
 * pointed at staging.
 *
 * Two copies of "where does the connection string live?" is one too many.
 * The import is at the top of the file with the others.
 */

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
  const scrubbed = String(error instanceof Error ? error.message : error)
    .replace(/postgres(ql)?:\/\/[^\s'"]+/gi, '«cadena de conexión omitida»')
    .replace(
      /\b([a-z0-9]{4})[a-z0-9]{4,}\.(supabase\.(?:co|com|net))/gi,
      (_m, head, tail) => head + '….' + tail
    )
    .trim();

  /*
   * Redaction must never turn an error into silence.
   *
   * A driver error whose entire message was a connection string came out as
   * an empty line — a failure with no stated reason, which is worse than the
   * leak the scrubbing was there to prevent. Anything Postgres attaches that
   * is safe to show (code, severity, position, the failing detail) is added
   * back, and if nothing survives we say so rather than printing nothing.
   */
  const parts = [scrubbed];
  if (error && typeof error === 'object') {
    for (const key of ['code', 'severity', 'detail', 'hint', 'where', 'routine']) {
      const value = error[key];
      if (value && typeof value === 'string' && !parts.includes(value)) {
        parts.push(`${key}: ${value}`);
      }
    }
    if (error.cause) parts.push(`causa: ${safeError(error.cause)}`);
  }

  const joined = parts.filter(Boolean).join(' · ').trim();
  return joined || `(error sin mensaje utilizable: ${error?.constructor?.name ?? typeof error})`;
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
    if (!AUTOCRAW_ALLOWED_TABLES.test(row.table_name)) {
      problems.push(`autocraw_ingest alcanza ${row.table_name}, que no está en la lista permitida`);
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
    reset: process.argv.includes('--reset'),
    migrate: process.argv.includes('--migrate'),
    suite: process.argv.includes('--suite'),
    verify: process.argv.includes('--verify'),
    syncCatalog: process.argv.includes('--sync-catalog'),
    checkCatalog: process.argv.includes('--check-catalog'),
  };

  if (
    !wants.migrate && !wants.suite && !wants.verify &&
    !wants.reset && !wants.syncCatalog && !wants.checkCatalog
  ) {
    console.error(
      'Indica --reset, --migrate, --verify, --suite, --sync-catalog o --check-catalog.'
    );
    process.exit(2);
  }

  enforceGuard();

  const env = loadEnv();
  const sql = connect(readDbUrl(env).url);
  const evidence = { ranAt: new Date().toISOString(), target: 'supabase-staging' };
  let failed = 0;

  try {
    const [{ version }] = await sql`select version()`;
    // The version string names the engine, never the host.
    console.log(`\nMotor: ${version.split(' on ')[0]}`);
    evidence.engine = version.split(' on ')[0];

    if (wants.reset) {
      console.log('\nVaciando el esquema public');
      console.log('───────────────────────────────────────────────');
      await sql.unsafe('drop schema if exists public cascade; create schema public;').simple();
      // Supabase expects these to exist on the schema itself.
      await sql.unsafe(
        'grant usage on schema public to anon, authenticated, service_role; ' +
        'grant all on schema public to postgres;'
      ).simple();
      await sql.unsafe('drop role if exists autocraw_ingest').simple().catch(() => {});
      console.log('  esquema public recreado, vacío ✓');
      /*
       * Said here because the alternative is finding out later, from
       * `EAUTHQUERY: user not found in the database` — an error that names
       * neither the role nor the reset that caused it. Migration 0003 recreates
       * the role NOLOGIN; the password went with the old one.
       */
      console.log('  ⚠ autocraw_ingest se ha eliminado: ejecuta npm run autocraw:credential');
    }

    if (wants.migrate) await migrate(sql);

    // Part of a migration, not a step to remember afterwards: a schema whose
    // content mirror is empty cannot store a favourite.
    if (wants.migrate || wants.syncCatalog) {
      console.log('\nSincronizando el catálogo con el espejo de contenido');
      console.log('───────────────────────────────────────────────');
      /*
       * The driver is adapted to the module, not the other way round. `unsafe`
       * takes positional parameters exactly like PGlite's `query`, so the same
       * sync runs against Supabase here and against PostgreSQL-in-WASM in the
       * tests — one implementation of what syncing means, exercised by both.
       */
      const exec = (text, params = []) => sql.unsafe(text, params);
      evidence.catalog = await syncCatalog(exec, await catalogRows(), {
        log: (line) => console.log(line),
      });
    }

    /*
     * Read-only: asks whether the mirror still matches the catalogue and
     * changes nothing either way.
     *
     * It exists because a suite corrupted the catalogue and nothing noticed.
     * The HTTP and AutoCraw suites seeded `tool_ollama` as a fixture and
     * deleted it on the way out — correct while the mirror was empty,
     * destructive once the real Ollama row was there. The damage surfaced two
     * steps later as a foreign key error in the account QA, which is a long way
     * from the cause. Run between steps, this names it immediately.
     */
    if (wants.checkCatalog) {
      console.log('\nComprobando el espejo de contenido');
      console.log('───────────────────────────────────────────────');
      const exec = (text, params = []) => sql.unsafe(text, params);
      const problems = await verifyMirror(exec, await catalogRows());
      evidence.catalogCheck = { problems };

      if (problems.length) {
        for (const problem of problems) {
          console.log(`  ✗ ${problem.kind}: ${problem.detail}`);
        }
        throw new Error(`El espejo no coincide con el catálogo: ${problems.length} problema(s).`);
      }
      console.log('  el espejo coincide con el catálogo ✓');
    }

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
