import type { Tool } from '@lib/domain/tool';
import type { TriState } from '@lib/domain/primitives';
import { EMPTY_FILTERS, applyFilters, parseFilters } from '@lib/search/filters';

/**
 * Las cifras del catálogo, calculadas en un solo sitio.
 *
 * La auditoría del 15 de septiembre encontró «Sin tarjeta 37» junto a
 * «confirmado en 38 de 94», y «Uso comercial 15» junto a «27», en la misma
 * pantalla. Las cuatro cifras eran ciertas —37 no piden tarjeta y en 38 sabemos
 * la respuesta: 37 que no y 1 que sí—, pero se calculaban en sitios distintos y
 * se escribían con las mismas palabras, así que se leían como una contradicción.
 *
 * Aquí se cuenta todo de una vez y cada vista elige qué parte enseña: el chip,
 * la nota de cobertura, el pie, la portada, las colecciones y las categorías
 * leen lo mismo. `tests/unit/cifras.test.ts` falla si alguna vuelve a contar
 * por su cuenta.
 *
 * Las funciones reciben las herramientas en vez de leer el catálogo: así las
 * usa también `catalog.ts` sin importarse a sí mismo, y las categorías pueden
 * pasar sólo las suyas.
 */

export type ClaveCondicion = 'nocard' | 'nosignup' | 'comm';

export interface CifraCondicion {
  clave: ClaveCondicion;
  /** Las que cumplen la condición: exactamente lo que devuelve el filtro. */
  cumplen: number;
  /** Las que tienen la respuesta y no cumplen (en uso comercial, también «sólo en parte»). */
  noCumplen: number;
  /** Las que todavía no tienen respuesta. */
  sinDato: number;
  /**
   * Las que dicen expresamente lo contrario: piden tarjeta, piden registro o
   * no permiten uso comercial. «Sólo en parte» no cuenta aquí.
   */
  enContra: number;
  total: number;
}

const CAMPO: Record<ClaveCondicion, (tool: Tool) => TriState> = {
  nocard: (tool) => tool.freePlan.requiresCreditCard,
  nosignup: (tool) => tool.freePlan.requiresSignup,
  comm: (tool) => tool.freePlan.commercialUse,
};

/** Cuántas devuelve el filtro del catálogo con esa casilla marcada. */
export function devuelveElFiltro(tools: readonly Tool[], clave: string): number {
  return applyFilters(tools, { ...EMPTY_FILTERS, ...parseFilters(new URLSearchParams(`${clave}=1`)) }).length;
}

const CONTRARIO: Record<ClaveCondicion, TriState> = { nocard: 'yes', nosignup: 'yes', comm: 'no' };

export function cifraDe(clave: ClaveCondicion, tools: readonly Tool[]): CifraCondicion {
  const cumplen = devuelveElFiltro(tools, clave);
  const sinDato = tools.filter((tool) => CAMPO[clave](tool) === 'unverified').length;
  const enContra = tools.filter((tool) => CAMPO[clave](tool) === CONTRARIO[clave]).length;
  return { clave, cumplen, noCumplen: tools.length - cumplen - sinDato, sinDato, enContra, total: tools.length };
}

export interface CifrasDelCatalogo {
  total: number;
  sinTarjeta: CifraCondicion;
  sinRegistro: CifraCondicion;
  usoComercial: CifraCondicion;
  openSource: number;
  sinPlanGratuito: number;
}

export function cifrasDelCatalogo(tools: readonly Tool[]): CifrasDelCatalogo {
  return {
    total: tools.length,
    sinTarjeta: cifraDe('nocard', tools),
    sinRegistro: cifraDe('nosignup', tools),
    usoComercial: cifraDe('comm', tools),
    openSource: devuelveElFiltro(tools, 'oss'),
    sinPlanGratuito: tools.filter((tool) => tool.freeModel === 'paid_only').length,
  };
}

/**
 * La misma condición contada entera, para decirla en una frase.
 *
 * «37 no la piden, 1 sí y en 56 aún no lo sabemos» suma el catálogo y no deja
 * dos cifras sueltas que parezcan decir cosas distintas.
 */
export function fraseDeCobertura(cifra: CifraCondicion): string {
  const partes: Record<ClaveCondicion, [string, string]> = {
    nocard: ['no la piden', 'sí'],
    nosignup: ['se usan sin cuenta', 'la piden'],
    comm: ['lo permiten', 'no o sólo en parte'],
  };
  const [cumplen, noCumplen] = partes[cifra.clave];
  return `${cifra.cumplen} ${cumplen}, ${cifra.noCumplen} ${noCumplen} y en ${cifra.sinDato} aún no lo sabemos`;
}
