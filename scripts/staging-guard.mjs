#!/usr/bin/env node
/**
 * Refuses to let anything run against the wrong database.
 *
 * Everything downstream of this script is destructive or hostile: migrations
 * applied from clean, and a suite whose entire purpose is attempting privilege
 * escalation. Both are correct against staging and catastrophic against
 * production, and the only thing separating them is a string in an
 * environment variable. So the string gets checked, hard, before anything
 * connects.
 *
 * **It never prints a secret.** Not the password, not the full host, not the
 * connection string. What it prints is a fingerprint: enough to confirm you are
 * pointed where you think, useless to anyone reading a log.
 *
 *   node scripts/staging-guard.mjs            check the environment
 *   node scripts/staging-guard.mjs --connect  also verify the database is clean
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WITH_CONNECTION = process.argv.includes('--connect');

/** Reads .env files without a dependency. Values are never logged. */
function loadEnv() {
  const merged = { ...process.env };
  for (const name of ['.env', '.env.local']) {
    const path = join(ROOT, name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      const value = rawValue.trim().replace(/^["']|["']$/g, '');
      if (value) merged[key] = value;
    }
  }
  return merged;
}

/**
 * A safe way to talk about a secret.
 *
 * Shows the shape and a short hash, never the content. Two people can compare
 * fingerprints to agree they mean the same database without either of them
 * seeing it.
 */
function fingerprint(value) {
  if (!value) return '(ausente)';
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return `${value.length} car., huella ${hash.toString(16).padStart(8, '0')}`;
}

const problems = [];
const warnings = [];
const facts = [];

function fail(message) {
  problems.push(message);
}

async function main() {
  const env = loadEnv();
  const url = env['SUPABASE_DB_URL_STAGING'];

  if (!url) {
    fail(
      'Falta SUPABASE_DB_URL_STAGING. Ponla en .env.local (ya ignorado por git), nunca en el repositorio.'
    );
    return report();
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    fail('SUPABASE_DB_URL_STAGING no es una URL válida.');
    return report();
  }

  if (!/^postgres(ql)?:$/.test(parsed.protocol)) {
    fail(`El protocolo debería ser postgresql://, no ${parsed.protocol}`);
  }

  /*
   * The Supabase project reference is the subdomain: db.<ref>.supabase.co, or
   * the user part on the pooler. It is not a secret on its own — it appears in
   * every public API URL — but only its first characters are shown, because a
   * log is a log.
   */
  const host = parsed.hostname;
  const refFromHost = host.match(/^(?:db|aws-[^.]+)\.([a-z0-9]+)\.supabase\.(co|com)$/)?.[1];
  const refFromUser = parsed.username.match(/^postgres\.([a-z0-9]+)$/)?.[1];
  const projectRef = refFromHost ?? refFromUser ?? null;

  // Mask only the label that identifies the project; the rest of the host is
  // the same for every Supabase project and hiding it helps nobody.
  const labels = host.split('.');
  const maskedHost = labels
    .map((label, index) =>
      index === 1 && labels.length > 2 ? `${label.slice(0, 4)}…${label.slice(-2)}` : label
    )
    .join('.');
  facts.push(`Anfitrión: ${maskedHost}`);
  facts.push(`Proyecto:  ${projectRef ? `${projectRef.slice(0, 4)}…${projectRef.slice(-2)}` : '(no reconocido)'}`);
  facts.push(`Cadena:    ${fingerprint(url)}`);

  if (!projectRef) {
    warnings.push(
      'No se reconoce la referencia del proyecto en la cadena. Comprueba a mano que es la de staging.'
    );
  }

  // The one comparison that actually protects anything: an explicit list of
  // refs that must never be touched.
  const forbidden = (env['SUPABASE_PRODUCTION_REFS'] ?? '')
    .split(',')
    .map((ref) => ref.trim())
    .filter(Boolean);

  if (projectRef && forbidden.includes(projectRef)) {
    fail(
      'La cadena apunta a un proyecto listado en SUPABASE_PRODUCTION_REFS. Detenido: esto es producción.'
    );
  }

  if (!forbidden.length) {
    warnings.push(
      'SUPABASE_PRODUCTION_REFS está vacía. Rellénala con la referencia del proyecto de producción para que esta comprobación sirva de algo.'
    );
  }

  /*
   * A declared intent, separate from the URL.
   *
   * Someone pasting the wrong connection string will not also change this
   * variable, so requiring both means one mistake is not enough.
   */
  const declared = (env['SUPABASE_ENV'] ?? '').toLowerCase();
  if (declared !== 'staging') {
    fail(
      `SUPABASE_ENV debe valer exactamente "staging" para ejecutar nada de esto. Ahora vale ${declared ? `"${declared}"` : '(nada)'}.`
    );
  }

  if (/prod/i.test(host) || /prod/i.test(env['PUBLIC_SUPABASE_URL'] ?? '')) {
    fail('Aparece "prod" en el anfitrión o en PUBLIC_SUPABASE_URL. Detenido por precaución.');
  }

  if (WITH_CONNECTION && !problems.length) {
    await checkDatabaseIsClean(url);
  }

  return report();
}

/**
 * The strongest check available, and the one that needs a connection.
 *
 * A production database has tables. A base about to receive migrations from
 * clean does not. Refusing to proceed when `public` already contains objects
 * catches the case every other check misses: a correct-looking staging URL that
 * happens to point at something with data in it.
 */
async function checkDatabaseIsClean(url) {
  const { default: postgres } = await import('postgres');
  const sql = postgres(url, { max: 1, connect_timeout: 30, ssl: 'require', onnotice: () => {} });

  try {
    const [{ count }] = await sql`
      select count(*)::int from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'`;

    facts.push(`Tablas en el esquema public: ${count}`);

    if (count > 0) {
      fail(
        `El esquema public ya contiene ${count} tabla(s). Las migraciones desde cero exigen una base limpia, y una base con contenido puede no ser la que crees.`
      );
    }
  } catch (error) {
    // A driver error can echo the whole connection string. Never surface it.
    const message = error instanceof Error ? error.message : String(error);
    fail(`No se ha podido conectar: ${message.replace(/postgres(ql)?:\/\/[^\s'"]+/gi, '«omitida»')}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function report() {
  console.log('\nGuardián de staging');
  console.log('───────────────────────────────────────────────');
  for (const fact of facts) console.log(`  ${fact}`);

  if (warnings.length) {
    console.log('\nAvisos:');
    for (const warning of warnings) console.log(`  · ${warning}`);
  }

  if (problems.length) {
    console.log('\n✗ DETENIDO:');
    for (const problem of problems) console.log(`  · ${problem}`);
    console.log('');
    process.exit(1);
  }

  console.log('\n✓ El destino es staging. Puedes continuar.\n');
  process.exit(0);
}

await main();
