#!/usr/bin/env node
/**
 * Runs the adversarial RLS suite against a real PostgreSQL.
 *
 * PGlite is PostgreSQL 18 compiled to WebAssembly — the actual engine, not a
 * simulation. Row level security, roles, policies, grants, triggers and
 * SECURITY DEFINER all behave exactly as they do on a server, which is what
 * makes the results here worth anything.
 *
 * What it is NOT: Supabase. GoTrue does not exist, so `auth.users` and
 * `auth.uid()` are recreated below from Supabase's own published definitions,
 * and the `service_role` is an ordinary superuser-ish role rather than one
 * carrying a signed JWT. The policies cannot tell the difference — they only
 * ever see `auth.uid()` and the current role — but the difference is real and
 * is stated in `docs/rls-staging-evidence.md` rather than glossed over.
 *
 *   node scripts/rls-harness.mjs                  run and print the table
 *   node scripts/rls-harness.mjs --json           machine-readable, for CI
 *   node scripts/rls-harness.mjs --no-hardening   omit 0004 and watch it fail
 *
 * That last flag is not a convenience. A suite that passes is only evidence if
 * it would have failed on the broken version, so this reproduces the original
 * privilege escalation on demand: without 0004, RLS-01a must go red.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AS_JSON = process.argv.includes('--json');
const NO_HARDENING = process.argv.includes('--no-hardening');

const MIGRATIONS = [
  'supabase/migrations/0001_core_schema.sql',
  'supabase/migrations/0002_rls_policies.sql',
  'supabase/migrations/0003_autocraw_affiliate.sql',
  'supabase/migrations/0004_rls_hardening.sql',
].filter((file) => !(NO_HARDENING && file.includes('0004')));

/**
 * The parts of Supabase that live outside our migrations.
 *
 * Taken from Supabase's own schema so the shim is a reproduction, not an
 * invention. `auth.uid()` reading `request.jwt.claims` is verbatim what
 * Supabase ships; it is the single hook every policy in this project hangs on.
 */
const SUPABASE_SHIM = `
create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key,
  email              text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  aud                text,
  role               text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

/*
 * Supabase's own definition, including the part that is easy to get wrong.
 *
 * Clearing a GUC leaves an empty string, not NULL, so casting straight to json
 * raises "invalid input syntax for type json" for every anonymous request. The
 * nullif(..., '') is what makes the anonymous case return NULL instead of
 * erroring — and an erroring auth.uid() would make policies fail closed for
 * reasons that have nothing to do with the policies.
 */
create or replace function auth.uid() returns uuid
language sql stable as $shim$
  select nullif(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
    ''
  )::uuid;
$shim$;

create or replace function auth.role() returns text
language sql stable as $shim$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    'anon'
  );
$shim$;

-- The three roles PostgREST switches into per request.
do $shim$ begin create role anon nologin noinherit;          exception when duplicate_object then null; end $shim$;
do $shim$ begin create role authenticated nologin noinherit; exception when duplicate_object then null; end $shim$;
do $shim$ begin create role service_role nologin noinherit bypassrls; exception when duplicate_object then null; end $shim$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth   to anon, authenticated, service_role;

-- Supabase's own default: table privileges are granted broadly and RLS, not
-- GRANT, is what actually restricts access. Reproducing that default is the
-- point — testing against a stricter grant setup than production would let a
-- missing policy pass unnoticed.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
`;

/**
 * Grants applied after the migrations.
 *
 * Deliberately NOT a blanket `grant all on all tables`. Supabase gives those
 * privileges through ALTER DEFAULT PRIVILEGES, which applies as each table is
 * created — so a later migration that revokes something keeps its revoke.
 *
 * The first version of this harness re-granted everything at the end, which
 * silently undid 0004's column-level revoke on `profiles`. The escalation test
 * still passed, because the trigger caught it. That is the case for having two
 * independent layers, and it is worth stating plainly: a blanket grant run
 * after the migrations — exactly what most Supabase guides tell you to do —
 * removes the first layer without any visible failure.
 */
const POST_MIGRATION_GRANTS = `
grant select on auth.users to service_role;
grant insert, update, delete on auth.users to service_role;
`;

/**
 * Adjusts a migration for PGlite.
 *
 * Only two things are removed, both unrelated to access control:
 *   - `pgcrypto`, `pg_trgm` and `unaccent` are not bundled in PGlite's
 *     default build. `gen_random_uuid()` is core since PostgreSQL 13, so
 *     dropping pgcrypto costs nothing here;
 *   - the two GIN indexes that use `gin_trgm_ops` therefore cannot be built.
 *
 * They are search accelerators. No policy, grant, trigger or constraint
 * depends on them, so their absence cannot change a single result below. Each
 * removal is reported so nobody has to take that on trust.
 */
function adaptForPGlite(sql, file, notes) {
  let out = sql;

  for (const ext of ['pgcrypto', 'pg_trgm', 'unaccent']) {
    const pattern = new RegExp(`create extension if not exists "${ext}";\\s*`, 'g');
    if (pattern.test(out)) {
      out = out.replace(pattern, '');
      notes.push(`${file}: omitida la extensión ${ext} (no incluida en PGlite)`);
    }
  }

  const trgmIndex = /create index if not exists [\s\S]*?gin_trgm_ops\);\s*/g;
  const matches = out.match(trgmIndex);
  if (matches) {
    out = out.replace(trgmIndex, '');
    notes.push(`${file}: omitidos ${matches.length} índices GIN de trigramas (dependen de pg_trgm)`);
  }

  return out;
}

async function main() {
  const notes = [];
  const db = await PGlite.create();

  const version = (await db.query('select version()')).rows[0].version;

  await db.exec(SUPABASE_SHIM);

  for (const file of MIGRATIONS) {
    const raw = readFileSync(join(ROOT, file), 'utf8');
    const sql = adaptForPGlite(raw, file.split('/').pop(), notes);
    try {
      await db.exec(sql);
    } catch (error) {
      console.error(`\n✗ La migración ${file} ha fallado:\n  ${error.message}\n`);
      process.exit(1);
    }
  }

  await db.exec(POST_MIGRATION_GRANTS);

  // The catalogue needs one published row for the "an anonymous visitor can
  // still read the catalogue" probe to mean anything.
  await db.exec(`
    insert into public.categories (slug, name) values ('imagen', 'Imagen')
    on conflict (slug) do nothing;
    insert into public.tools
      (id, slug, name, category_slug, free_model, free_plan, official_url, scores,
       detected_at, last_verified_at, status)
    values
      ('tool_ollama', 'ollama', 'Ollama', 'imagen', 'free_real',
       '{"summary":"x","verifiedAt":"2026-08-07"}'::jsonb, 'https://ollama.com',
       '{"freeReal":10,"usefulness":9,"ease":8,"transparency":9,"creatorValue":8}'::jsonb,
       current_date, current_date, 'published')
    on conflict (id) do nothing;
  `);

  const suite = readFileSync(join(ROOT, 'supabase/tests/rls_adversarial.sql'), 'utf8');

  /*
   * The suite ends with `raise exception` when anything failed, which aborts
   * the transaction and takes the results table with it. Here we want the
   * table, so the gate is removed and the same check is applied afterwards in
   * JavaScript — same rule, but we get to print the evidence first.
   */
  const runnable = suite
    .replace(/do \$\$\s*declare failures int;[\s\S]*?end \$\$;\s*/m, '')
    .replace(/^rollback;\s*$/m, '');

  try {
    await db.exec(runnable);
  } catch (error) {
    console.error(`\n✗ La suite no ha podido ejecutarse:\n  ${error.message}\n`);
    await db.exec('rollback').catch(() => {});
    process.exit(1);
  }

  await db.exec("select set_config('role', 'none', true);");

  const results = (
    await db.query(
      'select id, severity, outcome, scenario, coalesce(detail, \'\') as detail from rls_results order by seq'
    )
  ).rows;

  const policies = (
    await db.query(`select schemaname, tablename, policyname, cmd, roles::text as roles
                    from pg_policies where schemaname = 'public'
                    order by tablename, policyname`)
  ).rows;

  const grants = (
    await db.query(`select table_name, string_agg(distinct privilege_type, ', ' order by privilege_type) as privileges
                    from information_schema.role_table_grants
                    where grantee = 'autocraw_ingest'
                    group by table_name order by table_name`)
  ).rows;

  /*
   * Column-level grants live in a different view from table-level ones, and
   * omitting them makes the evidence misleading in both directions: it hides
   * that autocraw_ingest can read five columns of `tools`, and it would hide
   * a careless grant on a column it should never see.
   */
  const roleColumnWritable = (
    await db.query(`select count(*)::int as n
                    from information_schema.column_privileges
                    where grantee = 'authenticated'
                      and table_name = 'profiles'
                      and column_name = 'role'
                      and privilege_type = 'UPDATE'`)
  ).rows[0].n > 0;

  const columnGrants = (
    await db.query(`select table_name, column_name, privilege_type
                    from information_schema.column_privileges
                    where grantee in ('autocraw_ingest', 'authenticated')
                    order by grantee, table_name, column_name`)
  ).rows;

  await db.exec('rollback;');
  await db.close();

  const failed = results.filter((r) => r.outcome === 'FALLA');

  const report = {
    engine: version,
    ranAt: new Date().toISOString(),
    notes,
    totals: { total: results.length, passed: results.length - failed.length, failed: failed.length },
    results,
    policies,
    autocrawGrants: grants,
    columnGrants,
    columnDefenceIntact: !roleColumnWritable,
  };

  /*
   * Only `rls-run.json` is rewritten. Files matching `rls-preflight-*.json` are
   * frozen records of a specific run and must survive later ones — an evidence
   * file that the next execution silently replaces is not evidence.
   */
  mkdirSync(join(ROOT, 'docs/evidence'), { recursive: true });
  writeFileSync(
    join(ROOT, 'docs/evidence/rls-run.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );

  if (AS_JSON) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    print(report);
  }

  process.exit(failed.length > 0 ? 1 : 0);
}

function print(report) {
  console.log(`\nMotor:  ${report.engine.split(',')[0]}`);
  console.log(`Fecha:  ${report.ranAt}`);
  if (report.notes.length) {
    console.log('\nAdaptaciones para PGlite (ninguna afecta al control de acceso):');
    for (const note of report.notes) console.log(`  · ${note}`);
  }

  console.log('\n─────────────────────────────────────────────────────────────────────────────');
  console.log('ID        SEV       RESULTADO  ESCENARIO');
  console.log('─────────────────────────────────────────────────────────────────────────────');

  for (const row of report.results) {
    const mark = row.outcome === 'PASA' ? '✓ PASA  ' : '✗ FALLA ';
    console.log(
      `${row.id.padEnd(9)} ${row.severity.padEnd(9)} ${mark}   ${row.scenario.slice(0, 62)}`
    );
    if (row.outcome === 'FALLA') console.log(`${' '.repeat(31)}↳ ${row.detail}`);
  }

  console.log('─────────────────────────────────────────────────────────────────────────────');
  const { passed, failed, total } = report.totals;
  console.log(`\n${passed}/${total} bloqueados · ${failed} bypass`);
  console.log(`Políticas aplicadas: ${report.policies.length}`);
  console.log(`Tablas alcanzables por autocraw_ingest: ${report.autocrawGrants.length}`);
  console.log(
    report.columnDefenceIntact
      ? 'Capa de permisos por columna en profiles: intacta'
      : '⚠ Capa de permisos por columna en profiles: ANULADA (authenticated puede escribir role; sólo queda el disparador)'
  );
  console.log('\nEvidencia completa: docs/evidence/rls-run.json\n');
}

await main();
