import { getTool } from './catalog';

/**
 * Las comparaciones que merece la pena hacer, escritas a mano.
 *
 * El comparador se abría con noventa y cuatro casillas y ningún punto de
 * partida. Elegir dos entre noventa y cuatro no es una tarea: es un examen
 * sobre un catálogo que quien llega todavía no conoce. Y la mayoría de los
 * pares posibles no dicen nada —comparar un transcriptor con un generador de
 * vídeo no responde a ninguna pregunta.
 *
 * Éstas se declaran una a una y con su motivo. No salen de ningún cálculo:
 * ni de la nota sobre 100, ni de popularidad, ni de nada que ordene. Cada una
 * existe porque contesta una duda concreta que alguien tiene antes de elegir,
 * y el `motivo` dice cuál. Si un día una deja de tener sentido, se borra.
 */

export interface ComparacionUtil {
  id: string;
  /** Cómo se anuncia. Los nombres salen del catálogo, no de aquí. */
  titulo: string;
  /** La duda que resuelve. Obligatorio: sin esto es un par al azar. */
  motivo: string;
  slugs: readonly string[];
}

export const COMPARACIONES: readonly ComparacionUtil[] = [
  {
    id: 'app-builders',
    titulo: 'Constructores de aplicaciones',
    motivo: 'Los tres prometen «de la idea a la app». Lo que cambia es cuánto te dejan hacer antes de pedirte la tarjeta.',
    slugs: ['lovable', 'bolt-new', 'v0-by-vercel'],
  },
  {
    id: 'copilotos',
    titulo: 'Autocompletado mientras escribes',
    motivo: 'Los dos copilotos de siempre, en la misma tabla: qué incluye cada capa gratuita y con qué límites.',
    slugs: ['github-copilot', 'amazon-q-developer'],
  },
  {
    id: 'terminal',
    titulo: 'Agentes de terminal',
    motivo: 'Tres formas de programar sin salir de la consola, y tres modelos de gratuidad muy distintos detrás.',
    slugs: ['claude-code', 'gemini-cli', 'aider'],
  },
  {
    id: 'imagen-sin-instalar',
    titulo: 'Generar imágenes sin instalar nada',
    motivo: 'La pregunta de siempre en Imagen: cuál se puede usar hoy en el navegador y qué te llevas —marca de agua incluida—.',
    slugs: ['ideogram', 'leonardo-ai', 'playground-ai', 'krea'],
  },
  {
    id: 'imagen-en-local',
    titulo: 'Imagen en tu propio equipo',
    motivo: 'Sin límites de créditos pero con tu tarjeta gráfica. Aquí lo que se compara es cuánto cuesta arrancar.',
    slugs: ['comfyui', 'fooocus', 'stable-diffusion-webui'],
  },
  {
    id: 'voz',
    titulo: 'Poner voz a un texto',
    motivo: 'Uno cerrado y dos con pesos abiertos: la diferencia está en la licencia y en el uso comercial, no en el resultado.',
    slugs: ['elevenlabs', 'kokoro', 'f5-tts'],
  },
  {
    id: 'transcribir',
    titulo: 'Transcribir audio',
    motivo: 'La misma tarea por dos caminos: un modelo que te descargas y una aplicación de edición que lo hace por ti.',
    slugs: ['whisper', 'descript'],
  },
  {
    id: 'video-navegador',
    titulo: 'Vídeo desde el navegador',
    motivo: 'Los planes gratuitos de vídeo son los más cambiantes del catálogo. Aquí, uno al lado del otro y con su fecha de comprobación.',
    slugs: ['klingai', 'hailuo-ai', 'luma-dream-machine', 'pika-labs'],
  },
  {
    id: 'modelos-rapidos',
    titulo: 'Modelos rápidos y baratos',
    motivo: 'Los pequeños de cada familia. Lo que decide no es el tamaño: es si puedes usarlos gratis y por dónde.',
    slugs: ['gemini-3-flash', 'claude-haiku-4-5', 'ministral', 'deepseek-v4-flash'],
  },
  {
    id: 'pesos-abiertos',
    titulo: 'Modelos que puedes descargarte',
    motivo: 'Pesos abiertos no es lo mismo que open source, y la licencia de cada uno permite cosas distintas.',
    slugs: ['llama-4', 'gemma-4', 'qwen3-27b', 'phi-4'],
  },
];

/**
 * Sólo las que siguen existiendo.
 *
 * Un enlace a una comparación con una ficha retirada lleva a media tabla sin
 * decir por qué. Que se caiga aquí, en silencio y con un test que lo cante,
 * es mejor que enseñar el hueco.
 */
export function comparacionesVigentes(): ComparacionUtil[] {
  return COMPARACIONES.filter((c) => c.slugs.every((s) => getTool(s) !== undefined));
}

/** El enlace compartible de una comparación declarada. */
export function urlDe(comparacion: ComparacionUtil): string {
  return `/comparar?t=${comparacion.slugs.join(',')}`;
}
