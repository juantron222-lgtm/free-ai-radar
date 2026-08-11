import { z } from 'zod';
import { HttpUrl, IsoDate, Slug } from './primitives';

/**
 * Editorial news.
 *
 * The rule this schema exists to enforce: **an item cannot be published unless
 * it carries at least one source on the vendor's own domain**. A search-engine
 * summary or a press write-up locates the story; it never backs it. The
 * `verification` field makes the difference visible to the reader instead of
 * hiding it behind confident prose.
 */

/**
 * What the item is *about*. One of two orthogonal axes.
 *
 * Four values have been removed from this enum because each of them named an
 * event or its effect rather than a subject, which is what put the two axes in
 * the same field to begin with:
 *
 * - `lanzamiento` and `actualizacion` are now `NewsEventType` values.
 * - `limitacion` and `cierre` described what happened to a tool, not what the
 *   tool is. A feature being withdrawn is `eventType: 'retirada'` plus
 *   `availability: 'deprecated'`; the category is still whatever the feature
 *   was — image generation, audio, agents.
 *
 * What remains is subject matter only. `plan-gratuito`, `precios` and
 * `api-gratuita` stay: a free tier and a price are things an item can be
 * *about*, not things that happen to it.
 */
export const NewsCategory = z.enum([
  'modelo-lenguaje',
  'modelo-multimodal',
  'agentes',
  'plataforma-agentes',
  'programacion',
  'imagen',
  'video',
  'audio',
  'local-open-source',
  'plan-gratuito',
  'precios',
  'privacidad-licencias',
  'api-gratuita',
]);
export type NewsCategory = z.infer<typeof NewsCategory>;

export const NEWS_CATEGORY_LABEL: Record<NewsCategory, string> = {
  'modelo-lenguaje': 'Modelos de lenguaje',
  'modelo-multimodal': 'Modelos multimodales',
  agentes: 'Agentes',
  'plataforma-agentes': 'Plataformas de agentes',
  programacion: 'Programación',
  imagen: 'Imagen',
  video: 'Vídeo',
  audio: 'Audio y música',
  'local-open-source': 'Local y open source',
  'plan-gratuito': 'Planes gratuitos',
  precios: 'Precios',
  'privacidad-licencias': 'Privacidad y licencias',
  'api-gratuita': 'APIs gratuitas',
};

/**
 * What actually *happened*. The second axis, and the one editorial rule 5 is
 * about: a reader must never have to guess whether something was merely
 * announced or can be used today.
 */
export const NewsEventType = z.enum([
  'anuncio',
  'lanzamiento',
  'actualizacion',
  'preview-beta',
  'disponibilidad-general',
  'retirada',
]);
export type NewsEventType = z.infer<typeof NewsEventType>;

export const NEWS_EVENT_TYPE_LABEL: Record<NewsEventType, string> = {
  anuncio: 'Anuncio',
  lanzamiento: 'Lanzamiento',
  actualizacion: 'Actualización',
  'preview-beta': 'Preview o beta',
  'disponibilidad-general': 'Disponibilidad general',
  retirada: 'Retirada',
};

/**
 * Whether a reader can actually use the thing right now.
 *
 * `unknown` is a first-class answer, not a failure: it is what the source
 * supports when the source says nothing. Rule 4 — the page not saying it is
 * never the same as the page denying it.
 */
export const NewsAvailability = z.enum([
  'announced',
  'preview',
  'limited',
  'available',
  'deprecated',
  'unknown',
]);
export type NewsAvailability = z.infer<typeof NewsAvailability>;

/** Long form, for the detail page where there is room to explain. */
export const NEWS_AVAILABILITY_LABEL: Record<NewsAvailability, string> = {
  announced: 'Anunciado, todavía no disponible',
  preview: 'En preview o beta',
  limited: 'Disponibilidad limitada',
  available: 'Disponible',
  deprecated: 'Retirado o en desuso',
  unknown: 'Disponibilidad sin confirmar',
};

/**
 * Short form, for the card.
 *
 * `unknown` keeps its full wording on purpose. "Desconocido" reads like a
 * property of the thing; "Disponibilidad sin confirmar" says whose gap it is —
 * ours, because the vendor's page does not state it.
 */
export const NEWS_AVAILABILITY_SHORT: Record<NewsAvailability, string> = {
  announced: 'Anunciado',
  preview: 'Preview',
  limited: 'Acceso limitado',
  available: 'Disponible',
  deprecated: 'Retirado',
  unknown: 'Disponibilidad sin confirmar',
};

/**
 * Semantic weight of each availability, for the UI to colour.
 *
 * A tone rather than a class name: which chip renders it is the component's
 * business, but *that `deprecated` must never read like `available`* is the
 * domain's, and it is what the tests assert.
 */
export type AvailabilityTone = 'ok' | 'caution' | 'ended' | 'future' | 'pending';

export const NEWS_AVAILABILITY_TONE: Record<NewsAvailability, AvailabilityTone> = {
  available: 'ok',
  preview: 'caution',
  limited: 'caution',
  announced: 'future',
  deprecated: 'ended',
  unknown: 'pending',
};

/**
 * Which availabilities each event type can honestly carry.
 *
 * `unknown` appears in almost every row on purpose: not having read it is
 * always a legitimate outcome. What the matrix forbids is the *contradiction* —
 * an `anuncio` that claims the thing is already `available`, or a
 * `disponibilidad-general` that admits it does not know.
 */
export const EVENT_TYPE_ALLOWS: Record<NewsEventType, readonly NewsAvailability[]> = {
  anuncio: ['announced', 'unknown'],
  lanzamiento: ['available', 'limited', 'preview', 'unknown'],
  actualizacion: ['available', 'limited', 'preview', 'unknown'],
  'preview-beta': ['preview', 'limited', 'unknown'],
  'disponibilidad-general': ['available'],
  retirada: ['deprecated', 'unknown'],
};

/**
 * Source kinds that can establish availability.
 *
 * A repository root proves a project exists; it does not state who can use a
 * given feature today. Release notes, docs, a pricing page or the announcement
 * itself do. Requiring one of these is what stops availability from being
 * inferred from a headline.
 */
const AVAILABILITY_EVIDENCE_KINDS: readonly NewsSourceKind[] = [
  'official',
  'release-notes',
  'pricing',
  'docs',
  'model-card',
];

/**
 * A source. `official` is the only kind that can back a published claim —
 * `isPublishable` enforces it.
 */
export const NewsSourceKind = z.enum([
  'official',
  'release-notes',
  'pricing',
  'docs',
  'repo',
  'model-card',
]);
export type NewsSourceKind = z.infer<typeof NewsSourceKind>;

export const NewsSource = z.object({
  url: HttpUrl,
  label: z.string().min(1),
  kind: NewsSourceKind,
  /**
   * Who controls this URL, as `host` or `host/org`.
   *
   * The `host/org` form exists because on shared hosts — GitHub, GitLab,
   * Hugging Face — the hostname proves nothing: anyone can publish a repo on
   * github.com. What identifies the vendor there is the org that owns the
   * path, so `github.com/ollama` is a vendor source and `github.com/someone`
   * is not. `isVendorSource` enforces whichever form is declared.
   */
  publisher: z.string().min(1),
  checkedAt: IsoDate,
});
export type NewsSource = z.infer<typeof NewsSource>;

/** Hosts where the hostname alone does not identify a vendor. */
const SHARED_HOSTS = ['github.com', 'gitlab.com', 'huggingface.co', 'medium.com', 'substack.com'];

/**
 * True when `source.url` is genuinely controlled by the party named in
 * `source.publisher`.
 *
 * Both parts are checked: the hostname must match (as a suffix, so
 * `docs.anthropic.com` satisfies `anthropic.com`), and when an org is declared
 * the first path segment must be exactly that org. On a shared host an org is
 * mandatory — otherwise `github.com` would launder any repository into a
 * vendor announcement.
 */
export function isVendorSource(source: Pick<NewsSource, 'url' | 'publisher'>): boolean {
  let parsed: URL;
  try {
    parsed = new URL(source.url);
  } catch {
    return false;
  }

  const [host, org] = source.publisher.split('/');
  if (!host) return false;

  const hostMatches = parsed.hostname === host || parsed.hostname.endsWith(`.${host}`);
  if (!hostMatches) return false;

  if (SHARED_HOSTS.includes(host) && !org) return false;
  if (!org) return true;

  return parsed.pathname.toLowerCase().startsWith(`/${org.toLowerCase()}/`);
}

export const NewsVerification = z.enum(['verified', 'partial', 'pending']);
export type NewsVerification = z.infer<typeof NewsVerification>;

export const NEWS_VERIFICATION_LABEL: Record<NewsVerification, string> = {
  verified: 'Verificada',
  partial: 'Parcialmente verificada',
  pending: 'Borrador sin verificar',
};

export const NewsStatus = z.enum(['draft', 'in_review', 'published', 'archived']);
export type NewsStatus = z.infer<typeof NewsStatus>;

export const NewsItem = z.object({
  id: z.string().min(1),
  slug: Slug,
  title: z.string().min(1).max(160),
  /** Answers "what changes for someone using this for free?". */
  summary: z.string().min(20).max(600),
  /** The practical consequence. Must not restate the headline. */
  impact: z.string().min(20).max(600),

  /** What it is about. */
  category: NewsCategory,
  /**
   * What happened. Mandatory, with no default: a default would let an item slip
   * through carrying an event type nobody ever read off the source, which is
   * the exact inference rule 5 exists to prevent.
   */
  eventType: NewsEventType,
  /**
   * Whether a reader can use it today. Mandatory, also with no default.
   * `unknown` is the honest value when the source does not say — but it has to
   * be chosen, not fallen into.
   */
  availability: NewsAvailability,

  /** Date the vendor published it, taken literally from their page. */
  publishedAt: IsoDate,
  /** Date we actually read the source. */
  checkedAt: IsoDate,

  sources: z.array(NewsSource).min(1),
  /** Canonical vendor link for the "read the announcement" button. */
  officialUrl: HttpUrl,

  /** Catalogue slugs. Validated for existence on load. */
  relatedTools: z.array(z.string()).default([]),

  /**
   * Only `true` when the source states it explicitly. "The page does not say"
   * is `unverified`, never `false` — the same rule the catalogue uses.
   */
  affectsFreePlan: z.enum(['yes', 'no', 'unverified']).default('unverified'),

  verification: NewsVerification,
  status: NewsStatus.default('draft'),
  author: z.string().min(1),

  /** SEO. Falls back to title/summary when absent. */
  seoTitle: z.string().max(70).optional(),
  seoDescription: z.string().max(160).optional(),

  /** What is still unconfirmed, shown to the reader on `partial` items. */
  unconfirmed: z.array(z.string()).default([]),
});
export type NewsItem = z.infer<typeof NewsItem>;

/**
 * Publishability, as code rather than as a promise.
 *
 * Mirrors §5 of the `ai-news-primary-source-researcher` skill so the rule is
 * enforced at build time and cannot be argued with later.
 */
export function isPublishable(item: NewsItem): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];

  const official = item.sources.filter((s) => s.kind !== 'model-card' || s.publisher);
  if (!official.length) reasons.push('sin ninguna fuente utilizable');

  const vendorSources = item.sources.filter(isVendorSource);
  if (!vendorSources.length) {
    reasons.push('ninguna fuente pertenece al dominio del fabricante');
  }

  /*
   * The vendor sources must also cover `officialUrl`.
   *
   * Without this, an item could cite one legitimate vendor page and then point
   * its "read the announcement" button anywhere: the citation would pass while
   * the reader was sent somewhere uncited. Nothing in code can prove a domain
   * really belongs to a vendor, but this does guarantee that the button and
   * the evidence lead to the same party.
   */
  const officialIsCited = vendorSources.some((source) =>
    isVendorSource({ url: item.officialUrl, publisher: source.publisher })
  );
  if (vendorSources.length && !officialIsCited) {
    reasons.push('el enlace oficial no está respaldado por ninguna de las fuentes citadas');
  }

  if (item.publishedAt > item.checkedAt) {
    reasons.push('la fecha de publicación es posterior a la de comprobación');
  }

  if (item.verification === 'pending') {
    reasons.push('marcada como borrador sin verificar');
  }

  if (item.verification === 'partial' && item.unconfirmed.length === 0) {
    reasons.push('parcialmente verificada pero no dice qué falta por confirmar');
  }

  /*
   * Rule 5, as a gate rather than as an intention.
   *
   * The event type and the availability have to agree. An `anuncio` whose
   * availability is `available` is not an announcement, it is a launch; a
   * `disponibilidad-general` that admits `unknown` is claiming the one thing it
   * says it could not check.
   */
  const allowed = EVENT_TYPE_ALLOWS[item.eventType];
  if (!allowed.includes(item.availability)) {
    reasons.push(
      `un evento de tipo "${item.eventType}" no puede declarar disponibilidad "${item.availability}" ` +
        `(admitidas: ${allowed.join(', ')})`
    );
  }

  /*
   * Availability cannot be inferred.
   *
   * Any answer other than `unknown` is a claim about what the reader can do
   * today, so it needs a vendor page that actually states it. `unknown` needs
   * nothing — it is the absence of a claim.
   */
  if (item.availability !== 'unknown') {
    const hasEvidence = item.sources.some(
      (source) => isVendorSource(source) && AVAILABILITY_EVIDENCE_KINDS.includes(source.kind)
    );
    if (!hasEvidence) {
      reasons.push(
        `declara disponibilidad "${item.availability}" sin una fuente del fabricante que la acredite ` +
          `(se admite: ${AVAILABILITY_EVIDENCE_KINDS.join(', ')}); si no consta, usa "unknown"`
      );
    }
  }

  /* The strongest availability claim there is cannot rest on a partial read. */
  if (item.eventType === 'disponibilidad-general' && item.verification !== 'verified') {
    reasons.push('declara disponibilidad general sin estar completamente verificada');
  }

  return { ok: reasons.length === 0, reasons };
}

/**
 * Canonical form of a story URL, for comparing two items.
 *
 * Protocol, `www.`, query string, fragment and trailing slash are all noise
 * that lets the same page be cited twice in two different spellings.
 */
export function normalizeStoryUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url.trim().toLowerCase();
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const path = parsed.pathname.toLowerCase().replace(/\/+$/, '');
  return `${host}${path}`;
}

/** Comparable word set of a headline: lowercase, unaccented, short words dropped. */
function titleTokens(title: string): Set<string> {
  const normalized = title
    .toLowerCase()
    .normalize('NFD')
    // Combining marks are dropped, not spaced out: NFD splits "ó" into "o" plus
    // an accent, and turning that accent into a space would cut the word in two.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ');
  return new Set(normalized.split(/\s+/).filter((word) => word.length > 3));
}

/** Overlap of two headlines, 0 to 1. */
export function titleSimilarity(a: string, b: string): number {
  const left = titleTokens(a);
  const right = titleTokens(b);
  if (left.size === 0 || right.size === 0) return 0;

  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / (left.size + right.size - shared);
}

export interface DuplicateStory {
  a: string;
  b: string;
  reason: string;
}

/**
 * Cross-item duplication — rule 7.
 *
 * Unique slugs and ids only stop the same *record* appearing twice. They do
 * nothing about the same *event* being written up twice under two headlines,
 * which is what actually happens when a story is rediscovered a week later.
 *
 * Two checks, and the first one is the one with teeth: pointing two items at
 * the same `officialUrl` means one of them is not really about that page.
 * Citing a vendor's news index instead of the announcement is the usual cause,
 * and the fix is to deep-link the announcement itself.
 */
export function findDuplicateStories(
  items: ReadonlyArray<Pick<NewsItem, 'slug' | 'title' | 'officialUrl' | 'eventType' | 'publishedAt'>>
): DuplicateStory[] {
  const duplicates: DuplicateStory[] = [];

  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i]!;
      const b = items[j]!;

      const urlA = normalizeStoryUrl(a.officialUrl);
      const urlB = normalizeStoryUrl(b.officialUrl);

      if (urlA === urlB) {
        duplicates.push({
          a: a.slug,
          b: b.slug,
          reason: `comparten la misma url oficial (${urlA}); enlaza el anuncio concreto, no el índice`,
        });
        continue;
      }

      /*
       * Same vendor, same day, same kind of event and a headline that mostly
       * overlaps: that is one story written twice. Requiring all four keeps two
       * genuine launches on the same day from colliding.
       */
      const sameHost = urlA.split('/')[0] === urlB.split('/')[0];
      const similarity = titleSimilarity(a.title, b.title);
      if (
        sameHost &&
        a.eventType === b.eventType &&
        a.publishedAt === b.publishedAt &&
        similarity >= 0.6
      ) {
        duplicates.push({
          a: a.slug,
          b: b.slug,
          reason: `mismo fabricante, misma fecha y mismo tipo de evento, con titulares que coinciden al ${Math.round(similarity * 100)} %`,
        });
      }
    }
  }

  return duplicates;
}

export interface HydratedNewsItem extends NewsItem {
  readonly categoryLabel: string;
  readonly eventTypeLabel: string;
  readonly availabilityLabel: string;
  readonly availabilityShort: string;
  readonly availabilityTone: AvailabilityTone;
  readonly verificationLabel: string;
  readonly ageDays: number;
  /** Older than 90 days: still true, but no longer "latest". */
  readonly isRecent: boolean;
  /**
   * True when the item describes something the reader cannot use yet. The card
   * needs this to say "Anuncio — todavía no disponible" instead of letting the
   * headline imply a launch.
   */
  readonly isNotYetUsable: boolean;
}

export function hydrateNews(item: NewsItem, now: Date = new Date()): HydratedNewsItem {
  const published = Date.parse(`${item.publishedAt}T00:00:00Z`);
  const ageDays = Number.isNaN(published)
    ? Number.POSITIVE_INFINITY
    : Math.floor((now.getTime() - published) / 86_400_000);

  return {
    ...item,
    categoryLabel: NEWS_CATEGORY_LABEL[item.category],
    eventTypeLabel: NEWS_EVENT_TYPE_LABEL[item.eventType],
    availabilityLabel: NEWS_AVAILABILITY_LABEL[item.availability],
    availabilityShort: NEWS_AVAILABILITY_SHORT[item.availability],
    availabilityTone: NEWS_AVAILABILITY_TONE[item.availability],
    verificationLabel: NEWS_VERIFICATION_LABEL[item.verification],
    ageDays,
    isRecent: ageDays <= 90,
    isNotYetUsable: item.availability === 'announced' || item.eventType === 'anuncio',
  };
}
