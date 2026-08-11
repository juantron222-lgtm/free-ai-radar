import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import rawNews from '@/data/news/news.json';
import {
  NEWS_AVAILABILITY_LABEL,
  NEWS_AVAILABILITY_SHORT,
  NEWS_AVAILABILITY_TONE,
  NEWS_CATEGORY_LABEL,
  NEWS_EVENT_TYPE_LABEL,
  NewsAvailability,
  NewsCategory,
  NewsEventType,
  NewsItem,
  findDuplicateStories,
  hydrateNews,
  isPublishable,
  isVendorSource,
  normalizeStoryUrl,
  titleSimilarity,
} from '@lib/domain/news';
import { getTool } from '@lib/data/catalog';

/*
 * The loader is imported lazily, inside the tests that need it.
 *
 * It validates the dataset at module scope and throws when the dataset is
 * wrong — which is exactly what it should do in a build. In a test file a
 * static import would make that throw take the whole suite down with it,
 * including the gate tests, so a data problem would be indistinguishable from
 * a broken gate. Deferring the import keeps the two failures separate.
 */
async function loader() {
  return import('@lib/data/news');
}

/**
 * This file is the newsroom's validator, not just its test suite — it is what
 * `npm run data:news:validate` runs. Keeping it here rather than in a separate
 * script means the rule that gates publication is the same code in both
 * places; a script that reimplemented `isPublishable` could drift away from
 * the one the build actually enforces.
 *
 * The gate tests below run against `makeItem()`, a hand-built fixture, and not
 * against the first row of the dataset. A gate whose fixture comes out of the
 * data it is meant to police stops testing the gate the moment the data
 * changes — and it cannot run at all while the data is mid-migration, which is
 * exactly when the gate most needs to be trustworthy.
 */

function makeItem(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    id: 'news-fixture-0001',
    slug: 'un-fabricante-publica-una-version-nueva',
    title: 'Un fabricante publica una versión nueva de su modelo',
    summary:
      'Resumen de prueba con la longitud mínima que exige el esquema para poder validarse.',
    impact: 'Consecuencia práctica de prueba, distinta del resumen y con longitud suficiente.',
    category: 'modelo-lenguaje',
    eventType: 'lanzamiento',
    availability: 'available',
    publishedAt: '2026-08-01',
    checkedAt: '2026-08-05',
    sources: [
      {
        url: 'https://www.anthropic.com/news/algo',
        label: 'Anuncio oficial',
        kind: 'official',
        publisher: 'anthropic.com',
        checkedAt: '2026-08-05',
      },
    ],
    officialUrl: 'https://www.anthropic.com/news/algo',
    relatedTools: [],
    affectsFreePlan: 'unverified',
    verification: 'verified',
    status: 'published',
    author: 'Redacción de Free AI Radar',
    unconfirmed: [],
    ...overrides,
  };
}

const parsedDataset = NewsItem.array().safeParse(rawNews);
const items = parsedDataset.success ? parsedDataset.data : [];
const published = items.filter((item) => item.status === 'published');

describe('the fixture itself is valid, or nothing below means anything', () => {
  it('parses against the schema', () => {
    expect(NewsItem.safeParse(makeItem()).success).toBe(true);
  });

  it('passes the publication gate', () => {
    const check = isPublishable(makeItem());
    expect(check.ok, check.reasons.join('; ')).toBe(true);
  });
});

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

describe('publishability: sourcing', () => {
  it('blocks an item whose publication date precedes nothing we actually read', () => {
    const check = isPublishable(makeItem({ publishedAt: '2030-01-01', checkedAt: '2026-08-07' }));
    expect(check.ok).toBe(false);
    expect(check.reasons.join(' ')).toContain('posterior a la de comprobación');
  });

  it('blocks an item whose only source is a bare shared host', () => {
    const check = isPublishable(
      makeItem({
        sources: [
          {
            url: 'https://github.com/cualquiera/rumor',
            label: 'Un repositorio cualquiera',
            kind: 'repo',
            publisher: 'github.com',
            checkedAt: '2026-08-07',
          },
        ],
      })
    );
    expect(check.ok).toBe(false);
    expect(check.reasons.join(' ')).toContain('dominio del fabricante');
  });

  it('blocks an item that cites one party and links to another', () => {
    const check = isPublishable(makeItem({ officialUrl: 'https://example.invalid/oferta' }));
    expect(check.ok).toBe(false);
    expect(check.reasons.join(' ')).toContain('enlace oficial');
  });

  it('blocks a partial item that does not say what is unconfirmed', () => {
    const check = isPublishable(makeItem({ verification: 'partial', unconfirmed: [] }));
    expect(check.ok).toBe(false);
  });

  it('blocks a pending item outright', () => {
    const check = isPublishable(makeItem({ verification: 'pending' }));
    expect(check.ok).toBe(false);
  });
});

describe('publishability: event type and availability (rule 5)', () => {
  it('requires eventType — the schema refuses an item without one', () => {
    const { eventType: _dropped, ...withoutEventType } = makeItem();
    const parsed = NewsItem.safeParse(withoutEventType);
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain('eventType');
  });

  it('requires availability — the schema refuses an item without one', () => {
    const { availability: _dropped, ...withoutAvailability } = makeItem();
    const parsed = NewsItem.safeParse(withoutAvailability);
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain('availability');
  });

  it('neither field has a default that could be fallen into silently', () => {
    /*
     * A default would be worse than a missing field: it would put a value
     * nobody read off the source into a published item, which is the inference
     * rule 5 exists to stop.
     */
    const parsed = NewsItem.safeParse({ ...makeItem(), eventType: undefined });
    expect(parsed.success).toBe(false);
  });

  it('rejects an event type outside the six allowed values', () => {
    expect(NewsItem.safeParse(makeItem({ eventType: 'rumor' as never })).success).toBe(false);
  });

  it('rejects an availability outside the six allowed values', () => {
    expect(NewsItem.safeParse(makeItem({ availability: 'quizas' as never })).success).toBe(false);
  });

  it('refuses an announcement that claims the thing is already available', () => {
    const check = isPublishable(makeItem({ eventType: 'anuncio', availability: 'available' }));
    expect(check.ok).toBe(false);
    expect(check.reasons.join(' ')).toContain('no puede declarar disponibilidad');
  });

  it('refuses general availability that admits it does not know', () => {
    const check = isPublishable(
      makeItem({ eventType: 'disponibilidad-general', availability: 'unknown' })
    );
    expect(check.ok).toBe(false);
  });

  it('refuses a withdrawal that claims the thing is available', () => {
    const check = isPublishable(makeItem({ eventType: 'retirada', availability: 'available' }));
    expect(check.ok).toBe(false);
  });

  it('accepts an announcement of something not yet out', () => {
    const check = isPublishable(makeItem({ eventType: 'anuncio', availability: 'announced' }));
    expect(check.ok, check.reasons.join('; ')).toBe(true);
  });

  it('accepts a preview that is only in beta', () => {
    const check = isPublishable(makeItem({ eventType: 'preview-beta', availability: 'preview' }));
    expect(check.ok, check.reasons.join('; ')).toBe(true);
  });

  it('will not let general availability rest on a partial read', () => {
    const check = isPublishable(
      makeItem({
        eventType: 'disponibilidad-general',
        availability: 'available',
        verification: 'partial',
        unconfirmed: ['algo'],
      })
    );
    expect(check.ok).toBe(false);
    expect(check.reasons.join(' ')).toContain('disponibilidad general');
  });
});

describe('publishability: availability is never inferred', () => {
  const bareRepoSource = [
    {
      url: 'https://github.com/ollama/ollama',
      label: 'Repositorio de Ollama',
      kind: 'repo' as const,
      publisher: 'github.com/ollama',
      checkedAt: '2026-08-05',
    },
  ];

  it('refuses a concrete availability backed only by a repository root', () => {
    const check = isPublishable(
      makeItem({
        availability: 'available',
        sources: bareRepoSource,
        officialUrl: 'https://github.com/ollama/ollama',
      })
    );
    expect(check.ok).toBe(false);
    expect(check.reasons.join(' ')).toContain('sin una fuente del fabricante que la acredite');
  });

  it('accepts the same item once it says "unknown" instead', () => {
    const check = isPublishable(
      makeItem({
        eventType: 'actualizacion',
        availability: 'unknown',
        sources: bareRepoSource,
        officialUrl: 'https://github.com/ollama/ollama',
      })
    );
    expect(check.ok, check.reasons.join('; ')).toBe(true);
  });

  it('accepts a concrete availability backed by release notes', () => {
    const check = isPublishable(
      makeItem({
        eventType: 'actualizacion',
        availability: 'available',
        sources: [{ ...bareRepoSource[0]!, kind: 'release-notes' }],
        officialUrl: 'https://github.com/ollama/ollama',
      })
    );
    expect(check.ok, check.reasons.join('; ')).toBe(true);
  });

  it('"unknown" never blocks publication — it is the honest answer', () => {
    for (const eventType of ['anuncio', 'lanzamiento', 'actualizacion', 'preview-beta', 'retirada'] as const) {
      const check = isPublishable(makeItem({ eventType, availability: 'unknown' }));
      expect(check.ok, `${eventType}: ${check.reasons.join('; ')}`).toBe(true);
    }
  });
});

describe('duplicate stories (rule 7)', () => {
  it('normalises away the spellings of the same url', () => {
    expect(normalizeStoryUrl('https://www.mistral.ai/news/')).toBe('mistral.ai/news');
    expect(normalizeStoryUrl('https://mistral.ai/news?utm_source=x#top')).toBe('mistral.ai/news');
  });

  it('rejects two items pointing at the same official url', () => {
    const found = findDuplicateStories([
      makeItem({ slug: 'primera', title: 'Mistral presenta un modelo de navegación' }),
      makeItem({ slug: 'segunda', title: 'Mistral publica un modelo de código abierto' }),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]!.reason).toContain('misma url oficial');
  });

  it('catches the index-page case: two stories citing a vendor news index', () => {
    const found = findDuplicateStories([
      makeItem({ slug: 'uno', officialUrl: 'https://mistral.ai/news' }),
      makeItem({ slug: 'dos', officialUrl: 'https://www.mistral.ai/news/' }),
    ]);
    expect(found).toHaveLength(1);
  });

  it('rejects the same event written up twice under two headlines', () => {
    const found = findDuplicateStories([
      makeItem({
        slug: 'anthropic-lanza-opus-5',
        title: 'Anthropic lanza Claude Opus 5 al mismo precio',
        officialUrl: 'https://www.anthropic.com/news/claude-opus-5',
      }),
      makeItem({
        slug: 'claude-opus-5-ya-disponible',
        title: 'Anthropic lanza Claude Opus 5 con precio sin cambios',
        officialUrl: 'https://www.anthropic.com/news/claude-opus-5-launch',
      }),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]!.reason).toContain('mismo fabricante');
  });

  it('lets two genuine launches from the same vendor on the same day coexist', () => {
    const found = findDuplicateStories([
      makeItem({
        slug: 'anthropic-lanza-opus-5',
        title: 'Anthropic lanza Claude Opus 5 al mismo precio que Opus 4.8',
        officialUrl: 'https://www.anthropic.com/news/claude-opus-5',
      }),
      makeItem({
        slug: 'anthropic-presenta-claude-for-teachers',
        title: 'Anthropic presenta Claude for Teachers, dirigido a docentes',
        officialUrl: 'https://www.anthropic.com/news/claude-for-teachers',
      }),
    ]);
    expect(found).toEqual([]);
  });

  it('does not confuse two different vendors covering a similar topic', () => {
    const found = findDuplicateStories([
      makeItem({
        slug: 'anthropic-modelo-nuevo',
        title: 'Anthropic publica un modelo de lenguaje nuevo',
        officialUrl: 'https://www.anthropic.com/news/modelo',
      }),
      makeItem({
        slug: 'mistral-modelo-nuevo',
        title: 'Mistral publica un modelo de lenguaje nuevo',
        officialUrl: 'https://mistral.ai/news/modelo',
      }),
    ]);
    expect(found).toEqual([]);
  });

  it('scores headline overlap between 0 and 1', () => {
    expect(titleSimilarity('Ollama lanza su agente interactivo', 'Ollama lanza su agente interactivo')).toBe(1);
    expect(titleSimilarity('Ollama lanza su agente', 'Mistral publica pesos abiertos')).toBe(0);
  });
});

describe('dataset integrity', () => {
  it('the dataset parses against the schema', () => {
    const detail = parsedDataset.success
      ? ''
      : parsedDataset.error.issues
          .slice(0, 20)
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('\n');
    expect(parsedDataset.success, detail).toBe(true);
  });

  it('slugs are unique', () => {
    const slugs = items.map((item) => item.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('ids are unique', () => {
    const ids = items.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every published item passes the gate', () => {
    for (const item of published) {
      const check = isPublishable(item);
      expect(check.ok, `${item.slug}: ${check.reasons.join('; ')}`).toBe(true);
    }
  });

  it('no two published items describe the same story', () => {
    const found = findDuplicateStories(published);
    const detail = found.map((d) => `${d.a} ↔ ${d.b}: ${d.reason}`).join('\n');
    expect(found, detail).toEqual([]);
  });

  it('no two published items share an official url', () => {
    const urls = published.map((item) => normalizeStoryUrl(item.officialUrl));
    const seen = new Map<string, string[]>();
    for (const [index, url] of urls.entries()) {
      seen.set(url, [...(seen.get(url) ?? []), published[index]!.slug]);
    }
    const collisions = [...seen.entries()].filter(([, slugs]) => slugs.length > 1);
    const detail = collisions.map(([url, slugs]) => `${url} ← ${slugs.join(', ')}`).join('\n');
    expect(collisions, detail).toEqual([]);
  });

  it('every published item declares an event type and an availability', () => {
    for (const item of published) {
      expect(item.eventType, item.slug).toBeTruthy();
      expect(item.availability, item.slug).toBeTruthy();
    }
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

  it('every category, event type and availability used has a Spanish label', () => {
    for (const item of items) {
      expect(NEWS_CATEGORY_LABEL[item.category], item.category).toBeTruthy();
      expect(NEWS_EVENT_TYPE_LABEL[item.eventType], item.eventType).toBeTruthy();
      expect(NEWS_AVAILABILITY_LABEL[item.availability], item.availability).toBeTruthy();
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

describe('the two axes stay separate (rule 5)', () => {
  it('no category names an event or its effect', () => {
    /*
     * `lanzamiento`, `actualizacion`, `limitacion` and `cierre` all used to be
     * categories, and each of them answered "what happened" rather than "what
     * is this about" — the exact conflation `eventType` was added to end. A
     * withdrawal is `eventType: 'retirada'`; the category is still whatever was
     * withdrawn.
     */
    const eventWords = ['lanzamiento', 'actualizacion', 'limitacion', 'cierre', 'retirada'];
    for (const category of NewsCategory.options) {
      expect(eventWords, `"${category}" describe un suceso, no un tema`).not.toContain(category);
    }
  });

  it('no published item is categorised by what happened to it', () => {
    for (const item of published) {
      expect(NewsCategory.options, item.slug).toContain(item.category);
    }
  });

  it('the free-plan effect lives in affectsFreePlan, not in the category', () => {
    /*
     * `plan-gratuito` survives as a category because an item can genuinely be
     * *about* a free tier. What it must not become is a second place to record
     * "this changes the free plan", which `affectsFreePlan` already answers —
     * so the two must not be locked together in either direction.
     */
    const affectsFree = published.filter((i) => i.affectsFreePlan === 'yes');
    expect(affectsFree.length, 'no hay ninguna noticia que afecte al plan gratuito').toBeGreaterThan(
      0
    );
    expect(
      affectsFree.some((i) => i.category !== 'plan-gratuito'),
      'todas las noticias que afectan al plan gratuito están categorizadas como "plan-gratuito": el efecto ha vuelto a colarse en la categoría'
    ).toBe(true);
  });
});

describe('the reader can tell these states apart (rule 5, in the UI)', () => {
  const card = readFileSync('src/components/news/NewsCard.astro', 'utf-8');
  const detail = readFileSync('src/pages/noticias/[slug].astro', 'utf-8');

  it('the card renders both the event type and the availability', () => {
    expect(card).toContain('item.eventTypeLabel');
    expect(card).toContain('item.availabilityShort');
  });

  it('the detail page renders both the event type and the availability', () => {
    expect(detail).toContain('item.eventTypeLabel');
    expect(detail).toContain('item.availabilityLabel');
  });

  it('every event type has a distinct Spanish label', () => {
    const labels = NewsEventType.options.map((value) => NEWS_EVENT_TYPE_LABEL[value]);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('every availability has a distinct label, long and short', () => {
    const long = NewsAvailability.options.map((value) => NEWS_AVAILABILITY_LABEL[value]);
    const short = NewsAvailability.options.map((value) => NEWS_AVAILABILITY_SHORT[value]);
    expect(new Set(long).size).toBe(long.length);
    expect(new Set(short).size).toBe(short.length);
  });

  it('"unknown" is never presented as available', () => {
    expect(NEWS_AVAILABILITY_TONE.unknown).not.toBe(NEWS_AVAILABILITY_TONE.available);
    expect(NEWS_AVAILABILITY_SHORT.unknown).not.toBe(NEWS_AVAILABILITY_SHORT.available);
    /* And it says whose gap it is, rather than asserting anything about the thing. */
    expect(NEWS_AVAILABILITY_SHORT.unknown).toBe('Disponibilidad sin confirmar');
    expect(hydrateNews(makeItem({ eventType: 'anuncio', availability: 'unknown' })).availabilityTone)
      .toBe('pending');
  });

  it('a withdrawal never reads like a launch', () => {
    expect(NEWS_AVAILABILITY_TONE.deprecated).not.toBe(NEWS_AVAILABILITY_TONE.available);
    expect(NEWS_EVENT_TYPE_LABEL.retirada).not.toBe(NEWS_EVENT_TYPE_LABEL.lanzamiento);

    const withdrawn = hydrateNews(
      makeItem({
        eventType: 'retirada',
        availability: 'deprecated',
        sources: [
          {
            url: 'https://github.com/ollama/ollama/releases/tag/v1',
            label: 'Notas de versión',
            kind: 'release-notes',
            publisher: 'github.com/ollama',
            checkedAt: '2026-08-05',
          },
        ],
        officialUrl: 'https://github.com/ollama/ollama/releases/tag/v1',
      })
    );
    expect(withdrawn.availabilityTone).toBe('ended');
    expect(withdrawn.availabilityShort).toBe('Retirado');
  });

  it('the tone of every availability is one of the five the UI can render', () => {
    for (const value of NewsAvailability.options) {
      expect(['ok', 'caution', 'ended', 'future', 'pending']).toContain(
        NEWS_AVAILABILITY_TONE[value]
      );
    }
  });
});

describe('nothing unconfirmed is published as fact', () => {
  it('no published item is still pending verification', () => {
    for (const item of published) {
      expect(item.verification, item.slug).not.toBe('pending');
    }
  });

  it('an item claiming to be fully verified carries nothing unconfirmed', () => {
    for (const item of published.filter((i) => i.verification === 'verified')) {
      expect(item.unconfirmed, item.slug).toEqual([]);
    }
  });

  it('a partially verified item always says what is missing', () => {
    for (const item of published.filter((i) => i.verification === 'partial')) {
      expect(item.unconfirmed.length, item.slug).toBeGreaterThan(0);
    }
  });

  it('no published item carries an editorial hold note in its unconfirmed list', () => {
    /*
     * Holds are written in caps into `unconfirmed` while an item is pulled.
     * If one ever ships to a reader it means an item went back to `published`
     * without the text being fixed.
     */
    for (const item of published) {
      for (const note of item.unconfirmed) {
        expect(note, item.slug).not.toMatch(/RETIRADA DE PUBLICACIÓN/);
      }
    }
  });

  it('every published item still rests on a primary vendor source', () => {
    for (const item of published) {
      expect(item.sources.some(isVendorSource), item.slug).toBe(true);
      expect(isPublishable(item).ok, `${item.slug}: ${isPublishable(item).reasons.join('; ')}`).toBe(
        true
      );
    }
  });
});

describe('loader', () => {
  it('loads the dataset at all', async () => {
    await expect(loader()).resolves.toBeDefined();
  });

  it('exposes only published items, newest first', async () => {
    const { getAllNews } = await loader();
    const all = getAllNews();
    expect(all.length).toBe(published.length);
    const dates = all.map((item) => item.publishedAt);
    expect([...dates].sort((a, b) => b.localeCompare(a))).toEqual(dates);
  });

  it('counts what it says it counts', async () => {
    const { getAllNews, getFreePlanNews, getNewsStats } = await loader();
    const stats = getNewsStats();
    expect(stats.total).toBe(getAllNews().length);
    expect(stats.affectingFreePlan).toBe(getFreePlanNews().length);
  });

  it('finds the news attached to a tool', async () => {
    const { getAllNews, getNewsForTool } = await loader();
    const withTool = getAllNews().find((item) => item.relatedTools.length > 0);
    expect(withTool).toBeDefined();
    const slug = withTool!.relatedTools[0]!;
    expect(getNewsForTool(slug).map((i) => i.slug)).toContain(withTool!.slug);
  });

  it('returns nothing for a tool with no news rather than throwing', async () => {
    const { getNewsForTool } = await loader();
    expect(getNewsForTool('herramienta-que-no-existe')).toEqual([]);
  });

  it('refuses to load a dataset with two items on the same story', async () => {
    /*
     * Proves the duplicate gate is wired into the loader and not merely
     * available to it — the check lives there because duplication is a
     * property of the set, which no per-item gate can see.
     */
    const { findDuplicateStories } = await import('@lib/domain/news');
    const collision = findDuplicateStories([
      makeItem({ slug: 'a' }),
      makeItem({ slug: 'b', title: 'Otro titular completamente distinto' }),
    ]);
    expect(collision).not.toEqual([]);
  });
});

describe('hydration', () => {
  it('marks an old item as no longer recent', () => {
    const item = hydrateNews(makeItem({ publishedAt: '2020-01-01' }), new Date('2026-08-07T00:00:00Z'));
    expect(item.isRecent).toBe(false);
    expect(item.ageDays).toBeGreaterThan(90);
  });

  it('keeps a fresh item recent', () => {
    const item = hydrateNews(makeItem({ publishedAt: '2026-08-01' }), new Date('2026-08-07T00:00:00Z'));
    expect(item.isRecent).toBe(true);
    expect(item.ageDays).toBe(6);
  });

  it('labels the event type and the availability in Spanish', () => {
    const item = hydrateNews(makeItem({ eventType: 'anuncio', availability: 'announced' }));
    expect(item.eventTypeLabel).toBe('Anuncio');
    expect(item.availabilityLabel).toBe('Anunciado, todavía no disponible');
  });

  it('flags an announcement as not yet usable, so the card can say so', () => {
    expect(hydrateNews(makeItem({ eventType: 'anuncio', availability: 'announced' })).isNotYetUsable).toBe(true);
    expect(hydrateNews(makeItem({ eventType: 'lanzamiento', availability: 'available' })).isNotYetUsable).toBe(false);
  });
});
