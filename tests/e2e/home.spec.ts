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

  test('la primera pantalla pregunta y deja elegir entre las seis verticales', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');

    /*
     * Una pregunta, seis respuestas y un buscador. Sin fecha, sin cifras y sin
     * párrafos antes de poder elegir: eso empieza después de esta pantalla.
     */
    await expect(page.locator('h1')).toHaveText('¿Qué clase de IA estás buscando?');

    const verticales = page.getByRole('navigation', { name: 'Elegir por clase de IA' }).getByRole('link');
    await expect(verticales).toHaveText([/Imagen/, /Vídeo/, /Audio/, /Agentes/, /Modelos/, /Código/]);
    const hrefs = await verticales.evaluateAll((enlaces) => enlaces.map((a) => a.getAttribute('href')));
    expect(hrefs).toEqual(['/imagen', '/video', '/audio', '/agentes', '/modelos', '/codigo']);

    const fondo = await verticales.last().evaluate((el) => el.getBoundingClientRect().bottom);
    expect(fondo, 'la sexta vertical cae por debajo del pliegue').toBeLessThan(812);

    const hero = page.locator('.hero');
    await expect(hero.getByRole('search')).toBeVisible();
    await expect(hero).not.toContainText(/revisado|verificad|metodolog/i);

    // Las tres puertas siguen, después de la primera pantalla.
    await expect(page.locator('.puertas section h2')).toHaveText([/encontrar una ia/i, /qué está pasando/i, /comparar/i]);
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

  test('en la portada sólo hay un buscador, el de la hero', async ({ page }) => {
    /*
     * Había tres: la cabecera, la hero y la puerta «Encontrar una IA». En el
     * resto del sitio la cabecera conserva el suyo.
     */
    for (const ancho of [375, 1280]) {
      await page.setViewportSize({ width: ancho, height: 900 });
      await page.goto('/');
      await expect(page.locator('main [role="search"]'), `a ${ancho} px`).toHaveCount(1);
      await expect(page.locator('.site-header .header-search')).toHaveCount(0);
      await expect(page.locator('#search-toggle')).toHaveCount(0);
      await expect(page.locator('.hero [role="search"] input[name="q"]')).toBeVisible();
    }

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/comparar');
    await expect(page.locator('.site-header .header-search')).toBeVisible();
  });

  test('las seis verticales no se repiten más abajo', async ({ page }) => {
    await page.goto('/');
    for (const ruta of ['/imagen', '/video', '/audio', '/agentes', '/modelos', '/codigo']) {
      await expect(page.locator(`main a[href="${ruta}"]`), ruta).toHaveCount(1);
    }
  });

  test('«Encontrar una IA» filtra, recomienda y lleva al catálogo', async ({ page }) => {
    await page.goto('/');
    const puerta = page.locator('.puerta-buscar');

    const filtros = puerta.getByRole('navigation', { name: 'Filtros rápidos' }).getByRole('link');
    await expect(filtros).toHaveText([/Sin tarjeta\s*\d+/, /Sin registro\s*\d+/, /Uso comercial\s*\d+/, /Open source\s*\d+/]);
    const hrefs = await filtros.evaluateAll((enlaces) => enlaces.map((a) => a.getAttribute('href')));
    expect(hrefs).toEqual(['/herramientas?nocard=1', '/herramientas?nosignup=1', '/herramientas?comm=1', '/herramientas?oss=1']);

    await expect(puerta.getByRole('link', { name: /Ver todas las herramientas/ })).toHaveAttribute('href', '/herramientas');

    // Y cada filtro es una URL del catálogo, no un formulario.
    await filtros.first().click();
    await expect(page).toHaveURL(/\/herramientas\?nocard=1$/);
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

    /*
     * «Para empezar hoy, sin pagar» enseñaba «Sin verificar» en tarjeta. Ahora
     * tarjeta y registro están comprobados en todas las filas, y lo que falte
     * en uso comercial dice de quién es el hueco.
     */
    const tabla = page.locator('.evidencia');
    await expect(tabla).not.toContainText('Sin verificar');
    for (const columna of ['Tarjeta', 'Registro']) {
      const celdas = await tabla.locator(`td[data-etiqueta="${columna}"]`).allInnerTexts();
      expect(celdas.length).toBe(cuantas);
      for (const texto of celdas) {
        expect(['Sí', 'No'], `${columna}: «${texto}»`).toContain(texto.trim());
      }
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
      const buscador = document.querySelector('.hero-verticales');
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
    expect(medida.buscadorBottom, 'y las seis verticales también').toBeLessThan(medida.topBanner);
  });

  test('el cartel de cookies no tapa el pie: la página le reserva su sitio', async ({ page }) => {
    /*
     * La barra es `position: fixed`, así que no ocupaba sitio en el flujo y
     * cubría el pie entero en la primera visita, que es justo cuando alguien
     * busca quién está detrás. Mientras está puesta, la página reserva abajo su
     * altura exacta.
     */
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await expect(page.locator('#consent-root')).toBeVisible();

    /*
     * Al final de la página, sin animación: Firefox desplaza suave y a los
     * 300 ms todavía no había llegado, así que la medida salía del medio.
     */
    await expect
      .poll(async () =>
        page.evaluate(() => {
          window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
          const pie = document.querySelector('.site-footer')!.getBoundingClientRect();
          const panel = document.querySelector('.consent-panel')!.getBoundingClientRect();
          return pie.bottom - panel.top;
        }),
        { message: 'el pie queda por encima del cartel' }
      )
      .toBeLessThanOrEqual(1);

    await page.getByRole('button', { name: /rechazar todo/i }).click();
    await expect(page.locator('#consent-root')).toBeHidden();
    const reservado = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--consent-alto').trim()
    );
    expect(reservado, 'al cerrarse devuelve el espacio').toBe('0px');
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
