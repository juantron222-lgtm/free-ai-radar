import newsData from "../data/news.json";

export async function GET() {
  const items = (newsData.items || []).slice(0, 30);
  
  let xml = '<?xml version="1.0" encoding="UTF-8" ?>\n';
  xml += '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n';
  xml += '<channel>\n';
  xml += '  <title>Noticias de Inteligencia Artificial | Free AI Radar</title>\n';
  xml += '  <link>https://www.freeairadar.com/noticias</link>\n';
  xml += '  <description>Novedades y lanzamientos de inteligencia artificial actualizados diariamente desde fuentes oficiales.</description>\n';
  xml += '  <language>es</language>\n';
  xml += '  <atom:link href="https://www.freeairadar.com/noticias.xml" rel="self" type="application/rss+xml" />\n';

  for (const item of items) {
    // Escapar caracteres XML comunes para evitar errores de parseo
    const escapeXml = (unsafe) => {
      if (!unsafe) return "";
      return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
    };

    xml += '  <item>\n';
    xml += `    <title>${escapeXml(item.title)}</title>\n`;
    xml += `    <link>${escapeXml(item.canonical_url)}</link>\n`;
    xml += `    <guid isPermaLink="true">${escapeXml(item.canonical_url)}</guid>\n`;
    xml += `    <pubDate>${new Date(item.published_at).toUTCString()}</pubDate>\n`;
    xml += `    <description>${escapeXml(item.excerpt)}</description>\n`;
    xml += `    <source url="${escapeXml(item.source_url)}">${escapeXml(item.source_name)}</source>\n`;
    xml += '  </item>\n';
  }

  xml += '</channel>\n';
  xml += '</rss>\n';

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
