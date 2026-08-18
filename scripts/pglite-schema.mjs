#!/usr/bin/env node
/**
 * A real PostgreSQL with this project's schema on it, in memory.
 *
 * PGlite is PostgreSQL 18 compiled to WebAssembly — the actual engine, not a
 * simulation. Row level security, roles, policies, grants, triggers, foreign
 * keys and transactions all behave exactly as they do on a server, which is
 * what makes anything measured against it worth reporting.
 *
 * What it is NOT: Supabase. GoTrue does not exist, so `auth.users` and
 * `auth.uid()` are recreated below from Supabase's own published definitions,
 * and `service_role` is an ordinary role rather than one carrying a signed JWT.
 *
 * This file exists because two callers needed the same schema — the adversarial
 * RLS harness and the catalogue sync tests — and a second copy of "how do you
 * build this database" is a second copy that drifts. The RLS harness already
 * learned that lesson once with environment loading.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Every migration, in order. Callers may ask for a prefix of this. */
export const ALL_MIGRATIONS = [
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
];

/**
 * The parts of Supabase that live outside our migrations.
 *
 * Taken from Supabase's own schema so the shim is a reproduction, not an
 * invention. `auth.uid()` reading `request.jwt.claims` is verbatim what
 * Supabase ships; it is the single hook every policy in this project hangs on.
 */
export const SUPABASE_SHIM = `
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
 * The first version of the RLS harness re-granted everything at the end, which
 * silently undid 0004's column-level revoke on `profiles`. The escalation test
 * still passed, because the trigger caught it. That is the case for having two
 * independent layers, and it is worth stating plainly: a blanket grant run
 * after the migrations — exactly what most Supabase guides tell you to do —
 * removes the first layer without any visible failure.
 */
export const POST_MIGRATION_GRANTS = `
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
 * depends on them, so their absence cannot change a single result. Each
 * removal is reported so nobody has to take that on trust.
 */
export function adaptForPGlite(sql, file, notes) {
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

/**
 * Builds the database and hands it back with the notes describing what had to
 * be adapted. The caller decides what to do with them; they are never
 * swallowed, because "it passed" means less when you cannot see what ran.
 */
export async function createSchema({ migrations = ALL_MIGRATIONS } = {}) {
  const notes = [];
  const db = await PGlite.create();

  await db.exec(SUPABASE_SHIM);

  for (const file of migrations) {
    const raw = readFileSync(join(ROOT, file), 'utf8');
    try {
      await db.exec(adaptForPGlite(raw, file.split('/').pop(), notes));
    } catch (error) {
      throw new Error(`La migración ${file} ha fallado: ${error.message}`);
    }
  }

  await db.exec(POST_MIGRATION_GRANTS);

  return { db, notes };
}
