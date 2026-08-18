import { test, expect, type Page } from '@playwright/test';
import { seedConsent } from './helpers';

/**
 * Account flows end to end, against the local auth mode.
 *
 * No Supabase, no Stripe, no Resend — everything is exercised as a real user
 * would, with the development identity store behind it.
 */

function uniqueEmail(): string {
  return `e2e-${Date.now()}-${Math.floor(Math.random() * 10_000)}@ejemplo.test`;
}

const PASSWORD = 'una frase larga para las pruebas';

/**
 * Consent is a precondition for these tests, not their subject — the dialog
 * itself is exercised in `public.spec.ts`. Seeding the decision avoids driving
 * a modal in every single setup.
 */
async function dismissConsent(page: Page): Promise<void> {
  await seedConsent(page);
}

async function register(page: Page, email = uniqueEmail()): Promise<string> {
  await dismissConsent(page);
  await page.goto('/cuenta/crear');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear cuenta gratis' }).click();
  /*
   * `domcontentloaded`, no `load`.
   *
   * `waitForURL` espera por defecto al evento `load`, que no llega hasta que
   * termina el último subrecurso — incluidos los guiones de terceros. En WebKit,
   * la petición de Vercel Web Analytics se queda colgada fuera de producción y el
   * `load` no llegaba nunca: el registro había funcionado, el navegador ya estaba
   * en /cuenta y el `domcontentloaded` había disparado, pero la prueba agotaba
   * los treinta segundos esperando un fichero ajeno.
   *
   * Lo que estas pruebas comprueban es que la navegación ocurrió, no que un
   * script de analítica terminara de bajar. Sigue exigiendo llegar a la URL.
   */
  await page.waitForURL(/\/cuenta$/, { timeout: 15_000, waitUntil: 'domcontentloaded' });
  return email;
}

test.describe('registro', () => {
  test('crea una cuenta y entra al panel', async ({ page }) => {
    await register(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('Plan gratuito', { exact: true })).toBeVisible();
  });

  test('rechaza una contraseña demasiado corta', async ({ page }) => {
    await dismissConsent(page);
    await page.goto('/cuenta/crear');
    await page.getByLabel('Correo electrónico').fill(uniqueEmail());
    await page.getByLabel('Contraseña', { exact: true }).fill('corta');
    await page.getByRole('button', { name: 'Crear cuenta gratis' }).click();

    await expect(page.locator('[data-error-for="password"]')).toBeVisible();
    await expect(page).toHaveURL(/\/cuenta\/crear/);
  });

  test('la contraseña se puede revelar', async ({ page }) => {
    await dismissConsent(page);
    await page.goto('/cuenta/crear');
    const field = page.getByLabel('Contraseña', { exact: true });
    await expect(field).toHaveAttribute('type', 'password');
    await page.locator('[data-toggle-password="password"]').click();
    await expect(field).toHaveAttribute('type', 'text');
  });
});

test.describe('inicio y cierre de sesión', () => {
  test('entra con las credenciales correctas', async ({ page, context }) => {
    const email = await register(page);
    await context.clearCookies();

    await dismissConsent(page);
    await page.goto('/cuenta/entrar');
    await page.getByLabel('Correo electrónico').fill(email);
    await page.getByLabel('Contraseña').fill(PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();

    await page.waitForURL(/\/cuenta$/, { timeout: 15_000, waitUntil: 'domcontentloaded' });
    await expect(page.getByText(email)).toBeVisible();
  });

  test('una contraseña incorrecta no revela si la cuenta existe', async ({ page, context }) => {
    const email = await register(page);
    await context.clearCookies();

    await dismissConsent(page);
    await page.goto('/cuenta/entrar');
    const result = page.locator('[data-form-result]');

    await page.getByLabel('Correo electrónico').fill(email);
    await page.getByLabel('Contraseña').fill('esta no es la contraseña');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(result).toBeVisible();
    const knownAccount = await result.textContent();

    await page.getByLabel('Correo electrónico').fill('nadie-en-absoluto@ejemplo.test');
    await page.getByLabel('Contraseña').fill('esta no es la contraseña');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(result).toBeVisible();
    const unknownAccount = await result.textContent();

    expect(knownAccount).toBeTruthy();
    expect(knownAccount).toBe(unknownAccount);
  });

  test('el enlace de recuperación responde siempre igual', async ({ page }) => {
    await dismissConsent(page);
    await page.goto('/cuenta/recuperar');
    await page.getByLabel('Correo electrónico').fill('cualquiera@ejemplo.test');
    await page.getByRole('button', { name: 'Enviarme el enlace' }).click();
    await expect(page.locator('[data-form-result]')).toContainText(/Si ese correo tiene una cuenta/);
  });

  test('cierra sesión y protege la ruta privada', async ({ page }) => {
    await register(page);
    await page.getByRole('button', { name: 'Salir' }).click();
    await page.waitForURL('/', { waitUntil: 'domcontentloaded' });

    await page.goto('/cuenta');
    await expect(page).toHaveURL(/\/cuenta\/entrar/);
  });

  test('un usuario ya autenticado no ve el formulario de login', async ({ page }) => {
    await register(page);
    await page.goto('/cuenta/entrar');
    await expect(page).toHaveURL(/\/cuenta$/);
  });

  test('vuelve al destino solicitado tras entrar', async ({ page }) => {
    await register(page);
    await page.getByRole('button', { name: 'Salir' }).click();
    await page.waitForURL('/', { waitUntil: 'domcontentloaded' });

    await page.goto('/cuenta/favoritos');
    await expect(page).toHaveURL(/next=/);
  });
});

test.describe('funciones de la cuenta', () => {
  test('guardar una herramienta la lleva a favoritos', async ({ page }) => {
    await register(page);

    await page.goto('/herramientas/ollama');
    await page.locator('[data-action="favorite"]').click();
    await expect(page.locator('[data-action="favorite"]')).toHaveAttribute('aria-pressed', 'true');

    await page.goto('/cuenta/favoritos');
    await expect(page.getByRole('heading', { name: 'Ollama' })).toBeVisible();
  });

  test('crea una lista', async ({ page }) => {
    await register(page);
    await page.goto('/cuenta/listas');

    await page.getByLabel('Nombre').fill('Vídeo para clientes');
    await page.getByRole('button', { name: 'Crear lista' }).click();

    await expect(page.getByRole('heading', { name: 'Vídeo para clientes' })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('guarda las preferencias de correo', async ({ page }) => {
    await register(page);
    await page.goto('/cuenta/preferencias');

    // The page holds four independent forms; scope to the one under test so
    // the assertion cannot pick up another form's result banner.
    const emailForm = page.locator('form').filter({
      has: page.getByRole('button', { name: 'Guardar preferencias' }),
    });

    await emailForm.getByRole('checkbox', { name: /Contenido comercial/ }).check();
    await emailForm.getByRole('button', { name: 'Guardar preferencias' }).click();

    await expect(emailForm.locator('[data-form-result]')).toContainText(/guardadas/i);
  });

  test('el correo comercial está desactivado por defecto', async ({ page }) => {
    await register(page);
    await page.goto('/cuenta/preferencias');
    await expect(page.getByRole('checkbox', { name: /Contenido comercial/ })).not.toBeChecked();
  });

  test('exporta sus datos en JSON', async ({ page }) => {
    await register(page);
    const response = await page.request.get('/api/account/export');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-disposition']).toContain('attachment');

    const payload = await response.json();
    expect(payload).toHaveProperty('account');
    expect(payload).toHaveProperty('favorites');
  });

  test('la suscripción muestra el plan gratuito y el modo simulado', async ({ page }) => {
    await register(page);
    await page.goto('/cuenta/suscripcion');
    await expect(page.getByRole('heading', { name: 'Gratis', exact: true })).toBeVisible();
    await expect(page.getByText(/Stripe no está configurado/).first()).toBeVisible();
  });
});

test.describe('CSRF', () => {
  test('un POST sin token es rechazado', async ({ page }) => {
    await register(page);

    const response = await page.request.post('/api/account/favorites', {
      headers: { 'Content-Type': 'application/json' },
      data: { slug: 'ollama' },
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(403);
  });
});
