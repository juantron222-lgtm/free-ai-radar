import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { seedConsent } from './helpers';

/**
 * La política de producción, aplicada aquí.
 *
 * Esta suite existe por un fallo que estuvo publicado y verde a la vez. Un
 * `<script>` en línea del explorador de herramientas quedaba bloqueado en
 * producción por `script-src 'self'`, y las mil pruebas pasaban porque el
 * servidor de desarrollo no manda cabecera CSP: el navegador de los tests
 * ejecutaba felizmente lo que el navegador de un lector no ejecutaba nunca.
 * Nadie se enteró hasta abrir producción a mano.
 *
 * Una prueba que sólo mirase el código fuente buscando `<script>` en línea
 * habría cazado ese caso y ninguno más. Esto hace lo otro: coge la cabecera
 * literal de `vercel.json`, se la pone a cada documento y deja que el navegador
 * la aplique. Lo que aquí no rompe, en producción tampoco.
 */

/** La CSP tal cual la sirve Vercel, leída de la misma fuente que la sirve. */
function cspDeProduccion(): string {
  const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
  const global = config.headers.find((h: { source: string }) => h.source === '/(.*)');
  const csp = global?.headers.find(
    (h: { key: string }) => h.key.toLowerCase() === 'content-security-policy'
  );
  if (!csp) throw new Error('vercel.json ya no define Content-Security-Policy en «/(.*)»');

  /*
   * `upgrade-insecure-requests` se cae, y sólo ésa.
   *
   * Es una directiva de transporte, no de contenido: reescribe cada petición
   * http:// a https://, que en producción es correcto y contra un servidor
   * local en http rompe la carga entera. No tiene nada que ver con lo que esta
   * suite vigila, que es qué código se deja ejecutar.
   */
  return csp.value
    .split(';')
    .map((d: string) => d.trim())
    .filter((d: string) => d && d !== 'upgrade-insecure-requests')
    .join('; ');
}

const CSP = cspDeProduccion();

/**
 * Las rutas donde un bloqueo se notaría.
 *
 * Una de cada clase de página, más las dos del explorador, que son las que
 * fallaron. No es el catálogo entero a propósito: la CSP es la misma para todo
 * el sitio y lo que se comprueba es la plantilla, no cada ficha.
 */
const RUTAS = [
  '/',
  '/herramientas',
  '/herramientas?q=ideogram',
  '/imagen',
  '/video',
  '/audio',
  '/codigo',
  '/modelos',
  '/agentes',
  '/comparar',
  '/categorias',
  '/colecciones',
  '/noticias',
  '/herramientas/ideogram',
  '/herramientas/clipdrop',
  '/pro',
  '/metodologia',
  '/cuenta/entrar',
  '/cuenta/crear',
];

test.describe('la CSP de producción no bloquea nada nuestro', () => {
  for (const ruta of RUTAS) {
    test(`${ruta} carga entera bajo la política real`, async ({ page }) => {
      const bloqueos: string[] = [];
      page.on('console', (msg) => {
        const texto = msg.text();
        if (/content security policy/i.test(texto)) bloqueos.push(texto);
      });

      /*
       * El documento se vuelve a servir con la cabecera puesta. Interceptar
       * sólo el documento basta: la CSP que él trae gobierna también a todo lo
       * que cuelgue de él.
       */
      await page.route('**/*', async (route) => {
        if (route.request().resourceType() !== 'document') return route.fallback();
        const respuesta = await route.fetch();
        await route.fulfill({
          response: respuesta,
          headers: { ...respuesta.headers(), 'content-security-policy': CSP },
        });
      });

      await seedConsent(page);
      const respuesta = await page.goto(ruta, { waitUntil: 'load' });
      expect(respuesta?.status(), ruta).toBeLessThan(400);
      await page.waitForTimeout(600);

      expect(bloqueos, `${ruta} ejecuta algo que producción bloquea:\n${bloqueos.join('\n')}`).toEqual(
        []
      );
    });
  }

  test('el velo anti-destello sobrevive a la política', async ({ page }) => {
    /*
     * No basta con que no haya error: el guardia tiene que hacer su trabajo.
     * Bloqueado, la rejilla nace visible y quien llega con `?q=` ve el catálogo
     * entero durante unos fotogramas antes de que salte a su respuesta.
     *
     * El velo se pone y se quita en cuestión de milisegundos —ése es el punto—,
     * así que preguntar «¿está puesto?» cada pocos milisegundos es una carrera
     * que se pierde: en Firefox el módulo lo había quitado antes del primer
     * sondeo. Se observa en vez de sondear. Un `MutationObserver` instalado
     * antes que cualquier script de la página anota si la clase llegó a estar,
     * y eso ya no depende de cuándo miremos.
     */
    await page.addInitScript(() => {
      const w = window as unknown as { __veloVisto?: boolean };
      w.__veloVisto = false;
      const anotar = () => {
        if (document.documentElement?.classList.contains('far-filtrando')) w.__veloVisto = true;
      };
      anotar();
      new MutationObserver(anotar).observe(document, {
        attributes: true,
        subtree: true,
        attributeFilter: ['class'],
      });
    });

    await page.route('**/*', async (route) => {
      if (route.request().resourceType() !== 'document') return route.fallback();
      const respuesta = await route.fetch();
      await route.fulfill({
        response: respuesta,
        headers: { ...respuesta.headers(), 'content-security-policy': CSP },
      });
    });

    await seedConsent(page);
    await page.goto('/herramientas?q=ideogram', { waitUntil: 'load' });

    const seVio = await page.evaluate(
      () => (window as unknown as { __veloVisto?: boolean }).__veloVisto
    );
    expect(seVio, 'el velo nunca llegó a aplicarse: el catálogo entero se ve antes de filtrar').toBe(
      true
    );

    // Y se levanta solo cuando ya hay algo real que enseñar.
    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains('far-filtrando')), {
        message: 'el velo se quedó puesto: la rejilla no se destapa nunca',
        timeout: 8000,
      })
      .toBe(false);
    await expect(page.locator('[data-result-item]:visible')).not.toHaveCount(0);
  });
});
