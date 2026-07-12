import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sourcesPath = resolve(__dirname, '../src/data/news-sources.json');
const newsPath = resolve(__dirname, '../src/data/news.json');

const TIMEOUT_MS = 8000;
const MAX_NEWS_LIMIT = 200;
const MAX_DAYS_RETENTION = 60;

function cleanText(text) {
  if (!text) return "";
  let clean = text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  clean = clean.replace(/<[^>]*>/g, " ");
  // Decodificar entidades HTML comunes
  clean = clean
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean;
}

function normalizeUrl(urlStr) {
  try {
    const url = new URL(urlStr.trim());
    const paramsToDelete = [];
    url.searchParams.forEach((value, key) => {
      if (key.startsWith('utm_') || key === 'ref' || key === 'source' || key === 'fbclid') {
        paramsToDelete.push(key);
      }
    });
    paramsToDelete.forEach(p => url.searchParams.delete(p));
    let res = url.toString();
    if (res.endsWith('/') && url.pathname === '/') {
      res = res.slice(0, -1);
    }
    return res;
  } catch (e) {
    return urlStr.trim();
  }
}

function parseRss(xmlText) {
  const items = [];
  const itemMatches = xmlText.match(/<item[^>]*>([\s\S]*?)<\/item>/g) || [];
  
  for (const itemXml of itemMatches) {
    const titleMatch = itemXml.match(/<title[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i) || itemXml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const linkMatch = itemXml.match(/<link[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/link>/i) || itemXml.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
    const pubDateMatch = itemXml.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || itemXml.match(/<dc:date[^>]*>([\s\S]*?)<\/dc:date>/i);
    const descMatch = itemXml.match(/<description[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i) || itemXml.match(/<description[^>]*>([\s\S]*?)<\/description>/i) || itemXml.match(/<content:encoded[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/i) || itemXml.match(/<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/i);

    if (titleMatch && linkMatch) {
      const title = cleanText(titleMatch[1]);
      const link = normalizeUrl(linkMatch[1]);
      const pubDate = pubDateMatch ? cleanText(pubDateMatch[1]) : new Date().toISOString();
      const description = descMatch ? cleanText(descMatch[1]) : "";
      
      items.push({ title, link, pubDate, description });
    }
  }
  return items;
}

// Generador de hashes simples para ID único de noticias
function generateHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return 'news-' + Math.abs(hash).toString(16);
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/xml, text/xml, */*'
      }
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

async function run() {
  console.log("📡 Iniciando rastreo de noticias de IA...");
  
  if (!existsSync(sourcesPath)) {
    console.error("❌ Archivo de fuentes no encontrado:", sourcesPath);
    process.exit(1);
  }

  const sources = JSON.parse(readFileSync(sourcesPath, 'utf-8')).filter(s => s.enabled);
  
  let existingNews = { updated_at: "", items: [] };
  if (existsSync(newsPath)) {
    try {
      existingNews = JSON.parse(readFileSync(newsPath, 'utf-8'));
    } catch (e) {
      console.warn("⚠️ No se pudo leer news.json anterior, inicializando vacío.");
    }
  }

  const processed = [];
  const failed = [];
  let newCount = 0;
  let dupCount = 0;
  let rejectedCount = 0;

  const newItems = [];

  for (const source of sources) {
    console.log(`🔍 Descargando feed de: ${source.name} (${source.feed_url})`);
    try {
      const res = await fetchWithTimeout(source.feed_url);
      if (!res.ok) {
        throw new Error(`HTTP Status ${res.status}`);
      }
      const xml = await res.text();
      const rawItems = parseRss(xml);
      
      processed.push(source.name);
      console.log(`  -> Encontrados ${rawItems.length} elementos.`);

      for (const raw of rawItems) {
        // Validaciones básicas de seguridad y calidad
        if (!raw.title || !raw.link || !raw.link.startsWith("http")) {
          rejectedCount++;
          continue;
        }

        const pubTime = new Date(raw.pubDate).getTime();
        if (isNaN(pubTime) || pubTime > Date.now() + 86400000) { // Bloquear fechas futuras absurdas
          rejectedCount++;
          continue;
        }

        const normalizedLink = normalizeUrl(raw.link);
        const id = generateHash(normalizedLink + raw.title);

        const excerpt = raw.description ? raw.description.substring(0, 240) : "";

        const item = {
          id,
          title: raw.title,
          canonical_url: normalizedLink,
          source_name: source.name,
          source_url: source.homepage,
          source_type: source.source_type,
          published_at: new Date(raw.pubDate).toISOString(),
          fetched_at: new Date().toISOString(),
          category: source.category_defaults || "modelos",
          tags: [source.name.toLowerCase().replace(/\s+/g, '-')],
          excerpt,
          image_url: null,
          official_source: source.official,
          featured: false,
          language: source.language,
          status: "active"
        };

        newItems.push(item);
      }
    } catch (e) {
      console.error(`❌ Fallo en fuente ${source.name}: ${e.message}`);
      failed.push(`${source.name} (${e.message})`);
    }
  }

  // Mezclar con noticias existentes
  const allItemsMap = new Map();
  
  // Añadir las noticias existentes primero
  if (existingNews.items && Array.isArray(existingNews.items)) {
    for (const item of existingNews.items) {
      if (item.status === "active") {
        allItemsMap.set(item.canonical_url, item);
      }
    }
  }

  // Mezclar noticias nuevas (deduplicando por canonical_url)
  for (const item of newItems) {
    if (allItemsMap.has(item.canonical_url)) {
      dupCount++;
    } else {
      allItemsMap.set(item.canonical_url, item);
      newCount++;
    }
  }

  // Filtrar por retención (últimos 60 días)
  const retentionCutoff = Date.now() - (MAX_DAYS_RETENTION * 24 * 60 * 60 * 1000);
  
  const sortedAll = Array.from(allItemsMap.values())
    .filter(item => {
      const pubTime = new Date(item.published_at).getTime();
      return pubTime >= retentionCutoff;
    })
    .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());

  const sourceCountTracker = {};
  const maxPerSource = Math.floor(MAX_NEWS_LIMIT * 0.4); // Máximo 80 noticias por fuente (40% de 200)
  const sortedItems = [];

  for (const item of sortedAll) {
    if (sortedItems.length >= MAX_NEWS_LIMIT) break;
    const sName = item.source_name;
    const currentCount = sourceCountTracker[sName] || 0;
    if (currentCount < maxPerSource) {
      sortedItems.push(item);
      sourceCountTracker[sName] = currentCount + 1;
    }
  }

  // Si todas las fuentes fallan y no se ha obtenido nada, no sobrescribimos con vacío
  if (processed.length === 0 && failed.length > 0) {
    console.error("❌ Todas las fuentes han fallado. Conservando el archivo news.json anterior.");
    process.exit(1);
  }

  const updatedNews = {
    updated_at: new Date().toISOString(),
    items: sortedItems
  };

  writeFileSync(newsPath, JSON.stringify(updatedNews, null, 2), 'utf-8');

  console.log("\n📋 INFORME FINAL DE RASTREO:");
  console.log("----------------------------");
  console.log(`- Fuentes procesadas con éxito: ${processed.length}`);
  console.log(`- Fuentes fallidas: ${failed.length}`);
  if (failed.length > 0) {
    failed.forEach(f => console.log(`  * ${f}`));
  }
  console.log(`- Nuevas noticias añadidas: ${newCount}`);
  console.log(`- Duplicados descartados: ${dupCount}`);
  console.log(`- Elementos rechazados (calidad): ${rejectedCount}`);
  console.log(`- Total de noticias guardadas: ${sortedItems.length}`);
  console.log(`- Fecha de actualización: ${updatedNews.updated_at}`);
  console.log("----------------------------\n");
}

run();
