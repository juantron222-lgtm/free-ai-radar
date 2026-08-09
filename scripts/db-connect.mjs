#!/usr/bin/env node
/**
 * One definition of how this project connects to Postgres.
 *
 * There were five, and they had drifted: the runner set `connect_timeout`, the
 * HTTP suite, the AutoCraw suite and the credential issuer set nothing. That
 * difference is invisible until it costs you a run — the release-candidate
 * battery sat for nine minutes on a thirty-second step before reporting
 *
 *   ✗ write CONNECTION_CLOSED aws-1-eu-west-1.pooler.supabase.com:5432
 *
 * ## Why there is no `idle_timeout` here
 *
 * Adding one was the obvious fix and it was wrong, which is worth writing down
 * because it looks right.
 *
 * The reasoning was: the HTTP suite opens a connection, then spends minutes
 * talking to GoTrue and PostgREST while the socket sits idle; Supabase's pooler
 * closes idle client connections; so let postgres.js close it first and
 * reconnect on the next query.
 *
 * What that ignores is that **both suites run their probes inside
 * `sql.begin()`**. A transaction holds one connection for its whole life, and
 * there is nothing to transparently reconnect to — a reconnection would lose
 * the transaction, the session role, and every `set local` in it. When
 * `idle_timeout` fires inside that block, postgres.js destroys the connection
 * and the probes fail with `CONNECTION_DESTROYED`.
 *
 * Measured, not argued. AutoCraw, same suite, three values:
 *
 *   idle_timeout = 0     12/12 capacidades · 30/30 ataques bloqueados
 *   idle_timeout = 20    falla
 *   idle_timeout = 120   falla — CONNECTION_DESTROYED en CAP-07 y CAP-08
 *
 * Any non-zero value breaks it. So the setting stays off, which is also
 * postgres.js's default, and what these suites had before.
 *
 * `connect_timeout` is the part that was genuinely missing, and it is the one
 * that matters most: it turns "hangs until somebody notices" into "fails with a
 * reason". A suite that fails is a suite you can read.
 *
 * ## What is still not solved
 *
 * A connection left idle long enough for the pooler to close it can still fail
 * on the next write. The real fix is to open the connection next to the code
 * that uses it rather than at the top of `main()` — see
 * `docs/release-candidate-findings.md`.
 */

import postgres from 'postgres';

/**
 * @param {string} url  connection string; never logged by anything here
 * @param {object} [overrides]  merged last, for the rare caller that needs more
 */
export function connect(url, overrides = {}) {
  if (!url) {
    throw new Error('No hay cadena de conexión, y el guardián debería haberlo impedido.');
  }

  return postgres(url, {
    // One connection: these are sequential scripts, and a pool would make the
    // "which session holds this lock" question harder than it needs to be.
    max: 1,

    // A pooler that never answers should fail, not hang.
    connect_timeout: 30,

    // Supabase terminates TLS with its own chain; the pooler needs this.
    ssl: 'require',

    onnotice: () => {},

    ...overrides,
  });
}
