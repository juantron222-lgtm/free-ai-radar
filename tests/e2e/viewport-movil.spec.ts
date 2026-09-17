import { test, expect } from '@playwright/test';

/**
 * En un móvil, el viewport de diseño no crece.
 *
 * Las pruebas de desborde comparaban `scrollWidth` con `innerWidth`, y en un
 * móvil `innerWidth` es el viewport de diseño: si algo ensancha la página, los
 * dos crecen juntos y la resta sigue dando cero. Así pasó en `/herramientas`:
 * las casillas `sr-only` de la fila de filtros se posicionaban respecto a la
 * página y la dejaban en 642 px con la pantalla en 375. Aquí se compara con el
 * ancho de la pantalla, que no se mueve.
 */

/*
 * Las páginas de texto largo también: /legal/privacidad desplazaba 156 px de
 * lado por una tabla y ninguna prueba lo miraba.
 */
const RUTAS = [
  '/',
  '/herramientas',
  '/imagen',
  '/herramientas/chatgpt',
  '/comparar?t=chatgpt,claude',
  '/noticias',
  '/legal/privacidad',
  '/legal/cookies',
  '/metodologia',
  '/politica-editorial',
];

test.describe('móvil de 375 px con viewport real', () => {
  test.skip(({ browserName }) => browserName === 'firefox', 'Firefox no emula el viewport de móvil');
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  for (const ruta of RUTAS) {
    test(`${ruta} no ensancha el viewport de diseño`, async ({ page }) => {
      await page.goto(ruta);
      await page.waitForLoadState('networkidle');
      const medida = await page.evaluate(() => ({
        diseño: window.innerWidth,
        documento: document.documentElement.scrollWidth,
      }));
      expect(medida.diseño, `${ruta} lleva el viewport a ${medida.diseño} px`).toBe(375);
      expect(medida.documento).toBeLessThanOrEqual(375);
    });
  }
});
