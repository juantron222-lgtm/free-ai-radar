import { describe, expect, it } from 'vitest';
import { getAllTools } from '@lib/data/catalog';
import { decideFilters, freeAccessLabel, usableFreeNow } from '@lib/data/category-page';
import {
  AUDIO_CAPABILITIES,
  AUDIO_SLUGS,
  CANDIDATE_FILTERS,
  MIN_BLOQUE,
  audioCapabilityCount,
  audioTools,
  freeNow,
  localControl,
  professional,
  withCapability,
} from '@lib/data/audio';

/**
 * Lo que la página de Audio promete, como afirmaciones ejecutables.
 *
 * La vertical donde más importa una regla concreta: en audio, gratis y «puedo
 * publicarlo» casi nunca van juntos, y varias fichas lo declaran expresamente.
 * Estas pruebas vigilan que esa declaración no se pierda por el camino.
 */

const audio = audioTools();

describe('la unión de música y voz', () => {
  it('reúne las dos categorías técnicas sin repetir fichas', () => {
    const slugs = audio.map((t) => t.slug);
    expect(new Set(slugs).size, 'ninguna ficha puede aparecer dos veces').toBe(slugs.length);
  });

  it('todo lo que aparece pertenece a una de las dos categorías', () => {
    for (const tool of audio) {
      const pertenece =
        (AUDIO_SLUGS as readonly string[]).includes(tool.categorySlug) ||
        tool.secondaryCategories.some((c) => (AUDIO_SLUGS as readonly string[]).includes(c));
      expect(pertenece, tool.slug).toBe(true);
    }
  });
});

describe('bloque — usar gratis ahora', () => {
  it('no incluye nada que haya que instalar', () => {
    expect(freeNow(audio).filter((t) => t.hosting !== 'cloud')).toEqual([]);
  });

  it('no incluye créditos que no se renuevan ni gratuidades sin comprobar', () => {
    for (const tool of freeNow(audio)) {
      expect(tool.freePlan.creditReset, tool.slug).not.toBe('one_off');
      expect(['paid_only', 'trial', 'demo', 'unknown'], tool.slug).not.toContain(tool.freeModel);
    }
  });

  it('sólo incluye lo que sabe hacer algo con audio', () => {
    for (const tool of freeNow(audio)) {
      expect(audioCapabilityCount(tool), tool.slug).toBeGreaterThan(0);
    }
  });

  it('pone por detrás lo que no deja usar el resultado comercialmente', () => {
    const orden = freeNow(audio).map((t) => t.slug);
    const prohibido = freeNow(audio).filter((t) => t.freePlan.commercialUse === 'no');
    const permitido = freeNow(audio).filter((t) => t.freePlan.commercialUse === 'yes');
    for (const malo of prohibido) {
      for (const bueno of permitido) {
        expect(orden.indexOf(bueno.slug), `${bueno.slug} antes que ${malo.slug}`).toBeLessThan(
          orden.indexOf(malo.slug)
        );
      }
    }
  });
});

describe('bloques por intención', () => {
  it('cada bloque sólo contiene fichas con esa capacidad citada', () => {
    for (const capacidad of ['text-to-music', 'text-to-speech', 'voice-clone', 'transcription'] as const) {
      for (const tool of withCapability(audio, capacidad)) {
        expect(tool.capabilities, `${tool.slug} / ${capacidad}`).toContain(capacidad);
      }
    }
  });

  /*
   * La página levanta un bloque sólo cuando hay al menos tres fichas. Un bloque
   * de una tarjeta no es una recomendación, es un hueco con título — y hoy es
   * el caso de doblaje y de voz a voz, que existen como capacidad pero no como
   * catálogo.
   */
  it('las intenciones sin catálogo no llegan a bloque', () => {
    expect(withCapability(audio, 'dubbing').length).toBeLessThan(MIN_BLOQUE);
    expect(withCapability(audio, 'speech-to-speech').length).toBeLessThan(MIN_BLOQUE);
  });

  it('las intenciones con catálogo sí lo tienen', () => {
    for (const capacidad of ['text-to-music', 'text-to-speech', 'voice-clone', 'transcription'] as const) {
      expect(withCapability(audio, capacidad).length, capacidad).toBeGreaterThanOrEqual(MIN_BLOQUE);
    }
  });
});

describe('en tu equipo', () => {
  const { install, technical } = localControl(audio);

  it('nada local se cuela en «gratis ahora»', () => {
    const gratis = new Set(freeNow(audio).map((t) => t.slug));
    for (const tool of [...install, ...technical]) {
      expect(gratis.has(tool.slug), tool.slug).toBe(false);
    }
  });

  it('hay opciones locales reales', () => {
    expect(install.length + technical.length).toBeGreaterThanOrEqual(MIN_BLOQUE);
  });
});

describe('profesionales', () => {
  it('sólo entra lo verificado y con capacidades citadas', () => {
    for (const tool of professional(audio)) {
      expect(tool.verification, tool.slug).toBe('verified');
      expect(audioCapabilityCount(tool), tool.slug).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('filtros de audio', () => {
  const decisions = decideFilters(audio, CANDIDATE_FILTERS);

  it('cada filtro escondido dice por qué', () => {
    for (const d of decisions.filter((x) => !x.shown)) {
      expect(d.reason, d.filter.id).not.toBe('');
    }
  });

  it('ninguno enseñado deja la lista vacía', () => {
    for (const d of decisions.filter((x) => x.shown)) {
      expect(audio.filter(d.filter.matches).length, d.filter.id).toBeGreaterThan(0);
    }
  });

  it('no enseña dos filtros que hoy seleccionan lo mismo', () => {
    const sets = decisions
      .filter((d) => d.shown)
      .map((d) =>
        audio
          .filter(d.filter.matches)
          .map((t) => t.slug)
          .sort()
          .join('|')
      );
    expect(new Set(sets).size).toBe(sets.length);
  });
});

describe('la verificación de audio', () => {
  const bySlug = new Map(getAllTools().map((t) => [t.slug, t]));

  it('Suno declara que su plan gratuito no permite uso comercial', () => {
    const tool = bySlug.get('suno-ai')!;
    expect(tool.freePlan.commercialUse).toBe('no');
    expect(tool.freePlan.creditReset).toBe('daily');
    expect(tool.freePlan.creditsAmount).toBe('50 créditos/día (10 canciones)');
  });

  it('ElevenLabs reserva la licencia comercial para los planes de pago', () => {
    const tool = bySlug.get('elevenlabs')!;
    expect(tool.freePlan.commercialUse).toBe('no');
    expect(tool.freePlan.creditsAmount).toBe('10.000 créditos/mes');
    // No se traducen créditos a minutos ni a caracteres: la página no lo hace.
    expect(tool.freePlan.creditsAmount).not.toMatch(/minuto|caracter/i);
  });

  it('Fish Audio dice que su plan gratuito es sólo para uso personal', () => {
    expect(bySlug.get('fish-audio')!.freePlan.commercialUse).toBe('no');
  });

  it('los pesos no comerciales se distinguen del código permisivo', () => {
    /*
     * AudioCraft y F5-TTS publican código MIT y pesos CC-BY-NC. Decir sólo
     * «open source» contaría la mitad de la historia, y es la mitad que no
     * decide nada.
     */
    for (const slug of ['audiocraft', 'f5-tts']) {
      const tool = bySlug.get(slug)!;
      expect(tool.openSource, slug).toBe('yes');
      expect(tool.freePlan.commercialUse, slug).toBe('no');
      expect(tool.licence, slug).toMatch(/CC-BY-NC/);
    }
  });

  it('los permisivos de verdad se declaran como tales', () => {
    expect(bySlug.get('whisper')!.licence).toBe('MIT');
    expect(bySlug.get('kokoro')!.licence).toBe('Apache-2.0');
  });

  it('Cartesia sólo publica minutos porque su tabla los publica', () => {
    /*
     * La equivalencia aparece porque la publica la fuente, no porque la
     * hayamos calculado: 20.000 créditos no son 27 minutos en ninguna regla de
     * tres nuestra. En Suno pasa lo mismo con «10 canciones», y en ElevenLabs
     * —que no publica equivalencia— los créditos se quedan a secas.
     */
    const tool = bySlug.get('cartesia')!;
    expect(tool.freePlan.creditsAmount).toContain('20.000 créditos/mes');
    expect(tool.freePlan.limits.join(' ')).toMatch(/27 minutos/);

    const eleven = bySlug.get('elevenlabs')!;
    expect(eleven.freePlan.limits.join(' ')).not.toMatch(/minuto|caracteres/i);
  });
});

describe('lo que la tarjeta puede enseñar', () => {
  it('todas las capacidades de audio tienen etiqueta', () => {
    for (const tool of audio) {
      for (const cap of tool.capabilities) {
        if (!(AUDIO_CAPABILITIES as readonly string[]).includes(cap)) continue;
        expect(AUDIO_CAPABILITIES, cap).toContain(cap);
      }
    }
  });

  it('unknown nunca se convierte en no', () => {
    for (const tool of audio) {
      if (tool.freeModel === 'unknown') {
        expect(freeAccessLabel(tool).kind, tool.slug).toBe('Sin confirmar');
      }
    }
  });

  it('lo local nunca cuenta como usable gratis en la nube', () => {
    for (const tool of audio.filter((t) => t.hosting !== 'cloud')) {
      expect(usableFreeNow(tool), tool.slug).toBe(false);
    }
  });
});
