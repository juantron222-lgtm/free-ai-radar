import type { Tool } from './tool';
import type { Capability } from './taxonomy';

/**
 * En qué estado está de verdad una ficha, y qué puede decir de sí misma.
 *
 * Hasta ahora la ficha titulaba su tabla «Condiciones verificadas del plan
 * gratuito» y unas filas más abajo escribía «Sin verificar» tres veces. Las dos
 * cosas eran ciertas por separado y juntas eran una contradicción: la primera
 * afirmaba de la ficha entera lo que sólo valía para una parte.
 *
 * La regla de aquí decide qué puede decir cada ficha, y está pensada para que
 * el lector pueda comprobarla: si ve un «Sin confirmar» en la tabla, la ficha
 * no puede llamarse verificada. Ese es todo el contrato.
 */

export type VerificationState = 'verificada' | 'parcial' | 'catalogada';

export const VERIFICATION_STATE_LABEL: Record<VerificationState, string> = {
  verificada: 'Verificada',
  parcial: 'Verificación parcial',
  catalogada: 'Catalogada',
};

export const VERIFICATION_STATE_MEANING: Record<VerificationState, string> = {
  verificada:
    'Comprobada contra la página oficial, y todos los hechos que le aplican están confirmados.',
  parcial:
    'Comprobada contra la página oficial, pero su fabricante no publica alguno de los hechos que resumimos. Lo que falta aparece como «Sin confirmar» en la tabla.',
  catalogada:
    'Está en el catálogo, pero su acceso gratuito todavía no se ha comprobado contra la fuente oficial.',
};

/**
 * La marca de agua sólo aplica a lo que produce un archivo.
 *
 * Preguntarle a Ollama si deja marca de agua no tiene respuesta, así que
 * contarlo como un hueco haría que un runtime pareciera peor documentado de lo
 * que está. Un campo que no aplica no es un campo que falta.
 */
const GENERA_MEDIOS: readonly Capability[] = [
  'text-to-image',
  'image-to-image',
  'image-editing',
  'inpainting',
  'outpainting',
  'upscaling',
  'background-removal',
  'text-to-video',
  'image-to-video',
  'video-editing',
  'avatar-video',
  'text-to-speech',
  'voice-clone',
  'text-to-music',
  'sound-effects',
  'dubbing',
];

const SIN_CONFIRMAR = new Set(['unverified', 'unknown']);

export interface HechoCritico {
  key: string;
  label: string;
  confirmado: boolean;
}

/**
 * Los hechos que esta ficha promete y que por tanto tiene que sostener.
 *
 * Tres valen para todo —si hay que registrarse, si piden tarjeta y si permite
 * uso comercial— y el cuarto sólo para lo que genera archivos.
 */
export function hechosCriticos(tool: Tool): HechoCritico[] {
  const { freePlan } = tool;
  const hechos: HechoCritico[] = [
    { key: 'requiresSignup', label: '¿Hay que registrarse?', confirmado: !SIN_CONFIRMAR.has(freePlan.requiresSignup) },
    { key: 'requiresCreditCard', label: '¿Pide tarjeta?', confirmado: !SIN_CONFIRMAR.has(freePlan.requiresCreditCard) },
    { key: 'commercialUse', label: '¿Uso comercial?', confirmado: !SIN_CONFIRMAR.has(freePlan.commercialUse) },
  ];

  if (tool.capabilities.some((c) => (GENERA_MEDIOS as readonly string[]).includes(c))) {
    hechos.push({
      key: 'hasWatermark',
      label: '¿Marca de agua?',
      confirmado: !SIN_CONFIRMAR.has(freePlan.hasWatermark),
    });
  }

  return hechos;
}

export interface Verificacion {
  state: VerificationState;
  label: string;
  meaning: string;
  /** Cuántos hechos aplicables están confirmados, y sobre cuántos. */
  confirmados: number;
  total: number;
  /** Los que faltan, para poder nombrarlos en vez de insinuarlos. */
  pendientes: HechoCritico[];
}

/**
 * El estado público de una ficha.
 *
 * `verificada` exige las dos cosas a la vez: que una persona la haya
 * contrastado con la fuente oficial —eso es `verification`— y que no quede
 * ningún hecho aplicable sin confirmar. Basta un «Sin confirmar» visible en la
 * tabla para que la ficha deje de poder llamarse verificada, que es
 * exactamente lo que un lector comprobaría.
 */
export function verificacionDe(tool: Tool): Verificacion {
  const hechos = hechosCriticos(tool);
  const pendientes = hechos.filter((h) => !h.confirmado);
  const confirmados = hechos.length - pendientes.length;

  const sinComprobar =
    tool.verification === 'pending_review' ||
    tool.verification === 'outdated' ||
    tool.freeModel === 'unknown';

  const state: VerificationState = sinComprobar
    ? 'catalogada'
    : pendientes.length === 0 && tool.verification === 'verified'
      ? 'verificada'
      : 'parcial';

  return {
    state,
    label: VERIFICATION_STATE_LABEL[state],
    meaning: VERIFICATION_STATE_MEANING[state],
    confirmados,
    total: hechos.length,
    pendientes,
  };
}

export interface RecuentoVerificacion {
  total: number;
  verificada: number;
  parcial: number;
  catalogada: number;
  /** Con acceso gratuito comprobado y utilizable hoy, sin instalar. */
  accesoGratuitoConfirmado: number;
  /** Sin plan gratuito: están para decir que no lo tienen. */
  sinPlanGratuito: number;
}

const GRATIS_UTILIZABLE = new Set(['free_real', 'freemium', 'credits', 'open_source', 'local']);

export function recuentoVerificacion(tools: readonly Tool[]): RecuentoVerificacion {
  const recuento: RecuentoVerificacion = {
    total: tools.length,
    verificada: 0,
    parcial: 0,
    catalogada: 0,
    accesoGratuitoConfirmado: 0,
    sinPlanGratuito: 0,
  };

  for (const tool of tools) {
    recuento[verificacionDe(tool).state] += 1;

    if (tool.freeModel === 'paid_only') recuento.sinPlanGratuito += 1;
    else if (GRATIS_UTILIZABLE.has(tool.freeModel) && tool.verification !== 'pending_review') {
      recuento.accesoGratuitoConfirmado += 1;
    }
  }

  return recuento;
}
