import rawNews from '@/data/news/news.json';
import {
  NewsItem,
  findDuplicateStories,
  hydrateNews,
  isPublishable,
  type HydratedNewsItem,
} from '@lib/domain/news';
import { getTool } from './catalog';

/**
 * The newsroom.
 *
 * Same contract as the catalogue: validated at build, dangling references fail
 * the build, and nothing reaches a reader that has not passed `isPublishable`.
 */

class NewsError extends Error {}

function load(): HydratedNewsItem[] {
  const parsed = NewsItem.array().safeParse(rawNews);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 10)
      .map((i) => `  · ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new NewsError(`El dataset de noticias no cumple el esquema.\n${issues}`);
  }

  const published = parsed.data.filter((item) => item.status === 'published');

  for (const item of published) {
    const check = isPublishable(item);
    if (!check.ok) {
      throw new NewsError(
        `La noticia "${item.slug}" está marcada como publicada pero no es publicable: ${check.reasons.join('; ')}.`
      );
    }
    for (const slug of item.relatedTools) {
      if (!getTool(slug)) {
        throw new NewsError(
          `La noticia "${item.slug}" enlaza la herramienta inexistente "${slug}".`
        );
      }
    }
  }

  /*
   * Duplication is a property of the set, not of an item, so it cannot live in
   * `isPublishable`. It is checked here, where the whole published set is in
   * hand, and it fails the build for the same reason everything else here does:
   * publishing the same event twice is a correctness problem, not a tidiness one.
   */
  const duplicates = findDuplicateStories(published);
  if (duplicates.length) {
    const detail = duplicates.map((d) => `  · "${d.a}" y "${d.b}": ${d.reason}`).join('\n');
    throw new NewsError(`Hay noticias duplicadas entre las publicadas.\n${detail}`);
  }

  return published
    .map((item) => hydrateNews(item))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

const NEWS: readonly HydratedNewsItem[] = Object.freeze(load());
const BY_SLUG = new Map(NEWS.map((item) => [item.slug, item]));

export function getAllNews(): readonly HydratedNewsItem[] {
  return NEWS;
}

export function getNewsItem(slug: string): HydratedNewsItem | undefined {
  return BY_SLUG.get(slug);
}

export function getLatestNews(limit = 6): HydratedNewsItem[] {
  return NEWS.slice(0, limit);
}

export function getNewsByCategory(category: string): HydratedNewsItem[] {
  return NEWS.filter((item) => item.category === category);
}

export function getNewsForTool(slug: string): HydratedNewsItem[] {
  return NEWS.filter((item) => item.relatedTools.includes(slug));
}

/** The ones that change what a free-tier user can actually do. */
export function getFreePlanNews(): HydratedNewsItem[] {
  return NEWS.filter((item) => item.affectsFreePlan === 'yes');
}

export interface NewsStats {
  total: number;
  verified: number;
  partial: number;
  affectingFreePlan: number;
  categories: number;
  latestAt: string;
}

export function getNewsStats(): NewsStats {
  return {
    total: NEWS.length,
    verified: NEWS.filter((n) => n.verification === 'verified').length,
    partial: NEWS.filter((n) => n.verification === 'partial').length,
    affectingFreePlan: NEWS.filter((n) => n.affectsFreePlan === 'yes').length,
    categories: new Set(NEWS.map((n) => n.category)).size,
    latestAt: NEWS[0]?.publishedAt ?? '',
  };
}

/** Categories that actually have items, for the filter rail. */
export function getPopulatedNewsCategories(): Array<{ category: string; label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const item of NEWS) {
    counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([category, count]) => ({
      category,
      label: NEWS.find((n) => n.category === category)!.categoryLabel,
      count,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'es'));
}
