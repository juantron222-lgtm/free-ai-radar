import { describe, expect, it } from 'vitest';
import { getAllTools, getTool } from '@lib/data/catalog';
import {
  hechosCriticos,
  recuentoVerificacion,
  verificacionDe,
} from '@lib/domain/verification';

/**
 * Una ficha no puede decir de sí misma más de lo que sostiene.
 *
 * La contradicción que estas pruebas cierran era literal: la tabla se titulaba
 * «Condiciones verificadas del plan gratuito» y tres filas más abajo decía
 * «Sin confirmar». Las dos afirmaciones eran ciertas por separado; juntas,
 * la primera hablaba de la ficha entera cuando sólo valía para una parte.
 */

const tools = getAllTools();

describe('el estado de verificación', () => {
  it('ninguna ficha con huecos se presenta como verificada', () => {
    for (const tool of tools) {
      const v = verificacionDe(tool);
      if (v.state !== 'verificada') continue;
      expect(v.pendientes, `${tool.slug} dice «Verificada» con huecos`).toEqual([]);
      expect(v.confirmados, tool.slug).toBe(v.total);
    }
  });

  it('verificada exige además que una persona la haya contrastado', () => {
    for (const tool of tools) {
      if (verificacionDe(tool).state !== 'verificada') continue;
      expect(tool.verification, tool.slug).toBe('verified');
    }
  });

  it('lo que no se ha comprobado se llama catalogada, no verificada', () => {
    for (const tool of tools) {
      const sinComprobar =
        tool.verification === 'pending_review' ||
        tool.verification === 'outdated' ||
        tool.freeModel === 'unknown';
      if (!sinComprobar) continue;
      expect(verificacionDe(tool).state, tool.slug).toBe('catalogada');
    }
  });

  it('la parcial nombra lo que le falta en vez de insinuarlo', () => {
    const parciales = tools.filter((t) => verificacionDe(t).state === 'parcial');
    expect(parciales.length).toBeGreaterThan(0);
    for (const tool of parciales) {
      const v = verificacionDe(tool);
      expect(v.pendientes.length, tool.slug).toBeGreaterThan(0);
      for (const pendiente of v.pendientes) {
        expect(pendiente.label, tool.slug).not.toBe('');
      }
    }
  });

  it('la marca de agua sólo cuenta donde tiene respuesta', () => {
    /*
     * Preguntarle a un runtime local si deja marca de agua no tiene sentido.
     * Contarlo como hueco haría que pareciera peor documentado de lo que está.
     */
    const ollama = getTool('ollama')!;
    expect(hechosCriticos(ollama).map((h) => h.key)).not.toContain('hasWatermark');

    const midjourney = getTool('midjourney')!;
    expect(hechosCriticos(midjourney).map((h) => h.key)).toContain('hasWatermark');
  });

  it('los tres estados suman el catálogo entero', () => {
    const r = recuentoVerificacion(tools);
    expect(r.verificada + r.parcial + r.catalogada).toBe(r.total);
    expect(r.total).toBe(tools.length);
  });
});

describe('las cifras que la portada puede publicar', () => {
  it('lo que no tiene plan gratuito no se cuenta como acceso gratuito', () => {
    const r = recuentoVerificacion(tools);
    const dePago = tools.filter((t) => t.freeModel === 'paid_only');
    expect(r.sinPlanGratuito).toBe(dePago.length);
    expect(r.sinPlanGratuito).toBeGreaterThan(0);
    expect(r.accesoGratuitoConfirmado + r.sinPlanGratuito).toBeLessThanOrEqual(r.total);
  });

  it('«acceso gratuito confirmado» excluye lo que está sin comprobar', () => {
    for (const tool of tools) {
      if (tool.verification !== 'pending_review' && tool.freeModel !== 'unknown') continue;
      const solo = recuentoVerificacion([tool]);
      expect(solo.accesoGratuitoConfirmado, tool.slug).toBe(0);
    }
  });
});
