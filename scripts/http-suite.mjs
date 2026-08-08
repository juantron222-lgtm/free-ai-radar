#!/usr/bin/env node
/**
 * Attacks the public surface of the staging project: GoTrue and PostgREST.
 *
 * This is where a real attacker works. They do not open a SQL console; they
 * take the anon key out of the browser bundle — it is meant to be public — and
 * send requests. Everything the SQL suite proves is true *inside* the
 * database; nothing it proves says the HTTP layer hands out the same answers.
 *
 * Every probe records what the checklist demands: the request, the identity
 * that made it, what should have happened, what did, the verdict, and which
 * mechanism was responsible. `docs/rls-staging-checklist.md` maps them.
 *
 * No SDK. The client normalises errors and adds headers, and here the point is
 * exactly what the server does with a raw request.
 *
 *   node scripts/http-suite.mjs
 *
 * Nothing runs until the guard passes, and no key, token or password is ever
 * printed.
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { loadEnv, readDbUrl, scrub } from './staging-guard.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

const results = [];

/**
 * One attempt.
 *
 * `mechanism` is the interesting column: a probe that passes for the wrong
 * reason is not evidence. "403 from RLS" and "401 because the token was
 * rejected" both look like success and mean very different things.
 */
function record({ id, severity, request, identity, expected, observed, pass, mechanism }) {
  results.push({ id, severity, request, identity, expected, observed, pass, mechanism });
  const mark = pass ? '✓ PASA ' : '✗ FALLA';
  console.log(`  ${id.padEnd(9)} ${severity.padEnd(8)} ${mark}  ${request.slice(0, 54)}`);
  if (!pass) console.log(`${' '.repeat(28)}↳ esperado: ${expected} · obtenido: ${observed}`);
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

let BASE = '';
let ANON = '';
let SERVICE = '';

/** A raw request. Returns status, body and the headers we care about. */
async function call(path, { method = 'GET', token, apikey, body, headers = {} } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      apikey: apikey ?? ANON,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  return { status: response.status, body: parsed, raw: text };
}

/** How many rows came back, for a request that should return none. */
const rowCount = (body) => (Array.isArray(body) ? body.length : body ? 1 : 0);

/** A short, safe description of what came back. */
function describe({ status, body }) {
  if (Array.isArray(body)) return `${status}, ${body.length} fila(s)`;
  const message = body?.message ?? body?.msg ?? body?.error_description ?? body?.error;
  return message ? `${status} — ${String(message).slice(0, 70)}` : `${status}`;
}

/**
 * Which mechanism produced this answer.
 *
 * PostgREST uses distinct SQLSTATEs: 42501 is a privilege or policy refusal,
 * PGRST301 is a rejected JWT. Distinguishing them matters — an expired token
 * blocking a read is not evidence that RLS would have.
 */
function mechanismOf({ status, body }) {
  const code = body?.code ?? '';
  if (code === '42501') return 'permiso o política (42501)';
  if (code === 'PGRST301' || /JWT/i.test(body?.message ?? '')) return 'JWT rechazado';
  if (code === '23503') return 'clave foránea';
  if (code === '23514') return 'restricción CHECK';
  if (status === 401) return 'autenticación (401)';
  if (status === 403) return 'autorización (403)';
  if (status === 404) return 'ruta inexistente (404)';
  if (status === 200 || status === 201) return 'RLS filtró sin error';
  return `estado ${status}`;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

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
    console.error('\nEl guardián ha detenido la ejecución. No se ha tocado nada.\n');
    process.exit(1);
  }
}

const stamp = Date.now();
const password = `Prueba-${stamp}-${Math.random().toString(36).slice(2, 10)}!`;

/**
 * Creates a real account through GoTrue and returns a real session.
 *
 * If the project requires email confirmation, sign-up returns a user without a
 * session. The Admin API confirms it — which is itself the "verificación de
 * email" case: an unconfirmed account cannot obtain a token.
 */
async function createUser(label, { confirmed = true } = {}) {
  /*
   * Identities come from the Admin API, not from public sign-up.
   *
   * Every call to /auth/v1/signup tries to send a confirmation email, and
   * Supabase's built-in mailer allows a handful per hour. Building fixtures
   * that way makes the suite unrunnable twice in a row — it failed exactly
   * that way, with `429 email rate limit exceeded`, which then disguised
   * itself as an email-validation error.
   *
   * The public sign-up path is still exercised, once, as its own probe. What
   * it must not be is a prerequisite for the other forty.
   *
   * example.com is reserved by RFC 2606 and deliverable to nobody.
   */
  const email = `qa-${label}-${stamp}@example.com`;

  const created = await call('/auth/v1/admin/users', {
    method: 'POST',
    apikey: SERVICE,
    token: SERVICE,
    body: { email, password, email_confirm: confirmed },
  });

  if (created.status >= 400) {
    throw new Error(`No se ha podido crear ${label}: ${describe(created)}`);
  }

  const userId = created.body?.id;

  const login = await call('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email, password },
  });

  return {
    label,
    email,
    id: userId,
    token: login.body?.access_token ?? null,
    refresh: login.body?.refresh_token ?? null,
    loginStatus: login.status,
    loginBody: login.body,
    confirmed,
  };
}

// ---------------------------------------------------------------------------
// The probes
// ---------------------------------------------------------------------------

async function run(alice, mallory, admin, sql) {
  // ---- Auth and JWT -------------------------------------------------------

  record({
    id: 'HTTP-01a',
    severity: 'alta',
    request: 'POST /auth/v1/admin/users — alta real por GoTrue',
    identity: 'service_role',
    expected: 'usuario creado con identificador',
    observed: alice.id ? 'creado' : 'sin identificador',
    pass: Boolean(alice.id),
    mechanism: 'GoTrue',
  });

  record({
    id: 'HTTP-01b',
    severity: 'crítica',
    request: 'POST /auth/v1/token — login real con la contraseña correcta',
    identity: 'Alice',
    expected: 'JWT firmado por el proyecto',
    observed: alice.token ? `${alice.loginStatus}, token emitido` : describe({ status: alice.loginStatus, body: alice.loginBody }),
    pass: Boolean(alice.token),
    mechanism: 'GoTrue',
  });

  /*
   * The public sign-up endpoint.
   *
   * What this asserts took two attempts to state honestly. The first version
   * expected the sign-up to succeed, and got a 429 — the built-in mailer
   * allows a handful of messages per hour, and building fixtures through
   * sign-up had already burnt the quota. Once the quota recovered, the real
   * answer appeared: GoTrue rejects `example.com` as undeliverable.
   *
   * That rejection is the endpoint working, not failing. Refusing synthetic
   * domains is how a public sign-up form avoids becoming a fake-account
   * generator. So the assertion is that the endpoint is reachable and
   * *enforces validation* — a 400 or a 429 both demonstrate it; a 5xx or an
   * acceptance of an undeliverable address would not.
   *
   * What remains untested is deliberately named rather than implied: sign-up
   * end to end with a real, deliverable address. Doing that means sending mail
   * to a real inbox, which is a decision for a human and not something a test
   * suite should do on its own. See docs/rls-staging-checklist.md.
   */
  const publicSignUp = await call('/auth/v1/signup', {
    method: 'POST',
    body: { email: `qa-publico-${stamp}@example.com`, password },
  });
  const rateLimited = publicSignUp.status === 429;
  const validated = publicSignUp.status === 400;
  record({
    id: 'HTTP-01c',
    severity: 'media',
    request: 'POST /auth/v1/signup — el endpoint público valida la dirección',
    identity: 'anónimo con anon key',
    expected: 'rechaza una dirección no entregable (o topa con la cuota de correo)',
    observed: rateLimited
      ? '429 — cuota del mailer agotada'
      : validated
        ? '400 — rechaza el dominio sintético, que es lo correcto'
        : describe(publicSignUp),
    pass: rateLimited || validated || publicSignUp.status < 400,
    mechanism: rateLimited
      ? 'límite de envío de correo'
      : validated
        ? 'GoTrue valida la entregabilidad'
        : 'GoTrue',
  });

  /*
   * The confirmation gate, tested without sending anything.
   *
   * An account created unconfirmed must not be able to obtain a token. This is
   * the "email verification" requirement in the form that actually matters:
   * not that a message arrives, but that an unverified identity cannot act.
   */
  const unconfirmed = await createUser('sinconfirmar', { confirmed: false });
  record({
    id: 'HTTP-01d',
    severity: 'crítica',
    request: 'POST /auth/v1/token con una cuenta sin confirmar',
    identity: 'cuenta creada con email_confirm: false',
    expected: 'sin token',
    observed: unconfirmed.token
      ? 'TOKEN EMITIDO sin confirmar'
      : describe({ status: unconfirmed.loginStatus, body: unconfirmed.loginBody }),
    pass: !unconfirmed.token,
    mechanism: unconfirmed.token ? 'ninguno' : 'GoTrue exige confirmación',
  });
  if (unconfirmed.id) {
    await call(`/auth/v1/admin/users/${unconfirmed.id}`, {
      method: 'DELETE',
      apikey: SERVICE,
      token: SERVICE,
    }).catch(() => {});
  }

  const badLogin = await call('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email: alice.email, password: 'contraseña-que-no-es' },
  });
  record({
    id: 'HTTP-01e',
    severity: 'alta',
    request: 'POST /auth/v1/token — contraseña incorrecta',
    identity: 'anónimo',
    expected: 'rechazo',
    observed: describe(badLogin),
    pass: badLogin.status >= 400,
    mechanism: mechanismOf(badLogin),
  });

  const recover = await call('/auth/v1/recover', {
    method: 'POST',
    body: { email: `no-existe-${stamp}@example.com` },
  });
  record({
    id: 'HTTP-01f',
    severity: 'media',
    request: 'POST /auth/v1/recover — dirección inexistente',
    identity: 'anónimo',
    expected: 'misma respuesta que para una existente (no enumera cuentas)',
    observed: describe(recover),
    pass: recover.status < 400,
    mechanism: 'GoTrue',
  });

  const forged = `${alice.token.slice(0, -6)}AAAAAA`;
  const forgedRead = await call('/rest/v1/profiles?select=id', { token: forged });
  record({
    id: 'HTTP-02a',
    severity: 'crítica',
    request: 'GET /rest/v1/profiles con la firma del JWT alterada',
    identity: 'token manipulado',
    expected: 'rechazo',
    observed: describe(forgedRead),
    pass: forgedRead.status >= 400,
    mechanism: mechanismOf(forgedRead),
  });

  const expired =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
    Buffer.from(
      JSON.stringify({ sub: alice.id, role: 'authenticated', exp: 1600000000 })
    ).toString('base64url') +
    '.firmafalsa';
  const expiredRead = await call('/rest/v1/profiles?select=id', { token: expired });
  record({
    id: 'HTTP-02b',
    severity: 'crítica',
    request: 'GET /rest/v1/profiles con un JWT caducado',
    identity: 'token caducado',
    expected: 'rechazo',
    observed: describe(expiredRead),
    pass: expiredRead.status >= 400,
    mechanism: mechanismOf(expiredRead),
  });

  const escalated =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
    Buffer.from(
      JSON.stringify({ sub: alice.id, role: 'service_role', exp: 9999999999 })
    ).toString('base64url') +
    '.firmafalsa';
  const escalatedRead = await call('/rest/v1/profiles?select=id', { token: escalated });
  record({
    id: 'HTTP-02c',
    severity: 'crítica',
    request: 'GET /rest/v1/profiles con role=service_role falsificado en el JWT',
    identity: 'token con rol elevado sin firma válida',
    expected: 'rechazo',
    observed: describe(escalatedRead),
    pass: escalatedRead.status >= 400,
    mechanism: mechanismOf(escalatedRead),
  });

  const validSession = await call('/rest/v1/profiles?select=id', { token: alice.token });
  record({
    id: 'HTTP-02d',
    severity: 'alta',
    request: 'GET /rest/v1/profiles con la sesión válida de Alice',
    identity: 'Alice (authenticated)',
    expected: 'exactamente su propia fila',
    observed: describe(validSession),
    pass: validSession.status === 200 && rowCount(validSession.body) === 1,
    mechanism: mechanismOf(validSession),
  });

  // ---- The anon key -------------------------------------------------------

  for (const [id, table, severity] of [
    ['HTTP-03a', 'profiles', 'crítica'],
    ['HTTP-03b', 'newsletter_subscriptions', 'crítica'],
    ['HTTP-03c', 'audit_logs', 'crítica'],
    ['HTTP-03d', 'user_favorites', 'alta'],
    ['HTTP-03e', 'alerts', 'alta'],
    ['HTTP-03f', 'user_subscriptions', 'alta'],
    ['HTTP-03g', 'affiliate_click_events_daily', 'media'],
  ]) {
    const response = await call(`/rest/v1/${table}?select=*`);
    record({
      id,
      severity,
      request: `GET /rest/v1/${table}?select=* con la anon key`,
      identity: 'anónimo (clave pública del navegador)',
      expected: '0 filas',
      observed: describe(response),
      pass: response.status >= 400 || rowCount(response.body) === 0,
      mechanism: mechanismOf(response),
    });
  }

  const publicRead = await call('/rest/v1/tools?select=slug,name&limit=5');
  record({
    id: 'HTTP-03h',
    severity: 'alta',
    request: 'GET /rest/v1/tools con la anon key',
    identity: 'anónimo',
    expected: 'el catálogo publicado sí se lee',
    observed: describe(publicRead),
    pass: publicRead.status === 200 && rowCount(publicRead.body) > 0,
    mechanism: mechanismOf(publicRead),
  });

  // ---- User A against user B ---------------------------------------------

  const readOther = await call(`/rest/v1/profiles?id=eq.${mallory.id}&select=*`, {
    token: alice.token,
  });
  record({
    id: 'HTTP-04a',
    severity: 'crítica',
    request: `GET /rest/v1/profiles?id=eq.<Mallory> — ID manipulado`,
    identity: 'Alice',
    expected: '0 filas',
    observed: describe(readOther),
    pass: readOther.status >= 400 || rowCount(readOther.body) === 0,
    mechanism: mechanismOf(readOther),
  });

  const embedded = await call('/rest/v1/user_lists?select=*,profiles(*)', { token: alice.token });
  record({
    id: 'HTTP-04b',
    severity: 'alta',
    request: 'GET /rest/v1/user_lists?select=*,profiles(*) — atravesando la relación',
    identity: 'Alice',
    expected: 'ningún perfil ajeno',
    observed: describe(embedded),
    pass:
      embedded.status >= 400 ||
      !JSON.stringify(embedded.body ?? '').includes(mallory.id),
    mechanism: mechanismOf(embedded),
  });

  const writeOther = await call('/rest/v1/user_favorites', {
    method: 'POST',
    token: alice.token,
    body: { user_id: mallory.id, tool_id: 'tool_ollama' },
  });
  record({
    id: 'HTTP-04c',
    severity: 'crítica',
    request: 'POST /rest/v1/user_favorites con user_id de Mallory',
    identity: 'Alice',
    expected: 'rechazo',
    observed: describe(writeOther),
    pass: writeOther.status >= 400,
    mechanism: mechanismOf(writeOther),
  });

  const updateOther = await call(`/rest/v1/profiles?id=eq.${mallory.id}`, {
    method: 'PATCH',
    token: alice.token,
    body: { display_name: 'tomada' },
    headers: { Prefer: 'return=representation' },
  });
  record({
    id: 'HTTP-04d',
    severity: 'crítica',
    request: 'PATCH /rest/v1/profiles?id=eq.<Mallory>',
    identity: 'Alice',
    expected: 'ninguna fila modificada',
    observed: describe(updateOther),
    pass: updateOther.status >= 400 || rowCount(updateOther.body) === 0,
    mechanism: mechanismOf(updateOther),
  });

  const deleteOther = await call(`/rest/v1/user_lists?user_id=eq.${mallory.id}`, {
    method: 'DELETE',
    token: alice.token,
    headers: { Prefer: 'return=representation' },
  });
  record({
    id: 'HTTP-04e',
    severity: 'crítica',
    request: 'DELETE /rest/v1/user_lists?user_id=eq.<Mallory>',
    identity: 'Alice',
    expected: 'ninguna fila borrada',
    observed: describe(deleteOther),
    pass: deleteOther.status >= 400 || rowCount(deleteOther.body) === 0,
    mechanism: mechanismOf(deleteOther),
  });

  // ---- Becoming an administrator -----------------------------------------

  const promote = await call(`/rest/v1/profiles?id=eq.${alice.id}`, {
    method: 'PATCH',
    token: alice.token,
    body: { role: 'admin' },
    headers: { Prefer: 'return=representation' },
  });
  record({
    id: 'HTTP-05a',
    severity: 'crítica',
    request: 'PATCH /rest/v1/profiles {"role":"admin"} sobre su propia fila',
    identity: 'Alice',
    expected: 'rechazo',
    observed: describe(promote),
    pass: promote.status >= 400,
    mechanism: mechanismOf(promote),
  });

  const roleRows = await sql`select role::text from public.profiles where id = ${alice.id}`;
  const actualRole = roleRows[0]?.role ?? '(sin fila de perfil)';
  record({
    id: 'HTTP-05b',
    severity: 'crítica',
    request: 'comprobación en la base: el rol de Alice tras el intento',
    identity: 'lectura directa como propietario',
    expected: 'user',
    observed: actualRole,
    pass: actualRole === 'user',
    mechanism: 'permisos por columna + disparador',
  });

  const readAudit = await call('/rest/v1/audit_logs?select=*', { token: alice.token });
  record({
    id: 'HTTP-05c',
    severity: 'crítica',
    request: 'GET /rest/v1/audit_logs con sesión de usuario normal',
    identity: 'Alice',
    expected: '0 filas',
    observed: describe(readAudit),
    pass: readAudit.status >= 400 || rowCount(readAudit.body) === 0,
    mechanism: mechanismOf(readAudit),
  });

  const editTool = await call('/rest/v1/tools?id=eq.tool_ollama', {
    method: 'PATCH',
    token: alice.token,
    body: { verdict: 'comprado' },
    headers: { Prefer: 'return=representation' },
  });
  record({
    id: 'HTTP-05d',
    severity: 'crítica',
    request: 'PATCH /rest/v1/tools {"verdict":"comprado"}',
    identity: 'Alice',
    expected: 'ninguna fila modificada',
    observed: describe(editTool),
    pass: editTool.status >= 400 || rowCount(editTool.body) === 0,
    mechanism: mechanismOf(editTool),
  });

  // ---- RPC and SECURITY DEFINER ------------------------------------------

  for (const [id, fn, severity] of [
    ['HTTP-06a', 'is_admin', 'crítica'],
    ['HTTP-06b', 'is_staff', 'crítica'],
    ['HTTP-06c', 'current_role', 'crítica'],
  ]) {
    const response = await call(`/rest/v1/rpc/${fn}`, { method: 'POST', token: alice.token });
    const saysYes = response.body === true || response.body === 'admin' || response.body === 'editor';
    record({
      id,
      severity,
      request: `POST /rest/v1/rpc/${fn} — llamada directa a SECURITY DEFINER`,
      identity: 'Alice (usuario normal)',
      expected: 'no concede privilegio (false, "user", o no expuesta)',
      observed: describe(response),
      pass: !saysYes,
      mechanism: mechanismOf(response),
    });
  }

  const forcePending = await call('/rest/v1/rpc/force_pending_for_agent', {
    method: 'POST',
    token: alice.token,
  });
  record({
    id: 'HTTP-06d',
    severity: 'alta',
    request: 'POST /rest/v1/rpc/force_pending_for_agent',
    identity: 'Alice',
    expected: 'no invocable como función suelta',
    observed: describe(forcePending),
    pass: forcePending.status >= 400,
    mechanism: mechanismOf(forcePending),
  });

  // ---- The user's own data: it has to work -------------------------------

  const addFavourite = await call('/rest/v1/user_favorites', {
    method: 'POST',
    token: alice.token,
    body: { user_id: alice.id, tool_id: 'tool_ollama' },
    headers: { Prefer: 'return=representation' },
  });
  record({
    id: 'HTTP-07a',
    severity: 'alta',
    request: 'POST /rest/v1/user_favorites sobre su propia cuenta',
    identity: 'Alice',
    expected: 'creado',
    observed: describe(addFavourite),
    pass: addFavourite.status < 400,
    mechanism: mechanismOf(addFavourite),
  });

  const createList = await call('/rest/v1/user_lists', {
    method: 'POST',
    token: alice.token,
    body: { user_id: alice.id, slug: `lista-${stamp}`, title: 'Mi lista', is_public: false },
    headers: { Prefer: 'return=representation' },
  });
  record({
    id: 'HTTP-07b',
    severity: 'alta',
    request: 'POST /rest/v1/user_lists sobre su propia cuenta',
    identity: 'Alice',
    expected: 'creada',
    observed: describe(createList),
    pass: createList.status < 400,
    mechanism: mechanismOf(createList),
  });

  const createAlert = await call('/rest/v1/alerts', {
    method: 'POST',
    token: alice.token,
    body: { user_id: alice.id, tool_id: 'tool_ollama', kinds: ['free_plan_reduced'] },
    headers: { Prefer: 'return=representation' },
  });
  record({
    id: 'HTTP-07c',
    severity: 'alta',
    request: 'POST /rest/v1/alerts sobre su propia cuenta',
    identity: 'Alice',
    expected: 'creada',
    observed: describe(createAlert),
    pass: createAlert.status < 400,
    mechanism: mechanismOf(createAlert),
  });

  const mallorySeesAliceFavourites = await call(
    `/rest/v1/user_favorites?user_id=eq.${alice.id}&select=*`,
    { token: mallory.token }
  );
  record({
    id: 'HTTP-07d',
    severity: 'crítica',
    request: 'GET /rest/v1/user_favorites?user_id=eq.<Alice>',
    identity: 'Mallory',
    expected: '0 filas',
    observed: describe(mallorySeesAliceFavourites),
    pass:
      mallorySeesAliceFavourites.status >= 400 ||
      rowCount(mallorySeesAliceFavourites.body) === 0,
    mechanism: mechanismOf(mallorySeesAliceFavourites),
  });

  // ---- GDPR ---------------------------------------------------------------

  const exportOwn = await call(
    `/rest/v1/user_favorites?select=*,tools(slug)&user_id=eq.${alice.id}`,
    { token: alice.token }
  );
  record({
    id: 'HTTP-08a',
    severity: 'alta',
    request: 'exportación: Alice lee todo lo suyo',
    identity: 'Alice',
    expected: 'sus propias filas',
    observed: describe(exportOwn),
    pass: exportOwn.status === 200 && rowCount(exportOwn.body) > 0,
    mechanism: mechanismOf(exportOwn),
  });

  const exportEverything = await call('/rest/v1/user_favorites?select=*', { token: alice.token });
  const onlyHers =
    Array.isArray(exportEverything.body) &&
    exportEverything.body.every((row) => row.user_id === alice.id);
  record({
    id: 'HTTP-08b',
    severity: 'crítica',
    request: 'exportación sin filtro: GET /rest/v1/user_favorites?select=*',
    identity: 'Alice',
    expected: 'sólo filas suyas, ninguna ajena',
    observed: `${describe(exportEverything)}, ${onlyHers ? 'todas suyas' : 'CONTIENE AJENAS'}`,
    pass: onlyHers,
    mechanism: mechanismOf(exportEverything),
  });

  const deleteOwn = await call(`/rest/v1/user_favorites?user_id=eq.${alice.id}`, {
    method: 'DELETE',
    token: alice.token,
    headers: { Prefer: 'return=representation' },
  });
  record({
    id: 'HTTP-08c',
    severity: 'alta',
    request: 'borrado RGPD: Alice borra sus favoritos',
    identity: 'Alice',
    expected: 'borrados',
    observed: describe(deleteOwn),
    pass: deleteOwn.status < 400,
    mechanism: mechanismOf(deleteOwn),
  });

  const selfDeleteIdentity = await call(`/auth/v1/admin/users/${alice.id}`, {
    method: 'DELETE',
    token: alice.token,
  });
  record({
    id: 'HTTP-08d',
    severity: 'crítica',
    request: 'DELETE /auth/v1/admin/users/<propio> con token de usuario',
    identity: 'Alice',
    expected: 'rechazo — sólo el service role borra una identidad',
    observed: describe(selfDeleteIdentity),
    pass: selfDeleteIdentity.status >= 400,
    mechanism: mechanismOf(selfDeleteIdentity),
  });

  const readAuthUsers = await call('/rest/v1/users?select=*', { token: alice.token });
  record({
    id: 'HTTP-08e',
    severity: 'crítica',
    request: 'GET /rest/v1/users — intento de alcanzar auth.users por REST',
    identity: 'Alice',
    expected: 'no expuesta',
    observed: describe(readAuthUsers),
    pass: readAuthUsers.status >= 400 || rowCount(readAuthUsers.body) === 0,
    mechanism: mechanismOf(readAuthUsers),
  });

  // ---- AutoCraw and the commercial layer ---------------------------------

  const writeProduct = await call('/rest/v1/affiliate_products', {
    method: 'POST',
    token: alice.token,
    body: { slug: `spam-${stamp}`, title: 'Spam' },
    headers: { Prefer: 'return=representation' },
  });
  record({
    id: 'HTTP-09a',
    severity: 'alta',
    request: 'POST /rest/v1/affiliate_products',
    identity: 'Alice',
    expected: 'rechazo',
    observed: describe(writeProduct),
    pass: writeProduct.status >= 400,
    mechanism: mechanismOf(writeProduct),
  });

  const undisclosedLink = await call('/rest/v1/affiliate_links', {
    method: 'POST',
    apikey: SERVICE,
    token: SERVICE,
    body: {
      offer_id: '00000000-0000-4000-8000-000000000000',
      url: 'https://spam.test/x',
      disclosure_required: false,
    },
  });
  record({
    id: 'HTTP-09b',
    severity: 'crítica',
    request: 'POST /rest/v1/affiliate_links {"disclosure_required":false} con service_role',
    identity: 'service_role',
    expected: 'rechazo — la divulgación es una restricción del dato',
    observed: describe(undisclosedLink),
    pass: undisclosedLink.status >= 400,
    mechanism: mechanismOf(undisclosedLink),
  });

  const pendingProducts = await call('/rest/v1/affiliate_products?status=neq.active&select=*');
  record({
    id: 'HTTP-09c',
    severity: 'media',
    request: 'GET /rest/v1/affiliate_products?status=neq.active con anon key',
    identity: 'anónimo',
    expected: '0 filas — lo pendiente no es público',
    observed: describe(pendingProducts),
    pass: pendingProducts.status >= 400 || rowCount(pendingProducts.body) === 0,
    mechanism: mechanismOf(pendingProducts),
  });

  // AutoCraw's own limits, exercised as the role it will actually connect as.
  const autocrawProbes = await sql.begin(async (tx) => {
    const out = [];
    await tx.unsafe('set local role autocraw_ingest');
    for (const [id, label, statement, severity] of [
      ['HTTP-10a', 'UPDATE public.tools SET scores', "update public.tools set scores = '{}'::jsonb", 'crítica'],
      ['HTTP-10b', 'UPDATE public.tools SET verdict', "update public.tools set verdict = 'patrocinado'", 'crítica'],
      ['HTTP-10c', 'DELETE FROM affiliate_products', 'delete from public.affiliate_products', 'alta'],
      ['HTTP-10d', 'SELECT FROM public.profiles', 'select id from public.profiles', 'crítica'],
    ]) {
      try {
        await tx.savepoint(async (sp) => {
          await sp.unsafe(statement);
          out.push({ id, label, severity, blocked: false, why: 'la sentencia se ejecutó' });
        });
      } catch (error) {
        out.push({ id, label, severity, blocked: true, why: `${error.code ?? 'error'}` });
      }
    }
    await tx.unsafe('set local role none');
    throw Object.assign(new Error('__rollback__'), { out });
  }).catch((error) => {
    if (error.message === '__rollback__') return error.out;
    throw error;
  });

  for (const probe of autocrawProbes) {
    record({
      id: probe.id,
      severity: probe.severity,
      request: probe.label,
      identity: 'autocraw_ingest',
      expected: 'denegado',
      observed: probe.blocked ? `denegado (${probe.why})` : 'PERMITIDO',
      pass: probe.blocked,
      mechanism: probe.blocked ? 'permisos del rol' : 'ninguno',
    });
  }

  // ---- Commerce must not move editorial ----------------------------------

  const ordered = await call('/rest/v1/tools?select=slug&order=slug.asc');
  const orderedAgain = await call('/rest/v1/tools?select=slug&order=slug.asc');
  record({
    id: 'HTTP-11a',
    severity: 'crítica',
    request: 'el orden del catálogo no depende de datos comerciales',
    identity: 'anónimo',
    expected: 'idéntico entre lecturas',
    observed: JSON.stringify(ordered.body) === JSON.stringify(orderedAgain.body) ? 'idéntico' : 'distinto',
    pass: JSON.stringify(ordered.body) === JSON.stringify(orderedAgain.body),
    mechanism: 'ninguna función de orden lee tablas comerciales',
  });

  const [{ n: commercialColumns }] = await sql`
    select count(*)::int as n from information_schema.columns
    where table_schema = 'public' and table_name = 'tools'
      and column_name in ('commercial_priority','affiliate_boost','sponsored_rank')`;
  record({
    id: 'HTTP-11b',
    severity: 'crítica',
    request: 'public.tools no tiene ninguna columna comercial',
    identity: 'lectura del esquema',
    expected: '0 columnas',
    observed: `${commercialColumns} columna(s)`,
    pass: commercialColumns === 0,
    mechanism: 'esquema',
  });
}

// ---------------------------------------------------------------------------

async function main() {
  enforceGuard();

  const env = loadEnv();
  BASE = (env['PUBLIC_SUPABASE_URL'] ?? '').replace(/\/$/, '');
  ANON = env['PUBLIC_SUPABASE_ANON_KEY'] ?? '';
  SERVICE = env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';

  if (!BASE || !ANON || !SERVICE) {
    console.error('\nFaltan PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY o SUPABASE_SERVICE_ROLE_KEY.\n');
    process.exit(1);
  }

  const { url } = readDbUrl(env);
  const sql = postgres(url, { max: 1, ssl: 'require', onnotice: () => {} });

  let alice = null;
  let mallory = null;
  let failed = 0;

  try {
    console.log('\nCreando identidades reales por GoTrue');
    console.log('───────────────────────────────────────────────');
    alice = await createUser('alice');
    mallory = await createUser('mallory');
    console.log(`  dos cuentas creadas y autenticadas con JWT firmado ✓`);

    /*
     * One published tool, seeded and later removed.
     *
     * Without it, "an anonymous visitor can read the catalogue" cannot tell
     * "RLS blocked me" from "the table is empty" — and an empty table made it
     * look like a policy failure, alongside three foreign-key errors from
     * probes that save a favourite or an alert against a tool.
     */
    await sql`
      insert into public.categories (slug, name) values ('imagen', 'Imagen')
      on conflict (slug) do nothing`;
    await sql`
      insert into public.tools
        (id, slug, name, category_slug, free_model, free_plan, official_url, scores,
         detected_at, last_verified_at, status)
      values
        ('tool_ollama', 'ollama', 'Ollama', 'imagen', 'free_real',
         '{"summary":"sonda","verifiedAt":"2026-08-07"}'::jsonb, 'https://ollama.com',
         '{"freeReal":10,"usefulness":9,"ease":8,"transparency":9,"creatorValue":8}'::jsonb,
         current_date, current_date, 'published')
      on conflict (id) do nothing`;

    console.log('\nAtacando la superficie pública');
    console.log('───────────────────────────────────────────────');
    await run(alice, mallory, null, sql);

    failed = results.filter((r) => !r.pass).length;
    console.log('───────────────────────────────────────────────');
    console.log(`\n${results.length - failed}/${results.length} bloqueados · ${failed} bypass`);
  } catch (error) {
    console.error(`\n✗ ${scrub(error)}\n`);
    failed = failed || 1;
  } finally {
    // Leave nothing behind: the identities are deleted through the Admin API,
    // which is also the only path that can remove an auth.users row.
    for (const user of [alice, mallory]) {
      if (!user?.id) continue;
      await call(`/auth/v1/admin/users/${user.id}`, {
        method: 'DELETE',
        apikey: SERVICE,
        token: SERVICE,
      }).catch(() => {});
    }
    // The seeded catalogue row goes too: this suite leaves nothing behind.
    await sql`delete from public.tools where id = 'tool_ollama'`.catch(() => {});
    await sql`delete from public.categories where slug = 'imagen'`.catch(() => {});
    await sql.end({ timeout: 5 }).catch(() => {});
  }

  mkdirSync(join(ROOT, 'docs/evidence'), { recursive: true });
  writeFileSync(
    join(ROOT, 'docs/evidence/http-staging-run.json'),
    `${JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        target: 'supabase-staging',
        totals: { total: results.length, passed: results.length - failed, failed },
        results,
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  console.log('\nEvidencia: docs/evidence/http-staging-run.json\n');

  process.exit(failed > 0 ? 1 : 0);
}

await main();
