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
 * Qué enseña la página de Imagen, y por qué en ese orden.
 *
 * Los cimientos —cómo se nombra la gratuidad, qué filtros merecen enseñarse,
 * cómo se ordena un catálogo que no quiere opinar— viven en `category-page.ts`,
 * compartidos con las demás verticales. Aquí queda lo propio de Imagen: qué
 * capacidades cuentan y qué bloques responden a qué intención.
 *
 * La regla que gobierna: **ningún bloque ordena por una nota global**. Cada uno
 * declara su criterio, porque «mejor» no significa lo mismo para quien quiere
 * una imagen en treinta segundos que para quien va a montar un flujo de nodos.
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

export const imageCapabilityCount = (tool: Tool): number => countIn(tool, IMAGE_CAPABILITIES);

// Reexportado para que las páginas y las pruebas de Imagen no tengan que saber
// dónde vive cada pieza del método.
export {
  catalogueOrder,
  decideFilters,
  freeAccessLabel,
  type FilterDecision,
  type FreeAccessLabel,
  type CategoryFilter,
} from './category-page';

// ---------------------------------------------------------------------------
// Bloque 1 — Genera imágenes gratis ahora
// ---------------------------------------------------------------------------

/**
 * Sólo lo que se puede demostrar que genera imágenes, funciona en la nube y
 * tiene acceso gratuito utilizable hoy.
 *
 * Nada local: una instalación gratuita no es «pulsa aquí y genera». Nada con la
 * gratuidad `unknown`: si no hemos podido comprobarla, no puede encabezar la
 * lista de las que sí.
 */
export function freeNow(tools: readonly Tool[]): Tool[] {
  const eligible = tools.filter((t) => has(t, 'text-to-image') && usableFreeNow(t));

  /*
   * Utilidad del acceso gratuito, luego facilidad, luego amplitud.
   *
   * Dos cosas cuentan y ninguna es el precio. La primera, cada cuánto vuelve lo
   * gratuito: una cuota diaria sirve para trabajar y una mensual sirve para
   * probar. La segunda, si el fabricante publica cuánto da, porque sólo
   * entonces se puede saber de antemano si alcanza.
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

export function localControl(tools: readonly Tool[]): { install: Tool[]; technical: Tool[] } {
  return localControlImpl(tools, IMAGE_CAPABILITIES);
}

// ---------------------------------------------------------------------------
// Filtros de Imagen
// ---------------------------------------------------------------------------

export const CANDIDATE_FILTERS: readonly CategoryFilter[] = [
  ...ACCESS_FILTERS.filter((f) => f.id !== 'open-source'),
  capabilityFilter('generacion', 'Generación', 'Crea imágenes desde un texto.', 'text-to-image'),
  capabilityFilter('edicion', 'Edición', 'Modifica una imagen existente.', 'image-editing'),
  capabilityFilter('img2img', 'Image-to-image', 'Parte de una imagen para generar otra.', 'image-to-image'),
  capabilityFilter('referencia', 'Imagen de referencia', 'Acepta una imagen como guía de estilo.', 'reference-image'),
  capabilityFilter('personaje', 'Personaje consistente', 'Mantiene al mismo personaje entre imágenes.', 'character-consistency'),
  capabilityFilter('inpainting', 'Rellenar zonas', 'Regenera una parte marcada de la imagen.', 'inpainting'),
  capabilityFilter('outpainting', 'Ampliar encuadre', 'Extiende la imagen más allá de su borde.', 'outpainting'),
  capabilityFilter('upscaling', 'Escalado', 'Aumenta la resolución.', 'upscaling'),
  ...FACT_FILTERS,
];
