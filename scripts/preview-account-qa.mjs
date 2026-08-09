#!/usr/bin/env node
/**
 * Account QA against the Preview, on the real Supabase staging project.
 *
 * The browser suite runs in local auth mode; this one is the other half. It
 * drives a real browser against the deployment, where every account operation
 * goes through GoTrue and PostgREST with signed JWTs.
 *
 * One thing it cannot do is register through the form. GoTrue rejects
 * undeliverable domains, and using a real inbox means sending real mail — a
 * decision for a human, not a test. So sign-up is checked for *behaviour*
 * (does the form surface the rejection cleanly?) and the identity used for
 * everything else is created through the Admin API, exactly as the HTTP suite
 * does. Both users are deleted at the end.
 *
 *   node scripts/preview-account-qa.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { loadEnv } from './staging-guard.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PREVIEW = 'https://free-ai-radar-git-opus5-premium-rebuild-nada-de-pro.vercel.app';

const env = loadEnv();
const BYPASS = (env['VERCEL_PROTECTION_BYPASS'] ?? '').trim();
const SUPABASE = (env['PUBLIC_SUPABASE_URL'] ?? '').replace(/\/$/, '');
const SERVICE = env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';

const results = [];
const stamp = Date.now();
const password = `Prueba-${stamp}-${Math.random().toString(36).slice(2, 10)}!`;

function record(id, area, action, expected, observed, pass) {
  results.push({ id, area, action, expected, observed, pass });
  console.log(
    `  ${id.padEnd(10)} ${(pass ? '✓ PASA ' : '✗ FALLA')}  ${action.slice(0, 56)}`
  );
  if (!pass) console.log(`${' '.repeat(22)}↳ esperado: ${expected} · obtenido: ${observed}`);
}

/** The Admin API, for creating and removing the throwaway identity. */
async function admin(path, options = {}) {
  return fetch(`${SUPABASE}${path}`, {
    ...options,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
}

async function main() {
  if (!BYPASS || !SUPABASE || !SERVICE) {
    console.error('\nFaltan VERCEL_PROTECTION_BYPASS, PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.\n');
    process.exit(1);
  }

  const email = `qa-preview-${stamp}@example.com`;
  let userId = null;

  const browser = await chromium.launch();
  const context = await browser.newContext({
    // The secret travels as a header on every request, never in a URL.
    extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
  });

  /*
   * Console text alone is not evidence.
   *
   * The first run of this file reported "status of 400" and nothing else — not
   * the URL, not the method, not which step. That is enough to know something
   * is wrong and not enough to know what, which is the worst place for a report
   * to leave you. Responses are recorded with their request so a failure names
   * itself.
   */
  const consoleErrors = [];
  const badResponses = [];
  let step = 'arranque';

  /*
   * Two steps exist to provoke a refusal, and a refusal is what passing looks
   * like for them. Counting those as defects made the report contradict itself:
   * ACC-11 passed *because* /admin answered 404, and ACC-13 failed because it
   * had.
   *
   * They are declared here rather than filtered at the point of failure so the
   * exemption is a short, readable list with a reason attached — and so an
   * unexpected 400 anywhere else still fails. The status is part of the match:
   * if /admin ever starts answering 500, this stops covering it.
   */
  const EXPECTED_REFUSALS = [
    {
      step: 'registro',
      path: '/api/auth/signup',
      status: 400,
      why: 'GoTrue rechaza el dominio de prueba; el 400 es la respuesta correcta y ACC-01 comprueba que se explica',
    },
    {
      step: 'admin',
      path: '/admin',
      status: 404,
      why: 'un usuario sin permisos no debe saber que la ruta existe; es lo que ACC-11 exige',
    },
  ];

  const isExpected = (entry) =>
    EXPECTED_REFUSALS.some(
      (e) => e.step === entry.step && e.path === entry.path && e.status === entry.status
    );

  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/vercel\.live|behind a redirect/i.test(m.text())) return;

    /*
     * "Failed to load resource: … status of 400" is the browser narrating the
     * response listener's job, and the text alone does not say which URL. The
     * location does, so the same exemption can be applied to both and neither
     * has to be hand-waved.
     */
    const url = m.location()?.url ?? '';
    const status = Number(m.text().match(/status of (\d{3})/)?.[1] ?? 0);
    let path = '';
    try {
      path = new URL(url).pathname;
    } catch {
      /* console errors from inline script have no URL */
    }

    consoleErrors.push({ step, text: m.text(), path, status });
  });
  page.on('response', (response) => {
    if (response.status() < 400) return;
    const url = new URL(response.url());
    if (/vercel\.live/.test(url.host)) return;
    badResponses.push({
      step,
      method: response.request().method(),
      // Path only: a query string can carry an email or a token.
      path: url.host === new URL(PREVIEW).host ? url.pathname : `${url.host}${url.pathname}`,
      status: response.status(),
    });
  });

  // A returning visitor who already declined: the consent dialog is covered by
  // the browser suite and would otherwise intercept every click here.
  await context.addInitScript(() => {
    const record = JSON.stringify({
      version: 2,
      state: { necessary: true, analytics: false, personalization: false, advertising: false },
      decidedAt: new Date().toISOString(),
    });
    try {
      window.localStorage.setItem('far-consent', record);
    } catch {
      /* storage blocked */
    }
    document.cookie = `far_consent=${encodeURIComponent(record)}; path=/; SameSite=Lax`;
  });

  try {
    console.log('\nModo de autenticación del Preview');
    console.log('───────────────────────────────────────────────');
    step = 'modo-auth';
    await page.goto(`${PREVIEW}/cuenta/entrar`, { waitUntil: 'domcontentloaded' });
    const body = await page.locator('main').innerText();
    const localMode = /modo local de desarrollo/i.test(body);
    record(
      'ACC-00',
      'auth',
      'el Preview usa Supabase, no el almacén local',
      'sin aviso de modo local',
      localMode ? 'MUESTRA aviso de modo local' : 'modo Supabase',
      !localMode
    );

    // ---- Registration through the public form --------------------------
    console.log('\nRegistro público');
    console.log('───────────────────────────────────────────────');
    step = 'registro';
    await page.goto(`${PREVIEW}/cuenta/crear`, { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Correo electrónico').fill(email);
    await page.getByLabel('Contraseña', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Crear cuenta gratis' }).click();
    await page.waitForTimeout(3500);

    const afterSignUp = await page.locator('main').innerText();
    const landedOnAccount = /\/cuenta$/.test(new URL(page.url()).pathname);
    const showedError = /inválid|no es válid|invalid|error|no hemos podido/i.test(afterSignUp);

    /*
     * The message itself is the evidence, not the fact that one exists. A 400
     * is the right answer to an address the provider will not accept, but only
     * if what reaches the visitor is a sentence they can act on rather than a
     * leaked provider string or a blank page.
     */
    const signUpMessage = (afterSignUp.match(/^.*(?:inválid|no es válid|invalid|error|no hemos podido).*$/im)?.[0] ?? '')
      .trim()
      .slice(0, 120);

    record(
      'ACC-01',
      'registro',
      'el formulario responde sin romperse',
      'o crea la cuenta, o explica por qué no',
      landedOnAccount ? 'cuenta creada' : showedError ? `mensaje: «${signUpMessage}»` : 'ni una cosa ni la otra',
      landedOnAccount || showedError
    );
    const unexpectedSoFar = consoleErrors.filter((e) => !isExpected(e));
    record(
      'ACC-02',
      'registro',
      'ningún error de consola inesperado durante el registro',
      '0 inesperados',
      unexpectedSoFar.length
        ? unexpectedSoFar.map((e) => `${e.text} (${e.path})`).join(' | ').slice(0, 200)
        : '0 inesperados',
      unexpectedSoFar.length === 0
    );

    // ---- The identity everything else uses ------------------------------
    if (!landedOnAccount) {
      const created = await admin('/auth/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify({ email, password, email_confirm: true }),
      });
      const payload = await created.json();
      userId = payload?.id ?? null;
      record(
        'ACC-03',
        'registro',
        'alta por Admin API para poder seguir probando',
        'usuario creado',
        userId ? 'creado' : `HTTP ${created.status}`,
        Boolean(userId)
      );
    }

    // ---- Login ----------------------------------------------------------
    console.log('\nSesión');
    console.log('───────────────────────────────────────────────');
    step = 'login';
    await page.goto(`${PREVIEW}/cuenta/entrar`, { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Correo electrónico').fill(email);
    await page.getByLabel('Contraseña', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.waitForTimeout(3500);

    const loggedIn = new URL(page.url()).pathname.startsWith('/cuenta');
    const accountText = await page.locator('main').innerText().catch(() => '');
    record(
      'ACC-04',
      'login',
      'entra con las credenciales correctas',
      'llega a /cuenta',
      `${new URL(page.url()).pathname}`,
      loggedIn && !/entrar/i.test(await page.title())
    );
    record(
      'ACC-05',
      'login',
      'el panel muestra contenido de la cuenta',
      'algo más que una cáscara',
      `${accountText.length} caracteres`,
      accountText.length > 100
    );

    // ---- The URL a preview must never leave -----------------------------
    record(
      'ACC-06',
      'origen',
      'el flujo se queda en el Preview, no salta a producción',
      'anfitrión del preview',
      new URL(page.url()).host,
      new URL(page.url()).host === new URL(PREVIEW).host
    );

    // ---- Favourites, lists, preferences ---------------------------------
    console.log('\nDatos del usuario');
    console.log('───────────────────────────────────────────────');

    step = 'favoritos';
    await page.goto(`${PREVIEW}/herramientas/ollama`, { waitUntil: 'domcontentloaded' });
    const saveButton = page.getByRole('button', { name: /guardar|favorito/i }).first();
    const canSave = await saveButton.isVisible().catch(() => false);
    if (canSave) {
      await saveButton.click();
      await page.waitForTimeout(2000);
    }
    await page.goto(`${PREVIEW}/cuenta/favoritos`, { waitUntil: 'domcontentloaded' });
    const favourites = await page.locator('main').innerText();
    const saved = /ollama/i.test(favourites);
    /*
     * The two ways this fails are worth telling apart. A missing button means
     * the page never offered the action; a present button with nothing saved
     * means the write was rejected — which is what happened when `public.tools`
     * was empty and the foreign key refused every insert.
     */
    record(
      'ACC-07',
      'favoritos',
      'guardar una herramienta la lleva a favoritos',
      'aparece en la lista',
      saved ? 'aparece' : canSave ? 'se pulsó el botón y no aparece' : 'no había botón que pulsar',
      saved
    );

    step = 'listas';
    await page.goto(`${PREVIEW}/cuenta/listas`, { waitUntil: 'domcontentloaded' });
    record(
      'ACC-08',
      'listas',
      'la página de listas carga para un usuario con sesión',
      'HTTP 200 con contenido',
      `${(await page.locator('main').innerText()).length} caracteres`,
      (await page.locator('main').innerText()).length > 50
    );

    step = 'preferencias';
    await page.goto(`${PREVIEW}/cuenta/preferencias`, { waitUntil: 'domcontentloaded' });
    const prefsText = await page.locator('main').innerText();
    record(
      'ACC-09',
      'preferencias',
      'las preferencias de correo cargan',
      'con contenido',
      `${prefsText.length} caracteres`,
      prefsText.length > 50
    );

    // ---- Password recovery ----------------------------------------------
    console.log('\nRecuperación');
    console.log('───────────────────────────────────────────────');
    step = 'recuperacion';
    const recovery = await page.goto(`${PREVIEW}/cuenta/recuperar`, { waitUntil: 'domcontentloaded' });
    record(
      'ACC-10',
      'recuperación',
      'la página de recuperación existe',
      'HTTP 200',
      `HTTP ${recovery?.status()}`,
      recovery?.status() === 200
    );

    // ---- Admin authorisation --------------------------------------------
    console.log('\nAutorización');
    console.log('───────────────────────────────────────────────');
    step = 'admin';
    const adminPage = await page.goto(`${PREVIEW}/admin`, { waitUntil: 'domcontentloaded' });
    record(
      'ACC-11',
      'admin',
      'un usuario normal con sesión NO entra en /admin',
      '404 o redirección',
      `HTTP ${adminPage?.status()} en ${new URL(page.url()).pathname}`,
      adminPage?.status() === 404 || !new URL(page.url()).pathname.startsWith('/admin')
    );

    // ---- Logout ----------------------------------------------------------
    step = 'logout';
    await page.goto(`${PREVIEW}/cuenta`, { waitUntil: 'domcontentloaded' });
    const logout = page.getByRole('button', { name: /cerrar sesión|salir/i }).first();
    if (await logout.isVisible().catch(() => false)) {
      await logout.click();
      await page.waitForTimeout(2500);
    }
    const afterLogout = await page.goto(`${PREVIEW}/cuenta`, { waitUntil: 'domcontentloaded' });
    const bounced = new URL(page.url()).pathname.startsWith('/cuenta/entrar');
    record(
      'ACC-12',
      'logout',
      'tras cerrar sesión, /cuenta vuelve al login',
      'redirige a /cuenta/entrar',
      `${new URL(page.url()).pathname} (HTTP ${afterLogout?.status()})`,
      bounced
    );

    const unexpectedConsole = consoleErrors.filter((e) => !isExpected(e));
    const unexpectedNetwork = badResponses.filter((r) => !isExpected(r));

    record(
      'ACC-13',
      'consola',
      'ningún error de consola inesperado en todo el recorrido',
      '0 inesperados',
      unexpectedConsole.length
        ? `${unexpectedConsole.length}: ` +
          unexpectedConsole.map((e) => `[${e.step}] ${e.text} ${e.path}`).join(' | ').slice(0, 200)
        : `0 inesperados (${consoleErrors.length} rechazos previstos)`,
      unexpectedConsole.length === 0
    );

    record(
      'ACC-14',
      'red',
      'ninguna respuesta 4xx/5xx inesperada en todo el recorrido',
      'ninguna',
      unexpectedNetwork.length
        ? unexpectedNetwork.map((r) => `[${r.step}] ${r.method} ${r.path} → ${r.status}`).join(' | ')
        : `ninguna (${badResponses.length} rechazos previstos)`,
      unexpectedNetwork.length === 0
    );

    /*
     * The exemptions are asserted, not assumed. If a refusal this list excuses
     * stops happening, the behaviour it documents has changed and the list is
     * now lying about what the site does.
     */
    const missing = EXPECTED_REFUSALS.filter(
      (e) => !badResponses.some((r) => r.step === e.step && r.path === e.path && r.status === e.status)
    );
    record(
      'ACC-15',
      'red',
      'los rechazos previstos siguen produciéndose',
      `${EXPECTED_REFUSALS.length} rechazos`,
      missing.length
        ? `ya no ocurre: ${missing.map((e) => `${e.path} → ${e.status}`).join(', ')}`
        : EXPECTED_REFUSALS.map((e) => `${e.path} → ${e.status}`).join(', '),
      missing.length === 0
    );
  } finally {
    // The throwaway identity goes, whatever happened above.
    if (!userId) {
      const list = await admin(`/auth/v1/admin/users?page=1&per_page=200`);
      const payload = await list.json().catch(() => ({}));
      userId = (payload.users ?? []).find((u) => u.email === email)?.id ?? null;
    }
    if (userId) {
      await admin(`/auth/v1/admin/users/${userId}`, { method: 'DELETE' }).catch(() => {});
      console.log('\n  identidad de prueba eliminada');
    }
    await browser.close();
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log('───────────────────────────────────────────────');
  console.log(`\n${results.length - failed}/${results.length} correctas · ${failed} fallos`);

  mkdirSync(join(ROOT, 'docs/evidence'), { recursive: true });
  writeFileSync(
    join(ROOT, 'docs/evidence/preview-account-qa.json'),
    `${JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        target: 'vercel-preview + supabase-staging',
        totals: { total: results.length, passed: results.length - failed, failed },
        results,
        expectedRefusals: EXPECTED_REFUSALS,
        consoleErrors,
        badResponses,
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  console.log('Evidencia: docs/evidence/preview-account-qa.json\n');

  process.exit(failed > 0 ? 1 : 0);
}

await main();
