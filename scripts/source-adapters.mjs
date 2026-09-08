#!/usr/bin/env node
/**
 * Reads a source and returns candidate items, whatever shape the source is in.
 *
 * The radar only spoke RSS, and that quietly capped what Free AI Radar could
 * ever cover. Of twenty-six official image, video and audio vendors checked,
 * **five publish a feed**. The rest keep a perfectly good changelog in HTML and
 * no amount of adding them to `news-sources.json` would have produced a single
 * item.
 *
 * Two adapters, one contract: give me a source, get back `{ title, url,
 * publishedAt }`.
 *
 * ## Why the HTML adapter reads the articles and not the index
 *
 * Scraping a list page means encoding its markup — the card class, the heading
 * level, where the date sits — and that markup is redesigned every few months
 * without warning. What is stable is the *shape of an article URL*, so a source
 * declares a link pattern and nothing else about the index.
 *
 * Title, date and canonical then come from each article's own `<head>`, where
 * they are published for exactly this purpose: `og:title`,
 * `article:published_time`, `rel=canonical`. That is one request per item
 * instead of zero, and in exchange the metadata is the vendor's own rather than
 * whatever the card happened to render.
 *
 * No browser. Every source in the pilot serves its list in static HTML — that
 * was checked before any of them was added, and a source that needs JavaScript
 * to list its own articles is a source this adapter reports as producing
 * nothing rather than one it quietly guesses at.
 */

const TIMEOUT_MS = 12_000;
const DEFAULT_UA = 'FreeAIRadar/2.0 (+https://www.freeairadar.com)';

/** Health is about the source, not about one run. */
export const HEALTH = /** @type {const} */ (['healthy', 'degraded', 'broken']);

/**
 * `timeoutMs` se respeta, que no era el caso.
 *
 * `fetchSource` aceptaba la opción y nunca la pasaba: el tope real era siempre
 * la constante del módulo. Subirlo desde el llamador no hacía absolutamente
 * nada, y una opción que se acepta y se ignora es peor que no ofrecerla —
 * costó una pasada entera creyendo que el problema era la red.
 */
async function get(url, { userAgent, accept, timeoutMs } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': userAgent || DEFAULT_UA,
        ...(accept ? { Accept: accept } : {}),
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

// --------------------------------------------------------------------- RSS --

const stripTags = (value) =>
  String(value ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

const pick = (block, tag) => {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? stripTags(match[1]) : '';
};

const isoDay = (raw) => {
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

export function parseFeed(xml) {
  const blocks = xml.match(/<(item|entry)[^>]*>([\s\S]*?)<\/\1>/g) ?? [];

  return blocks.map((block) => ({
    title: pick(block, 'title'),
    url: pick(block, 'link') || (block.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? '').trim(),
    publishedAt:
      isoDay(pick(block, 'pubDate')) ??
      isoDay(pick(block, 'published')) ??
      isoDay(pick(block, 'updated')) ??
      isoDay(pick(block, 'dc:date')),
  }));
}

// -------------------------------------------------------------------- HTML --

/**
 * The article links an index page offers, in the order it offers them.
 *
 * Matching is against the pathname, so a source's pattern does not have to know
 * whether the site writes absolute or relative hrefs — and the two forms cannot
 * produce two entries for the same article.
 */
export function parseIndexLinks(html, source) {
  const base = source.index_url;
  const include = new RegExp(source.item_link_pattern);
  const exclude = (source.exclude_patterns ?? []).map((p) => new RegExp(p));

  const found = [];
  for (const match of html.matchAll(/href=["']([^"'>]+)["']/gi)) {
    let url;
    try {
      url = new URL(match[1], base);
    } catch {
      continue;
    }
    if (url.host !== new URL(base).host) continue;

    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (!include.test(path)) continue;
    if (exclude.some((rule) => rule.test(path) || rule.test(url.href))) continue;

    url.hash = '';
    url.search = '';
    if (!found.includes(url.href)) found.push(url.href);
  }

  return found;
}

const meta = (html, ...names) => {
  for (const name of names) {
    const match =
      html.match(
        new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i')
      ) ??
      html.match(
        new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${name}["']`, 'i')
      );
    if (match?.[1]) return stripTags(match[1]);
  }
  return '';
};

/**
 * What an article says about itself.
 *
 * `og:title` before `<title>` because the second usually carries the site name
 * as a suffix, and a headline with " | Acme Blog" glued to it is a headline
 * nobody wrote.
 */
export function extractArticleMeta(html, url) {
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1];

  let published =
    meta(html, 'article:published_time', 'datePublished', 'publish_date', 'date') || '';

  if (!published) {
    // JSON-LD is where a lot of sites keep the only date they publish.
    const ld = html.match(/"datePublished"\s*:\s*"([^"]+)"/);
    if (ld) published = ld[1];
  }

  return {
    title: meta(html, 'og:title', 'twitter:title') || stripTags(pick(html, 'title')),
    url: canonical ? new URL(canonical, url).href : url,
    publishedAt: isoDay(published),
  };
}

async function fetchHtmlSource(source, { fetchPage = get } = {}) {
  const index = await fetchPage(source.index_url, {
    userAgent: source.user_agent,
    accept: 'text/html,application/xhtml+xml',
  });

  const links = parseIndexLinks(index, source).slice(0, source.max_items ?? 10);
  const items = [];

  for (const link of links) {
    try {
      const article = await fetchPage(link, {
        userAgent: source.user_agent,
        accept: 'text/html,application/xhtml+xml',
      });
      const parsed = extractArticleMeta(article, link);
      if (parsed.title) items.push(parsed);
    } catch {
      /*
       * One unreachable article is not a broken source. It is left out and the
       * others still count, which keeps a single 404 from turning a healthy
       * changelog into a red light.
       */
    }
  }

  return items;
}

/**
 * Reads one source. Throws only when the source itself could not be reached —
 * an empty result is a *value*, and the caller is what decides whether zero
 * items means the vendor was quiet or the markup moved.
 */
export async function fetchSource(source, options = {}) {
  if (source.source_type === 'html') return fetchHtmlSource(source, options);

  const fetchPage = options.fetchPage ?? get;
  const xml = await fetchPage(source.feed_url, {
    userAgent: source.user_agent,
    accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
    timeoutMs: options.timeoutMs,
  });
  return parseFeed(xml);
}

/**
 * Turns "what happened this run" plus "what used to happen" into a health
 * verdict.
 *
 * The interesting state is `degraded`: reachable, and returning nothing where
 * it used to return something. That is what a redesigned index page looks like
 * from here, and without this it looks exactly like a quiet week — which is how
 * a source can stop working for months without anyone noticing.
 */
export function judgeHealth({ reachable, items, previousItems }) {
  if (!reachable) return 'broken';
  if (items > 0) return 'healthy';
  return previousItems > 0 ? 'degraded' : 'healthy';
}
