#!/usr/bin/env node
/**
 * Issues AutoCraw's database credential against staging.
 *
 * Until now `autocraw_ingest` has been NOLOGIN: the shape of the access
 * existed, the access did not. This turns it on for staging only, and it is
 * the first time anything in this project has created a credential.
 *
 * Three rules it follows:
 *
 *   1. **The password is generated here and never printed.** It goes straight
 *      into `.env.local`, which git ignores. What reaches the console is a
 *      fingerprint — enough to confirm the write happened, useless to read.
 *   2. **It only ever runs against staging.** The guard decides that, as a
 *      separate process, before this connects to anything.
 *   3. **It grants nothing.** The privileges are whatever migration 0003 gave
 *      the role. This adds LOGIN and a password and stops. If the role turns
 *      out to need more, that is a migration someone reviews, not a side
 *      effect of issuing a credential.
 *
 *   node scripts/autocraw-credential.mjs           issue or rotate
 *   node scripts/autocraw-credential.mjs --revoke  take the login away again
 */

import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from './db-connect.mjs';
import { fingerprint, loadEnv, readDbUrl, scrub } from './staging-guard.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REVOKE = process.argv.includes('--revoke');
const ENV_FILE = join(ROOT, '.env.local');
const VAR = 'AUTOCRAW_DB_URL_STAGING';

/**
 * Waits until the new password actually opens a connection.
 *
 * `alter role ... password` returns as soon as Postgres has stored it, and for
 * a few seconds after that the pooler still rejects the new credential:
 * Supavisor authenticates against its own cached copy, and the cache has not
 * caught up. Measured on staging — rejected at 7.6s, accepted at 12.4s.
 *
 * Reporting success at the moment the ALTER returned made this script lie in a
 * way that surfaced far from here: the release-candidate battery issued the
 * credential, ran four other steps, and then the AutoCraw suite failed with
 * `password authentication failed`. Nothing in that message points at a cache
 * that had not refreshed.
 *
 * So the step no longer claims to have issued a credential until the credential
 * works. A failure to authenticate within the window is reported rather than
 * swallowed — the caller decides, but it decides knowing.
 */
async function waitUntilUsable(url, { attempts = 20, gapMs = 3000 } = {}) {
  const started = Date.now();
  const elapsed = () => Number(((Date.now() - started) / 1000).toFixed(1));

  for (let i = 0; i < attempts; i += 1) {
    const probe = connect(url);
    try {
      await probe`select 1`;
      await probe.end({ timeout: 5 });
      return { ok: true, seconds: elapsed() };
    } catch (error) {
      await probe.end({ timeout: 5 }).catch(() => {});
      // Anything that is not the cache lagging is a real failure: report it now
      // rather than spending a minute rediscovering it.
      if (!/password authentication failed/i.test(String(error?.message ?? ''))) {
        return { ok: false, seconds: elapsed(), reason: scrub(error) };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, gapMs));
  }

  return { ok: false, seconds: elapsed(), reason: 'el pooler sigue rechazando la contraseña' };
}

function enforceGuard() {
  try {
    console.log(
      execFileSync('node', [join(ROOT, 'scripts/staging-guard.mjs')], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim()
    );
  } catch (error) {
    console.error(error.stdout ?? '');
    console.error('\nEl guardián ha detenido la ejecución. No se ha emitido ninguna credencial.\n');
    process.exit(1);
  }
}

/**
 * Writes the connection string into `.env.local`, replacing any previous one.
 *
 * Appending would leave the old credential in the file, and a rotation that
 * leaves the thing it rotated behind has not rotated anything.
 */
function persist(url) {
  const line = `${VAR}=${url}`;
  let contents = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : '';

  const pattern = new RegExp(`^${VAR}=.*$`, 'm');
  contents = pattern.test(contents)
    ? contents.replace(pattern, line)
    : `${contents.replace(/\s*$/, '')}\n${line}\n`;

  writeFileSync(ENV_FILE, contents, 'utf8');
}

async function main() {
  enforceGuard();

  const env = loadEnv();
  const { url: adminUrl } = readDbUrl(env);
  const sql = connect(adminUrl);

  try {
    if (REVOKE) {
      await sql.unsafe('alter role autocraw_ingest nologin');
      console.log('\nCredencial retirada: el rol vuelve a NOLOGIN.');
      console.log('Recuerda borrar AUTOCRAW_DB_URL_STAGING de .env.local.\n');
      return;
    }

    // 32 bytes of entropy. No dictionary, no pattern, nobody types this.
    const password = randomBytes(32).toString('base64url');

    // Passed as a parameter into a DO block: the password never becomes part
    // of a SQL string this process built, so it cannot reach a query log or an
    // error message, and quoting stays Postgres's problem rather than ours.
    /*
     * A one-argument function so the password travels as a typed parameter.
     *
     * A DO block cannot take arguments, so `${password}` inside one has no
     * inferable type and Postgres refuses it. A temporary SECURITY INVOKER
     * function does take one, and it is dropped immediately: the password is
     * never part of a SQL string this process assembled, so it cannot surface
     * in a query log or an error.
     */
    await sql.unsafe(`
      create or replace function pg_temp.set_autocraw_password(p text)
      returns void language plpgsql as $fn$
      begin
        execute format('alter role autocraw_ingest login password %L', p);
      end $fn$`);

    await sql`select pg_temp.set_autocraw_password(${password})`;

    const admin = new URL(adminUrl);
    /*
     * Supavisor identifies the tenant in the username: <role>.<project_ref>.
     * The direct host is IPv6-only, so the pooler is the only route from here,
     * and that is the form it needs.
     */
    const ref = admin.username.includes('.')
      ? admin.username.split('.').slice(1).join('.')
      : admin.hostname.split('.')[1];

    const autocrawUrl =
      `postgresql://autocraw_ingest.${ref}:${encodeURIComponent(password)}` +
      `@${admin.hostname}:${admin.port || 5432}${admin.pathname}`;

    persist(autocrawUrl);

    const [{ canlogin }] = await sql`
      select rolcanlogin as canlogin from pg_roles where rolname = 'autocraw_ingest'`;

    const propagation = await waitUntilUsable(autocrawUrl);

    console.log('\nCredencial de AutoCraw emitida');
    console.log('───────────────────────────────────────────────');
    console.log(`  Rol:        autocraw_ingest`);
    console.log(`  LOGIN:      ${canlogin ? 'activado' : 'NO ACTIVADO'}`);
    console.log(`  Contraseña: ${fingerprint(password)}`);
    console.log(`  Guardada en .env.local como ${VAR} (ignorado por git)`);
    console.log(
      `  Comprobada: ${propagation.ok ? `autentica (${propagation.seconds}s)` : `NO AUTENTICA tras ${propagation.seconds}s`}`
    );
    console.log('\n  No se ha concedido ningún permiso: son los de la migración 0003.\n');

    // A credential that does not open a connection is not an issued credential,
    // and a caller that chains steps has to be able to tell the difference.
    if (!propagation.ok) {
      console.error(`✗ La credencial no autentica: ${propagation.reason}\n`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`\n✗ ${scrub(error)}\n`);
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

await main();
