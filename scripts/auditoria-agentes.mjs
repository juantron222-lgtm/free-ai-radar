#!/usr/bin/env node
/**
 * Auditoría de huecos de /agentes: listos para usar e investigación.
 *
 * La primera ronda dejó 1 de 19 «listos para usar» y 0 de 19 de investigación.
 * Un cero no es sospechoso por sí mismo, pero sí lo es cuando el mercado habla
 * todos los días de agentes de investigación: o el mercado exagera, o mi
 * búsqueda tenía un sesgo. Esta ronda comprueba cuál de las dos.
 *
 * Todo lo que escribe este fichero salió de una página oficial abierta el 20 de
 * agosto de 2026, y el criterio de entrada no ha cambiado: una fuente oficial
 * tiene que describir el comportamiento. Lo que cambia es dónde busqué.
 *
 * ═══ Lo que la auditoría encontró ═══
 *
 * **Investigación pasa de 0 a 4, y tres son de código abierto.** GPT Researcher,
 * STORM y Local Deep Researcher documentan el bucle completo —planificar,
 * buscar, leer, detectar lo que falta, volver a buscar, redactar con citas—,
 * que es exactamente lo que `research` significa y lo que `web-browsing` no
 * significa. La cuarta es Gemini: su Deep Research es un modo con página de
 * ayuda propia, no una promesa de portada.
 *
 * **Listos para usar pasa de 1 a 2.** Genspark Super Agent entra con evidencia
 * literal de su centro de ayuda. No hay un tercero, así que no hay bloque: dos
 * tarjetas con un título encima seguirían siendo dos tarjetas.
 *
 * ═══ Lo que se quedó fuera, y por qué ═══
 *
 *   **OpenAI (deep research y agent mode).** Es el hueco que más me molesta.
 *   `help.openai.com`, `openai.com/index/introducing-deep-research` y
 *   `openai.com/chatgpt/pricing` devuelven 403 a cualquier lectura automática.
 *   Hay cifras circulando por buscadores; un resumen de buscador no es una
 *   fuente oficial y no se convierte en dato del catálogo.
 *
 *   **Perplexity.** Igual: 403 en el blog y en precios. Su API sí es legible y
 *   dice lo contrario de lo que haría falta —`sonar-deep-research` se factura
 *   por tokens y está en obsolescencia—, así que tampoco por ahí.
 *
 *   **Grok.** Su documentación describe «connect your tools so Grok can reach
 *   your email, files, and calendar right inside a chat». Eso es un chat con
 *   herramientas, que es justo lo que no cuenta.
 *
 *   **Lindy.** Siete días de prueba y ningún plan gratuito permanente.
 *
 *   **Flowith.** 300 créditos sin renovación documentada y, sobre todo, la
 *   única descripción de comportamiento que publica en la página de precios es
 *   «the world's first infinite agent». Eso es marketing, no evidencia.
 *
 *   **Kimi.** No encontré un producto llamado «Researcher» con acceso gratuito
 *   documentado; lo que hay son modelos con capacidades agénticas.
 *
 * Y cuatro que sí verifiqué pero que no pertenecen a los dos tipos auditados
 * —Agent Zero, OpenManus, Browser Use y Kortix— se quedan para una ronda
 * propia: los bloques donde caerían ya tienen catálogo de sobra, y añadirlas
 * aquí sería engordar el número sin responder a la pregunta que se hizo.
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
  licences: {},
};

const fuente = (url, label, kind, publisher) => ({ url, label, kind, publisher, checkedAt: HOY });

// ---------------------------------------------------------------------------
// Fichas existentes que la auditoría corrige
// ---------------------------------------------------------------------------

const CORREGIDAS = {
  /*
   * Gemini entra por un modo, no por ser un modelo capaz.
   *
   * La regla dice que un modelo no se presenta como agente por poder participar
   * en un sistema agéntico. Deep Research no es eso: es un modo con nombre,
   * página de ayuda propia y límite diario, que una persona usa hoy sin pagar.
   * Lo que lo mete en /agentes no son sus capacidades sino `secondaryCategories`
   * —un juicio editorial escrito en el dato— para que nada entre solo.
   *
   * El número del límite diario no se publica, y por eso no se inventa: la
   * cadencia sí está documentada («Daily research requests»), la cifra no.
   */
  'google-gemini': {
    secondaryCategories: ['agentes'],
    capabilities: ['text-to-image', 'image-editing', 'text-generation', 'research', 'web-browsing', 'api'],
    sources: [
      fuente('https://gemini.google.com/', 'Web oficial', 'official', 'google.com'),
      fuente(
        'https://support.google.com/gemini/answer/15719111',
        'Ayuda oficial: usar Deep Research',
        'docs',
        'support.google.com'
      ),
    ],
    evidence: {
      capabilities: {
        sourceUrl: 'https://support.google.com/gemini/answer/15719111',
        verifiedAt: HOY,
        quote:
          'You can conduct in-depth and real-time research on almost any subject with Deep Research in Gemini Apps. [Crea un plan de investigación y genera un informe. Los usuarios sin plan de pago pueden generar informes con el modelo Thinking; «Google AI Pro and Google AI Ultra users can generate reports using Pro for even higher quality».]',
      },
      freePlan: {
        sourceUrl: 'https://support.google.com/gemini/answer/15719111',
        verifiedAt: HOY,
        quote:
          'In Gemini Apps, there are limits for: Daily research requests [...] Google AI Pro and Google AI Ultra users get higher limits for how many research reports they can create.',
      },
    },
    auditNotes:
      'Entra en /agentes por `secondaryCategories`, no por su `kind`: es un asistente con un modo de investigación documentado, no un agente de propósito general. La cifra del límite diario no se publica; la cadencia sí.',
  },
};

// ---------------------------------------------------------------------------
// A · Listos para usar
// ---------------------------------------------------------------------------

const NUEVAS = {
  genspark: {
    id: 'tool_genspark',
    slug: 'genspark',
    name: 'Genspark',
    kind: 'agent',
    verification: 'verified',
    categorySlug: 'agentes',
    officialUrl: 'https://www.genspark.ai/',
    pricingUrl: 'https://www.genspark.ai/helpcenter/membership-plans',
    hosting: 'cloud',
    openSource: 'no',
    platforms: ['web'],
    freeModel: 'credits',
    tagline: 'Cien créditos al día para un agente que parte el encargo en pasos.',
    descriptionShort:
      'Super Agent divide una petición en pasos, elige las herramientas y las ejecuta en una caja de arena con navegador y sistema de ficheros propios. El plan gratuito da 100 créditos al día.',
    verdict:
      'De los pocos agentes de propósito general con una cifra gratuita diaria publicada. Lo que documenta su centro de ayuda es el comportamiento entero, no la palabra.',
    freePlan: {
      summary:
        'Plan gratuito con 100 créditos al día, concedidos automáticamente. Los créditos no se acumulan. El plan Plus empieza en 10.000 créditos al mes; su precio no se publica en el centro de ayuda.',
      limits: [
        '100 créditos al día',
        'Los créditos no se acumulan de un periodo al siguiente',
        'Chat e imágenes sin coste de créditos sólo en los planes de pago',
      ],
      requiresSignup: 'yes',
      requiresCreditCard: 'unverified',
      hasWatermark: 'unverified',
      commercialUse: 'unverified',
      creditsAmount: '100 créditos/día',
      creditReset: 'daily',
      verifiedAt: HOY,
    },
    capabilities: ['tool-use', 'web-browsing', 'integrations'],
    startEffort: 'signup',
    startEffortReason: 'Requiere cuenta; los créditos diarios van asociados a ella.',
    scores: { freeReal: 8, usefulness: 8, ease: 8, transparency: 7, creatorValue: 7 },
    sources: [
      fuente('https://www.genspark.ai/', 'Web oficial', 'official', 'genspark.ai'),
      fuente('https://www.genspark.ai/helpcenter/super-agent', 'Centro de ayuda: Super Agent', 'docs', 'genspark.ai'),
      fuente('https://www.genspark.ai/helpcenter/credits-guide', 'Centro de ayuda: créditos', 'pricing', 'genspark.ai'),
    ],
    evidence: {
      capabilities: {
        sourceUrl: 'https://www.genspark.ai/helpcenter/super-agent',
        verifiedAt: HOY,
        quote:
          "Super Agent breaks your request into steps, chooses the right tools, and carries the work through to a finished result. [...] dedicated sandbox environment: real browser, own filesystem, and powerful execution [...] connects to your everyday apps and data so it can act with real context.",
      },
      freePlan: {
        sourceUrl: 'https://www.genspark.ai/helpcenter/credits-guide',
        verifiedAt: HOY,
        quote: '100 credits/day, automatically. [...] Credits don’t carry over.',
      },
    },
    auditNotes:
      'No se marcan `code-execution` ni `memory`. «Powerful execution» no dice que ejecute código, y «SecondBrain» aparece sin definir qué persiste. El precio del plan Plus tampoco se registra: el centro de ayuda publica los créditos, no la cifra en euros.',
  },

  // -------------------------------------------------------------------------
  // C · Investigación. El bucle completo, no sólo el navegador.
  // -------------------------------------------------------------------------

  'gpt-researcher': {
    id: 'tool_gpt-researcher',
    slug: 'gpt-researcher',
    name: 'GPT Researcher',
    kind: 'agent',
    verification: 'verified',
    categorySlug: 'agentes',
    secondaryCategories: ['investigacion'],
    officialUrl: 'https://github.com/assafelovic/gpt-researcher',
    repoUrl: 'https://github.com/assafelovic/gpt-researcher',
    hosting: 'local',
    openSource: 'yes',
    licence: 'Apache-2.0',
    platforms: ['linux', 'macos', 'windows'],
    freeModel: 'open_source',
    tagline: 'Un planificador que reparte preguntas y agentes que las contestan.',
    descriptionShort:
      'Agente de investigación con licencia Apache 2.0 que se instala con pip o Docker. Un planificador genera las preguntas, varios agentes de ejecución recogen la información y un publicador la reúne en un informe con citas de más de veinte fuentes.',
    verdict:
      'La respuesta cuando la investigación tiene que salir de tu equipo o trabajar sobre tus propios documentos. El coste no es la cuota: es el modelo que le pongas detrás.',
    freePlan: {
      summary:
        'Código con licencia Apache 2.0. Sin cuotas ni cuenta con el proyecto; hay que aportar un modelo, propio o de pago por uso. Investiga sobre la web y sobre documentos locales en PDF, texto, CSV, Excel, Markdown, PowerPoint y Word.',
      limits: [
        'Sin cuota del propio proyecto: el coste es el modelo que uses',
        'Se instala con pip o con Docker',
        'Investiga también sobre documentos locales',
      ],
      requiresSignup: 'no',
      requiresCreditCard: 'no',
      hasWatermark: 'unverified',
      commercialUse: 'unverified',
      creditReset: 'none',
      verifiedAt: HOY,
    },
    capabilities: ['research', 'web-browsing', 'multi-agent'],
    startEffort: 'technical',
    startEffortReason: 'Se instala con pip o Docker y necesita la clave de un modelo.',
    scores: { freeReal: 9, usefulness: 8, ease: 4, transparency: 9, creatorValue: 8 },
    sources: [
      fuente('https://github.com/assafelovic/gpt-researcher', 'Repositorio oficial', 'repo', 'github.com'),
    ],
    evidence: {
      capabilities: {
        sourceUrl: 'https://github.com/assafelovic/gpt-researcher',
        verifiedAt: HOY,
        quote:
          'The first open deep research agent designed for both web and local research on any given task. [...] The planner generates research questions, while the execution agents gather relevant information [...] The publisher then aggregates all findings into a comprehensive report. Aggregate over 20 sources for objective conclusions.',
      },
      freePlan: {
        sourceUrl: 'https://github.com/assafelovic/gpt-researcher/blob/master/LICENSE',
        verifiedAt: HOY,
        quote: 'Apache License, Version 2.0, January 2004',
      },
    },
    auditNotes:
      '`multi-agent` se marca porque el propio README separa planificador y agentes de ejecución, no por su asistente opcional sobre LangGraph.',
  },

  storm: {
    id: 'tool_storm',
    slug: 'storm',
    name: 'STORM',
    kind: 'agent',
    verification: 'verified',
    categorySlug: 'agentes',
    secondaryCategories: ['investigacion'],
    officialUrl: 'https://github.com/stanford-oval/storm',
    repoUrl: 'https://github.com/stanford-oval/storm',
    hosting: 'hybrid',
    openSource: 'yes',
    licence: 'MIT',
    platforms: ['linux', 'macos', 'windows', 'web'],
    freeModel: 'open_source',
    tagline: 'Escribe un artículo con referencias partiendo de una búsqueda.',
    descriptionShort:
      'Sistema del laboratorio OVAL de Stanford, con licencia MIT, que escribe artículos tipo Wikipedia desde cero a partir de búsquedas en internet. Investiga, reúne referencias y genera un esquema antes de redactar. Tiene una vista previa gratuita alojada.',
    verdict:
      'El único de los tres abiertos que se puede probar sin instalar nada, en la vista previa de Stanford. Sus autores avisan de que lo que sale no es publicable sin edición.',
    freePlan: {
      summary:
        'Código con licencia MIT. Se instala con `pip install knowledge-storm` o desde el repositorio. Existe además una vista previa de investigación gratuita en storm.genie.stanford.edu, que su repositorio dice que han probado más de 70.000 personas.',
      limits: [
        'Vista previa gratuita alojada en storm.genie.stanford.edu',
        'Instalación local con pip; el coste es el modelo que uses',
        'Sus autores avisan: no produce artículos listos para publicar sin edición',
      ],
      requiresSignup: 'unverified',
      requiresCreditCard: 'no',
      hasWatermark: 'unverified',
      commercialUse: 'unverified',
      creditReset: 'none',
      verifiedAt: HOY,
    },
    capabilities: ['research', 'web-browsing'],
    startEffort: 'install',
    startEffortReason: 'Se instala con pip; la vista previa de Stanford no requiere instalación.',
    scores: { freeReal: 9, usefulness: 7, ease: 5, transparency: 9, creatorValue: 7 },
    sources: [fuente('https://github.com/stanford-oval/storm', 'Repositorio oficial', 'repo', 'github.com')],
    evidence: {
      capabilities: {
        sourceUrl: 'https://github.com/stanford-oval/storm',
        verifiedAt: HOY,
        quote:
          'STORM is a LLM system that writes Wikipedia-like articles from scratch based on Internet search. [Pre-writing: conduct Internet research, collect references, generate outline. Writing: use the outline and references to generate the full-length article with citations.]',
      },
      freePlan: {
        sourceUrl: 'https://github.com/stanford-oval/storm/blob/main/LICENSE',
        verifiedAt: HOY,
        quote: 'MIT License. Copyright (c) 2024 Stanford Open Virtual Assistant Lab',
      },
    },
    auditNotes:
      'La licencia MIT es la del código; el README menciona CC BY-SA aparte por el contenido de Wikipedia que usa su conjunto de datos. `requiresSignup` se queda sin afirmar: no comprobé si la vista previa pide cuenta.',
  },

  'local-deep-researcher': {
    id: 'tool_local-deep-researcher',
    slug: 'local-deep-researcher',
    name: 'Local Deep Researcher',
    kind: 'agent',
    verification: 'verified',
    categorySlug: 'agentes',
    secondaryCategories: ['investigacion', 'herramientas-locales'],
    officialUrl: 'https://github.com/langchain-ai/local-deep-researcher',
    repoUrl: 'https://github.com/langchain-ai/local-deep-researcher',
    hosting: 'local',
    openSource: 'yes',
    licence: 'MIT',
    platforms: ['linux', 'macos', 'windows'],
    freeModel: 'open_source',
    tagline: 'Busca, resume, ve lo que le falta y vuelve a buscar. Tres vueltas.',
    descriptionShort:
      'Asistente de investigación de LangChain con licencia MIT que funciona con cualquier modelo servido por Ollama o LM Studio. Genera una consulta, busca, resume, detecta lo que falta y vuelve a preguntar; por defecto da tres vueltas y el número es configurable.',
    verdict:
      'El más pequeño de los tres y el único que puede funcionar de principio a fin con un modelo tuyo. Su bucle de reflexión es lo que separa investigar de buscar.',
    freePlan: {
      summary:
        'Código con licencia MIT. Funciona con modelos locales servidos por Ollama o LM Studio, así que puede ejecutarse sin cuota de ningún proveedor de modelos. La búsqueda web sí necesita un buscador: DuckDuckGo, SearXNG, Tavily o Perplexity.',
      limits: [
        'Tres vueltas de investigación por defecto (MAX_WEB_RESEARCH_LOOPS)',
        'Modelo local con Ollama o LM Studio',
        'La búsqueda web necesita un buscador externo',
      ],
      requiresSignup: 'no',
      requiresCreditCard: 'no',
      hasWatermark: 'unverified',
      commercialUse: 'unverified',
      creditReset: 'none',
      verifiedAt: HOY,
    },
    capabilities: ['research', 'web-browsing'],
    startEffort: 'technical',
    startEffortReason: 'Exige un servidor de modelos local y configurar un buscador.',
    scores: { freeReal: 10, usefulness: 7, ease: 4, transparency: 9, creatorValue: 7 },
    sources: [
      fuente('https://github.com/langchain-ai/local-deep-researcher', 'Repositorio oficial', 'repo', 'github.com'),
    ],
    evidence: {
      capabilities: {
        sourceUrl: 'https://github.com/langchain-ai/local-deep-researcher',
        verifiedAt: HOY,
        quote:
          'A fully local web research assistant that uses any LLM hosted by Ollama or LMStudio. [Genera una consulta, busca, resume, refleja sobre el resumen para encontrar lagunas, genera una consulta nueva y repite. El número de vueltas se configura con MAX_WEB_RESEARCH_LOOPS, por defecto 3.]',
      },
      freePlan: {
        sourceUrl: 'https://github.com/langchain-ai/local-deep-researcher/blob/main/LICENSE',
        verifiedAt: HOY,
        quote: 'MIT License. Copyright (c) 2025 Lance Martin',
      },
    },
  },
};

// ---------------------------------------------------------------------------

const resumen = { corregidas: [], nuevas: [] };

for (const [slug, campos] of Object.entries(CORREGIDAS)) {
  const ficha = porSlug.get(slug);
  if (!ficha) throw new Error(`No existe la ficha "${slug}".`);
  Object.assign(ficha, campos, { nextReviewAt: PROXIMA, lastVerifiedAt: HOY, updatedAt: HOY });
  resumen.corregidas.push(slug);
}

for (const [slug, campos] of Object.entries(NUEVAS)) {
  if (porSlug.has(slug)) throw new Error(`La ficha "${slug}" ya existe.`);
  const ficha = { ...PLANTILLA, ...campos, nextReviewAt: PROXIMA, lastVerifiedAt: HOY, updatedAt: HOY };
  catalogo.push(ficha);
  porSlug.set(slug, ficha);
  resumen.nuevas.push(slug);
}

catalogo.sort((a, b) => a.slug.localeCompare(b.slug, 'es'));
writeFileSync(RUTA, `${JSON.stringify(catalogo, null, 2)}\n`, 'utf8');

console.log(`Corregidas (${resumen.corregidas.length}): ${resumen.corregidas.join(', ')}`);
console.log(`Nuevas (${resumen.nuevas.length}): ${resumen.nuevas.join(', ')}`);
console.log(`\nTotal del catálogo: ${catalogo.length}`);
