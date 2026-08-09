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

  const consoleErrors = [];
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/vercel\.live|behind a redirect/i.test(m.text())) return;
    consoleErrors.push(m.text());
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
    await page.goto(`${PREVIEW}/cuenta/crear`, { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Correo electrónico').fill(email);
    await page.getByLabel('Contraseña', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Crear cuenta gratis' }).click();
    await page.waitForTimeout(3500);

    const afterSignUp = await page.locator('main').innerText();
    const landedOnAccount = /\/cuenta$/.test(new URL(page.url()).pathname);
    const showedError = /inválid|no es válid|invalid|error|no hemos podido/i.test(afterSignUp);

    record(
      'ACC-01',
      'registro',
      'el formulario responde sin romperse',
      'o crea la cuenta, o explica por qué no',
      landedOnAccount ? 'cuenta creada' : showedError ? 'muestra un mensaje de error' : 'ni una cosa ni la otra',
      landedOnAccount || showedError
    );
    record(
      'ACC-02',
      'registro',
      'ningún error de consola durante el registro',
      '0 errores',
      `${consoleErrors.length} errores`,
      consoleErrors.length === 0
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

    await page.goto(`${PREVIEW}/herramientas/ollama`, { waitUntil: 'domcontentloaded' });
    const saveButton = page.getByRole('button', { name: /guardar|favorito/i }).first();
    const canSave = await saveButton.isVisible().catch(() => false);
    if (canSave) {
      await saveButton.click();
      await page.waitForTimeout(2000);
    }
    await page.goto(`${PREVIEW}/cuenta/favoritos`, { waitUntil: 'domcontentloaded' });
    const favourites = await page.locator('main').innerText();
    record(
      'ACC-07',
      'favoritos',
      'guardar una herramienta la lleva a favoritos',
      'aparece en la lista',
      /ollama/i.test(favourites) ? 'aparece' : 'no aparece',
      /ollama/i.test(favourites)
    );

    await page.goto(`${PREVIEW}/cuenta/listas`, { waitUntil: 'domcontentloaded' });
    record(
      'ACC-08',
      'listas',
      'la página de listas carga para un usuario con sesión',
      'HTTP 200 con contenido',
      `${(await page.locator('main').innerText()).length} caracteres`,
      (await page.locator('main').innerText()).length > 50
    );

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

    record(
      'ACC-13',
      'consola',
      'ningún error de consola en todo el recorrido',
      '0 errores',
      consoleErrors.length ? consoleErrors[0].slice(0, 80) : '0 errores',
      consoleErrors.length === 0
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
