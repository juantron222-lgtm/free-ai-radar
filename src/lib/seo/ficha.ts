import type { Tool } from '@lib/domain/tool';
import { getTool } from '@lib/data/catalog';
import { freeAccessLabel } from '@lib/data/category-page';

/**
 * La descripción de una ficha en un buscador: la respuesta, no el anuncio.
 *
 * Era «<eslogan> Analizamos su plan gratuito: <resumen>», recortada a 158
 * caracteres con «…». En casi todas el eslogan se comía el sitio y el resumen
 * salía cortado a media frase —«…Analizamos su plan gratuito: Plan gratuito
 * con conversación,…»—, justo en lo que alguien lee en Google antes de
 * decidir si entra.
 *
 * Ahora empieza por la pregunta que se busca, «¿X es gratis?», y la contesta
 * con lo que la ficha ya tiene comprobado: qué da gratis, si pide tarjeta o
 * registro, y si permite uso comercial. Lo que la ficha no sabe no se dice —un
 * campo sin comprobar no se convierte en «no»—. Se añade frase a frase y se
 * para antes del límite, así que nunca se corta.
 */
export const LARGO_DESCRIPCION = 155;

const mayuscula = (s: string) => (s ? s[0]!.toLocaleUpperCase('es') + s.slice(1) : s);
const conPunto = (s: string) => (/[.!?…]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

function respuesta(tool: Tool): string {
  const l = freeAccessLabel(tool);
  const cantidad = l.amount ? ` (${l.amount})` : '';
  if (l.kind === 'Gratis') {
    if (l.amount) return `Sí: ${l.amount}`;
    // «Sin límite publicado» se leería como «sin límite»: ahí basta el sí.
    if (l.amountFallback === 'Con límites de uso') return 'Sí, con límites de uso';
    if (l.amountFallback === 'Sin cuotas en tu equipo') return 'Sí, sin cuotas en tu equipo';
    return 'Sí';
  }
  if (l.kind === 'Gratis en local') return 'Sí, si la instalas en tu equipo';
  if (l.kind === 'Créditos que no vuelven') return `Sólo con créditos que no se renuevan${cantidad}`;
  if (l.kind.startsWith('Créditos')) return `Con ${l.kind.toLocaleLowerCase('es')}${cantidad}`;
  if (l.kind === 'Plan gratuito') return `Tiene plan gratuito${cantidad}`;
  if (l.kind === 'Prueba') return `Sólo una prueba${cantidad}`;
  if (l.kind === 'Demo') return `Sólo una demo${cantidad}`;
  if (l.kind === 'Sin plan gratuito') return 'No: no tiene plan gratuito';
  return 'Aún no lo hemos comprobado';
}

/** Sólo lo que la ficha tiene comprobado. `unverified` no se nombra. */
export function condicionesConocidas(tool: Tool): string[] {
  const { requiresCreditCard, requiresSignup, commercialUse } = tool.freePlan;
  const partes: string[] = [];
  if (requiresCreditCard === 'no') partes.push('sin tarjeta');
  else if (requiresCreditCard === 'yes') partes.push('pide tarjeta');
  if (requiresSignup === 'no') partes.push('sin registro');
  else if (requiresSignup === 'yes') partes.push('con registro');
  if (commercialUse === 'yes') partes.push('uso comercial permitido');
  else if (commercialUse === 'no') partes.push('sin uso comercial');
  else if (commercialUse === 'partial') partes.push('uso comercial con condiciones');
  return partes;
}

/**
 * Dos hechos de la ficha que deciden mucho y caben en poco: si es abierto y
 * dónde se usa. Sólo los valores comprobados; `unverified` no se nombra.
 */
export function hechosDeUso(tool: Tool): string {
  const partes: string[] = [];
  if (tool.openSource === 'yes') partes.push('open source');
  else if (tool.openSource === 'weights') partes.push('pesos abiertos');
  if (tool.hosting === 'local') partes.push('se usa en tu equipo');
  else if (tool.hosting === 'hybrid') partes.push('en la nube o en tu equipo');
  return partes.length ? mayuscula(partes.join('; ')) : '';
}

function componer(frases: string[]): string {
  let salida = '';
  for (const frase of frases.filter(Boolean).map(conPunto)) {
    const siguiente = salida ? `${salida} ${frase}` : frase;
    if (siguiente.length > LARGO_DESCRIPCION) {
      if (!salida) return siguiente; // la primera frase va siempre; metaDescription la recorta si hiciera falta
      continue;
    }
    salida = siguiente;
  }
  return salida;
}

export function descripcionDeFicha(tool: Tool): string {
  if (tool.verification === 'discontinued') {
    const sustituta = tool.replacedBy ? getTool(tool.replacedBy) : undefined;
    return componer([
      `${tool.name} ya no está disponible: su fabricante la retiró`,
      sustituta ? `La sustituye ${sustituta.name}` : '',
      tool.tagline,
    ]);
  }

  const condiciones = condicionesConocidas(tool);
  return componer([
    `¿${tool.name} es gratis? ${respuesta(tool)}`,
    condiciones.length ? mayuscula(condiciones.join(', ')) : '',
    hechosDeUso(tool),
    tool.tagline,
  ]);
}
