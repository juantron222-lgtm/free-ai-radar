import type { APIRoute } from 'astro';
import { getCatalogChanges, getRecentlyAdded } from '@lib/data/catalog';
import { SITE, absoluteUrl } from '@lib/seo/site';
import { ROUTES } from '@lib/nav';

/**
 * Catalogue feed.
 *
 * Carries the two things a reader actually wants pushed: tools that just
 * entered the radar, and free plans that just changed. Not a generic "new
 * post" feed.
 */

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function rfc822(isoDate: string): string {
  return new Date(`${isoDate}T09:00:00Z`).toUTCString();
}

export const GET: APIRoute = () => {
  const changes = getCatalogChanges(20).map((entry) => ({
    title: `${entry.tool.name}: ${entry.change.summary}`,
    description: entry.change.summary,
    link: absoluteUrl(ROUTES.tool(entry.tool.slug)),
    guid: `${entry.tool.slug}-${entry.change.date}-${entry.change.kind}`,
    date: entry.change.date,
    category: 'Cambios',
  }));

  const additions = getRecentlyAdded(20).map((tool) => ({
    title: `Nueva en el radar: ${tool.name}`,
    description: `${tool.tagline} Puntuación ${tool.scoreTotal}/100. ${tool.freePlan.summary}`,
    link: absoluteUrl(ROUTES.tool(tool.slug)),
    guid: `tool-${tool.slug}-${tool.detectedAt}`,
    date: tool.detectedAt,
    category: 'Novedades',
  }));

  const items = [...changes, ...additions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 40);

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE.name)}</title>
    <link>${absoluteUrl('/')}</link>
    <description>${escapeXml(SITE.description)}</description>
    <language>es-ES</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${absoluteUrl('/rss.xml')}" rel="self" type="application/rss+xml" />
${items
  .map(
    (item) => `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.link)}</link>
      <guid isPermaLink="false">${escapeXml(item.guid)}</guid>
      <description>${escapeXml(item.description)}</description>
      <category>${escapeXml(item.category)}</category>
      <pubDate>${rfc822(item.date)}</pubDate>
    </item>`
  )
  .join('\n')}
  </channel>
</rss>
`;

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
