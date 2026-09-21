import { test, expect } from '@playwright/test';
import { seedConsent } from './helpers';

/**
 * Noticias con el sistema de Web V2.
 *
 * Sólo lo que cambió de aspecto: la cabecera común, las pastillas de categoría
 * y la cabecera de cada noticia. Qué se publica, con qué fuente y cuándo es
 * cosa de Newsroom y se prueba en sus propias suites.
 */

const NOTICIA = '/noticias/claude-sonnet-5-pasa-a-ser-el-modelo-por-defecto-del-plan-gratuito';

test.describe('noticias', () => {
  test.beforeEach(async ({ page }) => {
    await seedConsent(page);
  });

  test('la portada de noticias usa la cabecera común, con las migas dentro', async ({ page }) => {
    await page.goto('/noticias');
    const cabecera = page.locator('header.cabecera');
    await expect(cabecera.getByRole('heading', { level: 1 })).toHaveText('Últimas noticias');
    await expect(cabecera.getByRole('navigation', { name: /migas|breadcrumb/i })).toBeVisible();
    await expect(page.locator('main nav[aria-label*="igas"], main nav[aria-label*="readcrumb"]')).toHaveCount(1);
    await expect(cabecera.locator('.franja-estado')).toContainText(/\d+ noticias/);
  });

  test('una categoría filtra y marca cuál está elegida', async ({ page }) => {
    await page.goto('/noticias');
    const filtros = page.getByRole('navigation', { name: 'Filtrar por categoría' }).getByRole('link');
    await expect(filtros.first()).toHaveAttribute('aria-current', 'true');

    const segunda = filtros.nth(1);
    const categoria = await segunda.getAttribute('data-news-filter');
    await segunda.click();

    await expect(segunda).toHaveAttribute('aria-current', 'true');
    await expect(filtros.first()).not.toHaveAttribute('aria-current', 'true');

    const visibles = page.locator('[data-news-item]:not([hidden])');
    await expect(visibles.first()).toBeVisible();
    const categorias = await visibles.evaluateAll((items) => items.map((i) => i.getAttribute('data-category')));
    expect(new Set(categorias)).toEqual(new Set([categoria]));
  });

  test('cada noticia lleva la cabecera de la ficha y la fuente original arriba', async ({ page }) => {
    await page.goto(NOTICIA);
    const cabecera = page.locator('header.cabecera');
    await expect(cabecera.getByRole('heading', { level: 1 })).toContainText('Claude Sonnet 5');

    // Las migas visibles paran en la sección: el titular ya está justo debajo.
    const migas = cabecera.locator('nav li');
    await expect(migas).toHaveCount(2);

    /*
     * «La fuente original», no «el anuncio oficial»: la mitad de lo que se
     * enlaza no es un anuncio ni lo firma el fabricante. El análisis de
     * Accomplish sobre el sandbox de Codex lo escribe quien lo investigó.
     */
    const oficial = cabecera.getByRole('link', { name: /Leer la fuente original/ });
    await expect(oficial).toHaveAttribute('target', '_blank');
    await expect(oficial).toHaveAttribute('rel', /noopener/);
    await expect(page.getByRole('link', { name: /Leer la fuente original/ })).toHaveCount(1);

    // El tipo de fuente se lee en castellano, no como el valor interno.
    await expect(page.locator('.detail-source-meta').first()).not.toContainText(/official|release-notes|model-card/);
  });

  for (const ruta of ['/noticias', NOTICIA]) {
    test(`${ruta} no se desborda a 375 px`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(ruta);
      const sobra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(sobra).toBeLessThanOrEqual(0);
    });
  }
});

test.describe('historial de cambios en noticias', () => {
  test('se presenta como historial y va de más reciente a más antiguo', async ({ page }) => {
    await seedConsent(page);
    await page.goto('/noticias');
    const seccion = page.locator('section[aria-labelledby="catalog-title"]');
    await expect(seccion.getByRole('heading', { level: 2 })).toHaveText('Historial de cambios');
    await expect(page.getByText('Cambios detectados en el catálogo')).toHaveCount(0);

    const fechas = await seccion.locator('ol time').evaluateAll((ts) => ts.map((t) => t.getAttribute('datetime') ?? ''));
    expect(fechas.length).toBeGreaterThan(1);
    expect(fechas).toEqual([...fechas].sort((a, b) => b.localeCompare(a)));

    // La entradilla dice de cuándo es la más reciente.
    await expect(seccion.locator('.news-section-lede time')).toHaveAttribute('datetime', fechas[0]!);
  });
});
