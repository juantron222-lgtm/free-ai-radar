import { describe, expect, it } from 'vitest';
import { getAllTools, getPopulatedCategories } from '@lib/data/catalog';
import { buildSearchDocs, searchWithIntents } from '@lib/search/index';

/*
 * Búsquedas que alguien hizo de verdad y no encontraron nada.
 *
 * Salen de «Lo que buscan y no encuentran» en /admin/uso. Cada una que se
 * resuelve con una ficha nueva queda aquí, para que el hueco no vuelva a
 * abrirse sin que nadie se entere.
 */

const categorias = new Map(getPopulatedCategories().map((c) => [c.slug, c.name]));
const docs = buildSearchDocs(getAllTools(), (slug) => categorias.get(slug) ?? slug);
const primera = (q: string) => searchWithIntents(docs, q, { limit: 20 }).hits[0]?.slug;

describe('lo que vinieron a buscar y no estaba', () => {
  it('OpenCode (oct 2026: «opencode», «ipencode», «desarrollo con opencode»)', () => {
    expect(primera('opencode')).toBe('opencode');
    expect(primera('ipencode'), 'con la errata de una letra').toBe('opencode');
    expect(primera('desarrollo con opencode')).toBe('opencode');
  });
});
