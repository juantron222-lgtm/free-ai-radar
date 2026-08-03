import type { FreeModel, Hosting, Platform, SkillLevel } from '@lib/domain/taxonomy';
import type { TriState } from '@lib/domain/primitives';
import type { Freshness } from '@lib/domain/scoring';

/**
 * The minimum a record needs to be filterable.
 *
 * `Tool` satisfies it structurally, and so does the compact index the browser
 * receives — which is how server-rendered and client-side filtering stay
 * guaranteed identical without shipping the whole catalogue to the client.
 */
export interface FilterableTool {
  slug: string;
  name: string;
  categorySlug: string;
  secondaryCategories: string[];
  freeModel: FreeModel;
  platforms: readonly Platform[];
  hosting: Hosting;
  skillLevel: SkillLevel;
  openSource: TriState;
  scoreTotal: number;
  freshness: Freshness;
  detectedAt: string;
  lastVerifiedAt: string;
  freePlan: {
    requiresCreditCard: TriState;
    requiresSignup: TriState;
    hasWatermark: TriState;
    commercialUse: TriState;
  };
}

/**
 * Filter state.
 *
 * The single source of truth is the URL query string. Every filter is
 * combinable, every combination is shareable, and the same parser runs on the
 * server (for prerendered/SSR pages) and in the browser (for instant
 * re-filtering). One implementation, no divergence.
 */
export interface FilterState {
  q: string;
  categories: string[];
  freeModels: FreeModel[];
  platforms: Platform[];
  hosting: Hosting[];
  skill: SkillLevel[];
  /** Hard requirements — each one is an AND. */
  noCard: boolean;
  noSignup: boolean;
  noWatermark: boolean;
  commercial: boolean;
  openSource: boolean;
  verifiedRecently: boolean;
  minScore: number;
  sort: SortKey;
}

export type SortKey = 'score' | 'recent' | 'verified' | 'name';

export const SORT_OPTIONS: ReadonlyArray<{ key: SortKey; label: string }> = [
  { key: 'score', label: 'Mejor puntuación' },
  { key: 'verified', label: 'Verificadas hace menos' },
  { key: 'recent', label: 'Añadidas hace menos' },
  { key: 'name', label: 'Alfabético' },
];

export const EMPTY_FILTERS: FilterState = {
  q: '',
  categories: [],
  freeModels: [],
  platforms: [],
  hosting: [],
  skill: [],
  noCard: false,
  noSignup: false,
  noWatermark: false,
  commercial: false,
  openSource: false,
  verifiedRecently: false,
  minScore: 0,
  sort: 'score',
};

const LIST_SEPARATOR = ',';

function readList(params: URLSearchParams, key: string): string[] {
  const raw = params.get(key);
  if (!raw) return [];
  return [...new Set(raw.split(LIST_SEPARATOR).map((s) => s.trim()).filter(Boolean))];
}

function readFlag(params: URLSearchParams, key: string): boolean {
  return params.get(key) === '1';
}

export function parseFilters(input: URLSearchParams | string): FilterState {
  const params = typeof input === 'string' ? new URLSearchParams(input) : input;
  const sortRaw = params.get('sort');
  const sort = SORT_OPTIONS.some((o) => o.key === sortRaw) ? (sortRaw as SortKey) : 'score';
  const minScore = Number.parseInt(params.get('min') ?? '', 10);

  return {
    q: (params.get('q') ?? '').trim().slice(0, 100),
    categories: readList(params, 'cat'),
    freeModels: readList(params, 'free') as FreeModel[],
    platforms: readList(params, 'plat') as Platform[],
    hosting: readList(params, 'host') as Hosting[],
    skill: readList(params, 'skill') as SkillLevel[],
    noCard: readFlag(params, 'nocard'),
    noSignup: readFlag(params, 'nosignup'),
    noWatermark: readFlag(params, 'nowm'),
    commercial: readFlag(params, 'comm'),
    openSource: readFlag(params, 'oss'),
    verifiedRecently: readFlag(params, 'fresh'),
    minScore: Number.isFinite(minScore) ? Math.min(100, Math.max(0, minScore)) : 0,
    sort,
  };
}

/** Serialises back to a query string. Defaults are omitted to keep URLs short. */
export function serializeFilters(state: FilterState): string {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.categories.length) params.set('cat', state.categories.join(LIST_SEPARATOR));
  if (state.freeModels.length) params.set('free', state.freeModels.join(LIST_SEPARATOR));
  if (state.platforms.length) params.set('plat', state.platforms.join(LIST_SEPARATOR));
  if (state.hosting.length) params.set('host', state.hosting.join(LIST_SEPARATOR));
  if (state.skill.length) params.set('skill', state.skill.join(LIST_SEPARATOR));
  if (state.noCard) params.set('nocard', '1');
  if (state.noSignup) params.set('nosignup', '1');
  if (state.noWatermark) params.set('nowm', '1');
  if (state.commercial) params.set('comm', '1');
  if (state.openSource) params.set('oss', '1');
  if (state.verifiedRecently) params.set('fresh', '1');
  if (state.minScore > 0) params.set('min', String(state.minScore));
  if (state.sort !== 'score') params.set('sort', state.sort);
  return params.toString();
}

export function isDefaultFilters(state: FilterState): boolean {
  return serializeFilters(state) === '';
}

export function countActiveFilters(state: FilterState): number {
  return (
    (state.q ? 1 : 0) +
    state.categories.length +
    state.freeModels.length +
    state.platforms.length +
    state.hosting.length +
    state.skill.length +
    (state.noCard ? 1 : 0) +
    (state.noSignup ? 1 : 0) +
    (state.noWatermark ? 1 : 0) +
    (state.commercial ? 1 : 0) +
    (state.openSource ? 1 : 0) +
    (state.verifiedRecently ? 1 : 0) +
    (state.minScore > 0 ? 1 : 0)
  );
}

/**
 * Applies every active filter as an AND, then sorts.
 *
 * Note on tri-state fields: a hard requirement like "sin tarjeta" only matches
 * `'no'`. An unverified field never satisfies a requirement — we will not pass
 * off an unknown as a guarantee.
 */
export function applyFilters<T extends FilterableTool>(
  tools: readonly T[],
  state: FilterState
): T[] {
  const result = tools.filter((tool) => {
    if (state.categories.length) {
      const inCategory =
        state.categories.includes(tool.categorySlug) ||
        tool.secondaryCategories.some((c) => state.categories.includes(c));
      if (!inCategory) return false;
    }
    if (state.freeModels.length && !state.freeModels.includes(tool.freeModel)) return false;
    if (
      state.platforms.length &&
      !state.platforms.some((p) => (tool.platforms as readonly string[]).includes(p))
    ) {
      return false;
    }
    if (state.hosting.length && !state.hosting.includes(tool.hosting)) return false;
    if (state.skill.length && !state.skill.includes(tool.skillLevel)) return false;

    if (state.noCard && tool.freePlan.requiresCreditCard !== 'no') return false;
    if (state.noSignup && tool.freePlan.requiresSignup !== 'no') return false;
    if (state.noWatermark && tool.freePlan.hasWatermark !== 'no') return false;
    if (state.commercial && tool.freePlan.commercialUse !== 'yes') return false;
    if (state.openSource && tool.openSource !== 'yes') return false;
    if (state.verifiedRecently && tool.freshness !== 'fresh') return false;
    if (state.minScore > 0 && tool.scoreTotal < state.minScore) return false;

    return true;
  });

  return sortTools(result, state.sort);
}

export function sortTools<T extends FilterableTool>(tools: T[], sort: SortKey): T[] {
  const sorted = [...tools];
  switch (sort) {
    case 'name':
      return sorted.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    case 'recent':
      return sorted.sort(
        (a, b) => b.detectedAt.localeCompare(a.detectedAt) || b.scoreTotal - a.scoreTotal
      );
    case 'verified':
      return sorted.sort(
        (a, b) => b.lastVerifiedAt.localeCompare(a.lastVerifiedAt) || b.scoreTotal - a.scoreTotal
      );
    case 'score':
    default:
      return sorted.sort(
        (a, b) => b.scoreTotal - a.scoreTotal || a.name.localeCompare(b.name, 'es')
      );
  }
}

/**
 * Describes the current filter set in Spanish, for the results heading and the
 * `<title>` of a filtered view.
 */
export function describeFilters(
  state: FilterState,
  categoryName: (slug: string) => string
): string {
  const parts: string[] = [];
  if (state.categories.length) parts.push(state.categories.map(categoryName).join(' y '));
  if (state.openSource) parts.push('open source');
  if (state.hosting.includes('local')) parts.push('que funcionan en local');
  if (state.noCard) parts.push('sin tarjeta');
  if (state.noSignup) parts.push('sin registro');
  if (state.noWatermark) parts.push('sin marca de agua');
  if (state.commercial) parts.push('con uso comercial');
  if (!parts.length) return 'Todas las herramientas';
  return `Herramientas ${parts.join(', ')}`;
}
