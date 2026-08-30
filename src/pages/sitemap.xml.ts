import type { APIRoute } from 'astro';
import { getAllTools, getPopulatedCategories } from '@lib/data/catalog';
import { getAllNews } from '@lib/data/news';
import { absoluteUrl } from '@lib/seo/site';
import { ROUTES } from '@lib/nav';

/**
 * Sitemap, generated from the catalogue rather than committed as a file.
 *
 * Only canonical, indexable URLs go in. Filtered listing permutations, the
 * account area, the admin panel and the empty comparator are excluded — a
 * sitemap that lists `noindex` pages is a contradictory signal.
 *
 * Ese párrafo llevaba tiempo prometiendo lo que el fichero no cumplía: el
 * comparador vacío y `/pro` estaban listados, y las dos páginas se sirven con
 * `noindex, nofollow`. Pedirle a un buscador que rastree una URL y decirle en
 * la propia URL que no la indexe no es un matiz: son dos instrucciones opuestas
 * sobre la misma página. Vuelven el día que dejen de ser `noindex`, y la prueba
 * de abajo lo comprueba sola.
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
  const news = getAllNews();

  const newestVerification = tools.reduce(
    (acc, tool) => (tool.lastVerifiedAt > acc ? tool.lastVerifiedAt : acc),
    '2024-01-01'
  );

  const newestNews = news.reduce((acc, item) => (item.checkedAt > acc ? item.checkedAt : acc), '');

  const entries: Entry[] = [
    { path: ROUTES.home, lastmod: newestVerification, changefreq: 'daily', priority: 1.0 },
    { path: ROUTES.tools, lastmod: newestVerification, changefreq: 'daily', priority: 0.9 },
    { path: ROUTES.categories, lastmod: newestVerification, changefreq: 'weekly', priority: 0.8 },
    {
      path: ROUTES.news,
      lastmod: newestNews || newestVerification,
      changefreq: 'daily',
      priority: 0.8,
    },
    { path: ROUTES.models, lastmod: newestVerification, changefreq: 'weekly', priority: 0.8 },
    { path: ROUTES.agents, lastmod: newestVerification, changefreq: 'weekly', priority: 0.8 },
    { path: ROUTES.collections, changefreq: 'weekly', priority: 0.7 },
    { path: ROUTES.guides, changefreq: 'weekly', priority: 0.6 },
    { path: ROUTES.methodology, changefreq: 'monthly', priority: 0.7 },
    { path: ROUTES.editorialPolicy, changefreq: 'monthly', priority: 0.5 },
    { path: ROUTES.radarChangelog, changefreq: 'monthly', priority: 0.4 },
    { path: ROUTES.affiliates, changefreq: 'monthly', priority: 0.4 },
    { path: ROUTES.advertising, changefreq: 'monthly', priority: 0.4 },
    { path: ROUTES.about, changefreq: 'monthly', priority: 0.5 },
    { path: ROUTES.contact, changefreq: 'yearly', priority: 0.4 },
    { path: ROUTES.submit, changefreq: 'monthly', priority: 0.5 },
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
    ...news.map((item) => ({
      path: ROUTES.newsItem(item.slug),
      lastmod: item.checkedAt,
      // A news item is a dated record of something that already happened; it
      // does not change after publication except to be corrected.
      changefreq: 'yearly' as const,
      priority: item.affectsFreePlan === 'yes' ? 0.7 : 0.5,
    })),
  ];

  /*
   * Una URL, una entrada.
   *
   * `musica` y `voz` son dos categorías técnicas que comparten una sola página
   * pública, así que `ROUTES.category()` devuelve `/audio` para las dos y el
   * mapa acababa listándola dos veces. Un sitemap con duplicados es un sitemap
   * que un buscador señala, y el arreglo tiene que estar aquí y no en la lista
   * de categorías: en cuanto otra vertical se unifique, volvería a pasar.
   *
   * Gana la primera aparición, que es la de mayor prioridad por construcción.
   */
  const porRuta = new Map<string, Entry>();
  for (const entry of entries) {
    if (!porRuta.has(entry.path)) porRuta.set(entry.path, entry);
  }
  const unicas = [...porRuta.values()];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${unicas
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
