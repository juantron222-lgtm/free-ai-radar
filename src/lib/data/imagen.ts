import type { Tool } from '@lib/domain/tool';
import type { Capability } from '@lib/domain/taxonomy';

/**
 * Qué enseña la página de Imagen, y por qué en ese orden.
 *
 * Vive fuera de la plantilla porque es la parte discutible: qué cuenta como
 * «gratis ahora», qué convierte a una herramienta en profesional, qué filtro
 * merece ocupar sitio. Aquí se puede leer, contradecir y probar sin abrir un
 * navegador.
 *
 * La regla que gobierna todo el fichero: **ningún bloque ordena por una nota
 * global**. Cada uno declara su propio criterio, porque «mejor» no significa lo
 * mismo para quien quiere una imagen en treinta segundos que para quien va a
 * montar un flujo de nodos en su equipo. La nota única servía para las dos
 * preguntas a la vez, que es otra forma de decir que no servía para ninguna.
 */

/** Lo que un lector de esta categoría reconoce como «hacer algo con imágenes». */
export const IMAGE_CAPABILITIES: readonly Capability[] = [
  'text-to-image',
  'image-to-image',
  'image-editing',
  'inpainting',
  'outpainting',
  'reference-image',
  'character-consistency',
  'upscaling',
  'background-removal',
];

/** Modelos de gratuidad que un lector puede usar hoy sin pagar ni instalar. */
const USABLE_FREE = new Set(['free_real', 'freemium', 'credits']);

const has = (tool: Tool, capability: Capability) => tool.capabilities.includes(capability);

export const imageCapabilityCount = (tool: Tool) =>
  IMAGE_CAPABILITIES.filter((c) => has(tool, c)).length;

const byName = (a: Tool, b: Tool) => a.name.localeCompare(b.name, 'es');

/** Ordena de mayor a menor por una puntuación local al bloque, luego por nombre. */
function ranked(tools: readonly Tool[], weight: (tool: Tool) => number): Tool[] {
  return [...tools].sort((a, b) => weight(b) - weight(a) || byName(a, b));
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
 * El tipo de gratuidad, en las palabras que pidió el encargo.
 *
 * La cantidad y la frecuencia viajan separadas a propósito: «créditos diarios»
 * es una afirmación sobre la frecuencia y se puede hacer en cuanto la fuente
 * dice cada cuánto se renuevan. Cuántos son es otra afirmación, y si la página
 * no la publica no aparece. Media verdad concreta —«créditos»— fue justo lo que
 * dejó al catálogo anterior insinuando cuotas que nadie había prometido.
 */
export function freeAccessLabel(tool: Tool): FreeAccessLabel {
  const { creditReset, creditsAmount } = tool.freePlan;
  const amount = creditsAmount?.trim() || null;

  /*
   * «No lo publican» y no un hueco. Que el fabricante no diga cuánto da es en
   * sí mismo el dato que separa un plan que se puede planificar de uno que no,
   * y esconderlo dejaría a las dos clases con el mismo aspecto.
   */
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
      return { kind: 'Créditos sin renovación', amount, amountFallback: unpublished, tone: 'warn' };
    }
    return { kind: 'Créditos', amount, amountFallback: 'No publican cada cuánto vuelven', tone: 'neutral' };
  }

  return { kind: 'Free tier', amount, amountFallback: unpublished, tone: 'neutral' };
}

// ---------------------------------------------------------------------------
// Bloque 1 — Genera imágenes gratis ahora
// ---------------------------------------------------------------------------

/**
 * Sólo lo que se puede demostrar que genera imágenes, funciona en la nube y
 * tiene acceso gratuito utilizable hoy.
 *
 * Nada local: una instalación gratuita no es «pulsa aquí y genera», y meterla
 * aquí sería contestar otra pregunta. Nada con la gratuidad `unknown`: si no
 * hemos podido comprobarla, no puede encabezar la lista de las que sí.
 */
export function freeNow(tools: readonly Tool[]): Tool[] {
  const eligible = tools.filter(
    (t) => has(t, 'text-to-image') && t.hosting === 'cloud' && USABLE_FREE.has(t.freeModel)
  );

  /*
   * Utilidad del acceso gratuito, luego facilidad, luego amplitud.
   *
   * Dos cosas cuentan y ninguna es el precio. La primera, cada cuánto vuelve lo
   * gratuito: una cuota diaria sirve para trabajar y una mensual sirve para
   * probar. La segunda, si el fabricante publica cuánto da, porque sólo
   * entonces se puede saber de antemano si alcanza — eso premia la
   * transparencia, que es lo que este catálogo quiere premiar.
   */
  const RENEWAL: Record<string, number> = { daily: 55, weekly: 48, monthly: 44 };

  return ranked(eligible, (t) => {
    const { creditReset, creditsAmount } = t.freePlan;
    const renewal = RENEWAL[creditReset];

    let score = 0;
    if (t.freeModel === 'free_real') score += 60;
    else if (renewal) score += renewal - (creditsAmount ? 0 : 12);
    else if (t.freeModel === 'freemium') score += 35;
    else score += 20;

    /*
     * Un plan gratuito que no deja usar el resultado en un trabajo vale menos,
     * y esto sólo se aplica cuando el fabricante lo dice: `unverified` no
     * penaliza, porque no saberlo no es lo mismo que tenerlo prohibido.
     */
    if (t.freePlan.commercialUse === 'yes') score += 6;
    else if (t.freePlan.commercialUse === 'no') score -= 8;

    if (t.startEffort === 'instant') score += 12;
    score += imageCapabilityCount(t);
    return score;
  });
}

// ---------------------------------------------------------------------------
// Bloque 2 — Fáciles para empezar
// ---------------------------------------------------------------------------

/**
 * Nube, sin instalación, y con algo que hacer con imágenes.
 *
 * El requisito de al menos una capacidad de imagen es lo que hace trabajo real:
 * deja fuera a Civitai y a Comfy Cloud, que viven en esta categoría pero no son
 * sitios donde escribir y obtener una imagen. Que no sea gratis no descalifica:
 * la pregunta de este bloque es cuánto cuesta empezar, no cuánto cuesta.
 */
export function easyToStart(tools: readonly Tool[]): Tool[] {
  const eligible = tools.filter(
    (t) =>
      t.hosting === 'cloud' &&
      (t.startEffort === 'instant' || t.startEffort === 'signup') &&
      imageCapabilityCount(t) >= 1
  );

  return ranked(eligible, (t) => (t.startEffort === 'instant' ? 100 : 0) + imageCapabilityCount(t));
}

// ---------------------------------------------------------------------------
// Bloque 3 — Potentes y profesionales
// ---------------------------------------------------------------------------

/**
 * Amplitud demostrada, cueste lo que cueste.
 *
 * No es «más puntuación». El listón son seis capacidades citadas y una ficha
 * cerrada como `verified`: una herramienta entra aquí cuando podemos describir
 * lo que hace sin recurrir a adjetivos. Por eso Midjourney entra sin tener plan
 * gratuito, y por eso nada entra por ser cara.
 *
 * Sólo nube: lo local tiene su propio bloque, donde la conversación es otra.
 */
export function professional(tools: readonly Tool[]): Tool[] {
  const eligible = tools.filter(
    (t) => t.hosting === 'cloud' && t.verification === 'verified' && t.capabilities.length >= 6
  );

  return ranked(eligible, (t) => imageCapabilityCount(t) * 10 + t.capabilities.length);
}

// ---------------------------------------------------------------------------
// Bloque 4 — Local y máximo control
// ---------------------------------------------------------------------------

/**
 * Lo que se ejecuta en tu equipo, separado por cuánto cuesta ponerlo en marcha.
 *
 * `install` y `technical` no son lo mismo y presentarlos juntos sería repetir
 * el error que motivó todo esto: Fooocus se descarga y se ejecuta, ComfyUI
 * exige entorno, modelos y un grafo. Las dos son gratis y las dos son locales;
 * el trabajo que piden no se parece en nada.
 */
export function localControl(tools: readonly Tool[]): { install: Tool[]; technical: Tool[] } {
  const local = tools.filter((t) => t.hosting === 'local' || t.hosting === 'hybrid');
  const weight = (t: Tool) =>
    imageCapabilityCount(t) * 10 + (t.openSource === 'yes' ? 5 : 0) + (t.freeModel === 'free_real' ? 2 : 0);

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

// ---------------------------------------------------------------------------
// Bloque 5 — El catálogo completo
// ---------------------------------------------------------------------------

/**
 * Por orden alfabético, y eso es una decisión.
 *
 * `getToolsByCategory` devuelve las herramientas ordenadas por la nota total, y
 * usarla aquí habría colado la puntuación universal por la puerta de atrás:
 * invisible en las tarjetas pero mandando en el orden, que es la mitad de lo
 * que un ranking comunica. Los cuatro bloques de arriba son recomendaciones y
 * declaran su criterio; este es un catálogo, y un catálogo se ordena por
 * nombre para que quede claro que no está opinando.
 */
export function catalogueOrder(tools: readonly Tool[]): Tool[] {
  return [...tools].sort(byName);
}

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------

export interface ImagenFilter {
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

/** Todos los filtros candidatos, antes de comprobar si merecen enseñarse. */
export const CANDIDATE_FILTERS: readonly ImagenFilter[] = [
  {
    id: 'gratis',
    label: 'Gratis ahora',
    hint: 'Se puede usar hoy sin pagar y sin instalar nada.',
    matches: (t) => t.hosting === 'cloud' && USABLE_FREE.has(t.freeModel),
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
  { id: 'generacion', label: 'Generación', hint: 'Crea imágenes desde un texto.', matches: (t) => has(t, 'text-to-image') },
  { id: 'edicion', label: 'Edición', hint: 'Modifica una imagen existente.', matches: (t) => has(t, 'image-editing') },
  { id: 'img2img', label: 'Image-to-image', hint: 'Parte de una imagen para generar otra.', matches: (t) => has(t, 'image-to-image') },
  { id: 'referencia', label: 'Imagen de referencia', hint: 'Acepta una imagen como guía de estilo.', matches: (t) => has(t, 'reference-image') },
  { id: 'personaje', label: 'Personaje consistente', hint: 'Mantiene al mismo personaje entre imágenes.', matches: (t) => has(t, 'character-consistency') },
  { id: 'inpainting', label: 'Rellenar zonas', hint: 'Regenera una parte marcada de la imagen.', matches: (t) => has(t, 'inpainting') },
  { id: 'outpainting', label: 'Ampliar encuadre', hint: 'Extiende la imagen más allá de su borde.', matches: (t) => has(t, 'outpainting') },
  { id: 'upscaling', label: 'Escalado', hint: 'Aumenta la resolución.', matches: (t) => has(t, 'upscaling') },
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

export interface FilterDecision {
  filter: ImagenFilter;
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
 * Decide qué filtros se enseñan, y deja escrito por qué se esconde cada uno.
 *
 * Tres motivos para esconder, los tres comprobables:
 *
 *   - **el dato no consta.** «Sin tarjeta» sólo puede marcarse cuando una
 *     página oficial afirma que no la piden. Hoy la mayoría de las fichas tiene
 *     ese campo en `unverified`, así que el filtro dejaría fuera a catorce
 *     herramientas dando a entender que sí piden tarjeta, cuando lo que ocurre
 *     es que no lo sabemos. Un filtro que convierte «no consta» en «no» es peor
 *     que no tener filtro. Es la comprobación que decide, no el número de
 *     coincidencias: tres aciertos sobre tres fichas revisadas serían
 *     suficientes; tres sobre diecisiete, no.
 *
 *   - **cobertura.** Menos de dos resultados no es una elección.
 *
 *   - **redundancia.** Dos filtros que hoy seleccionan exactamente lo mismo son
 *     un filtro y un adorno. Se compara el conjunto resultante, no la
 *     definición, así que en cuanto el catálogo los separe volverán los dos.
 */
export function decideFilters(tools: readonly Tool[]): FilterDecision[] {
  const decisions: FilterDecision[] = [];
  const shownSets = new Map<string, string>();

  for (const filter of CANDIDATE_FILTERS) {
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
