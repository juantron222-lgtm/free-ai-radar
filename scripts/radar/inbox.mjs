import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * The radar's inbox: discovery, and nothing else.
 *
 * This module is deliberately pure — no network, no filesystem, no clock. It
 * takes raw feed rows plus what the newsroom already knows, and returns an
 * inbox. `scripts/news-radar.mjs` is the only part that touches the world.
 *
 * The separation is the point of the phase. The old pipeline fetched RSS and
 * wrote a file that looked like news; anything that looks like news is one
 * careless import away from being served as news. An inbox candidate is
 * structurally incapable of being published: it has no summary, no impact, no
 * verification and no sources — only a pointer to something a human should go
 * and read.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const IsoDate = z.string().regex(ISO_DATE, 'fecha ISO AAAA-MM-DD');

/**
 * Where a candidate is in the discovery pipeline.
 *
 * `verified` and `published` are absent on purpose and must stay absent: they
 * are editorial states, they live in `src/data/news/news.json`, and putting
 * them here would make the inbox a second place from which something could
 * reach a reader.
 */
export const InboxStatus = z.enum(['discovered', 'duplicate', 'rejected', 'candidate']);

export const InboxVertical = z.enum([
  'modelo-lenguaje',
  'agentes',
  'imagen',
  'video',
  'audio',
  'multimodal',
  'local-open-source',
  'herramientas',
  'sin-clasificar',
]);

export const InboxCandidate = z
  .object({
    /** Derived from the canonical url, so re-running finds the same row. */
    id: z.string().regex(/^inbox-[0-9a-f]{12}$/),
    /** The vendor's own headline, untranslated and unedited. */
    title: z.string().min(1),
    url: z.string().url(),
    /** Comparison key: host + path, no scheme, no query, no trailing slash. */
    canonicalUrl: z.string().min(1),
    /** `host` or `host/org` — who controls the page. */
    publisher: z.string().min(1),
    observedAt: IsoDate,
    /** Null when the feed did not carry one. Never inferred. */
    publishedAt: IsoDate.nullable(),
    /** Which configured source produced it. */
    discoveredVia: z.string().min(1),
    vertical: InboxVertical,
    status: InboxStatus,
    /** Why it was set aside. Required whenever it was. */
    reason: z.string().nullable(),
  })
  .superRefine((candidate, ctx) => {
    if ((candidate.status === 'rejected' || candidate.status === 'duplicate') && !candidate.reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: `un candidato en estado "${candidate.status}" debe declarar el motivo`,
      });
    }
    if (candidate.status === 'candidate' && !candidate.publishedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['publishedAt'],
        message: 'un candidato sin fecha no puede pasar a triaje',
      });
    }
  });

export const Inbox = z.array(InboxCandidate);

/* ------------------------------------------------------------------ urls -- */

/** Hosts where the hostname alone identifies nobody. */
const SHARED_HOSTS = ['github.com', 'gitlab.com', 'huggingface.co', 'medium.com', 'substack.com'];

/**
 * Hosts that can locate a story but can never be its source.
 *
 * Editorial rule 2: press, aggregators and social posts are for discovery. A
 * candidate whose own url is one of these has nothing behind it to verify, so
 * it never reaches triage.
 */
const AGGREGATOR_HOSTS = [
  'news.ycombinator.com',
  'reddit.com',
  'twitter.com',
  'x.com',
  'techcrunch.com',
  'theverge.com',
  'venturebeat.com',
  'arstechnica.com',
  'wired.com',
  'medium.com',
  'substack.com',
  'linkedin.com',
  'youtube.com',
];

const TRACKING_PARAMS = /^(utm_|ref$|source$|fbclid$|gclid$|mc_cid$|mc_eid$)/;

/**
 * Comparison key for a url.
 *
 * Must agree with `normalizeStoryUrl` in `src/lib/domain/news.ts` — that one
 * decides whether two *published* items collide, this one decides whether a
 * candidate collides with them, and if the two drift the inbox starts
 * re-proposing stories the newsroom already ran. A test pins them together.
 */
export function canonicalizeUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl).trim());
  } catch {
    return String(rawUrl).trim().toLowerCase();
  }

  for (const key of [...parsed.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) parsed.searchParams.delete(key);
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const path = parsed.pathname.toLowerCase().replace(/\/+$/, '');
  const query = parsed.searchParams.toString();
  return query ? `${host}${path}?${query}` : `${host}${path}`;
}

/**
 * Who controls a url, as `host` or `host/org`.
 *
 * Returns null when nobody can be named: a bare shared host, an aggregator, or
 * anything that is not https. Rule 4 wants an identifiable vendor, and "we
 * could not tell" has to be representable so it can be rejected out loud.
 */
export function identifyPublisher(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl).trim());
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:') return null;

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const registrable = host.split('.').slice(-2).join('.');

  if (AGGREGATOR_HOSTS.includes(host) || AGGREGATOR_HOSTS.includes(registrable)) return null;

  if (SHARED_HOSTS.includes(registrable)) {
    const org = parsed.pathname.split('/').filter(Boolean)[0];
    return org ? `${registrable}/${org.toLowerCase()}` : null;
  }

  return host;
}

export function candidateId(canonicalUrl) {
  return `inbox-${createHash('sha256').update(canonicalUrl).digest('hex').slice(0, 12)}`;
}

/* -------------------------------------------------------------- classify -- */

/**
 * Headlines that are not product news, with the reason each one is set aside.
 *
 * Every entry here was written against a real row of the legacy corpus rather
 * than imagined: customer stories, GPU marketing, research write-ups, policy
 * essays and programme announcements are what the vendor feeds actually carry
 * between the releases. Editorial rule 6 is a promise not to fill the section
 * with these; this list is the promise made checkable.
 */
/**
 * Ordered from most specific to broadest, and the first match wins.
 *
 * The order is what decides the *reason*, not whether something is noise, and
 * the reason is the audit trail: "Our approach to government and national
 * security partnerships" contains the word "partnerships", but filing it as an
 * alliance instead of as corporate positioning would make the log lie about
 * what the filter is doing. The broad patterns go last so a precise reason
 * always wins over a merely correct one.
 */
export const NOISE_PATTERNS = [
  /*
   * A headline that opens with "How" is explaining something — a deployment, an
   * architecture, an adoption curve. Product news is announced, not explained,
   * so the opening word is a cheap and reliable signal.
   */
  { reason: 'caso de cliente', test: /^how\b/i },
  { reason: 'caso de cliente', test: /\b(case study|customer story|success story)\b/i },
  { reason: 'caso de cliente', test: /\b(aims to become|moves faster with|adopts?|rolls out .{0,20}with)\b/i },
  { reason: 'posicionamiento corporativo', test: /\b(our approach to|our position on|we believe|governance|national security|policy framework)\b/i },
  { reason: 'posicionamiento corporativo', test: /\b(our (company|mission|values|data strategy)|company transformation|for america)\b/i },
  { reason: 'programa o concurso', test: /\b(bug bounty|hackathon|grants?|fellowship|challenge|competition|contest)\b/i },
  { reason: 'contratación', test: /\b(hiring|careers|join our team|join us)\b/i },
  { reason: 'evento o resumen', test: /\b(recap|keynote|summit|webinar|conference|neurips|cvpr|iclr|siggraph)\b/i },
  { reason: 'hardware o gaming', test: /\b(geforce|rtx\s*\d|dlss|game ready|gaming|workstation|omniverse)\b/i },
  { reason: 'métrica o benchmark sin producto', test: /\b(benchmark-leading|achieves .{0,30}performance|tops the|state of the art results)\b/i },
  { reason: 'investigación sin producto', test: /\b(towards|toward)\b/i },
  { reason: 'investigación sin producto', test: /\bpart\s*\d+\b/i },
  { reason: 'investigación sin producto', test: /\b(a study of|we investigate|paper)\b/i },
  { reason: 'alianza o inversión', test: /\b(funding|raises|series [a-e]\b|investment round|valuation)\b/i },
  /*
   * "collaboration" needs the business sense spelled out. On its own it also
   * matches the technical one — "multi-robot collaboration" is a capability,
   * not a deal — and rejecting a model launch for it would be the filter
   * failing at the only job it has.
   */
  { reason: 'alianza o inversión', test: /\b(partners?|partnerships?|collaborat\w+ with|in collaboration with|acquires?|acquisitions?)\b/i },
];

/**
 * Vertical keywords, most specific first.
 *
 * Order matters and is not alphabetical: a headline about an image model that
 * also says "open source" belongs under image, because that is what a reader
 * filtering for image news wants to find. The first match wins and the rest
 * are not consulted.
 *
 * Plurals are spelled out (`agents?`, `videos?`) rather than left to `\b`. A
 * trailing word boundary puts the break *before* the "s", so `\bagent\b` misses
 * "Agents" — which is how a headline like "Data for Agents" ends up filed as
 * unclassifiable.
 */
export const VERTICAL_PATTERNS = [
  { vertical: 'video', test: /\b(videos?|text-to-video|sora|veo\s*\d|runway|animation|frame interpolation)\b/i },
  { vertical: 'audio', test: /\b(audio|speech|voices?|music|text-to-speech|tts|asr|whisper|transcriptions?)\b/i },
  { vertical: 'imagen', test: /\b(image generation|text-to-image|diffusion|imagen|dall-?e|flux|stable diffusion|inpainting|upscal\w+)\b/i },
  { vertical: 'agentes', test: /\b(agents?|agentic|tool use|tool calling|mcp|model context protocol|computer use)\b/i },
  { vertical: 'multimodal', test: /\b(multimodal|vision|ocr|document intelligence|image understanding)\b/i },
  { vertical: 'local-open-source', test: /\b(open[- ]sourc\w+|open[- ]weights?|gguf|quantiz\w+|ollama|llama\.cpp|self-host\w*)\b/i },
  { vertical: 'modelo-lenguaje', test: /\b(gpt-?\d|claude|gemini|llama\s*\d|mistral|qwen|deepseek|language models?|llms?|reasoning models?)\b/i },
  { vertical: 'herramientas', test: /\b(sdks?|cli|apis?|changelogs?|release notes|v?\d+\.\d+(\.\d+)?|developers?|extensions?|plugins?)\b/i },
];

/** First noise pattern a headline trips, or null. */
export function detectNoise(title) {
  const text = String(title ?? '');
  for (const { reason, test } of NOISE_PATTERNS) {
    if (test.test(text)) return reason;
  }
  return null;
}

/** Best-guess vertical from the headline, or `sin-clasificar`. */
export function detectVertical(title) {
  const text = String(title ?? '');
  for (const { vertical, test } of VERTICAL_PATTERNS) {
    if (test.test(text)) return vertical;
  }
  return 'sin-clasificar';
}

/* ---------------------------------------------------------------- dedupe -- */

function titleTokens(title) {
  const normalized = String(title ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ');
  return new Set(normalized.split(/\s+/).filter((word) => word.length > 3));
}

export function titleSimilarity(a, b) {
  const left = titleTokens(a);
  const right = titleTokens(b);
  if (left.size === 0 || right.size === 0) return 0;

  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/**
 * How alike two headlines must be before we call them one story.
 *
 * High on purpose. Two announcements about the same product are the normal
 * case, not the duplicate case — "Introducing Claude Opus 5" and "Claude Opus 5
 * comes to Bedrock" are two stories, and collapsing them would silently lose
 * the second. Below this threshold we keep both and let triage decide, which is
 * the recoverable mistake; merging is not.
 */
const SAME_STORY_SIMILARITY = 0.85;

/**
 * Everything the newsroom already knows about, as comparison keys.
 *
 * Both `published` and `in_review` items count: an item pulled for a rewrite is
 * still a story we have, and re-proposing it as fresh discovery would be how it
 * quietly gets published twice.
 */
export function knownStories(newsItems) {
  const urls = new Set();
  const stories = [];

  for (const item of newsItems) {
    if (item.status !== 'published' && item.status !== 'in_review') continue;

    urls.add(canonicalizeUrl(item.officialUrl));
    for (const source of item.sources ?? []) urls.add(canonicalizeUrl(source.url));

    stories.push({
      title: item.title,
      publisher: identifyPublisher(item.officialUrl),
      publishedAt: item.publishedAt,
      slug: item.slug,
    });
  }

  return { urls, stories };
}

/**
 * Whether a candidate is something already known.
 *
 * Three ways in, in order of confidence: the same url, the same url as one of
 * an item's cited sources, or — only when publisher, date and headline all
 * line up — the same event reached by a different link.
 */
export function findDuplicate(candidate, known, otherCandidates = []) {
  if (known.urls.has(candidate.canonicalUrl)) {
    return `ya está en el dataset editorial (${candidate.canonicalUrl})`;
  }

  for (const other of otherCandidates) {
    if (other.id !== candidate.id && other.canonicalUrl === candidate.canonicalUrl) {
      return `url repetida dentro del propio inbox (${other.id})`;
    }
  }

  for (const story of known.stories) {
    if (!story.publisher || story.publisher !== candidate.publisher) continue;
    if (!candidate.publishedAt || story.publishedAt !== candidate.publishedAt) continue;
    if (titleSimilarity(story.title, candidate.title) >= SAME_STORY_SIMILARITY) {
      return `mismo anuncio que la noticia "${story.slug}"`;
    }
  }

  return null;
}

/* -------------------------------------------------------------- pipeline -- */

/**
 * Turn one raw feed row into a classified candidate.
 *
 * Rejection is never silent: every path that stops a row records why, so the
 * inbox doubles as the log of what the filter is doing.
 */
export function classifyRow(row, { source, observedAt, known, sofar }) {
  const url = String(row.url ?? '').trim();
  const canonicalUrl = canonicalizeUrl(url);
  const publisher = identifyPublisher(url);
  const title = String(row.title ?? '').trim();

  const base = {
    id: candidateId(canonicalUrl),
    title: title || '(sin título)',
    url,
    canonicalUrl,
    publisher: publisher ?? 'desconocido',
    observedAt,
    publishedAt: row.publishedAt ?? null,
    discoveredVia: source.id,
    vertical: detectVertical(title),
    status: 'discovered',
    reason: null,
  };

  if (!title) return { ...base, status: 'rejected', reason: 'el feed no trae titular' };

  if (!url.startsWith('https://')) {
    return { ...base, status: 'rejected', reason: 'la url no es https' };
  }

  if (!publisher) {
    return {
      ...base,
      status: 'rejected',
      reason: 'fabricante no identificable: host compartido sin organización, o agregador',
    };
  }

  const duplicate = findDuplicate(base, known, sofar);
  if (duplicate) return { ...base, status: 'duplicate', reason: duplicate };

  const noise = detectNoise(title);
  if (noise) return { ...base, status: 'rejected', reason: noise };

  if (!base.publishedAt) {
    return { ...base, status: 'rejected', reason: 'sin fecha de publicación en el feed' };
  }

  /*
   * Clean, dated, attributable — but we could not tell what it is about.
   * `discovered` rather than `candidate`: worth a human glance, not worth
   * putting in front of triage as if we knew.
   */
  if (base.vertical === 'sin-clasificar') return base;

  return { ...base, status: 'candidate' };
}

/** Deterministic order: newest first, undated last, ties broken by id. */
function sortInbox(candidates) {
  return [...candidates].sort((a, b) => {
    if (a.publishedAt !== b.publishedAt) {
      if (!a.publishedAt) return 1;
      if (!b.publishedAt) return -1;
      return b.publishedAt.localeCompare(a.publishedAt);
    }
    return a.id.localeCompare(b.id);
  });
}

/**
 * Merge a run into the existing inbox.
 *
 * A row already in the inbox is left exactly as it was — including its status,
 * its reason and the date it was first seen. Re-running the radar must be a
 * no-op for anything it has already judged, otherwise a later triage decision
 * would be silently undone by the next scheduled run, and the file would churn
 * in git for no reason.
 */
export function mergeInbox(existing, incoming) {
  const byId = new Map(existing.map((candidate) => [candidate.id, candidate]));
  const added = [];

  for (const candidate of incoming) {
    if (byId.has(candidate.id)) continue;
    byId.set(candidate.id, candidate);
    added.push(candidate);
  }

  return { inbox: sortInbox([...byId.values()]), added };
}

/**
 * The whole discovery pass, as a pure function.
 *
 * `rows` come from the feeds, `newsItems` is the editorial dataset, `existing`
 * is the inbox as it stands. Nothing here reads a file or a clock.
 */
/**
 * How far back a discovery pass looks, in days.
 *
 * Feeds serve archives, not deltas: a first run against the live sources
 * returns thousands of rows going back years, and an inbox holding every
 * announcement a vendor ever made is not a queue, it is a museum. The window
 * bounds discovery to what is still actionable.
 *
 * Rows outside it are dropped before they enter rather than filed as
 * `rejected`. They are not judgements about the story — the filter never looked
 * at them — and recording thousands of non-judgements would bury the ones that
 * are.
 */
export const DEFAULT_WINDOW_DAYS = 45;

function withinWindow(publishedAt, observedAt, windowDays) {
  if (!publishedAt) return true; // Undated rows are judged, not aged out.
  const cutoff = Date.parse(`${observedAt}T00:00:00Z`) - windowDays * 86_400_000;
  const published = Date.parse(`${publishedAt}T00:00:00Z`);
  return Number.isNaN(published) || published >= cutoff;
}

export function runRadar({
  rows,
  sources,
  newsItems,
  existing = [],
  observedAt,
  windowDays = DEFAULT_WINDOW_DAYS,
}) {
  const known = knownStories(newsItems);
  const byId = new Map(sources.map((source) => [source.id, source]));
  const classified = [];
  let outsideWindow = 0;

  for (const row of rows) {
    if (!withinWindow(row.publishedAt, observedAt, windowDays)) {
      outsideWindow += 1;
      continue;
    }

    const source = byId.get(row.sourceId);
    if (!source) {
      /*
       * A row whose feed is not in the configured list. It is recorded rather
       * than dropped: silently discarding rows is how a broken source config
       * looks exactly like a quiet week.
       */
      const canonicalUrl = canonicalizeUrl(row.url ?? '');
      classified.push({
        id: candidateId(canonicalUrl),
        title: String(row.title ?? '(sin título)'),
        url: String(row.url ?? ''),
        canonicalUrl,
        publisher: identifyPublisher(row.url ?? '') ?? 'desconocido',
        observedAt,
        publishedAt: row.publishedAt ?? null,
        discoveredVia: String(row.sourceId ?? 'desconocida'),
        vertical: 'sin-clasificar',
        status: 'rejected',
        reason: `fuente no declarada en news-sources.json: "${row.sourceId}"`,
      });
      continue;
    }

    classified.push(classifyRow(row, { source, observedAt, known, sofar: classified }));
  }

  const { inbox, added } = mergeInbox(existing, classified);

  return { inbox, added, outsideWindow, stats: summarize(inbox) };
}

export function summarize(inbox) {
  const byStatus = {};
  const byVertical = {};
  const byReason = {};

  for (const candidate of inbox) {
    byStatus[candidate.status] = (byStatus[candidate.status] ?? 0) + 1;
    if (candidate.status === 'candidate') {
      byVertical[candidate.vertical] = (byVertical[candidate.vertical] ?? 0) + 1;
    }
    if (candidate.reason) {
      byReason[candidate.reason] = (byReason[candidate.reason] ?? 0) + 1;
    }
  }

  return { total: inbox.length, byStatus, byVertical, byReason };
}

/** Byte-stable serialisation, so an unchanged run produces an unchanged file. */
export function serializeInbox(inbox) {
  return `${JSON.stringify(Inbox.parse(sortInbox(inbox)), null, 2)}\n`;
}
