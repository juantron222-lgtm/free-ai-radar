#!/usr/bin/env node
/**
 * La vertical de modelos, verificada contra la documentación de cada fabricante.
 *
 * Todo lo que escribe este fichero salió de una página oficial abierta el 20 de
 * agosto de 2026. Donde la fuente no lo dice, el campo se queda sin afirmar.
 *
 * ---------------------------------------------------------------------------
 * EL CRITERIO: FICHA POR GAMA, NO POR VERSIÓN
 * ---------------------------------------------------------------------------
 *
 * Gemini tiene hoy catorce variantes de texto en su tabla de precios y Claude
 * cuatro modelos actuales más seis heredados. Una ficha por cada una haría el
 * catálogo inservible en tres meses; una ficha «GPT» que las mezclara todas
 * ocultaría justo lo que decide.
 *
 * La unidad es la **gama**: lo que el fabricante vende con precio, contexto y
 * posicionamiento propios —Flash frente a Pro, Opus frente a Sonnet frente a
 * Haiku—. Dentro de una gama, un número de versión nuevo no abre ficha: la
 * actualiza. La ficha nombra la versión que describe y lleva la fecha en que se
 * comprobó, que es lo que permite saber si ha caducado.
 *
 * Y no se publican todas las gamas de cada fabricante, sólo aquellas cuya
 * respuesta a «¿puedo usar esto y por dónde?» es distinta. Gemini Flash tiene
 * capa gratuita de API y Gemini Pro no: son dos fichas. GPT-5.6 Terra sólo se
 * diferencia de Sol en el precio, y ninguna de las dos es gratis por API: entra
 * una.
 *
 * ---------------------------------------------------------------------------
 * LO QUE ESTA VERTICAL OBLIGA A SEPARAR
 * ---------------------------------------------------------------------------
 *
 * **Cuatro herencias falsas**, y `access` existe para impedirlas:
 *
 *   - que ChatGPT tenga plan gratuito no hace gratis la API de GPT;
 *   - que la API de Gemini tenga capa gratuita no significa que la tengan todos
 *     sus modelos: `gemini-3.1-pro-preview` dice «Not available» en la misma
 *     tabla donde Flash dice «Available»;
 *   - que los pesos sean abiertos no hace gratis ningún endpoint alojado;
 *   - que exista una app de chat no dice qué modelo sirve su plan gratuito.
 *
 * **Pesos abiertos no es open source.** Qwen lo enseña dentro de una sola
 * familia: `Qwen3.8-27B` es Apache 2.0 y `Qwen3.8-2.4T-A95B` es «qwen3.8-max»,
 * una licencia propia. Llama 4 obliga a pedir permiso a Meta por encima de 700
 * millones de usuarios mensuales; Kimi K3 exige atribución a partir de 100
 * millones. Todo eso es `weights`, no `yes`.
 *
 * **Sin nota de inteligencia.** No hay puntuación, no hay ranking y no se
 * reconstruye ninguna arena. Lo que hay son frases del propio fabricante sobre
 * para qué sirve cada gama, y capacidades que su documentación demuestra.
 *
 * **Sin cifras de contexto en la tarjeta.** Están verificadas y se citan en la
 * prosa de cada ficha, atadas a la versión que las tiene. Como campo estarían
 * desactualizadas en un mes y mezclarían contexto de entrada con límite de
 * salida, que es el error clásico.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RUTA = resolve(ROOT, 'src/data/tools-v2.json');
const HOY = '2026-08-20';
const PROXIMA = '2026-11-18';

const catalogo = JSON.parse(readFileSync(RUTA, 'utf8'));
const porSlug = new Map(catalogo.map((t) => [t.slug, t]));

const PLANTILLA = {
  skillLevel: 'beginner',
  secondaryCategories: [],
  tags: [],
  useCases: [],
  languages: ['en'],
  privacy: {},
  descriptionLong: '',
  pros: [],
  cons: [],
  bestFor: [],
  notFor: [],
  alternatives: [],
  alternativeNames: [],
  changelog: [],
  affiliation: { isAffiliate: false },
  sponsorship: { isSponsored: false },
  status: 'published',
  detectedAt: HOY,
  kind: 'model',
  categorySlug: 'modelos',
  licences: {},
};

/** Un modelo de pesos abiertos no tiene «plan gratuito»: tiene una licencia. */
const PLAN_PESOS = {
  requiresSignup: 'no',
  requiresCreditCard: 'no',
  hasWatermark: 'unverified',
  creditReset: 'none',
  verifiedAt: HOY,
};

/** Ni un modelo de pago por token tiene plan gratuito que describir. */
const PLAN_API = {
  requiresSignup: 'yes',
  requiresCreditCard: 'unverified',
  hasWatermark: 'unverified',
  commercialUse: 'unverified',
  creditReset: 'none',
  verifiedAt: HOY,
};

const src = (url, label, kind, publisher) => ({ url, label, kind, publisher, checkedAt: HOY });

// ---------------------------------------------------------------------------
// Fichas
// ---------------------------------------------------------------------------

const MODELOS = {
  // -------------------------------------------------------------------------
  // Nube, pesos cerrados
  // -------------------------------------------------------------------------

  'gpt-5-6': {
    name: 'GPT-5.6',
    verification: 'partially_verified',
    officialUrl: 'https://developers.openai.com/api/docs/models',
    pricingUrl: 'https://developers.openai.com/api/docs/pricing',
    hosting: 'cloud',
    openSource: 'no',
    platforms: ['api'],
    freeModel: 'paid_only',
    tagline: 'Tres gamas, ninguna gratis por API.',
    descriptionShort:
      'La generación actual de OpenAI, en tres gamas: Sol («frontier model for complex professional work»), Terra y Luna, la económica. Su documentación de precios no menciona capa gratuita ni tokens de regalo: se paga por token desde el primero.',
    verdict:
      'Se paga desde el primer token. Lo que una persona puede usar sin pagar es ChatGPT, que es otra cosa —una aplicación— y tiene su propia ficha.',
    freePlan: {
      ...PLAN_API,
      summary:
        'Sin capa gratuita documentada. Sol: 5 $ por millón de tokens de entrada y 30 $ de salida. Terra: 2 $ y 12 $. Luna: 0,20 $ y 1,20 $.',
      limits: [
        'GPT-5.6 Sol: 5 $/M entrada · 30 $/M salida',
        'GPT-5.6 Terra: 2 $/M entrada · 12 $/M salida',
        'GPT-5.6 Luna: 0,20 $/M entrada · 1,20 $/M salida',
        'La página de precios no documenta capa gratuita',
      ],
    },
    access: { chat: 'unverified', chatFree: 'unverified', api: 'yes', apiFree: 'no', weights: 'no' },
    capabilities: ['text-generation', 'api'],
    startEffort: 'technical',
    startEffortReason: 'Se usa con una clave de API y facturación activa.',
    scores: { freeReal: 1, usefulness: 9, ease: 5, transparency: 6, creatorValue: 4 },
    sources: [
      src('https://developers.openai.com/api/docs/models', 'Documentación oficial de modelos', 'docs', 'openai.com'),
      src('https://developers.openai.com/api/docs/pricing', 'Precios oficiales de la API', 'pricing', 'openai.com'),
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://developers.openai.com/api/docs/pricing',
        verifiedAt: HOY,
        quote: 'gpt-5.6-sol: $5.00 input / $30.00 output · gpt-5.6-terra: $2.00 / $12.00 · gpt-5.6-luna: $0.20 / $1.20 per 1M tokens. [Sin mención de capa gratuita.]',
      },
      capabilities: {
        sourceUrl: 'https://developers.openai.com/api/docs/models',
        verifiedAt: HOY,
        quote: 'GPT-5.6 Sol — Frontier model for complex professional work.',
      },
    },
    auditNotes:
      '`chat` y `chatFree` se quedan sin afirmar: help.openai.com, openai.com/chatgpt/pricing y el blog devuelven 403 a toda lectura automática, así que no hay forma de comprobar qué modelo sirve el plan gratuito de ChatGPT. Las capacidades se quedan en lo que la tabla de modelos demuestra.',
  },

  'claude-opus-5': {
    name: 'Claude Opus 5',
    verification: 'verified',
    officialUrl: 'https://platform.claude.com/docs/en/about-claude/models/overview',
    pricingUrl: 'https://platform.claude.com/docs/en/about-claude/pricing',
    hosting: 'cloud',
    openSource: 'no',
    platforms: ['api', 'web'],
    freeModel: 'paid_only',
    tagline: 'Un millón de tokens de contexto y pensamiento adaptativo.',
    descriptionShort:
      'La gama que Anthropic recomienda por defecto: «For complex agentic coding and enterprise work». Ventana de un millón de tokens, 128k de salida máxima y pensamiento adaptativo. Acepta texto e imagen; genera texto.',
    verdict:
      'La documentación la señala como punto de partida para trabajo agéntico de código. Por API se paga desde el primer token; en claude.ai hay plan gratuito, pero su web no documenta qué gama lo sirve.',
    freePlan: {
      ...PLAN_API,
      summary: 'Sin capa gratuita de API. 5 $ por millón de tokens de entrada y 25 $ de salida.',
      limits: [
        '5 $/M de entrada · 25 $/M de salida',
        'Contexto de 1M de tokens · salida máxima de 128k',
        'Sin capa gratuita de API documentada',
      ],
    },
    access: { chat: 'yes', chatFree: 'unverified', api: 'yes', apiFree: 'no', weights: 'no', chatWhere: 'claude.ai' },
    capabilities: ['text-generation', 'code-generation', 'vision', 'reasoning', 'api'],
    startEffort: 'technical',
    startEffortReason: 'Por API con clave y facturación; en claude.ai basta una cuenta.',
    scores: { freeReal: 2, usefulness: 10, ease: 5, transparency: 9, creatorValue: 5 },
    sources: [
      src('https://platform.claude.com/docs/en/about-claude/models/overview', 'Documentación oficial de modelos', 'docs', 'claude.com'),
    ],
    evidence: {
      capabilities: {
        sourceUrl: 'https://platform.claude.com/docs/en/about-claude/models/overview',
        verifiedAt: HOY,
        quote:
          'Claude Opus 5 — For complex agentic coding and enterprise work · Adaptive thinking: Yes · Context window 1M tokens · Max output 128k tokens · All current Claude models support text and image input, text output, multilingual capabilities, and vision.',
      },
      freePlan: {
        sourceUrl: 'https://platform.claude.com/docs/en/about-claude/models/overview',
        verifiedAt: HOY,
        quote: '$5 / input MTok  $25 / output MTok',
      },
    },
  },

  'claude-haiku-4-5': {
    name: 'Claude Haiku 4.5',
    verification: 'verified',
    officialUrl: 'https://platform.claude.com/docs/en/about-claude/models/overview',
    hosting: 'cloud',
    openSource: 'no',
    platforms: ['api'],
    freeModel: 'paid_only',
    tagline: 'La gama rápida y barata de Anthropic, con contexto de 200k.',
    descriptionShort:
      'La gama pequeña: «The fastest model with near-frontier intelligence». Un dólar por millón de tokens de entrada y cinco de salida, con ventana de 200k y salida máxima de 64k. Acepta texto e imagen.',
    verdict:
      'Es la que separa a Anthropic por contexto y no sólo por precio: 200k frente al millón de las gamas mayores. Si tu trabajo cabe ahí, cuesta la quinta parte.',
    freePlan: {
      ...PLAN_API,
      summary: 'Sin capa gratuita de API. 1 $ por millón de tokens de entrada y 5 $ de salida.',
      limits: [
        '1 $/M de entrada · 5 $/M de salida',
        'Contexto de 200k tokens · salida máxima de 64k',
        'Pensamiento extendido disponible',
      ],
    },
    access: { chat: 'unverified', chatFree: 'unverified', api: 'yes', apiFree: 'no', weights: 'no' },
    capabilities: ['text-generation', 'vision', 'reasoning', 'api'],
    startEffort: 'technical',
    startEffortReason: 'Se usa con una clave de API y facturación activa.',
    scores: { freeReal: 2, usefulness: 8, ease: 5, transparency: 9, creatorValue: 5 },
    sources: [
      src('https://platform.claude.com/docs/en/about-claude/models/overview', 'Documentación oficial de modelos', 'docs', 'claude.com'),
    ],
    evidence: {
      capabilities: {
        sourceUrl: 'https://platform.claude.com/docs/en/about-claude/models/overview',
        verifiedAt: HOY,
        quote:
          'Claude Haiku 4.5 — The fastest model with near-frontier intelligence · Extended thinking: Yes · Context window 200k tokens · Max output 64k tokens · $1 / input MTok  $5 / output MTok',
      },
    },
  },

  'gemini-3-flash': {
    name: 'Gemini 3 Flash',
    verification: 'verified',
    officialUrl: 'https://ai.google.dev/gemini-api/docs/models',
    pricingUrl: 'https://ai.google.dev/gemini-api/docs/pricing',
    hosting: 'cloud',
    openSource: 'no',
    platforms: ['api', 'web'],
    freeModel: 'freemium',
    tagline: 'La gama con capa gratuita de API. La Pro no la tiene.',
    descriptionShort:
      'La gama rápida de Google, hoy en su versión 3.7: «built for complex coding, agentic workflows, and reliable multi-step execution». Su tabla de precios marca «Free Tier: Available» para todas las versiones de Flash, cosa que no ocurre con Pro.',
    verdict:
      'Es el sitio por el que se entra a Gemini sin pagar, y la diferencia con Pro no es de calidad sino de acceso: una tiene capa gratuita y la otra dice «Not available» en la misma tabla.',
    freePlan: {
      requiresSignup: 'yes',
      requiresCreditCard: 'unverified',
      hasWatermark: 'unverified',
      commercialUse: 'unverified',
      creditReset: 'unknown',
      verifiedAt: HOY,
      summary:
        'La tabla oficial marca «Free Tier: Available» para Gemini 3.7 Flash, 3.6 Flash, 3.5 Flash y las Flash-Lite. La capa gratuita se describe como «Limited access to certain models. Free input & output tokens. Google AI Studio access», sin publicar cifras. En pago: 0,75 $ por millón de entrada y 3,75 $ de salida hasta el 31/12/2026.',
      limits: [
        'Capa gratuita disponible; su cantidad no se publica',
        'De pago: 0,75 $/M entrada · 3,75 $/M salida (hasta 31/12/2026)',
        'Desde el 1/1/2027: 1,50 $/M entrada · 7,50 $/M salida',
      ],
    },
    access: { chat: 'yes', chatFree: 'unverified', api: 'yes', apiFree: 'yes', weights: 'no', chatWhere: 'gemini.google.com' },
    capabilities: ['text-generation', 'code-generation', 'tool-use', 'api'],
    startEffort: 'technical',
    startEffortReason: 'Clave de API desde Google AI Studio; la capa gratuita no exige facturación.',
    scores: { freeReal: 8, usefulness: 9, ease: 6, transparency: 7, creatorValue: 8 },
    sources: [
      src('https://ai.google.dev/gemini-api/docs/models', 'Documentación oficial de modelos', 'docs', 'ai.google.dev'),
      src('https://ai.google.dev/gemini-api/docs/pricing', 'Precios oficiales de la API', 'pricing', 'ai.google.dev'),
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://ai.google.dev/gemini-api/docs/pricing',
        verifiedAt: HOY,
        quote:
          'Gemini 3.7 Flash — Free Tier: Available · Paid input $0.75 (through Dec 31, 2026), $1.50 (from Jan 1, 2027) · Paid output $3.75 / $7.50. Free tier: Limited access to certain models. Free input & output tokens. Google AI Studio access.',
      },
      capabilities: {
        sourceUrl: 'https://ai.google.dev/gemini-api/docs/models',
        verifiedAt: HOY,
        quote:
          'Gemini 3.7 Flash: Our latest and most capable Flash model, built for complex coding, agentic workflows, and reliable multi-step execution.',
      },
    },
    auditNotes:
      'No se recogen modalidades de entrada: la tabla de precios las cobra por versión y no son iguales en toda la gama. La cadencia de la capa gratuita queda `unknown` porque la página no publica ni cantidad ni periodo.',
  },

  'gemini-3-pro': {
    name: 'Gemini 3 Pro',
    verification: 'verified',
    officialUrl: 'https://ai.google.dev/gemini-api/docs/models',
    pricingUrl: 'https://ai.google.dev/gemini-api/docs/pricing',
    hosting: 'cloud',
    openSource: 'no',
    platforms: ['api', 'web'],
    freeModel: 'paid_only',
    tagline: 'La gama grande de Google, y la tabla dice «Free Tier: Not available».',
    descriptionShort:
      'La gama de mayor capacidad de Gemini: «Advanced intelligence, complex problem-solving skills, and powerful agentic and vibe coding capabilities». Su versión actual, 3.1 Pro, es la única fila de la tabla de texto que no tiene capa gratuita.',
    verdict:
      'Está aquí precisamente por el contraste: es el ejemplo de que «la API de Gemini tiene capa gratuita» no se puede heredar de un modelo a otro.',
    freePlan: {
      ...PLAN_API,
      summary:
        'Sin capa gratuita: la tabla oficial marca «Free Tier: Not available» para gemini-3.1-pro-preview. De pago, 2 $ por millón de entrada hasta 200k tokens de prompt y 4 $ por encima; 12 $ y 18 $ de salida.',
      limits: [
        'Free Tier: Not available',
        '2 $/M de entrada (prompts ≤200k) · 4 $/M por encima',
        '12 $/M de salida (prompts ≤200k) · 18 $/M por encima',
      ],
    },
    access: { chat: 'yes', chatFree: 'unverified', api: 'yes', apiFree: 'no', weights: 'no', chatWhere: 'gemini.google.com' },
    capabilities: ['text-generation', 'code-generation', 'tool-use', 'api'],
    startEffort: 'technical',
    startEffortReason: 'Clave de API con facturación activa: no entra en la capa gratuita.',
    scores: { freeReal: 1, usefulness: 10, ease: 5, transparency: 8, creatorValue: 4 },
    sources: [
      src('https://ai.google.dev/gemini-api/docs/pricing', 'Precios oficiales de la API', 'pricing', 'ai.google.dev'),
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://ai.google.dev/gemini-api/docs/pricing',
        verifiedAt: HOY,
        quote:
          'Gemini 3.1 Pro Preview (gemini-3.1-pro-preview) — Free Tier: Not available · Paid input $2.00 (prompts ≤200k tokens), $4.00 (>200k) · Paid output $12.00 / $18.00',
      },
    },
  },

  'grok-4': {
    name: 'Grok 4.6',
    verification: 'verified',
    officialUrl: 'https://docs.x.ai/developers/models',
    hosting: 'cloud',
    openSource: 'no',
    platforms: ['api'],
    freeModel: 'paid_only',
    tagline: 'Medio millón de tokens de contexto, sin capa gratuita documentada.',
    descriptionShort:
      'La gama actual de xAI. Contexto de 500k tokens y precio por tramos según la longitud del prompt: 2 $ por millón de entrada por debajo de 200k y 4 $ por encima. Su documentación no menciona capa gratuita ni créditos.',
    verdict:
      'La documentación advierte de algo que conviene leer: sin herramientas de búsqueda activadas, «Grok has no knowledge of current events or data beyond what was present in its training data», con corte en febrero de 2026.',
    freePlan: {
      ...PLAN_API,
      summary:
        'Sin capa gratuita ni créditos documentados. 2 $ por millón de entrada (prompts <200k) y 4 $ por encima; 6 $ y 12 $ de salida. Contexto de 500k tokens.',
      limits: [
        '2–4 $/M de entrada según longitud del prompt',
        '6–12 $/M de salida',
        'Contexto de 500k tokens',
        'Corte de conocimiento: 1 de febrero de 2026',
      ],
    },
    access: { chat: 'unverified', chatFree: 'unverified', api: 'yes', apiFree: 'unverified', weights: 'no' },
    capabilities: ['text-generation', 'api'],
    startEffort: 'technical',
    startEffortReason: 'Se usa con una clave de API desde su consola.',
    scores: { freeReal: 1, usefulness: 8, ease: 5, transparency: 7, creatorValue: 4 },
    sources: [
      src('https://docs.x.ai/developers/models', 'Documentación oficial de modelos', 'docs', 'x.ai'),
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://docs.x.ai/developers/models',
        verifiedAt: HOY,
        quote: 'grok-4.6 — 500k context · Input $2–4/1M · Output $6–12/1M. [Sin capa gratuita ni créditos en la tabla.]',
      },
    },
    auditNotes:
      'El acceso en chat se queda sin afirmar: x.ai/grok devuelve 403 a toda lectura automática, así que no se puede comprobar qué gama sirve el plan gratuito de la aplicación.',
  },

  // -------------------------------------------------------------------------
  // Pesos abiertos con licencia OSI
  // -------------------------------------------------------------------------

  'deepseek-v4-pro': {
    name: 'DeepSeek V4 Pro',
    verification: 'verified',
    officialUrl: 'https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro-0813',
    pricingUrl: 'https://api-docs.deepseek.com/quick_start/pricing/',
    repoUrl: 'https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro-0813',
    hosting: 'local',
    openSource: 'yes',
    licence: 'MIT',
    licences: { code: 'MIT', weights: 'MIT' },
    platforms: ['linux', 'api'],
    freeModel: 'open_source',
    tagline: 'Un billón y pico de parámetros con licencia MIT, pesos incluidos.',
    descriptionShort:
      'El modelo mayor de DeepSeek: 1,7 billones de parámetros y contexto de un millón de tokens, con el repositorio y los pesos bajo licencia MIT. También se puede consumir por API, donde el precio cambia según la hora del día.',
    verdict:
      'De los pocos modelos de frontera cuyos pesos son MIT sin condiciones añadidas: ni umbral de usuarios ni atribución obligatoria. Descargarlo y ejecutarlo es otra historia, porque son 1,7 billones de parámetros.',
    freePlan: {
      ...PLAN_PESOS,
      commercialUse: 'yes',
      summary:
        'Repositorio y pesos bajo licencia MIT, que permite uso comercial sin condiciones añadidas. Por API se paga por token, con precio de hora punta y de hora valle.',
      limits: [
        'Pesos y código: MIT',
        '1,7 billones de parámetros · contexto de 1M · salida máxima de 384k',
        'API en hora valle: 0,22 $/M de entrada sin caché · 0,66 $/M de salida',
        'API en hora punta: 0,44 $/M y 1,32 $/M',
      ],
    },
    access: { chat: 'unverified', chatFree: 'unverified', api: 'yes', apiFree: 'no', weights: 'yes' },
    capabilities: ['text-generation', 'reasoning', 'model-download', 'api'],
    startEffort: 'technical',
    startEffortReason: 'Descargar 1,7 billones de parámetros exige infraestructura propia.',
    hardwareRequirements: '1,7 billones de parámetros: fuera del alcance de un equipo doméstico.',
    scores: { freeReal: 9, usefulness: 9, ease: 2, transparency: 10, creatorValue: 8 },
    sources: [
      src('https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro-0813', 'Ficha oficial del modelo', 'repo', 'huggingface.co'),
      src('https://api-docs.deepseek.com/quick_start/pricing/', 'Precios oficiales de la API', 'pricing', 'deepseek.com'),
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro-0813',
        verifiedAt: HOY,
        quote: 'This repository and the model weights are licensed under the MIT License',
      },
      capabilities: {
        sourceUrl: 'https://api-docs.deepseek.com/quick_start/pricing/',
        verifiedAt: HOY,
        quote: 'deepseek-v4-pro: 1M context length, max 384K output. Peak hours 01:00-04:00 and 06:00-10:00 UTC.',
      },
    },
  },

  'deepseek-v4-flash': {
    name: 'DeepSeek V4 Flash',
    verification: 'verified',
    officialUrl: 'https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash-0731',
    pricingUrl: 'https://api-docs.deepseek.com/quick_start/pricing/',
    repoUrl: 'https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash-0731',
    hosting: 'local',
    openSource: 'yes',
    licence: 'MIT',
    licences: { code: 'MIT', weights: 'MIT' },
    platforms: ['linux', 'api'],
    freeModel: 'open_source',
    tagline: 'La gama pequeña de DeepSeek: 304.000 millones de parámetros, MIT.',
    descriptionShort:
      'La hermana ligera de V4 Pro, con 304.000 millones de parámetros y el mismo contexto de un millón de tokens. Misma licencia MIT y un precio de API que es la tercera parte.',
    verdict:
      'La opción razonable si el objetivo es la API: mismo contexto que la grande a un tercio de precio, y con la hora valle sale por 0,22 $ el millón de tokens de entrada.',
    freePlan: {
      ...PLAN_PESOS,
      commercialUse: 'yes',
      summary:
        'Repositorio y pesos bajo licencia MIT. Por API, 0,22 $ por millón de tokens de entrada sin caché en hora valle y 0,66 $ de salida.',
      limits: [
        'Pesos y código: MIT',
        '304.000 millones de parámetros · contexto de 1M',
        'API en hora valle: 0,22 $/M de entrada · 0,66 $/M de salida',
      ],
    },
    access: { chat: 'unverified', chatFree: 'unverified', api: 'yes', apiFree: 'no', weights: 'yes' },
    capabilities: ['text-generation', 'model-download', 'api'],
    startEffort: 'technical',
    startEffortReason: 'Los pesos se descargan; por API basta una clave.',
    scores: { freeReal: 9, usefulness: 8, ease: 3, transparency: 10, creatorValue: 8 },
    sources: [
      src('https://api-docs.deepseek.com/quick_start/pricing/', 'Precios oficiales de la API', 'pricing', 'deepseek.com'),
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://api-docs.deepseek.com/quick_start/pricing/',
        verifiedAt: HOY,
        quote: 'deepseek-v4-flash: 1M context length, max 384K output. Input (cache miss, off-peak) $0.22 · Output (off-peak) $0.66 per 1M tokens.',
      },
    },
  },

  'qwen3-27b': {
    name: 'Qwen3.8 27B',
    verification: 'verified',
    officialUrl: 'https://huggingface.co/Qwen/Qwen3.8-27B',
    repoUrl: 'https://huggingface.co/Qwen/Qwen3.8-27B',
    hosting: 'local',
    openSource: 'yes',
    licence: 'Apache-2.0',
    licences: { code: 'Apache-2.0', weights: 'Apache-2.0' },
    platforms: ['linux', 'macos', 'windows'],
    freeModel: 'open_source',
    tagline: 'Apache 2.0, multimodal y con modo de pensamiento por defecto.',
    descriptionShort:
      'Veintisiete mil millones de parámetros con licencia Apache 2.0. Acepta texto, imágenes y vídeo, tiene modo de pensamiento activado por defecto con esfuerzo regulable, y su contexto nativo de 262.144 tokens se puede extender hasta el millón.',
    verdict:
      'Probablemente el mejor equilibrio del catálogo entre lo que hace y lo que permite: multimodal, con razonamiento documentado y una licencia que no pide permiso a nadie.',
    freePlan: {
      ...PLAN_PESOS,
      commercialUse: 'yes',
      summary:
        'Pesos bajo Apache 2.0, sin condiciones añadidas. 27.000 millones de parámetros, contexto nativo de 262.144 tokens ampliable a un millón, y entrada de texto, imagen y vídeo.',
      limits: [
        'Pesos: Apache 2.0',
        '27.000 millones de parámetros',
        'Contexto nativo de 262.144 tokens, extensible a 1.000.000',
        'Entrada de texto, imagen y vídeo',
      ],
    },
    access: { chat: 'unverified', chatFree: 'unverified', api: 'unverified', apiFree: 'unverified', weights: 'yes' },
    capabilities: ['text-generation', 'code-generation', 'reasoning', 'vision', 'video-understanding', 'model-download'],
    startEffort: 'technical',
    startEffortReason: 'Se descarga y se ejecuta con un runtime local; 27B piden GPU.',
    hardwareRequirements: '27.000 millones de parámetros: GPU con memoria suficiente o cuantización.',
    scores: { freeReal: 10, usefulness: 9, ease: 4, transparency: 10, creatorValue: 9 },
    sources: [
      src('https://huggingface.co/Qwen/Qwen3.8-27B', 'Ficha oficial del modelo', 'repo', 'huggingface.co'),
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://huggingface.co/Qwen/Qwen3.8-27B',
        verifiedAt: HOY,
        quote: 'License: apache-2.0',
      },
      capabilities: {
        sourceUrl: 'https://huggingface.co/Qwen/Qwen3.8-27B',
        verifiedAt: HOY,
        quote:
          '262,144 tokens natively, extensible to 1,000,000 · Text, images, videos · thinking mode by default, reasoning_effort (xhigh, medium, low)',
      },
    },
  },

  'qwen3-max': {
    name: 'Qwen3.8 Max',
    verification: 'verified',
    officialUrl: 'https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B',
    repoUrl: 'https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B',
    hosting: 'local',
    openSource: 'weights',
    licence: 'qwen3.8-max (licencia propia, no OSI)',
    licences: { weights: 'qwen3.8-max' },
    platforms: ['linux'],
    freeModel: 'open_source',
    tagline: 'La misma familia que el 27B, con otra licencia. Conviene mirarla.',
    descriptionShort:
      'El modelo grande de Qwen: 2,4 billones de parámetros con 95.000 millones activos y pensamiento siempre encendido. Sus pesos se descargan, pero no bajo Apache 2.0 como los del 27B, sino bajo una licencia propia llamada «qwen3.8-max».',
    verdict:
      'Está en el catálogo por lo que enseña: dos modelos de la misma familia, el mismo mes, con licencias distintas. «Qwen es open source» no es una frase que se pueda decir sin mirar cuál.',
    freePlan: {
      ...PLAN_PESOS,
      commercialUse: 'unverified',
      summary:
        'Pesos descargables bajo la licencia propia «qwen3.8-max», no OSI. 2,4 billones de parámetros con 95.000 millones activos por token, sólo texto, y contexto nativo de 262.144 tokens ampliable a 1.010.000.',
      limits: [
        'Pesos: licencia propia «qwen3.8-max», no OSI',
        '2,4 billones de parámetros · 95.000 millones activos',
        'Sólo texto: no acepta imagen ni vídeo',
        'Pensamiento activado siempre, no se puede desactivar',
      ],
    },
    access: { chat: 'unverified', chatFree: 'unverified', api: 'unverified', apiFree: 'unverified', weights: 'yes' },
    capabilities: ['text-generation', 'reasoning', 'model-download'],
    startEffort: 'technical',
    startEffortReason: 'Infraestructura propia: 2,4 billones de parámetros no caben en un equipo.',
    scores: { freeReal: 6, usefulness: 9, ease: 2, transparency: 7, creatorValue: 5 },
    sources: [
      src('https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B', 'Ficha oficial del modelo', 'repo', 'huggingface.co'),
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B',
        verifiedAt: HOY,
        quote: 'License: qwen3.8-max',
      },
      capabilities: {
        sourceUrl: 'https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B',
        verifiedAt: HOY,
        quote:
          '2.4 trillion total with 95 billion activated parameters · 262,144 tokens natively, extensible to 1,010,000 · Text-only · thinking enabled by default and cannot be disabled',
      },
    },
    auditNotes:
      'El uso comercial se queda sin afirmar: la licencia «qwen3.8-max» no es una plantilla conocida y no se leyó su texto completo en esta comprobación.',
  },

  'glm-5': {
    name: 'GLM-5.2',
    verification: 'verified',
    officialUrl: 'https://huggingface.co/zai-org/GLM-5.2',
    repoUrl: 'https://huggingface.co/zai-org/GLM-5.2',
    hosting: 'local',
    openSource: 'yes',
    licence: 'MIT',
    licences: { code: 'MIT', weights: 'MIT' },
    platforms: ['linux', 'api'],
    freeModel: 'open_source',
    tagline: 'MIT, un millón de tokens de contexto y esfuerzo de pensamiento regulable.',
    descriptionShort:
      '753.000 millones de parámetros con licencia MIT y contexto de un millón de tokens. Su ficha lo describe como «Advanced Coding with Flexible Effort», con varios niveles de pensamiento, y reivindica ser «Pure Open»: MIT y sin límites regionales.',
    verdict:
      'El modelo grande más permisivo del catálogo: MIT de verdad, sin umbral de usuarios ni atribución obligatoria, y con el contexto de un millón que hasta hace poco era exclusivo de los cerrados.',
    freePlan: {
      ...PLAN_PESOS,
      commercialUse: 'yes',
      summary:
        'Pesos bajo licencia MIT, sin condiciones añadidas. 753.000 millones de parámetros y contexto de un millón de tokens, con niveles de esfuerzo de pensamiento.',
      limits: [
        'Pesos: MIT',
        '753.000 millones de parámetros',
        'Contexto de 1.000.000 de tokens',
        'Sólo texto',
      ],
    },
    access: { chat: 'unverified', chatFree: 'unverified', api: 'unverified', apiFree: 'unverified', weights: 'yes' },
    capabilities: ['text-generation', 'code-generation', 'reasoning', 'tool-use', 'model-download'],
    startEffort: 'technical',
    startEffortReason: 'Infraestructura propia: 753.000 millones de parámetros piden varias GPU.',
    scores: { freeReal: 10, usefulness: 9, ease: 2, transparency: 10, creatorValue: 8 },
    sources: [
      src('https://huggingface.co/zai-org/GLM-5.2', 'Ficha oficial del modelo', 'repo', 'huggingface.co'),
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://huggingface.co/zai-org/GLM-5.2',
        verifiedAt: HOY,
        quote: 'License: MIT · "Pure Open" with MIT licensing and no regional limits, technical access without borders',
      },
      capabilities: {
        sourceUrl: 'https://huggingface.co/zai-org/GLM-5.2',
        verifiedAt: HOY,
        quote:
          'Solid 1M-token context that stably sustains long-horizon work · Advanced Coding with Flexible Effort · agentic tasks (MCP-Atlas: 76.8, Tool-Decathlon: 48.2)',
      },
    },
  },

  'mistral-large': {
    name: 'Mistral Large 3',
    verification: 'verified',
    officialUrl: 'https://docs.mistral.ai/getting-started/models/models_overview/',
    pricingUrl: 'https://mistral.ai/pricing',
    hosting: 'hybrid',
    openSource: 'yes',
    licence: 'Apache-2.0',
    licences: { weights: 'Apache-2.0' },
    platforms: ['linux', 'api', 'web'],
    freeModel: 'open_source',
    tagline: 'Un modelo grande, multimodal y con pesos Apache 2.0.',
    descriptionShort:
      'La gama grande de Mistral, listada en su documentación entre los modelos abiertos con licencia Apache 2.0 y descrita como multimodal general. Se puede descargar o consumir en su plataforma, que da 10 $ mensuales en créditos de API en el plan gratuito.',
    verdict:
      'Que un modelo de esta talla esté en la columna «Open» con Apache 2.0 sigue siendo poco común. Y el plan gratuito de la plataforma da créditos de verdad, con renovación mensual.',
    freePlan: {
      requiresSignup: 'yes',
      requiresCreditCard: 'unverified',
      hasWatermark: 'unverified',
      commercialUse: 'yes',
      creditsAmount: '10 $/mes en créditos de API',
      creditReset: 'monthly',
      verifiedAt: HOY,
      summary:
        'Los pesos son Apache 2.0. Además, el plan gratuito de la plataforma incluye 10 $ al mes en créditos de API para probar los modelos en Studio.',
      limits: [
        'Pesos: Apache 2.0',
        'Plan gratuito de la plataforma: 10 $/mes en créditos de API',
        'Plan de pago más barato: Pro, 14,99 $/mes',
      ],
    },
    access: { chat: 'yes', chatFree: 'yes', api: 'yes', apiFree: 'yes', weights: 'yes', chatWhere: 'Vibe' },
    capabilities: ['text-generation', 'vision', 'model-download', 'api'],
    startEffort: 'signup',
    startEffortReason: 'En la plataforma basta una cuenta; los pesos son otra historia.',
    scores: { freeReal: 9, usefulness: 9, ease: 6, transparency: 8, creatorValue: 9 },
    sources: [
      src('https://docs.mistral.ai/getting-started/models/models_overview/', 'Documentación oficial de modelos', 'docs', 'mistral.ai'),
      src('https://mistral.ai/pricing', 'Precios oficiales', 'pricing', 'mistral.ai'),
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://mistral.ai/pricing',
        verifiedAt: HOY,
        quote: 'Free — Test Mistral models in Studio · $10 /mo in API credits',
      },
      capabilities: {
        sourceUrl: 'https://docs.mistral.ai/getting-started/models/models_overview/',
        verifiedAt: HOY,
        quote: 'Mistral Large 3 (Apache 2.0) — General multimodal',
      },
    },
  },

  'mistral-small': {
    name: 'Mistral Small 4',
    verification: 'verified',
    officialUrl: 'https://docs.mistral.ai/getting-started/models/models_overview/',
    hosting: 'local',
    openSource: 'yes',
    licence: 'Apache-2.0',
    licences: { weights: 'Apache-2.0' },
    platforms: ['linux', 'macos', 'windows', 'api'],
    freeModel: 'open_source',
    tagline: 'Instrucciones, razonamiento y código en un modelo que cabe en tu equipo.',
    descriptionShort:
      'La gama pequeña de Mistral, con licencia Apache 2.0 y descrita en su documentación como híbrido de instrucción, razonamiento y código. Es de los pocos modelos que responden a las tres cosas sin salir de tu máquina.',
    verdict:
      'La respuesta cuando quieres razonamiento y código en local con una licencia sin letra pequeña. La documentación lo dice en una línea: «Hybrid instruct/reasoning/coding».',
    freePlan: {
      ...PLAN_PESOS,
      commercialUse: 'yes',
      summary: 'Pesos bajo Apache 2.0. Sin cuotas ni cuenta: el coste es el equipo.',
      limits: ['Pesos: Apache 2.0', 'Híbrido de instrucción, razonamiento y código'],
    },
    access: { chat: 'unverified', chatFree: 'unverified', api: 'yes', apiFree: 'unverified', weights: 'yes' },
    capabilities: ['text-generation', 'code-generation', 'reasoning', 'model-download'],
    startEffort: 'technical',
    startEffortReason: 'Se descarga y se ejecuta con un runtime local.',
    scores: { freeReal: 10, usefulness: 8, ease: 5, transparency: 9, creatorValue: 9 },
    sources: [
      src('https://docs.mistral.ai/getting-started/models/models_overview/', 'Documentación oficial de modelos', 'docs', 'mistral.ai'),
    ],
    evidence: {
      capabilities: {
        sourceUrl: 'https://docs.mistral.ai/getting-started/models/models_overview/',
        verifiedAt: HOY,
        quote: 'Mistral Small 4 (Apache 2.0) — Hybrid instruct/reasoning/coding',
      },
    },
  },

  ministral: {
    name: 'Ministral 3',
    verification: 'verified',
    officialUrl: 'https://docs.mistral.ai/getting-started/models/models_overview/',
    hosting: 'local',
    openSource: 'yes',
    licence: 'Apache-2.0',
    licences: { weights: 'Apache-2.0' },
    platforms: ['linux', 'macos', 'windows'],
    freeModel: 'open_source',
    tagline: 'Tres tamaños —3B, 8B y 14B—, todos Apache 2.0 y todos con visión.',
    descriptionShort:
      'La familia diminuta de Mistral, en 3.000, 8.000 y 14.000 millones de parámetros. Los tres tamaños están en la tabla de modelos abiertos con licencia Apache 2.0 y los tres aceptan texto e imagen.',
    verdict:
      'Es la puerta de entrada a lo local: el de 3B entra en un portátil sin GPU dedicada, y sigue aceptando imágenes.',
    freePlan: {
      ...PLAN_PESOS,
      commercialUse: 'yes',
      summary:
        'Tres tamaños con pesos Apache 2.0: Ministral 3 3B, 8B y 14B. Los tres aceptan texto e imagen. Sin cuotas ni cuenta.',
      limits: [
        'Pesos: Apache 2.0 en los tres tamaños',
        '3B, 8B y 14B de parámetros',
        'Entrada de texto e imagen',
      ],
    },
    access: { chat: 'unverified', chatFree: 'unverified', api: 'unverified', apiFree: 'unverified', weights: 'yes' },
    capabilities: ['text-generation', 'vision', 'model-download'],
    startEffort: 'install',
    startEffortReason: 'El de 3B arranca con un runtime local sin GPU dedicada.',
    hardwareRequirements: 'El de 3B cabe en un portátil; el de 14B pide GPU.',
    scores: { freeReal: 10, usefulness: 7, ease: 6, transparency: 9, creatorValue: 9 },
    sources: [
      src('https://docs.mistral.ai/getting-started/models/models_overview/', 'Documentación oficial de modelos', 'docs', 'mistral.ai'),
    ],
    evidence: {
      capabilities: {
        sourceUrl: 'https://docs.mistral.ai/getting-started/models/models_overview/',
        verifiedAt: HOY,
        quote: 'Ministral 3 14B (Apache 2.0) — Text and vision · Ministral 3 8B (Apache 2.0) — Text and vision · Ministral 3 3B (Apache 2.0) — Text and vision',
      },
    },
  },

  'phi-4': {
    name: 'Phi-4',
    verification: 'verified',
    officialUrl: 'https://huggingface.co/microsoft/phi-4',
    repoUrl: 'https://huggingface.co/microsoft/phi-4',
    hosting: 'local',
    openSource: 'yes',
    licence: 'MIT',
    licences: { code: 'MIT', weights: 'MIT' },
    platforms: ['linux', 'macos', 'windows'],
    freeModel: 'open_source',
    tagline: 'Catorce mil millones de parámetros, MIT, pensado para equipos justos.',
    descriptionShort:
      'El modelo pequeño de Microsoft, con licencia MIT y 14.000 millones de parámetros. Su ficha dice para qué está pensado: «memory/compute constrained environments», «latency bound scenarios» y «reasoning and logic». Contexto de 16k y sólo texto.',
    verdict:
      'El contexto de 16k es corto para lo que se lleva hoy, y a cambio cabe donde no caben los demás. Su ficha presume de matemáticas y código, no de conversación.',
    freePlan: {
      ...PLAN_PESOS,
      commercialUse: 'yes',
      summary:
        'Pesos bajo licencia MIT. 14.000 millones de parámetros, contexto de 16k tokens y sólo texto. Sin cuotas ni cuenta.',
      limits: [
        'Pesos: MIT',
        '14.000 millones de parámetros',
        'Contexto de 16k tokens',
        'Sólo texto',
      ],
    },
    access: { chat: 'unverified', chatFree: 'unverified', api: 'unverified', apiFree: 'unverified', weights: 'yes' },
    capabilities: ['text-generation', 'code-generation', 'reasoning', 'model-download'],
    startEffort: 'install',
    startEffortReason: 'Se descarga y se ejecuta con un runtime local; 14B admiten cuantización.',
    hardwareRequirements: 'Pensado para entornos con poca memoria o poco cómputo.',
    scores: { freeReal: 10, usefulness: 7, ease: 6, transparency: 10, creatorValue: 8 },
    sources: [
      src('https://huggingface.co/microsoft/phi-4', 'Ficha oficial del modelo', 'repo', 'huggingface.co'),
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://huggingface.co/microsoft/phi-4',
        verifiedAt: HOY,
        quote: 'License: MIT',
      },
      capabilities: {
        sourceUrl: 'https://huggingface.co/microsoft/phi-4',
        verifiedAt: HOY,
        quote:
          'memory/compute constrained environments · latency bound scenarios · reasoning and logic · MATH: 80.4, GPQA: 56.1, HumanEval: 82.6',
      },
    },
  },

  // -------------------------------------------------------------------------
  // Pesos abiertos con licencia propia
  // -------------------------------------------------------------------------

  'llama-4': {
    name: 'Llama 4 Scout',
    verification: 'verified',
    officialUrl: 'https://huggingface.co/meta-llama/Llama-4-Scout-17B-16E-Instruct',
    repoUrl: 'https://huggingface.co/meta-llama/Llama-4-Scout-17B-16E-Instruct',
    hosting: 'local',
    openSource: 'weights',
    licence: 'Llama 4 Community License (no OSI)',
    licences: { weights: 'Llama 4 Community License' },
    platforms: ['linux'],
    freeModel: 'open_source',
    tagline: 'Diez millones de tokens de contexto, y una licencia que pone condiciones.',
    descriptionShort:
      'El modelo de Meta con 17.000 millones de parámetros activos sobre 109.000 totales, entrada de texto e imagen y una ventana de diez millones de tokens. Su licencia no es OSI: obliga a pedir permiso a Meta por encima de 700 millones de usuarios mensuales y a mostrar «Built with Llama».',
    verdict:
      'La ventana de diez millones de tokens no la tiene nadie más. La condición de los 700 millones de usuarios no afecta a casi nadie, pero la de enseñar «Built with Llama» sí, y por eso esto es «pesos abiertos» y no «open source».',
    freePlan: {
      ...PLAN_PESOS,
      commercialUse: 'partial',
      summary:
        'Pesos descargables bajo la Llama 4 Community License. Permite uso comercial, pero por encima de 700 millones de usuarios activos mensuales hay que solicitar licencia a Meta, y hay que mostrar «Built with Llama» y conservar el aviso de licencia.',
      limits: [
        'Licencia propia: Llama 4 Community License, no OSI',
        'Por encima de 700M de usuarios mensuales hay que pedir licencia a Meta',
        'Obligatorio mostrar «Built with Llama» y conservar el aviso',
        '17.000M de parámetros activos sobre 109.000M · contexto de 10M de tokens',
      ],
    },
    access: { chat: 'unverified', chatFree: 'unverified', api: 'unverified', apiFree: 'unverified', weights: 'yes' },
    capabilities: ['text-generation', 'code-generation', 'vision', 'model-download'],
    startEffort: 'technical',
    startEffortReason: 'Se descarga tras aceptar la licencia; 109.000M de parámetros piden GPU.',
    scores: { freeReal: 7, usefulness: 8, ease: 3, transparency: 8, creatorValue: 6 },
    sources: [
      src('https://huggingface.co/meta-llama/Llama-4-Scout-17B-16E-Instruct', 'Ficha oficial del modelo', 'repo', 'huggingface.co'),
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://huggingface.co/meta-llama/Llama-4-Scout-17B-16E-Instruct',
        verifiedAt: HOY,
        quote:
          '700 million monthly active users in the preceding calendar month, you must request a license from Meta, which Meta may grant to you in its sole discretion. [Distributors must] prominently display "Built with Llama" on a related website.',
      },
      capabilities: {
        sourceUrl: 'https://huggingface.co/meta-llama/Llama-4-Scout-17B-16E-Instruct',
        verifiedAt: HOY,
        quote: 'Context Length: 10 million tokens · Input: Multilingual text and images · Output: Multilingual text and code · Active 17B / Total 109B',
      },
    },
    auditNotes:
      'La ficha del modelo no se actualiza desde mayo de 2025, quince meses antes de esta comprobación. Es el dato que más envejece de esta vertical y por eso está escrito aquí.',
  },

  'kimi-k2': {
    name: 'Kimi K3',
    verification: 'verified',
    officialUrl: 'https://huggingface.co/moonshotai/Kimi-K3',
    repoUrl: 'https://huggingface.co/moonshotai/Kimi-K3',
    hosting: 'local',
    openSource: 'weights',
    licence: 'Kimi K3 License (permisiva con atribución sobre 100M de usuarios)',
    licences: { weights: 'Kimi K3 License' },
    platforms: ['linux'],
    freeModel: 'open_source',
    tagline: 'Multimodal, siempre pensando, y con una atribución en la letra pequeña.',
    descriptionShort:
      '2,8 billones de parámetros con 104.000 millones activos, contexto de un millón de tokens y comprensión de texto, imagen y vídeo en un solo modelo. El pensamiento está siempre activado, con niveles de esfuerzo, y está diseñado para «long-horizon coding» y trabajo agéntico.',
    verdict:
      'Su licencia es casi MIT y por eso la diferencia importa: permite vender y modificar, pero a partir de 100 millones de usuarios mensuales obliga a poner «Kimi K3» a la vista en la interfaz.',
    freePlan: {
      ...PLAN_PESOS,
      commercialUse: 'partial',
      summary:
        'Pesos descargables bajo la Kimi K3 License, que permite usar, copiar, modificar y vender copias, con una condición: por encima de 100 millones de usuarios activos mensuales hay que mostrar «Kimi K3» en la interfaz del producto.',
      limits: [
        'Licencia propia: permisiva con atribución obligatoria sobre 100M de usuarios',
        '2,8 billones de parámetros · 104.000 millones activos',
        'Contexto de 1.048.576 tokens',
        'Entiende texto, imagen y vídeo',
      ],
    },
    access: { chat: 'unverified', chatFree: 'unverified', api: 'unverified', apiFree: 'unverified', weights: 'yes' },
    capabilities: ['text-generation', 'code-generation', 'reasoning', 'vision', 'video-understanding', 'tool-use', 'model-download'],
    startEffort: 'technical',
    startEffortReason: 'Infraestructura propia: 2,8 billones de parámetros no caben en un equipo.',
    scores: { freeReal: 8, usefulness: 9, ease: 2, transparency: 9, creatorValue: 7 },
    sources: [
      src('https://huggingface.co/moonshotai/Kimi-K3', 'Ficha oficial del modelo', 'repo', 'huggingface.co'),
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://huggingface.co/moonshotai/Kimi-K3/blob/main/LICENSE',
        verifiedAt: HOY,
        quote:
          'to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software [...] more than 100 million monthly active users [...] "Kimi K3" must be prominently displayed on the user interface of such product or service',
      },
      capabilities: {
        sourceUrl: 'https://huggingface.co/moonshotai/Kimi-K3',
        verifiedAt: HOY,
        quote:
          '2.8 trillion total; 104 billion actively used per token · 1,048,576 tokens · Text, images, and video understanding within a single model · Kimi K3 always has thinking enabled · long-horizon coding and agentic knowledge work',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Fichas existentes que esta ronda corrige
// ---------------------------------------------------------------------------

const CORREGIDAS = {
  'claude-sonnet-5': {
    verification: 'verified',
    categorySlug: 'modelos',
    secondaryCategories: ['chat-asistentes', 'apis'],
    officialUrl: 'https://platform.claude.com/docs/en/about-claude/models/overview',
    hosting: 'cloud',
    openSource: 'no',
    freeModel: 'paid_only',
    tagline: 'La gama equilibrada: mismo contexto que Opus, a menos de la mitad.',
    descriptionShort:
      'La gama que Anthropic describe como «The best combination of speed and intelligence». Dos dólares por millón de tokens de entrada y diez de salida, con la misma ventana de un millón y la misma salida máxima de 128k que Opus 5.',
    verdict:
      'Comparte contexto y capacidades con Opus 5 y cuesta menos de la mitad. La diferencia que documenta Anthropic es de latencia y de para qué está pensada cada una.',
    freePlan: {
      ...PLAN_API,
      summary: 'Sin capa gratuita de API. 2 $ por millón de tokens de entrada y 10 $ de salida.',
      limits: [
        '2 $/M de entrada · 10 $/M de salida',
        'Contexto de 1M de tokens · salida máxima de 128k',
        'Sin capa gratuita de API documentada',
      ],
    },
    access: { chat: 'yes', chatFree: 'unverified', api: 'yes', apiFree: 'no', weights: 'no', chatWhere: 'claude.ai' },
    capabilities: ['text-generation', 'code-generation', 'vision', 'reasoning', 'api'],
    startEffort: 'technical',
    startEffortReason: 'Por API con clave y facturación; en claude.ai basta una cuenta.',
    sources: [
      src('https://platform.claude.com/docs/en/about-claude/models/overview', 'Documentación oficial de modelos', 'docs', 'claude.com'),
    ],
    evidence: {
      capabilities: {
        sourceUrl: 'https://platform.claude.com/docs/en/about-claude/models/overview',
        verifiedAt: HOY,
        quote:
          'Claude Sonnet 5 — The best combination of speed and intelligence · Adaptive thinking: Yes · Context window 1M tokens · Max output 128k · $2 / input MTok  $10 / output MTok',
      },
    },
  },

  'gemma-4': {
    verification: 'verified',
    categorySlug: 'modelos',
    secondaryCategories: ['modelos-open-source', 'herramientas-locales'],
    officialUrl: 'https://ai.google.dev/gemma/docs/core/model_card_4',
    hosting: 'local',
    openSource: 'yes',
    licence: 'Apache-2.0',
    licences: { weights: 'Apache-2.0' },
    tagline: 'Cinco tamaños Apache 2.0, y los dos pequeños oyen.',
    descriptionShort:
      'La familia abierta de Google, con licencia Apache 2.0 en los cinco tamaños: E2B y E4B —2.300 y 4.500 millones de parámetros efectivos—, 12B, 26B A4B y 31B. Todos aceptan texto e imagen; el audio sólo funciona en E2B, E4B y 12B.',
    verdict:
      'La rareza está en los dos pequeños: caben en un equipo modesto y aceptan audio, cosa que los grandes de la misma familia no hacen. Contexto de 128k en los pequeños y 256k en los demás.',
    freePlan: {
      ...PLAN_PESOS,
      commercialUse: 'yes',
      summary:
        'Los cinco tamaños con licencia Apache 2.0. Contexto de 128k en E2B y E4B, y de 256k en 12B, 26B A4B y 31B. Entrada de texto e imagen en todos; audio sólo en E2B, E4B y 12B. La salida es siempre texto.',
      limits: [
        'Pesos: Apache 2.0 en los cinco tamaños',
        'E2B (2.300M efectivos) y E4B (4.500M): contexto de 128k',
        '12B, 26B A4B y 31B: contexto de 256k',
        'Audio de entrada sólo en E2B, E4B y 12B',
      ],
    },
    access: { chat: 'unverified', chatFree: 'unverified', api: 'yes', apiFree: 'yes', weights: 'yes' },
    capabilities: ['text-generation', 'vision', 'audio-input', 'model-download'],
    startEffort: 'install',
    startEffortReason: 'E2B y E4B arrancan con un runtime local en un equipo normal.',
    hardwareRequirements: 'E2B: 2.300M de parámetros efectivos. 31B pide GPU.',
    sources: [
      src('https://ai.google.dev/gemma/docs/core/model_card_4', 'Ficha oficial del modelo', 'docs', 'ai.google.dev'),
      src('https://ai.google.dev/gemini-api/docs/pricing', 'Precios oficiales de la API', 'pricing', 'ai.google.dev'),
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://ai.google.dev/gemma/docs/core/model_card_4',
        verifiedAt: HOY,
        quote:
          'Apache 2.0 · E2B (2.3B effective), E4B (4.5B effective), 12B Unified, 26B A4B (MoE), 31B Dense · E2B and E4B: 128K tokens; 12B, 26B A4B, 31B: 256K · Inputs: text and images (all models); audio support on E2B, E4B, and 12B only · Outputs: text generation only',
      },
    },
    auditNotes:
      'La capa gratuita de API sale de la tabla de precios de Gemini, donde Gemma 4 aparece con «Free Tier: Available» y «Paid Tier: Not available».',
  },
};

// ---------------------------------------------------------------------------

const resumen = { nuevas: [], corregidas: [] };

for (const [slug, campos] of Object.entries(MODELOS)) {
  if (porSlug.has(slug)) throw new Error(`La ficha "${slug}" ya existe.`);
  const ficha = {
    ...PLANTILLA,
    ...campos,
    slug,
    id: `tool_${slug}`,
    nextReviewAt: PROXIMA,
    lastVerifiedAt: HOY,
    updatedAt: HOY,
  };
  catalogo.push(ficha);
  porSlug.set(slug, ficha);
  resumen.nuevas.push(slug);
}

for (const [slug, campos] of Object.entries(CORREGIDAS)) {
  const ficha = porSlug.get(slug);
  if (!ficha) throw new Error(`No existe la ficha "${slug}".`);
  Object.assign(ficha, campos, { nextReviewAt: PROXIMA, lastVerifiedAt: HOY, updatedAt: HOY });
  resumen.corregidas.push(slug);
}

/*
 * `access` es `not null` en el espejo, y una clave ausente llega como NULL
 * explícito que derrota al DEFAULT. Mismo tropiezo que `skill_level` y que
 * `licences`; a la tercera se escribe una vez para todo el catálogo.
 */
for (const ficha of catalogo) {
  if (!ficha.access) ficha.access = {};
  if (!ficha.licences) ficha.licences = {};
}

catalogo.sort((a, b) => a.slug.localeCompare(b.slug, 'es'));
writeFileSync(RUTA, `${JSON.stringify(catalogo, null, 2)}\n`, 'utf8');

console.log(`Nuevas (${resumen.nuevas.length}): ${resumen.nuevas.join(', ')}`);
console.log(`Corregidas (${resumen.corregidas.length}): ${resumen.corregidas.join(', ')}`);
console.log(`\nTotal del catálogo: ${catalogo.length}`);
