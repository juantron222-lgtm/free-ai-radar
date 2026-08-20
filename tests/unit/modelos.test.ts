import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getAllTools } from '@lib/data/catalog';
import { decideFilters } from '@lib/data/category-page';
import {
  CANDIDATE_FILTERS,
  MIN_BLOQUE,
  MODEL_CAPABILITIES,
  conApiGratis,
  conPesosAbiertos,
  enChatGratis,
  modelCapabilityCount,
  modelTools,
  pequenosEnLocal,
  porApi,
  withCapability,
} from '@lib/data/modelos';

/**
 * Lo que /modelos promete, como afirmaciones ejecutables.
 *
 * Dos reglas cargan con casi todo el peso aquí, y las dos son sobre no
 * heredar: una forma de acceso no dice nada de las demás, y «pesos abiertos»
 * no dice nada sobre la licencia.
 */

const modelos = modelTools();
const bySlug = new Map(getAllTools().map((t) => [t.slug, t]));

/*
 * `evidence` y `auditNotes` no pasan por el esquema: son el registro editorial
 * y viven sólo en el fichero versionado, que es donde se revisan en un diff.
 * Para comprobarlos hay que leer la fuente, no la ficha hidratada.
 */
type Cruda = { slug: string; evidence?: Record<string, { sourceUrl: string; quote: string }> };
const crudas = new Map<string, Cruda>(
  (
    JSON.parse(
      readFileSync(fileURLToPath(new URL('../../src/data/tools-v2.json', import.meta.url)), 'utf8')
    ) as Cruda[]
  ).map((t) => [t.slug, t] as const)
);

describe('qué entra en /modelos', () => {
  it('sólo modelos, no lo que sirve para ejecutarlos', () => {
    /*
     * Ollama es la forma de ejecutar un modelo; LM Studio, una aplicación;
     * Hugging Face Spaces, un hub. Los tres vivían en `modelos-open-source` y
     * ninguno es un modelo. Es el error que esta vertical existía para cometer.
     */
    const slugs = new Set(modelos.map((t) => t.slug));
    for (const ajeno of ['ollama', 'lm-studio', 'hugging-face-spaces', 'gemini-cli']) {
      expect(slugs.has(ajeno), `${ajeno} no es un modelo`).toBe(false);
    }
  });

  it('todo lo que entra es kind model y genera texto', () => {
    for (const tool of modelos) {
      expect(tool.kind, tool.slug).toBe('model');
      expect(tool.capabilities, tool.slug).toContain('text-generation');
    }
  });

  it('los modelos de las otras verticales se quedan en las suyas', () => {
    /*
     * Whisper transcribe, Kokoro habla, Wan 2.2 genera vídeo. Son modelos, y
     * `kind` lo dice, pero no responden a lo que se viene a preguntar aquí.
     */
    const slugs = new Set(modelos.map((t) => t.slug));
    for (const otro of ['whisper', 'kokoro', 'f5-tts', 'audiocraft', 'wan-2-2', 'ltx-video']) {
      expect(slugs.has(otro), `${otro} pertenece a otra vertical`).toBe(false);
    }
  });
});

describe('las tres puertas no se heredan', () => {
  it('tener pesos abiertos no implica capa gratuita de API', () => {
    /*
     * Las dos puertas conviven —Gemma 4 tiene pesos Apache 2.0 y además sale
     * con «Free Tier: Available» en la tabla de precios de Gemini— pero una no
     * se deduce de la otra. Lo que esto vigila es que la mayoría de los
     * descargables NO tenga capa gratuita de API, que es lo que pasaría si
     * alguien decidiera rellenar el campo por analogía.
     */
    const descargables = conPesosAbiertos(modelos);
    const conAmbas = descargables.filter((t) => t.access.apiFree === 'yes');
    expect(descargables.length).toBeGreaterThan(0);
    expect(conAmbas.length, 'las dos puertas a la vez son la excepción').toBeLessThan(
      descargables.length / 2
    );

    for (const tool of conAmbas) {
      expect(crudas.get(tool.slug)?.evidence, `${tool.slug} afirma las dos: hace falta cita`).toBeTruthy();
    }
  });

  it('la capa gratuita se decide por modelo, no por fabricante', () => {
    /*
     * El caso que lo demuestra, y son dos filas de la misma tabla: Gemini
     * Flash dice «Free Tier: Available» y Gemini Pro dice «Not available».
     */
    expect(bySlug.get('gemini-3-flash')!.access.apiFree).toBe('yes');
    expect(bySlug.get('gemini-3-pro')!.access.apiFree).toBe('no');
  });

  it('una puerta sin comprobar nunca se convierte en un no', () => {
    for (const tool of modelos) {
      for (const puerta of ['chat', 'chatFree', 'api', 'apiFree', 'weights'] as const) {
        expect(['yes', 'no', 'partial', 'unverified'], `${tool.slug}.${puerta}`).toContain(
          tool.access[puerta]
        );
      }
    }
  });

  it('el bloque de gratis en la nube sólo lleva capa gratuita de API', () => {
    for (const tool of conApiGratis(modelos)) {
      expect(tool.access.apiFree, tool.slug).toBe('yes');
    }
  });

  it('el de chat gratis exige las dos cosas: que haya chat y que sea gratis', () => {
    for (const tool of enChatGratis(modelos)) {
      expect(tool.access.chat, tool.slug).toBe('yes');
      expect(tool.access.chatFree, tool.slug).toBe('yes');
    }
  });
});

describe('pesos abiertos no es open source', () => {
  it('los de licencia propia no se declaran OSI', () => {
    for (const slug of ['llama-4', 'kimi-k2', 'qwen3-max']) {
      const tool = bySlug.get(slug)!;
      expect(tool.openSource, slug).toBe('weights');
      expect(tool.access.weights, slug).toBe('yes');
    }
  });

  it('los permisivos de verdad sí', () => {
    for (const slug of ['qwen3-27b', 'glm-5', 'phi-4', 'deepseek-v4-pro', 'gemma-4']) {
      expect(bySlug.get(slug)!.openSource, slug).toBe('yes');
    }
  });

  it('la misma familia puede tener dos licencias, y se distingue', () => {
    /*
     * Qwen publica el 27B con Apache 2.0 y el grande con una licencia propia
     * llamada «qwen3.8-max». Decir «Qwen es open source» sería falso para uno
     * de los dos.
     */
    expect(bySlug.get('qwen3-27b')!.licence).toBe('Apache-2.0');
    expect(bySlug.get('qwen3-max')!.licence).toMatch(/no OSI/);
  });

  it('todo lo que dice tener pesos abiertos declara su licencia', () => {
    for (const tool of conPesosAbiertos(modelos)) {
      expect(tool.licence ?? tool.licences.weights, tool.slug).toBeTruthy();
    }
  });

  it('las condiciones de las licencias propias están citadas', () => {
    for (const slug of ['llama-4', 'kimi-k2']) {
      expect(crudas.get(slug)?.evidence?.freePlan?.quote, slug).toBeTruthy();
      expect(bySlug.get(slug)!.freePlan.commercialUse, slug).toBe('partial');
    }
  });
});

describe('bloques', () => {
  it('ninguno se levanta con menos de tres', () => {
    for (const [nombre, lista] of [
      ['código', withCapability(modelos, 'code-generation')],
      ['razonamiento', withCapability(modelos, 'reasoning')],
      ['multimodal', withCapability(modelos, 'vision')],
      ['pequeños', pequenosEnLocal(modelos)],
      ['api', porApi(modelos)],
      ['gratis por API', conApiGratis(modelos)],
    ] as const) {
      expect(lista.length, `${nombre} necesita ${MIN_BLOQUE}`).toBeGreaterThanOrEqual(MIN_BLOQUE);
    }
  });

  it('«gratis en un chat» no llega a bloque, y por eso la página lo explica', () => {
    expect(enChatGratis(modelos).length).toBeLessThan(MIN_BLOQUE);
  });

  it('cada bloque contiene sólo lo que su título dice', () => {
    for (const cap of ['code-generation', 'reasoning', 'vision'] as const) {
      for (const tool of withCapability(modelos, cap)) {
        expect(tool.capabilities, `${tool.slug} / ${cap}`).toContain(cap);
      }
    }
    for (const tool of pequenosEnLocal(modelos)) {
      expect(tool.hosting, tool.slug).not.toBe('cloud');
      expect(tool.startEffort, tool.slug).toBe('install');
    }
  });
});

describe('sin ranking de inteligencia', () => {
  it('ninguna capacidad viene de un adjetivo de marketing', () => {
    const marketing = /frontier|state of the art|más inteligente|mejor modelo/i;
    for (const tool of modelos) {
      for (const [campo, ev] of Object.entries(crudas.get(tool.slug)?.evidence ?? {})) {
        if (campo !== 'capabilities') continue;
        expect(ev.quote, `${tool.slug}: la cita no puede ser un eslogan`).not.toMatch(
          /^(the )?(most|best) /i
        );
      }
      expect(tool.tagline, tool.slug).not.toMatch(marketing);
    }
  });

  it('las capacidades que se enseñan están en el vocabulario de la vertical', () => {
    for (const tool of modelos) {
      const visibles = tool.capabilities.filter((c) =>
        (MODEL_CAPABILITIES as readonly string[]).includes(c)
      );
      expect(modelCapabilityCount(tool), tool.slug).toBe(visibles.length);
    }
  });

  it('cada modelo enseña al menos una capacidad', () => {
    for (const tool of modelos) {
      expect(modelCapabilityCount(tool), tool.slug).toBeGreaterThan(0);
    }
  });
});

describe('filtros de modelos', () => {
  const decisions = decideFilters(modelos, CANDIDATE_FILTERS);

  it('cada filtro escondido dice por qué', () => {
    for (const d of decisions.filter((x) => !x.shown)) {
      expect(d.reason, d.filter.id).not.toBe('');
    }
  });

  it('ninguno enseñado deja la lista vacía', () => {
    for (const d of decisions.filter((x) => x.shown)) {
      expect(modelos.filter(d.filter.matches).length, d.filter.id).toBeGreaterThan(0);
    }
  });

  it('no enseña dos filtros que hoy seleccionan lo mismo', () => {
    const sets = decisions
      .filter((d) => d.shown)
      .map((d) => modelos.filter(d.filter.matches).map((t) => t.slug).sort().join('|'));
    expect(new Set(sets).size).toBe(sets.length);
  });
});

describe('la verificación de modelos', () => {
  it('lo que no se pudo leer se queda sin afirmar, no en no', () => {
    /*
     * OpenAI y xAI devuelven 403 a toda lectura automática de sus páginas de
     * consumo, así que no se puede saber qué modelo sirve su plan gratuito.
     * Eso es `unverified`; ponerlo en `no` sería afirmar algo que no se ha
     * comprobado, y en la dirección contraria a la que nos beneficia.
     */
    expect(bySlug.get('gpt-5-6')!.access.chatFree).toBe('unverified');
    expect(bySlug.get('grok-4')!.access.chatFree).toBe('unverified');
  });

  it('lo que sí se leyó se afirma con su cita', () => {
    for (const slug of ['gemini-3-flash', 'gemini-3-pro', 'deepseek-v4-pro', 'qwen3-27b']) {
      const ev = crudas.get(slug)?.evidence ?? {};
      expect(Object.keys(ev).length, slug).toBeGreaterThan(0);
      for (const prueba of Object.values(ev)) {
        expect(prueba.sourceUrl, slug).toMatch(/^https:\/\//);
        expect(prueba.quote, slug).not.toBe('');
      }
    }
  });

  it('ningún modelo de pago se disfraza de gratuito', () => {
    for (const slug of ['gpt-5-6', 'gemini-3-pro', 'grok-4', 'claude-opus-5']) {
      expect(bySlug.get(slug)!.freeModel, slug).toBe('paid_only');
    }
  });

  it('el precio, cuando se enseña, dice de qué versión es', () => {
    for (const slug of ['gpt-5-6', 'claude-opus-5', 'gemini-3-pro']) {
      const limites = bySlug.get(slug)!.freePlan.limits.join(' ');
      expect(limites, slug).toMatch(/\$|\/M/);
    }
  });
});
