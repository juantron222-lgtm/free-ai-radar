/**
 * De quién es el producto del que habla una página.
 *
 * El problema que resuelve, encontrado auditando borradores reales: ComfyUI
 * publicó «FLUX 3 is now available via Partner Nodes» y el sistema lo convirtió
 * en un lanzamiento global de FLUX 3, con `availability: available`. Pero FLUX
 * es de Black Forest Labs. Lo que ComfyUI puede acreditar es que FLUX está
 * disponible **en ComfyUI**; sobre el lanzamiento del modelo, ComfyUI es un
 * tercero, por muy oficial que sea su propio blog.
 *
 * La distinción no es formal. `isVendorSource` seguía dando verde —comfy.org
 * publicando en comfy.org— porque comprueba que la página pertenezca a quien la
 * firma, no que quien la firma sea el dueño de lo que anuncia. Son dos
 * preguntas y hacían falta las dos.
 *
 * Cuando el que publica no es el fabricante, la noticia sigue siendo publicable:
 * lo que cambia es su alcance. Deja de ser «X se ha lanzado» y pasa a ser «X ya
 * se puede usar en esta plataforma», que es exactamente lo que la fuente
 * demuestra.
 */

/**
 * Familias de producto y el dominio de quien las fabrica.
 *
 * Deliberadamente corta y explícita. Un mapa que intentara cubrir el sector
 * entero envejecería mal y daría una falsa sensación de cobertura; esto sólo
 * necesita acertar en los casos donde una plataforma anuncia el producto de
 * otro, que son los que producen la afirmación exagerada.
 */
export const PRODUCT_VENDOR = [
  { familia: /\bflux(?:\s*[\d.]+)?\b/i, fabricante: 'bfl.ai', nombre: 'Black Forest Labs', vertical: 'imagen' },
  { familia: /\bseedance\b/i, fabricante: 'bytedance.com', nombre: 'ByteDance', vertical: 'video' },
  { familia: /\bseedream\b/i, fabricante: 'bytedance.com', nombre: 'ByteDance', vertical: 'imagen' },
  { familia: /\b(gpt-?[\d.]+|chatgpt|codex|sora)\b/i, fabricante: 'openai.com', nombre: 'OpenAI' },
  { familia: /\bclaude\b/i, fabricante: 'anthropic.com', nombre: 'Anthropic' },
  { familia: /\b(gemini|gemma|veo\s*\d|imagen\s*\d|lyria)\b/i, fabricante: 'google.com', nombre: 'Google' },
  { familia: /\bllama\s*[\d.]*\b/i, fabricante: 'meta.com', nombre: 'Meta' },
  { familia: /\bqwen[\d.\w-]*\b/i, fabricante: 'alibaba.com', nombre: 'Alibaba' },
  { familia: /\bmistral\w*|magistral|devstral\b/i, fabricante: 'mistral.ai', nombre: 'Mistral' },
  { familia: /\bdeepseek\w*\b/i, fabricante: 'deepseek.com', nombre: 'DeepSeek' },
  { familia: /\bnemotron\b/i, fabricante: 'nvidia.com', nombre: 'NVIDIA' },
  { familia: /\bwan\s*[\d.]+\b/i, fabricante: 'alibaba.com', nombre: 'Alibaba', vertical: 'video' },
  { familia: /\bkling\b/i, fabricante: 'kuaishou.com', nombre: 'Kuaishou', vertical: 'video' },
  { familia: /\bhunyuan\b/i, fabricante: 'tencent.com', nombre: 'Tencent', vertical: 'video' },
];

/** Dominio registrable, para comparar `blogs.nvidia.com` con `nvidia.com`. */
function registrable(host) {
  const limpio = String(host ?? '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0]
    .replace(/^www\./, '');
  const partes = limpio.split('.');
  return partes.length <= 2 ? limpio : partes.slice(-2).join('.');
}

/**
 * Qué alcance puede acreditar esta fuente sobre este titular.
 *
 * - `first-party`: quien publica fabrica lo que anuncia. Puede acreditar el
 *   lanzamiento.
 * - `integration`: quien publica es una plataforma hablando del producto de
 *   otro. Sólo puede acreditar disponibilidad en su propia plataforma.
 * - `unknown`: no se reconoce ningún producto con dueño conocido, así que no
 *   hay motivo para recortar el alcance. Es el caso normal.
 */
export function detectScope(title, publisher) {
  const texto = String(title ?? '');
  const casa = registrable(publisher);

  for (const { familia, fabricante, nombre, vertical } of PRODUCT_VENDOR) {
    const encontrado = texto.match(familia);
    if (!encontrado) continue;

    if (registrable(fabricante) === casa) {
      return { scope: 'first-party', product: encontrado[0], vendor: nombre, platform: null, vertical: vertical ?? null };
    }

    return {
      scope: 'integration',
      product: encontrado[0],
      vendor: nombre,
      platform: casa,
      vertical: vertical ?? null,
    };
  }

  return { scope: 'unknown', product: null, vendor: null, platform: null, vertical: null };
}

/**
 * Recorta la disponibilidad al alcance que la fuente sostiene.
 *
 * Una integración nunca es `available` a secas: que FLUX funcione en ComfyUI no
 * dice nada de si FLUX está disponible en general, ni de si sigue estándolo
 * mañana en otro sitio. `limited` es exactamente eso — se puede usar, con un
 * límite que la propia noticia nombra.
 *
 * El tipo de evento también cambia: no es un lanzamiento, es una integración
 * que se añade. Y `disponibilidad-general` queda descartada de plano, porque es
 * la afirmación más fuerte que existe y un tercero no puede hacerla.
 */
export function narrowToScope({ scope, availability, eventType }) {
  if (scope !== 'integration') return { availability, eventType, narrowed: false };

  const recortada = availability === 'available' || availability === null ? 'limited' : availability;
  const evento = eventType === 'lanzamiento' || eventType === 'disponibilidad-general'
    ? 'actualizacion'
    : eventType;

  return {
    availability: recortada,
    eventType: evento,
    narrowed: recortada !== availability || evento !== eventType,
  };
}
