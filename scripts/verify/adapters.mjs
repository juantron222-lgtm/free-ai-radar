import { classifyText, looksLikeIndex, looksUnreadable, toText } from './extract.mjs';

/**
 * Adaptadores de fuentes oficiales.
 *
 * El problema que resuelven: los dos fabricantes con más volumen no se dejan
 * leer el artículo. `openai.com` devuelve 403 a un lector automático y
 * `blog.google` sirve un esqueleto que se rellena con JavaScript. Con sólo
 * HTML, Newsroom se queda ciego justo donde más pasa.
 *
 * Pero los dos publican un feed oficial, y un feed es un artefacto del propio
 * fabricante tanto como su artículo: lo sirve su dominio y lo escribe él. Lo
 * que cambia no es la legitimidad de la fuente, es **cuánto contiene**.
 *
 * De ahí la regla que gobierna este módulo: un feed puede autorizar únicamente
 * lo que aparece literalmente en su propia entrada. Se le aplican exactamente
 * los mismos clasificadores que al HTML, sobre exactamente su texto, y toda
 * evidencia sale marcada con `via` y con la URL de la que se sacó. Un feed que
 * sólo trae titular y fecha autoriza titular y fecha; ni una palabra más.
 *
 * Cada pieza de evidencia lleva siempre las cuatro cosas: de dónde salió
 * (`sourceUrl`), cuándo (`publishedAt` cuando aplica), qué dice literalmente
 * (`quote`) y de qué clase de hecho se trata (`factType`).
 */

/* ------------------------------------------------------------- estrategia -- */

/**
 * Qué hacer con cada fabricante, y por qué.
 *
 * `feed` es la vía cuando el artículo no se puede leer; `html` cuando sí. No es
 * una preferencia estética: es el resultado de leer las páginas en vivo y
 * anotar cuál respondía.
 */
export const SOURCE_STRATEGY = {
  'openai.com': {
    feed: 'https://openai.com/news/rss.xml',
    prefer: 'feed',
    note: 'los artículos devuelven 403 a un lector automático; el feed sí responde',
  },
  'blog.google': {
    feed: 'https://blog.google/technology/ai/rss/',
    prefer: 'feed',
    note: 'los artículos se renderizan con JavaScript; el feed trae texto',
  },
  'anthropic.com': {
    feed: null,
    prefer: 'html',
    note: 'el HTML se lee bien y no publica feed en una ruta estable',
  },
  'elevenlabs.io': {
    feed: null,
    prefer: 'html',
    note: 'el HTML del artículo se lee bien',
  },
  'huggingface.co/blog': {
    feed: 'https://huggingface.co/blog/feed.xml',
    prefer: 'html',
    note: 'el HTML se lee; el feed queda como respaldo',
  },
};

export function strategyFor(publisher) {
  return (
    SOURCE_STRATEGY[publisher] ??
    SOURCE_STRATEGY[String(publisher).split('/')[0]] ?? {
      feed: null,
      prefer: 'html',
      note: 'sin adaptador declarado: se intenta leer el artículo',
    }
  );
}

/* ------------------------------------------------------------------ feeds -- */

function unwrap(valor) {
  return String(valor ?? '')
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#8217;|&#39;|&#x27;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(bloque, nombre) {
  const m = bloque.match(new RegExp(`<${nombre}[^>]*>([\\s\\S]*?)</${nombre}>`, 'i'));
  return m ? unwrap(m[1]) : '';
}

function isoDay(valor) {
  if (!valor) return null;
  const t = Date.parse(valor);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

/**
 * Entradas de un feed RSS o Atom.
 *
 * Se soportan las dos formas porque los fabricantes usan las dos, y la
 * diferencia es puramente sintáctica: `item`/`pubDate`/`description` frente a
 * `entry`/`published`/`summary`.
 */
export function parseFeed(xml, feedUrl) {
  const texto = String(xml ?? '');
  const bloques = [
    ...texto.matchAll(/<item[\s\S]*?<\/item>/gi),
    ...texto.matchAll(/<entry[\s\S]*?<\/entry>/gi),
  ].map((m) => m[0]);

  const entradas = [];

  for (const bloque of bloques) {
    const title = tag(bloque, 'title');

    const link =
      tag(bloque, 'link') ||
      unwrap(bloque.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1] ?? '') ||
      tag(bloque, 'guid');

    const fecha =
      tag(bloque, 'pubDate') || tag(bloque, 'published') || tag(bloque, 'updated') || '';

    /* `content:encoded` primero: cuando existe trae el cuerpo entero. */
    const cuerpo =
      tag(bloque, 'content:encoded') ||
      tag(bloque, 'description') ||
      tag(bloque, 'summary') ||
      tag(bloque, 'content') ||
      '';

    if (!title || !link) continue;

    entradas.push({
      title,
      url: link,
      publishedAt: isoDay(fecha),
      rawDate: fecha,
      body: cuerpo,
      feedUrl,
    });
  }

  return entradas;
}

/**
 * Evidencia sacada de una entrada de feed.
 *
 * La fecha y el titular salen de campos que el fabricante declara, así que se
 * citan por su campo. Todo lo demás pasa por el mismo clasificador que el HTML
 * y sólo aparece si la entrada lo dice con sus palabras.
 */
export function evidenceFromEntry(entry) {
  const evidencia = [];

  if (entry.publishedAt) {
    evidencia.push({
      factType: 'date',
      value: entry.publishedAt,
      quote: `<pubDate>: ${entry.rawDate}`,
      sourceUrl: entry.feedUrl,
      via: 'feed',
      publishedAt: entry.publishedAt,
    });
  }

  if (entry.title) {
    evidencia.push({
      factType: 'title',
      value: entry.title,
      quote: entry.title,
      sourceUrl: entry.feedUrl,
      via: 'feed',
      publishedAt: entry.publishedAt ?? null,
    });
  }

  /*
   * El cuerpo de la entrada se clasifica igual que un artículo. Si la
   * descripción dice «is now available», eso es el fabricante diciéndolo en su
   * propio feed y vale como evidencia; si no lo dice, aquí no sale nada, y el
   * feed no habrá autorizado una disponibilidad que no contiene.
   */
  const texto = `${entry.title}. ${entry.body}`;
  for (const item of classifyText(texto, { sourceUrl: entry.feedUrl, via: 'feed' })) {
    evidencia.push({ ...item, publishedAt: entry.publishedAt ?? null });
  }

  return evidencia;
}

/* ------------------------------------------------------------------- html -- */

/**
 * Evidencia sacada del HTML del artículo, o el motivo de que no haya ninguna.
 *
 * Devuelve siempre las dos cosas para que el bloqueo sea explicable: quien
 * revise en la mesa tiene que ver «403» o «se renderiza con JavaScript», no un
 * hueco.
 */
export function evidenceFromHtml(html, url) {
  const indice = looksLikeIndex(url);
  if (indice) return { evidence: [], blocked: indice };

  const ilegible = looksUnreadable(html);
  if (ilegible) return { evidence: [], blocked: ilegible };

  const evidencia = [];

  const fecha = extractDateEvidence(html, url);
  if (fecha) evidencia.push(fecha);

  evidencia.push(...classifyText(toText(html), { sourceUrl: url, via: 'html' }));

  return { evidence: evidencia, blocked: null };
}

function extractDateEvidence(html, url) {
  const fuentes = [
    ['meta article:published_time', /<meta[^>]+article:published_time["'][^>]+content=["']([^"']+)["']/i],
    ['JSON-LD datePublished', /"datePublished"\s*:\s*"([^"]+)"/],
    ['time[datetime]', /<time[^>]+datetime=["']([^"']+)["']/i],
  ];

  for (const [via, patron] of fuentes) {
    const valor = html.match(patron)?.[1];
    const dia = isoDay(valor);
    if (dia) {
      return {
        factType: 'date',
        value: dia,
        quote: `${via}: ${valor}`,
        sourceUrl: url,
        via: 'html',
        publishedAt: dia,
      };
    }
  }

  return null;
}

/* ------------------------------------------------------------ recolección -- */

/**
 * Reúne evidencia de las vías que la estrategia del fabricante permita.
 *
 * Se intentan las dos cuando tiene sentido: el feed da fecha y titular fiables
 * incluso cuando el artículo está bloqueado, y el HTML da el cuerpo entero
 * cuando se deja leer. Si las dos aportan, se quedan las dos, cada una con su
 * `sourceUrl`, y el borrador podrá citar de una u otra sabiendo cuál es cuál.
 */
export async function gatherEvidence(candidate, { fetchPage, fetchFeed = null }) {
  const estrategia = strategyFor(candidate.publisher);
  const url = candidate.url ?? `https://${candidate.canonicalUrl}`;
  const evidencia = [];
  const notas = [];

  if (estrategia.feed && fetchFeed) {
    try {
      const xml = await fetchFeed(estrategia.feed);
      const entradas = parseFeed(xml, estrategia.feed);
      const entrada = entradas.find((e) => mismaHistoria(e.url, url));

      if (entrada) {
        evidencia.push(...evidenceFromEntry(entrada));
        notas.push(`feed oficial: ${estrategia.feed}`);
      } else {
        notas.push(`la entrada no está en ${estrategia.feed}`);
      }
    } catch (error) {
      notas.push(`feed ilegible: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  let bloqueoHtml = null;

  /*
   * El índice se rechaza antes de pedir la página, no después. Descargarlo
   * primero sería inofensivo para el resultado pero no para el fabricante: es
   * una petición que sabemos de antemano que no vamos a poder usar.
   */
  const indice = looksLikeIndex(url);
  if (indice) {
    bloqueoHtml = indice;
  } else {
    try {
      const respuesta = await fetchPage(url);
      if (!respuesta.ok) {
        bloqueoHtml = `el artículo respondió ${respuesta.status}`;
      } else {
        const { evidence, blocked } = evidenceFromHtml(respuesta.body, url);
        if (blocked) bloqueoHtml = blocked;
        else {
          evidencia.push(...evidence);
          notas.push('artículo leído');
        }
      }
    } catch (error) {
      bloqueoHtml = error instanceof Error ? error.message : String(error);
    }
  }

  if (bloqueoHtml) notas.push(`artículo no leído: ${bloqueoHtml}`);

  return { evidence: evidencia, notes: notas, htmlBlocked: bloqueoHtml, strategy: estrategia, url };
}

/** Dos URLs son la misma historia si coinciden en host y ruta. */
function mismaHistoria(a, b) {
  const norm = (u) => {
    try {
      const p = new URL(u);
      return `${p.hostname.replace(/^www\./, '')}${p.pathname.replace(/\/+$/, '')}`.toLowerCase();
    } catch {
      return String(u).toLowerCase();
    }
  };
  return norm(a) === norm(b);
}
