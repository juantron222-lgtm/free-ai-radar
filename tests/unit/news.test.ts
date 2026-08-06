import { describe, expect, it } from 'vitest';
import rawNews from '@/data/news/news.json';
import {
  NEWS_CATEGORY_LABEL,
  NewsItem,
  hydrateNews,
  isPublishable,
  isVendorSource,
} from '@lib/domain/news';
import { getAllNews, getFreePlanNews, getNewsForTool, getNewsStats } from '@lib/data/news';
import { getTool } from '@lib/data/catalog';

/**
 * This file is the newsroom's validator, not just its test suite — it is what
 * `npm run data:news:validate` runs. Keeping it here rather than in a separate
 * script means the rule that gates publication is the same code in both
 * places; a script that reimplemented `isPublishable` could drift away from
 * the one the build actually enforces.
 */

const items = NewsItem.array().parse(rawNews);
const published = items.filter((item) => item.status === 'published');

describe('vendor-source rule', () => {
  it('accepts a vendor host and its subdomains', () => {
    expect(
      isVendorSource({ url: 'https://www.anthropic.com/news/x', publisher: 'anthropic.com' })
    ).toBe(true);
    expect(
      isVendorSource({ url: 'https://docs.anthropic.com/en/x', publisher: 'anthropic.com' })
    ).toBe(true);
  });

  it('rejects a lookalike domain that merely ends with the vendor name', () => {
    expect(
      isVendorSource({ url: 'https://notanthropic.com/news', publisher: 'anthropic.com' })
    ).toBe(false);
    expect(
      isVendorSource({ url: 'https://anthropic.com.evil.example/x', publisher: 'anthropic.com' })
    ).toBe(false);
  });

  it('refuses a bare shared host: github.com identifies nobody', () => {
    expect(
      isVendorSource({ url: 'https://github.com/ollama/ollama/releases', publisher: 'github.com' })
    ).toBe(false);
  });

  it('accepts a shared host once the owning org is declared', () => {
    expect(
      isVendorSource({
        url: 'https://github.com/ollama/ollama/releases',
        publisher: 'github.com/ollama',
      })
    ).toBe(true);
  });

  it('rejects a different org on the same shared host', () => {
    expect(
      isVendorSource({
        url: 'https://github.com/impostor/ollama-fork/releases',
        publisher: 'github.com/ollama',
      })
    ).toBe(false);
  });

  it('rejects a malformed url instead of throwing', () => {
    expect(isVendorSource({ url: 'not a url', publisher: 'anthropic.com' })).toBe(false);
  });
});

describe('publishability', () => {
  const base = published[0];

  it('the dataset has at least one publishable item to test against', () => {
    expect(base).toBeDefined();
  });

  it('every published item passes the gate', () => {
    for (const item of published) {
      const check = isPublishable(item);
      expect(check.ok, `${item.slug}: ${check.reasons.join('; ')}`).toBe(true);
    }
  });

  it('blocks an item whose publication date precedes nothing we actually read', () => {
    const check = isPublishable({ ...base!, publishedAt: '2030-01-01', checkedAt: '2026-08-07' });
    expect(check.ok).toBe(false);
    expect(check.reasons.join(' ')).toContain('posterior a la de comprobación');
  });

  it('blocks an item whose only source is a bare shared host', () => {
    const check = isPublishable({
      ...base!,
      sources: [
        {
          url: 'https://github.com/cualquiera/rumor',
          label: 'Un repositorio cualquiera',
          kind: 'repo',
          publisher: 'github.com',
          checkedAt: '2026-08-07',
        },
      ],
    });
    expect(check.ok).toBe(false);
    expect(check.reasons.join(' ')).toContain('dominio del fabricante');
  });

  it('blocks an item that cites one party and links to another', () => {
    const check = isPublishable({
      ...base!,
      officialUrl: 'https://example.invalid/oferta',
      sources: [
        {
          url: 'https://www.anthropic.com/news/algo',
          label: 'Anuncio de Anthropic',
          kind: 'official',
          publisher: 'anthropic.com',
          checkedAt: '2026-08-07',
        },
      ],
    });
    expect(check.ok).toBe(false);
    expect(check.reasons.join(' ')).toContain('enlace oficial');
  });

  it('blocks a partial item that does not say what is unconfirmed', () => {
    const check = isPublishable({ ...base!, verification: 'partial', unconfirmed: [] });
    expect(check.ok).toBe(false);
  });

  it('blocks a pending item outright', () => {
    const check = isPublishable({ ...base!, verification: 'pending' });
    expect(check.ok).toBe(false);
  });
});

describe('dataset integrity', () => {
  it('slugs are unique', () => {
    const slugs = items.map((item) => item.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('ids are unique', () => {
    const ids = items.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every related tool exists in the catalogue', () => {
    for (const item of published) {
      for (const slug of item.relatedTools) {
        expect(getTool(slug), `${item.slug} → ${slug}`).toBeDefined();
      }
    }
  });

  it('every source url is well-formed and https', () => {
    for (const item of items) {
      for (const source of item.sources) {
        expect(() => new URL(source.url), `${item.slug}: ${source.url}`).not.toThrow();
        expect(new URL(source.url).protocol, `${item.slug}: ${source.url}`).toBe('https:');
      }
    }
  });

  it('the official url is among the sources, so the button never leads somewhere uncited', () => {
    for (const item of published) {
      const hosts = item.sources.map((source) => new URL(source.url).hostname);
      expect(hosts, `${item.slug}`).toContain(new URL(item.officialUrl).hostname);
    }
  });

  it('no item is checked in the future', () => {
    /*
     * One day of slack, deliberately. Editorial dates are calendar days in
     * Europe/Madrid; `toISOString` gives UTC. For a couple of hours every
     * night the two disagree by one day, and a suite that fails only after
     * midnight is worse than useless. A genuine future date is off by weeks,
     * not by one day, so this still catches what it is meant to catch.
     */
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    for (const item of published) {
      expect(item.checkedAt.localeCompare(tomorrow), `${item.slug}`).toBeLessThanOrEqual(0);
    }
  });

  it('every category used has a Spanish label', () => {
    for (const item of items) {
      expect(NEWS_CATEGORY_LABEL[item.category], item.category).toBeTruthy();
    }
  });

  it('impact is not a restatement of the summary', () => {
    for (const item of published) {
      expect(item.impact, item.slug).not.toBe(item.summary);
    }
  });

  it('a free-plan claim of "yes" carries a source, always', () => {
    for (const item of published.filter((i) => i.affectsFreePlan === 'yes')) {
      expect(item.sources.some(isVendorSource), item.slug).toBe(true);
    }
  });
});

describe('loader', () => {
  it('exposes only published items, newest first', () => {
    const all = getAllNews();
    expect(all.length).toBe(published.length);
    const dates = all.map((item) => item.publishedAt);
    expect([...dates].sort((a, b) => b.localeCompare(a))).toEqual(dates);
  });

  it('counts what it says it counts', () => {
    const stats = getNewsStats();
    expect(stats.total).toBe(getAllNews().length);
    expect(stats.affectingFreePlan).toBe(getFreePlanNews().length);
  });

  it('finds the news attached to a tool', () => {
    const withTool = getAllNews().find((item) => item.relatedTools.length > 0);
    expect(withTool).toBeDefined();
    const slug = withTool!.relatedTools[0]!;
    expect(getNewsForTool(slug).map((i) => i.slug)).toContain(withTool!.slug);
  });

  it('returns nothing for a tool with no news rather than throwing', () => {
    expect(getNewsForTool('herramienta-que-no-existe')).toEqual([]);
  });
});

describe('hydration', () => {
  it('marks an old item as no longer recent', () => {
    const item = hydrateNews(
      { ...published[0]!, publishedAt: '2020-01-01' },
      new Date('2026-08-07T00:00:00Z')
    );
    expect(item.isRecent).toBe(false);
    expect(item.ageDays).toBeGreaterThan(90);
  });

  it('keeps a fresh item recent', () => {
    const item = hydrateNews(
      { ...published[0]!, publishedAt: '2026-08-01' },
      new Date('2026-08-07T00:00:00Z')
    );
    expect(item.isRecent).toBe(true);
    expect(item.ageDays).toBe(6);
  });
});
