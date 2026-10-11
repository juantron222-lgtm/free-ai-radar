import { describe, expect, it } from 'vitest';
import { getAllTools } from '@lib/data/catalog';

/**
 * Lo que el plan gratuito no incluye, con su cita.
 *
 * `freePlan.excludedCapabilities` separa lo que el producto hace de lo que te
 * deja hacer gratis. El motor de decisión (docs/diseno-motor-de-decision.md)
 * depende de él para no recomendar gratis algo que es de pago, y hasta el 11
 * de octubre de 2026 sólo una ficha lo tenía relleno. Ese día se revisaron las
 * líneas de límites que declaraban exclusiones, contra la fuente oficial de
 * ese mismo día, y salieron dos correcciones de lo publicado.
 */

const tools = getAllTools();
const ficha = (slug: string) => tools.find((t) => t.slug === slug)!;

describe('cada exclusión se apoya en una cita oficial', () => {
  it('ninguna ficha excluye una capacidad sin evidencia «stated» de una fuente oficial', () => {
    for (const tool of tools.filter((t) => t.freePlan.excludedCapabilities.length > 0)) {
      const ev = tool.evidence.find((e) => e.field === 'freePlan.excludedCapabilities');
      expect(ev, `${tool.slug} excluye sin evidencia`).toBeTruthy();
      expect(ev!.outcome, tool.slug).toBe('stated');
      expect(['pricing', 'docs', 'help', 'terms', 'official'], tool.slug).toContain(ev!.sourceKind);
    }
  });

  it('sólo se excluye lo que el producto hace', () => {
    for (const tool of tools) {
      for (const c of tool.freePlan.excludedCapabilities) {
        expect(tool.capabilities, `${tool.slug} excluye ${c}, que no declara`).toContain(c);
      }
    }
  });
});

describe('lo que se comprobó el 11 de octubre de 2026', () => {
  it('ElevenLabs: la clonación de voz es de pago; el doblaje, no', () => {
    /*
     * La ficha decía «Clonación de voz y doblaje: no incluidos». La clonación
     * es de Starter («Everything in free, plus … Instant Voice Cloning»), pero
     * su centro de ayuda dice «Dubbing is available on all our plans,
     * including the free plan», con marca de agua.
     */
    const t = ficha('elevenlabs');
    expect(t.freePlan.excludedCapabilities).toEqual(['voice-clone']);
    const publicado = [t.freePlan.summary, ...t.freePlan.limits].join(' ');
    expect(publicado).not.toMatch(/doblaje[^.]*no (est[áa]n? )?incluid/i);
  });

  it('Grok Imagine: el vídeo no está en Free', () => {
    expect(ficha('grok-imagine').freePlan.excludedCapabilities).toEqual(['text-to-video', 'image-to-video']);
  });

  it('Ideogram: escalar es de pago; quitar el fondo, no', () => {
    /*
     * La ficha decía «Sin Magic Fill, Extend, escalado ni recorte de fondo».
     * Su FAQ: «Upscale sizes need a paid plan», y quitar el fondo «costs 1
     * credit», sin plan de pago.
     */
    const t = ficha('ideogram');
    expect(t.freePlan.excludedCapabilities).toEqual(['upscaling']);
    const publicado = [t.freePlan.summary, ...t.freePlan.limits].join(' ');
    expect(publicado).not.toMatch(/recorte de fondo[^.]*no incluid|ni recorte de fondo/i);
    expect(publicado).toContain('Quitar el fondo: disponible, por 1 crédito');
  });
});
