import type { Tool } from '@lib/domain/tool';
import type { FilterableTool } from './filters';
import { normalize } from './index';

/**
 * The payload the browser receives for instant filtering and search.
 *
 * Kept deliberately small: only what `applyFilters` and `search` need, with
 * the searchable text pre-normalised so the client does no accent-stripping
 * work at keystroke time. ~350 bytes per tool.
 */
export interface ClientIndexEntry extends FilterableTool {
  /** Pre-normalised, weight-ordered search fields. */
  f: [name: string, tagline: string, tags: string, useCases: string, category: string, description: string];
}

export function buildClientIndex(
  tools: readonly Tool[],
  categoryName: (slug: string) => string
): ClientIndexEntry[] {
  return tools.map((tool) => ({
    slug: tool.slug,
    name: tool.name,
    categorySlug: tool.categorySlug,
    secondaryCategories: tool.secondaryCategories,
    freeModel: tool.freeModel,
    platforms: tool.platforms,
    hosting: tool.hosting,
    startEffort: tool.startEffort,
    openSource: tool.openSource,
    freshness: tool.freshness,
    detectedAt: tool.detectedAt,
    lastVerifiedAt: tool.lastVerifiedAt,
    freePlan: {
      requiresCreditCard: tool.freePlan.requiresCreditCard,
      requiresSignup: tool.freePlan.requiresSignup,
      hasWatermark: tool.freePlan.hasWatermark,
      commercialUse: tool.freePlan.commercialUse,
    },
    f: [
      normalize(tool.name),
      normalize(tool.tagline),
      normalize([...tool.badges, ...tool.tags].join(' ')),
      normalize(tool.useCases.join(' ')),
      normalize(categoryName(tool.categorySlug)),
      normalize(`${tool.descriptionShort} ${tool.alternativeNames.join(' ')}`),
    ],
  }));
}

/** Rebuilds `SearchDoc`s from the compact index, client-side. */
export function docsFromIndex(entries: readonly ClientIndexEntry[]) {
  return entries.map((entry) => ({
    slug: entry.slug,
    name: entry.name,
    tagline: entry.f[1],
    category: entry.categorySlug,
    haystack: entry.f.join(' '),
    fields: {
      name: entry.f[0],
      tagline: entry.f[1],
      tags: entry.f[2],
      useCases: entry.f[3],
      category: entry.f[4],
      description: entry.f[5],
    },
  }));
}
