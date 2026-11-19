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

/* ─── El título en el buscador ─── */

/**
 * Lo que cabe del título antes de que Google lo corte. Search Console (nov
 * 2026) enseñó que casi todo lo que nos encuentran es «¿X es gratis?», y el
 * título repetía la pregunta sin contestarla —«Lovable: ¿es gratis de verdad?
 * Análisis y límites reales»— con 1.010 impresiones y un clic. Ahora la
 * contesta, con la misma respuesta comprobada que abre la descripción.
 */
export const LARGO_TITULO = 60;

/** La respuesta sin la cantidad, para cuando no cabe. Nunca dice menos de lo que es: sin cifra sigue siendo cierta. */
function respuestaCorta(tool: Tool): string {
  return respuesta(tool)
    .replace(/\s*\(.*\)\s*$/, '')
    .replace(/^Sí: .*/, 'Sí, con límites de uso')
    .replace(/^Sólo con créditos que no se renuevan$/, 'Sólo créditos que no se renuevan');
}

/** La misma respuesta para leerla en una frase: la cantidad tras dos puntos, sin paréntesis dentro de paréntesis. */
function respuestaEnFrase(tool: Tool): string {
  return respuesta(tool).replace(/ \((.*)\)$/, ': $1');
}

export function tituloDeFicha(tool: Tool): string {
  if (tool.verification === 'discontinued') return `${tool.name}: retirada por su fabricante. Qué la sustituye`;
  const pregunta = `¿${tool.name} es gratis?`;
  const sinTarjeta = tool.freePlan.requiresCreditCard === 'no' && tool.freeModel !== 'paid_only' ? ', sin tarjeta' : '';
  // Sin la cifra: el título dice qué tipo de gratis es y la cantidad exacta queda
  // en la ficha, que es motivo para entrar (decisión de Juan, 19 nov 2026).
  const candidatas = [respuestaCorta(tool) + sinTarjeta, respuestaCorta(tool)];
  for (const r of candidatas) {
    const t = `${pregunta} ${r}`;
    if (t.length <= LARGO_TITULO) return t;
  }
  // Sólo los nombres muy largos llegan aquí: se corta lo que sobra, nunca la respuesta.
  return `${pregunta} ${respuestaCorta(tool)}`;
}

/* ─── Preguntas frecuentes ─── */

/**
 * Las preguntas que se hacen en el buscador, contestadas con lo que la ficha
 * tiene comprobado. Una pregunta cuya respuesta no sabemos no se hace: no hay
 * «¿pide tarjeta?» si la tarjeta está sin comprobar. El mismo texto va a la
 * página y al marcado FAQPage, así que nunca dicen cosas distintas.
 */
export interface PreguntaFrecuente {
  pregunta: string;
  respuesta: string;
}

const RENOVACION: Partial<Record<Tool['freePlan']['creditReset'], string>> = {
  intraday: 'Varias veces al día',
  daily: 'Cada día',
  weekly: 'Cada semana',
  monthly: 'Cada mes',
  one_off: 'No se renuevan: se dan una sola vez',
};

export function preguntasDeFicha(tool: Tool): PreguntaFrecuente[] {
  if (tool.verification === 'discontinued') return [];
  const { requiresCreditCard: tarjeta, requiresSignup: registro, commercialUse: comercial, creditReset, creditsAmount, limits, summary } =
    tool.freePlan;
  const out: PreguntaFrecuente[] = [{ pregunta: `¿${tool.name} es gratis?`, respuesta: `${conPunto(respuestaEnFrase(tool))} ${conPunto(summary)}` }];
  const gratis = tool.freeModel !== 'paid_only';

  if (gratis && tarjeta === 'no') out.push({ pregunta: `¿${tool.name} pide tarjeta?`, respuesta: 'No. Para usar su plan gratuito no hace falta introducir una tarjeta.' });
  if (gratis && tarjeta === 'yes') out.push({ pregunta: `¿${tool.name} pide tarjeta?`, respuesta: 'Sí. Pide una tarjeta para acceder a su plan gratuito.' });
  if (registro === 'no') out.push({ pregunta: `¿Hay que registrarse para usar ${tool.name}?`, respuesta: 'No. Se puede usar sin crear una cuenta.' });
  if (registro === 'yes') out.push({ pregunta: `¿Hay que registrarse para usar ${tool.name}?`, respuesta: 'Sí. Hay que crear una cuenta.' });

  if (gratis && comercial === 'yes') out.push({ pregunta: `¿Se puede usar ${tool.name} con fines comerciales?`, respuesta: 'Sí. Su plan gratuito permite el uso comercial.' });
  if (gratis && comercial === 'no') out.push({ pregunta: `¿Se puede usar ${tool.name} con fines comerciales?`, respuesta: 'No en el plan gratuito.' });
  if (gratis && comercial === 'partial') out.push({ pregunta: `¿Se puede usar ${tool.name} con fines comerciales?`, respuesta: 'Con condiciones: su plan gratuito lo permite sólo en ciertos casos, que se detallan en esta ficha.' });

  const cada = RENOVACION[creditReset];
  if (gratis && cada) {
    out.push({
      pregunta: `¿Cada cuánto se renueva lo gratis de ${tool.name}?`,
      respuesta: conPunto(creditsAmount ? `${cada}: ${creditsAmount}` : cada),
    });
  }
  if (gratis && limits.length > 0) {
    out.push({ pregunta: `¿Qué límites tiene el plan gratuito de ${tool.name}?`, respuesta: limits.slice(0, 4).map(conPunto).join(' ') });
  }
  return out;
}
