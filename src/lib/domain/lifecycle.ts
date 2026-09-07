import type { HydratedNewsItem } from '@lib/domain/news';

/**
 * El ciclo de vida de una noticia en portada.
 *
 * El problema que resuelve es el que hace que una sección de novedades parezca
 * abandonada: no la falta de noticias nuevas, sino la acumulación de viejas. Una
 * portada con veinte historias de hace meses dice «aquí no vive nadie» con más
 * fuerza que una portada vacía.
 *
 * La regla de fondo: **envejecer no es desaparecer**. Una noticia sale de la
 * portada y sigue existiendo en su URL, en el sitemap y en cualquier enlace que
 * alguien haya guardado. Lo que cambia es dónde se la encuentra, no si se la
 * encuentra — y por eso esto es una partición derivada de la fecha, no un
 * borrado ni un cambio de estado que pudiera perder una página por accidente.
 */

/** Cuántas historias sostiene la portada antes de parecer un vertedero. */
export const PORTADA_MAX = 12;

/** A partir de aquí una noticia deja de ser «reciente», por vieja que sea la sección. */
export const DIAS_FRESCA = 45;

/**
 * Relevancia editorial, para desempatar cuando la fecha no basta.
 *
 * No es una nota ni un ranking: sólo decide qué se queda arriba cuando hay más
 * candidatas que sitio. Lo que cambia el acceso gratuito pesa más que lo que
 * cambia un precio de API, porque es lo que este sitio existe para contar.
 */
export function relevancia(item: HydratedNewsItem): number {
  let puntos = 0;

  if (item.affectsFreePlan === 'yes') puntos += 40;
  if (item.availability === 'available') puntos += 15;
  if (item.availability === 'deprecated') puntos += 20;
  if (item.eventType === 'retirada') puntos += 10;
  if (item.eventType === 'lanzamiento') puntos += 10;
  if (item.eventType === 'disponibilidad-general') puntos += 10;
  if (item.verification === 'verified') puntos += 10;

  /*
   * Una integración pesa menos que un lanzamiento del fabricante. Que un modelo
   * ajeno funcione en una plataforma es noticia, pero no la misma noticia.
   */
  if (item.eventType === 'actualizacion' && item.availability === 'limited') puntos -= 10;

  return puntos;
}

export interface Portada {
  /** Lo que se ve arriba, ya ordenado. */
  destacadas: HydratedNewsItem[];
  /** Sigue publicada y accesible; ya no ocupa portada. */
  archivo: HydratedNewsItem[];
  motivos: Array<{ slug: string; motivo: string }>;
}

/**
 * Reparte lo publicado entre portada y archivo.
 *
 * Dos criterios y en este orden: primero la edad, porque una noticia de hace
 * cuatro meses no es actualidad por relevante que fuera; después el sitio, que
 * es finito. Lo que cae del corte va al archivo con el motivo escrito, para que
 * el informe diario pueda decir por qué salió cada una.
 */
export function repartirPortada(
  items: readonly HydratedNewsItem[],
  { max = PORTADA_MAX, diasFresca = DIAS_FRESCA } = {}
): Portada {
  const motivos: Array<{ slug: string; motivo: string }> = [];

  const frescas: HydratedNewsItem[] = [];
  const viejas: HydratedNewsItem[] = [];

  for (const item of items) {
    if (item.ageDays > diasFresca) {
      viejas.push(item);
      motivos.push({ slug: item.slug, motivo: `${item.ageDays} días: pasa de ${diasFresca}` });
    } else {
      frescas.push(item);
    }
  }

  /* Entre las frescas manda la fecha; la relevancia sólo desempata. */
  const ordenadas = [...frescas].sort(
    (a, b) => b.publishedAt.localeCompare(a.publishedAt) || relevancia(b) - relevancia(a)
  );

  const destacadas = ordenadas.slice(0, max);
  const desbordadas = ordenadas.slice(max);

  for (const item of desbordadas) {
    motivos.push({ slug: item.slug, motivo: `la portada ya lleva ${max} historias más recientes` });
  }

  const archivo = [...desbordadas, ...viejas].sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt)
  );

  return { destacadas, archivo, motivos };
}

export interface Supersesion {
  /** La que queda desactualizada. */
  anterior: string;
  /** La que la sustituye. */
  nueva: string;
  producto: string;
  motivo: string;
}

/**
 * Qué historia ha quedado superada por otra.
 *
 * El caso concreto: se publica «X entra en preview» y tres semanas después «X ya
 * está disponible para todos». Las dos son ciertas y la primera ha dejado de
 * describir el mundo. Dejarlas juntas en portada es la forma más rápida de que
 * el sitio se contradiga a sí mismo.
 *
 * Sólo se declara superada cuando **la disponibilidad ha avanzado**: mismo
 * producto, mismo fabricante, fecha posterior y un estado que es estrictamente
 * más abierto. Dos noticias del mismo producto que cuentan cosas distintas no
 * se superan — se acompañan, y colapsarlas perdería una de las dos.
 */
const ESCALA_DISPONIBILIDAD: Record<string, number> = {
  announced: 1,
  preview: 2,
  limited: 3,
  available: 4,
};

function productoDe(item: HydratedNewsItem): string | null {
  const m = item.title
    .toLowerCase()
    .match(
      /\b(gpt-?[\d.]+|chatgpt|claude(?:\s+\w+)?|gemini(?:\s+\w+)?|gemma\s*\d*|llama\s*[\d.]*|mistral\w*|qwen[\d.\w-]*|deepseek\w*|flux(?:\s*[\d.]+)?|seedance|nemotron|sora|veo\s*\d|lyria|ollama)\b/
    );
  return m ? m[0].replace(/\s+/g, ' ') : null;
}

export function encontrarSupersesiones(items: readonly HydratedNewsItem[]): Supersesion[] {
  const salida: Supersesion[] = [];

  for (const nueva of items) {
    const productoNuevo = productoDe(nueva);
    if (!productoNuevo) continue;

    const nivelNuevo = ESCALA_DISPONIBILIDAD[nueva.availability];
    if (nivelNuevo === undefined) continue;

    for (const anterior of items) {
      if (anterior.slug === nueva.slug) continue;
      if (productoDe(anterior) !== productoNuevo) continue;
      if (anterior.publishedAt >= nueva.publishedAt) continue;

      const nivelAnterior = ESCALA_DISPONIBILIDAD[anterior.availability];
      if (nivelAnterior === undefined || nivelNuevo <= nivelAnterior) continue;

      salida.push({
        anterior: anterior.slug,
        nueva: nueva.slug,
        producto: productoNuevo,
        motivo: `${productoNuevo} pasó de "${anterior.availability}" a "${nueva.availability}"`,
      });
    }
  }

  return salida;
}
