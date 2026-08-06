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

/** What kind of thing happened. Drives filtering and alert routing. */
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
  'actualizacion',
  'plan-gratuito',
  'precios',
  'cierre',
  'limitacion',
  'privacidad-licencias',
  'api-gratuita',
  'lanzamiento',
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
  actualizacion: 'Actualizaciones',
  'plan-gratuito': 'Planes gratuitos',
  precios: 'Precios',
  cierre: 'Cierres',
  limitacion: 'Nuevas limitaciones',
  'privacidad-licencias': 'Privacidad y licencias',
  'api-gratuita': 'APIs gratuitas',
  lanzamiento: 'Lanzamientos',
};

/**
 * A source. `official` is the only kind that can back a published claim —
 * `isPublishable` enforces it.
 */
export const NewsSource = z.object({
  url: HttpUrl,
  label: z.string().min(1),
  kind: z.enum(['official', 'release-notes', 'pricing', 'docs', 'repo', 'model-card']),
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
  category: NewsCategory,

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

  return { ok: reasons.length === 0, reasons };
}

export interface HydratedNewsItem extends NewsItem {
  readonly categoryLabel: string;
  readonly verificationLabel: string;
  readonly ageDays: number;
  /** Older than 90 days: still true, but no longer "latest". */
  readonly isRecent: boolean;
}

export function hydrateNews(item: NewsItem, now: Date = new Date()): HydratedNewsItem {
  const published = Date.parse(`${item.publishedAt}T00:00:00Z`);
  const ageDays = Number.isNaN(published)
    ? Number.POSITIVE_INFINITY
    : Math.floor((now.getTime() - published) / 86_400_000);

  return {
    ...item,
    categoryLabel: NEWS_CATEGORY_LABEL[item.category],
    verificationLabel: NEWS_VERIFICATION_LABEL[item.verification],
    ageDays,
    isRecent: ageDays <= 90,
  };
}
