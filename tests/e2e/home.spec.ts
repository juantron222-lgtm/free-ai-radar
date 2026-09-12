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

  test('las tres cosas que se pueden hacer están arriba, y la primera a mano', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');

    /*
     * La portada abría con un buscador, seis atajos de intención y seis
     * tarjetas: cuatro listas para el mismo viaje. Lo que tiene que quedar
     * claro arriba es qué se puede hacer aquí, y la acción principal —buscar—
     * tiene que estar a mano sin desplazar.
     */
    const puertas = page.locator('.puertas section h2');
    await expect(puertas).toHaveText([/encontrar una ia/i, /qué está pasando/i, /comparar/i]);

    const campo = page.locator('.buscar-form input[name="q"]');
    await expect(campo).toBeVisible();
    const fondo = await campo.evaluate((el) => el.getBoundingClientRect().bottom);
    expect(fondo, 'el campo de búsqueda cae por debajo del pliegue').toBeLessThan(812);
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

  test('la tabla de la portada enseña herramientas distintas', async ({ page }) => {
    await page.goto('/');
    const nombres = await page.locator('.evidencia tbody th a').allInnerTexts();
    expect(nombres.length, 'la portada debe enseñar varias fichas').toBeGreaterThanOrEqual(4);
    expect(new Set(nombres).size, `repetidas: ${nombres.join(', ')}`).toBe(nombres.length);
  });

  test('el nombre de la herramienta no se estruja en móvil', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');

    /*
     * El defecto medido en las tarjetas: con el nombre y la etiqueta de acceso
     * en la misma fila, «Amazon Q Developer» se partía letra a letra. La tabla
     * de la portada se apila en móvil justamente para que eso no pase; se
     * comprueba el ancho disponible, no la apariencia.
     */
    const anchos = await page.locator('.evidencia tbody th').evaluateAll((celdas) =>
      celdas.map((c) => ({
        texto: (c.textContent ?? '').trim().slice(0, 24),
        ancho: Math.round(c.getBoundingClientRect().width),
      }))
    );

    expect(anchos.length).toBeGreaterThan(0);
    for (const { texto, ancho } of anchos) {
      expect(ancho, `«${texto}» sólo dispone de ${ancho} px`).toBeGreaterThan(120);
    }
  });

  test('cada fila lleva a su ficha y contesta las tres condiciones', async ({ page }) => {
    await page.goto('/');
    const filas = page.locator('.evidencia tbody tr');
    const cuantas = await filas.count();
    expect(cuantas, 'la tabla necesita filas').toBeGreaterThanOrEqual(3);

    for (let i = 0; i < cuantas; i++) {
      await expect(filas.nth(i).locator('th a')).toHaveAttribute('href', /^\/herramientas\//);
      await expect(filas.nth(i).locator('.cond')).toHaveCount(3);
    }
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
      const buscador = document.querySelector('.buscar-form');
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
