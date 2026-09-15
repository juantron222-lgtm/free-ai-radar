import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
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
  it('casi todas tienen alguna, pero ninguna se rellena con lo que no hace lo mismo', () => {
    /*
     * La prueba decía «siempre ofrece algo, nunca un bloque vacío», y así fue
     * como ChatGPT acabó con Hugging Face Spaces y LM Studio de alternativas.
     * Ahora se admite un bloque vacío; lo que no se admite es un relleno que
     * no comparte tarea ni categoría.
     */
    const tools = getAllTools();
    const vacias = tools.filter((t) => getAlternativesFor(t).length === 0);
    expect(vacias.length, vacias.map((t) => t.slug).join(', ')).toBeLessThanOrEqual(Math.ceil(tools.length * 0.05));

    for (const tool of tools) {
      for (const alt of getAlternativesFor(tool)) {
        if (tool.alternatives.includes(alt.slug)) continue;
        const comparten = alt.capabilities.some((c) => tool.capabilities.includes(c));
        const categoria = alt.categorySlug === tool.categorySlug || alt.secondaryCategories.includes(tool.categorySlug);
        expect(comparten || categoria, `${tool.slug} → ${alt.slug}`).toBe(true);
      }
    }
  });

  it('a ChatGPT no le salen piezas ni modelos por API, y a Lovable no le salen copilotos', () => {
    const chatgpt = getAlternativesFor(getAllTools().find((t) => t.slug === 'chatgpt')!).map((t) => t.slug);
    expect(chatgpt).not.toContain('hugging-face-spaces');
    expect(chatgpt).not.toContain('lm-studio');
    for (const slug of chatgpt) {
      expect(getAllTools().find((t) => t.slug === slug)!.kind, slug).not.toBe('model');
    }
    const lovable = getAlternativesFor(getAllTools().find((t) => t.slug === 'lovable')!);
    for (const alt of lovable) expect(alt.productType ?? 'app-builder', alt.slug).toBe('app-builder');
  });

  it('el orden no depende de la vieja nota sobre 100', () => {
    expect(readFileSync('src/lib/data/afinidad.ts', 'utf8')).not.toContain('scoreTotal');
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
