import { test, expect } from '@playwright/test';

/**
 * Ningún enlace ni negrita se come el espacio de delante o de detrás.
 *
 * Astro recorta el salto de línea entre una frase y el elemento de la línea
 * siguiente, así que `sin avisar:⏎<a>avísanos</a>` se lee «sin avisar:avísanos».
 * No se ve en el código y sí en la página. La ficha tenía cuatro y el comparador
 * uno («yNo aplica»); se arreglan con `{' '}` y esta prueba los busca en el DOM
 * ya renderizado, que es donde aparecen.
 */

const RUTAS = [
  '/',
  '/herramientas',
  '/herramientas/chatgpt',
  '/imagen',
  '/codigo',
  '/comparar?t=chatgpt,claude',
  '/noticias',
  '/noticias/accomplish-sandbox-claude-code-cursor',
];

for (const ruta of RUTAS) {
  test(`${ruta} no pega palabras a sus enlaces`, async ({ page }) => {
    await page.goto(ruta);
    // En frío, el servidor de desarrollo puede recargar la página una vez al
    // optimizar dependencias; se lee el DOM cuando ya no queda nada en vuelo.
    await page.waitForLoadState('networkidle');
    const pegadas = await page.evaluate(() => {
      const INLINE = new Set(['A', 'STRONG', 'EM', 'CODE', 'TIME', 'B', 'I', 'ABBR']);
      const out: string[] = [];
      for (const el of document.querySelectorAll('main *')) {
        if (!INLINE.has(el.tagName)) continue;
        const texto = el.textContent ?? '';
        if (!texto.trim()) continue;
        const antes = el.previousSibling;
        if (antes?.nodeType === Node.TEXT_NODE && /[\p{L}\p{N},:;]$/u.test(antes.textContent ?? '') && /^[\p{L}\p{N}«¿¡]/u.test(texto)) {
          out.push(`…${(antes.textContent ?? '').slice(-20)}|${texto.slice(0, 20)}`);
        }
        const despues = el.nextSibling;
        if (despues?.nodeType === Node.TEXT_NODE && /[\p{L}\p{N}»]$/u.test(texto) && /^[\p{L}\p{N}«]/u.test(despues.textContent ?? '')) {
          out.push(`${texto.slice(-20)}|${(despues.textContent ?? '').slice(0, 20)}…`);
        }
      }
      return out;
    });
    expect(pegadas, pegadas.join('\n')).toEqual([]);
  });
}
