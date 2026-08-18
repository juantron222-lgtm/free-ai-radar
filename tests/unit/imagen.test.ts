import { describe, expect, it } from 'vitest';
import { getAllTools, getToolsByCategory } from '@lib/data/catalog';
import {
  CANDIDATE_FILTERS,
  decideFilters,
  easyToStart,
  freeAccessLabel,
  freeNow,
  imageCapabilityCount,
  localControl,
  professional,
} from '@lib/data/imagen';

/**
 * Lo que la página de Imagen promete, como afirmaciones ejecutables.
 *
 * Corren contra el catálogo real y no contra maquetas: lo que se está
 * protegiendo aquí no es que las funciones compilen, sino que la página no
 * pueda volver a decir algo que sus datos no sostienen. La auditoría que
 * originó todo esto encontró veintidós fichas afirmando por defecto cosas que
 * nadie había comprobado, y ninguna prueba lo notó porque ninguna prueba miraba
 * el contenido.
 */

const imagen = getToolsByCategory('imagen');

describe('bloque 1 — genera gratis ahora', () => {
  it('no incluye nada que haya que instalar', () => {
    expect(freeNow(imagen).filter((t) => t.hosting !== 'cloud')).toEqual([]);
  });

  it('no incluye nada cuya gratuidad no hayamos podido comprobar', () => {
    expect(freeNow(imagen).filter((t) => t.freeModel === 'unknown')).toEqual([]);
  });

  it('no incluye nada sin plan gratuito ni pruebas temporales', () => {
    const wrong = freeNow(imagen).filter((t) => ['paid_only', 'trial', 'demo'].includes(t.freeModel));
    expect(wrong).toEqual([]);
  });

  it('sólo incluye lo que una fuente oficial dice que genera imágenes', () => {
    for (const tool of freeNow(imagen)) {
      expect(tool.capabilities, tool.slug).toContain('text-to-image');
    }
  });

  it('pone delante a quien publica cuánto da y cada cuánto', () => {
    const orden = freeNow(imagen).map((t) => t.slug);
    const conCifra = imagen.find(
      (t) => t.slug === 'leonardo-ai' && t.freePlan.creditsAmount && t.freePlan.creditReset === 'daily'
    );
    expect(conCifra, 'Leonardo debería tener cantidad y frecuencia documentadas').toBeTruthy();

    // Adobe Firefly documenta la frecuencia pero no la cantidad.
    expect(orden.indexOf('leonardo-ai')).toBeLessThan(orden.indexOf('adobe-firefly'));
  });
});

describe('bloque 2 — fáciles para empezar', () => {
  it('todo es nube y sin instalación', () => {
    for (const tool of easyToStart(imagen)) {
      expect(tool.hosting, tool.slug).toBe('cloud');
      expect(['instant', 'signup'], tool.slug).toContain(tool.startEffort);
    }
  });

  it('deja fuera lo que vive en la categoría pero no hace imágenes', () => {
    // Civitai es una comunidad de modelos y Comfy Cloud ejecuta flujos ajenos:
    // ninguna de las dos es un sitio donde escribir y obtener una imagen.
    const slugs = easyToStart(imagen).map((t) => t.slug);
    expect(slugs).not.toContain('civitai');
    expect(slugs).not.toContain('comfy-cloud');
  });

  it('no exige ser gratis: la pregunta es cuánto cuesta empezar', () => {
    const slugs = easyToStart(imagen).map((t) => t.slug);
    expect(slugs).toContain('midjourney');
  });
});

describe('bloque 3 — potentes y profesionales', () => {
  it('sólo entra lo que podemos describir con seis capacidades citadas', () => {
    for (const tool of professional(imagen)) {
      expect(tool.capabilities.length, tool.slug).toBeGreaterThanOrEqual(6);
      expect(tool.verification, tool.slug).toBe('verified');
    }
  });

  it('no premia el precio: quien no tiene plan gratuito también entra', () => {
    expect(professional(imagen).map((t) => t.slug)).toContain('midjourney');
  });

  it('lo local no compite aquí: tiene su propio bloque', () => {
    expect(professional(imagen).filter((t) => t.hosting !== 'cloud')).toEqual([]);
  });
});

describe('bloque 4 — local y máximo control', () => {
  const { install, technical } = localControl(imagen);

  it('separa instalar de configurar', () => {
    expect(install.length).toBeGreaterThan(0);
    expect(technical.length).toBeGreaterThan(0);
    for (const tool of install) expect(tool.startEffort, tool.slug).toBe('install');
    for (const tool of technical) expect(tool.startEffort, tool.slug).not.toBe('install');
  });

  it('no se solapa con «genera gratis ahora»', () => {
    const gratis = new Set(freeNow(imagen).map((t) => t.slug));
    for (const tool of [...install, ...technical]) {
      expect(gratis.has(tool.slug), `${tool.slug} no puede estar en los dos`).toBe(false);
    }
  });
});

describe('cómo se nombra la gratuidad', () => {
  it('no inventa una cantidad que el fabricante no publica', () => {
    for (const tool of imagen) {
      const label = freeAccessLabel(tool);
      if (label.amount !== null) {
        expect(tool.freePlan.creditsAmount, tool.slug).toBeTruthy();
      }
    }
  });

  it('nombra la frecuencia aunque falte la cantidad, y dice que falta', () => {
    // Adobe Firefly publica que los créditos vuelven cada día, pero no cuántos.
    // Son dos afirmaciones distintas y sólo una se puede hacer.
    const firefly = imagen.find((t) => t.slug === 'adobe-firefly')!;
    const label = freeAccessLabel(firefly);
    expect(label.kind).toBe('Créditos diarios');
    expect(label.amount).toBeNull();
    expect(label.amountFallback).toBe('No publican la cantidad');
  });

  it('concuerda en género y número con «créditos»', () => {
    for (const tool of imagen) {
      expect(freeAccessLabel(tool).kind, tool.slug).not.toMatch(/diaria$|semanals|mensuals/);
    }
  });

  it('quien no tiene plan gratuito no recibe una etiqueta tranquilizadora', () => {
    const midjourney = imagen.find((t) => t.slug === 'midjourney')!;
    expect(freeAccessLabel(midjourney).kind).toBe('Sin plan gratuito');
  });
});

describe('filtros', () => {
  const decisions = decideFilters(imagen, CANDIDATE_FILTERS);

  it('esconde el que sólo puede afirmarse en muy pocas fichas', () => {
    const card = decisions.find((d) => d.filter.id === 'sin-tarjeta')!;
    expect(card.shown, 'con tan pocas fichas verificadas, «sin tarjeta» insinúa que el resto sí la pide').toBe(false);
    expect(card.reason).toBeTruthy();
  });

  it('cada filtro escondido dice por qué', () => {
    for (const d of decisions.filter((x) => !x.shown)) {
      expect(d.reason, d.filter.id).not.toBe('');
    }
  });

  it('no enseña dos filtros que hoy seleccionan lo mismo', () => {
    const shown = decisions.filter((d) => d.shown);
    const sets = shown.map((d) =>
      imagen
        .filter(d.filter.matches)
        .map((t) => t.slug)
        .sort()
        .join('|')
    );
    expect(new Set(sets).size).toBe(sets.length);
  });

  it('ninguno enseñado deja la lista vacía', () => {
    for (const d of decisions.filter((x) => x.shown)) {
      expect(imagen.filter(d.filter.matches).length, d.filter.id).toBeGreaterThan(0);
    }
  });

  it('todos los candidatos reciben una decisión', () => {
    expect(decisions.length).toBe(CANDIDATE_FILTERS.length);
  });
});

describe('la verificación de agosto de 2026', () => {
  const bySlug = new Map(getAllTools().map((t) => [t.slug, t]));

  it('Midjourney no se presenta como gratuita', () => {
    const tool = bySlug.get('midjourney')!;
    expect(tool.freeModel).toBe('paid_only');
    expect(tool.freePlan.limits.join(' ')).toContain('Sin plan gratuito');
  });

  it('Leonardo lleva la cantidad y la frecuencia que publica su web', () => {
    const tool = bySlug.get('leonardo-ai')!;
    expect(tool.freeModel).toBe('credits');
    expect(tool.freePlan.creditReset).toBe('daily');
    expect(tool.freePlan.creditsAmount).toBe('150 Fast Tokens/día');
  });

  it('Grok tiene imagen en el plan gratuito y vídeo no', () => {
    const tool = bySlug.get('grok-imagine')!;
    expect(tool.freeModel).toBe('freemium');
    const limits = tool.freePlan.limits.join(' ');
    expect(limits).toContain('Generación de imágenes: incluida en el plan Free');
    expect(limits).toContain('Generación de vídeo: no incluida en el plan Free');
  });

  it('Krea no promete un uso comercial que su tabla marca como excluido', () => {
    const tool = bySlug.get('krea')!;
    expect(tool.freePlan.commercialUse).toBe('no');
  });

  it('Perplexity no entra en Imagen', () => {
    expect(bySlug.get('perplexity-ai')!.categorySlug).not.toBe('imagen');
    // Y tampoco se le atribuye una capacidad que ejecuta el modelo de otro.
    expect(bySlug.get('perplexity-ai')!.capabilities).not.toContain('text-to-image');
  });

  it('Replicate no dice tener créditos que nadie ha publicado', () => {
    const tool = bySlug.get('replicate')!;
    expect(tool.freeModel).toBe('trial');
    expect(tool.freePlan.creditsAmount).toBeUndefined();
  });
});

describe('el criterio de esfuerzo queda por escrito', () => {
  it('todas las fichas explican por qué tienen el esfuerzo que tienen', () => {
    const sin = getAllTools().filter((t) => !t.startEffortReason.trim());
    expect(sin.map((t) => t.slug)).toEqual([]);
  });

  it('el motivo es una línea, no un párrafo', () => {
    for (const tool of getAllTools()) {
      expect(tool.startEffortReason.length, tool.slug).toBeLessThanOrEqual(160);
    }
  });
});

describe('las capacidades siguen siendo comparables', () => {
  it('nadie de Imagen dice generar imágenes sin una capacidad declarada', () => {
    for (const tool of imagen) {
      if (imageCapabilityCount(tool) === 0) {
        expect(['civitai', 'comfy-cloud', 'sdnext'], tool.slug).toContain(tool.slug);
      }
    }
  });
});
