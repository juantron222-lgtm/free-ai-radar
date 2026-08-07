#!/usr/bin/env node
/**
 * Refuses to let anything run against the wrong database.
 *
 * Everything downstream of this script is destructive or hostile: migrations
 * applied from clean, and a suite whose entire purpose is attempting privilege
 * escalation. Both are correct against staging and catastrophic against
 * production, and the only thing separating them is a string in an environment
 * variable. So the strings get checked, hard, before anything connects.
 *
 * The check that matters most is **positive identity**: the project reference
 * must equal `SUPABASE_STAGING_REF`. Everything else on this list is a
 * negative check — "not production", "no prod in the name" — and negative
 * checks only catch the mistakes somebody anticipated. Naming the one project
 * that is allowed catches every other project, including the ones nobody
 * thought of.
 *
 * **It never prints a project reference or a full hostname.** Not in facts,
 * not in warnings, not in driver errors. What it prints is a fingerprint or a
 * masked form: enough to confirm you are pointed where you think, useless to
 * anyone reading a log.
 *
 *   node scripts/staging-guard.mjs            check the environment
 *   node scripts/staging-guard.mjs --connect  also verify the database is clean
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

/**
 * Shows the shape of a secret and a short hash, never its content.
 *
 * Two people can compare fingerprints to agree they mean the same string
 * without either of them seeing it.
 */
export function fingerprint(value) {
  if (!value) return '(ausente)';
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return `${value.length} car., huella ${hash.toString(16).padStart(8, '0')}`;
}

/** A project ref, shown as `abcd…yz`. Enough to compare, not enough to use. */
export function maskRef(ref) {
  if (!ref) return '(no reconocida)';
  if (ref.length <= 6) return `${ref.slice(0, 2)}…`;
  return `${ref.slice(0, 4)}…${ref.slice(-2)}`;
}

/** A hostname with only its project label masked. */
export function maskHost(host) {
  const labels = String(host).split('.');
  return labels
    .map((label, index) => (index === 1 && labels.length > 2 ? maskRef(label) : label))
    .join('.');
}

/**
 * Removes anything identifying from a message before it is printed.
 *
 * Added after a real leak: a driver error read `getaddrinfo ENOTFOUND
 * db.<ref>.supabase.co` and went to the console intact, because the previous
 * version only looked for `postgres://` strings and a bare hostname walked
 * past it. A project ref is not a hard secret — it is in every public API URL
 * — but the promise was that this prints no host details, and a promise with
 * an exception in it is not a promise.
 */
export function scrub(message) {
  return String(message instanceof Error ? message.message : message)
    .replace(/postgres(ql)?:\/\/[^\s'"]+/gi, '«cadena de conexión omitida»')
    .replace(
      /\b([a-z0-9]{4})[a-z0-9]{4,}\.(supabase\.(?:co|com|net))/gi,
      (_m, head, tail) => `${head}….${tail}`
    );
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

/** Reads .env files without a dependency. Values are never logged. */
export function loadEnv(root = ROOT) {
  const merged = { ...process.env };
  for (const name of ['.env', '.env.local']) {
    const path = join(root, name);
    if (!existsSync(path)) continue;
    /*
     * Split on CRLF as well as LF.
     *
     * Not a nicety on Windows, where CRLF is the default. A JavaScript `.`
     * does not match \r and `$` without the m flag will not tolerate one, so
     * `KEY=value\r` matches nothing at all. Splitting on '\n' alone made this
     * parser silently ignore every line but the last: it read one variable out
     * of five and reported the other four as absent.
     */
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
 * The project reference, wherever it appears.
 *
 * Supabase writes it three ways: as the subdomain of a direct database host,
 * as the user part on the pooler (`postgres.<ref>`), and as the subdomain of
 * the API URL. All three are read, because the point of this module is to
 * check they agree.
 */
export function refFromDbUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const fromHost = parsed.hostname.match(/^(?:db|aws-[^.]+)\.([a-z0-9]{16,})\.supabase\.(co|com)$/)?.[1];
  const fromUser = parsed.username.match(/^postgres\.([a-z0-9]{16,})$/)?.[1];
  return fromHost ?? fromUser ?? null;
}

export function refFromApiUrl(url) {
  try {
    return new URL(url).hostname.match(/^([a-z0-9]{16,})\.supabase\.(co|com)$/)?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * The connection string, under either name.
 *
 * `SUPABASE_DB_URL_STAGING` is preferred because the name itself carries the
 * environment. `SUPABASE_DATABASE_URL` is accepted because it is what the
 * Supabase dashboard calls it.
 */
export function readDbUrl(env) {
  if (env['SUPABASE_DB_URL_STAGING']) {
    return { url: env['SUPABASE_DB_URL_STAGING'], name: 'SUPABASE_DB_URL_STAGING', explicit: true };
  }
  if (env['SUPABASE_DATABASE_URL']) {
    return { url: env['SUPABASE_DATABASE_URL'], name: 'SUPABASE_DATABASE_URL', explicit: false };
  }
  return { url: null, name: null, explicit: false };
}

// ---------------------------------------------------------------------------
// The five conditions
// ---------------------------------------------------------------------------

/**
 * Evaluates the environment. Pure: no I/O, no network, no process exit.
 *
 * Returning a structure rather than printing means the five scenarios can be
 * tested directly — see `tests/unit/staging-guard.test.ts`. A guard nobody can
 * test is a guard nobody should trust.
 */
export function evaluateEnvironment(env) {
  const facts = [];
  const warnings = [];
  const problems = [];

  const { url, name, explicit } = readDbUrl(env);

  if (!url) {
    problems.push(
      'Falta la cadena de conexión. Define SUPABASE_DB_URL_STAGING (preferida) o SUPABASE_DATABASE_URL en .env.local.'
    );
    return { facts, warnings, problems, url: null };
  }

  facts.push(`Variable:  ${name}`);
  facts.push(`Cadena:    ${fingerprint(url)}`);
  if (!explicit) {
    warnings.push(
      'La cadena viene de SUPABASE_DATABASE_URL, cuyo nombre no dice a qué entorno apunta. La identidad la aporta SUPABASE_STAGING_REF.'
    );
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    problems.push('La cadena de conexión no es una URL válida.');
    return { facts, warnings, problems, url: null };
  }

  if (!/^postgres(ql)?:$/.test(parsed.protocol)) {
    problems.push(`El protocolo debería ser postgresql://, no ${parsed.protocol}`);
  }

  facts.push(`Anfitrión: ${maskHost(parsed.hostname)}`);

  /*
   * A password still in its placeholder form.
   *
   * The dashboard shows the connection string with `[YOUR-PASSWORD]` in it,
   * and it is easy to copy the whole line without substituting. Left alone it
   * surfaces later as `password authentication failed`, which sends you
   * looking at the wrong thing entirely. Catching it here costs one comparison
   * and saves that hunt.
   */
  const password = decodeURIComponent(parsed.password ?? '');
  if (!password) {
    problems.push('La cadena de conexión no lleva contraseña.');
  } else if (/^\[.*\]$/.test(password) || /your[-_]?password|xxxx|contrase.a/i.test(password)) {
    problems.push(
      'La contraseña sigue siendo el marcador de posición del panel de Supabase. Sustitúyela por la real.'
    );
  }

  const dbRef = refFromDbUrl(url);
  const apiRef = refFromApiUrl(env['PUBLIC_SUPABASE_URL'] ?? '');
  const declaredRef = (env['SUPABASE_STAGING_REF'] ?? '').trim();

  facts.push(`Proyecto (base de datos): ${maskRef(dbRef)}`);
  facts.push(`Proyecto (API pública):   ${maskRef(apiRef)}`);
  facts.push(`Proyecto declarado:       ${maskRef(declaredRef)}`);

  // ---- 1. Declared intent -------------------------------------------------
  const declaredEnv = (env['SUPABASE_ENV'] ?? '').toLowerCase();
  if (declaredEnv !== 'staging') {
    problems.push(
      `SUPABASE_ENV debe valer exactamente "staging". Ahora vale ${declaredEnv ? `"${declaredEnv}"` : '(nada)'}.`
    );
  }

  // ---- 2. Positive identity ----------------------------------------------
  if (!declaredRef) {
    problems.push(
      'Falta SUPABASE_STAGING_REF. Es la identidad positiva del único proyecto permitido: sin ella, sólo hay comprobaciones negativas y esas únicamente atrapan lo que alguien previó.'
    );
  } else if (!dbRef) {
    problems.push(
      'No se reconoce la referencia del proyecto en la cadena de conexión, así que no se puede comparar con SUPABASE_STAGING_REF.'
    );
  } else if (dbRef !== declaredRef) {
    problems.push(
      `La base de datos pertenece a un proyecto distinto del declarado: ${maskRef(dbRef)} frente a ${maskRef(declaredRef)}.`
    );
  }

  /*
   * The API URL has to name the same project too.
   *
   * Otherwise the HTTP suite would attack one project while the SQL suite
   * migrated another, and both would report success. That is the mismatch that
   * produces a green run against a database nobody looked at.
   */
  if (declaredRef && apiRef && apiRef !== declaredRef) {
    problems.push(
      `PUBLIC_SUPABASE_URL apunta a un proyecto distinto del declarado: ${maskRef(apiRef)} frente a ${maskRef(declaredRef)}.`
    );
  }

  if (declaredRef && !apiRef && env['PUBLIC_SUPABASE_URL']) {
    warnings.push(
      'No se reconoce la referencia del proyecto en PUBLIC_SUPABASE_URL; no se ha podido comprobar que coincida.'
    );
  }

  // ---- 3. Not production --------------------------------------------------
  const forbidden = (env['SUPABASE_PRODUCTION_REFS'] ?? '')
    .split(',')
    .map((ref) => ref.trim())
    .filter(Boolean);

  for (const ref of [dbRef, apiRef, declaredRef]) {
    if (ref && forbidden.includes(ref)) {
      problems.push('Una de las referencias figura en SUPABASE_PRODUCTION_REFS. Detenido: esto es producción.');
      break;
    }
  }

  if (!forbidden.length) {
    warnings.push(
      'SUPABASE_PRODUCTION_REFS está vacía. Rellénala cuando exista el proyecto de producción.'
    );
  }

  // ---- 4. No production indicators ---------------------------------------
  const indicators = [parsed.hostname, env['PUBLIC_SUPABASE_URL'] ?? '', declaredEnv];
  if (indicators.some((value) => /\bprod(uction)?\b/i.test(value))) {
    problems.push('Aparece "prod" en el anfitrión, en la URL pública o en el entorno declarado.');
  }

  return { facts, warnings, problems, url: problems.length ? null : url };
}

// ---------------------------------------------------------------------------
// Condition 5: the database itself
// ---------------------------------------------------------------------------

/**
 * The strongest check available, and the only one needing a connection.
 *
 * A production database has tables. A base about to receive migrations from
 * clean does not. This catches the case every string comparison misses: a
 * correct-looking reference that happens to point at something with data.
 */
export async function checkDatabaseIsClean(url) {
  const { default: postgres } = await import('postgres');
  const sql = postgres(url, { max: 1, connect_timeout: 30, ssl: 'require', onnotice: () => {} });

  try {
    const [{ count }] = await sql`
      select count(*)::int from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'`;

    if (count > 0) {
      return {
        fact: `Tablas en el esquema public: ${count}`,
        problem: `El esquema public ya contiene ${count} tabla(s). Las migraciones desde cero exigen una base limpia, y una base con contenido puede no ser la que crees.`,
      };
    }
    return { fact: 'Tablas en el esquema public: 0 (limpia)' };
  } catch (error) {
    return { problem: `No se ha podido conectar: ${scrub(error)}` };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
  const withConnection = process.argv.includes('--connect');
  const result = evaluateEnvironment(loadEnv());

  if (withConnection && result.url) {
    const check = await checkDatabaseIsClean(result.url);
    if (check.fact) result.facts.push(check.fact);
    if (check.problem) result.problems.push(check.problem);
  }

  console.log('\nGuardián de staging');
  console.log('───────────────────────────────────────────────');
  for (const fact of result.facts) console.log(`  ${fact}`);

  if (result.warnings.length) {
    console.log('\nAvisos:');
    for (const warning of result.warnings) console.log(`  · ${warning}`);
  }

  if (result.problems.length) {
    console.log('\n✗ DETENIDO:');
    for (const problem of result.problems) console.log(`  · ${problem}`);
    console.log('');
    process.exit(1);
  }

  console.log('\n✓ Las cinco condiciones se cumplen. El destino es staging.\n');
  process.exit(0);
}

// Only run when invoked directly, so the tests can import the pure parts.
if (process.argv[1] && process.argv[1].endsWith('staging-guard.mjs')) {
  await main();
}
