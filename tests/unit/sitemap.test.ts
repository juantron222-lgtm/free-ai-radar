import { describe, expect, it } from 'vitest';
import { GET } from '../../src/pages/sitemap.xml';
import { getAllNews } from '@lib/data/news';
import { getToolsByCategory } from '@lib/data/catalog';
import { getCollection, getCollectionTools } from '@lib/data/collections';
import { FOOTER_NAV, ROUTES } from '@lib/nav';

/**
 * La fecha de una página es la de lo que enseña.
 *
 * El mapa decía que la portada y el catálogo eran del 30 de agosto mientras la
 * portada publicaba noticias del 12 de septiembre, y las verticales y las
 * colecciones iban sin fecha. Un `lastmod` que se queda corto le dice al
 * buscador que no vuelva.
 */

const xml = await (await GET({} as never)).text();

function entrada(path: string): { loc: string; lastmod?: string } {
  const bloque = xml
    .split('<url>')
    .find((b) => b.includes(`<loc>https://www.freeairadar.com${path}</loc>`));
  expect(bloque, `${path} no está en el sitemap`).toBeTruthy();
  return { loc: path, lastmod: bloque!.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] };
}

const masReciente = (lista: readonly { lastVerifiedAt: string }[]): string =>
  lista.reduce((acc, t) => (t.lastVerifiedAt > acc ? t.lastVerifiedAt : acc), '');

describe('el sitemap fecha lo que cada página enseña', () => {
  it('la portada no es más vieja que la última noticia que publica', () => {
    const noticias = getAllNews().reduce((acc, n) => (n.checkedAt > acc ? n.checkedAt : acc), '');
    expect(noticias).toBeTruthy();
    expect(entrada('/').lastmod! >= noticias, `portada: ${entrada('/').lastmod} < ${noticias}`).toBe(true);
  });

  it('cada vertical lleva la fecha de su ficha más reciente', () => {
    for (const [ruta, categorias] of [
      ['/imagen', ['imagen']],
      ['/video', ['video']],
      ['/audio', ['musica', 'voz']],
      ['/codigo', ['codigo']],
      ['/agentes', ['agentes']],
      ['/modelos', ['modelos']],
    ] as const) {
      const fichas = categorias.flatMap((c) => getToolsByCategory(c));
      expect(entrada(ruta).lastmod, ruta).toBe(masReciente(fichas));
    }
  });

  it('las colecciones del mapa llevan fecha', () => {
    for (const slug of ['sin-tarjeta', 'uso-comercial', 'en-local', 'para-creadores']) {
      const coleccion = getCollection(slug)!;
      expect(entrada(ROUTES.collection(slug)).lastmod, slug).toBe(masReciente(getCollectionTools(coleccion)));
    }
  });

  it('ninguna URL aparece dos veces', () => {
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(new Set(locs).size).toBe(locs.length);
  });
});

describe('nada indexable se queda sin enlace', () => {
  it('/guias se enlaza desde el pie, que es lo que la sacaba del sitio', () => {
    /*
     * Estaba en el sitemap y no la enlazaba nada: una página que sólo existe
     * para los buscadores.
     */
    const enlaces = FOOTER_NAV.flatMap((s) => s.items).map((i) => i.href);
    expect(enlaces).toContain(ROUTES.guides);
    expect(entrada(ROUTES.guides).loc).toBe(ROUTES.guides);
  });
});
