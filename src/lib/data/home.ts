import type { Tool } from '@lib/domain/tool';
import { getAllTools } from './catalog';
import { usableFreeNow } from './category-page';
import { verificacionDe } from '@lib/domain/verification';
import { DEFAULT_SORT, nivelDeAcceso, sortTools } from '@lib/search/filters';

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

export const enVertical = (tool: Tool, slugs: readonly string[]): boolean =>
  slugs.includes(tool.categorySlug) || tool.secondaryCategories.some((c) => slugs.includes(c));

/**
 * Lo que hace a una candidata defendible para la portada.
 *
 * Cuatro condiciones, y las cuatro se pueden comprobar en su ficha:
 *
 *   1. Se puede usar hoy sin pagar y sin instalar nada. Es lo que la portada
 *      promete, así que es lo mínimo.
 *   2. Su acceso está comprobado contra la fuente oficial: nada `catalogada`,
 *      que por definición es lo que aún no hemos mirado.
 *   3. Dice qué hace. Una tarjeta sin capacidades citadas no informa.
 *   4. Sabemos si pide tarjeta y si pide registro. La tabla de la portada se
 *      titula «Para empezar hoy, sin pagar» y enseñaba «Sin verificar» justo en
 *      esas dos columnas. Si una clase de IA no tiene ninguna candidata que lo
 *      cumpla, se queda fuera: no se rellena con una dudosa.
 *
 * Entre las que cumplen las tres, gana la que tenga menos huecos y, a igualdad,
 * la comprobada hace menos. No hay nada aquí que se parezca a «la mejor»:
 * ninguna de las tres condiciones es un juicio de calidad.
 */
const sabemos = (valor: string): boolean => valor !== 'unverified';

export function candidatasDe(tools: readonly Tool[], slugs: readonly string[]): Tool[] {
  return tools
    .filter(
      (t) =>
        enVertical(t, slugs) &&
        usableFreeNow(t) &&
        !['catalogada', 'retirada'].includes(verificacionDe(t).state) &&
        t.capabilities.length > 0 &&
        sabemos(t.freePlan.requiresCreditCard) &&
        sabemos(t.freePlan.requiresSignup)
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

/**
 * Tres caras conocidas para cada puerta de la primera pantalla.
 *
 * Las seis puertas de la portada eran seis palabras en un recuadro. En un
 * móvil ocupan la primera pantalla entera y no enseñan ni una sola
 * herramienta: quien llega ve «Imagen», «Vídeo», «Audio» y tiene que fiarse
 * de que detrás hay algo que conoce. Tres logos le dicen que sí sin leer nada,
 * que es lo que la primera pantalla puede pedir.
 *
 * Cuáles, sin juicio: las primeras de la vertical en el mismo orden por
 * defecto del catálogo —gratis y comprobadas primero— que tengan un logo de
 * verdad. Un monograma no reconoce nada, así que no cuenta; y una herramienta
 * retirada o de pago nunca llega hasta aquí, porque el orden las manda al
 * final.
 *
 * Dos reglas más, las dos por lo mismo: que cada puerta enseñe algo distinto.
 * Primero van las que tienen esa vertical como categoría principal —Krea es
 * sobre todo imagen, aunque también haga vídeo—, y una cara que ya salió en
 * otra puerta no se repite. Con las dos, Agentes y Código dejaban de enseñar
 * los mismos Cursor y Copilot, y Vídeo dejaba de parecerse a Imagen.
 */
export function carasDe(
  tools: readonly Tool[],
  slugs: readonly string[],
  tieneLogo: (tool: Tool) => boolean,
  usadas: Set<string> = new Set(),
  cuantas = 3
): Tool[] {
  const principal = (t: Tool) => (slugs.includes(t.categorySlug) ? 0 : 1);
  const ordenadas = sortTools(
    tools.filter((t) => enVertical(t, slugs) && nivelDeAcceso(t) === 0 && tieneLogo(t)),
    DEFAULT_SORT
  );
  // `sort` es estable: dentro de cada grupo se conserva el orden por defecto.
  ordenadas.sort((a, b) => principal(a) - principal(b));

  const out: Tool[] = [];
  for (const tool of ordenadas) {
    if (out.length >= cuantas) break;
    if (usadas.has(tool.slug)) continue;
    usadas.add(tool.slug);
    out.push(tool);
  }
  return out;
}
