import { test, expect } from '@playwright/test';
import { seedConsent } from './helpers';

/**
 * El encabezado de /imagen no puede volver a comerse la primera pantalla.
 *
 * La página promete «genera imágenes gratis ahora». Si para ver la primera
 * herramienta hay que desplazarse, la promesa la cumple el segundo viewport, y
 * en un móvil pequeño eso es tanto como no cumplirla. Medido a 375 px, la
 * primera tarjeta llegó a arrancar a 523 px: en un iPhone SE quedaban 144 px
 * visibles de una tarjeta de 238.
 *
 * Es una regresión fácil y silenciosa —basta con añadir una frase al
 * encabezado— y ninguna prueba de las que había la habría notado: el HTML
 * seguiría siendo correcto, los datos también, y el alto no lo mira nadie.
 *
 * **Umbral con holgura a propósito.** 420 px, no el valor exacto de hoy. Esto
 * vigila que la primera herramienta siga alcanzable, no congela la maqueta: una
 * palabra más en el título o un ajuste de interlineado son cambios legítimos y
 * no deben poner la suite en rojo.
 */

const ANCHO = 375;
const ALTO = 667;

/** Por encima de esto, la primera herramienta deja de estar al alcance. */
const TOPE_PX = 420;

/*
 * Sólo el ancho: `isMobile` no lo admite Firefox y aquí no hace falta. Lo que
 * se mide es cómo cae el texto en 375 px, y eso lo decide el ancho.
 */
test.use({ viewport: { width: ANCHO, height: ALTO } });

test.describe(`/imagen en ${ANCHO}×${ALTO}`, () => {
  test.beforeEach(async ({ page }) => {
    // El diálogo de consentimiento es modal y taparía lo que se está midiendo.
    await seedConsent(page);
    await page.goto('/imagen');
  });

  test('la primera herramienta gratuita empieza dentro de la primera pantalla', async ({ page }) => {
    /*
     * Selectores por rol y nombre accesible, no por clase.
     *
     * La sección lleva `aria-labelledby`, así que es una región con nombre; las
     * tarjetas son `<article>`. Las dos cosas describen lo que el documento
     * *es*, y sobreviven a un cambio de nombre de clase o de hoja de estilos —
     * que es justo lo que esta prueba no debería vigilar.
     */
    const bloque = page.getByRole('region', { name: /genera imágenes gratis ahora/i });
    await expect(bloque, 'el bloque «Genera imágenes gratis ahora» debe existir').toBeVisible();

    const primera = bloque.getByRole('article').first();
    await expect(primera, 'el bloque debe traer al menos una herramienta').toBeVisible();

    const top = await primera.evaluate((el) => Math.round(el.getBoundingClientRect().top + window.scrollY));

    expect(
      top,
      `La primera herramienta arranca a ${top} px del principio del documento. ` +
        `Por encima de ${TOPE_PX} px el lector de un móvil pequeño llega al primer ` +
        `resultado sin verlo. Revisa el encabezado de /imagen: título, entradilla, ` +
        `fila de atajos y los huecos de la consulta @media (max-width: 600px).`
    ).toBeLessThanOrEqual(TOPE_PX);
  });

  test('el documento no se desborda en horizontal', async ({ page }) => {
    const { scroll, ancho, culpables } = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      ancho: window.innerWidth,
      // Quién se sale, para no tener que buscarlo a mano cuando falle.
      culpables: [...document.querySelectorAll('main *')]
        .filter((el) => {
          const box = el.getBoundingClientRect();
          if (box.width === 0) return false;
          // Un hijo que se sale de un contenedor que se desplaza es correcto.
          const scroller = el.closest('[data-scroll-x], nav');
          if (scroller && scroller.scrollWidth > scroller.clientWidth) return false;
          return box.right > window.innerWidth + 1;
        })
        .slice(0, 5)
        .map((el) => el.tagName.toLowerCase() + '.' + (typeof el.className === 'string' ? el.className : '')),
    }));

    expect(culpables, 'elementos que sobresalen del viewport').toEqual([]);
    expect(scroll, 'la página no debe poder desplazarse en horizontal').toBeLessThanOrEqual(ancho);
  });

  test('los atajos se desbordan dentro de su fila, no de la página', async ({ page }) => {
    const atajos = page.getByRole('navigation', { name: 'Ir a un bloque' });
    await expect(atajos).toBeVisible();

    const medida = await atajos.evaluate((el) => ({
      contenido: el.scrollWidth,
      caja: el.clientWidth,
      desplazable: getComputedStyle(el).overflowX,
      documento: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));

    /*
     * Las dos mitades de la misma afirmación, y ninguna sirve sola: que la fila
     * se desborde por dentro es lo que la convierte en una fila que se desplaza
     * en vez de dos que se apilan; que el documento no se desborde es lo que
     * impide que eso se pague con un desplazamiento lateral de toda la página.
     */
    expect(medida.desplazable, 'la fila de atajos debe poder desplazarse').toBe('auto');
    expect(
      medida.contenido,
      'los cinco atajos deben ocupar más que su caja: si caben, ya no es una fila que se desplaza'
    ).toBeGreaterThan(medida.caja);
    expect(medida.documento, 'y el documento debe seguir sin desbordarse').toBeLessThanOrEqual(
      medida.viewport
    );
  });
});
