import type { Tool } from '@lib/domain/tool';

/**
 * Search.
 *
 * Deliberately not a dependency. The catalogue is in the low hundreds of
 * records, so a well-built inverted index plus a bounded edit-distance pass
 * beats shipping a 40 KB fuzzy-search library — and it stays honest about *why*
 * something matched, which the UI uses to highlight the reason.
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
    tagline: string;
    tags: string;
    useCases: string;
    category: string;
    description: string;
  };
}

export interface SearchHit {
  slug: string;
  score: number;
  /** Which field produced the strongest match — drives the result subtitle. */
  matchedOn: keyof SearchDoc['fields'];
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
  const stop = STOPWORDS;
  return normalize(input)
    .split(' ')
    .filter((t) => t.length > 1 && !stop.has(t));
}

const STOPWORDS = new Set([
  'de', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'o', 'para', 'con', 'sin',
  'que', 'del', 'al', 'en', 'por', 'the', 'a', 'of', 'to', 'for', 'and', 'or', 'ia', 'ai',
]);

const FIELD_WEIGHTS: Record<keyof SearchDoc['fields'], number> = {
  name: 10,
  tagline: 5,
  tags: 4,
  useCases: 3,
  category: 3,
  description: 1,
};

export function buildSearchDocs(
  tools: readonly Tool[],
  categoryName: (slug: string) => string
): SearchDoc[] {
  return tools.map((tool) => {
    const fields = {
      name: normalize(tool.name),
      tagline: normalize(tool.tagline),
      tags: normalize([...tool.badges, ...tool.tags].join(' ')),
      useCases: normalize(tool.useCases.join(' ')),
      category: normalize(categoryName(tool.categorySlug)),
      description: normalize(`${tool.descriptionShort} ${tool.alternativeNames.join(' ')}`),
    };
    return {
      slug: tool.slug,
      name: tool.name,
      tagline: tool.tagline,
      category: tool.categorySlug,
      haystack: Object.values(fields).join(' '),
      fields,
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

export function search(
  docs: readonly SearchDoc[],
  query: string,
  options: SearchOptions = {}
): SearchHit[] {
  const { limit = 20, minScore = 0.35 } = options;
  const terms = tokenize(query);
  if (!terms.length) return [];

  const hits: SearchHit[] = [];

  for (const doc of docs) {
    let total = 0;
    let bestField: keyof SearchDoc['fields'] = 'name';
    let bestFieldScore = 0;
    let matchedTerms = 0;

    for (const term of terms) {
      let termBest = 0;
      for (const key of Object.keys(FIELD_WEIGHTS) as Array<keyof SearchDoc['fields']>) {
        const raw = scoreField(doc.fields[key], term);
        if (raw === 0) continue;
        const weighted = raw * FIELD_WEIGHTS[key];
        if (weighted > termBest) termBest = weighted;
        if (weighted > bestFieldScore) {
          bestFieldScore = weighted;
          bestField = key;
        }
      }
      if (termBest > 0) matchedTerms++;
      total += termBest;
    }

    if (!matchedTerms) continue;

    // Every term must contribute something, otherwise a two-word query would
    // rank a one-word partial match above a full match.
    const coverage = matchedTerms / terms.length;
    if (coverage < 0.5) continue;

    /*
     * Sólo relevancia.
     *
     * Aquí se sumaba `doc.score / 1000`, que metía la nota sobre 100 como
     * desempate. Pesaba poco y no lo decía nadie: la peor combinación posible,
     * porque nadie podía notarlo y sin embargo ordenaba.
     */
    const finalScore = total * coverage;

    if (finalScore < minScore) continue;
    hits.push({ slug: doc.slug, score: finalScore, matchedOn: bestField });
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
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
