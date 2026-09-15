import type { Capability } from '@lib/domain/taxonomy';
import type { Tool } from '@lib/domain/tool';
import { tieneAccesoGratuito } from '@lib/domain/acceso';

/**
 * Qué otra herramienta resuelve la misma tarea.
 *
 * Las alternativas salían por categoría y forma de acceso: a ChatGPT le
 * proponía Hugging Face Spaces y LM Studio, dos cosas que comparten con él la
 * palabra «chat» del catálogo y nada de lo que alguien hace con ChatGPT. Y
 * «Añadir otra» en el comparador ofrecía las doce primeras del abecedario.
 *
 * Una alternativa es algo que hace lo mismo y se usa de la misma manera. Eso
 * se puede leer en la ficha sin opinar:
 *
 *   tarea       Capacidades que las dos tienen. Pesa más que todo lo demás.
 *               Las de infraestructura —API, descargar modelos— cuentan poco:
 *               casi todo las tiene y no dicen qué haces con ello. «Generar
 *               texto» cuenta la mitad: la comparten un chat y un editor de
 *               código, y eso no los hace intercambiables.
 *   producto    Si las dos declaran tipo, construir la aplicación por ti y
 *               ayudarte a programarla no se sustituyen: Lovable no es la
 *               alternativa de un copiloto, aunque los dos escriban código.
 *   uso         Dónde se ejecuta. Algo que corre en tu equipo no sustituye a
 *               algo que usas en la web sin instalar nada, aunque hagan lo
 *               mismo; lo híbrido vale para las dos.
 *   clase       Producto de uso final, modelo o pieza donde se ejecutan
 *               modelos. Tiene que coincidir: un modelo por API no es la
 *               alternativa de un chat.
 *   gratis      Si la candidata se puede usar sin pagar. Es un desempate, no
 *               una condición: una ficha de pago también tiene alternativas.
 *   categoría   Sólo desempata.
 *
 * No entra la vieja nota sobre 100, ni la fecha, ni la popularidad. Entre
 * iguales, el orden es alfabético.
 */

const INFRAESTRUCTURA: ReadonlySet<Capability> = new Set([
  'api',
  'model-download',
  'model-hosting',
  'agents',
  'integrations',
]);

/**
 * Tres clases que no se sustituyen entre sí: lo que usa una persona, un modelo
 * que se llama desde otra cosa, y la pieza donde se montan o ejecutan modelos.
 * Gemma 4 se ejecuta dentro de Ollama; no es su alternativa.
 */
const CLASE: Record<Tool['kind'], 'uso' | 'modelo' | 'pieza'> = {
  app: 'uso',
  agent: 'uso',
  interface: 'uso',
  model: 'modelo',
  api: 'modelo',
  platform: 'pieza',
  framework: 'pieza',
  oss_project: 'pieza',
};

const PESO_INFRAESTRUCTURA = 0.25;
const COBERTURA_MINIMA = 0.25;
const PESO_GENERICA = 0.5;

/**
 * Lo que comparten cosas que no se sustituyen: un chat, un editor de código y
 * un agente generan texto y usan herramientas los tres.
 */
const GENERICAS: ReadonlySet<Capability> = new Set(['text-generation', 'tool-use', 'web-browsing']);

const pesoDe = (c: Capability): number =>
  INFRAESTRUCTURA.has(c) ? PESO_INFRAESTRUCTURA : GENERICAS.has(c) ? PESO_GENERICA : 1;

const esTarea = (c: Capability): boolean => !INFRAESTRUCTURA.has(c) && !GENERICAS.has(c);

/** Lo que las dos hacen, con su peso. */
export function tareaCompartida(base: Tool, candidata: Tool): { capacidades: Capability[]; peso: number } {
  const suyas = new Set(candidata.capabilities);
  const capacidades = base.capabilities.filter((c) => suyas.has(c));
  const peso = capacidades.reduce((suma, c) => suma + pesoDe(c), 0);
  return { capacidades, peso };
}

const familiaDe = (productType: string): string => (productType === 'app-builder' ? 'app-builder' : 'asistente');

const usoCompatible = (a: Tool, b: Tool): boolean =>
  a.hosting === 'hybrid' || b.hosting === 'hybrid' || a.hosting === b.hosting;

/** ¿Tiene la base alguna capacidad que diga qué se hace con ella? */
const tieneTareaPropia = (tool: Tool): boolean => tool.capabilities.some(esTarea);

/**
 * Cuánto se parece, para quien busca otra forma de hacer lo mismo. 0 es nada.
 *
 * Si la base dice qué hace, hace falta compartir al menos una tarea entera:
 * compartir sólo «tiene API», o sólo «genera texto», no convierte a nada en
 * alternativa. Si la base no dice qué hace —fichas aún sin capacidades—, se
 * cae a la categoría, que es lo único que sabemos.
 *
 * `flexible` quita la exigencia de clase y la penalización de uso. Sirve para no dejar sin
 * alternativas a lo que es único en su forma: Whisper se ejecuta en local y lo
 * que transcribe como él vive en la nube.
 */
export function afinidadDeTarea(base: Tool, candidata: Tool, flexible = false): number {
  if (base.slug === candidata.slug) return 0;

  const { capacidades, peso } = tareaCompartida(base, candidata);
  const especificas = capacidades.filter(esTarea).length;
  const mismaCategoria = candidata.categorySlug === base.categorySlug;
  const secundaria =
    candidata.secondaryCategories.includes(base.categorySlug) || base.secondaryCategories.includes(candidata.categorySlug);

  /*
   * Compartir una tarea entera, y una parte razonable de lo que hace la base.
   *
   * ChatGPT genera imágenes entre otras seis cosas: eso no convierte a Krea en
   * su alternativa. Se pide al menos una tarea en común y una cuarta parte de
   * las suyas. Lo que sólo declara capacidades genéricas —un modelo que «genera
   * texto»— se compara por categoría, que es lo único que lo distingue.
   */
  const propias = base.capabilities.filter(esTarea).length;
  if (tieneTareaPropia(base)) {
    if (especificas < 1 || especificas < propias * COBERTURA_MINIMA) return 0;
  } else if (!mismaCategoria && !secundaria) {
    return 0;
  }

  let puntos = 3 * peso;
  const mismaClase = CLASE[base.kind] === CLASE[candidata.kind];
  if (flexible) {
    puntos += (usoCompatible(base, candidata) ? 1 : 0) + (mismaClase ? 1 : 0);
  } else {
    /* Un modelo por API no es la alternativa de un chat, por mucho que compartan. */
    if (!mismaClase) return 0;
    puntos += usoCompatible(base, candidata) ? 1 : -2;
  }
  if (base.productType && candidata.productType) {
    /*
     * Lovable y un copiloto escriben código los dos, y no se sustituyen: uno
     * construye la aplicación por ti y el otro te ayuda a escribirla. Entre
     * editor, copiloto, agente y terminal sí hay sustitución: son formas de
     * programar con ayuda.
     */
    if (familiaDe(base.productType) !== familiaDe(candidata.productType) && !flexible) return 0;
    puntos += base.productType === candidata.productType ? 2 : 1;
  }
  puntos += tieneAccesoGratuito(candidata) ? 0.5 : 0;
  puntos += mismaCategoria ? 0.75 : secundaria ? 0.4 : 0;

  return Math.max(0, puntos);
}

/** Por debajo de esto no es una alternativa, es ruido: mejor no enseñar nada. */
export const AFINIDAD_MINIMA = 3;

/**
 * Las más parecidas a una o varias herramientas.
 *
 * Con varias —el comparador—, la afinidad se suma: la cuarta columna tiene que
 * encajar con las tres que ya están, no sólo con una.
 */
export function parecidas(
  bases: readonly Tool[],
  catalogo: readonly Tool[],
  limite: number,
  excluir: Iterable<string> = [],
  flexible = false
): Tool[] {
  const fuera = new Set([...bases.map((b) => b.slug), ...excluir]);
  return catalogo
    .filter((c) => !fuera.has(c.slug))
    .map((c) => {
      const afinidades = bases.map((b) => afinidadDeTarea(b, c, flexible));
      return { tool: c, puntos: afinidades.reduce((a, b) => a + b, 0), minima: Math.min(...afinidades) };
    })
    .filter((x) => x.minima >= AFINIDAD_MINIMA)
    .sort((a, b) => b.puntos - a.puntos || a.tool.name.localeCompare(b.tool.name, 'es'))
    .slice(0, limite)
    .map((x) => x.tool);
}
