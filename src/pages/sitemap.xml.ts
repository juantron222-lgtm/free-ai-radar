import type { APIRoute } from 'astro';
import { getAllTools, getPopulatedCategories } from '@lib/data/catalog';
import { absoluteUrl } from '@lib/seo/site';
import { ROUTES } from '@lib/nav';

/**
 * Sitemap, generated from the catalogue rather than committed as a file.
 *
 * Only canonical, indexable URLs go in. Filtered listing permutations, the
 * account area, the admin panel and the empty comparator are excluded — a
 * sitemap that lists `noindex` pages is a contradictory signal.
 */

interface Entry {
  path: string;
  lastmod?: string;
  changefreq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  priority: number;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const GET: APIRoute = () => {
  const tools = getAllTools();
  const categories = getPopulatedCategories();

  const newestVerification = tools.reduce(
    (acc, tool) => (tool.lastVerifiedAt > acc ? tool.lastVerifiedAt : acc),
    '2024-01-01'
  );

  const entries: Entry[] = [
    { path: ROUTES.home, lastmod: newestVerification, changefreq: 'daily', priority: 1.0 },
    { path: ROUTES.tools, lastmod: newestVerification, changefreq: 'daily', priority: 0.9 },
    { path: ROUTES.categories, lastmod: newestVerification, changefreq: 'weekly', priority: 0.8 },
    { path: ROUTES.changes, lastmod: newestVerification, changefreq: 'daily', priority: 0.8 },
    { path: ROUTES.collections, changefreq: 'weekly', priority: 0.7 },
    { path: ROUTES.compare, changefreq: 'monthly', priority: 0.6 },
    { path: ROUTES.news, changefreq: 'daily', priority: 0.6 },
    { path: ROUTES.guides, changefreq: 'weekly', priority: 0.6 },
    { path: ROUTES.methodology, changefreq: 'monthly', priority: 0.7 },
    { path: ROUTES.editorialPolicy, changefreq: 'monthly', priority: 0.5 },
    { path: ROUTES.affiliates, changefreq: 'monthly', priority: 0.4 },
    { path: ROUTES.advertising, changefreq: 'monthly', priority: 0.4 },
    { path: ROUTES.about, changefreq: 'monthly', priority: 0.5 },
    { path: ROUTES.contact, changefreq: 'yearly', priority: 0.4 },
    { path: ROUTES.submit, changefreq: 'monthly', priority: 0.5 },
    { path: ROUTES.pricing, changefreq: 'monthly', priority: 0.6 },
    { path: ROUTES.privacy, changefreq: 'yearly', priority: 0.3 },
    { path: ROUTES.cookies, changefreq: 'yearly', priority: 0.3 },
    { path: ROUTES.terms, changefreq: 'yearly', priority: 0.3 },
    { path: ROUTES.rights, changefreq: 'yearly', priority: 0.3 },
    { path: '/guias/comfyui-sin-gpu', changefreq: 'monthly', priority: 0.7 },
    { path: '/colecciones/para-creadores', changefreq: 'weekly', priority: 0.6 },
    { path: '/colecciones/sin-tarjeta', changefreq: 'weekly', priority: 0.7 },
    { path: '/colecciones/uso-comercial', changefreq: 'weekly', priority: 0.7 },
    { path: '/colecciones/en-local', changefreq: 'weekly', priority: 0.7 },
    ...categories.map((category) => ({
      path: ROUTES.category(category.slug),
      changefreq: 'weekly' as const,
      priority: 0.8,
    })),
    ...tools.map((tool) => ({
      path: ROUTES.tool(tool.slug),
      lastmod: tool.updatedAt,
      changefreq: 'weekly' as const,
      // Well-verified tools are the pages we most want crawled first.
      priority: tool.freshness === 'fresh' ? 0.8 : 0.6,
    })),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries
  .map(
    (entry) => `  <url>
    <loc>${escapeXml(absoluteUrl(entry.path))}</loc>${
      entry.lastmod ? `\n    <lastmod>${entry.lastmod}</lastmod>` : ''
    }
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority.toFixed(1)}</priority>
  </url>`
  )
  .join('\n')}
</urlset>
`;

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
