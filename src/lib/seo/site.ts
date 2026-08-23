import { PUBLIC_SITE_URL } from 'astro:env/client';

/** Canonical origin. Everything SEO-facing derives from this one value. */
export const SITE_URL = (PUBLIC_SITE_URL || 'https://www.freeairadar.com').replace(/\/$/, '');

export const SITE = {
  name: 'Free AI Radar',
  legalName: 'Free AI Radar',
  tagline: 'IA gratis, verificada de verdad',
  description:
    'Radar independiente de herramientas de IA. Revisamos contra la página oficial de cada fabricante qué es gratis de verdad, con qué límites, si piden tarjeta y si permiten uso comercial. Lo que no publican, lo decimos.',
  locale: 'es_ES',
  lang: 'es',
  country: 'ES',
  email: 'hola@freeairadar.com',
  /** Set once the accounts exist. Empty entries are omitted from JSON-LD. */
  social: [] as string[],
} as const;

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Canonical URL for a page.
 *
 * Query strings are dropped by default: a filtered listing must not compete
 * with its own unfiltered canonical. Pass `keepQuery` for the handful of routes
 * where the query genuinely identifies a distinct document (the comparator).
 */
export function canonicalFor(url: URL, keepQuery: string[] = []): string {
  const canonical = new URL(url.pathname, SITE_URL);
  for (const key of keepQuery) {
    const value = url.searchParams.get(key);
    if (value) canonical.searchParams.set(key, value);
  }
  // Never a trailing slash except at the root.
  const path = canonical.pathname.replace(/\/+$/, '') || '/';
  canonical.pathname = path;
  return canonical.toString();
}

export interface PageSeo {
  title: string;
  description: string;
  canonical: string;
  ogImage?: string;
  ogType?: 'website' | 'article';
  /** `noindex` for anything private, thin, or a filtered permutation. */
  noindex?: boolean;
  publishedTime?: string;
  modifiedTime?: string;
}

export function pageTitle(title: string): string {
  if (!title) return `${SITE.name} — ${SITE.tagline}`;
  return title.includes(SITE.name) ? title : `${title} | ${SITE.name}`;
}

/** Clamps a description to a length search engines will actually render. */
export function metaDescription(text: string, max = 158): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : cut.length)}…`;
}
