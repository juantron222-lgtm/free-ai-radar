import { z } from 'zod';

/**
 * Lo que el agente lector devuelve antes de escribir una sola frase.
 *
 * El circuito anterior extraía con expresiones regulares y sólo sabía
 * reconocer cuatro cosas — fecha, disponibilidad, precio y licencia—. Por eso
 * de una ronda de 3.000 millones no sacaba nada y de un artículo sobre núcleos
 * de GPU sacaba «Weights are immutable», que casaba con el patrón de licencias
 * sin tener nada que ver. La sección no era aburrida por falta de fuentes: era
 * aburrida porque sólo podía citar las cuatro cosas que sus regex encontraban.
 *
 * Así que extrae un agente. Y como un agente puede equivocarse de una forma que
 * un regex no —inventar—, la estructura de abajo existe para que la invención
 * sea **comprobable mecánicamente** y no una cuestión de confianza:
 *
 *   afirmación   lo que sostenemos
 *   cita         el texto exacto del artículo que lo sostiene
 *   fuente       de qué URL salió
 *   fecha        cuándo lo publicó el fabricante
 *   tipo         de qué clase de hecho hablamos
 *   confianza    cuánto de firme es
 *   naturaleza   dato, atribución o interpretación
 *
 * La pieza que hace que esto valga algo es `verificarCitas`: el servidor vuelve
 * a descargar el artículo y comprueba que **cada cita aparece literalmente**.
 * Una cita inventada no pasa, por bien escrita que esté la noticia.
 */

/** De qué habla el hecho. Más ancho que el del extractor viejo, a propósito. */
export const TipoHecho = z.enum([
  'que-ha-pasado',
  'cifra',
  'fecha',
  'disponibilidad',
  'precio',
  'licencia',
  'partes',
  'capacidad',
  'limitacion',
  'contexto',
]);
export type TipoHecho = z.infer<typeof TipoHecho>;

export const Confianza = z.enum(['alta', 'media', 'baja']);
export type Confianza = z.infer<typeof Confianza>;

/**
 * Qué clase de cosa es, que no es lo mismo que cuánto nos fiamos.
 *
 *   dato            el artículo lo afirma como hecho comprobable
 *   atribucion      lo afirma el fabricante sobre sí mismo: «el mejor», «el mayor»
 *   interpretacion  lo deducimos nosotros a partir de lo anterior
 *
 * La distinción es la que impide el error más caro de este oficio: publicar
 * «es el mayor de Europa» como hecho cuando lo que hay es una empresa
 * diciéndolo de sí misma.
 */
export const Naturaleza = z.enum(['dato', 'atribucion', 'interpretacion']);
export type Naturaleza = z.infer<typeof Naturaleza>;

export const Hecho = z.object({
  afirmacion: z.string().min(10),
  cita: z.string().min(10),
  fuente: z.string().url(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tipo: TipoHecho,
  confianza: Confianza,
  naturaleza: Naturaleza,
});
export type Hecho = z.infer<typeof Hecho>;

export const Hechos = z.array(Hecho);

/* ------------------------------------------------------------- garantías -- */

/** Normaliza para comparar: el HTML y la prosa no coinciden en espacios ni comillas. */
export function normalizar(texto: string): string {
  return String(texto ?? '')
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export interface CitaComprobada {
  hecho: Hecho;
  literal: boolean;
}

/**
 * ¿Aparece cada cita, palabra por palabra, en el artículo?
 *
 * Es la única barrera real contra la invención, y por eso no se hace por
 * parecido ni por porcentaje: o el texto está, o no está. Un agente que
 * parafrasee y lo presente como cita falla aquí, que es exactamente donde debe
 * fallar — antes de que nadie lo lea.
 */
export function verificarCitas(
  hechos: readonly Hecho[],
  cuerpoPorUrl: Readonly<Record<string, string>>
): { ok: boolean; comprobadas: CitaComprobada[]; faltan: string[] } {
  const comprobadas: CitaComprobada[] = [];
  const faltan: string[] = [];

  for (const hecho of hechos) {
    const cuerpo = normalizar(cuerpoPorUrl[hecho.fuente] ?? '');
    const literal = cuerpo.length > 0 && cuerpo.includes(normalizar(hecho.cita));

    comprobadas.push({ hecho, literal });
    if (!literal) faltan.push(`«${hecho.cita.slice(0, 70)}…» no aparece en ${hecho.fuente}`);
  }

  return { ok: faltan.length === 0, comprobadas, faltan };
}

/**
 * Si el conjunto de hechos da para escribir una noticia.
 *
 * No es la puerta de publicación —ésa sigue siendo `checkDraft`— sino la de
 * redacción: sin material no se escribe, y sin esto el agente rellenaría con
 * interpretación lo que no encontró en el artículo.
 */
export function suficienteParaRedactar(hechos: readonly Hecho[]): {
  ok: boolean;
  motivos: string[];
} {
  const motivos: string[] = [];

  const datos = hechos.filter((h) => h.naturaleza === 'dato');
  const sustancia = hechos.filter(
    (h) => h.naturaleza !== 'interpretacion' && ['que-ha-pasado', 'cifra', 'capacidad', 'partes'].includes(h.tipo)
  );

  if (!hechos.some((h) => h.tipo === 'fecha')) {
    motivos.push('no hay ningún hecho que fije la fecha de publicación');
  }

  if (sustancia.length === 0) {
    /*
     * El fallo que hundía al circuito anterior, dicho al derecho: una fecha y
     * una frase de disponibilidad no son una noticia. Hace falta al menos un
     * hecho que cuente qué ha ocurrido.
     */
    motivos.push('ningún hecho cuenta qué ha ocurrido: sólo hay metadatos');
  }

  if (datos.length === 0) {
    motivos.push('todo lo aportado es atribución o interpretación: no hay ningún dato');
  }

  return { ok: motivos.length === 0, motivos };
}

/**
 * Lo que no puede afirmarse sin atribuir.
 *
 * Un superlativo del fabricante sobre sí mismo es publicable — diciendo quién
 * lo dice. Publicado a secas se convierte en nuestro.
 */
export function exigenAtribucion(hechos: readonly Hecho[]): Hecho[] {
  return hechos.filter((h) => h.naturaleza === 'atribucion');
}
