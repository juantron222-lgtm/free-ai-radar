import { describe, expect, it } from 'vitest';
import { getAllTools } from '@lib/data/catalog';
import { opacidadDe, rankingDeOpacidad } from '@lib/data/opacidad';
import { makeTool } from '../fixtures/tool';

describe('opacidad de una ficha', () => {
  it('lo pendiente no cuenta contra el fabricante', () => {
    const t = makeTool({ slug: 'a', name: 'A', capabilities: ['text-generation'] });
    const o = opacidadDe(t);
    expect(o.noPublicados).toBe(0);
    expect(o.indice === null || o.indice === 0).toBe(true);
  });

  it('un silencio documentado sí cuenta', () => {
    const base = makeTool({ slug: 'b', name: 'B', capabilities: ['text-generation'] });
    const t = {
      ...base,
      hosting: 'cloud' as const,
      freePlan: { ...base.freePlan, requiresCreditCard: 'unverified' as const, commercialUse: 'yes' as const },
      evidence: [
        { field: 'freePlan.requiresCreditCard' as const, outcome: 'not_published' as const, sourceUrl: 'https://example.com', sourceKind: 'pricing' as const, checkedAt: '2026-10-12', scope: 'product' as const, lookedFor: 'x' },
      ],
    };
    const o = opacidadDe(t);
    expect(o.hechos.find((h) => h.clave === 'tarjeta')?.casilla).toBe('noPublicado');
    expect(o.hechos.find((h) => h.clave === 'comercial')?.casilla).toBe('publicado');
    expect(o.indice).toBeGreaterThan(0);
  });

  it('la marca de agua sólo se pregunta a lo que genera archivos en la nube', () => {
    const texto = makeTool({ slug: 'c', name: 'C', capabilities: ['text-generation'] });
    expect(opacidadDe({ ...texto, hosting: 'cloud' }).hechos.map((h) => h.clave)).not.toContain('marca');
    const imagen = makeTool({ slug: 'd', name: 'D', capabilities: ['text-to-image'] });
    expect(opacidadDe({ ...imagen, hosting: 'cloud' }).hechos.map((h) => h.clave)).toContain('marca');
  });

  it('una herramienta sin acceso gratuito no entra en el índice', () => {
    const t = makeTool({ slug: 'e', name: 'E', capabilities: ['text-to-image'] });
    expect(opacidadDe({ ...t, freeModel: 'paid_only' }).hechos).toEqual([]);
  });
});

describe('el ranking del catálogo', () => {
  const ranking = rankingDeOpacidad(getAllTools());

  it('sólo incluye fichas con al menos tres hechos comprobados', () => {
    expect(ranking.length).toBeGreaterThan(10);
    for (const o of ranking) expect(o.publicados + o.noPublicados, o.slug).toBeGreaterThanOrEqual(3);
  });

  it('va de más a menos opaco', () => {
    const indices = ranking.map((o) => o.indice ?? 0);
    for (let i = 1; i < indices.length; i++) expect(indices[i - 1]).toBeGreaterThanOrEqual(indices[i] ?? 0);
  });
});
