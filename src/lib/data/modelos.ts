import type { Tool } from '@lib/domain/tool';
import type { Capability } from '@lib/domain/taxonomy';
import { getAllTools } from './catalog';
import {
  ACCESS_FILTERS,
  FACT_FILTERS,
  capabilityFilter,
  countIn,
  has,
  ranked,
  type CategoryFilter,
} from './category-page';

/**
 * Modelos: qué puedo usar sin pagar, y por cuál de las tres puertas.
 *
 * La vertical vieja se llamaba `modelos-open-source` y esa era su definición,
 * que además no cumplía: dentro había un runtime (Ollama), una aplicación
 * (LM Studio), un hub (Hugging Face Spaces), un agente (Gemini CLI) y los
 * modelos de vídeo y de audio, que pertenecen a sus propias verticales.
 *
 * Lo que ordena esta página no es si el modelo es abierto, sino **por dónde se
 * llega a él**. Son tres puertas independientes —un chat, una API, los pesos—
 * y la trampa de esta vertical es heredar una respuesta de otra: que ChatGPT
 * tenga plan gratuito no hace gratis la API de GPT, y que los pesos de Llama
 * sean descargables no hace gratis ningún endpoint.
 */

/**
 * Qué entra.
 *
 * `kind: 'model'` deja fuera las aplicaciones, las plataformas y los runtimes:
 * Ollama es la forma de ejecutar un modelo, no un modelo. Y `text-generation`
 * deja fuera los modelos de las otras verticales —Whisper transcribe, Wan 2.2
 * genera vídeo, Kokoro habla—, que son modelos pero no responden a lo que se
 * viene a preguntar aquí.
 */
export function modelTools(): Tool[] {
  return getAllTools().filter((t) => t.kind === 'model' && has(t, 'text-generation'));
}

/** Lo que una tarjeta de modelo puede enseñar, en orden. */
export const MODEL_CAPABILITIES: readonly Capability[] = [
  'reasoning',
  'code-generation',
  'vision',
  'audio-input',
  'video-understanding',
  'tool-use',
  'text-generation',
  'model-download',
  'api',
];

export const modelCapabilityCount = (tool: Tool): number => countIn(tool, MODEL_CAPABILITIES);

// ---------------------------------------------------------------------------
// Las tres puertas
// ---------------------------------------------------------------------------

/**
 * Cada puerta se pregunta por separado, y ninguna se deduce de otra.
 *
 * Es la regla entera de esta vertical en tres funciones. Gemini Flash tiene
 * capa gratuita de API y Gemini Pro no, siendo el mismo fabricante y la misma
 * semana; Qwen publica dos modelos el mismo mes con licencias distintas. Nada
 * de esto se puede inferir: se lee o se queda sin afirmar.
 */
export const enChatGratis = (tools: readonly Tool[]): Tool[] =>
  tools.filter((t) => t.access.chat === 'yes' && t.access.chatFree === 'yes');

export const conApiGratis = (tools: readonly Tool[]): Tool[] =>
  ranked(
    tools.filter((t) => t.access.apiFree === 'yes'),
    (t) => modelCapabilityCount(t) * 10 + (t.access.weights === 'yes' ? 5 : 0)
  );

export const conPesosAbiertos = (tools: readonly Tool[]): Tool[] =>
  ranked(
    tools.filter((t) => t.access.weights === 'yes'),
    (t) => modelCapabilityCount(t) * 10 + (t.openSource === 'yes' ? 12 : 0)
  );

// ---------------------------------------------------------------------------
// Bloques por intención
// ---------------------------------------------------------------------------

/** Un bloque necesita tres modelos válidos. Menos es un hueco con título. */
export const MIN_BLOQUE = 3;

export function withCapability(tools: readonly Tool[], capability: Capability): Tool[] {
  return ranked(
    tools.filter((t) => has(t, capability)),
    (t) => modelCapabilityCount(t) * 10 + (t.access.weights === 'yes' ? 6 : 0)
  );
}

/**
 * Modelos pequeños que arrancan en un equipo normal.
 *
 * El listón no es el número de parámetros, que cada fabricante cuenta a su
 * manera —Gemma habla de «efectivos», Llama de «activos sobre totales»—, sino
 * `startEffort`: `install` significa que se instala y ya. `technical` significa
 * que hace falta infraestructura, y ahí es donde están los de 700.000 millones.
 */
export const pequenosEnLocal = (tools: readonly Tool[]): Tool[] =>
  ranked(
    tools.filter((t) => t.hosting !== 'cloud' && t.startEffort === 'install'),
    (t) => modelCapabilityCount(t) * 10
  );

/** Todo lo que se puede consumir por API, cueste lo que cueste. */
export const porApi = (tools: readonly Tool[]): Tool[] =>
  ranked(
    tools.filter((t) => t.access.api === 'yes'),
    (t) => modelCapabilityCount(t) * 10 + (t.access.apiFree === 'yes' ? 20 : 0)
  );

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------

/** Un filtro por cada puerta, que es lo que se viene a preguntar. */
const accessFilter = (
  id: string,
  label: string,
  hint: string,
  matches: (tool: Tool) => boolean
): CategoryFilter => ({ id, label, hint, matches });

export const CANDIDATE_FILTERS: readonly CategoryFilter[] = [
  accessFilter('api-gratis', 'API gratuita', 'Tiene capa gratuita de API documentada.', (t) => t.access.apiFree === 'yes'),
  accessFilter('pesos', 'Pesos abiertos', 'Los pesos se pueden descargar.', (t) => t.access.weights === 'yes'),
  accessFilter('osi', 'Licencia OSI', 'Apache 2.0, MIT o equivalente, sin condiciones añadidas.', (t) => t.openSource === 'yes'),
  accessFilter('chat-gratis', 'Gratis en web', 'Se puede usar sin pagar en una aplicación de chat.', (t) => t.access.chatFree === 'yes'),
  accessFilter('api', 'Por API', 'Se puede consumir por API.', (t) => t.access.api === 'yes'),
  ...ACCESS_FILTERS,
  capabilityFilter('razonamiento', 'Razonamiento', 'Tiene un modo de pensamiento documentado.', 'reasoning'),
  capabilityFilter('codigo', 'Código', 'Su fabricante lo posiciona para programar.', 'code-generation'),
  capabilityFilter('vision', 'Entiende imágenes', 'Acepta imágenes como entrada.', 'vision'),
  capabilityFilter('audio', 'Entiende audio', 'Acepta audio como entrada.', 'audio-input'),
  capabilityFilter('video', 'Entiende vídeo', 'Acepta vídeo como entrada.', 'video-understanding'),
  capabilityFilter('herramientas', 'Usa herramientas', 'Llamada a herramientas documentada.', 'tool-use'),
  ...FACT_FILTERS,
];
