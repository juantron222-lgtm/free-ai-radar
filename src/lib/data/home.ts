import type { Tool } from '@lib/domain/tool';
import { getAllTools } from './catalog';
import { usableFreeNow } from './category-page';
import { verificacionDe } from '@lib/domain/verification';

/**
 * Qué enseña la portada, y por qué esa y no otra.
 *
 * El módulo principal salía de `getAllTools().slice(0, 6)`. Cuando el catálogo
 * se ordenaba por la nota sobre 100 eran las seis mejor puntuadas; cuando pasó
 * a alfabético fueron las seis primeras del abecedario, que resultaron ser
 * cinco herramientas de código y un modelo. Ninguno de los dos criterios
 * respondía a la pregunta de alguien que acaba de llegar.
 *
 * Lo que decide ahora es la **cobertura**: una candidata por vertical, para
 * que las seis tarjetas enseñen seis cosas distintas que se pueden hacer. Una
 * portada donde Imagen, Vídeo y Audio aparecen a la altura de un pie de página
 * no está representando el catálogo, está representando su orden interno.
 */

/** Las verticales, en el orden en que se recorren. */
export const VERTICALES = [
  { id: 'imagen', ruta: '/imagen', slugs: ['imagen'] },
  { id: 'video', ruta: '/video', slugs: ['video'] },
  { id: 'audio', ruta: '/audio', slugs: ['musica', 'voz'] },
  { id: 'codigo', ruta: '/codigo', slugs: ['codigo'] },
  { id: 'agentes', ruta: '/agentes', slugs: ['agentes'] },
  { id: 'modelos', ruta: '/modelos', slugs: ['modelos'] },
] as const;

export type VerticalId = (typeof VERTICALES)[number]['id'];

const enVertical = (tool: Tool, slugs: readonly string[]): boolean =>
  slugs.includes(tool.categorySlug) || tool.secondaryCategories.some((c) => slugs.includes(c));

/**
 * Lo que hace a una candidata defendible para la portada.
 *
 * Tres condiciones, y las tres se pueden comprobar en su ficha:
 *
 *   1. Se puede usar hoy sin pagar y sin instalar nada. Es lo que la portada
 *      promete, así que es lo mínimo.
 *   2. Su acceso está comprobado contra la fuente oficial: nada `catalogada`,
 *      que por definición es lo que aún no hemos mirado.
 *   3. Dice qué hace. Una tarjeta sin capacidades citadas no informa.
 *
 * Entre las que cumplen las tres, gana la que tenga menos huecos y, a igualdad,
 * la comprobada hace menos. No hay nada aquí que se parezca a «la mejor»:
 * ninguna de las tres condiciones es un juicio de calidad.
 */
export function candidatasDe(tools: readonly Tool[], slugs: readonly string[]): Tool[] {
  return tools
    .filter(
      (t) =>
        enVertical(t, slugs) &&
        usableFreeNow(t) &&
        verificacionDe(t).state !== 'catalogada' &&
        t.capabilities.length > 0
    )
    .sort((a, b) => {
      const huecos = verificacionDe(a).pendientes.length - verificacionDe(b).pendientes.length;
      if (huecos !== 0) return huecos;
      return b.lastVerifiedAt.localeCompare(a.lastVerifiedAt) || a.name.localeCompare(b.name, 'es');
    });
}

export interface Destacada {
  vertical: VerticalId;
  tool: Tool;
}

/**
 * Una por vertical, sin repetir.
 *
 * `usadas` es el mecanismo de deduplicación y es explícito a propósito: la
 * portada tenía la misma herramienta hasta tres veces —una por cada criterio
 * que cumplía— y eso no se arreglaba con el orden del array, porque el orden
 * del array cambia cada vez que cambia el catálogo. Aquí, si una candidata ya
 * está colocada, la vertical siguiente pasa a la suya.
 */
export function destacadas(limite = 6): Destacada[] {
  const tools = getAllTools();
  const usadas = new Set<string>();
  const out: Destacada[] = [];

  for (const vertical of VERTICALES) {
    if (out.length >= limite) break;
    const elegida = candidatasDe(tools, vertical.slugs).find((t) => !usadas.has(t.slug));
    if (!elegida) continue;
    usadas.add(elegida.slug);
    out.push({ vertical: vertical.id, tool: elegida });
  }

  return out;
}

/**
 * Lo que ya está colocado, para que ningún otro módulo lo repita.
 *
 * La portada tiene varios bloques que pueden querer la misma ficha. El que va
 * primero se la queda; el siguiente tiene que buscarse otra o quedarse corto.
 */
export function sinRepetir(
  candidatas: readonly Tool[],
  yaUsadas: Iterable<string>,
  limite: number
): Tool[] {
  const usadas = new Set(yaUsadas);
  const out: Tool[] = [];
  for (const tool of candidatas) {
    if (out.length >= limite) break;
    if (usadas.has(tool.slug)) continue;
    usadas.add(tool.slug);
    out.push(tool);
  }
  return out;
}
