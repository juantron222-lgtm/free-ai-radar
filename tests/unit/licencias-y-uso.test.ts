import { describe, expect, it } from 'vitest';
import { getAllTools } from '@lib/data/catalog';
import { decideFilters } from '@lib/data/category-page';
import { CANDIDATE_FILTERS as AUDIO_FILTERS, audioTools } from '@lib/data/audio';

/**
 * Dos reglas que valen para todo el catálogo, no para una vertical.
 *
 * La primera: si el plan gratuito no permite uso comercial y eso está
 * verificado, el lector tiene que verlo junto a la etiqueta de gratuidad. La
 * segunda: la licencia de un proyecto abierto no es una sola cosa, y resumir
 * código y pesos en un único «open source» cuenta la mitad que no decide.
 */

const tools = getAllTools();

describe('la restricción comercial es información de tarjeta', () => {
  /*
   * La tarjeta pinta el aviso cuando `commercialUse === 'no'`. Esta prueba fija
   * la condición: sólo lo verificado, nunca lo no comprobado.
   */
  it('sólo se marca lo verificado, nunca lo que no consta', () => {
    for (const tool of tools) {
      const marca = tool.freePlan.commercialUse === 'no';
      if (marca) expect(tool.freePlan.commercialUse, tool.slug).toBe('no');
      // `unverified` jamás debe entenderse como prohibido.
      if (tool.freePlan.commercialUse === 'unverified') expect(marca, tool.slug).toBe(false);
    }
  });

  it('las fichas que lo declaran siguen declarándolo', () => {
    /*
     * Las cuatro que lo dicen con todas las letras en su fuente oficial. Si una
     * cambia de política, esta prueba obliga a revisar la ficha en vez de
     * dejarla envejecer en silencio.
     */
    const bySlug = new Map(tools.map((t) => [t.slug, t]));
    for (const slug of ['suno-ai', 'elevenlabs', 'fish-audio', 'klingai', 'krea']) {
      expect(bySlug.get(slug)?.freePlan.commercialUse, slug).toBe('no');
    }
  });
});

describe('la licencia no se resume de forma engañosa', () => {
  it('cuando código y pesos difieren, se guardan por separado', () => {
    const bySlug = new Map(tools.map((t) => [t.slug, t]));
    for (const slug of ['audiocraft', 'f5-tts']) {
      const tool = bySlug.get(slug)!;
      expect(tool.licences.code, slug).toBeTruthy();
      expect(tool.licences.weights, slug).toBeTruthy();
      expect(tool.licences.code, slug).not.toBe(tool.licences.weights);
    }
  });

  it('el resumen de una línea nunca esconde una capa restrictiva', () => {
    for (const tool of tools) {
      const { code, weights } = tool.licences;
      if (!code || !weights || code === weights) continue;
      /*
       * Si las capas difieren, el resumen tiene que nombrar las dos. Decir sólo
       * «MIT» de un proyecto con pesos CC-BY-NC es exactamente el resumen que
       * esta regla existe para impedir.
       */
      expect(tool.licence, tool.slug).toContain(code);
      expect(tool.licence, tool.slug).toContain(weights);
    }
  });

  it('cuando coinciden, el resumen es una sola licencia sin adornos', () => {
    const bySlug = new Map(tools.map((t) => [t.slug, t]));
    expect(bySlug.get('whisper')!.licence).toBe('MIT');
    expect(bySlug.get('kokoro')!.licence).toBe('Apache-2.0');
  });

  it('lo que no se ha leído no se inventa', () => {
    for (const tool of tools) {
      // `outputs` está vacío en todo el catálogo: ningún repositorio revisado
      // dice qué puedes hacer con lo que generas. El hueco es el dato.
      if (tool.licences.outputs) expect(tool.licences.outputs.length).toBeGreaterThan(0);
    }
  });

  it('una licencia abierta no implica poder usarla comercialmente', () => {
    const bySlug = new Map(tools.map((t) => [t.slug, t]));
    for (const slug of ['audiocraft', 'f5-tts']) {
      const tool = bySlug.get(slug)!;
      expect(tool.openSource, slug).toBe('yes');
      expect(tool.freePlan.commercialUse, slug).toBe('no');
    }
  });
});

describe('las capacidades sin bloque siguen siendo filtrables', () => {
  /*
   * Doblaje, efectos de sonido y voz a voz no llegan a bloque por falta de
   * catálogo. Eso no debe hacerlas invisibles: como filtro siguen siendo la
   * forma de encontrarlas, y esconderlas del todo dejaría fichas verificadas
   * sin ninguna puerta de entrada.
   */
  const audio = audioTools();
  const decisions = decideFilters(audio, AUDIO_FILTERS);

  it('existen como filtro candidato aunque no tengan bloque', () => {
    for (const id of ['doblaje', 'efectos', 'transcribir', 'clonar']) {
      expect(
        decisions.some((d) => d.filter.id === id),
        id
      ).toBe(true);
    }
  });

  it('si se esconden es por cobertura y queda dicho', () => {
    for (const d of decisions.filter((x) => !x.shown)) {
      expect(d.reason, d.filter.id).not.toBe('');
    }
  });
});
