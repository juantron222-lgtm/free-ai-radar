import type { EvidenceField, FieldEvidence, Tool } from './tool';

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
