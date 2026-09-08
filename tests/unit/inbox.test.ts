import { describe, expect, it } from 'vitest';
import newsItems from '@/data/news/news.json';
import legacyCorpus from '../fixtures/legacy-feed-corpus.json';
import { normalizeStoryUrl } from '@lib/domain/news';
import {
  Inbox,
  InboxStatus,
  canonicalizeUrl,
  candidateId,
  detectNoise,
  detectVertical,
  findDuplicate,
  identifyPublisher,
  knownStories,
  mergeInbox,
  runRadar,
  serializeInbox,
  summarize,
  type InboxCandidateShape,
  type RadarRow,
} from '../../scripts/radar/inbox.mjs';

/**
 * The radar's tests.
 *
 * The point of this phase is a wall: discovery on one side, publication on the
 * other, with no path across that does not go through a human reading a vendor
 * page. Most of what follows tests the wall rather than the plumbing.
 */

const OBSERVED = '2026-08-11';

const SOURCES = [
  { id: 's-005', name: 'OpenAI Blog', enabled: true },
  { id: 's-008', name: 'Mistral AI News', enabled: true },
];

function row(overrides: Record<string, unknown> = {}) {
  return {
    sourceId: 's-005',
    title: 'Introducing GPT-5.6, our new flagship language model',
    url: 'https://openai.com/index/gpt-5-6',
    publishedAt: '2026-07-10',
    ...overrides,
  };
}

function radar(
  rows: Partial<RadarRow>[],
  existing: InboxCandidateShape[] = [],
  news: readonly unknown[] = newsItems
) {
  return runRadar({ rows, sources: SOURCES, newsItems: news, existing, observedAt: OBSERVED });
}

describe('the inbox cannot be a second newsroom', () => {
  it('has no publishable states', () => {
    expect(InboxStatus.options).not.toContain('verified');
    expect(InboxStatus.options).not.toContain('published');
  });

  it('offers exactly the four states of the discovery pipeline', () => {
    expect([...InboxStatus.options].sort()).toEqual([
      'candidate',
      'discovered',
      'duplicate',
      'rejected',
    ]);
  });

  it('a candidate carries no editorial body that could be served to a reader', () => {
    const { inbox } = radar([row()]);
    const candidate = inbox[0]!;
    for (const field of ['summary', 'impact', 'verification', 'sources', 'officialUrl']) {
      expect(candidate, field).not.toHaveProperty(field);
    }
  });

  it('the whole inbox validates against its schema', () => {
    const { inbox } = radar([row(), row({ title: 'How Acme is rewiring logistics with AI' })]);
    expect(Inbox.safeParse(inbox).success).toBe(true);
  });

  it('refuses a discarded candidate that does not say why', () => {
    const parsed = Inbox.safeParse([
      { ...radar([row()]).inbox[0]!, status: 'rejected', reason: null },
    ]);
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain('motivo');
  });

  it('refuses a candidate promoted to triage without a date', () => {
    const parsed = Inbox.safeParse([
      { ...radar([row()]).inbox[0]!, status: 'candidate', publishedAt: null },
    ]);
    expect(parsed.success).toBe(false);
  });
});

describe('canonical urls agree with the editorial dataset', () => {
  it('strips scheme, www, tracking parameters and trailing slash', () => {
    expect(canonicalizeUrl('https://www.mistral.ai/news/ocr-4/')).toBe('mistral.ai/news/ocr-4');
    expect(canonicalizeUrl('https://mistral.ai/news/ocr-4?utm_source=rss')).toBe(
      'mistral.ai/news/ocr-4'
    );
  });

  it('matches normalizeStoryUrl, so the inbox and the newsroom agree on identity', () => {
    /*
     * These are two implementations of one idea, in two languages, and if they
     * ever disagree the radar starts re-proposing stories the newsroom has
     * already published. This pins them together.
     */
    const corpus = [
      'https://www.anthropic.com/news/claude-opus-5',
      'https://mistral.ai/news/',
      'https://github.com/ollama/ollama/releases/tag/v0.32.6',
      'https://openai.com/index/gpt-5-6?utm_campaign=rss#top',
      'https://DOCS.anthropic.com/EN/Docs/',
    ];
    for (const url of corpus) {
      expect(canonicalizeUrl(url), url).toBe(normalizeStoryUrl(url));
    }
  });

  it('derives a stable id from the canonical url', () => {
    expect(candidateId(canonicalizeUrl('https://openai.com/index/x'))).toBe(
      candidateId(canonicalizeUrl('https://www.openai.com/index/x/'))
    );
  });
});

describe('identifying the vendor', () => {
  it('names a plain vendor host', () => {
    expect(identifyPublisher('https://openai.com/index/gpt-5-6')).toBe('openai.com');
    expect(identifyPublisher('https://docs.anthropic.com/en/x')).toBe('docs.anthropic.com');
  });

  it('requires the owning org on a shared host', () => {
    expect(identifyPublisher('https://github.com/ollama/ollama/releases')).toBe('github.com/ollama');
    expect(identifyPublisher('https://github.com')).toBeNull();
  });

  it('refuses an aggregator, which can locate a story but never source it', () => {
    expect(identifyPublisher('https://news.ycombinator.com/item?id=1')).toBeNull();
    expect(identifyPublisher('https://www.techcrunch.com/2026/07/10/x')).toBeNull();
  });

  it('refuses anything that is not https', () => {
    expect(identifyPublisher('http://openai.com/index/x')).toBeNull();
    expect(identifyPublisher('no es una url')).toBeNull();
  });
});

describe('rejections are never silent', () => {
  it('rejects a row whose feed is not declared in news-sources.json', () => {
    const { inbox } = radar([row({ sourceId: 's-999' })]);
    expect(inbox[0]!.status).toBe('rejected');
    expect(inbox[0]!.reason).toContain('fuente no declarada');
  });

  it('rejects a row with no identifiable vendor', () => {
    /*
     * A bare shared host. `github.com/alguien` is deliberately *not* rejected
     * here: it does name a party, and whether that party is the vendor the
     * story is about is a question for verification, which reads the page.
     * Discovery only asks whether anyone at all can be named.
     */
    const { inbox } = radar([row({ url: 'https://github.com' })]);
    expect(inbox[0]!.status).toBe('rejected');
    expect(inbox[0]!.reason).toContain('fabricante no identificable');
  });

  it('rejects a row the feed gave no date for', () => {
    const { inbox } = radar([row({ publishedAt: null })]);
    expect(inbox[0]!.status).toBe('rejected');
    expect(inbox[0]!.reason).toContain('sin fecha');
  });

  it('rejects a row with no headline', () => {
    const { inbox } = radar([row({ title: '' })]);
    expect(inbox[0]!.status).toBe('rejected');
  });

  it('every discarded row in a mixed run carries a reason', () => {
    const { inbox } = radar([
      row(),
      row({ url: 'https://github.com/x', title: 'Algo' }),
      row({ publishedAt: null, url: 'https://openai.com/index/sin-fecha' }),
      row({ title: 'How Deutsche Telekom is rewiring telecoms', url: 'https://openai.com/index/dt' }),
    ]);
    for (const candidate of inbox) {
      if (candidate.status === 'rejected' || candidate.status === 'duplicate') {
        expect(candidate.reason, candidate.id).toBeTruthy();
      }
    }
  });
});

describe('deduplication', () => {
  const known = knownStories(newsItems);

  it('the same url twice collapses to one row', () => {
    const { inbox } = radar([row(), row()]);
    expect(inbox).toHaveLength(1);
  });

  it('the same url in two spellings still collapses to one row', () => {
    const { inbox } = radar([row(), row({ url: 'https://www.openai.com/index/gpt-5-6/' })]);
    expect(inbox).toHaveLength(1);
  });

  it('a url already published is marked duplicate, not proposed again', () => {
    const { inbox } = radar([
      row({ sourceId: 's-008', url: 'https://mistral.ai/news/ocr-4/', title: 'Introducing Mistral OCR 4' }),
    ]);
    expect(inbox[0]!.status).toBe('duplicate');
    expect(inbox[0]!.reason).toContain('dataset editorial');
  });

  it('a url cited as a source of a published item counts as known', () => {
    const { inbox } = radar([
      row({ sourceId: 's-008', url: 'https://mistral.ai/news', title: 'Índice de noticias' }),
    ]);
    expect(inbox[0]!.status).toBe('duplicate');
  });

  it('two urls that are unmistakably the same announcement collapse', () => {
    const candidate = {
      id: 'inbox-000000000000',
      title: 'Anthropic lanza Claude Opus 5 al mismo precio que Opus 4.8',
      canonicalUrl: 'anthropic.com/news/claude-opus-5-mirror',
      publisher: 'anthropic.com',
      publishedAt: '2026-07-24',
    };
    expect(findDuplicate(candidate, known)).toContain('mismo anuncio');
  });

  it('two different stories about the same product are both kept', () => {
    /*
     * The failure mode worth guarding: "Claude Opus 5 launches" and "Claude
     * Opus 5 arrives on another platform" share a product and nothing else.
     * Collapsing them loses the second one silently.
     */
    const candidate = {
      id: 'inbox-000000000001',
      title: 'Claude Opus 5 llega a Amazon Bedrock y Vertex AI para clientes empresariales',
      canonicalUrl: 'anthropic.com/news/claude-opus-5-bedrock',
      publisher: 'anthropic.com',
      publishedAt: '2026-07-24',
    };
    expect(findDuplicate(candidate, known)).toBeNull();
  });

  it('does not collapse the same headline from two different vendors', () => {
    const headline = 'Introducing our new language model';
    const { inbox } = radar([
      row({ url: 'https://openai.com/index/modelo', title: headline }),
      row({ sourceId: 's-008', url: 'https://mistral.ai/news/modelo', title: headline }),
    ]);
    expect(inbox.filter((c) => c.status === 'candidate')).toHaveLength(2);
  });

  it('dedupes against items pulled for rewrite, not only against published ones', () => {
    const held = [
      {
        slug: 'noticia-retenida',
        title: 'Un anuncio retenido para reescritura',
        status: 'in_review',
        publishedAt: '2026-07-10',
        officialUrl: 'https://openai.com/index/retenida',
        sources: [{ url: 'https://openai.com/index/retenida' }],
      },
    ];
    const { inbox } = radar([row({ url: 'https://openai.com/index/retenida' })], [], held);
    expect(inbox[0]!.status).toBe('duplicate');
  });
});

describe('classification', () => {
  it('recognises the noise the vendor feeds actually carry', () => {
    expect(detectNoise('How Deutsche Telekom is rewiring telecommunications with AI')).toBe(
      'caso de cliente'
    );
    expect(detectNoise('GeForce NOW Turns Up the Heat With New RTX 5080 Server')).toBe(
      'hardware o gaming'
    );
    expect(detectNoise('SensorFM: Towards a general intelligence for wearable data')).toBe(
      'investigación sin producto'
    );
    expect(detectNoise('Our approach to government and national security partnerships')).toBeTruthy();
    expect(detectNoise('GPT-5.5 Bio Bug Bounty')).toBe('programa o concurso');
  });

  it('lets a real product announcement through', () => {
    expect(detectNoise('Introducing GPT-5.6, our new flagship model')).toBeNull();
    expect(detectNoise('Claude Sonnet 5 is now the default model for Free and Pro plans')).toBeNull();
  });

  it('does not mistake a technical capability for a business deal', () => {
    /*
     * A real rejection this filter got wrong once: the headline ends in
     * "multi-robot collaboration", which is a capability of the model being
     * announced, not a partnership.
     */
    expect(
      detectNoise(
        'Gemini Robotics ER 2: powering robotics with video understanding, task orchestration, and multi-robot collaboration'
      )
    ).toBeNull();
    expect(detectNoise('Announced in collaboration with Acme Corp')).toBe('alianza o inversión');
  });

  it('rejects headlines that open with "How", and this costs real news', () => {
    /*
     * Documented on purpose rather than hidden. The rule earns its place —
     * vendor feeds are full of "How <customer> did <thing>" — but it also
     * catches the occasional genuine product post. Nothing is deleted: the row
     * stays in the inbox with its reason, so triage can overturn it.
     */
    expect(detectNoise('How Zapier transformed core marketing processes with ChatGPT')).toBe(
      'caso de cliente'
    );
    expect(detectNoise('How GPT-5.6 fuses frontier intelligence with frontier efficiency')).toBe(
      'caso de cliente'
    );
  });

  it('places a headline in a vertical', () => {
    expect(detectVertical('Introducing our new text-to-video model')).toBe('video');
    expect(detectVertical('A new text-to-speech voice model')).toBe('audio');
    expect(detectVertical('Stable Diffusion 4 improves inpainting')).toBe('imagen');
    expect(detectVertical('Building agents with tool calling')).toBe('agentes');
    expect(detectVertical('Introducing GPT-5.6')).toBe('modelo-lenguaje');
    expect(detectVertical('Open-weights release on Hugging Face')).toBe('local-open-source');
  });

  it('says "sin-clasificar" instead of guessing', () => {
    expect(detectVertical('Data for Agents')).not.toBe('sin-clasificar');
    expect(detectVertical('Un titular sin ninguna señal reconocible')).toBe('sin-clasificar');
  });

  it('keeps an unclassifiable but otherwise clean row as discovered, not as a candidate', () => {
    const { inbox } = radar([
      row({ title: 'Un titular sin ninguna señal reconocible', url: 'https://openai.com/index/x' }),
    ]);
    expect(inbox[0]!.status).toBe('discovered');
    expect(inbox[0]!.vertical).toBe('sin-clasificar');
  });
});

describe('running twice changes nothing', () => {
  it('a second pass over the same feed adds nothing', () => {
    const first = radar([row(), row({ url: 'https://openai.com/index/otra', title: 'Introducing Sora 3, our video model' })]);
    const second = runRadar({
      rows: [row(), row({ url: 'https://openai.com/index/otra', title: 'Introducing Sora 3, our video model' })],
      sources: SOURCES,
      newsItems,
      existing: first.inbox,
      observedAt: OBSERVED,
    });

    expect(second.added).toHaveLength(0);
    expect(serializeInbox(second.inbox)).toBe(serializeInbox(first.inbox));
  });

  it('a later run does not rewrite when an existing row was first seen', () => {
    const first = radar([row()]);
    const later = runRadar({
      rows: [row()],
      sources: SOURCES,
      newsItems,
      existing: first.inbox,
      observedAt: '2026-09-30',
    });
    expect(later.inbox[0]!.observedAt).toBe(OBSERVED);
  });

  it('a later run does not undo a decision already recorded', () => {
    const triaged: InboxCandidateShape[] = [
      { ...radar([row()]).inbox[0]!, status: 'rejected', reason: 'descartada en triaje' },
    ];
    const again = runRadar({
      rows: [row()],
      sources: SOURCES,
      newsItems,
      existing: triaged,
      observedAt: '2026-09-30',
    });
    expect(again.inbox[0]!.status).toBe('rejected');
    expect(again.inbox[0]!.reason).toBe('descartada en triaje');
  });

  it('serialises identically regardless of the order rows arrived in', () => {
    const a = radar([row(), row({ url: 'https://openai.com/index/b', title: 'Introducing Sora 3 video' })]);
    const b = radar([row({ url: 'https://openai.com/index/b', title: 'Introducing Sora 3 video' }), row()]);
    expect(serializeInbox(a.inbox)).toBe(serializeInbox(b.inbox));
  });

  it('merging is idempotent', () => {
    const { inbox } = radar([row()]);
    expect(mergeInbox(inbox, inbox).inbox).toHaveLength(inbox.length);
  });
});

describe('the discovery window', () => {
  it('lets a recent row through', () => {
    const { inbox } = radar([row({ publishedAt: '2026-08-01' })]);
    expect(inbox).toHaveLength(1);
  });

  it('drops an archived row before it enters, rather than filing a verdict on it', () => {
    const result = radar([row({ publishedAt: '2024-01-15' })]);
    expect(result.inbox).toHaveLength(0);
    expect(result.outsideWindow).toBe(1);
  });

  it('still judges an undated row instead of ageing it out silently', () => {
    const result = radar([row({ publishedAt: null })]);
    expect(result.outsideWindow).toBe(0);
    expect(result.inbox[0]!.status).toBe('rejected');
    expect(result.inbox[0]!.reason).toContain('sin fecha');
  });

  it('honours a widened window', () => {
    const wide = runRadar({
      rows: [row({ publishedAt: '2024-01-15' })],
      sources: SOURCES,
      newsItems,
      existing: [],
      observedAt: OBSERVED,
      windowDays: 5000,
    });
    expect(wide.inbox).toHaveLength(1);
  });

  it('never evicts something already in the inbox just because it aged', () => {
    const first = radar([row({ publishedAt: '2026-08-01' })]);
    const later = runRadar({
      rows: [],
      sources: SOURCES,
      newsItems,
      existing: first.inbox,
      observedAt: '2027-06-01',
    });
    expect(later.inbox).toHaveLength(1);
  });
});

describe('the legacy corpus, run through the new filter', () => {
  /*
   * The 197 rows the old pipeline had accumulated. They are not migrated into
   * the inbox — they are the evaluation set the filter is measured against, and
   * the numbers below are the phase's actual result rather than a claim about it.
   */
  const legacySources = [...new Set(legacyCorpus.items.map((item) => item.source_name))].map(
    (name) => ({ id: name, name, enabled: true })
  );

  const rows = legacyCorpus.items.map((item) => ({
    sourceId: item.source_name,
    title: item.title,
    url: item.canonical_url,
    publishedAt: item.published_at ? item.published_at.slice(0, 10) : null,
  }));

  /*
   * A wide window on purpose. The corpus is a year of accumulated rows and the
   * point of running it is to measure the *filter* — how much of what a vendor
   * feed carries is publishable news. Leaving the 45-day window on would mostly
   * measure the calendar.
   */
  const WIDE = 5000;

  const result = runRadar({
    rows,
    sources: legacySources,
    newsItems,
    existing: [],
    observedAt: OBSERVED,
    windowDays: WIDE,
  });
  const stats = summarize(result.inbox);

  it('processes every row and files each one under a state', () => {
    const filed = Object.values(stats.byStatus).reduce((sum, n) => sum + n, 0);
    expect(filed).toBe(stats.total);
  });

  it('does not wave the whole corpus through as candidates', () => {
    const candidates = stats.byStatus.candidate ?? 0;
    expect(candidates).toBeLessThan(legacyCorpus.items.length / 2);
    expect(candidates).toBeGreaterThan(0);
  });

  it('rejects a substantial share as noise, which is what the corpus is', () => {
    expect(stats.byStatus.rejected ?? 0).toBeGreaterThan(20);
  });

  it('every discarded row explains itself', () => {
    for (const candidate of result.inbox) {
      if (candidate.status === 'rejected' || candidate.status === 'duplicate') {
        expect(candidate.reason, candidate.title).toBeTruthy();
      }
    }
  });

  it('finds more than one vertical without any quota being applied', () => {
    expect(Object.keys(stats.byVertical).length).toBeGreaterThan(2);
  });

  it('validates as an inbox', () => {
    expect(Inbox.safeParse(result.inbox).success).toBe(true);
  });

  it('is deterministic over the whole corpus', () => {
    const again = runRadar({
      rows,
      sources: legacySources,
      newsItems,
      existing: [],
      observedAt: OBSERVED,
      windowDays: WIDE,
    });
    expect(serializeInbox(again.inbox)).toBe(serializeInbox(result.inbox));
  });
});
