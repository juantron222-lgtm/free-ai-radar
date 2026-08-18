import type { Tool } from '@lib/domain/tool';
import type { Capability } from '@lib/domain/taxonomy';
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
 * Qué enseña la página de Vídeo, y por qué en ese orden.
 *
 * Mismo método que Imagen —los cimientos están en `category-page.ts`— y bloques
 * distintos, porque las intenciones no son las mismas. En imagen casi todo el
 * mundo viene a generar; en vídeo hay al menos tres viajes que no se parecen:
 * generar un plano, poner a una persona a hablar a cámara, y montar material ya
 * grabado. Copiar los cinco bloques de Imagen habría metido a HeyGen y a
 * Descript en «genera vídeos gratis», donde no responden a lo que se pregunta.
 */

/** Generar vídeo: lo que un lector reconoce como «hacer un plano». */
export const VIDEO_GENERATION: readonly Capability[] = [
  'text-to-video',
  'image-to-video',
  'reference-to-video',
];

/** Todo lo que esta categoría considera trabajo de vídeo. */
export const VIDEO_CAPABILITIES: readonly Capability[] = [
  ...VIDEO_GENERATION,
  'video-editing',
  'video-extend',
  'video-upscaling',
  'lip-sync',
  'avatar-video',
  'native-audio',
];

export const videoCapabilityCount = (tool: Tool): number => countIn(tool, VIDEO_CAPABILITIES);

/** Si genera vídeo, frente a editarlo o poner un avatar a hablar. */
export const generatesVideo = (tool: Tool): boolean => countIn(tool, VIDEO_GENERATION) > 0;

// ---------------------------------------------------------------------------
// Bloque 1 — Genera vídeos gratis ahora
// ---------------------------------------------------------------------------

/**
 * Genera vídeo, en la nube, y su acceso gratuito sirve hoy.
 *
 * `usableFreeNow` deja fuera lo local y también los créditos `one_off`. Eso
 * último importa especialmente aquí: Runway da 125 créditos que se gastan y no
 * vuelven, y un bloque que promete «gratis ahora» no puede encabezarse con algo
 * que se acaba a la primera tarde.
 */
export function freeNow(tools: readonly Tool[]): Tool[] {
  const eligible = tools.filter((t) => generatesVideo(t) && usableFreeNow(t));

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
     * En vídeo el uso comercial pesa más que en imagen, y por eso vale la pena
     * decir por qué: Kling declara que su plan gratuito no permite usar
     * comercialmente lo generado. Quien busca un plano para un cliente necesita
     * verlo antes de invertir media tarde, no después.
     */
    if (t.freePlan.commercialUse === 'yes') score += 8;
    else if (t.freePlan.commercialUse === 'no') score -= 12;

    // Una marca de agua confirmada como ausente es un dato escaso y decisivo.
    if (t.freePlan.hasWatermark === 'no') score += 6;

    if (t.startEffort === 'instant') score += 12;
    score += countIn(t, VIDEO_GENERATION) * 2;
    return score;
  });
}

// ---------------------------------------------------------------------------
// Bloque 2 — Fáciles para empezar
// ---------------------------------------------------------------------------

/** Nube, sin instalación, y con algo que hacer con vídeo. */
export function easyToStart(tools: readonly Tool[]): Tool[] {
  const eligible = tools.filter(
    (t) =>
      t.hosting === 'cloud' &&
      (t.startEffort === 'instant' || t.startEffort === 'signup') &&
      videoCapabilityCount(t) >= 1
  );

  return ranked(eligible, (t) => (t.startEffort === 'instant' ? 100 : 0) + videoCapabilityCount(t));
}

// ---------------------------------------------------------------------------
// Bloque 3 — Una persona hablando a cámara
// ---------------------------------------------------------------------------

/**
 * Avatares, sincronía labial y doblaje: un viaje distinto del de generar un
 * plano.
 *
 * Existe como bloque propio porque quien necesita un vídeo corporativo con una
 * persona explicando algo no está eligiendo entre Runway y Pika, y mezclarlos
 * obliga a comparar cosas que no compiten. Es la lección de Imagen aplicada a
 * otra forma: la categoría dice de qué trata, la capacidad dice qué le puedes
 * pedir.
 */
export function talkingHead(tools: readonly Tool[]): Tool[] {
  const eligible = tools.filter((t) => has(t, 'avatar-video') || has(t, 'lip-sync'));
  return ranked(eligible, (t) => videoCapabilityCount(t) * 10 + (usableFreeNow(t) ? 5 : 0));
}

// ---------------------------------------------------------------------------
// Bloque 4 — Potentes y profesionales
// ---------------------------------------------------------------------------

/**
 * Amplitud demostrada, cueste lo que cueste.
 *
 * Mismo listón que en Imagen y misma advertencia: no es «más puntuación». Entra
 * lo que podemos describir con capacidades citadas y ficha cerrada, y por eso
 * entra Luma sin tener plan gratuito.
 */
export function professional(tools: readonly Tool[]): Tool[] {
  const eligible = tools.filter(
    (t) => t.hosting === 'cloud' && t.verification === 'verified' && videoCapabilityCount(t) >= 3
  );

  return ranked(eligible, (t) => videoCapabilityCount(t) * 10 + t.capabilities.length);
}

// ---------------------------------------------------------------------------
// Bloque 5 — En tu equipo
// ---------------------------------------------------------------------------

export function localControl(tools: readonly Tool[]): { install: Tool[]; technical: Tool[] } {
  return localControlImpl(tools, VIDEO_CAPABILITIES);
}

/**
 * Cuánta memoria de vídeo pide, cuando el repositorio lo publica.
 *
 * En vídeo local esta cifra decide más que cualquier otra cosa: entre los 24 GB
 * de la variante pequeña de Wan y los 60 GB de HunyuanVideo está la frontera
 * entre «cabe en mi ordenador» y «no». Se enseña tal cual la declara el
 * repositorio, sin convertirla en una etiqueta de dificultad.
 */
export function hardwareNote(tool: Tool): string | null {
  return tool.hardwareRequirements?.trim() || null;
}

// ---------------------------------------------------------------------------
// Filtros de Vídeo
// ---------------------------------------------------------------------------

export const CANDIDATE_FILTERS: readonly CategoryFilter[] = [
  ...ACCESS_FILTERS,
  capabilityFilter('t2v', 'Texto a vídeo', 'Crea un vídeo desde una descripción.', 'text-to-video'),
  capabilityFilter('i2v', 'Imagen a vídeo', 'Anima una imagen fija.', 'image-to-video'),
  capabilityFilter('ref2v', 'Referencia a vídeo', 'Acepta imágenes de referencia para guiar el resultado.', 'reference-to-video'),
  capabilityFilter('edicion', 'Edición de vídeo', 'Monta o retoca material ya grabado.', 'video-editing'),
  capabilityFilter('extender', 'Alargar el vídeo', 'Continúa un plano más allá de su final.', 'video-extend'),
  capabilityFilter('avatar', 'Vídeo con avatar', 'Una persona sintética hablando a cámara.', 'avatar-video'),
  capabilityFilter('lipsync', 'Sincronía labial', 'Ajusta la boca al audio, para doblaje o traducción.', 'lip-sync'),
  capabilityFilter('escalado', 'Escalado de vídeo', 'Aumenta la resolución del resultado.', 'video-upscaling'),
  capabilityFilter('audio', 'Audio con el vídeo', 'Genera sonido junto con la imagen.', 'native-audio'),
  ...FACT_FILTERS,
];
