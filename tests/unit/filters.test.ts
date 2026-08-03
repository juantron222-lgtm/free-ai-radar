import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTERS,
  applyFilters,
  countActiveFilters,
  describeFilters,
  isDefaultFilters,
  parseFilters,
  serializeFilters,
  sortTools,
} from '@lib/search/filters';
import { makeTool } from '../fixtures/tool';

const tools = [
  makeTool({
    slug: 'sin-tarjeta',
    name: 'Sin Tarjeta',
    categorySlug: 'imagen',
    freeModel: 'free_real',
    scores: { freeReal: 9, usefulness: 9, ease: 9, transparency: 9, creatorValue: 9 },
  }),
  makeTool({
    slug: 'con-tarjeta',
    name: 'Con Tarjeta',
    categorySlug: 'video',
    freeModel: 'trial',
    freePlan: {
      summary: 'x',
      limits: [],
      requiresSignup: 'yes',
      requiresCreditCard: 'yes',
      hasWatermark: 'yes',
      commercialUse: 'no',
      creditReset: 'none',
      verifiedAt: '2026-07-01',
    },
    scores: { freeReal: 3, usefulness: 6, ease: 6, transparency: 4, creatorValue: 3 },
  }),
  makeTool({
    slug: 'incognita',
    name: 'Incógnita',
    categorySlug: 'imagen',
    freeModel: 'freemium',
    freePlan: {
      summary: 'x',
      limits: [],
      requiresSignup: 'unverified',
      requiresCreditCard: 'unverified',
      hasWatermark: 'unverified',
      commercialUse: 'unverified',
      creditReset: 'none',
      verifiedAt: '2026-07-01',
    },
    scores: { freeReal: 6, usefulness: 6, ease: 6, transparency: 5, creatorValue: 5 },
  }),
  makeTool({
    slug: 'local-oss',
    name: 'Local OSS',
    categorySlug: 'herramientas-locales',
    freeModel: 'open_source',
    openSource: 'yes',
    hosting: 'local',
    platforms: ['windows', 'linux'],
    skillLevel: 'advanced',
    detectedAt: '2026-06-01',
    scores: { freeReal: 10, usefulness: 8, ease: 4, transparency: 9, creatorValue: 8 },
  }),
];

describe('parseFilters / serializeFilters', () => {
  it('el estado vacío produce una query vacía', () => {
    expect(serializeFilters(EMPTY_FILTERS)).toBe('');
    expect(isDefaultFilters(EMPTY_FILTERS)).toBe(true);
  });

  it('ida y vuelta conserva el estado', () => {
    const state = {
      ...EMPTY_FILTERS,
      q: 'imagen',
      categories: ['imagen', 'video'],
      freeModels: ['free_real' as const],
      noCard: true,
      commercial: true,
      minScore: 60,
      sort: 'verified' as const,
    };

    expect(parseFilters(serializeFilters(state))).toEqual(state);
  });

  it('ignora un orden desconocido y cae al de por defecto', () => {
    expect(parseFilters('sort=inventado').sort).toBe('score');
  });

  it('limita la puntuación mínima al rango válido', () => {
    expect(parseFilters('min=500').minScore).toBe(100);
    expect(parseFilters('min=-20').minScore).toBe(0);
    expect(parseFilters('min=abc').minScore).toBe(0);
  });

  it('recorta una consulta desmesurada', () => {
    expect(parseFilters(`q=${'a'.repeat(500)}`).q).toHaveLength(100);
  });

  it('elimina duplicados en las listas', () => {
    expect(parseFilters('cat=imagen,imagen,video').categories).toEqual(['imagen', 'video']);
  });
});

describe('applyFilters', () => {
  it('sin filtros devuelve todo', () => {
    expect(applyFilters(tools, EMPTY_FILTERS)).toHaveLength(tools.length);
  });

  it('«sin tarjeta» excluye lo confirmado y también lo no verificado', () => {
    const result = applyFilters(tools, { ...EMPTY_FILTERS, noCard: true });
    const slugs = result.map((tool) => tool.slug);

    expect(slugs).toContain('sin-tarjeta');
    expect(slugs).not.toContain('con-tarjeta');
    // Lo importante: un dato sin verificar no vale como garantía.
    expect(slugs).not.toContain('incognita');
  });

  it('combina varios filtros como AND', () => {
    const result = applyFilters(tools, {
      ...EMPTY_FILTERS,
      categories: ['imagen'],
      noCard: true,
      commercial: true,
    });
    expect(result.map((t) => t.slug)).toEqual(['sin-tarjeta']);
  });

  it('filtra por plataforma con lógica OR dentro de la faceta', () => {
    const result = applyFilters(tools, { ...EMPTY_FILTERS, platforms: ['linux'] });
    expect(result.map((t) => t.slug)).toEqual(['local-oss']);
  });

  it('filtra por puntuación mínima', () => {
    const result = applyFilters(tools, { ...EMPTY_FILTERS, minScore: 80 });
    expect(result.every((tool) => tool.scoreTotal >= 80)).toBe(true);
  });

  it('filtra por open source verificado', () => {
    const result = applyFilters(tools, { ...EMPTY_FILTERS, openSource: true });
    expect(result.map((t) => t.slug)).toEqual(['local-oss']);
  });

  it('una combinación imposible devuelve lista vacía, no todo', () => {
    const result = applyFilters(tools, {
      ...EMPTY_FILTERS,
      categories: ['imagen'],
      openSource: true,
      hosting: ['local'],
    });
    expect(result).toHaveLength(0);
  });
});

describe('sortTools', () => {
  it('ordena por puntuación descendente', () => {
    const sorted = sortTools([...tools], 'score');
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i - 1]!.scoreTotal).toBeGreaterThanOrEqual(sorted[i]!.scoreTotal);
    }
  });

  it('ordena alfabéticamente respetando el español', () => {
    const sorted = sortTools([...tools], 'name');
    expect(sorted[0]!.name).toBe('Con Tarjeta');
  });

  it('ordena por fecha de alta descendente', () => {
    const sorted = sortTools([...tools], 'recent');
    expect(sorted[0]!.slug).toBe('local-oss');
  });
});

describe('countActiveFilters', () => {
  it('cuenta cada faceta activa', () => {
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0);
    expect(
      countActiveFilters({
        ...EMPTY_FILTERS,
        q: 'algo',
        categories: ['imagen', 'video'],
        noCard: true,
        minScore: 50,
      })
    ).toBe(5);
  });
});

describe('describeFilters', () => {
  it('describe el conjunto vacío', () => {
    expect(describeFilters(EMPTY_FILTERS, (slug) => slug)).toBe('Todas las herramientas');
  });

  it('encadena las condiciones activas', () => {
    const description = describeFilters(
      { ...EMPTY_FILTERS, categories: ['imagen'], noCard: true, commercial: true },
      () => 'Imagen IA'
    );
    expect(description).toContain('Imagen IA');
    expect(description).toContain('sin tarjeta');
    expect(description).toContain('uso comercial');
  });
});
