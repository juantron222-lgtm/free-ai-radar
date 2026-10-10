/**
 * Qué se cuenta del uso de la web, y qué forma puede tener cada cosa.
 *
 * La web no sabía si servía: Vercel cuenta páginas vistas, pero no si alguien
 * encontró una herramienta y fue a su web oficial, qué buscó, ni qué búsqueda
 * se quedó sin respuesta. Aquí se decide qué se cuenta; se guarda sólo el
 * total de cada cosa por día (migración 0017), nunca quién.
 *
 * Lo mismo vale en el navegador y en el servidor: el navegador no manda nada
 * que el servidor vaya a rechazar, y el servidor no se fía de lo que llega.
 */

export const EVENTOS_USO = ['salida', 'precios', 'busqueda', 'busqueda_vacia', 'filtro', 'comparar'] as const;
export type EventoUso = (typeof EVENTOS_USO)[number];

/** Los que pasan por el aviso de cookies: el aviso promete pedir permiso para medir búsquedas. */
export const EVENTOS_CON_CONSENTIMIENTO: readonly EventoUso[] = ['busqueda', 'busqueda_vacia', 'filtro', 'comparar'];

/** Los parámetros del catálogo que son filtros (los de `serializeFilters`, menos la búsqueda). */
export const PARAMETROS_DE_FILTRO = [
  'cat',
  'free',
  'plat',
  'host',
  'effort',
  'nocard',
  'nosignup',
  'nowm',
  'wmknown',
  'comm',
  'oss',
  'fresh',
  'sort',
] as const;

export const LARGO_MAXIMO_BUSQUEDA = 60;

/**
 * El texto de una búsqueda, como se guarda.
 *
 * En minúsculas, sin espacios de sobra y cortado a 60 caracteres. Si parece
 * un dato personal —una dirección de correo, un número largo, un enlace— no se
 * guarda: alguien puede pegar cualquier cosa en un buscador, y un contador de
 * uso no es sitio para eso.
 */
export function normalizarBusqueda(texto: string): string | null {
  const limpio = texto.normalize('NFC').toLocaleLowerCase('es').replace(/\s+/g, ' ').trim();
  if (limpio.length < 2) return null;
  if (/@|https?:|www\.|\d{5,}/.test(limpio)) return null;
  return limpio.slice(0, LARGO_MAXIMO_BUSQUEDA).trim();
}

/**
 * Comprueba y normaliza la clave de un evento. `null` si no vale.
 *
 * `slugs` es el catálogo: una salida o una comparación sólo se cuentan para
 * herramientas que existen, así que nadie puede llenar la tabla de nombres
 * inventados.
 */
export function claveDeUso(evento: EventoUso, clave: string, slugs: ReadonlySet<string>): string | null {
  const valor = String(clave ?? '').trim();
  switch (evento) {
    case 'salida':
    case 'precios':
      return slugs.has(valor) ? valor : null;
    case 'busqueda':
    case 'busqueda_vacia':
      return normalizarBusqueda(valor);
    case 'filtro': {
      const m = /^([a-z]+)=([a-z0-9_-]{1,30})$/.exec(valor);
      if (!m || !(PARAMETROS_DE_FILTRO as readonly string[]).includes(m[1]!)) return null;
      return valor;
    }
    case 'comparar': {
      const partes = valor.split('|').filter(Boolean);
      const unicas = [...new Set(partes)];
      if (unicas.length < 2 || unicas.length > 4 || !unicas.every((s) => slugs.has(s))) return null;
      const ordenada = unicas.sort().join('|');
      return ordenada.length <= 80 ? ordenada : null;
    }
    default:
      return null;
  }
}

export function esEventoUso(valor: unknown): valor is EventoUso {
  return typeof valor === 'string' && (EVENTOS_USO as readonly string[]).includes(valor);
}

/**
 * Los filtros de una URL del catálogo, uno por valor: `cat=imagen,video`
 * cuenta como `cat=imagen` y `cat=video`. La búsqueda (`q`) no es un filtro.
 */
export function paresDeFiltro(query: string): string[] {
  const pares: string[] = [];
  for (const [clave, valor] of new URLSearchParams(query)) {
    if (!(PARAMETROS_DE_FILTRO as readonly string[]).includes(clave)) continue;
    for (const v of valor.split(',')) {
      const par = `${clave}=${v.trim()}`;
      if (/^[a-z]+=[a-z0-9_-]{1,30}$/.test(par)) pares.push(par);
    }
  }
  return pares;
}
