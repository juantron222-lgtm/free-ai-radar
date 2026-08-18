import { describe, expect, it } from 'vitest';
import { getAllTools, getToolsByCategory } from '@lib/data/catalog';
import { decideFilters, freeAccessLabel, usableFreeNow } from '@lib/data/category-page';
import {
  CANDIDATE_FILTERS,
  VIDEO_GENERATION,
  easyToStart,
  freeNow,
  generatesVideo,
  localControl,
  professional,
  talkingHead,
  videoCapabilityCount,
} from '@lib/data/video';

/**
 * Lo que la página de Vídeo promete, como afirmaciones ejecutables.
 *
 * Invariantes, no recuentos: ninguna prueba dice «deben ser doce», porque ese
 * número depende del catálogo de hoy y una prueba que se rompe al añadir una
 * ficha correcta enseña a ignorar la suite.
 */

const video = getToolsByCategory('video');

describe('bloque 1 — genera vídeos gratis ahora', () => {
  it('no incluye nada que haya que instalar', () => {
    expect(freeNow(video).filter((t) => t.hosting !== 'cloud')).toEqual([]);
  });

  it('no incluye créditos que no se renuevan', () => {
    /*
     * Runway da 125 créditos «one-time». Meterlos junto a planes que vuelven
     * cada mes haría el bloque inútil: prometería trabajar gratis y daría una
     * tarde. Es la distinción que separa credits+one_off de freemium.
     */
    for (const tool of freeNow(video)) {
      expect(tool.freePlan.creditReset, tool.slug).not.toBe('one_off');
    }
  });

  it('no incluye lo que no tiene plan gratuito ni lo que no hemos comprobado', () => {
    const wrong = freeNow(video).filter((t) =>
      ['paid_only', 'trial', 'demo', 'unknown'].includes(t.freeModel)
    );
    expect(wrong).toEqual([]);
  });

  it('sólo incluye lo que una fuente oficial dice que genera vídeo', () => {
    for (const tool of freeNow(video)) {
      expect(generatesVideo(tool), tool.slug).toBe(true);
      const cited = VIDEO_GENERATION.filter((c) => tool.capabilities.includes(c));
      expect(cited.length, tool.slug).toBeGreaterThan(0);
    }
  });

  it('pone por detrás al plan gratuito que prohíbe el uso comercial', () => {
    // Kling lo declara: "Generated content is not for commercial use".
    const orden = freeNow(video).map((t) => t.slug);
    if (!orden.includes('klingai')) return;
    for (const tool of freeNow(video).filter((t) => t.freePlan.commercialUse === 'yes')) {
      expect(orden.indexOf(tool.slug), `${tool.slug} debería ir antes que Kling`).toBeLessThan(
        orden.indexOf('klingai')
      );
    }
  });
});

describe('bloque 2 — fáciles para empezar', () => {
  it('todo es nube y sin instalación', () => {
    for (const tool of easyToStart(video)) {
      expect(tool.hosting, tool.slug).toBe('cloud');
      expect(['instant', 'signup'], tool.slug).toContain(tool.startEffort);
    }
  });

  it('no exige ser gratis: la pregunta es cuánto cuesta empezar', () => {
    expect(easyToStart(video).map((t) => t.slug)).toContain('luma-dream-machine');
  });
});

describe('bloque 3 — una persona hablando a cámara', () => {
  it('sólo entra lo que tiene avatar o sincronía labial citados', () => {
    for (const tool of talkingHead(video)) {
      const tiene =
        tool.capabilities.includes('avatar-video') || tool.capabilities.includes('lip-sync');
      expect(tiene, tool.slug).toBe(true);
    }
  });
});

describe('bloque 4 — potentes y profesionales', () => {
  it('sólo entra lo que podemos describir con capacidades citadas', () => {
    for (const tool of professional(video)) {
      expect(videoCapabilityCount(tool), tool.slug).toBeGreaterThanOrEqual(3);
      expect(tool.verification, tool.slug).toBe('verified');
    }
  });

  it('no premia el precio: quien no tiene plan gratuito también entra', () => {
    expect(professional(video).map((t) => t.slug)).toContain('luma-dream-machine');
  });
});

describe('bloque 5 — en tu equipo', () => {
  const { install, technical } = localControl(video);

  it('nada local se cuela en «gratis ahora»', () => {
    const gratis = new Set(freeNow(video).map((t) => t.slug));
    for (const tool of [...install, ...technical]) {
      expect(gratis.has(tool.slug), `${tool.slug} no puede estar en los dos`).toBe(false);
    }
  });

  it('hay opciones locales reales en esta categoría', () => {
    expect(install.length + technical.length).toBeGreaterThan(0);
  });
});

describe('filtros de vídeo', () => {
  const decisions = decideFilters(video, CANDIDATE_FILTERS);

  it('esconde los que convertirían «no consta» en «no»', () => {
    for (const id of ['sin-tarjeta', 'sin-marca', 'comercial']) {
      const d = decisions.find((x) => x.filter.id === id)!;
      expect(d.shown, `${id} no tiene cobertura suficiente`).toBe(false);
      expect(d.reason).toBeTruthy();
    }
  });

  it('cada filtro escondido dice por qué', () => {
    for (const d of decisions.filter((x) => !x.shown)) {
      expect(d.reason, d.filter.id).not.toBe('');
    }
  });

  it('ninguno enseñado deja la lista vacía', () => {
    for (const d of decisions.filter((x) => x.shown)) {
      expect(video.filter(d.filter.matches).length, d.filter.id).toBeGreaterThan(0);
    }
  });

  it('no enseña dos filtros que hoy seleccionan lo mismo', () => {
    const sets = decisions
      .filter((d) => d.shown)
      .map((d) =>
        video
          .filter(d.filter.matches)
          .map((t) => t.slug)
          .sort()
          .join('|')
      );
    expect(new Set(sets).size).toBe(sets.length);
  });
});

describe('la verificación de vídeo', () => {
  const bySlug = new Map(getAllTools().map((t) => [t.slug, t]));

  it('Runway no se presenta como freemium', () => {
    const tool = bySlug.get('runwayml')!;
    expect(tool.freeModel).toBe('credits');
    expect(tool.freePlan.creditReset).toBe('one_off');
    expect(usableFreeNow(tool)).toBe(false);
  });

  it('Pika lleva la cantidad y la frecuencia que publica su web', () => {
    const tool = bySlug.get('pika-labs')!;
    expect(tool.freePlan.creditReset).toBe('monthly');
    expect(tool.freePlan.creditsAmount).toBe('80 créditos de vídeo/mes');
    // De las pocas fichas del catálogo que pueden afirmar esto.
    expect(tool.freePlan.hasWatermark).toBe('no');
  });

  it('Luma no promete un plan gratuito que ya no existe', () => {
    const tool = bySlug.get('luma-dream-machine')!;
    expect(tool.freeModel).toBe('paid_only');
    expect(freeAccessLabel(tool).kind).toBe('Sin plan gratuito');
  });

  it('Kling declara que su plan gratuito no permite uso comercial', () => {
    expect(bySlug.get('klingai')!.freePlan.commercialUse).toBe('no');
  });

  it('Hailuo no convierte una promoción en acceso gratuito', () => {
    const tool = bySlug.get('hailuo-ai')!;
    expect(tool.freeModel).toBe('unknown');
    expect(tool.freePlan.creditsAmount).toBeUndefined();
  });

  it('los pesos abiertos declaran licencia sólo cuando se leyó', () => {
    for (const slug of ['wan-2-2', 'ltx-video', 'mochi-1']) {
      expect(bySlug.get(slug)!.licence, slug).toBe('Apache-2.0');
    }
    /*
     * HunyuanVideo tiene repositorio público pero no se pudo leer el
     * identificador de licencia: repositorio abierto no es licencia abierta.
     */
    expect(bySlug.get('hunyuanvideo')!.openSource).toBe('unverified');
  });

  it('las multiverticales no se duplican: entran por categoría secundaria', () => {
    for (const slug of ['krea', 'leonardo-ai', 'grok-imagine']) {
      const tool = bySlug.get(slug)!;
      expect(tool.categorySlug, slug).toBe('imagen');
      expect(tool.secondaryCategories, slug).toContain('video');
      expect(
        video.map((t) => t.slug),
        slug
      ).toContain(slug);
    }
  });
});

describe('invariantes de todo el catálogo', () => {
  it('ninguna ficha declara capacidades sin ninguna fuente', () => {
    const sinFuente = getAllTools().filter((t) => t.capabilities.length > 0 && !t.sources.length);
    expect(sinFuente.map((t) => t.slug)).toEqual([]);
  });

  it('todas las fichas explican su esfuerzo de arranque', () => {
    expect(getAllTools().filter((t) => !t.startEffortReason.trim()).map((t) => t.slug)).toEqual([]);
  });

  it('unknown nunca se convierte en no', () => {
    for (const tool of getAllTools()) {
      if (tool.freeModel === 'unknown') {
        expect(freeAccessLabel(tool).kind, tool.slug).toBe('Sin confirmar');
      }
    }
  });
});
