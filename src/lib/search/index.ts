import type { Tool } from '@lib/domain/tool';
import { CAPABILITY_LABEL, PRODUCT_TYPE_LABEL } from '@lib/domain/taxonomy';
import { TOOL_KIND_LABEL } from '@lib/domain/tool';
import {
  detectar,
  fuerza,
  palabrasClave,
  type Deteccion,
  type HechosIndexables,
  type Intencion,
} from './intents';

/**
 * Search.
 *
 * Deliberately not a dependency. The catalogue is in the low hundreds of
 * records, so a well-built inverted index plus a bounded edit-distance pass
 * beats shipping a 40 KB fuzzy-search library — and it stays honest about *why*
 * something matched, which the UI uses to highlight the reason.
 *
 * Sobre esa base va una capa de intención. El buscador pide tareas —«Quitar
 * fondo, transcribir audio, generar vídeo…»— y hasta ahora las trataba como
 * texto suelto: «crear una app» devolvía Suno y Midjourney, «subtítulos»
 * devolvía cero. Una tarea no se contesta pareciéndose a una descripción, se
 * contesta con lo que el catálogo sabe hacer. Ver `intents.ts`.
 */

export interface SearchDoc {
  slug: string;
  name: string;
  tagline: string;
  category: string;
  /** Everything searchable, already normalised. */
  haystack: string;
  /** Individual weighted fields, normalised. */
  fields: {
    name: string;
    alias: string;
    intent: string;
    product: string;
    vertical: string;
    text: string;
  };
  /** Los hechos verificados que deciden si una intención se cumple. */
  hechos: HechosIndexables;
}

export type SearchField = keyof SearchDoc['fields'];

export interface SearchHit {
  slug: string;
  score: number;
  /** Qué produjo la coincidencia más fuerte — alimenta el subtítulo. */
  matchedOn: SearchField | 'intent';
  /** Si ganó por intención, cuál. Texto público, nunca el token interno. */
  intent?: string;
}

/** Lowercase, strip accents, collapse whitespace. */
export function normalize(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(input: string): string[] {
  return palabrasClave(input).filter((t) => t.length > 1);
}

/**
 * Los pesos, escritos donde se puedan discutir.
 *
 * El orden es el de la certeza, de más a menos: quien escribe el nombre exacto
 * de algo sabe qué busca; quien escribe una tarea describe un problema; quien
 * escribe una palabra que sólo aparece en una descripción puede estar buscando
 * cualquier cosa.
 *
 *   name     12  El nombre. Nada gana a saber cómo se llama.
 *   alias     9  Cómo lo llama la gente («GPT», «SD»). Casi tan fiable.
 *   intent    7  Capacidades verificadas. Lo que sabe hacer, según su ficha.
 *   product   5  Qué clase de producto es. Discrimina de verdad.
 *   vertical  4  A qué familia pertenece. Amplio pero cierto.
 *   text      2  Titular, descripción, casos de uso, etiquetas. Prosa.
 *
 * Ninguno de estos números procede de la vieja nota sobre 100 ni la consulta:
 * `scoreTotal` no entra en este fichero ni en el índice que va al navegador.
 */
const FIELD_WEIGHTS: Record<SearchField, number> = {
  name: 12,
  alias: 9,
  intent: 7,
  product: 5,
  vertical: 4,
  text: 2,
};

/**
 * Lo que vale reconocer la tarea.
 *
 * Por encima del nombre a propósito. Si alguien escribe «quitar fondo», las
 * ocho herramientas que lo hacen tienen que ir delante de la que casualmente
 * dice «fondo» en su descripción, aunque ésta se llame «Fondo Pro». Sólo se
 * cobra una vez por intención satisfecha: dos intenciones cumplidas valen más
 * que una, que es exactamente lo que pide «transcribir gratis sin tarjeta».
 */
const BONO_INTENCION = 16;

/**
 * El suelo de ruido.
 *
 * 1,5 es justo por encima de lo que saca una coincidencia difusa contra la
 * descripción (0,35 × 2 = 0,7): la clase de resultado que hacía que «crear una
 * app» devolviese Midjourney. Antes estaba en 0,35 y dejaba pasar cualquier
 * cosa que se pareciese de lejos a una palabra de la prosa.
 */
const UMBRAL = 1.5;

function textoDe(tool: Tool): string {
  return [
    tool.tagline,
    tool.descriptionShort,
    tool.useCases.join(' '),
    tool.tags.join(' '),
    tool.badges.join(' '),
  ].join(' ');
}

function intencionesDe(tool: Tool): string {
  /*
   * Las capacidades se indexan por su etiqueta pública, no por su token. El
   * token es `background-removal`; lo que alguien escribe es «quitar fondo».
   * Indexar el token haría que el autocompletado enseñase guiones e inglés.
   */
  const capacidades = tool.capabilities.map((c) => CAPABILITY_LABEL[c] ?? '').filter(Boolean);
  return capacidades.join(' ');
}

function productoDe(tool: Tool): string {
  return [
    tool.productType ? PRODUCT_TYPE_LABEL[tool.productType] : '',
    TOOL_KIND_LABEL[tool.kind] ?? '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function hechosDe(tool: Tool): HechosIndexables {
  return {
    capabilities: tool.capabilities,
    categorySlug: tool.categorySlug,
    secondaryCategories: tool.secondaryCategories,
    productType: tool.productType ?? null,
    hosting: tool.hosting,
    freeModel: tool.freeModel,
    requiresCreditCard: tool.freePlan.requiresCreditCard,
    creditReset: tool.freePlan.creditReset ?? null,
  };
}

export function buildSearchDocs(
  tools: readonly Tool[],
  categoryName: (slug: string) => string
): SearchDoc[] {
  return tools.map((tool) => {
    const fields = {
      name: normalize(tool.name),
      alias: normalize(tool.alternativeNames.join(' ')),
      intent: normalize(intencionesDe(tool)),
      product: normalize(productoDe(tool)),
      vertical: normalize([categoryName(tool.categorySlug), ...tool.secondaryCategories.map(categoryName)].join(' ')),
      text: normalize(textoDe(tool)),
    };
    return {
      slug: tool.slug,
      name: tool.name,
      tagline: tool.tagline,
      category: tool.categorySlug,
      haystack: Object.values(fields).join(' '),
      fields,
      hechos: hechosDe(tool),
    };
  });
}

/**
 * Bounded Levenshtein: returns `maxDistance + 1` as soon as it is certain the
 * answer exceeds the budget, so a long non-match costs almost nothing.
 */
export function editDistance(a: string, b: string, maxDistance = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
      if (curr[j]! < rowMin) rowMin = curr[j]!;
    }
    if (rowMin > maxDistance) return maxDistance + 1;
    [prev, curr] = [curr, prev];
  }

  return prev[b.length]!;
}

/** Typo budget scales with word length: short words must match exactly. */
function typoBudget(term: string): number {
  if (term.length <= 3) return 0;
  if (term.length <= 6) return 1;
  return 2;
}

function scoreField(field: string, term: string): number {
  if (!field) return 0;

  // Exact word, then prefix, then fuzzy — each worth progressively less.
  const words = field.split(' ');
  if (words.includes(term)) return 1;
  if (field.startsWith(term)) return 0.9;
  if (words.some((w) => w.startsWith(term))) return 0.75;
  if (field.includes(term)) return 0.5;

  const budget = typoBudget(term);
  if (budget === 0) return 0;
  for (const word of words) {
    if (Math.abs(word.length - term.length) > budget) continue;
    if (editDistance(word, term, budget) <= budget) return 0.35;
  }
  return 0;
}

export interface SearchOptions {
  limit?: number;
  /** Below this, a hit is considered noise and dropped. */
  minScore?: number;
}

export interface SearchResult {
  hits: SearchHit[];
  /** Las intenciones que se han reconocido, para poder explicarlas. */
  intents: Intencion[];
}

/** Las palabras que ya explica una intención reconocida. */
function palabrasExplicadas(detecciones: readonly Deteccion[]): Set<string> {
  const explicadas = new Set<string>();
  for (const deteccion of detecciones) {
    for (const palabra of deteccion.palabras) explicadas.add(palabra);
  }
  return explicadas;
}

export function searchWithIntents(
  docs: readonly SearchDoc[],
  query: string,
  options: SearchOptions = {}
): SearchResult {
  const { limit = 20, minScore = UMBRAL } = options;
  const terms = tokenize(query);
  const detecciones = detectar(query);
  const intenciones = detecciones.map((d) => d.intencion);
  const exigidas = detecciones.filter((d) => d.restringe);
  if (!terms.length && !detecciones.length) return { hits: [], intents: [] };

  /*
   * Un término que la intención ya explica no se le exige además al texto.
   * «quitar fondo» lo cumple Clipdrop por su capacidad verificada; que su
   * descripción no contenga la palabra «quitar» no lo hace menos respuesta.
   */
  const explicadas = palabrasExplicadas(detecciones);
  const exigibles = terms.filter((t) => !explicadas.has(t));

  const hits: SearchHit[] = [];

  for (const doc of docs) {
    const satisfechas = detecciones
      .map((d) => ({ intencion: d.intencion, restringe: d.restringe, fuerza: fuerza(doc.hechos, d.intencion) }))
      .filter((s) => s.fuerza > 0);
    const encaje = satisfechas.reduce((suma, s) => suma + s.fuerza, 0);
    const cumplidasExigidas = satisfechas.filter((s) => s.restringe).length;

    let total = 0;
    let bestField: SearchField = 'name';
    let bestFieldScore = 0;
    let cumplidos = 0;

    for (const term of terms) {
      let termBest = 0;
      for (const key of Object.keys(FIELD_WEIGHTS) as SearchField[]) {
        const raw = scoreField(doc.fields[key], term);
        if (raw === 0) continue;
        const weighted = raw * FIELD_WEIGHTS[key];
        if (weighted > termBest) termBest = weighted;
        if (weighted > bestFieldScore) {
          bestFieldScore = weighted;
          bestField = key;
        }
      }
      if (termBest > 0 && !explicadas.has(term)) cumplidos++;
      total += termBest;
    }

    /*
     * Escribir el nombre exacto siempre funciona.
     *
     * Es la vía de escape de la restricción por intención: quien busca «Local
     * Deep Researcher» ha escrito «local», pero está buscando una herramienta
     * concreta, no filtrando el catálogo por dónde se ejecuta.
     */
    const porNombre =
      exigibles.length > 0 &&
      exigibles.every(
        (t) => scoreField(doc.fields.name, t) >= 0.9 || scoreField(doc.fields.alias, t) >= 0.9
      );

    /*
     * Si la consulta pide algo concreto, lo que no lo cumple no sale.
     *
     * Ésta es la diferencia entre ordenar mejor y contestar. «Crear una app»
     * con Suno en el sexto puesto sigue siendo una respuesta equivocada. Y si
     * no lo cumple nadie, la lista se queda vacía: es más honesto que rellenar.
     */
    if (exigidas.length && cumplidasExigidas < exigidas.length && !porNombre) continue;

    // Todo término no explicado por una intención tiene que aportar algo.
    const cobertura = exigibles.length ? cumplidos / exigibles.length : 1;
    if (cobertura < 0.5) continue;

    const final = total * cobertura + BONO_INTENCION * encaje;
    if (final < minScore) continue;

    const ganaLaIntencion = encaje > 0 && BONO_INTENCION * encaje > bestFieldScore;
    const mejorIntencion = satisfechas.reduce(
      (mejor, s) => (s.fuerza > mejor.fuerza ? s : mejor),
      satisfechas[0] ?? { intencion: null as Intencion | null, fuerza: 0 }
    );

    hits.push({
      slug: doc.slug,
      score: final,
      matchedOn: ganaLaIntencion ? 'intent' : bestField,
      ...(ganaLaIntencion && mejorIntencion.intencion
        ? { intent: mejorIntencion.intencion.etiqueta }
        : {}),
    });
  }

  /*
   * El desempate es alfabético y nada más.
   *
   * Neutral y determinista: no reintroduce por la puerta de atrás ni la nota
   * sobre 100, ni la fecha, ni el orden en que estaban en el fichero. Dos
   * herramientas que responden igual de bien salen siempre en el mismo orden,
   * y ese orden no premia a nadie.
   */
  const nombre = new Map(docs.map((d) => [d.slug, d.name]));
  return {
    hits: hits
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (nombre.get(a.slug) ?? a.slug).localeCompare(nombre.get(b.slug) ?? b.slug, 'es');
      })
      .slice(0, limit),
    intents: intenciones,
  };
}

export function search(
  docs: readonly SearchDoc[],
  query: string,
  options: SearchOptions = {}
): SearchHit[] {
  return searchWithIntents(docs, query, options).hits;
}

/** Filters a tool list by a text query, preserving relevance order. */
export function searchTools(
  tools: readonly Tool[],
  docs: readonly SearchDoc[],
  query: string,
  limit = 200
): Tool[] {
  if (!query.trim()) return [...tools];
  const hits = search(docs, query, { limit });
  const bySlug = new Map(tools.map((t) => [t.slug, t]));
  return hits.map((h) => bySlug.get(h.slug)).filter((t): t is Tool => Boolean(t));
}
