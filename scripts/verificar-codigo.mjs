#!/usr/bin/env node
/**
 * La vertical de código, verificada contra la documentación de cada fabricante.
 *
 * Todo lo que escribe este fichero salió de una página oficial abierta el 21 de
 * agosto de 2026. Donde la fuente no lo dice, el campo se queda sin afirmar.
 *
 * ---------------------------------------------------------------------------
 * CINCO PRODUCTOS DISTINTOS CON LAS MISMAS DOS PALABRAS
 * ---------------------------------------------------------------------------
 *
 * `codigo` tenía doce fichas y las doce eran `kind: 'agent'`. Por eso la
 * categoría era, en la práctica, «agentes que programan» — y ahí dentro estaba
 * Cursor, que es un editor; GitHub Copilot, que es un autocompletado; Bolt, que
 * construye una aplicación desde una descripción; y Aider, que vive en la
 * terminal. Compararlas en una lista plana no contesta ninguna pregunta.
 *
 * La distinción no sale de las capacidades: Cursor y Cline editan repositorios
 * y usan la terminal exactamente igual. Sale de qué es cada cosa, y eso se
 * escribe a mano en `productType`.
 *
 * La separación que más importa es la última: **crear una aplicación desde una
 * idea no es trabajar sobre un repositorio que ya existe**. Lovable, Bolt y v0
 * empiezan de cero y te devuelven algo desplegable; Claude Code, Cline y Codex
 * abren tu proyecto y lo modifican. Ponerlos en la misma lista ordenada sería
 * responder una pregunta que nadie ha hecho.
 *
 * ---------------------------------------------------------------------------
 * LA HERENCIA QUE ESTA VERTICAL PROHÍBE
 * ---------------------------------------------------------------------------
 *
 * Que una marca tenga plan gratuito no hace gratis su producto agéntico, y
 * GitHub lo escribe con todas las letras: Copilot Free incluye 2.000
 * completados al mes y chat, y su propia página de planes excluye
 * expresamente «Agents / coding agent», «Code review» y «Agent mode». El
 * autocompletado es gratis; el agente no.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RUTA = resolve(ROOT, 'src/data/tools-v2.json');
const HOY = '2026-08-21';
const PROXIMA = '2026-11-19';

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
  categorySlug: 'codigo',
  licences: {},
  access: {},
};

const src = (url, label, kind, publisher) => ({ url, label, kind, publisher, checkedAt: HOY });

// ---------------------------------------------------------------------------
// Fichas nuevas
// ---------------------------------------------------------------------------

const NUEVAS = {
  lovable: {
    name: 'Lovable',
    kind: 'app',
    productType: 'app-builder',
    verification: 'verified',
    officialUrl: 'https://lovable.dev/',
    pricingUrl: 'https://lovable.dev/pricing',
    hosting: 'cloud',
    openSource: 'no',
    platforms: ['web'],
    freeModel: 'credits',
    tagline: 'Cinco créditos de construcción al día, con tope de treinta al mes.',
    descriptionShort:
      'Construye una aplicación web desde una descripción y la despliega. Su plan gratuito reparte cinco créditos de construcción al día —hasta treinta al mes— más veinte créditos de nube mensuales y cuatro para las funciones de IA que incorpores a lo que crees.',
    verdict:
      'Empieza de cero: no abre tu repositorio, te devuelve uno. Los créditos diarios con tope mensual son una forma poco común de racionar, y conviene leerla antes de planificar una tarde.',
    freePlan: {
      summary:
        'Plan gratuito con cinco créditos de construcción al día, hasta un máximo de treinta al mes. Incluye veinte créditos de nube mensuales y cuatro créditos utilizables por las funciones de IA integradas en las aplicaciones que generes.',
      limits: [
        '5 créditos de construcción al día (máximo 30 al mes)',
        '20 créditos de nube al mes',
        '4 créditos para las funciones de IA de tus aplicaciones',
      ],
      requiresSignup: 'yes',
      requiresCreditCard: 'unverified',
      hasWatermark: 'unverified',
      commercialUse: 'unverified',
      creditsAmount: '5 créditos/día (tope de 30/mes)',
      creditReset: 'daily',
      verifiedAt: HOY,
    },
    capabilities: ['code-generation', 'integrations'],
    startEffort: 'signup',
    startEffortReason: 'Se describe lo que quieres en el navegador; no hace falta instalar nada.',
    scores: { freeReal: 6, usefulness: 8, ease: 9, transparency: 8, creatorValue: 7 },
    sources: [
      src('https://lovable.dev/', 'Web oficial', 'official', 'lovable.dev'),
      src('https://lovable.dev/pricing', 'Precios oficiales', 'pricing', 'lovable.dev'),
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://lovable.dev/pricing',
        verifiedAt: HOY,
        quote:
          'daily grant of 5 build credits (up to 30 a month) · monthly grants of 20 Cloud credits · 4 credits usable by AI features built into user apps',
      },
    },
  },

  'amazon-q-developer': {
    name: 'Amazon Q Developer',
    kind: 'app',
    productType: 'copilot',
    verification: 'verified',
    officialUrl: 'https://aws.amazon.com/q/developer/',
    pricingUrl: 'https://aws.amazon.com/q/developer/pricing/',
    hosting: 'cloud',
    openSource: 'no',
    platforms: ['web', 'api'],
    freeModel: 'freemium',
    tagline: 'Cincuenta peticiones agénticas al mes y mil líneas de transformación.',
    descriptionShort:
      'El asistente de programación de AWS, con sugerencias de código en el editor y peticiones agénticas. Su capa gratuita da cincuenta peticiones agénticas al mes y mil líneas de código de transformación, y permite suprimir las sugerencias que coincidan con código público.',
    verdict:
      'La capa gratuita publica sus dos cifras, que en esta vertical es más de lo que hace casi nadie. Cincuenta peticiones agénticas al mes dan para probarlo, no para vivir de ello.',
    freePlan: {
      summary:
        'Capa gratuita con cincuenta peticiones agénticas al mes y mil líneas de código al mes en transformaciones. Incluye la supresión de sugerencias que coincidan con código público. El plan Pro cuesta 19 $ al mes por usuario.',
      limits: [
        '50 peticiones agénticas al mes',
        '1.000 líneas de código al mes en transformaciones',
        'Supresión de sugerencias de código público',
        'Plan de pago: Pro, 19 $/mes por usuario',
      ],
      requiresSignup: 'yes',
      requiresCreditCard: 'unverified',
      hasWatermark: 'unverified',
      commercialUse: 'unverified',
      creditsAmount: '50 peticiones agénticas/mes',
      creditReset: 'monthly',
      verifiedAt: HOY,
    },
    capabilities: ['code-generation', 'repository-editing', 'tool-use'],
    startEffort: 'signup',
    startEffortReason: 'Requiere cuenta de AWS y la extensión en el editor.',
    scores: { freeReal: 6, usefulness: 7, ease: 5, transparency: 8, creatorValue: 6 },
    sources: [
      src('https://aws.amazon.com/q/developer/pricing/', 'Precios oficiales', 'pricing', 'aws.amazon.com'),
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://aws.amazon.com/q/developer/pricing/',
        verifiedAt: HOY,
        quote:
          'Free Tier: 50 agentic requests per month · 1,000 lines of code per month · Suppress public code suggestions. Pro: $19 per month per user.',
      },
    },
  },

  'jetbrains-ai': {
    name: 'JetBrains AI',
    kind: 'app',
    productType: 'copilot',
    verification: 'partially_verified',
    officialUrl: 'https://www.jetbrains.com/ai-ides/',
    pricingUrl: 'https://www.jetbrains.com/help/ai-assistant/licensing-and-subscriptions.html',
    hosting: 'cloud',
    openSource: 'no',
    platforms: ['windows', 'macos', 'linux'],
    freeModel: 'credits',
    tagline: 'Tres créditos cada treinta días, y no en todas las ediciones.',
    descriptionShort:
      'La capa de IA integrada en los entornos de JetBrains. Su nivel gratuito, AI Free, incluye tres créditos de IA cada treinta días, y su documentación advierte de dónde no está disponible: ni en Android Studio ni en las ediciones Community de PyCharm e IntelliJ IDEA.',
    verdict:
      'La restricción por edición decide más que la cuota: si usas IntelliJ IDEA Community, AI Free no existe para ti. Conviene comprobarlo antes que la cifra.',
    freePlan: {
      summary:
        'AI Free incluye tres créditos de IA cada treinta días. No está disponible en Android Studio ni en las ediciones Community de PyCharm e IntelliJ IDEA. Disponible desde la versión 2025.1 de la mayoría de los entornos.',
      limits: [
        '3 créditos de IA cada 30 días',
        'No disponible en Android Studio',
        'No disponible en las ediciones Community de PyCharm e IntelliJ IDEA',
      ],
      requiresSignup: 'yes',
      requiresCreditCard: 'unverified',
      hasWatermark: 'unverified',
      commercialUse: 'unverified',
      creditsAmount: '3 créditos/30 días',
      creditReset: 'monthly',
      verifiedAt: HOY,
    },
    capabilities: ['code-generation'],
    startEffort: 'install',
    startEffortReason: 'Va dentro de un entorno de JetBrains ya instalado.',
    scores: { freeReal: 4, usefulness: 7, ease: 7, transparency: 6, creatorValue: 5 },
    sources: [
      src('https://www.jetbrains.com/help/ai-assistant/licensing-and-subscriptions.html', 'Documentación oficial de licencias', 'docs', 'jetbrains.com'),
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://www.jetbrains.com/help/ai-assistant/licensing-and-subscriptions.html',
        verifiedAt: HOY,
        quote:
          '3 AI Credits per 30-days. The AI Free license tier is not available in Android Studio [and] in Community Editions of PyCharm and IntelliJ IDEA.',
      },
    },
    auditNotes:
      'El precio del plan de pago se queda fuera: la misma página muestra dos cifras distintas para AI Pro (10 $ y 20 $) y no hay forma de saber cuál está vigente. Publicar una de las dos sería elegir al azar.',
  },
};

// ---------------------------------------------------------------------------
// Fichas existentes: tipo de producto y correcciones
// ---------------------------------------------------------------------------

const TIPOS = {
  cursor: 'ide',
  'github-copilot': 'copilot',
  'claude-code': 'cli',
  'gemini-cli': 'cli',
  aider: 'cli',
  codex: 'agent',
  devin: 'agent',
  cline: 'agent',
  openhands: 'agent',
  'replit-agent': 'agent',
  'bolt-new': 'app-builder',
  'v0-by-vercel': 'app-builder',
};

const CORREGIDAS = {
  cursor: {
    verification: 'verified',
    pricingUrl: 'https://cursor.com/pricing',
    tagline: 'Editor completo, plan Hobby sin tarjeta y con peticiones limitadas.',
    descriptionShort:
      'Un editor de código con IA integrada, no una extensión: sustituye al editor. Su plan Hobby no pide tarjeta y da acceso a Composer con «peticiones de agente limitadas», sin publicar cuántas.',
    freePlan: {
      summary:
        'Plan Hobby gratuito que no pide tarjeta, con peticiones de agente limitadas y acceso a Composer. La cantidad no se publica. El plan de pago más barato es Individual, 20 $ al mes.',
      limits: [
        'Sin tarjeta',
        'Peticiones de agente limitadas: la cantidad no se publica',
        'Acceso a Composer',
        'Plan de pago más barato: Individual, 20 $/mes',
      ],
      requiresSignup: 'yes',
      requiresCreditCard: 'no',
      hasWatermark: 'unverified',
      commercialUse: 'unverified',
      creditReset: 'unknown',
      verifiedAt: HOY,
    },
    sources: [
      src('https://cursor.com/pricing', 'Precios oficiales', 'pricing', 'cursor.com'),
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://cursor.com/pricing',
        verifiedAt: HOY,
        quote: 'Hobby — No credit card required · Limited Agent requests · Access to Composer. Individual: $20 / mo.',
      },
    },
  },

  'github-copilot': {
    verification: 'verified',
    pricingUrl: 'https://docs.github.com/en/copilot/about-github-copilot/plans-for-github-copilot',
    tagline: 'El autocompletado es gratis. El agente, la revisión y el modo agente, no.',
    descriptionShort:
      'El autocompletado de GitHub, con chat en el editor y en la web. Su plan gratuito da 2.000 completados al mes y selección automática de modelo, y su propia página de planes excluye expresamente los agentes, la revisión de código y el modo agente.',
    verdict:
      'Es el ejemplo de por qué no se puede heredar el acceso de la marca al producto: Copilot tiene plan gratuito y el agente de Copilot no está en él.',
    freePlan: {
      summary:
        'Copilot Free da 2.000 completados en línea al mes, chat en los entornos y en GitHub, y selección automática de modelo. Quedan fuera del plan gratuito los agentes y el agente de programación, la revisión de código, el modo agente y la selección de modelos avanzados. El plan de pago más barato es Pro, 10 $ al mes.',
      limits: [
        '2.000 completados en línea al mes',
        'Sólo selección automática de modelo',
        'NO incluye agentes ni agente de programación',
        'NO incluye revisión de código ni modo agente',
        'Plan de pago más barato: Pro, 10 $/mes',
      ],
      requiresSignup: 'yes',
      requiresCreditCard: 'no',
      hasWatermark: 'unverified',
      commercialUse: 'unverified',
      creditsAmount: '2.000 completados/mes',
      creditReset: 'monthly',
      verifiedAt: HOY,
    },
    capabilities: ['code-generation', 'repository-editing', 'code-execution', 'terminal', 'tool-use'],
    sources: [
      src('https://docs.github.com/en/copilot/about-github-copilot/plans-for-github-copilot', 'Planes oficiales', 'docs', 'github.com'),
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://docs.github.com/en/copilot/about-github-copilot/plans-for-github-copilot',
        verifiedAt: HOY,
        quote:
          'Copilot Free: limited access to a selection of Copilot features [...] 2000 completions per month · Auto model selection only. Not included: Agents / coding agent, Code review, Agent mode, Copilot Chat skills in IDEs. GitHub Copilot Pro: $10 USD per month.',
      },
    },
    auditNotes:
      'Las capacidades describen el producto completo; lo que el plan gratuito no incluye está en los límites, que es donde decide.',
  },

  'bolt-new': {
    verification: 'verified',
    officialUrl: 'https://bolt.new/',
    pricingUrl: 'https://bolt.new/pricing',
    tagline: 'Trescientos mil tokens al día, un millón al mes.',
    descriptionShort:
      'Construye una aplicación web desde una descripción, en el navegador, y la despliega. Su plan gratuito reparte 300.000 tokens al día con un tope de un millón al mes.',
    verdict:
      'Empieza de cero: no abre tu repositorio. Las dos cifras —diaria y mensual— están publicadas, que es más de lo que hacen casi todos sus competidores.',
    freePlan: {
      summary:
        'Plan gratuito con un límite de 300.000 tokens al día y un millón de tokens al mes. El plan de pago más barato es Pro, 25 $ al mes con facturación mensual.',
      limits: [
        '300.000 tokens al día',
        '1.000.000 de tokens al mes',
        'Plan de pago más barato: Pro, 25 $/mes',
      ],
      requiresSignup: 'yes',
      requiresCreditCard: 'unverified',
      hasWatermark: 'unverified',
      commercialUse: 'unverified',
      creditsAmount: '300.000 tokens/día (1M/mes)',
      creditReset: 'daily',
      verifiedAt: HOY,
    },
    capabilities: ['code-generation'],
    startEffort: 'signup',
    startEffortReason: 'Se describe lo que quieres en el navegador; no hace falta instalar nada.',
    sources: [
      src('https://bolt.new/pricing', 'Precios oficiales', 'pricing', 'bolt.new'),
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://bolt.new/pricing',
        verifiedAt: HOY,
        quote: '300K tokens daily limit · 1M tokens per month · Pro: $25 per month billed monthly',
      },
    },
  },

  'v0-by-vercel': {
    verification: 'verified',
    officialUrl: 'https://v0.app/',
    pricingUrl: 'https://v0.app/pricing',
    tagline: 'Cinco dólares en créditos al mes y siete mensajes al día.',
    descriptionShort:
      'Genera interfaces y aplicaciones web desde una descripción, con vista previa y despliegue en Vercel. Su plan gratuito incluye cinco dólares mensuales en créditos y un límite de siete mensajes al día.',
    verdict:
      'Los dos límites conviven y el que primero te frena es el diario: siete mensajes se gastan en una tarde de pruebas aunque queden créditos.',
    freePlan: {
      summary:
        'Plan gratuito con cinco dólares en créditos mensuales incluidos y un límite de siete mensajes al día. El plan de pago más barato es Plus, 30 $ al mes por usuario.',
      limits: [
        '5 $ en créditos incluidos al mes',
        '7 mensajes al día',
        'Plan de pago más barato: Plus, 30 $/mes por usuario',
      ],
      requiresSignup: 'yes',
      requiresCreditCard: 'unverified',
      hasWatermark: 'unverified',
      commercialUse: 'unverified',
      creditsAmount: '5 $/mes en créditos · 7 mensajes/día',
      creditReset: 'daily',
      verifiedAt: HOY,
    },
    capabilities: ['code-generation', 'api'],
    startEffort: 'signup',
    startEffortReason: 'Se describe lo que quieres en el navegador; no hace falta instalar nada.',
    sources: [
      src('https://v0.app/pricing', 'Precios oficiales', 'pricing', 'v0.app'),
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://v0.app/pricing',
        verifiedAt: HOY,
        quote: '$5 of included monthly credits · 7 message/day limit · Plus: $30/user/month',
      },
    },
  },
};

// ---------------------------------------------------------------------------

const resumen = { nuevas: [], corregidas: [], tipadas: [] };

for (const [slug, campos] of Object.entries(NUEVAS)) {
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

for (const [slug, tipo] of Object.entries(TIPOS)) {
  const ficha = porSlug.get(slug);
  if (!ficha) throw new Error(`No existe la ficha "${slug}".`);
  ficha.productType = tipo;
  resumen.tipadas.push(`${slug}=${tipo}`);
}

for (const ficha of catalogo) {
  if (!ficha.access) ficha.access = {};
  if (!ficha.licences) ficha.licences = {};
}

catalogo.sort((a, b) => a.slug.localeCompare(b.slug, 'es'));
writeFileSync(RUTA, `${JSON.stringify(catalogo, null, 2)}\n`, 'utf8');

console.log(`Nuevas (${resumen.nuevas.length}): ${resumen.nuevas.join(', ')}`);
console.log(`Corregidas (${resumen.corregidas.length}): ${resumen.corregidas.join(', ')}`);
console.log(`Tipadas (${resumen.tipadas.length}): ${resumen.tipadas.join(' · ')}`);
console.log(`\nTotal del catálogo: ${catalogo.length}`);
