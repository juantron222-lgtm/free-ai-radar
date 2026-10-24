import { describe, expect, it } from 'vitest';
import { getAllTools, getToolsByCategory, getPopulatedCategories } from '@lib/data/catalog';
import { applyFilters, EMPTY_FILTERS } from '@lib/search/filters';
import { buildClientIndex } from '@lib/search/client-index';
import { getCollection, getCollectionTools } from '@lib/data/collections';
import { CAPACIDADES_DE_MEDIOS, produceMedios } from '@lib/domain/medios';

/**
 * «Sin marca de agua» sólo entre lo que produce imagen, vídeo o audio.
 *
 * El 23 de octubre de 2026 el filtro devolvía 18 fichas y 14 eran de código o
 * de agentes: no ponen marca de agua porque no generan nada que marcar. Quien
 * pulsa la casilla busca un generador que entregue el resultado limpio (Juan,
 * 24 de octubre de 2026). Estas pruebas fijan que todas las vistas usan la
 * misma lista y que ninguna vuelve a colar lo que no aplica.
 */

const tools = getAllTools();
const deMedios = tools.filter((t) => produceMedios(t.capabilities));

describe('la marca de agua sólo se pregunta a lo que produce medios', () => {
  it('el filtro devuelve sólo herramientas de medios con el «no» confirmado', () => {
    const r = applyFilters(tools, { ...EMPTY_FILTERS, noWatermark: true });
    expect(r.length).toBeGreaterThan(0);
    for (const t of r) {
      expect(produceMedios(t.capabilities), t.slug).toBe(true);
      expect(t.freePlan.hasWatermark, t.slug).toBe('no');
    }
    expect(r.length).toBe(deMedios.filter((t) => t.freePlan.hasWatermark === 'no').length);
  });

  it('«marca de agua comprobada» tampoco cuela lo que no aplica', () => {
    const r = applyFilters(tools, { ...EMPTY_FILTERS, watermarkKnown: true });
    for (const t of r) {
      expect(produceMedios(t.capabilities), t.slug).toBe(true);
      expect(t.freePlan.hasWatermark, t.slug).not.toBe('unverified');
    }
  });

  it('el navegador filtra igual que el servidor', () => {
    const indice = buildClientIndex(tools, (s) => s);
    for (const flag of ['noWatermark', 'watermarkKnown'] as const) {
      const servidor = applyFilters(tools, { ...EMPTY_FILTERS, [flag]: true }).map((t) => t.slug).sort();
      const cliente = applyFilters(indice, { ...EMPTY_FILTERS, [flag]: true }).map((t) => t.slug).sort();
      expect(cliente, flag).toEqual(servidor);
    }
  });

  it('la colección «sin marca de agua» y las páginas de categoría usan la misma regla', () => {
    const coleccion = getCollection('sin-marca-de-agua');
    if (coleccion) for (const t of getCollectionTools(coleccion)) expect(produceMedios(t.capabilities), t.slug).toBe(true);
    for (const categoria of getPopulatedCategories()) {
      const propias = getToolsByCategory(categoria.slug);
      const r = applyFilters(propias, { ...EMPTY_FILTERS, noWatermark: true });
      for (const t of r) expect(produceMedios(t.capabilities), `${categoria.slug} · ${t.slug}`).toBe(true);
    }
  });

  it('la lista sólo tiene capacidades que producen un archivo', () => {
    for (const c of ['code-generation', 'text-generation', 'tool-use', 'transcription', 'api']) {
      expect(CAPACIDADES_DE_MEDIOS as readonly string[], c).not.toContain(c);
    }
  });
});
