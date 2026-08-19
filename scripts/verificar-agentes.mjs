#!/usr/bin/env node
/**
 * La vertical de agentes, verificada contra fuente oficial.
 *
 * Todo lo que escribe este fichero salió de una página oficial abierta el 19 de
 * agosto de 2026. Donde la fuente no lo dice, el campo se queda sin afirmar.
 *
 * Esta vertical exige una disciplina que las demás no necesitaban: **la palabra
 * «agente» está en la portada de casi todo**, así que no puede ser la prueba de
 * nada. Una ficha entra en /agentes cuando una fuente oficial describe un
 * comportamiento concreto —usar la terminal, editar un repositorio, navegar,
 * repartir en subagentes, conectarse a otras aplicaciones— y no cuando el
 * fabricante se llama agente a sí mismo.
 *
 * Tres distinciones que el catálogo tiene que sostener:
 *
 *   **Producto listo para usar ≠ herramienta para construir.** Manus recibe un
 *   encargo y actúa. CrewAI es una biblioteca de Python con la que programas el
 *   tuyo. Las dos son verdad, y ponerlas en la misma comparación plana no
 *   ayudaría a nadie. Lo separa `kind`.
 *
 *   **Modelo ≠ agente.** Que un modelo pueda participar en un sistema agéntico
 *   no convierte su ficha en un agente. Aquí no entra ninguno.
 *
 *   **Gratis para el chat ≠ gratis para el agente.** El caso de GitHub Copilot:
 *   2.000 completados y 50 mensajes al mes sin tarjeta, y su agente en la nube
 *   sólo en los planes de pago. Y el de Claude Code, que no tiene plan gratuito
 *   en absoluto.
 *
 * Dos hallazgos que cambian lo que se puede publicar:
 *
 *   **Windsurf ya no existe como producto propio.** `windsurf.com/pricing`
 *   redirige a `devin.ai/pricing` y su documentación dice que «the package is
 *   now called devin-desktop». No se publica ficha aparte.
 *
 *   **AutoGen está en mantenimiento.** Su propio repositorio lo dice y señala a
 *   Microsoft Agent Framework como «the enterprise-ready successor». Se publica
 *   el sucesor, no el que ya no recibe funciones.
 *
 * Y una que cambia cómo se registra: el Sandbox de Dify da «200 message
 * credits» y su página no documenta renovación. Eso es `credits` + `one_off`,
 * no `freemium`.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RUTA = resolve(ROOT, 'src/data/tools-v2.json');
const HOY = '2026-08-19';
const PROXIMA = '2026-11-17';

const catalogo = JSON.parse(readFileSync(RUTA, 'utf8'));
const porSlug = new Map(catalogo.map((t) => [t.slug, t]));

const PLANTILLA = {
  // Ver la nota en verificar-video.mjs: la columna del espejo es NOT NULL.
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
  // Ver la nota en licencias-por-capa.mjs: una clave ausente llega como NULL.
  licences: {},
};

const fuente = (url, label, kind, publisher) => ({
  url,
  label,
  kind,
  publisher,
  checkedAt: HOY,
});

// ---------------------------------------------------------------------------
// A · Agentes listos para usar. Recibes un encargo y actúan.
// ---------------------------------------------------------------------------

const NUEVAS = {
  manus: {
    id: 'tool_manus',
    slug: 'manus',
    name: 'Manus',
    kind: 'agent',
    verification: 'verified',
    categorySlug: 'agentes',
    officialUrl: 'https://manus.im/',
    pricingUrl: 'https://manus.im/pricing',
    docsUrl: 'https://manus.im/docs',
    hosting: 'cloud',
    openSource: 'no',
    platforms: ['web'],
    freeModel: 'credits',
    tagline: 'Trescientos créditos cada día, y un ordenador virtual detrás.',
    descriptionShort:
      'Agente general que recibe un encargo y lo ejecuta en un entorno aislado: su documentación lo describe como un ordenador virtual con acceso a internet, sistema de ficheros persistente y capacidad de instalar software. El plan gratuito da 300 créditos que se renuevan cada día a medianoche UTC.',
    verdict:
      'De los pocos agentes generales con una capa gratuita que se renueva de verdad, y con la letra pequeña donde importa: una tarea a la vez y sólo el modelo Lite.',
    freePlan: {
      summary:
        'Plan gratuito de 0 $/mes con 300 créditos diarios que se reinician a medianoche UTC y no se acumulan. Da acceso al modo Chat y a Manus 1.6 Lite en modo Agente, una tarea simultánea y dos tareas programadas. El plan de pago más barato es Pro, desde 20 $/mes con 4.000 créditos mensuales.',
      limits: [
        '300 créditos al día, reiniciados a medianoche UTC',
        'Los créditos diarios no se acumulan: lo que sobra desaparece',
        'Sólo Manus 1.6 Lite en modo Agente',
        '1 tarea simultánea · 2 tareas programadas',
        'Plan de pago más barato: Pro, desde 20 $/mes (4.000 créditos/mes)',
      ],
      requiresSignup: 'yes',
      requiresCreditCard: 'unverified',
      hasWatermark: 'unverified',
      commercialUse: 'unverified',
      creditsAmount: '300 créditos/día',
      creditReset: 'daily',
      verifiedAt: HOY,
    },
    capabilities: ['web-browsing', 'code-execution', 'terminal', 'tool-use', 'memory'],
    startEffort: 'signup',
    startEffortReason: 'Requiere cuenta; los créditos diarios se reclaman al entrar cada día.',
    scores: { freeReal: 8, usefulness: 8, ease: 8, transparency: 7, creatorValue: 7 },
    sources: [
      fuente('https://manus.im/', 'Web oficial', 'official', 'manus.im'),
      fuente('https://help.manus.im/en/articles/11711111-what-is-the-current-membership-pricing-for-manus', 'Centro de ayuda: precios', 'pricing', 'help.manus.im'),
      fuente('https://help.manus.im/en/articles/11711121-will-my-daily-refresh-credits-accumulate-or-reset', 'Centro de ayuda: créditos diarios', 'pricing', 'help.manus.im'),
      fuente('https://manus.im/docs', 'Documentación oficial', 'docs', 'manus.im'),
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://help.manus.im/en/articles/11711111-what-is-the-current-membership-pricing-for-manus',
        verifiedAt: HOY,
        quote:
          'Free — $0/month · Access to Chat Mode and Manus 1.6 Lite in Agent Mode · 300 credits provided daily · Supports 1 concurrent task · Supports 2 scheduled tasks. [Y en el artículo de créditos: «The daily credit balance resets to 300 at midnight Coordinated Universal Time (UTC)» y «Daily refresh credits will not be added to your main credit balance».]',
      },
      capabilities: {
        sourceUrl: 'https://manus.im/docs',
        verifiedAt: HOY,
        quote:
          'It operates in a complete sandbox environment—a virtual computer with internet access, a persistent file system, and the ability to install software and create custom tools · Manus AI can work independently, remember context across long tasks, and deliver production-ready results.',
      },
    },
    auditNotes:
      '`memory` se marca porque la documentación dice «remember context across long tasks», no porque prometa memoria permanente entre sesiones distintas. `computer-use` NO se marca: el ordenador es suyo, no el tuyo.',
  },

  devin: {
    id: 'tool_devin',
    slug: 'devin',
    name: 'Devin',
    kind: 'agent',
    verification: 'verified',
    categorySlug: 'agentes',
    secondaryCategories: ['codigo'],
    officialUrl: 'https://devin.ai/',
    pricingUrl: 'https://devin.ai/pricing',
    docsUrl: 'https://docs.devin.ai/',
    hosting: 'cloud',
    openSource: 'no',
    platforms: ['web'],
    freeModel: 'freemium',
    tagline: 'Terminal, editor y navegador propios. El plan gratuito no publica cuánto da.',
    descriptionShort:
      'Agente de software con terminal, editor de código y navegador propios, pensado para encargos de repositorio completos. Tiene plan gratuito para una persona con «uso limitado de Devin» cuya cantidad no se publica.',
    verdict:
      'El agente que popularizó la idea de delegar una tarea entera de ingeniería. Su plan gratuito existe, pero no dice cuánto da, así que sirve para verlo funcionar y poco más.',
    freePlan: {
      summary:
        'Plan gratuito para 1 persona con «uso limitado de Devin», acceso a Devin Review y a DeepWiki. La cantidad de uso incluida no se publica. El plan de pago más barato es Pro, 20 $/mes; el siguiente, Max, 200 $/mes.',
      limits: [
        'Uso limitado de Devin: la cantidad no se publica',
        '1 asiento',
        'Incluye Devin Review y DeepWiki',
        'Plan de pago más barato: Pro, 20 $/mes',
      ],
      requiresSignup: 'yes',
      requiresCreditCard: 'unverified',
      hasWatermark: 'unverified',
      commercialUse: 'unverified',
      creditReset: 'unknown',
      verifiedAt: HOY,
    },
    capabilities: ['terminal', 'repository-editing', 'web-browsing', 'code-execution'],
    startEffort: 'signup',
    startEffortReason: 'Requiere cuenta y conectar el repositorio antes de encargar nada.',
    scores: { freeReal: 5, usefulness: 8, ease: 7, transparency: 5, creatorValue: 6 },
    sources: [
      fuente('https://devin.ai/', 'Web oficial', 'official', 'devin.ai'),
      fuente('https://docs.devin.ai/admin/billing/self-serve', 'Documentación oficial: planes', 'pricing', 'docs.devin.ai'),
      fuente('https://docs.devin.ai/get-started/devin-intro', 'Documentación oficial', 'docs', 'docs.devin.ai'),
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://docs.devin.ai/admin/billing/self-serve',
        verifiedAt: HOY,
        quote:
          'Free | Individuals trying Devin | Free | 1 — Limited Devin usage, Devin Review, DeepWiki. [Pro: $20/month · Max: $200/month · Teams: $80/month minimum.]',
      },
      capabilities: {
        sourceUrl: 'https://docs.devin.ai/get-started/devin-intro',
        verifiedAt: HOY,
        quote:
          "Devin's terminal, where you can watch commands being executed and view output logs · Devin's embedded code editor equipped with all the IDE tools and shortcuts you're familiar with · Browser: allows Devin to browse documentation, test applications, and handle web-based tasks.",
      },
    },
    auditNotes:
      'La documentación afirma «if you can do it in three hours, Devin can most likely do it». Es una promesa de alcance, no un dato comprobable, y no se recoge como capacidad.',
  },

  'replit-agent': {
    id: 'tool_replit-agent',
    slug: 'replit-agent',
    name: 'Replit Agent',
    kind: 'agent',
    verification: 'verified',
    categorySlug: 'agentes',
    secondaryCategories: ['codigo'],
    officialUrl: 'https://replit.com/',
    pricingUrl: 'https://replit.com/pricing',
    docsUrl: 'https://docs.replit.com/replitai/agent',
    hosting: 'cloud',
    openSource: 'no',
    platforms: ['web'],
    freeModel: 'credits',
    tagline: 'Créditos de agente cada día y una aplicación publicada.',
    descriptionShort:
      'Agente que construye aplicaciones completas desde una descripción: escribe el código, monta la infraestructura y prueba el resultado. El plan Starter da créditos de agente diarios y permite publicar un proyecto.',
    verdict:
      'La vía más corta que existe entre una idea y algo desplegado, sin instalar nada. Los créditos diarios son modestos, pero se renuevan.',
    freePlan: {
      summary:
        'Plan Starter gratuito con créditos de agente diarios. Incluye base de datos integrada, creación de diapositivas, vídeos y animaciones, y permite publicar hasta 1 proyecto, con opción de despliegue privado o protegido por contraseña. El plan de pago más barato es Core, 20 $/mes con facturación anual (25 $ al mes suelto) e incluye 25 $ de créditos mensuales.',
      limits: [
        'Créditos de agente diarios: la cantidad no se publica',
        'Hasta 1 proyecto publicado',
        'Despliegue privado o protegido con contraseña',
        'Plan de pago más barato: Core, 20 $/mes anual (25 $/mes suelto)',
      ],
      requiresSignup: 'yes',
      requiresCreditCard: 'unverified',
      hasWatermark: 'unverified',
      commercialUse: 'unverified',
      creditsAmount: 'Créditos de agente diarios',
      creditReset: 'daily',
      verifiedAt: HOY,
    },
    capabilities: ['code-execution', 'repository-editing', 'integrations', 'tool-use'],
    startEffort: 'signup',
    startEffortReason: 'Todo ocurre en el navegador; sólo hace falta una cuenta.',
    scores: { freeReal: 7, usefulness: 8, ease: 9, transparency: 6, creatorValue: 7 },
    sources: [
      fuente('https://replit.com/', 'Web oficial', 'official', 'replit.com'),
      fuente('https://replit.com/pricing', 'Página oficial de precios', 'pricing', 'replit.com'),
      fuente('https://docs.replit.com/replitai/agent', 'Documentación oficial', 'docs', 'docs.replit.com'),
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://replit.com/pricing',
        verifiedAt: HOY,
        quote:
          'Starter — For exploring what’s possible: Free daily Agent credits · Built-in database for full-stack apps · Create slides, videos, animations · Publish up to 1 project · Publish private or password-protected deployments.',
      },
      capabilities: {
        sourceUrl: 'https://docs.replit.com/replitai/agent',
        verifiedAt: HOY,
        quote:
          'Unlike a chatbot that only answers questions, Agent takes action: it sets up your project, creates applications, checks its work, and fixes problems · Agent writes code, sets up infrastructure, and tests the result · pull data from BigQuery, Linear, Slack, Notion, and more directly from chat.',
      },
    },
    auditNotes:
      'La página dice «Free daily Agent credits» sin cifra. Se registra `daily` porque la renovación sí está publicada, y la cantidad se deja sin afirmar.',
  },

  // -------------------------------------------------------------------------
  // B · Agentes de código. Trabajan sobre repositorios y terminal.
  // -------------------------------------------------------------------------

  'claude-code': {
    id: 'tool_claude-code',
    slug: 'claude-code',
    name: 'Claude Code',
    kind: 'agent',
    verification: 'verified',
    categorySlug: 'codigo',
    secondaryCategories: ['agentes'],
    officialUrl: 'https://claude.com/product/claude-code',
    pricingUrl: 'https://claude.com/pricing',
    hosting: 'cloud',
    openSource: 'no',
    platforms: ['cli', 'extension', 'web', 'macos', 'windows', 'linux'],
    freeModel: 'paid_only',
    tagline: 'Sin plan gratuito: empieza en Pro, 20 $ al mes.',
    descriptionShort:
      'Agente de programación que trabaja en la terminal, en el IDE y en la web: edita varios ficheros a la vez, ejecuta órdenes y pruebas, y reparte trabajo entre subagentes. No está incluido en el plan gratuito de Claude.',
    verdict:
      'Potente y, para lo que busca quien llega a Free AI Radar, con una respuesta corta: aquí no hay nada gratis. La entrada son 20 $ al mes.',
    freePlan: {
      summary:
        'No hay plan gratuito. La página de precios lista Claude Code a partir de Pro, 20 $/mes (17 $/mes con facturación anual); el plan Free incluye el chat en web, iOS, Android y escritorio, pero no Claude Code.',
      limits: [
        'No incluido en el plan gratuito de Claude',
        'Entra en Pro: 20 $/mes (17 $/mes anual)',
        'Max, desde 100 $/mes, ofrece 5× o 20× el uso de Pro',
      ],
      requiresSignup: 'yes',
      requiresCreditCard: 'unverified',
      hasWatermark: 'no',
      commercialUse: 'unverified',
      creditReset: 'none',
      verifiedAt: HOY,
    },
    capabilities: ['terminal', 'repository-editing', 'code-execution', 'multi-agent', 'tool-use'],
    startEffort: 'install',
    startEffortReason: 'Se instala en la terminal o como extensión del editor, y exige plan de pago.',
    scores: { freeReal: 1, usefulness: 9, ease: 6, transparency: 8, creatorValue: 5 },
    sources: [
      fuente('https://claude.com/product/claude-code', 'Página oficial del producto', 'official', 'claude.com'),
      fuente('https://claude.com/pricing', 'Página oficial de precios', 'pricing', 'claude.com'),
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://claude.com/pricing',
        verifiedAt: HOY,
        quote:
          'Pro — $20/month, or $17/month billed annually: Everything in Free, plus: More usage… Includes Claude Code. [El plan Free lista chat en web, iOS, Android y escritorio, y no menciona Claude Code.]',
      },
      capabilities: {
        sourceUrl: 'https://claude.com/product/claude-code',
        verifiedAt: HOY,
        quote:
          'Executing across 10s to 100s of parallel subagents · the entire workflow—reading issues, writing code, running tests, and submitting PRs—all from your terminal · powerful, multi-file edits that work.',
      },
    },
    auditNotes:
      'Ficha de la casa: Free AI Radar se construye con Claude Code. No cambia el criterio — `paid_only` es lo que dice su página de precios, y así se publica.',
  },

  codex: {
    id: 'tool_codex',
    slug: 'codex',
    name: 'OpenAI Codex',
    kind: 'agent',
    verification: 'verified',
    categorySlug: 'codigo',
    secondaryCategories: ['agentes'],
    officialUrl: 'https://openai.com/codex/',
    pricingUrl: 'https://learn.chatgpt.com/docs/pricing',
    hosting: 'cloud',
    openSource: 'no',
    platforms: ['cli', 'extension', 'web', 'macos', 'windows'],
    freeModel: 'freemium',
    tagline: 'Incluido en el plan gratuito de ChatGPT, para tareas cortas.',
    descriptionShort:
      'Agente de programación de OpenAI que corre en la terminal, en el editor, en la web y en la aplicación de escritorio, con entornos locales y en la nube. Está incluido en el plan gratuito de ChatGPT, pensado para «tareas de programación rápidas».',
    verdict:
      'El agente de código serio más fácil de probar sin pagar: si ya tienes cuenta de ChatGPT, está ahí. La cantidad incluida en el plan gratuito no se publica.',
    freePlan: {
      summary:
        'Incluido en el plan gratuito de ChatGPT (0 $/mes), descrito para «explorar las capacidades de Codex en tareas de programación rápidas». La cantidad de uso incluida no se publica. El plan de pago más barato que lo amplía es Go, 8 $/mes; Plus son 20 $/mes.',
      limits: [
        'Incluido en ChatGPT Free: la cantidad no se publica',
        'Descrito para tareas de programación rápidas',
        'Plan de pago más barato: Go, 8 $/mes',
        'Plus: 20 $/mes · Pro: desde 100 $/mes',
      ],
      requiresSignup: 'yes',
      requiresCreditCard: 'unverified',
      hasWatermark: 'no',
      commercialUse: 'unverified',
      creditReset: 'unknown',
      verifiedAt: HOY,
    },
    capabilities: ['terminal', 'repository-editing', 'code-execution', 'web-browsing'],
    startEffort: 'signup',
    startEffortReason: 'Va con la cuenta de ChatGPT; la versión de terminal se instala aparte.',
    scores: { freeReal: 6, usefulness: 9, ease: 7, transparency: 6, creatorValue: 7 },
    sources: [
      fuente('https://openai.com/codex/', 'Página oficial del producto', 'official', 'openai.com'),
      fuente('https://learn.chatgpt.com/docs/pricing', 'Precios oficiales de Codex', 'pricing', 'learn.chatgpt.com'),
      fuente('https://learn.chatgpt.com/docs', 'Documentación oficial', 'docs', 'learn.chatgpt.com'),
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://learn.chatgpt.com/docs/pricing',
        verifiedAt: HOY,
        quote:
          'ChatGPT Work and Codex are included in your ChatGPT Free, Go, Plus, Pro, Business, Edu, or Enterprise plan · Free — $0/month: Explore Codex capabilities on quick coding tasks · Go — $8/month: Use Codex for lightweight coding tasks.',
      },
      capabilities: {
        sourceUrl: 'https://learn.chatgpt.com/docs',
        verifiedAt: HOY,
        quote:
          'run in the terminal/CLI, edit files in a repository, run commands and tests · Local environments and Cloud environment · Browser [listado como capacidad].',
      },
    },
  },

  'gemini-cli': {
    id: 'tool_gemini-cli',
    slug: 'gemini-cli',
    name: 'Gemini CLI',
    kind: 'agent',
    verification: 'verified',
    categorySlug: 'codigo',
    secondaryCategories: ['agentes', 'modelos-open-source'],
    officialUrl: 'https://github.com/google-gemini/gemini-cli',
    repoUrl: 'https://github.com/google-gemini/gemini-cli',
    hosting: 'hybrid',
    openSource: 'yes',
    licence: 'Apache-2.0',
    platforms: ['cli', 'linux', 'macos', 'windows'],
    freeModel: 'free_real',
    tagline: 'Mil peticiones al día con una cuenta personal de Google.',
    descriptionShort:
      'Agente de terminal de Google, con código Apache 2.0. Ejecuta órdenes del sistema, opera sobre ficheros, busca en la web con anclaje en Google Search y se amplía con servidores MCP. Con una cuenta personal de Google da 60 peticiones por minuto y 1.000 al día.',
    verdict:
      'La cifra gratuita más clara de toda la vertical, y publicada en el propio repositorio. Si vives en la terminal, es el punto de partida obvio.',
    freePlan: {
      summary:
        'Código publicado con licencia Apache 2.0. Autenticándose con una cuenta personal de Google se obtienen 60 peticiones por minuto y 1.000 peticiones al día sin coste.',
      limits: [
        '60 peticiones por minuto',
        '1.000 peticiones al día con cuenta personal de Google',
        'Código con licencia Apache 2.0',
      ],
      requiresSignup: 'yes',
      requiresCreditCard: 'no',
      hasWatermark: 'no',
      commercialUse: 'unverified',
      creditsAmount: '1.000 peticiones/día',
      creditReset: 'daily',
      verifiedAt: HOY,
    },
    capabilities: ['terminal', 'tool-use', 'web-browsing', 'repository-editing'],
    startEffort: 'install',
    startEffortReason: 'Se instala en la terminal y se autentica con una cuenta de Google.',
    scores: { freeReal: 9, usefulness: 8, ease: 6, transparency: 9, creatorValue: 8 },
    sources: [
      fuente('https://github.com/google-gemini/gemini-cli', 'Repositorio oficial', 'repo', 'github.com'),
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://github.com/google-gemini/gemini-cli',
        verifiedAt: HOY,
        quote: '60 requests/min and 1,000 requests/day with personal Google account · Apache License 2.0',
      },
      capabilities: {
        sourceUrl: 'https://github.com/google-gemini/gemini-cli',
        verifiedAt: HOY,
        quote:
          'Built-in tools for file operations, shell commands, and web interactions · Built-in Google Search grounding · MCP (Model Context Protocol) support for custom integrations.',
      },
    },
    auditNotes:
      '`memory` no se marca: el repositorio documenta «conversation checkpointing to save and resume complex sessions», que es reanudar una sesión, no recordar entre sesiones distintas.',
  },

  'github-copilot': {
    id: 'tool_github-copilot',
    slug: 'github-copilot',
    name: 'GitHub Copilot',
    kind: 'agent',
    verification: 'verified',
    categorySlug: 'codigo',
    secondaryCategories: ['agentes'],
    officialUrl: 'https://github.com/features/copilot',
    pricingUrl: 'https://github.com/features/copilot/plans',
    docsUrl: 'https://docs.github.com/en/copilot',
    hosting: 'cloud',
    openSource: 'no',
    platforms: ['extension', 'cli', 'web'],
    freeModel: 'freemium',
    tagline: 'Gratis para completar y charlar. Su agente en la nube, no.',
    descriptionShort:
      'Asistente de programación de GitHub con plan gratuito de 2.000 completados y 50 mensajes de chat al mes, sin tarjeta. Su agente en la nube —el que investiga un repositorio, planifica, cambia el código en una rama y abre la pull request— está disponible sólo en los planes de pago.',
    verdict:
      'El caso que mejor explica por qué esta sección separa el chat del agente: lo gratuito completa código, y lo que trabaja solo empieza en 10 $ al mes.',
    freePlan: {
      summary:
        'Plan gratuito de 0 $ sin tarjeta con 2.000 completados de código al mes y 50 mensajes de chat (incluido Copilot Edits), acceso a varios modelos y a Copilot CLI. Las cantidades se reinician cada mes. El agente en la nube exige plan de pago; el más barato es Pro, 10 $/usuario/mes, con completados ilimitados.',
      limits: [
        '2.000 completados de código al mes',
        '50 mensajes de chat al mes, incluido Copilot Edits',
        'Se reinicia cada mes',
        'El agente en la nube NO está en el plan gratuito',
        'Plan de pago más barato: Pro, 10 $/usuario/mes',
      ],
      requiresSignup: 'yes',
      requiresCreditCard: 'no',
      hasWatermark: 'no',
      commercialUse: 'unverified',
      creditsAmount: '2.000 completados + 50 mensajes/mes',
      creditReset: 'monthly',
      verifiedAt: HOY,
    },
    capabilities: ['repository-editing', 'code-execution', 'terminal', 'tool-use'],
    startEffort: 'signup',
    startEffortReason: 'Cuenta de GitHub y la extensión del editor; no pide tarjeta.',
    scores: { freeReal: 7, usefulness: 8, ease: 8, transparency: 9, creatorValue: 7 },
    sources: [
      fuente('https://github.com/features/copilot/plans', 'Planes oficiales', 'pricing', 'github.com'),
      fuente('https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent', 'Documentación oficial del agente', 'docs', 'docs.github.com'),
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://github.com/features/copilot/plans',
        verifiedAt: HOY,
        quote:
          '2,000 completions per month · 50 chat requests (including Copilot Edits) · resets every month · $0 USD, no credit card required. [Pro: $10 USD per user / month.]',
      },
      capabilities: {
        sourceUrl: 'https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent',
        verifiedAt: HOY,
        quote:
          'research a repository, create implementation plans, and make code changes on a branch · its own ephemeral development environment, powered by GitHub Actions, where it can explore your code, make changes, execute automated tests and linters · Copilot cloud agent is available for all paid Copilot plans.',
      },
    },
    auditNotes:
      'Las capacidades describen el producto. Que el agente en la nube sea de pago está en los límites del plan gratuito, que es donde decide. Del modo agente del editor no se publica en qué planes está, así que no se afirma nada de eso.',
  },

  aider: {
    id: 'tool_aider',
    slug: 'aider',
    name: 'Aider',
    kind: 'agent',
    verification: 'verified',
    categorySlug: 'codigo',
    secondaryCategories: ['agentes', 'herramientas-locales'],
    officialUrl: 'https://aider.chat/',
    repoUrl: 'https://github.com/Aider-AI/aider',
    hosting: 'local',
    openSource: 'yes',
    licence: 'Apache-2.0',
    platforms: ['cli', 'linux', 'macos', 'windows'],
    freeModel: 'open_source',
    tagline: 'Apache 2.0 en tu terminal. El coste es el modelo que le pongas.',
    descriptionShort:
      'Agente de programación en pareja que corre en tu terminal sobre tu repositorio: edita ficheros, ejecuta pruebas y linters, corrige lo que falla y hace los commits. Funciona con Claude, OpenAI, DeepSeek o modelos locales.',
    verdict:
      'El programa es gratis y abierto; lo que gastas es la API del modelo que elijas. Con un modelo local no gastas nada.',
    freePlan: {
      summary:
        'Publicado con licencia Apache 2.0. Sin cuotas ni cuenta: se instala con pip y se ejecuta en tu terminal. El coste, si lo hay, es el del modelo que se conecte — puede ser uno local.',
      limits: [
        'Licencia Apache 2.0',
        'Sin cuenta ni cuotas propias',
        'Necesita un modelo: de pago por API o local',
      ],
      requiresSignup: 'no',
      requiresCreditCard: 'no',
      hasWatermark: 'no',
      commercialUse: 'unverified',
      creditReset: 'none',
      verifiedAt: HOY,
    },
    capabilities: ['repository-editing', 'terminal', 'code-execution'],
    startEffort: 'technical',
    startEffortReason: 'Se instala con pip y hay que darle una clave de API o un modelo local.',
    scores: { freeReal: 9, usefulness: 8, ease: 4, transparency: 9, creatorValue: 8 },
    sources: [
      fuente('https://github.com/Aider-AI/aider', 'Repositorio oficial', 'repo', 'github.com'),
    ],
    evidence: {
      capabilities: {
        sourceUrl: 'https://github.com/Aider-AI/aider',
        verifiedAt: HOY,
        quote:
          'Aider lets you pair program with LLMs to start a new project or build on your existing codebase · Aider automatically commits changes with sensible commit messages · [ejecuta pruebas y linters y corrige los problemas detectados] · Apache-2.0.',
      },
    },
  },

  cline: {
    id: 'tool_cline',
    slug: 'cline',
    name: 'Cline',
    kind: 'agent',
    verification: 'verified',
    categorySlug: 'codigo',
    secondaryCategories: ['agentes', 'herramientas-locales'],
    officialUrl: 'https://cline.bot/',
    repoUrl: 'https://github.com/cline/cline',
    hosting: 'local',
    openSource: 'yes',
    licence: 'Apache-2.0',
    platforms: ['extension', 'cli', 'linux', 'macos', 'windows'],
    freeModel: 'open_source',
    tagline: 'Cada cambio y cada orden pasan por tu aprobación.',
    descriptionShort:
      'Agente de programación abierto que vive en el editor y en la terminal: lee la estructura del proyecto, hace cambios coordinados, ejecuta órdenes de shell y se amplía con servidores MCP. Cada edición y cada orden requieren tu aprobación, o puedes ponerlo en modo autónomo.',
    verdict:
      'La opción para quien quiere ver qué va a hacer antes de que lo haga. Abierto y con tu propia clave de API.',
    freePlan: {
      summary:
        'Publicado con licencia Apache 2.0. Sin cuotas propias: se conecta con la clave de API del proveedor que elijas. El coste, si lo hay, es el del modelo.',
      limits: [
        'Licencia Apache 2.0',
        'Sin cuenta ni cuotas propias',
        'Necesita clave de API de un proveedor, o un modelo local',
      ],
      requiresSignup: 'no',
      requiresCreditCard: 'no',
      hasWatermark: 'no',
      commercialUse: 'unverified',
      creditReset: 'none',
      verifiedAt: HOY,
    },
    capabilities: ['repository-editing', 'terminal', 'tool-use', 'web-browsing'],
    startEffort: 'install',
    startEffortReason: 'Extensión del editor o CLI, más una clave de API.',
    scores: { freeReal: 9, usefulness: 8, ease: 6, transparency: 9, creatorValue: 8 },
    sources: [
      fuente('https://github.com/cline/cline', 'Repositorio oficial', 'repo', 'github.com'),
    ],
    evidence: {
      capabilities: {
        sourceUrl: 'https://github.com/cline/cline',
        verifiedAt: HOY,
        quote:
          'The open source coding agent in your IDE and terminal · executes bash commands and watches output in real time · supports Model Context Protocol servers · every file edit and terminal command requires approval · Apache 2.0 © 2026 Cline Bot Inc.',
      },
    },
  },

  openhands: {
    id: 'tool_openhands',
    slug: 'openhands',
    name: 'OpenHands',
    kind: 'agent',
    verification: 'verified',
    categorySlug: 'codigo',
    secondaryCategories: ['agentes', 'herramientas-locales'],
    officialUrl: 'https://github.com/All-Hands-AI/OpenHands',
    repoUrl: 'https://github.com/All-Hands-AI/OpenHands',
    hosting: 'local',
    openSource: 'yes',
    licence: 'MIT',
    platforms: ['docker', 'cli', 'linux', 'macos', 'windows'],
    freeModel: 'open_source',
    tagline: 'MIT, en tu máquina, y capaz de lanzar otros agentes.',
    descriptionShort:
      'Centro de control autoalojado para agentes de programación, con licencia MIT. Ejecuta órdenes, modifica código y se conecta con Slack, GitHub, Linear o Notion. Puede lanzar agentes propios o de terceros —Claude Code, Codex, Gemini— en máquinas locales, remotas o en la nube.',
    verdict:
      'La respuesta cuando el código no puede salir de tu equipo. Se instala con Docker y la factura la pones tú, en la clave del modelo.',
    freePlan: {
      summary:
        'Publicado con licencia MIT. Se ejecuta en tu máquina con Docker, npm o desde el código fuente, y se conecta con el proveedor de modelo que elijas. Existe un OpenHands Cloud, cuyas condiciones no se detallan en el repositorio.',
      limits: [
        'Licencia MIT',
        'Autoalojado: Docker, npm o código fuente',
        'Necesita un proveedor de modelo',
        'Las condiciones de OpenHands Cloud no se publican en el repositorio',
      ],
      requiresSignup: 'no',
      requiresCreditCard: 'no',
      hasWatermark: 'no',
      commercialUse: 'unverified',
      creditReset: 'none',
      verifiedAt: HOY,
    },
    capabilities: ['repository-editing', 'terminal', 'code-execution', 'integrations', 'multi-agent'],
    startEffort: 'technical',
    startEffortReason: 'Exige Docker o Node y configurar un proveedor de modelo.',
    scores: { freeReal: 9, usefulness: 8, ease: 3, transparency: 8, creatorValue: 8 },
    sources: [
      fuente('https://github.com/All-Hands-AI/OpenHands', 'Repositorio oficial', 'repo', 'github.com'),
    ],
    evidence: {
      capabilities: {
        sourceUrl: 'https://github.com/All-Hands-AI/OpenHands',
        verifiedAt: HOY,
        quote:
          'The self-hosted developer control center for coding agents and automations · run agents like OpenHands, Claude Code, Codex, or Gemini across local, remote, and cloud backends · Docker containers with sandbox isolation · MIT license.',
      },
    },
    auditNotes:
      '`multi-agent` se marca porque orquesta agentes distintos en varios servidores, no porque reparta subtareas dentro de uno. `web-browsing` no se marca: el repositorio no lo documenta.',
  },

  // -------------------------------------------------------------------------
  // D · Plataformas para construir agentes. El producto sirve para crear el tuyo.
  // -------------------------------------------------------------------------

  n8n: {
    id: 'tool_n8n',
    slug: 'n8n',
    name: 'n8n',
    kind: 'platform',
    verification: 'verified',
    categorySlug: 'automatizacion',
    secondaryCategories: ['agentes', 'herramientas-locales'],
    officialUrl: 'https://n8n.io/',
    pricingUrl: 'https://n8n.io/pricing/',
    repoUrl: 'https://github.com/n8n-io/n8n',
    hosting: 'hybrid',
    openSource: 'partial',
    licence: 'Sustainable Use License (fair-code)',
    platforms: ['web', 'docker', 'linux', 'macos', 'windows'],
    freeModel: 'open_source',
    tagline: 'Gratis si te lo montas tú. En su nube sólo hay prueba.',
    descriptionShort:
      'Plataforma de lienzo visual para construir flujos y agentes de varios pasos, con más de 1.500 integraciones y código propio en JavaScript o Python. La versión autoalojada es gratuita bajo licencia fair-code; su nube no tiene capa gratuita permanente, sólo prueba.',
    verdict:
      'La distinción importa: gratis en tu servidor, de pago en el suyo. Y su licencia es fair-code, no open source al uso.',
    freePlan: {
      summary:
        'La versión autoalojada está disponible en GitHub bajo la Sustainable Use License, una licencia fair-code que no es OSI. La nube no tiene plan gratuito permanente: ofrece pruebas de Starter y Pro sin tarjeta, y de Business con tarjeta. El plan de pago más barato es Starter, 20 €/mes con facturación anual y 2.500 ejecuciones.',
      limits: [
        'Autoalojado: gratis, bajo Sustainable Use License (fair-code)',
        'La nube no tiene capa gratuita permanente, sólo prueba',
        'Pruebas de Starter y Pro sin tarjeta; la de Business exige tarjeta',
        'Plan de pago más barato: Starter, 20 €/mes anual (2.500 ejecuciones)',
      ],
      requiresSignup: 'no',
      requiresCreditCard: 'no',
      hasWatermark: 'no',
      commercialUse: 'unverified',
      creditReset: 'none',
      verifiedAt: HOY,
    },
    capabilities: ['workflow-automation', 'integrations', 'tool-use', 'multi-agent'],
    startEffort: 'technical',
    startEffortReason: 'La versión gratuita hay que desplegarla: Docker o servidor propio.',
    scores: { freeReal: 7, usefulness: 9, ease: 5, transparency: 8, creatorValue: 8 },
    sources: [
      fuente('https://n8n.io/pricing/', 'Página oficial de precios', 'pricing', 'n8n.io'),
      fuente('https://github.com/n8n-io/n8n', 'Repositorio oficial', 'repo', 'github.com'),
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://n8n.io/pricing/',
        verifiedAt: HOY,
        quote:
          'A standard, self-hosted version of n8n is available on GitHub · No credit card is required for Starter and Pro trials · A credit card is only required for the Business plan free trial. [Starter: 20 €/mes anual, 2.5K ejecuciones.]',
      },
      capabilities: {
        sourceUrl: 'https://github.com/n8n-io/n8n',
        verifiedAt: HOY,
        quote:
          'Fair-code platform to build and deploy AI agents and workflows · n8n is fair-code distributed under the Sustainable Use License and n8n Enterprise License · AI-Native Automation Platform: Build and operationalize AI workflows and multi-step agents · 1,500+ integrations.',
      },
    },
    auditNotes:
      '`openSource: partial` y no `yes`: fair-code permite ver y autoalojar el código pero no es una licencia OSI, y llamarlo open source sin más induciría a error.',
  },

  'zapier-agents': {
    id: 'tool_zapier-agents',
    slug: 'zapier-agents',
    name: 'Zapier Agents',
    kind: 'platform',
    verification: 'verified',
    categorySlug: 'automatizacion',
    secondaryCategories: ['agentes'],
    officialUrl: 'https://zapier.com/agents',
    pricingUrl: 'https://zapier.com/pricing',
    hosting: 'cloud',
    openSource: 'no',
    platforms: ['web'],
    freeModel: 'credits',
    tagline: 'Cuatrocientas actividades al mes y nueve mil aplicaciones detrás.',
    descriptionShort:
      'Agentes que trabajan sobre el catálogo de integraciones de Zapier: se les da una instrucción y actúan a través de más de 9.000 aplicaciones, con desencadenantes, horarios y datos de la empresa. El plan gratuito incluye 400 actividades de agente al mes.',
    verdict:
      'La vía más corta para que un agente haga algo en las aplicaciones que ya usas, sin escribir código. Lo que se agota son actividades, no mensajes.',
    freePlan: {
      summary:
        'El plan gratuito de Zapier da 100 tareas al mes y «acceso básico a los productos de IA (Agents, Chatbots, MCP)», con 400 actividades de agente al mes. El plan de pago más barato es Professional, 19,99 $/mes con facturación anual y 750 tareas al mes.',
      limits: [
        '400 actividades de agente al mes',
        '100 tareas al mes en el plan gratuito de Zapier',
        'Flujos de dos pasos: desencadenante y una acción',
        'Plan de pago más barato: Professional, 19,99 $/mes anual (750 tareas)',
      ],
      requiresSignup: 'yes',
      requiresCreditCard: 'unverified',
      hasWatermark: 'no',
      commercialUse: 'unverified',
      creditsAmount: '400 actividades/mes',
      creditReset: 'monthly',
      verifiedAt: HOY,
    },
    capabilities: ['integrations', 'workflow-automation', 'tool-use'],
    startEffort: 'signup',
    startEffortReason: 'Cuenta de Zapier y conectar las aplicaciones que vaya a usar.',
    scores: { freeReal: 7, usefulness: 8, ease: 8, transparency: 7, creatorValue: 7 },
    sources: [
      fuente('https://zapier.com/agents', 'Página oficial del producto', 'official', 'zapier.com'),
      fuente('https://zapier.com/pricing', 'Página oficial de precios', 'pricing', 'zapier.com'),
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://zapier.com/pricing',
        verifiedAt: HOY,
        quote:
          'Free — 100 tasks per month · Basic access to AI products (Agents, Chatbots, MCP) · Two-step Zap workflows · [Agents: Free 400/mo activities]. Professional: $19.99/month billed annually, 750 tasks/month.',
      },
      capabilities: {
        sourceUrl: 'https://zapier.com/agents',
        verifiedAt: HOY,
        quote:
          'do work across 9,000+ apps — on command and while you sleep · connect to your business data and perform tasks · equipped with company knowledge through FAQs, docs, and public links.',
      },
    },
  },

  dify: {
    id: 'tool_dify',
    slug: 'dify',
    name: 'Dify',
    kind: 'platform',
    verification: 'verified',
    categorySlug: 'automatizacion',
    secondaryCategories: ['agentes', 'herramientas-locales'],
    officialUrl: 'https://dify.ai/',
    pricingUrl: 'https://dify.ai/pricing',
    repoUrl: 'https://github.com/langgenius/dify',
    hosting: 'hybrid',
    openSource: 'partial',
    licence: 'Dify Open Source License (Apache 2.0 con condiciones)',
    platforms: ['web', 'docker', 'linux'],
    freeModel: 'credits',
    tagline: 'Doscientos créditos en la nube, una vez. Autoalojado, sin límite.',
    descriptionShort:
      'Plataforma para construir aplicaciones y agentes con LLM: lienzo de flujos, canal de RAG, agentes por function calling o ReAct con más de 50 herramientas, y observabilidad. Se autoaloja o se usa en su nube, cuyo plan Sandbox da 200 créditos de mensaje.',
    verdict:
      'Autoalojada es la opción sin cuotas; en su nube, los 200 créditos del Sandbox son de una sola vez, no una capa gratuita permanente.',
    freePlan: {
      summary:
        'El plan Sandbox de la nube da 200 créditos de mensaje, 1 espacio de equipo, 1 miembro, 5 aplicaciones y 50 documentos de conocimiento. La página no documenta que esos créditos se renueven. La versión autoalojada se publica bajo la Dify Open Source License, basada en Apache 2.0 con condiciones adicionales. El plan de pago más barato es Professional, 590 $ por espacio y año.',
      limits: [
        '200 créditos de mensaje en el Sandbox, sin renovación documentada',
        '1 espacio de equipo · 1 miembro · 5 aplicaciones',
        '50 documentos de conocimiento · 50 MB de almacenamiento',
        'Autoalojado: Dify Open Source License (Apache 2.0 con condiciones)',
        'Plan de pago más barato: Professional, 590 $/año por espacio',
      ],
      requiresSignup: 'yes',
      requiresCreditCard: 'unverified',
      hasWatermark: 'no',
      commercialUse: 'unverified',
      creditsAmount: '200 créditos de mensaje',
      creditReset: 'one_off',
      verifiedAt: HOY,
    },
    capabilities: ['workflow-automation', 'tool-use', 'integrations'],
    startEffort: 'signup',
    startEffortReason: 'En su nube basta una cuenta; autoalojarla exige Docker.',
    scores: { freeReal: 5, usefulness: 8, ease: 7, transparency: 7, creatorValue: 7 },
    sources: [
      fuente('https://dify.ai/pricing', 'Página oficial de precios', 'pricing', 'dify.ai'),
      fuente('https://github.com/langgenius/dify', 'Repositorio oficial', 'repo', 'github.com'),
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://dify.ai/pricing',
        verifiedAt: HOY,
        quote:
          'Sandbox — For trying out Dify’s core features: 200 message credits · 1 Team Workspace · 1 Team Member · 5 Apps · 50 Knowledge Documents. [Professional: $590 per workspace/year.]',
      },
      capabilities: {
        sourceUrl: 'https://github.com/langgenius/dify',
        verifiedAt: HOY,
        quote:
          'Dify is an open-source LLM app development platform… combines AI workflow, RAG pipeline, agent capabilities, model management, observability features · You can define agents based on LLM Function Calling or ReAct, and add pre-built or custom tools · This repository is licensed under the Dify Open Source License, based on Apache 2.0 with additional conditions.',
      },
    },
    auditNotes:
      'El Sandbox se registra como `credits` + `one_off` y no como `freemium`: la página no publica renovación, y sin renovación no hay capa permanente.',
  },

  // -------------------------------------------------------------------------
  // E · Frameworks y runtimes. Infraestructura para programar.
  // -------------------------------------------------------------------------

  crewai: {
    id: 'tool_crewai',
    slug: 'crewai',
    name: 'CrewAI',
    kind: 'framework',
    verification: 'verified',
    categorySlug: 'agentes',
    secondaryCategories: ['apis'],
    officialUrl: 'https://www.crewai.com/',
    repoUrl: 'https://github.com/crewAIInc/crewAI',
    hosting: 'local',
    openSource: 'yes',
    licence: 'MIT',
    platforms: ['linux', 'macos', 'windows'],
    freeModel: 'open_source',
    tagline: 'MIT, en Python, y con equipos de agentes que se reparten el trabajo.',
    descriptionShort:
      'Framework de Python con licencia MIT para orquestar agentes con papeles definidos que colaboran y se delegan tareas. Además de los equipos, ofrece flujos por eventos con estado y ramificación condicional. No depende de LangChain.',
    verdict:
      'Para construir el agente, no para usarlo. Si buscas algo que funcione al abrirlo, esto no lo es — y por eso está en otro bloque.',
    freePlan: {
      summary:
        'Biblioteca publicada con licencia MIT. Sin cuotas ni cuenta: se instala con pip. El coste es el del modelo que se conecte.',
      limits: [
        'Licencia MIT',
        'Sin cuenta ni cuotas propias',
        'Necesita un modelo: de pago por API o local',
      ],
      requiresSignup: 'no',
      requiresCreditCard: 'no',
      hasWatermark: 'no',
      commercialUse: 'unverified',
      creditReset: 'none',
      verifiedAt: HOY,
    },
    capabilities: ['multi-agent', 'tool-use', 'workflow-automation'],
    startEffort: 'technical',
    startEffortReason: 'Es una biblioteca de Python: se programa, no se abre.',
    scores: { freeReal: 10, usefulness: 8, ease: 3, transparency: 9, creatorValue: 7 },
    sources: [
      fuente('https://github.com/crewAIInc/crewAI', 'Repositorio oficial', 'repo', 'github.com'),
    ],
    evidence: {
      capabilities: {
        sourceUrl: 'https://github.com/crewAIInc/crewAI',
        verifiedAt: HOY,
        quote:
          'Framework for orchestrating role-playing, autonomous AI agents… empowers agents to work together seamlessly, tackling complex tasks · Crews: role-based teams that handle dynamic task delegation · Flows: precise, event-driven control over complex automations · License: MIT.',
      },
    },
  },

  langgraph: {
    id: 'tool_langgraph',
    slug: 'langgraph',
    name: 'LangGraph',
    kind: 'framework',
    verification: 'verified',
    categorySlug: 'agentes',
    secondaryCategories: ['apis'],
    officialUrl: 'https://www.langchain.com/langgraph',
    repoUrl: 'https://github.com/langchain-ai/langgraph',
    docsUrl: 'https://docs.langchain.com/oss/python/langgraph/overview',
    hosting: 'local',
    openSource: 'yes',
    licence: 'MIT',
    platforms: ['linux', 'macos', 'windows'],
    freeModel: 'open_source',
    tagline: 'Para agentes que duran: memoria larga y ejecución que sobrevive a los fallos.',
    descriptionShort:
      'Framework de orquestación de bajo nivel con licencia MIT, pensado para agentes de larga duración con estado. Documenta memoria de trabajo a corto plazo y memoria persistente entre sesiones, supervisión humana en cualquier punto y ejecución duradera que se reanuda donde se quedó.',
    verdict:
      'La opción cuando el agente tiene que durar horas y sobrevivir a un reinicio. Es infraestructura: se programa.',
    freePlan: {
      summary:
        'Biblioteca publicada con licencia MIT. Sin cuotas ni cuenta. Su plataforma de despliegue y observabilidad, LangSmith, es un producto aparte con sus propias condiciones.',
      limits: [
        'Licencia MIT',
        'Sin cuenta ni cuotas propias',
        'LangSmith, para desplegar y depurar, es un producto de pago aparte',
      ],
      requiresSignup: 'no',
      requiresCreditCard: 'no',
      hasWatermark: 'no',
      commercialUse: 'unverified',
      creditReset: 'none',
      verifiedAt: HOY,
    },
    capabilities: ['memory'],
    startEffort: 'technical',
    startEffortReason: 'Es una biblioteca: se programa el grafo del agente.',
    scores: { freeReal: 10, usefulness: 8, ease: 3, transparency: 9, creatorValue: 7 },
    sources: [
      fuente('https://github.com/langchain-ai/langgraph', 'Repositorio oficial', 'repo', 'github.com'),
      fuente('https://docs.langchain.com/oss/python/langgraph/overview', 'Documentación oficial', 'docs', 'docs.langchain.com'),
    ],
    evidence: {
      capabilities: {
        sourceUrl: 'https://docs.langchain.com/oss/python/langgraph/overview',
        verifiedAt: HOY,
        quote:
          'Create stateful agents with both short-term working memory for ongoing reasoning and long-term memory across sessions · Incorporate human oversight by inspecting and modifying agent state at any point · Build agents that persist through failures and can run for extended periods, resuming from where they left off.',
      },
    },
    auditNotes:
      'Sólo `memory`. La documentación se describe como orquestación y no documenta expresamente ni llamada a herramientas ni sistemas multiagente en su página general; marcarlos sería suponer.',
  },

  'openai-agents-sdk': {
    id: 'tool_openai-agents-sdk',
    slug: 'openai-agents-sdk',
    name: 'OpenAI Agents SDK',
    kind: 'framework',
    verification: 'verified',
    categorySlug: 'agentes',
    secondaryCategories: ['apis'],
    officialUrl: 'https://openai.github.io/openai-agents-python/',
    repoUrl: 'https://github.com/openai/openai-agents-python',
    hosting: 'local',
    openSource: 'yes',
    licence: 'MIT',
    platforms: ['linux', 'macos', 'windows'],
    freeModel: 'open_source',
    tagline: 'MIT y agnóstico: sirve con más de cien modelos, no sólo los de OpenAI.',
    descriptionShort:
      'Framework ligero de OpenAI para flujos multiagente, con licencia MIT. Trae agentes con instrucciones y herramientas, delegación entre agentes, guardarraíles de entrada y salida, sesiones que gestionan el historial, agentes en contenedor para tareas largas y trazas integradas.',
    verdict:
      'El framework oficial de OpenAI que no obliga a usar OpenAI: su propia documentación dice que soporta más de cien modelos.',
    freePlan: {
      summary:
        'Biblioteca publicada con licencia MIT. Sin cuotas ni cuenta propias: el coste es el del modelo que se conecte, y admite los de OpenAI y más de cien más.',
      limits: [
        'Licencia MIT',
        'Sin cuenta ni cuotas propias',
        'Agnóstico de proveedor: más de 100 modelos',
      ],
      requiresSignup: 'no',
      requiresCreditCard: 'no',
      hasWatermark: 'no',
      commercialUse: 'unverified',
      creditReset: 'none',
      verifiedAt: HOY,
    },
    capabilities: ['multi-agent', 'tool-use', 'code-execution', 'memory'],
    startEffort: 'technical',
    startEffortReason: 'Es una biblioteca de Python: se programa.',
    scores: { freeReal: 10, usefulness: 8, ease: 4, transparency: 9, creatorValue: 7 },
    sources: [
      fuente('https://github.com/openai/openai-agents-python', 'Repositorio oficial', 'repo', 'github.com'),
    ],
    evidence: {
      capabilities: {
        sourceUrl: 'https://github.com/openai/openai-agents-python',
        verifiedAt: HOY,
        quote:
          'The OpenAI Agents SDK is a lightweight yet powerful framework for building multi-agent workflows · It is provider-agnostic, supporting the OpenAI Responses and Chat Completions APIs, as well as 100+ other LLMs · Tools: Functions, MCP, and hosted tool integrations · Sandbox agents: preconfigured for container-based long-horizon work · Sessions: automatic conversation history management · MIT license.',
      },
    },
    auditNotes:
      '`memory` viene de «Sessions: automatic conversation history management», que es historial gestionado, no memoria permanente. Es la lectura más estrecha que sostiene la cita.',
  },

  'google-adk': {
    id: 'tool_google-adk',
    slug: 'google-adk',
    name: 'Google Agent Development Kit',
    kind: 'framework',
    verification: 'verified',
    categorySlug: 'agentes',
    secondaryCategories: ['apis'],
    officialUrl: 'https://google.github.io/adk-docs/',
    repoUrl: 'https://github.com/google/adk-python',
    hosting: 'local',
    openSource: 'yes',
    licence: 'Apache-2.0',
    platforms: ['linux', 'macos', 'windows'],
    freeModel: 'open_source',
    tagline: 'Apache 2.0, jerarquías de agentes y evaluación incluida.',
    descriptionShort:
      'Kit de Python con licencia Apache 2.0 para construir, evaluar y desplegar agentes. Trae un motor de ejecución por grafo con rutas, bucles y reintentos, composición de agentes especializados en jerarquías, herramientas propias, OpenAPI y MCP, y despliegue a Cloud Run o Vertex AI.',
    verdict:
      'De los pocos frameworks que traen la evaluación de serie. Está optimizado para Gemini, pero su documentación dice que no depende de él.',
    freePlan: {
      summary:
        'Publicado con licencia Apache 2.0. Sin cuotas ni cuenta propias. El despliegue gestionado en Cloud Run o Vertex AI Agent Engine se factura aparte por Google Cloud.',
      limits: [
        'Licencia Apache 2.0',
        'Sin cuenta ni cuotas propias',
        'El despliegue gestionado en Google Cloud se factura aparte',
      ],
      requiresSignup: 'no',
      requiresCreditCard: 'no',
      hasWatermark: 'no',
      commercialUse: 'unverified',
      creditReset: 'none',
      verifiedAt: HOY,
    },
    capabilities: ['multi-agent', 'tool-use', 'workflow-automation'],
    startEffort: 'technical',
    startEffortReason: 'Kit de Python: se programa el agente y se despliega.',
    scores: { freeReal: 10, usefulness: 8, ease: 3, transparency: 9, creatorValue: 7 },
    sources: [
      fuente('https://github.com/google/adk-python', 'Repositorio oficial', 'repo', 'github.com'),
    ],
    evidence: {
      capabilities: {
        sourceUrl: 'https://github.com/google/adk-python',
        verifiedAt: HOY,
        quote:
          'An open-source, code-first Python toolkit for building, evaluating, and deploying sophisticated AI agents with flexibility and control · graph-based execution engine supporting routing, loops, retry logic, and nested workflows · composition of specialized agents into hierarchical architectures · Pre-built tools, custom functions, OpenAPI specs, and MCP tool integration · Apache 2.0.',
      },
    },
  },

  'microsoft-agent-framework': {
    id: 'tool_microsoft-agent-framework',
    slug: 'microsoft-agent-framework',
    name: 'Microsoft Agent Framework',
    kind: 'framework',
    verification: 'verified',
    categorySlug: 'agentes',
    secondaryCategories: ['apis'],
    officialUrl: 'https://github.com/microsoft/agent-framework',
    repoUrl: 'https://github.com/microsoft/agent-framework',
    hosting: 'local',
    openSource: 'yes',
    licence: 'MIT',
    platforms: ['linux', 'macos', 'windows'],
    freeModel: 'open_source',
    tagline: 'El sucesor de AutoGen, en Python y .NET.',
    descriptionShort:
      'Framework multilenguaje con licencia MIT para agentes y flujos multiagente en .NET y Python. Trae patrones de grafo —secuencial, concurrente, traspaso, colaboración en grupo—, middleware, puntos de control, humano en el bucle y observabilidad con OpenTelemetry. Su propio repositorio lo presenta como el sucesor de AutoGen.',
    verdict:
      'Si estabas mirando AutoGen, mira esto: AutoGen ya no recibe funciones nuevas y su repositorio señala aquí.',
    freePlan: {
      summary:
        'Publicado con licencia MIT, para Python y .NET. Sin cuotas ni cuenta propias: el coste es el del modelo que se conecte.',
      limits: [
        'Licencia MIT',
        'Python y .NET',
        'Sin cuenta ni cuotas propias',
      ],
      requiresSignup: 'no',
      requiresCreditCard: 'no',
      hasWatermark: 'no',
      commercialUse: 'unverified',
      creditReset: 'none',
      verifiedAt: HOY,
    },
    capabilities: ['multi-agent', 'tool-use', 'workflow-automation'],
    startEffort: 'technical',
    startEffortReason: 'Biblioteca de Python o .NET: se programa.',
    scores: { freeReal: 10, usefulness: 8, ease: 3, transparency: 9, creatorValue: 7 },
    sources: [
      fuente('https://github.com/microsoft/agent-framework', 'Repositorio oficial', 'repo', 'github.com'),
      fuente('https://github.com/microsoft/autogen', 'Repositorio de AutoGen: estado', 'repo', 'github.com'),
    ],
    evidence: {
      capabilities: {
        sourceUrl: 'https://github.com/microsoft/agent-framework',
        verifiedAt: HOY,
        quote:
          'an open, multi-language framework for building production-grade AI agents and multi-agent workflows in .NET and Python · graph-based patterns (sequential, concurrent, handoff, group collaboration) · agent skills and tool integration across multiple LLM providers · MIT license.',
      },
      status: {
        sourceUrl: 'https://github.com/microsoft/autogen',
        verifiedAt: HOY,
        quote:
          'AutoGen is in maintenance mode and will not receive new features. Microsoft Agent Framework (MAF) is the enterprise-ready successor to AutoGen.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Fichas existentes que esta ronda corrige
// ---------------------------------------------------------------------------

const CORREGIDAS = {
  /*
   * Cursor ya estaba en el catálogo como `free_real` con la capacidad vaga
   * `agents`. Su plan Hobby es gratuito y sin tarjeta, pero limita las
   * peticiones de agente, así que `freemium` describe mejor lo que hay.
   */
  cursor: {
    verification: 'verified',
    officialUrl: 'https://cursor.com/',
    pricingUrl: 'https://cursor.com/pricing',
    docsUrl: 'https://cursor.com/docs/agent/overview',
    secondaryCategories: ['agentes'],
    freeModel: 'freemium',
    tagline: 'Plan gratuito sin tarjeta, con las peticiones de agente limitadas.',
    descriptionShort:
      'Editor de código con un agente que completa tareas por su cuenta: busca en el proyecto y en la web, edita varios ficheros, ejecuta órdenes de terminal y controla un navegador para comprobar el resultado. El plan Hobby es gratuito y no pide tarjeta, con peticiones de agente limitadas.',
    verdict:
      'La forma más cómoda de probar un agente de código sin instalar nada raro ni dar una tarjeta. Cuántas peticiones entran en el plan gratuito, no lo publica.',
    freePlan: {
      summary:
        'Plan Hobby gratuito, sin tarjeta, con peticiones de agente limitadas y acceso a Composer. La cantidad exacta no se publica. El plan de pago más barato es Pro, 20 $/mes, que amplía los límites del agente y añade MCP, hooks y agentes en la nube.',
      limits: [
        'Peticiones de agente limitadas: la cantidad no se publica',
        'Acceso a Composer',
        'No pide tarjeta',
        'Plan de pago más barato: Pro, 20 $/mes',
      ],
      requiresSignup: 'yes',
      requiresCreditCard: 'no',
      hasWatermark: 'no',
      commercialUse: 'unverified',
      creditReset: 'unknown',
      verifiedAt: HOY,
    },
    capabilities: ['repository-editing', 'terminal', 'web-browsing', 'tool-use'],
    startEffort: 'install',
    startEffortReason: 'Es un editor que se descarga e instala; después basta una cuenta.',
    sources: [
      fuente('https://cursor.com/pricing', 'Página oficial de precios', 'pricing', 'cursor.com'),
      fuente('https://cursor.com/docs/agent/overview', 'Documentación oficial del agente', 'docs', 'cursor.com'),
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://cursor.com/pricing',
        verifiedAt: HOY,
        quote: 'Hobby — Free: No credit card required · Limited Agent requests · Access to Composer. [Pro: $20/mo.]',
      },
      capabilities: {
        sourceUrl: 'https://cursor.com/docs/agent/overview',
        verifiedAt: HOY,
        quote:
          'complete complex coding tasks independently, run terminal commands, and edit code · search your codebase and the web to find relevant information, make edits to your files, run terminal commands · There is no limit on the number of tool calls Agent can make during a task.',
      },
    },
    auditNotes:
      'Pasa de `free_real` a `freemium`: hay plan gratuito permanente, pero con las peticiones de agente limitadas y sin cifra publicada. `computer-use` no se marca: controla un navegador, no tu ordenador.',
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
