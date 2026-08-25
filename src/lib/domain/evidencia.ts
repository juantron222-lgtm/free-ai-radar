import type { EvidenceField, EvidenceScope, FieldEvidence, Tool } from './tool';
import { EVIDENCE_SCOPE_LABEL } from './tool';

/**
 * Por qué no lo sabemos.
 *
 * El catálogo distinguía tres estados de un hecho —sí, no, sin confirmar— y
 * ese tercero cargaba con dos situaciones que no se parecen en nada:
 *
 *   1. Todavía no lo hemos mirado. Es deuda nuestra y se paga trabajando.
 *   2. Lo hemos mirado en la página que debía contestarlo y el fabricante no
 *      lo publica. Eso no es deuda nuestra: es opacidad suya, y es un dato
 *      sobre el producto tan útil como el que falta.
 *
 * Publicar las dos con las mismas dos palabras —«sin verificar»— le atribuye a
 * Free AI Radar una pereza que en el segundo caso no existe, y le ahorra al
 * fabricante una crítica que sí merece. Por eso son dos estados distintos.
 */
export type MotivoDeHueco = 'pendiente' | 'no_publicado';

export const MOTIVO_LABEL: Record<MotivoDeHueco, string> = {
  pendiente: 'Sin comprobar',
  no_publicado: 'El fabricante no lo publica',
};

export const MOTIVO_EXPLICACION: Record<MotivoDeHueco, string> = {
  pendiente: 'Todavía no hemos abierto la fuente oficial para este dato. Es trabajo nuestro pendiente.',
  no_publicado:
    'Hemos abierto la página oficial que debería contestarlo y no lo dice. El hueco es suyo, no nuestro.',
};

/** Qué se buscó, cuando la fuente calla. Sin narrar, tal cual se anotó. */
export function buscadoEn(ev: FieldEvidence): string | undefined {
  return ev.outcome === 'not_published' ? ev.lookedFor : undefined;
}

/** La frase de la página, si la entrada la tiene. Un `not_published` no puede. */
export function citaDe(ev: FieldEvidence): string | undefined {
  return ev.outcome === 'not_published' ? undefined : ev.quote;
}

/** De qué se deduce, cuando no está dicho. */
export function baseDe(ev: FieldEvidence): string | undefined {
  return ev.outcome === 'derived' ? ev.basis : undefined;
}

/**
 * Las puertas por las que se llega a esta herramienta.
 *
 * Sale de lo que la ficha ya declara: las tres vías de acceso de un modelo,
 * dónde se ejecuta y en qué plataformas está. Sirve para saber si una
 * evidencia cubre el producto entero o sólo una de sus puertas.
 */
export function superficiesDe(tool: Tool): Set<EvidenceScope> {
  const s = new Set<EvidenceScope>();

  if (tool.access.chat === 'yes') s.add('web');
  if (tool.access.api === 'yes') s.add('api');
  if (tool.access.weights === 'yes') s.add('weights');

  if (tool.hosting === 'local') s.add('local');
  else if (tool.hosting === 'cloud') s.add('cloud');
  else if (tool.hosting === 'hybrid') {
    s.add('local');
    s.add('cloud');
  }

  /*
   * `platforms` no entra más allá de esto. Lista sistemas operativos —«linux,
   * macos, windows»— y leerlo como una puerta de acceso propia hacía que
   * Whisper tuviera una superficie «app» que no existe: es el mismo modelo
   * ejecutándose en tres sitios, no tres productos con condiciones distintas.
   */
  if (tool.platforms.includes('web')) s.add('web');

  return s;
}

/**
 * Puertas que son la misma contada de dos maneras.
 *
 * Unos pesos descargables y «se ejecuta en tu equipo» son el mismo acceso; una
 * web y «servicio en la nube», también. Una evidencia sobre una cubre la otra.
 */
const EQUIVALENTES: Partial<Record<EvidenceScope, readonly EvidenceScope[]>> = {
  weights: ['weights', 'local'],
  local: ['local', 'weights'],
  web: ['web', 'cloud'],
  cloud: ['cloud', 'web'],
};

/**
 * ¿Esta evidencia habla de todo el producto o sólo de una de sus puertas?
 *
 * `product` cubre por definición. Lo demás cubre sólo si la herramienta no
 * tiene más puertas que ésa: la licencia MIT de unos pesos cubre a Whisper
 * entero —no hay otra forma de usarlo— pero no cubre a un modelo que además
 * vende una API con sus propias condiciones.
 */
export function cubreTodo(tool: Tool, ev: FieldEvidence): boolean {
  if (ev.scope === 'product') return true;
  const superficies = superficiesDe(tool);
  if (superficies.size === 0) return true;

  const cubiertas = new Set<EvidenceScope>(EQUIVALENTES[ev.scope] ?? [ev.scope]);
  return [...superficies].every((x) => cubiertas.has(x));
}

/** Cómo se nombra el alcance en público. */
export function alcanceDe(ev: FieldEvidence): string {
  return EVIDENCE_SCOPE_LABEL[ev.scope];
}

/** La evidencia que sostiene un campo concreto, si la hay. */
export function evidenciaDe(tool: Tool, field: EvidenceField): FieldEvidence | undefined {
  return tool.evidence.find((e) => e.field === field);
}

/**
 * Por qué falta un dato.
 *
 * Devuelve `undefined` cuando no falta —el valor está confirmado— para que
 * quien lo llame no tenga que preguntarlo dos veces.
 */
export function motivoDelHueco(
  tool: Tool,
  field: EvidenceField,
  valor: string
): MotivoDeHueco | undefined {
  if (valor !== 'unverified' && valor !== 'unknown') return undefined;
  return evidenciaDe(tool, field)?.outcome === 'not_published' ? 'no_publicado' : 'pendiente';
}

/**
 * Cómo se cuenta una evidencia en público.
 *
 * `derived` no se anuncia como si la página lo dijera: se anuncia como lo que
 * es, una consecuencia de algo que sí dice. La diferencia importa porque una
 * derivación se puede rebatir señalando el razonamiento, y una cita no.
 */
export const OUTCOME_LABEL: Record<FieldEvidence['outcome'], string> = {
  stated: 'Lo dice la fuente oficial',
  derived: 'Se deduce de la fuente oficial',
  not_published: 'La fuente oficial no lo dice',
};

export interface CoberturaCampo {
  field: EvidenceField;
  confirmados: number;
  noPublicados: number;
  pendientes: number;
}

/**
 * Cuánto sabemos de un campo en todo el catálogo, y de qué clase es lo que no
 * sabemos. Es lo que decide si un filtro tiene cobertura suficiente para
 * existir: un filtro sobre un campo que sólo conocemos en el 20 % de las
 * fichas esconde el 80 % del catálogo sin decirlo.
 */
export function coberturaDe(
  tools: readonly Tool[],
  field: EvidenceField,
  valorDe: (tool: Tool) => string,
  aplica: (tool: Tool) => boolean = () => true
): CoberturaCampo {
  let confirmados = 0;
  let noPublicados = 0;
  let pendientes = 0;

  for (const tool of tools) {
    if (!aplica(tool)) continue;
    const motivo = motivoDelHueco(tool, field, valorDe(tool));
    if (!motivo) confirmados++;
    else if (motivo === 'no_publicado') noPublicados++;
    else pendientes++;
  }

  return { field, confirmados, noPublicados, pendientes };
}

/**
 * Qué puede prometer un filtro según lo que sabemos.
 *
 * Un filtro positivo sólo deja pasar un sí explícito, y eso está bien: es la
 * regla que impide que lo desconocido se cuele como respuesta. Pero tiene un
 * efecto que no se ve: cuanto menos sabemos de un campo, más catálogo esconde
 * el filtro sin decir por qué. «Sin marca de agua» se apoya en un dato
 * confirmado en 1 de las 35 fichas donde la pregunta aplica; marcarlo no
 * devuelve «las que no marcan», devuelve «la única que hemos comprobado», y
 * las otras treinta y cuatro desaparecen como si hubieran fallado la
 * condición. Eso presenta nuestra ignorancia como un resultado negativo suyo.
 *
 * Tres estados, con los umbrales escritos para poder discutirlos:
 *
 *   suficiente   ≥ 60 %  El filtro se comporta como cualquier otro.
 *   parcial      ≥ 25 %  Se comporta igual, pero anuncia su cobertura antes
 *                        de que lo pulses.
 *   testimonial  < 25 %  Deja de ofrecerse como filtro negativo. En su lugar
 *                        se ofrece ver las fichas donde el dato está
 *                        confirmado, que es lo único que de verdad sabemos.
 *
 * El 60 % es donde un filtro deja de esconder más de lo que enseña. El 25 %
 * es donde deja de tener sentido llamarlo filtro: por debajo, el resultado
 * habla de nuestro trabajo pendiente, no del catálogo.
 */
export type PoliticaFiltro = 'suficiente' | 'parcial' | 'testimonial';

export const UMBRAL_SUFICIENTE = 0.6;
export const UMBRAL_PARCIAL = 0.25;

export function politicaDe(cobertura: CoberturaCampo): PoliticaFiltro {
  const total = cobertura.confirmados + cobertura.noPublicados + cobertura.pendientes;
  if (total === 0) return 'testimonial';
  const pct = cobertura.confirmados / total;
  if (pct >= UMBRAL_SUFICIENTE) return 'suficiente';
  if (pct >= UMBRAL_PARCIAL) return 'parcial';
  return 'testimonial';
}
