import { test, expect, type Page } from '@playwright/test';
import { seedConsent } from './helpers';

/**
 * Public navigation, search, filtering and the tool page.
 *
 * These run against the dev server with no external credentials, so they cover
 * exactly what a first-time visitor sees.
 */

test.describe('portada', () => {
  test('carga y comunica la propuesta de valor', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/gratis de verdad/i);
    await expect(page).toHaveTitle(/Free AI Radar/);
  });

  test('el canónico apunta al dominio real, nunca al de preview', async ({ page }) => {
    await page.goto('/');
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toContain('freeairadar.com');
    expect(canonical).not.toContain('vercel.app');
  });

  test('emite datos estructurados válidos', async ({ page }) => {
    await page.goto('/');
    const jsonLd = await page.locator('script[type="application/ld+json"]').first().textContent();
    const parsed = JSON.parse(jsonLd ?? '{}');
    expect(parsed['@context']).toBe('https://schema.org');
    expect(Array.isArray(parsed['@graph'])).toBe(true);
  });

  test('no hay errores de consola', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
  });
});

test.describe('consentimiento', () => {
  test('aparece antes de cualquier decisión y permite rechazar con un clic', async ({ page }) => {
    await page.goto('/');
    const dialog = page.getByRole('dialog', { name: /cookies/i });
    await expect(dialog).toBeVisible();

    // Rechazar debe ser tan accesible como aceptar.
    const accept = dialog.getByRole('button', { name: 'Aceptar todo' });
    const reject = dialog.getByRole('button', { name: 'Rechazar todo' });
    await expect(accept).toBeVisible();
    await expect(reject).toBeVisible();

    await reject.click();
    await expect(dialog).toBeHidden();
  });

  test('la decisión se recuerda entre visitas', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Rechazar todo' }).click();
    await page.reload();
    await expect(page.getByRole('dialog', { name: /cookies/i })).toBeHidden();
  });
});

test.describe('descubrimiento', () => {
  test.beforeEach(async ({ page }) => {
    // The consent decision is a precondition here, not the thing under test —
    // it gets its own suite above. Seeding it keeps these tests focused and
    // avoids re-driving a modal dialog dozens of times.
    await seedConsent(page);
    await page.goto('/herramientas');
  });

  test('lista herramientas', async ({ page }) => {
    await expect(page.locator('[data-result-item]:visible').first()).toBeVisible();
    const count = await page.locator('[data-result-item]:visible').count();
    expect(count).toBeGreaterThan(0);
  });

  /**
   * The filter inputs are real checkboxes styled as chips, so the input itself
   * is `sr-only` and the visible target is its wrapping label — which is what a
   * reader actually clicks. Driving the label keeps the test honest about the
   * real interaction.
   */
  const filterChip = (page: Page, label: string) =>
    page.locator('.filter-chip').filter({ hasText: new RegExp(`^${label}`) }).first();

  test('los filtros se combinan y quedan en la URL', async ({ page }) => {
    const before = await page.locator('[data-result-item]:visible').count();

    await filterChip(page, 'Sin tarjeta').click();
    await expect(page).toHaveURL(/nocard=1/);

    await filterChip(page, 'Uso comercial').click();
    await expect(page).toHaveURL(/nocard=1/);
    await expect(page).toHaveURL(/comm=1/);

    const after = await page.locator('[data-result-item]:visible').count();
    expect(after).toBeLessThanOrEqual(before);
    expect(after).toBeGreaterThan(0);
  });

  test('los filtros son operables por teclado', async ({ page }) => {
    const checkbox = page.getByRole('checkbox', { name: 'Sin tarjeta' });
    await checkbox.focus();
    await page.keyboard.press('Space');
    await expect(checkbox).toBeChecked();
    await expect(page).toHaveURL(/nocard=1/);
  });

  test('una URL con filtros se puede compartir y reproduce el estado', async ({ page }) => {
    await page.goto('/herramientas?oss=1');
    // "Open source" exists both as a hard requirement and as a free-tier model,
    // so the assertion has to name which group it means.
    const requirement = page
      .getByRole('group', { name: 'Requisitos' })
      .getByRole('checkbox', { name: 'Open source' });
    await expect(requirement).toBeChecked();
    expect(await page.locator('[data-result-item]:visible').count()).toBeGreaterThan(0);
  });

  test('la vista filtrada no compite con su canónico', async ({ page }) => {
    await page.goto('/herramientas?nocard=1');

    // 1. El canónico consolida en la URL limpia.
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toBe('https://www.freeairadar.com/herramientas');

    // 2. El explorador marca noindex en cuanto hay filtros (para los
    //    rastreadores que ejecutan JavaScript). robots.txt cubre al resto.
    await expect
      .poll(() => page.locator('meta[name="robots"]').getAttribute('content'))
      .toContain('noindex');
  });

  test('la vista sin filtrar es indexable', async ({ page }) => {
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toContain('index');
    expect(robots).not.toContain('noindex');
  });

  test('la búsqueda encuentra y sugiere', async ({ page }) => {
    const search = page.getByRole('combobox', { name: /buscar/i });
    await search.fill('ollama');
    await expect(page.getByRole('listbox')).toBeVisible();
    await expect(page.getByRole('option').first()).toContainText(/ollama/i);
  });

  test('«/» enfoca el buscador', async ({ page }) => {
    await page.locator('body').press('/');
    await expect(page.getByRole('combobox', { name: /buscar/i })).toBeFocused();
  });

  test('el estado vacío explica qué filtro lo provoca', async ({ page }) => {
    await page.goto('/herramientas?q=zzzzqqqxxx');
    await expect(page.locator('#empty-state')).toBeVisible();
    await expect(page.locator('#empty-reason')).not.toBeEmpty();
  });

  test('se pueden quitar todos los filtros', async ({ page }) => {
    await page.goto('/herramientas?nocard=1&oss=1');
    await page.getByRole('button', { name: 'Quitar filtros' }).click();
    await expect(page).toHaveURL(/\/herramientas$/);
  });
});

test.describe('ficha de herramienta', () => {
  test('muestra el análisis completo', async ({ page }) => {
    await seedConsent(page);
    await page.goto('/herramientas');

    await page.locator('[data-result-item]:visible .tool-card-link').first().click();
    await page.waitForURL(/\/herramientas\/[a-z0-9-]+$/);

    await expect(page.getByRole('heading', { name: 'Qué te dan gratis' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Por qué \d+ y no otra cifra/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Fuentes' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Para quién sirve/ })).toBeVisible();
    await expect(page.locator('#reportar')).toBeVisible();
  });

  test('el enlace saliente se abre en pestaña nueva con rel seguro', async ({ page }) => {
    await page.goto('/herramientas/ollama');
    const link = page.locator('[data-outbound]').first();
    await expect(link).toHaveAttribute('target', '_blank');
    const rel = await link.getAttribute('rel');
    expect(rel).toContain('noopener');
  });

  test('no publica datos estructurados de valoración', async ({ page }) => {
    await page.goto('/herramientas/ollama');
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const combined = blocks.join(' ');
    expect(combined).not.toContain('aggregateRating');
    expect(combined).not.toContain('ratingValue');
  });
});

test.describe('comparador', () => {
  test('compara dos herramientas desde una URL compartible', async ({ page }) => {
    await page.goto('/comparar?t=ollama,lm-studio');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/vs/i);
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('rowheader', { name: '¿Pide tarjeta?' })).toBeVisible();
  });

  test('el comparador vacío no es indexable', async ({ page }) => {
    await page.goto('/comparar');
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toContain('noindex');
  });

  test('una comparación con contenido sí es indexable', async ({ page }) => {
    await page.goto('/comparar?t=ollama,lm-studio');
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).not.toContain('noindex');
  });

  test('avisa de las herramientas que no existen', async ({ page }) => {
    await page.goto('/comparar?t=ollama,no-existe-esto');
    await expect(page.getByText(/No tenemos ficha de/)).toBeVisible();
  });
});

test.describe('SEO técnico', () => {
  test('robots.txt apunta al sitemap del dominio correcto', async ({ request }) => {
    const response = await request.get('/robots.txt');
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain('Sitemap: https://www.freeairadar.com/sitemap.xml');
    expect(body).not.toContain('vercel.app');
    expect(body).toContain('Disallow: /admin');
    expect(body).toContain('Disallow: /cuenta');
  });

  test('el sitemap es XML válido y no incluye rutas privadas', async ({ request }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain('<urlset');
    expect(body).toContain('/herramientas');
    expect(body).not.toContain('/admin');
    expect(body).not.toContain('/cuenta/');
  });

  test('el RSS es válido', async ({ request }) => {
    const response = await request.get('/rss.xml');
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain('<rss');
    expect(body).toContain('<channel>');
  });

  test('el manifest de la PWA es válido', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest');
    expect(response.status()).toBe(200);
    const manifest = await response.json();
    expect(manifest.name).toBeTruthy();
    expect(manifest.start_url).toBeTruthy();
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
    expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === 'maskable')).toBe(
      true
    );
  });

  test('la 404 es útil, no un callejón sin salida', async ({ page }) => {
    const response = await page.goto('/una-ruta-que-no-existe');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('searchbox')).toBeVisible();
  });
});

test.describe('accesibilidad', () => {
  /**
   * The skip link, asserted per engine.
   *
   * WebKit does not move Tab focus to links at all — it only reaches form
   * controls unless the user turns on macOS "Full Keyboard Access". Measured
   * on this page: Chromium and Firefox tab to `a.skip-link` first, WebKit goes
   * straight to `button.theme-toggle`. That is a browser default, not a defect
   * here, so asserting Tab order on WebKit would be testing Safari rather than
   * the site.
   *
   * What must hold on every engine is that the link is first in DOM order,
   * can take focus, and actually moves the reader to the content.
   */
  test('hay un enlace para saltar al contenido', async ({ page }, testInfo) => {
    // The consent dialog is modal and traps focus by design, so the decision
    // has to exist before the page's own tab order can be exercised.
    await seedConsent(page);
    await page.goto('/');

    const skip = page.getByRole('link', { name: 'Saltar al contenido' });

    // El Tab va primero, sobre la carga limpia. `blur()` no sirve para
    // reiniciarlo: Chromium conserva el punto de partida de la navegación
    // secuencial en el último elemento enfocado, así que el siguiente Tab
    // continuaría desde ahí en vez de empezar por el principio.
    const tabsToLinks = !['webkit', 'mobile-safari'].includes(testInfo.project.name);
    if (tabsToLinks) {
      await page.keyboard.press('Tab');
      await expect(skip).toBeFocused();
    }

    // Primero en el orden del DOM, en todos los motores.
    const isFirstFocusable = await page.evaluate(() => {
      const focusable = document.querySelectorAll<HTMLElement>(
        'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      return focusable[0]?.classList.contains('skip-link') ?? false;
    });
    expect(isFirstFocusable).toBe(true);

    // Recibe el foco y lleva al contenido, en todos los motores.
    await skip.focus();
    await expect(skip).toBeFocused();
    await expect(skip).toHaveAttribute('href', '#main');
  });

  test('el tema se puede cambiar y persiste', async ({ page }) => {
    await seedConsent(page);
    await page.goto('/');

    const toggle = page.locator('#theme-toggle');
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('cada página tiene exactamente un h1', async ({ page }) => {
    for (const path of ['/', '/herramientas', '/categorias', '/metodologia', '/pro']) {
      await page.goto(path);
      expect(await page.locator('h1').count(), path).toBe(1);
    }
  });
});

test.describe('rutas privadas', () => {
  test('la cuenta redirige al login', async ({ page }) => {
    await page.goto('/cuenta');
    await expect(page).toHaveURL(/\/cuenta\/entrar/);
  });

  test('el admin no es accesible sin sesión', async ({ page }) => {
    await page.goto('/admin');
    // Redirige al login: la existencia del panel no se confirma con un 403.
    expect(page.url()).toContain('/cuenta/entrar');
  });
});
