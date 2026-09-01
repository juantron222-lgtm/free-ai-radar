/**
 * Extracción de hechos de una página oficial.
 *
 * La regla que hace honesto todo lo que viene después: **el hecho es la frase
 * del fabricante**. Aquí no se resume, no se interpreta y no se deduce — se
 * localiza la oración en la que la empresa dice algo, y esa oración se guarda
 * literal. Lo que el sistema construye luego son conectores; lo que afirma,
 * siempre, es una cita.
 *
 * Eso es lo que separa esto de «un cron que escribe prosa a ciegas». Un
 * borrador generado desde aquí puede decir que algo está disponible sólo si
 * existe una frase del fabricante que lo dice, y esa frase viaja pegada a la
 * afirmación hasta la mesa de edición.
 *
 * Y al revés: cuando la página no dice algo, aquí no aparece. Un campo vacío se
 * queda vacío. La ausencia nunca se convierte en un «no».
 */

/* ------------------------------------------------------------------ texto -- */

const BLOQUES_IGNORADOS =
  /<(script|style|noscript|svg|nav|header|footer|form|aside)\b[^>]*>[\s\S]*?<\/\1>/gi;

/**
 * Texto legible de la página.
 *
 * Se quitan primero los bloques que nunca contienen la noticia. Sin eso, el
 * menú de navegación de un fabricante —que suele incluir «Pricing» y «Free»—
 * acabaría produciendo citas sobre precios que nadie ha escrito en el artículo.
 */
export function toText(html) {
  return String(html ?? '')
    .replace(BLOQUES_IGNORADOS, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|h[1-6]|section|article|br)>/gi, '. ')
    /*
     * Los atributos pueden contener «>» dentro de las comillas. Tailwind lo
     * hace constantemente (`class="[&>*]:hidden"`), y un `/<[^>]+>/` corta ahí
     * y deja el resto del atributo suelto en el texto. Eso llegaba a las citas:
     * «Eleven v3 is Now Generally Available &)]:tw-overflow-x-hidden">». Una
     * cita con marcado dentro ya no es la frase del fabricante.
     */
    .replace(/<[a-zA-Z!/][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Oraciones, con el ruido de maquetación descartado. */
export function sentences(text) {
  return String(text ?? '')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length >= 25 && s.length <= 400)
    .filter((s) => /[a-záéíóúñ]/i.test(s))
    /*
     * Defensa en profundidad: si algo de marcado sobrevive al limpiador, la
     * frase se descarta en lugar de citarse. Preferimos no tener cita a tener
     * una que el fabricante no escribió así.
     */
    .filter((s) => !/tw-|[[\]{}]|:hover|="|">|\bclass=|\bstyle=/.test(s));
}

/* ------------------------------------------------------------------ fecha -- */

function meta(html, ...nombres) {
  for (const nombre of nombres) {
    const patron = new RegExp(
      `<meta[^>]+(?:property|name|itemprop)=["']${nombre}["'][^>]+content=["']([^"']+)["']`,
      'i'
    );
    const alterno = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name|itemprop)=["']${nombre}["']`,
      'i'
    );
    const m = html.match(patron) ?? html.match(alterno);
    if (m) return m[1];
  }
  return '';
}

function isoDay(valor) {
  if (!valor) return null;
  const t = Date.parse(valor);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * La fecha, y de dónde sale.
 *
 * Se buscan sólo sitios donde la fecha es un dato declarado por la página, no
 * texto suelto que se le parezca: metadatos, JSON-LD y `<time datetime>`. La
 * regla editorial dice que la fecha tiene que aparecer en la propia página; un
 * patrón sobre el cuerpo encontraría la fecha de cualquier cosa mencionada de
 * pasada y la presentaría como fecha del anuncio.
 */
export function extractDate(html) {
  const candidatos = [
    { via: 'meta article:published_time', valor: meta(html, 'article:published_time') },
    { via: 'meta datePublished', valor: meta(html, 'datePublished', 'publish_date') },
    { via: 'JSON-LD datePublished', valor: html.match(/"datePublished"\s*:\s*"([^"]+)"/)?.[1] },
    { via: 'time[datetime]', valor: html.match(/<time[^>]+datetime=["']([^"']+)["']/i)?.[1] },
  ];

  for (const c of candidatos) {
    const dia = isoDay(c.valor);
    if (dia) return { value: dia, quote: `${c.via}: ${c.valor}`, via: c.via };
  }

  return null;
}

/* ----------------------------------------------------------------- frases -- */

/**
 * Marcadores de disponibilidad, del más concluyente al más débil.
 *
 * El orden importa porque decide qué frase se cita: una página que dice a la
 * vez «generally available» y «coming soon a más regiones» está diciendo dos
 * cosas, y la que describe el estado del producto hoy es la primera.
 */
const DISPONIBILIDAD = [
  {
    availability: 'deprecated',
    eventType: 'retirada',
    test: /\b(has been (removed|deprecated|retired)|we are (removing|deprecating|sunsetting)|no longer available|end of life)\b/i,
  },
  {
    availability: 'available',
    eventType: 'disponibilidad-general',
    test: /\b(generally available|now generally available)\b/i,
  },
  {
    /*
     * Preview se comprueba antes que la disponibilidad genérica a propósito.
     * «is available in public preview starting today» contiene las dos cosas, y
     * la que describe el estado real del producto es la preview: leerla como
     * disponible sería justo el error que el campo `availability` existe para
     * impedir.
     */
    availability: 'preview',
    eventType: 'preview-beta',
    test: /\b(public preview|in preview|research preview|open beta|in beta|early access)\b/i,
  },
  {
    availability: 'available',
    eventType: 'lanzamiento',
    /*
     * «starting today» y «from today» quedaron fuera: se enganchan a lo que
     * tengan delante y por sí solos no dicen que algo esté disponible. Una
     * preview que empieza hoy sigue siendo una preview.
     */
    test: /\b(is now available|are now available|available today|available now|now available|rolling out today)\b/i,
  },
  {
    availability: 'limited',
    eventType: 'lanzamiento',
    test: /\b(limited access|limited availability|available to .{0,40}(customers|subscribers|users) (only|on)|rolling out (gradually|progressively)|select (users|customers))\b/i,
  },
  {
    availability: 'announced',
    eventType: 'anuncio',
    test: /\b(coming soon|will be available|join the waitlist|sign up for early access|later this year|in the coming (weeks|months))\b/i,
  },
];

const PRECIO =
  /(\$\s?\d[\d,.]*|\d[\d,.]*\s?(?:USD|EUR|dollars|euros)\b|per (?:million|1,?000|1K|second|image|page|month|seat)\b)/i;

/**
 * Gratuidad. Sólo se citan frases que la afirman explícitamente.
 *
 * No hay patrón para «no es gratis», y es deliberado: la regla editorial dice
 * que el silencio de la fuente no se convierte en un «no». Si la página no
 * habla de acceso gratuito, aquí no sale nada y el campo queda `unverified`.
 */
const GRATUIDAD =
  /\b(free tier|for free|at no cost|free of charge|free plan|free to (use|try)|entirely free|no credit card|free credits|daily credits|free quota)\b/i;

const LICENCIA =
  /\b(open[- ]weights?|open[- ]source|Apache[- ]?2(?:\.0)?|MIT licen[cs]e|available on Hugging Face|weights are|download the (weights|model))\b/i;

/**
 * Clasifica cualquier texto en evidencia con su procedencia.
 *
 * Se usa igual sobre el cuerpo de un artículo que sobre la descripción de una
 * entrada de feed, y esa simetría es la que hace cumplible la regla de que un
 * feed sólo puede autorizar lo que contiene: al feed se le aplican exactamente
 * los mismos patrones, sobre exactamente su propio texto, y lo que salga lleva
 * escrito de dónde viene.
 */
export function classifyText(texto, { sourceUrl, via }) {
  const frases = sentences(texto);
  const evidencia = [];

  for (const marcador of DISPONIBILIDAD) {
    const frase = frases.find((f) => marcador.test.test(f));
    if (frase) {
      evidencia.push({
        factType: 'availability',
        value: marcador.availability,
        eventType: marcador.eventType,
        quote: frase,
        sourceUrl,
        via,
      });
      break;
    }
  }

  for (const quote of frases.filter((f) => PRECIO.test(f)).slice(0, 2)) {
    evidencia.push({ factType: 'pricing', value: null, quote, sourceUrl, via });
  }
  for (const quote of frases.filter((f) => GRATUIDAD.test(f)).slice(0, 2)) {
    evidencia.push({ factType: 'free-access', value: 'yes', quote, sourceUrl, via });
  }
  for (const quote of frases.filter((f) => LICENCIA.test(f)).slice(0, 2)) {
    evidencia.push({ factType: 'licence', value: null, quote, sourceUrl, via });
  }

  return evidencia;
}

function citar(frases, patron) {
  return frases.filter((f) => patron.test(f)).slice(0, 3);
}

/**
 * Todo lo que la página sostiene, con su cita.
 *
 * Devuelve estructura vacía en lugar de fallar cuando no encuentra algo: no
 * haber encontrado disponibilidad es un resultado, y el que decide que la
 * noticia no es publicable todavía.
 */
function decodeEntities(texto) {
  return String(texto ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

/**
 * Un índice no es una noticia.
 *
 * Descubierto leyendo páginas reales: `elevenlabs.io/blog` responde 200, se lee
 * perfectamente y contiene frases como «Eleven v3 is Now Generally Available».
 * El extractor las encontraba y verificaba el índice entero como si fuera el
 * anuncio — el mismo error que la fase editorial ya había corregido a mano
 * cuando cuatro noticias de Mistral apuntaban todas a `mistral.ai/news`.
 *
 * Lo que separa un índice de un artículo es la profundidad de la ruta: un
 * anuncio vive en `/news/algo`, y `/blog` es la portada de la sección. Con
 * menos de dos segmentos, la cita no puede atribuirse a una historia concreta.
 */
export function looksLikeIndex(url) {
  try {
    const segmentos = new URL(url).pathname.split('/').filter(Boolean);
    if (segmentos.length >= 2) return null;
    if (segmentos.length === 0) return 'la url es la portada del sitio, no un anuncio';
    return `la url es un índice de sección ("/${segmentos[0]}"), no un anuncio concreto`;
  } catch {
    return 'la url no se puede interpretar';
  }
}

export function extractFacts(html, url) {
  const texto = toText(html);
  const frases = sentences(texto);

  const fecha = extractDate(html);
  const titulo = decodeEntities(meta(html, 'og:title', 'twitter:title'));

  let disponibilidad = null;
  for (const marcador of DISPONIBILIDAD) {
    const frase = frases.find((f) => marcador.test.test(f));
    if (frase) {
      disponibilidad = {
        availability: marcador.availability,
        eventType: marcador.eventType,
        quote: frase,
      };
      break;
    }
  }

  return {
    url,
    title: titulo,
    publishedAt: fecha,
    availability: disponibilidad,
    pricing: citar(frases, PRECIO),
    freePlan: citar(frases, GRATUIDAD),
    licence: citar(frases, LICENCIA),
    sentenceCount: frases.length,
  };
}

/**
 * Señales de que no hemos leído la página, aunque haya respondido 200.
 *
 * Un muro de acceso, un aviso de bot o una página que sólo trae el esqueleto de
 * una aplicación JavaScript devuelven 200 y no contienen la noticia. Tratar eso
 * como «leído» es la forma más silenciosa de inventar: el extractor no
 * encontraría nada y el sistema concluiría que la fuente no dice nada, cuando
 * lo que pasa es que no la hemos visto.
 */
export function looksUnreadable(html) {
  const texto = toText(html);

  if (texto.length < 400) return 'la página apenas trae texto: probablemente se renderiza con JavaScript';
  if (/\b(enable javascript|please enable js|requires javascript)\b/i.test(texto)) {
    return 'la página exige JavaScript para mostrar el contenido';
  }
  if (/\b(sign in to continue|log in to continue|create an account to)\b/i.test(texto)) {
    return 'la página exige inicio de sesión';
  }
  if (/\b(verify you are human|checking your browser|cloudflare|captcha|access denied)\b/i.test(texto)) {
    return 'la página está tras una comprobación anti-bot';
  }

  return null;
}
