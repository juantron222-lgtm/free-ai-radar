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
 * Cuántas cifras puede tener una búsqueda, en total, para guardarse.
 *
 * Un teléfono, un IBAN o una tarjeta se escriben a trozos («612 345 678»), y
 * ningún trozo llega a cinco cifras seguidas. Contadas todas, pasan de seis;
 * los nombres de modelos, no: «llama 3.1 405b» tiene cinco y «qwen3 235b a22b»,
 * seis.
 */
const CIFRAS_MAXIMAS_BUSQUEDA = 6;

/**
 * El texto de una búsqueda, como se guarda.
 *
 * En minúsculas, sin espacios de sobra y cortado a 60 caracteres. Si parece
 * un dato personal —una dirección de correo, un número largo, aunque vaya a
 * trozos, un enlace— no se guarda: alguien puede pegar cualquier cosa en un
 * buscador, y un contador de uso no es sitio para eso.
 */
export function normalizarBusqueda(texto: string): string | null {
  const limpio = texto.normalize('NFC').toLocaleLowerCase('es').replace(/\s+/g, ' ').trim();
  if (limpio.length < 2) return null;
  if (/@|https?:|www\.|\d{5,}/.test(limpio)) return null;
  if ((limpio.match(/\d/g) ?? []).length > CIFRAS_MAXIMAS_BUSQUEDA) return null;
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

/**
 * Cuándo empezó la medición corregida de las salidas.
 *
 * Hasta entonces, desde que se creó la tabla el 21 de octubre de 2026, también
 * contaban las precargas que Astro hace al pasar el ratón o el tabulador por
 * «Ir a…» o «Ver su página de precios» (`prefetchAll` con estrategia `hover`).
 * Como `/ir/` responde `no-store`, un clic después de esa precarga contaba dos
 * veces. Contaba también cualquier visita automática que siguiera el enlace sin
 * respetar robots.txt.
 *
 * `publicada` es la hora en que el despliegue que lo corrige quedó en
 * producción (UTC), tal como la da Vercel. Los contadores se agrupan por día de
 * Madrid, así que ese día mezcla las dos formas de contar: el primer día fiable
 * es el siguiente. Lo anterior se conserva, marcado como no fiable; no se puede
 * separar porque sólo se guardan totales por día.
 */
export const MEDICION_CORREGIDA: { publicada: string | null; primerDiaFiable: string } = {
  publicada: null,
  primerDiaFiable: '2026-10-25',
};

/** Agentes que se identifican como algo que no es un navegador manejado por alguien. */
const AUTOMATICO =
  /bot|crawl|spider|slurp|preview|headless|lighthouse|pagespeed|curl|wget|python|httpclient|okhttp|axios|node-fetch|undici|go-http|java\/|libwww|scrapy|facebookexternalhit|embedly|whatsapp|telegram|discord|slack/i;

export type ClaseDeSalida = 'clic' | 'precarga' | 'automatica' | 'sin-gesto';

/**
 * Qué parece una petición a /ir/<slug>, mirando sólo su forma.
 *
 *   precarga    trae `Sec-Purpose` o `Purpose: prefetch` (o `prerender`).
 *   automatica  sin agente, o con uno que se declara robot, programa o
 *               navegador sin interfaz.
 *   sin-gesto   no es una navegación de documento con gesto de quien navega
 *               (`Sec-Fetch-Mode: navigate`, `Sec-Fetch-Dest: document`,
 *               `Sec-Fetch-User: ?1`): un comprobador de enlaces, una petición
 *               por programa o un navegador automatizado que navega sin pulsar.
 *   clic        lo demás: lo que hace un navegador cuando alguien pulsa o abre
 *               el enlace con el teclado.
 *
 * No es una prueba de que haya una persona: un navegador automatizado puede
 * simular el gesto y declararse como un navegador normal. Reduce mucho lo
 * automático; no lo elimina. No se guarda ni se registra nada que identifique
 * la petición, y la redirección se hace siempre, cuente o no.
 */
export function clasificarSalida(headers: Headers): ClaseDeSalida {
  const proposito = `${headers.get('sec-purpose') ?? ''} ${headers.get('purpose') ?? ''} ${headers.get('x-moz') ?? ''}`;
  if (/prefetch|prerender/i.test(proposito)) return 'precarga';
  const agente = headers.get('user-agent') ?? '';
  if (agente === '' || AUTOMATICO.test(agente)) return 'automatica';
  if (
    headers.get('sec-fetch-mode') !== 'navigate' ||
    headers.get('sec-fetch-dest') !== 'document' ||
    headers.get('sec-fetch-user') !== '?1'
  ) {
    return 'sin-gesto';
  }
  return 'clic';
}

/** Lo único que cuenta como salida desde la medición corregida. */
export function esClicDeNavegador(headers: Headers): boolean {
  return clasificarSalida(headers) === 'clic';
}
