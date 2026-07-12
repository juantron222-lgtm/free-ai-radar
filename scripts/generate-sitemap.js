import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const baseUrl = 'https://free-ai-radar-git-main-nada-de-pro.vercel.app';

const staticPages = [
  '',
  '/tools',
  '/creators',
  '/about',
  '/privacy',
  '/methodology',
  '/comfyui-sin-gpu',
  '/noticias'
];

try {
  const toolsPath = resolve(__dirname, '../src/data/tools.json');
  const toolsData = JSON.parse(readFileSync(toolsPath, 'utf-8'));
  
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  
  // Agregar páginas estáticas
  for (const page of staticPages) {
    xml += '  <url>\n';
    xml += `    <loc>${baseUrl}${page}</loc>\n`;
    xml += '    <changefreq>daily</changefreq>\n';
    xml += '    <priority>0.8</priority>\n';
    xml += '  </url>\n';
  }
  
  // Agregar herramientas
  for (const tool of toolsData) {
    if (tool.slug) {
      xml += '  <url>\n';
      xml += `    <loc>${baseUrl}/tools/${tool.slug}</loc>\n`;
      xml += '    <changefreq>weekly</changefreq>\n';
      xml += '    <priority>0.6</priority>\n';
      xml += '  </url>\n';
    }
  }
  
  xml += '</urlset>\n';
  
  const sitemapPath = resolve(__dirname, '../public/sitemap.xml');
  writeFileSync(sitemapPath, xml, 'utf-8');
  console.log('✅ Sitemap generado correctamente con ' + toolsData.length + ' herramientas.');
} catch (error) {
  console.error('❌ Error al generar el sitemap:', error);
  process.exit(1);
}
