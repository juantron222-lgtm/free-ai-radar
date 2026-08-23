import { test, expect } from '@playwright/test';
import { seedConsent } from './helpers';

/**
 * La portada, medida por lo que hace y no por cómo se ve.
 *
 * Nada de capturas pixel a pixel: lo que se comprueba son propiedades que un
 * rediseño puede cambiar libremente sin romperlas —que no haya desbordamiento,
 * que el nombre de una tarjeta no se estruje, que nada se repita— y que fallan
 * en cuanto la página vuelve a alargarse sola.
 */

const ANCHOS = [320, 375, 390, 430];

test.describe('portada', () => {
  test.beforeEach(async ({ page }) => {
    await seedConsent(page);
  });

  for (const ancho of ANCHOS) {
    test(`no se desborda en horizontal a ${ancho} px`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: 812 });
      await page.goto('/');

      const medida = await page.evaluate(() => ({
        documento: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
      }));

      expect(medida.documento, `a ${ancho} px la página se desplaza de lado`).toBeLessThanOrEqual(
        medida.viewport
      );
    });
  }

  test('la primera acción útil entra en la primera pantalla', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');

    /*
     * El buscador y las seis intenciones son lo que alguien puede *hacer*
     * nada más llegar. Si caen por debajo del pliegue, la portada se ha vuelto
     * a llenar de preámbulo.
     */
    const buscador = page.getByRole('search').first();
    await expect(buscador).toBeVisible();

    const primeraIntencion = page.getByRole('link', { name: /crear imágenes/i });
    const top = await primeraIntencion.evaluate(
      (el) => el.getBoundingClientRect().top + window.scrollY
    );
    expect(top, 'la primera intención debe verse sin desplazar').toBeLessThan(812);
  });

  test('el titular no pega dos palabras', async ({ page }) => {
    /*
     * El mismo defecto que ya cazamos en las entradillas de las verticales,
     * esta vez en el H1: `…gratis de verdad</span>,<br />separada…`. El salto
     * está oculto por CSS y el compilador de Astro se come el espacio en
     * blanco del código, así que en móvil se leía «verdad,separada».
     */
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    const titular = (await page.locator('h1').innerText()).replace(/\s+/g, ' ');
    expect(titular, `«${titular}»`).not.toMatch(/[a-záéíóúñ],[A-Za-zÁÉÍÓÚÑ]/);
  });

  test('ninguna herramienta se repite', async ({ page }) => {
    await page.goto('/');
    const slugs = await page.evaluate(() =>
      [...document.querySelectorAll('main a[href^="/herramientas/"]')]
        .map((a) => a.getAttribute('href') ?? '')
        .filter((h) => h.split('/').length > 2)
        .map((h) => h.split('/')[2])
    );

    expect(slugs.length, 'la portada debe enseñar herramientas').toBeGreaterThan(0);
    expect(new Set(slugs).size, `repetidas: ${slugs.join(', ')}`).toBe(slugs.length);
  });

  test('el módulo principal enseña varias categorías, no una', async ({ page }) => {
    await page.goto('/');
    const nombres = await page.evaluate(() =>
      [...document.querySelectorAll('#prueba-title')]
        .map((h) => h.closest('section'))
        .flatMap((s) => [...(s?.querySelectorAll('.ic-name') ?? [])])
        .map((n) => n.textContent?.trim() ?? '')
    );
    expect(nombres.length).toBeGreaterThanOrEqual(4);
    expect(new Set(nombres).size).toBe(nombres.length);
  });

  test('el nombre de la tarjeta no se estruja en móvil', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');

    /*
     * El defecto medido: con el nombre y la etiqueta de acceso en la misma
     * fila, «Amazon Q Developer» se partía letra a letra para dejarle sitio a
     * «Free tier». Se comprueba el ancho disponible, no la apariencia.
     */
    const anchos = await page.evaluate(() =>
      [...document.querySelectorAll('.ic-name')].map((n) => ({
        texto: n.textContent?.trim().slice(0, 24) ?? '',
        ancho: Math.round(n.getBoundingClientRect().width),
      }))
    );

    expect(anchos.length).toBeGreaterThan(0);
    for (const { texto, ancho } of anchos) {
      expect(ancho, `«${texto}» sólo dispone de ${ancho} px`).toBeGreaterThan(120);
    }
  });

  test('cada tarjeta lleva su distintivo visual', async ({ page }) => {
    await page.goto('/');
    const tarjetas = await page.locator('#prueba-title').locator('..').locator('..').locator('article.ic').count();
    const logos = await page.locator('article.ic .tool-logo').count();
    expect(logos, 'toda tarjeta necesita logo o monograma').toBeGreaterThanOrEqual(tarjetas);
  });

});

/*
 * Sin sembrar la decisión: así llega alguien la primera vez.
 *
 * Va en su propio `describe` porque el `beforeEach` de arriba siembra el
 * consentimiento con `addInitScript`, y eso sobrevive a `clearCookies()`: la
 * primera versión de estas dos pruebas no medía nada porque el banner nunca
 * llegaba a aparecer.
 */
test.describe('portada sin decisión de cookies', () => {
  test('el consentimiento no tapa la propuesta de valor', async ({ page }) => {
    /*
     * Sin sembrar la decisión: así es como llega alguien la primera vez.
     *
     * Era un diálogo con `aria-modal` y fondo oscuro a pantalla completa, y en
     * 375 px cubría el titular, la entradilla y el buscador enteros.
     */
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await page.waitForTimeout(400);

    const banner = page.locator('#consent-root');
    await expect(banner).toBeVisible();

    const medida = await page.evaluate(() => {
      const root = document.getElementById('consent-root');
      const h1 = document.querySelector('h1');
      const buscador = document.querySelector('.hero-search');
      return {
        altoBanner: root ? Math.round(root.getBoundingClientRect().height) : 0,
        viewport: window.innerHeight,
        topBanner: root ? Math.round(root.getBoundingClientRect().top) : 0,
        h1Bottom: h1 ? Math.round(h1.getBoundingClientRect().bottom) : 0,
        buscadorBottom: buscador ? Math.round(buscador.getBoundingClientRect().bottom) : 0,
        backdrop: !!document.querySelector('[data-consent-backdrop]'),
      };
    });

    expect(medida.backdrop, 'sin fondo bloqueante').toBe(false);
    expect(medida.altoBanner, 'la barra no puede ocupar media pantalla').toBeLessThan(
      medida.viewport * 0.65
    );
    expect(medida.h1Bottom, 'el titular tiene que quedar por encima de la barra').toBeLessThan(
      medida.topBanner
    );
    expect(medida.buscadorBottom, 'y el buscador también').toBeLessThan(medida.topBanner);
  });

  test('las dos opciones de consentimiento son igual de alcanzables', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await page.waitForTimeout(400);

    const aceptar = page.getByRole('button', { name: /aceptar todo/i });
    const rechazar = page.getByRole('button', { name: /rechazar todo/i });
    await expect(aceptar).toBeVisible();
    await expect(rechazar).toBeVisible();

    /*
     * Sólo los visibles: «Guardar selección» vive dentro del panel de
     * categorías, que arranca plegado, y medir su altura cero no dice nada
     * sobre lo que alguien puede pulsar.
     */
    const cajas = await page.evaluate(() =>
      [...document.querySelectorAll('#consent-root button')]
        .filter((x) => x.getBoundingClientRect().height > 0)
        .map((x) => Math.round(x.getBoundingClientRect().height))
    );
    expect(cajas.length, 'tiene que haber botones visibles').toBeGreaterThanOrEqual(2);
    for (const alto of cajas) expect(alto, 'objetivo táctil').toBeGreaterThanOrEqual(36);
  });
});
