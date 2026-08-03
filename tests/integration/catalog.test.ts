import { describe, expect, it } from 'vitest';
import {
  getAllTools,
  getAlternativesFor,
  getCatalogStats,
  getPopulatedCategories,
  getTool,
  getToolsByCategory,
} from '@lib/data/catalog';
import { getPopulatedCollections, getCollectionTools, COLLECTIONS } from '@lib/data/collections';
import { getCategory } from '@lib/domain/taxonomy';
import { ToolRecord } from '@lib/domain/tool';
import rawTools from '@/data/generated/tools.json';

/**
 * Integration tests over the real, committed dataset.
 *
 * These are the guards that stop a bad content edit reaching production: they
 * run against the same file the site builds from, not a fixture.
 */

describe('el dataset generado', () => {
  it('cumple el esquema', () => {
    const parsed = ToolRecord.array().safeParse(rawTools);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('\n');
      throw new Error(`El dataset no valida:\n${issues}`);
    }
    expect(parsed.success).toBe(true);
  });

  it('contiene herramientas', () => {
    expect(getAllTools().length).toBeGreaterThan(0);
  });

  it('no pierde ninguna herramienta del catálogo original', () => {
    // La migración partió de 22 fichas; perder alguna sería una regresión.
    expect(getAllTools().length).toBeGreaterThanOrEqual(22);
  });
});

describe('integridad referencial', () => {
  const tools = getAllTools();

  it('todos los slugs son únicos', () => {
    const slugs = tools.map((tool) => tool.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('todos los ids son únicos', () => {
    const ids = tools.map((tool) => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cada categoría existe en la taxonomía', () => {
    for (const tool of tools) {
      expect(getCategory(tool.categorySlug), `${tool.slug} → ${tool.categorySlug}`).toBeDefined();
    }
  });

  it('ninguna alternativa apunta a una ficha inexistente', () => {
    const known = new Set(tools.map((tool) => tool.slug));
    for (const tool of tools) {
      for (const alternative of tool.alternatives) {
        expect(known.has(alternative), `${tool.slug} → ${alternative}`).toBe(true);
      }
    }
  });

  it('ninguna herramienta se lista como alternativa de sí misma', () => {
    for (const tool of tools) {
      expect(tool.alternatives).not.toContain(tool.slug);
    }
  });

  it('todas las URLs oficiales son HTTPS', () => {
    for (const tool of tools) {
      expect(tool.officialUrl.startsWith('https://'), `${tool.slug}`).toBe(true);
    }
  });

  it('las fechas son coherentes: verificación posterior o igual a la detección', () => {
    for (const tool of tools) {
      expect(tool.lastVerifiedAt >= tool.detectedAt, `${tool.slug}`).toBe(true);
    }
  });
});

describe('honestidad de los datos', () => {
  const tools = getAllTools();

  it('cada ficha tiene al menos una fuente citable', () => {
    for (const tool of tools) {
      expect(tool.sources.length, `${tool.slug} no tiene fuentes`).toBeGreaterThan(0);
    }
  });

  it('cada ficha tiene un resumen del plan gratuito', () => {
    for (const tool of tools) {
      expect(tool.freePlan.summary.length, `${tool.slug}`).toBeGreaterThan(0);
    }
  });

  it('la puntuación es siempre derivada y está en rango', () => {
    for (const tool of tools) {
      expect(tool.scoreTotal).toBeGreaterThanOrEqual(0);
      expect(tool.scoreTotal).toBeLessThanOrEqual(100);
      expect(tool.scoreTotal).toBe(tool.scoreBreakdown.total);
    }
  });

  it('ninguna ficha promete "sin tarjeta" sin haberlo verificado', () => {
    for (const tool of tools) {
      if (tool.badges.includes('Sin tarjeta')) {
        expect(tool.freePlan.requiresCreditCard, `${tool.slug}`).toBe('no');
      }
    }
  });
});

describe('categorías', () => {
  it('sólo se publican categorías con contenido', () => {
    for (const category of getPopulatedCategories()) {
      expect(category.count).toBeGreaterThan(0);
      expect(getToolsByCategory(category.slug).length).toBe(category.count);
    }
  });

  it('cada herramienta aparece en su categoría', () => {
    for (const tool of getAllTools()) {
      const inCategory = getToolsByCategory(tool.categorySlug);
      expect(inCategory.map((t) => t.slug)).toContain(tool.slug);
    }
  });
});

describe('alternativas', () => {
  it('siempre ofrece algo, nunca un bloque vacío', () => {
    for (const tool of getAllTools()) {
      const alternatives = getAlternativesFor(tool);
      expect(alternatives.length, `${tool.slug}`).toBeGreaterThan(0);
    }
  });

  it('nunca se incluye a sí misma', () => {
    for (const tool of getAllTools()) {
      expect(getAlternativesFor(tool).map((t) => t.slug)).not.toContain(tool.slug);
    }
  });
});

describe('colecciones', () => {
  it('cada colección publicada tiene al menos dos herramientas', () => {
    for (const collection of getPopulatedCollections()) {
      expect(collection.count).toBeGreaterThanOrEqual(2);
    }
  });

  it('cada herramienta de una colección cumple realmente su regla', () => {
    for (const collection of COLLECTIONS) {
      for (const tool of getCollectionTools(collection)) {
        expect(collection.match(tool), `${tool.slug} en ${collection.slug}`).toBe(true);
      }
    }
  });

  it('la colección "sin tarjeta" excluye lo no verificado', () => {
    const collection = COLLECTIONS.find((c) => c.slug === 'sin-tarjeta')!;
    for (const tool of getCollectionTools(collection)) {
      expect(tool.freePlan.requiresCreditCard).toBe('no');
    }
  });
});

describe('estadísticas', () => {
  it('los recuentos cuadran con el catálogo', () => {
    const stats = getCatalogStats();
    const tools = getAllTools();

    expect(stats.total).toBe(tools.length);
    expect(stats.noCard).toBe(
      tools.filter((tool) => tool.freePlan.requiresCreditCard === 'no').length
    );
    expect(stats.openSource).toBe(tools.filter((tool) => tool.openSource === 'yes').length);
  });
});

describe('getTool', () => {
  it('encuentra por slug', () => {
    const first = getAllTools()[0]!;
    expect(getTool(first.slug)?.slug).toBe(first.slug);
  });

  it('devuelve undefined para un slug inexistente', () => {
    expect(getTool('no-existe-esta-herramienta')).toBeUndefined();
  });
});
