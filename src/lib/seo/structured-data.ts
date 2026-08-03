import type { Tool } from '@lib/domain/tool';
import { absoluteUrl, SITE, SITE_URL } from './site';
import { getCategory, PLATFORM_LABEL } from '@lib/domain/taxonomy';

/**
 * JSON-LD.
 *
 * Rule we do not bend: **no `aggregateRating` and no `review` markup**.
 * Google's rating rich results are for ratings collected from users or from a
 * clearly identified critic. Our score is an internal editorial index over
 * verifiable facts; emitting it as a star rating would misrepresent it and is
 * exactly the pattern that gets sites manual actions. The score is published
 * prominently in the page body, with its full breakdown — just not as a
 * machine-readable rating we cannot honestly substantiate.
 */

type JsonLd = Record<string, unknown>;

export function organizationSchema(): JsonLd {
  const schema: JsonLd = {
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: SITE.name,
    url: SITE_URL,
    logo: {
      '@type': 'ImageObject',
      url: absoluteUrl('/icons/icon-512.png'),
      width: 512,
      height: 512,
    },
    description: SITE.description,
    email: SITE.email,
  };
  if (SITE.social.length) schema['sameAs'] = SITE.social;
  return schema;
}

export function websiteSchema(): JsonLd {
  return {
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    name: SITE.name,
    url: SITE_URL,
    description: SITE.description,
    inLanguage: 'es-ES',
    publisher: { '@id': `${SITE_URL}/#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/herramientas?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export interface Crumb {
  name: string;
  path: string;
}

export function breadcrumbSchema(crumbs: Crumb[]): JsonLd {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

export function itemListSchema(tools: readonly Tool[], listName: string, basePath = '/herramientas'): JsonLd {
  return {
    '@type': 'ItemList',
    name: listName,
    numberOfItems: tools.length,
    itemListElement: tools.slice(0, 50).map((tool, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: absoluteUrl(`${basePath}/${tool.slug}`),
      name: tool.name,
    })),
  };
}

/**
 * `SoftwareApplication` for a tool.
 *
 * `offers` reflects the *free tier only*, which is what this site documents and
 * what we have actually verified. We do not invent paid-tier prices.
 */
export function softwareApplicationSchema(tool: Tool): JsonLd {
  const category = getCategory(tool.categorySlug);
  const schema: JsonLd = {
    '@type': 'SoftwareApplication',
    '@id': absoluteUrl(`/herramientas/${tool.slug}#software`),
    name: tool.name,
    url: tool.officialUrl,
    applicationCategory: 'MultimediaApplication',
    applicationSubCategory: category?.name ?? 'IA',
    description: tool.descriptionShort,
    inLanguage: 'es-ES',
  };

  const operatingSystems = tool.platforms
    .filter((p) => ['windows', 'macos', 'linux', 'ios', 'android'].includes(p))
    .map((p) => PLATFORM_LABEL[p]);
  if (operatingSystems.length) schema['operatingSystem'] = operatingSystems.join(', ');
  else if (tool.platforms.includes('web')) schema['operatingSystem'] = 'Web';

  const hasFreeTier = tool.freeModel !== 'paid_only';
  if (hasFreeTier) {
    schema['offers'] = {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'EUR',
      availability: 'https://schema.org/InStock',
      description: tool.freePlan.summary,
      url: tool.pricingUrl ?? tool.officialUrl,
    };
  }

  if (tool.repoUrl) schema['codeRepository'] = tool.repoUrl;
  if (tool.licence) schema['license'] = tool.licence;

  return schema;
}

export interface ArticleMeta {
  headline: string;
  description: string;
  path: string;
  datePublished: string;
  dateModified: string;
  authorName: string;
}

export function articleSchema(meta: ArticleMeta): JsonLd {
  return {
    '@type': 'Article',
    headline: meta.headline,
    description: meta.description,
    inLanguage: 'es-ES',
    datePublished: meta.datePublished,
    dateModified: meta.dateModified,
    mainEntityOfPage: { '@type': 'WebPage', '@id': absoluteUrl(meta.path) },
    author: { '@type': 'Person', name: meta.authorName },
    publisher: { '@id': `${SITE_URL}/#organization` },
  };
}

export interface FaqEntry {
  question: string;
  answer: string;
}

export function faqSchema(entries: FaqEntry[]): JsonLd {
  return {
    '@type': 'FAQPage',
    mainEntity: entries.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: { '@type': 'Answer', text: entry.answer },
    })),
  };
}

/** Wraps one or more schema objects into a single `@graph` document. */
export function graph(...nodes: JsonLd[]): string {
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes });
}
