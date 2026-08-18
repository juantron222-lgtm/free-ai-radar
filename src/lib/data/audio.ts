import type { Tool } from '@lib/domain/tool';
import type { Capability } from '@lib/domain/taxonomy';
import { getToolsByCategory } from './catalog';
import {
  ACCESS_FILTERS,
  FACT_FILTERS,
  capabilityFilter,
  countIn,
  has,
  ranked,
  usableFreeNow,
  localControl as localControlImpl,
  type CategoryFilter,
} from './category-page';

/**
 * Audio: una experiencia pública, dos categorías técnicas.
 *
 * `musica` y `voz` siguen existiendo como `categorySlug` —sirven para la
 * taxonomía, los filtros y el explorador general— pero como páginas separadas
 * no respondían a nada: una ficha cada una. Y la persona que busca «generar voz
 * gratis» no sabe si eso vive en «voz» o en «audio».
 *
 * Lo que unifica la página son las intenciones, no las etiquetas. Crear música,
 * generar voz, clonarla y transcribir son cuatro encargos distintos, y una
 * herramienta puede responder a varios sin que exista una segunda ficha.
 */

/** Las dos categorías técnicas que alimentan esta página. */
export const AUDIO_SLUGS = ['musica', 'voz'] as const;

/** Todo lo que esta página considera trabajo de audio, en orden de tarjeta. */
export const AUDIO_CAPABILITIES: readonly Capability[] = [
  'text-to-music',
  'text-to-speech',
  'voice-clone',
  'speech-to-speech',
  'dubbing',
  'sound-effects',
  'transcription',
  'audio-editing',
];

/**
 * Reúne las dos categorías sin repetir fichas.
 *
 * Una herramienta puede estar en `musica` y tener `voz` como secundaria —
 * ElevenLabs lo está— así que la unión tiene que deduplicar por slug o la
 * misma tarjeta aparecería dos veces en el catálogo completo.
 */
export function audioTools(): Tool[] {
  const porSlug = new Map<string, Tool>();
  for (const slug of AUDIO_SLUGS) {
    for (const tool of getToolsByCategory(slug)) porSlug.set(tool.slug, tool);
  }
  return [...porSlug.values()];
}

export const audioCapabilityCount = (tool: Tool): number => countIn(tool, AUDIO_CAPABILITIES);

// ---------------------------------------------------------------------------
// Bloques
// ---------------------------------------------------------------------------

/**
 * Lo que se puede usar hoy sin pagar ni instalar.
 *
 * Y con una advertencia que en audio pesa más que en ninguna otra vertical: de
 * las plataformas gratuitas más relevantes, tres declaran que su plan gratuito
 * no permite uso comercial. El orden lo tiene en cuenta, pero ninguna se
 * excluye por ello: seguir gratis y servir para aprender es información útil,
 * siempre que la tarjeta diga la condición.
 */
export function freeNow(tools: readonly Tool[]): Tool[] {
  const eligible = tools.filter((t) => usableFreeNow(t) && audioCapabilityCount(t) > 0);

  const RENEWAL: Record<string, number> = { daily: 55, weekly: 48, monthly: 44 };

  return ranked(eligible, (t) => {
    const { creditReset, creditsAmount } = t.freePlan;
    const renewal = RENEWAL[creditReset];

    let score = 0;
    if (t.freeModel === 'free_real') score += 60;
    else if (renewal) score += renewal - (creditsAmount ? 0 : 12);
    else if (t.freeModel === 'freemium') score += 35;
    else score += 20;

    if (t.freePlan.commercialUse === 'yes') score += 8;
    else if (t.freePlan.commercialUse === 'no') score -= 10;

    if (t.startEffort === 'instant') score += 12;
    score += audioCapabilityCount(t);
    return score;
  });
}

/** Un bloque por intención: sólo las que tienen esa capacidad citada. */
export function withCapability(tools: readonly Tool[], capability: Capability): Tool[] {
  return ranked(
    tools.filter((t) => has(t, capability)),
    (t) => audioCapabilityCount(t) * 10 + (usableFreeNow(t) ? 8 : 0)
  );
}

/**
 * Amplitud demostrada, cueste lo que cueste.
 *
 * Mismo listón que en las otras verticales: capacidades citadas y ficha
 * cerrada. No es «más puntuación».
 */
export function professional(tools: readonly Tool[]): Tool[] {
  const eligible = tools.filter(
    (t) => t.hosting === 'cloud' && t.verification === 'verified' && audioCapabilityCount(t) >= 3
  );
  return ranked(eligible, (t) => audioCapabilityCount(t) * 10 + t.capabilities.length);
}

export function localControl(tools: readonly Tool[]): { install: Tool[]; technical: Tool[] } {
  return localControlImpl(tools, AUDIO_CAPABILITIES);
}

/**
 * Cuántas fichas responden a una intención.
 *
 * La página sólo levanta un bloque cuando hay catálogo que lo sostenga: un
 * bloque de una tarjeta no es una recomendación, es un hueco con título.
 */
export const MIN_BLOQUE = 3;

// ---------------------------------------------------------------------------
// Filtros de Audio
// ---------------------------------------------------------------------------

export const CANDIDATE_FILTERS: readonly CategoryFilter[] = [
  ...ACCESS_FILTERS,
  capabilityFilter('musica', 'Crear música', 'Compone desde una descripción.', 'text-to-music'),
  capabilityFilter('voz', 'Generar voz', 'Convierte texto en habla.', 'text-to-speech'),
  capabilityFilter('clonar', 'Clonar voz', 'Reproduce una voz a partir de una muestra.', 'voice-clone'),
  capabilityFilter('doblaje', 'Doblaje', 'Traduce y sincroniza voz sobre un original.', 'dubbing'),
  capabilityFilter('efectos', 'Efectos de sonido', 'Genera sonidos que no son voz ni música.', 'sound-effects'),
  capabilityFilter('transcribir', 'Transcripción', 'Pasa audio a texto.', 'transcription'),
  capabilityFilter('editar', 'Edición de audio', 'Retoca material ya grabado.', 'audio-editing'),
  ...FACT_FILTERS,
];
