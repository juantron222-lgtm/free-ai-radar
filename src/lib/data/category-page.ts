import type { Tool } from '@lib/domain/tool';
import type { Capability } from '@lib/domain/taxonomy';

/**
 * El método de `/imagen`, separado de la categoría que lo estrenó.
 *
 * Vídeo necesita los mismos cimientos —cómo se nombra la gratuidad, cómo se
 * decide qué filtros merecen enseñarse, qué orden usa un catálogo que no
 * quiere opinar— pero sus bloques y sus capacidades son otros. Copiar
 * `imagen.ts` habría creado la quinta pareja de reglas duplicadas de este
 * repositorio, y ya sabemos cómo acaba: una de las dos envejece y nadie se
 * entera hasta que alguien mide.
 *
 * Lo que vive aquí es lo que no depende de la vertical. Lo que cambia entre
 * verticales —qué capacidades importan, qué bloques responden a qué intención,
 * qué filtros tienen sentido— lo declara cada categoría en su propio módulo.
 */

/** Modelos de gratuidad que un lector puede usar hoy sin pagar ni instalar. */
export const USABLE_FREE: ReadonlySet<string> = new Set(['free_real', 'freemium', 'credits']);

export const has = (tool: Tool, capability: Capability): boolean =>
  tool.capabilities.includes(capability);

/** Cuántas capacidades del dominio de esta categoría tiene la herramienta. */
export const countIn = (tool: Tool, domain: readonly Capability[]): number =>
  domain.filter((c) => has(tool, c)).length;

export const byName = (a: Tool, b: Tool): number => a.name.localeCompare(b.name, 'es');

/** Ordena de mayor a menor por una puntuación local al bloque, luego por nombre. */
export function ranked(tools: readonly Tool[], weight: (tool: Tool) => number): Tool[] {
  return [...tools].sort((a, b) => weight(b) - weight(a) || byName(a, b));
}

/**
 * Por orden alfabético, y eso es una decisión.
 *
 * `getToolsByCategory` devuelve las herramientas ordenadas por la nota total, y
 * usarla para el catálogo completo colaría la puntuación universal por la
 * puerta de atrás: invisible en las tarjetas pero mandando en el orden, que es
 * la mitad de lo que un ranking comunica. Los bloques de arriba son
 * recomendaciones y declaran su criterio; un catálogo se ordena por nombre para
 * que quede claro que no está opinando.
 */
export function catalogueOrder(tools: readonly Tool[]): Tool[] {
  return [...tools].sort(byName);
}

// ---------------------------------------------------------------------------
// Cómo se nombra la gratuidad
// ---------------------------------------------------------------------------

export interface FreeAccessLabel {
  /** Qué clase de gratuidad es. Nunca una cantidad inventada. */
  kind: string;
  /** La cantidad, sólo si el fabricante la publica. */
  amount: string | null;
  /** Qué poner donde iría la cantidad cuando no consta. */
  amountFallback: string;
  tone: 'good' | 'neutral' | 'warn';
}

/** «Créditos diarios», no «Créditos diaria»: el adjetivo concuerda con créditos. */
const RENEWAL_ADJECTIVE: Record<string, string> = {
  daily: 'diarios',
  weekly: 'semanales',
  monthly: 'mensuales',
};

/**
 * El tipo de gratuidad, en palabras que un lector puede usar para decidir.
 *
 * La cantidad y la frecuencia viajan separadas a propósito: «créditos
 * mensuales» es una afirmación sobre la frecuencia y se puede hacer en cuanto
 * la fuente dice cada cuánto vuelven. Cuántos son es otra afirmación, y si la
 * página no la publica no aparece. Media verdad concreta —«créditos»— fue justo
 * lo que dejó al catálogo anterior insinuando cuotas que nadie había prometido.
 *
 * `credits` + `one_off` merece su propio nombre y su propio tono. Runway da 125
 * créditos que se gastan y no vuelven; llamar a eso «créditos gratis», como
 * hacía la ficha anterior, promete una cuota que no existe.
 */
export function freeAccessLabel(tool: Tool): FreeAccessLabel {
  const { creditReset, creditsAmount } = tool.freePlan;
  const amount = creditsAmount?.trim() || null;
  const unpublished = 'No publican la cantidad';

  if (tool.freeModel === 'free_real' || tool.freeModel === 'open_source') {
    return { kind: 'Gratis', amount: null, amountFallback: 'Sin cuotas', tone: 'good' };
  }
  if (tool.freeModel === 'local') {
    return { kind: 'Gratis en local', amount: null, amountFallback: 'Sin cuotas', tone: 'good' };
  }
  if (tool.freeModel === 'trial') {
    return { kind: 'Prueba', amount, amountFallback: 'Duración no publicada', tone: 'warn' };
  }
  if (tool.freeModel === 'paid_only') {
    return { kind: 'Sin plan gratuito', amount: null, amountFallback: 'Sólo de pago', tone: 'warn' };
  }
  if (tool.freeModel === 'demo') {
    return { kind: 'Demo', amount, amountFallback: unpublished, tone: 'warn' };
  }
  if (tool.freeModel === 'unknown') {
    return { kind: 'Sin confirmar', amount: null, amountFallback: 'Sin comprobar', tone: 'neutral' };
  }

  if (tool.freeModel === 'credits') {
    const adjective = RENEWAL_ADJECTIVE[creditReset];
    if (adjective) {
      return { kind: `Créditos ${adjective}`, amount, amountFallback: unpublished, tone: 'neutral' };
    }
    if (creditReset === 'one_off') {
      return { kind: 'Créditos que no vuelven', amount, amountFallback: unpublished, tone: 'warn' };
    }
    return { kind: 'Créditos', amount, amountFallback: 'No publican cada cuánto vuelven', tone: 'neutral' };
  }

  return { kind: 'Free tier', amount, amountFallback: unpublished, tone: 'neutral' };
}

/**
 * Si su acceso gratuito sirve para trabajar hoy, sin instalar ni pagar.
 *
 * `one_off` queda fuera: unos créditos que se gastan y no vuelven sirven para
 * probar, y un bloque que promete «gratis ahora» no debería contarlos.
 */
export function usableFreeNow(tool: Tool): boolean {
  if (tool.hosting !== 'cloud') return false;
  if (!USABLE_FREE.has(tool.freeModel)) return false;
  return !(tool.freeModel === 'credits' && tool.freePlan.creditReset === 'one_off');
}

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------

export interface CategoryFilter {
  id: string;
  label: string;
  /** Lo que el lector debe entender que selecciona. */
  hint: string;
  matches: (tool: Tool) => boolean;
  /**
   * Para los filtros que leen un hecho de tres estados: si ese hecho consta.
   *
   * Un filtro sobre `capabilities` u `hosting` siempre sabe la respuesta —o la
   * capacidad está declarada o no lo está—. Uno sobre `requiresCreditCard` no:
   * `unverified` significa que no lo hemos comprobado, y filtrar sobre eso
   * convierte «no consta» en «sí la pide» para todo lo que queda fuera.
   */
  resolved?: (tool: Tool) => boolean;
}

export interface FilterDecision {
  filter: CategoryFilter;
  count: number;
  shown: boolean;
  /** Por qué se ha escondido. Vacío cuando se enseña. */
  reason: string;
}

/** Por debajo de esto un filtro promete una elección que no existe. */
const MIN_COVERAGE = 2;

/**
 * Cuánto del catálogo debe tener el dato resuelto para poder filtrar por él.
 *
 * Por debajo de la mitad, lo que el filtro esconde no es «las que no cumplen»
 * sino «las que no hemos mirado», y el lector no tiene forma de distinguirlo.
 */
const MIN_RESOLVED = 0.5;

/**
 * Filtros que toda categoría quiere, porque preguntan por la forma de acceso y
 * no por lo que la herramienta sabe hacer.
 */
export const ACCESS_FILTERS: readonly CategoryFilter[] = [
  {
    id: 'gratis',
    label: 'Gratis ahora',
    hint: 'Se puede usar hoy sin pagar y sin instalar nada.',
    matches: usableFreeNow,
  },
  {
    id: 'renovables',
    label: 'Créditos renovables',
    hint: 'El fabricante publica cada cuánto vuelven los créditos.',
    matches: (t) => ['daily', 'weekly', 'monthly'].includes(t.freePlan.creditReset),
  },
  { id: 'online', label: 'Online', hint: 'Funciona en el navegador.', matches: (t) => t.hosting === 'cloud' },
  {
    id: 'local',
    label: 'Local',
    hint: 'Se ejecuta en tu equipo.',
    matches: (t) => t.hosting === 'local' || t.hosting === 'hybrid',
  },
  {
    id: 'facil',
    label: 'Fácil para empezar',
    hint: 'En la nube y sin instalación previa.',
    matches: (t) => t.hosting === 'cloud' && (t.startEffort === 'instant' || t.startEffort === 'signup'),
  },
  {
    id: 'open-source',
    label: 'Open source',
    hint: 'Licencia abierta comprobada en el repositorio.',
    matches: (t) => t.openSource === 'yes',
    resolved: (t) => t.openSource !== 'unverified',
  },
];

/**
 * Filtros sobre hechos de tres estados. Van al final porque casi siempre se
 * esconden: son justo los datos que ningún fabricante publica.
 */
export const FACT_FILTERS: readonly CategoryFilter[] = [
  {
    id: 'sin-tarjeta',
    label: 'Sin tarjeta',
    hint: 'Confirmado que no piden tarjeta para el plan gratuito.',
    matches: (t) => t.freePlan.requiresCreditCard === 'no',
    resolved: (t) => t.freePlan.requiresCreditCard !== 'unverified',
  },
  {
    id: 'sin-marca',
    label: 'Sin marca de agua',
    hint: 'Confirmado que el resultado sale limpio.',
    matches: (t) => t.freePlan.hasWatermark === 'no',
    resolved: (t) => t.freePlan.hasWatermark !== 'unverified',
  },
  {
    id: 'comercial',
    label: 'Uso comercial',
    hint: 'Confirmado que puedes usar lo que generes en un trabajo.',
    matches: (t) => t.freePlan.commercialUse === 'yes',
    resolved: (t) => t.freePlan.commercialUse !== 'unverified',
  },
];

/** Construye un filtro por capacidad, que es el caso más repetido. */
export function capabilityFilter(
  id: string,
  label: string,
  hint: string,
  capability: Capability
): CategoryFilter {
  return { id, label, hint, matches: (t) => has(t, capability) };
}

/**
 * Decide qué filtros se enseñan, y deja escrito por qué se esconde cada uno.
 *
 * Tres motivos para esconder, los tres comprobables:
 *
 *   - **el dato no consta.** «Sin tarjeta» sólo puede marcarse cuando una
 *     página oficial afirma que no la piden. Cuando la mayoría de las fichas
 *     tiene ese campo en `unverified`, el filtro deja fuera a herramientas
 *     dando a entender que sí la piden, cuando lo que ocurre es que no lo
 *     sabemos. Un filtro que convierte «no consta» en «no» es peor que no tener
 *     filtro. Decide la proporción de datos resueltos, no el número de
 *     coincidencias: tres aciertos sobre tres fichas revisadas bastarían; tres
 *     sobre diecisiete, no.
 *
 *   - **cobertura.** Menos de dos resultados no es una elección.
 *
 *   - **redundancia.** Dos filtros que hoy seleccionan exactamente lo mismo son
 *     un filtro y un adorno. Se compara el conjunto resultante, no la
 *     definición, así que en cuanto el catálogo los separe volverán los dos.
 */
export function decideFilters(
  tools: readonly Tool[],
  candidates: readonly CategoryFilter[]
): FilterDecision[] {
  const decisions: FilterDecision[] = [];
  const shownSets = new Map<string, string>();

  for (const filter of candidates) {
    const matched = tools.filter(filter.matches);
    const count = matched.length;

    if (filter.resolved) {
      const known = tools.filter(filter.resolved).length;
      if (tools.length > 0 && known / tools.length < MIN_RESOLVED) {
        decisions.push({
          filter,
          count,
          shown: false,
          reason: `sólo ${known} de ${tools.length} fichas tienen ese dato confirmado, así que el filtro escondería lo no comprobado como si fuese un «no»`,
        });
        continue;
      }
    }

    if (count < MIN_COVERAGE) {
      decisions.push({
        filter,
        count,
        shown: false,
        reason:
          count === 0
            ? 'ninguna ficha lo cumple de forma verificada'
            : `sólo ${count} ficha${count === 1 ? '' : 's'} lo cumple${count === 1 ? '' : 'n'}: no llega a ser una elección`,
      });
      continue;
    }

    const key = matched
      .map((t) => t.slug)
      .sort()
      .join('|');
    const twin = shownSets.get(key);
    if (twin) {
      decisions.push({ filter, count, shown: false, reason: `hoy selecciona lo mismo que «${twin}»` });
      continue;
    }

    shownSets.set(key, filter.label);
    decisions.push({ filter, count, shown: true, reason: '' });
  }

  return decisions;
}

/**
 * Lo local nunca entra en «gratis ahora», y esa separación es global.
 *
 * Quien pulsa «puedo usarla gratis» no quiere que le contesten «instala Python,
 * descarga veinte gigas y configura CUDA». Las dos cosas son gratis y no son la
 * misma oferta.
 */
export function cloudOnly(tools: readonly Tool[]): Tool[] {
  return tools.filter((t) => t.hosting === 'cloud');
}

/** Lo que se ejecuta en el equipo del lector, separado por lo que cuesta montarlo. */
export function localControl(
  tools: readonly Tool[],
  domain: readonly Capability[]
): { install: Tool[]; technical: Tool[] } {
  const local = tools.filter((t) => t.hosting === 'local' || t.hosting === 'hybrid');
  const weight = (t: Tool) =>
    countIn(t, domain) * 10 + (t.openSource === 'yes' ? 5 : 0) + (t.freeModel === 'free_real' ? 2 : 0);

  return {
    install: ranked(
      local.filter((t) => t.startEffort === 'install'),
      weight
    ),
    technical: ranked(
      local.filter((t) => t.startEffort !== 'install'),
      weight
    ),
  };
}
