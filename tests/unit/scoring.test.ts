import { describe, expect, it } from 'vitest';
import {
  computeScore,
  computeScoreBreakdown,
  deriveTags,
  freshnessOf,
  daysBetween,
  scoreBand,
  SCORE_WEIGHTS,
  STALE_AFTER_DAYS,
} from '@lib/domain/scoring';
import { makeTool } from '../fixtures/tool';

const perfectScores = {
  freeReal: 10,
  usefulness: 10,
  ease: 10,
  transparency: 10,
  creatorValue: 10,
};

const zeroScores = { freeReal: 0, usefulness: 0, ease: 0, transparency: 0, creatorValue: 0 };

const cleanPlan = {
  requiresCreditCard: 'no',
  hasWatermark: 'no',
  commercialUse: 'yes',
  creditReset: 'none',
} as const;

describe('pesos de la puntuación', () => {
  it('suman exactamente 1', () => {
    const total = Object.values(SCORE_WEIGHTS).reduce((acc, weight) => acc + weight, 0);
    expect(total).toBeCloseTo(1, 10);
  });
});

describe('computeScore', () => {
  it('da 100 con todo perfecto y sin penalizaciones', () => {
    const score = computeScore({
      scores: perfectScores,
      freeModel: 'free_real',
      freePlan: cleanPlan,
      openSource: 'no',
    });
    expect(score).toBe(100);
  });

  it('da 0 con todo a cero', () => {
    const score = computeScore({
      scores: zeroScores,
      freeModel: 'free_real',
      freePlan: cleanPlan,
      openSource: 'no',
    });
    expect(score).toBe(0);
  });

  it('nunca se sale del rango 0–100 ni con la bonificación de open source', () => {
    const score = computeScore({
      scores: perfectScores,
      freeModel: 'open_source',
      freePlan: cleanPlan,
      openSource: 'yes',
    });
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('no baja de 0 acumulando penalizaciones', () => {
    const score = computeScore({
      scores: zeroScores,
      freeModel: 'paid_only',
      freePlan: {
        requiresCreditCard: 'yes',
        hasWatermark: 'yes',
        commercialUse: 'no',
        creditReset: 'one_off',
      },
      openSource: 'no',
    });
    expect(score).toBe(0);
  });
});

describe('penalizaciones', () => {
  const base = {
    scores: { freeReal: 7, usefulness: 7, ease: 7, transparency: 7, creatorValue: 7 },
    freeModel: 'freemium' as const,
    openSource: 'no' as const,
  };

  it('penaliza exigir tarjeta', () => {
    const without = computeScore({ ...base, freePlan: cleanPlan });
    const withCard = computeScore({
      ...base,
      freePlan: { ...cleanPlan, requiresCreditCard: 'yes' },
    });
    expect(withCard).toBe(without - 12);
  });

  it('penaliza la marca de agua', () => {
    const without = computeScore({ ...base, freePlan: cleanPlan });
    const withMark = computeScore({ ...base, freePlan: { ...cleanPlan, hasWatermark: 'yes' } });
    expect(withMark).toBe(without - 8);
  });

  it('penaliza más el uso comercial prohibido que el parcial', () => {
    const none = computeScore({ ...base, freePlan: { ...cleanPlan, commercialUse: 'no' } });
    const partial = computeScore({
      ...base,
      freePlan: { ...cleanPlan, commercialUse: 'partial' },
    });
    expect(none).toBeLessThan(partial);
  });

  it('bonifica el código abierto verificado', () => {
    const closed = computeScore({ ...base, freePlan: cleanPlan, openSource: 'no' });
    const open = computeScore({ ...base, freePlan: cleanPlan, openSource: 'yes' });
    expect(open).toBe(closed + 6);
  });

  it('no penaliza ni bonifica lo que está sin verificar', () => {
    const unverified = computeScore({
      ...base,
      freePlan: {
        requiresCreditCard: 'unverified',
        hasWatermark: 'unverified',
        commercialUse: 'unverified',
        creditReset: 'none',
      },
      openSource: 'unverified',
    });
    const breakdown = computeScoreBreakdown({
      ...base,
      freePlan: {
        requiresCreditCard: 'unverified',
        hasWatermark: 'unverified',
        commercialUse: 'unverified',
        creditReset: 'none',
      },
      openSource: 'unverified',
    });

    expect(breakdown.adjustments).toHaveLength(0);
    expect(unverified).toBe(Math.round(breakdown.base));
  });

  it('penaliza los créditos que no se renuevan pero no los que sí', () => {
    const renewing = computeScore({
      ...base,
      freeModel: 'credits',
      freePlan: { ...cleanPlan, creditReset: 'monthly' },
    });
    const oneOff = computeScore({
      ...base,
      freeModel: 'credits',
      freePlan: { ...cleanPlan, creditReset: 'one_off' },
    });
    expect(oneOff).toBe(renewing - 10);
  });
});

describe('desglose publicable', () => {
  it('cada ajuste lleva etiqueta y motivo', () => {
    const breakdown = computeScoreBreakdown({
      scores: perfectScores,
      freeModel: 'trial',
      freePlan: { ...cleanPlan, requiresCreditCard: 'yes' },
      openSource: 'no',
    });

    expect(breakdown.adjustments.length).toBeGreaterThan(0);
    for (const adjustment of breakdown.adjustments) {
      expect(adjustment.label).toBeTruthy();
      expect(adjustment.reason).toBeTruthy();
      expect(adjustment.points).not.toBe(0);
    }
  });

  it('la suma del desglose coincide con el total', () => {
    const breakdown = computeScoreBreakdown({
      scores: { freeReal: 6, usefulness: 7, ease: 5, transparency: 8, creatorValue: 4 },
      freeModel: 'credits',
      freePlan: { ...cleanPlan, hasWatermark: 'yes', creditReset: 'one_off' },
      openSource: 'no',
    });

    const expected = breakdown.adjustments.reduce((acc, a) => acc + a.points, breakdown.base);
    expect(breakdown.total).toBe(Math.round(Math.max(0, Math.min(100, expected))));
  });
});

describe('scoreBand', () => {
  it.each([
    [95, 'excellent'],
    [80, 'excellent'],
    [79, 'good'],
    [65, 'good'],
    [64, 'fair'],
    [45, 'fair'],
    [44, 'poor'],
    [0, 'poor'],
  ])('%i cae en la banda %s', (score, band) => {
    expect(scoreBand(score)).toBe(band);
  });
});

describe('frescura', () => {
  const now = new Date('2026-08-03T00:00:00Z');

  it('calcula los días transcurridos', () => {
    expect(daysBetween('2026-08-01', now)).toBe(2);
  });

  it('marca fresca lo verificado hace poco', () => {
    expect(freshnessOf('2026-07-15', now)).toBe('fresh');
  });

  it(`marca pendiente a partir de ${STALE_AFTER_DAYS} días`, () => {
    expect(freshnessOf('2026-01-01', now)).toBe('stale');
  });

  it('marca crítica lo muy antiguo', () => {
    expect(freshnessOf('2025-06-01', now)).toBe('very_stale');
  });

  it('trata una fecha inválida como caducada, no como fresca', () => {
    expect(freshnessOf('no-es-una-fecha', now)).toBe('very_stale');
  });
});

describe('deriveTags', () => {
  it('sólo etiqueta hechos confirmados', () => {
    const tool = makeTool({
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
    });

    const tags = deriveTags(tool);
    expect(tags).not.toContain('Sin tarjeta');
    expect(tags).not.toContain('Sin registro');
    expect(tags).not.toContain('Uso comercial');
  });

  it('etiqueta lo que sí está confirmado', () => {
    const tool = makeTool();
    const tags = deriveTags(tool);
    expect(tags).toContain('Sin tarjeta');
    expect(tags).toContain('Sin marca de agua');
    expect(tags).toContain('Uso comercial');
  });
});

describe('hydrateTool', () => {
  it('deriva la puntuación en vez de confiar en un valor almacenado', () => {
    const tool = makeTool({ scores: perfectScores });
    expect(tool.scoreTotal).toBe(100);
    expect(tool.band).toBe('excellent');
  });

  it('usa la URL de afiliación sólo cuando la afiliación está activa', () => {
    const plain = makeTool();
    expect(plain.outboundUrl).toBe('https://ejemplo.com');

    const affiliate = makeTool({
      affiliation: { isAffiliate: true, affiliateUrl: 'https://afiliado.example/ref' },
    });
    expect(affiliate.outboundUrl).toBe('https://afiliado.example/ref');
  });

  it('ignora una URL de afiliación si la afiliación no está activa', () => {
    const tool = makeTool({
      affiliation: { isAffiliate: false, affiliateUrl: 'https://afiliado.example/ref' },
    });
    expect(tool.outboundUrl).toBe('https://ejemplo.com');
  });
});
