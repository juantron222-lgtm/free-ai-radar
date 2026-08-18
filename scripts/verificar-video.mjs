#!/usr/bin/env node
/**
 * La vertical de vídeo, verificada contra fuente oficial.
 *
 * Todo lo que escribe este fichero salió de una página oficial abierta el 15 de
 * agosto de 2026. Donde la fuente no lo dice, el campo se queda sin afirmar.
 *
 * La distinción que más trabajo hace aquí es la que separa tres cosas que el
 * catálogo anterior llamaba igual:
 *
 *   `credits` + `one_off`  Runway: 125 créditos que se gastan y no vuelven.
 *   `credits` + `monthly`  Pika: 80 al mes, todos los meses.
 *   `freemium`             Kling: capa gratuita permanente, sin cifra publicada.
 *
 * La ficha de Runway decía `freemium`, que promete una capa permanente. No lo
 * es: son 125 créditos de una sola vez. Es la misma clase de error que decía de
 * Midjourney que tenía prueba gratuita.
 *
 * Y una regla que descarta el dato más llamativo de la ronda: Hailuo anuncia
 * «3,000 Free Credits» por descargar su aplicación. Es una promoción, no una
 * capa gratuita, y una promoción no se registra como acceso permanente.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RUTA = resolve(ROOT, 'src/data/tools-v2.json');
const HOY = '2026-08-15';
const PROXIMA = '2026-11-13';

const catalogo = JSON.parse(readFileSync(RUTA, 'utf8'));
const porSlug = new Map(catalogo.map((t) => [t.slug, t]));

const PLANTILLA = {
  /*
   * `skillLevel` sigue aquí y no se ve en ninguna parte.
   *
   * Se retiró de la interfaz —lo sustituye `startEffort`, que describe la
   * herramienta y no al lector— pero la columna del espejo es NOT NULL, así que
   * una ficha sin él rompe la sincronización con «null value in column
   * skill_level», un error que no menciona ni la ficha ni el campo. Se rellena
   * con el valor por defecto del esquema y no se usa para nada más.
   */
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
};

// ---------------------------------------------------------------------------
// Fichas existentes que la verificación corrige
// ---------------------------------------------------------------------------

const CORREGIDAS = {
  runwayml: {
    verification: 'verified',
    officialUrl: 'https://runway.com/',
    pricingUrl: 'https://runway.com/pricing',
    freeModel: 'credits',
    tagline: '125 créditos para probar. No se renuevan.',
    descriptionShort:
      'Estudio de vídeo generativo con modelos propios y de terceros. Su plan gratuito da 125 créditos de una sola vez —la propia página los llama «one-time»— y no vuelven al mes siguiente. El plan más barato cuesta 12 $/mes en anual.',
    verdict:
      'Sirve para probar, no para trabajar sin pagar. La diferencia importa: 125 créditos que no se renuevan no son una capa gratuita, y la ficha anterior los presentaba como freemium.',
    freePlan: {
      summary:
        'Plan gratuito con 125 créditos «one-time» que no se renuevan. La eliminación de marca de agua figura como característica del plan Standard en adelante. El plan de pago más barato es Standard, 12 $/mes facturado anualmente, con 625 créditos al mes.',
      limits: [
        '125 créditos, una sola vez: no se renuevan',
        'La eliminación de marca de agua empieza en el plan Standard',
        'Plan de pago más barato: Standard, 12 $/mes en anual (625 créditos/mes)',
      ],
      requiresSignup: 'yes',
      requiresCreditCard: 'unverified',
      hasWatermark: 'unverified',
      commercialUse: 'unverified',
      creditsAmount: '125 créditos (una vez)',
      creditReset: 'one_off',
      verifiedAt: HOY,
    },
    capabilities: ['text-to-video', 'image-to-video', 'video-editing', 'text-to-image'],
    startEffort: 'signup',
    startEffortReason: 'Requiere cuenta antes de generar; los créditos van asociados a ella.',
    sources: [
      { url: 'https://runway.com/', label: 'Web oficial', kind: 'official', publisher: 'runway.com', checkedAt: HOY },
      { url: 'https://runway.com/pricing', label: 'Página oficial de precios', kind: 'pricing', publisher: 'runway.com', checkedAt: HOY },
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://runway.com/pricing',
        verifiedAt: HOY,
        quote: '125 one-time credits to explore Runway’s AI tools',
      },
    },
    auditNotes:
      'La ficha decía `freemium`. La página dice «one-time»: es `credits` con `one_off`, que es una tercera cosa distinta de freemium y de trial. La marca de agua queda sin confirmar: que «No watermarks» aparezca como característica de Standard sugiere que el gratuito la lleva, pero sugerir no es afirmar.',
  },

  'pika-labs': {
    verification: 'verified',
    officialUrl: 'https://pika.art/',
    pricingUrl: 'https://pika.art/pricing',
    freeModel: 'credits',
    tagline: '80 créditos de vídeo al mes y descarga sin marca de agua.',
    descriptionShort:
      'Generador de vídeo con efectos propios —Pikaffects, Pikascenes, Pikaswaps— y descarga sin marca de agua incluso en el plan gratuito. Los 80 créditos mensuales se renuevan, y el modelo del plan gratuito genera a 480p.',
    verdict:
      'Uno de los pocos planes gratuitos de vídeo que publica cantidad, frecuencia y política de marca de agua. La contrapartida está en la resolución: 480p.',
    freePlan: {
      summary:
        'Plan gratuito con 80 créditos de vídeo al mes. La descarga es sin marca de agua. Acceso a Pika 2.5 sólo a 480p y a los efectos propios en modo imagen a vídeo. El plan de pago más barato es Standard, 8 $/mes en anual, con 700 créditos.',
      limits: [
        '80 créditos de vídeo al mes',
        'Pika 2.5 sólo a 480p',
        'Pikascenes, Pikadditions, Pikaswaps, Pikatwists y Pikaffects sólo de imagen a vídeo',
        'Descarga sin marca de agua',
        'Plan de pago más barato: Standard, 8 $/mes en anual (700 créditos)',
      ],
      requiresSignup: 'yes',
      requiresCreditCard: 'unverified',
      hasWatermark: 'no',
      commercialUse: 'unverified',
      creditsAmount: '80 créditos de vídeo/mes',
      creditReset: 'monthly',
      verifiedAt: HOY,
    },
    capabilities: ['text-to-video', 'image-to-video', 'video-editing'],
    startEffort: 'signup',
    startEffortReason: 'Requiere cuenta; los créditos mensuales van asociados a ella.',
    sources: [
      { url: 'https://pika.art/', label: 'Web oficial', kind: 'official', publisher: 'pika.art', checkedAt: HOY },
      { url: 'https://pika.art/pricing', label: 'Página oficial de precios', kind: 'pricing', publisher: 'pika.art', checkedAt: HOY },
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://pika.art/pricing',
        verifiedAt: HOY,
        quote:
          '80 monthly video credits · Download videos with no watermark · Access to Pika 2.5 (480p only) · Pikascenes, Pikadditions, Pikaswaps, Pikatwists, Pikaffects Image-to-Video only',
      },
    },
    auditNotes:
      '`hasWatermark: no` es de las pocas veces que este campo puede afirmarse: la página lo dice del plan gratuito con esas palabras. Uso comercial y tarjeta siguen sin constar.',
  },
};

// ---------------------------------------------------------------------------
// Fichas nuevas
// ---------------------------------------------------------------------------

const NUEVAS = {
  'luma-dream-machine': {
    id: 'tool_luma-dream-machine',
    slug: 'luma-dream-machine',
    name: 'Luma',
    kind: 'app',
    verification: 'verified',
    categorySlug: 'video',
    officialUrl: 'https://lumalabs.ai/',
    pricingUrl: 'https://lumalabs.ai/#pricing',
    hosting: 'cloud',
    openSource: 'no',
    platforms: ['web'],
    freeModel: 'paid_only',
    tagline: 'Sin plan gratuito desde que se reconvirtió en «Luma Agents».',
    descriptionShort:
      'Plataforma de agentes creativos que orquesta modelos propios (Ray) y de terceros sobre imagen y vídeo. Su tabla de planes empieza en Plus, 30 $/mes: no aparece ningún plan gratuito.',
    verdict:
      'Figura en el catálogo precisamente porque mucha gente la busca esperando generaciones gratuitas. Hoy no las hay: el plan más barato son 30 $ al mes.',
    freePlan: {
      summary:
        'No hay plan gratuito. La tabla de precios oficial empieza en Plus, 30 $/mes con 10.000 créditos y uso comercial incluido. No se publica ninguna capa gratuita ni prueba.',
      limits: [
        'Sin plan gratuito ni prueba publicada',
        'Plan más barato: Plus, 30 $/mes (25 $/mes en anual), 10.000 créditos',
        'El uso comercial figura como característica de los planes de pago',
      ],
      requiresSignup: 'yes',
      requiresCreditCard: 'unverified',
      hasWatermark: 'unverified',
      commercialUse: 'unverified',
      creditReset: 'none',
      verifiedAt: HOY,
    },
    capabilities: ['text-to-video', 'image-to-video', 'video-editing', 'lip-sync'],
    startEffort: 'signup',
    startEffortReason: 'Cuenta y suscripción de pago antes de generar: no hay vía gratuita.',
    scores: { freeReal: 1, usefulness: 9, ease: 7, transparency: 7, creatorValue: 5 },
    sources: [
      { url: 'https://lumalabs.ai/', label: 'Web y precios oficiales', kind: 'pricing', publisher: 'lumalabs.ai', checkedAt: HOY },
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://lumalabs.ai/',
        verifiedAt: HOY,
        quote:
          'Plans & Pricing — Individual plans: Plus $30/month · 10,000 credits · Luma and third-party image and video models · Commercial use. [Ningún plan gratuito en la tabla.]',
      },
      capabilities: {
        sourceUrl: 'https://lumalabs.ai/',
        verifiedAt: HOY,
        quote:
          'Luma FAQs — Can I edit existing images or videos? · Can I create videos from images? · Can I add voiceovers and audio? · Does Luma Agents support lip sync?',
      },
    },
    auditNotes:
      'La marca «Dream Machine» ya no encabeza el producto; la web habla de Luma Agents. El slug conserva el nombre por el que se la busca.',
  },

  klingai: {
    id: 'tool_klingai',
    slug: 'klingai',
    name: 'Kling AI',
    kind: 'app',
    verification: 'verified',
    categorySlug: 'video',
    officialUrl: 'https://app.klingai.com/',
    pricingUrl: 'https://app.klingai.com/global/membership/membership-plan',
    hosting: 'cloud',
    openSource: 'no',
    platforms: ['web'],
    freeModel: 'freemium',
    tagline: 'Plan gratuito permanente, pero lo que generes no se puede usar comercialmente.',
    descriptionShort:
      'Generador de vídeo e imagen de Kuaishou. Su plan Basic es gratuito y permanente, y la propia tabla advierte de que el contenido generado no es para uso comercial. La eliminación de la marca de agua empieza en el plan de pago.',
    verdict:
      'Su tabla dice con todas las letras lo que casi ninguna dice: en el plan gratuito, lo que generes no puedes usarlo comercialmente. Eso decide más que cualquier cifra de créditos.',
    freePlan: {
      summary:
        'Plan Basic gratuito y permanente («Free forever»). La tabla indica «No monthly Credits» y a la vez «Login to receive monthly credits», así que la cantidad no queda establecida. Lo que sí consta sin ambigüedad: el contenido generado no es para uso comercial.',
      limits: [
        'Uso comercial NO permitido con el contenido generado',
        'Cantidad de créditos mensuales sin establecer en la tabla',
        'Creación de elementos: 30',
        'La eliminación de marca de agua, el 1080p y la extensión de vídeo empiezan en el plan Standard',
        'Plan de pago más barato: Standard, 6,99 $/mes la primera suscripción',
      ],
      requiresSignup: 'yes',
      requiresCreditCard: 'unverified',
      hasWatermark: 'unverified',
      commercialUse: 'no',
      creditReset: 'unknown',
      verifiedAt: HOY,
    },
    capabilities: ['text-to-video', 'image-to-video', 'video-extend', 'video-upscaling', 'text-to-image'],
    startEffort: 'signup',
    startEffortReason: 'Hay que iniciar sesión: la propia tabla condiciona los créditos a ello.',
    scores: { freeReal: 5, usefulness: 9, ease: 8, transparency: 7, creatorValue: 5 },
    sources: [
      { url: 'https://app.klingai.com/', label: 'Aplicación oficial', kind: 'official', publisher: 'klingai.com', checkedAt: HOY },
      { url: 'https://app.klingai.com/global/membership/membership-plan', label: 'Planes oficiales', kind: 'pricing', publisher: 'klingai.com', checkedAt: HOY },
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://app.klingai.com/global/membership/membership-plan',
        verifiedAt: HOY,
        quote:
          'Basic $0 Free forever — No monthly Credits · Element Creation Quantity: 30 · Login to receive monthly credits · Generated content is not for commercial use',
      },
      capabilities: {
        sourceUrl: 'https://app.klingai.com/global/membership/membership-plan',
        verifiedAt: HOY,
        quote:
          'Premium Features — 1080p Video Generation · Video Extension for multiple times, up to a maximum of 3 minutes · Image upscaling · Brand watermark removal',
      },
    },
    auditNotes:
      '`hasWatermark` queda sin confirmar a propósito: que «Brand watermark removal» figure entre las características de pago sugiere que el gratuito la lleva, pero la tabla no lo afirma del plan Basic y sugerir no es afirmar. `commercialUse: no` sí es explícito.',
  },

  higgsfield: {
    id: 'tool_higgsfield',
    slug: 'higgsfield',
    name: 'Higgsfield',
    kind: 'app',
    verification: 'partially_verified',
    categorySlug: 'video',
    officialUrl: 'https://higgsfield.ai/',
    pricingUrl: 'https://higgsfield.ai/pricing',
    hosting: 'cloud',
    openSource: 'no',
    platforms: ['web'],
    freeModel: 'freemium',
    tagline: 'Muchos modelos en un sitio; el plan gratuito sólo dice «uso limitado».',
    descriptionShort:
      'Estudio que reúne Seedance, Kling, Sora, Veo, Wan y Grok junto a su propio modelo DoP, con control de movimiento de cámara. Tiene plan gratuito, pero su tabla lo describe únicamente como «Limited use», sin cifras.',
    verdict:
      'Interesante por la amplitud —pocos sitios juntan tantos modelos punteros— y opaco justo donde importa: no publica qué da su plan gratuito.',
    freePlan: {
      summary:
        'Existe un plan Free, descrito en la tabla comparativa sólo como «Limited use». No se publica cantidad de créditos ni frecuencia de renovación. El plan de pago más barato es Starter, 19 €/mes en anual, con 270 créditos al mes.',
      limits: [
        'El plan gratuito consta como «Limited use», sin cifras',
        'Plan de pago más barato: Starter, 19 €/mes en anual (270 créditos/mes)',
        'Seedance 2.5 a 1080p sólo desde el plan Plus',
      ],
      requiresSignup: 'yes',
      requiresCreditCard: 'unverified',
      hasWatermark: 'unverified',
      commercialUse: 'unverified',
      creditReset: 'unknown',
      verifiedAt: HOY,
    },
    capabilities: ['text-to-video', 'image-to-video', 'reference-to-video', 'video-editing', 'avatar-video'],
    startEffort: 'signup',
    startEffortReason: 'Requiere cuenta; el plan gratuito y sus límites van asociados a ella.',
    scores: { freeReal: 4, usefulness: 9, ease: 7, transparency: 4, creatorValue: 6 },
    sources: [
      { url: 'https://higgsfield.ai/', label: 'Web oficial', kind: 'official', publisher: 'higgsfield.ai', checkedAt: HOY },
      { url: 'https://higgsfield.ai/pricing', label: 'Planes oficiales', kind: 'pricing', publisher: 'higgsfield.ai', checkedAt: HOY },
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://higgsfield.ai/pricing',
        verifiedAt: HOY,
        quote: 'Compare features — Free · Free · Limited use | Starter €19/month Billed annually',
      },
      capabilities: {
        sourceUrl: 'https://higgsfield.ai/pricing',
        verifiedAt: HOY,
        quote:
          'Kling Omni 3 Image Reference 720p · Grok Video Edit · Higgsfield DoP Standard 720p · Talking-avatar videos',
      },
    },
    auditNotes:
      'Nota de contexto, no de catálogo: esta misma plataforma se descartó como fuente de Newsroom porque publica listículos de posicionamiento. Eso descalifica su blog como fuente, no al producto como herramienta.',
  },

  heygen: {
    id: 'tool_heygen',
    slug: 'heygen',
    name: 'HeyGen',
    kind: 'app',
    verification: 'verified',
    categorySlug: 'video',
    officialUrl: 'https://www.heygen.com/',
    pricingUrl: 'https://www.heygen.com/pricing',
    hosting: 'cloud',
    openSource: 'no',
    platforms: ['web'],
    freeModel: 'credits',
    tagline: 'Tres vídeos con avatar al mes, de hasta un minuto.',
    descriptionShort:
      'Vídeo con avatares digitales, traducción con sincronía labial y doblaje. Su plan gratuito permite tres vídeos al mes de hasta un minuto; quitar la marca de agua es de pago.',
    verdict:
      'La opción a mirar si lo que necesitas es una persona hablando a cámara sin grabarla. Tres vídeos al mes dan para probar el formato, no para producir con él.',
    freePlan: {
      summary:
        'Plan gratuito con 3 vídeos al mes de hasta 1 minuto, acceso a avatares de stock y un avatar propio. La eliminación de la marca de agua figura entre las características de los planes de pago. El más barato es Creator, 29 $/mes con 600 créditos.',
      limits: [
        '3 vídeos al mes',
        'Hasta 1 minuto por vídeo',
        'La eliminación de marca de agua es de pago',
        'Plan de pago más barato: Creator, 29 $/mes (600 créditos)',
      ],
      requiresSignup: 'yes',
      requiresCreditCard: 'unverified',
      hasWatermark: 'unverified',
      commercialUse: 'unverified',
      creditsAmount: '3 vídeos/mes',
      creditReset: 'monthly',
      verifiedAt: HOY,
    },
    capabilities: ['avatar-video', 'lip-sync', 'text-to-video'],
    startEffort: 'signup',
    startEffortReason: 'Requiere cuenta para generar y para conservar el avatar propio.',
    scores: { freeReal: 5, usefulness: 8, ease: 8, transparency: 8, creatorValue: 6 },
    sources: [
      { url: 'https://www.heygen.com/', label: 'Web oficial', kind: 'official', publisher: 'heygen.com', checkedAt: HOY },
      { url: 'https://www.heygen.com/pricing', label: 'Página oficial de precios', kind: 'pricing', publisher: 'heygen.com', checkedAt: HOY },
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://www.heygen.com/pricing',
        verifiedAt: HOY,
        quote: '3 videos per month · Videos up to 1 min · Avatar IV access · 500+ stock digital twins',
      },
      capabilities: {
        sourceUrl: 'https://www.heygen.com/pricing',
        verifiedAt: HOY,
        quote: 'Full Video Translation, with lip sync',
      },
    },
  },

  synthesia: {
    id: 'tool_synthesia',
    slug: 'synthesia',
    name: 'Synthesia',
    kind: 'app',
    verification: 'verified',
    categorySlug: 'video',
    officialUrl: 'https://www.synthesia.io/',
    pricingUrl: 'https://www.synthesia.io/pricing',
    hosting: 'cloud',
    openSource: 'no',
    platforms: ['web'],
    freeModel: 'credits',
    tagline: 'Diez minutos de vídeo con avatar al mes, con el logotipo puesto.',
    descriptionShort:
      'Vídeo corporativo con avatares, doblaje y sincronía labial. El plan gratuito da 1.200 créditos al mes —hasta diez minutos de vídeo— con nueve avatares y el logotipo de Synthesia, que sólo se quita pagando.',
    verdict:
      'Diez minutos al mes es de los planes gratuitos más generosos en vídeo con avatar, siempre que el logotipo no sea un problema. Si el vídeo es para un cliente, lo es.',
    freePlan: {
      summary:
        'Plan gratuito con 1.200 créditos al mes, equivalentes a un máximo de diez minutos de vídeo. Incluye 9 avatares, un editor con tres invitados y 25 recursos generados. La retirada del logotipo figura entre las características de pago. El plan más barato es Starter, 18 $/mes en anual.',
      limits: [
        '1.200 créditos al mes (hasta 10 minutos de vídeo)',
        '9 avatares',
        '25 recursos generados con IA',
        'La retirada del logotipo de Synthesia es de pago',
        'Plan de pago más barato: Starter, 18 $/mes en anual',
      ],
      requiresSignup: 'yes',
      requiresCreditCard: 'unverified',
      hasWatermark: 'unverified',
      commercialUse: 'unverified',
      creditsAmount: '1.200 créditos/mes (≈10 min de vídeo)',
      creditReset: 'monthly',
      verifiedAt: HOY,
    },
    capabilities: ['avatar-video', 'lip-sync', 'text-to-video'],
    startEffort: 'signup',
    startEffortReason: 'Requiere cuenta; los créditos mensuales y los avatares van con ella.',
    scores: { freeReal: 6, usefulness: 8, ease: 8, transparency: 8, creatorValue: 6 },
    sources: [
      { url: 'https://www.synthesia.io/', label: 'Web oficial', kind: 'official', publisher: 'synthesia.io', checkedAt: HOY },
      { url: 'https://www.synthesia.io/pricing', label: 'Página oficial de precios', kind: 'pricing', publisher: 'synthesia.io', checkedAt: HOY },
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://www.synthesia.io/pricing',
        verifiedAt: HOY,
        quote: 'Includes 1,200 credits/mo · up to 10 minutes of video/month · 9 AI avatars · 25 AI-generated video assets',
      },
      capabilities: {
        sourceUrl: 'https://www.synthesia.io/pricing',
        verifiedAt: HOY,
        quote: 'AI Dubbing · Lip Sync — Match mouth movements to the translated audio · 125+ Synthesia AI Avatars',
      },
    },
  },

  descript: {
    id: 'tool_descript',
    slug: 'descript',
    name: 'Descript',
    kind: 'app',
    verification: 'verified',
    categorySlug: 'video',
    officialUrl: 'https://www.descript.com/',
    pricingUrl: 'https://www.descript.com/pricing',
    hosting: 'cloud',
    openSource: 'no',
    platforms: ['web', 'macos', 'windows'],
    freeModel: 'freemium',
    tagline: 'Editar vídeo borrando palabras de la transcripción. Una hora al mes gratis.',
    descriptionShort:
      'Editor que trata el vídeo como un documento: se corta borrando texto de la transcripción. El plan gratuito da una hora de transcripción al mes y exporta a 720p; la exportación sin marca de agua es de pago.',
    verdict:
      'No genera vídeo: lo edita, y por eso entra aquí. Para pasar de una grabación larga a un montaje limpio es de lo más rápido que hay, y una hora al mes alcanza para comprobarlo.',
    freePlan: {
      summary:
        'Plan gratuito con 60 minutos de transcripción al mes, exportación local a 720p, proyectos ilimitados, subtítulos dinámicos y 100 créditos de IA de una sola vez. La exportación sin marca de agua figura entre las características de pago. El plan más barato es Hobbyist, 16 $/mes.',
      limits: [
        '60 minutos de transcripción al mes',
        'Exportación a 720p',
        '100 créditos de IA de una sola vez',
        'La exportación sin marca de agua es de pago',
        'Plan de pago más barato: Hobbyist, 16 $/mes',
      ],
      requiresSignup: 'yes',
      requiresCreditCard: 'unverified',
      hasWatermark: 'unverified',
      commercialUse: 'unverified',
      creditsAmount: '60 min de transcripción/mes',
      creditReset: 'monthly',
      verifiedAt: HOY,
    },
    capabilities: ['video-editing', 'transcription', 'avatar-video'],
    startEffort: 'signup',
    startEffortReason: 'Requiere cuenta; hay aplicación de escritorio, pero el proyecto vive en la nube.',
    scores: { freeReal: 6, usefulness: 8, ease: 7, transparency: 8, creatorValue: 7 },
    sources: [
      { url: 'https://www.descript.com/', label: 'Web oficial', kind: 'official', publisher: 'descript.com', checkedAt: HOY },
      { url: 'https://www.descript.com/pricing', label: 'Página oficial de precios', kind: 'pricing', publisher: 'descript.com', checkedAt: HOY },
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://www.descript.com/pricing',
        verifiedAt: HOY,
        quote:
          '60 minutes (1 hr) / month transcription · 720p export · unlimited projects · dynamic captions · 100 one-time AI credits',
      },
      capabilities: {
        sourceUrl: 'https://www.descript.com/pricing',
        verifiedAt: HOY,
        quote:
          'text-based editing · dynamic captions · transitions · green screen removal · eye contact correction · automatic multicam · avatar-based video generation',
      },
    },
  },

  'hailuo-ai': {
    id: 'tool_hailuo-ai',
    slug: 'hailuo-ai',
    name: 'Hailuo AI',
    kind: 'app',
    verification: 'partially_verified',
    categorySlug: 'video',
    officialUrl: 'https://hailuoai.video/',
    hosting: 'cloud',
    openSource: 'no',
    platforms: ['web'],
    freeModel: 'unknown',
    tagline: 'Modelo potente, condiciones del plan gratuito sin publicar.',
    descriptionShort:
      'Generador de vídeo de MiniMax, con referencia múltiple y salida a 2K en su modelo H3. Su página anuncia precios «desde 9,99 $/mes», pero no publica en abierto qué incluye el uso gratuito.',
    verdict:
      'Entra por relevancia y con el acceso gratuito sin confirmar. Su promoción de 3.000 créditos por instalar la aplicación es una promoción, no una capa gratuita, y aquí no cuenta como tal.',
    freePlan: {
      summary:
        'No consta. La página de suscripción redirige a la aplicación y no publica los términos del uso gratuito. Lo único verificable es el precio de partida: 9,99 $/mes.',
      limits: [
        'Condiciones del uso gratuito sin publicar',
        'Precio de partida: 9,99 $/mes',
      ],
      requiresSignup: 'unverified',
      requiresCreditCard: 'unverified',
      hasWatermark: 'unverified',
      commercialUse: 'unverified',
      creditReset: 'unknown',
      verifiedAt: HOY,
    },
    capabilities: ['text-to-video', 'image-to-video', 'reference-to-video'],
    startEffort: 'signup',
    startEffortReason: 'La aplicación pide iniciar sesión antes de generar.',
    scores: { freeReal: 5, usefulness: 8, ease: 8, transparency: 3, creatorValue: 5 },
    sources: [
      { url: 'https://hailuoai.video/', label: 'Aplicación oficial', kind: 'official', publisher: 'hailuoai.video', checkedAt: HOY },
    ],
    evidence: {
      capabilities: {
        sourceUrl: 'https://hailuoai.video/',
        verifiedAt: HOY,
        quote: 'MiniMax H3 · Omni Reference · 2K · Create Video · Create Image · From $9.99/mo',
      },
    },
    auditNotes:
      'Cola de verificación manual: los términos del plan gratuito exigen crear cuenta para verlos. «Download MiniMax Design and Get 3,000 Free Credits» es una promoción y no se registra como acceso gratuito permanente.',
  },

  // -------------------------------------------------------------------------
  // Pesos abiertos. Aquí «gratis» significa licencia, y el coste es el hardware.
  // -------------------------------------------------------------------------

  'wan-2-2': {
    id: 'tool_wan-2-2',
    slug: 'wan-2-2',
    name: 'Wan 2.2',
    kind: 'model',
    verification: 'verified',
    categorySlug: 'video',
    secondaryCategories: ['modelos-open-source'],
    officialUrl: 'https://github.com/Wan-Video/Wan2.2',
    repoUrl: 'https://github.com/Wan-Video/Wan2.2',
    hosting: 'local',
    openSource: 'yes',
    licence: 'Apache-2.0',
    platforms: ['linux', 'windows'],
    freeModel: 'open_source',
    tagline: 'Pesos Apache 2.0, y una variante que cabe en una tarjeta de 24 GB.',
    descriptionShort:
      'Familia de modelos de vídeo de Alibaba con licencia Apache 2.0: texto a vídeo, imagen a vídeo, voz a vídeo y animación de personajes. La variante TI2V-5B funciona en una RTX 4090 con 24 GB; las de 14B piden 80 GB.',
    verdict:
      'La puerta de entrada realista al vídeo generativo en local: casi todo lo demás pide 60 u 80 GB de memoria de vídeo, y esta familia tiene una variante que entra en una tarjeta de consumo.',
    freePlan: {
      summary:
        'Pesos publicados bajo licencia Apache 2.0. No hay cuotas ni cuenta: el coste es el equipo. La variante TI2V-5B declara funcionar en una GPU de consumo con 24 GB; las variantes de 14B piden al menos 80 GB.',
      limits: [
        'TI2V-5B: al menos 24 GB de VRAM (RTX 4090)',
        'T2V-A14B, I2V-A14B y S2V-14B: al menos 80 GB de VRAM',
        'Sin cuotas ni cuenta: el coste es el hardware',
      ],
      requiresSignup: 'no',
      requiresCreditCard: 'no',
      hasWatermark: 'unverified',
      commercialUse: 'unverified',
      creditReset: 'none',
      verifiedAt: HOY,
    },
    capabilities: ['text-to-video', 'image-to-video', 'video-editing', 'model-download'],
    startEffort: 'technical',
    startEffortReason: 'Exige clonar el repositorio, descargar pesos y disponer de GPU con mucha memoria.',
    hardwareRequirements: 'TI2V-5B: 24 GB de VRAM. Variantes 14B: 80 GB.',
    scores: { freeReal: 10, usefulness: 8, ease: 3, transparency: 9, creatorValue: 8 },
    sources: [
      { url: 'https://github.com/Wan-Video/Wan2.2', label: 'Repositorio oficial', kind: 'repo', publisher: 'github.com', checkedAt: HOY },
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://github.com/Wan-Video/Wan2.2',
        verifiedAt: HOY,
        quote:
          'The models in this repository are licensed under the Apache 2.0 License. […] TI2V-5B […] consumer-grade graphics cards like the RTX 4090 with at least 24GB VRAM. T2V-A14B & I2V-A14B: at least 80GB VRAM',
      },
      capabilities: {
        sourceUrl: 'https://github.com/Wan-Video/Wan2.2',
        verifiedAt: HOY,
        quote: 'Text-to-Video (T2V) · Image-to-Video (I2V) · Speech-to-Video (S2V) · Character Animation and Replacement (Animate)',
      },
    },
    auditNotes:
      '«Speech-to-Video» y «Animate» no tienen capacidad equivalente en la taxonomía; quedan descritas en el texto en lugar de forzarse dentro de una etiqueta que significaría otra cosa.',
  },

  'ltx-video': {
    id: 'tool_ltx-video',
    slug: 'ltx-video',
    name: 'LTX-Video',
    kind: 'model',
    verification: 'verified',
    categorySlug: 'video',
    secondaryCategories: ['modelos-open-source'],
    officialUrl: 'https://github.com/Lightricks/LTX-Video',
    repoUrl: 'https://github.com/Lightricks/LTX-Video',
    hosting: 'local',
    openSource: 'yes',
    licence: 'Apache-2.0',
    platforms: ['linux', 'windows'],
    freeModel: 'open_source',
    tagline: 'Apache 2.0, con extensión de vídeo y control por fotogramas clave.',
    descriptionShort:
      'Modelo de vídeo de Lightricks con licencia Apache 2.0. Su repositorio documenta texto a vídeo, imagen a vídeo, extensión hacia delante y hacia atrás, animación por fotogramas clave y transformación de vídeo a vídeo.',
    verdict:
      'De los pocos modelos abiertos que documentan alargar un vídeo existente y condicionarlo con fotogramas clave, que es lo que separa una demostración de un plano utilizable.',
    freePlan: {
      summary:
        'Pesos publicados bajo licencia Apache 2.0. Sin cuotas ni cuenta. El repositorio usa una H100 como referencia de rendimiento para su variante destilada.',
      limits: [
        'Referencia de rendimiento del repositorio: GPU H100',
        'Sin cuotas ni cuenta: el coste es el hardware',
      ],
      requiresSignup: 'no',
      requiresCreditCard: 'no',
      hasWatermark: 'unverified',
      commercialUse: 'unverified',
      creditReset: 'none',
      verifiedAt: HOY,
    },
    capabilities: ['text-to-video', 'image-to-video', 'video-extend', 'video-editing', 'model-download'],
    startEffort: 'technical',
    startEffortReason: 'Exige entorno de Python, descarga de pesos y una GPU potente.',
    /*
     * El repositorio no publica una cifra de memoria: da una H100 como
     * referencia de rendimiento. Se recoge tal cual, sin convertirla en gigas
     * que nadie ha dicho.
     */
    hardwareRequirements: 'Referencia del repositorio: GPU H100.',
    scores: { freeReal: 10, usefulness: 8, ease: 3, transparency: 9, creatorValue: 8 },
    sources: [
      { url: 'https://github.com/Lightricks/LTX-Video', label: 'Repositorio oficial', kind: 'repo', publisher: 'github.com', checkedAt: HOY },
    ],
    evidence: {
      capabilities: {
        sourceUrl: 'https://github.com/Lightricks/LTX-Video',
        verifiedAt: HOY,
        quote:
          'Text-to-video · Image-to-video · Video extension (both forward and backward) · Keyframe-based animation · Multi-keyframe conditioning · Video-to-video transformations',
      },
    },
  },

  hunyuanvideo: {
    id: 'tool_hunyuanvideo',
    slug: 'hunyuanvideo',
    name: 'HunyuanVideo',
    kind: 'model',
    verification: 'partially_verified',
    categorySlug: 'video',
    secondaryCategories: ['modelos-open-source'],
    officialUrl: 'https://github.com/Tencent-Hunyuan/HunyuanVideo',
    repoUrl: 'https://github.com/Tencent-Hunyuan/HunyuanVideo',
    hosting: 'local',
    openSource: 'unverified',
    platforms: ['linux'],
    freeModel: 'open_source',
    tagline: 'Pesos abiertos de Tencent, con 60 GB de memoria de vídeo como mínimo.',
    descriptionShort:
      'Modelo de vídeo de Tencent con arquitectura unificada de imagen y vídeo. Su repositorio documenta 60 GB de memoria de vídeo para 720p y 45 GB para 544×960, y recomienda 80 GB para mejor calidad.',
    verdict:
      'Potente y fuera del alcance de una tarjeta de consumo: 45 GB en el ajuste más modesto. Está aquí para que quede claro dónde está esa frontera.',
    freePlan: {
      summary:
        'Pesos publicados en el repositorio oficial. El fichero de licencia existe pero no se pudo leer su identificador en esta comprobación, así que el tipo exacto de licencia queda sin confirmar. Requisitos declarados: 60 GB de VRAM a 720p, 45 GB a 544×960.',
      limits: [
        '60 GB de VRAM para 720×1280 con 129 fotogramas',
        '45 GB para 544×960 con 129 fotogramas',
        'El repositorio recomienda 80 GB para mejor calidad',
      ],
      requiresSignup: 'no',
      requiresCreditCard: 'no',
      hasWatermark: 'unverified',
      commercialUse: 'unverified',
      creditReset: 'none',
      verifiedAt: HOY,
    },
    capabilities: ['text-to-video', 'model-download'],
    startEffort: 'technical',
    startEffortReason: 'Exige entorno de Python, pesos y una GPU de centro de datos.',
    hardwareRequirements: '60 GB de VRAM a 720p; 45 GB a 544×960.',
    scores: { freeReal: 9, usefulness: 8, ease: 2, transparency: 7, creatorValue: 6 },
    sources: [
      { url: 'https://github.com/Tencent-Hunyuan/HunyuanVideo', label: 'Repositorio oficial', kind: 'repo', publisher: 'github.com', checkedAt: HOY },
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://github.com/Tencent-Hunyuan/HunyuanVideo',
        verifiedAt: HOY,
        quote:
          'The minimum GPU memory required is 60GB for 720px1280px129f and 45G for 544px960px129f […] recommend using a GPU with 80GB of memory for better generation quality',
      },
    },
    auditNotes:
      '`openSource` queda en `unverified` aunque el repositorio sea público: la regla de este catálogo exige leer el identificador de licencia, y en esta comprobación no fue posible. Repositorio abierto no es lo mismo que licencia abierta.',
  },

  'mochi-1': {
    id: 'tool_mochi-1',
    slug: 'mochi-1',
    name: 'Mochi 1',
    kind: 'model',
    verification: 'verified',
    categorySlug: 'video',
    secondaryCategories: ['modelos-open-source'],
    officialUrl: 'https://github.com/genmoai/mochi',
    repoUrl: 'https://github.com/genmoai/mochi',
    hosting: 'local',
    openSource: 'yes',
    licence: 'Apache-2.0',
    platforms: ['linux'],
    freeModel: 'open_source',
    tagline: 'Apache 2.0 a 480p, y por debajo de 20 GB si se ejecuta desde ComfyUI.',
    descriptionShort:
      'Modelo de vídeo de Genmo con licencia Apache 2.0 y 10.000 millones de parámetros. Genera a 480p. El repositorio pide unos 60 GB de VRAM, pero apunta que la optimización de ComfyUI lo baja por debajo de 20 GB.',
    verdict:
      'La nota de ComfyUI es lo interesante: es la diferencia entre necesitar una GPU de centro de datos y poder usarlo en un equipo bueno de sobremesa.',
    freePlan: {
      summary:
        'Pesos bajo licencia Apache 2.0, descrita en el repositorio como permisiva. Genera a 480p. Unos 60 GB de VRAM en una sola GPU según el repositorio, o menos de 20 GB con la optimización de ComfyUI.',
      limits: [
        'Genera a 480p',
        '≈60 GB de VRAM en una sola GPU con este repositorio',
        'Menos de 20 GB con la optimización de ComfyUI',
        'Versión preliminar: distorsiones con movimiento extremo, orientada a estilos fotorrealistas',
      ],
      requiresSignup: 'no',
      requiresCreditCard: 'no',
      hasWatermark: 'unverified',
      commercialUse: 'unverified',
      creditReset: 'none',
      verifiedAt: HOY,
    },
    capabilities: ['text-to-video', 'model-download'],
    startEffort: 'technical',
    startEffortReason: 'Exige entorno de Python, pesos y GPU; el camino cómodo es a través de ComfyUI.',
    hardwareRequirements: '≈60 GB de VRAM; menos de 20 GB vía ComfyUI.',
    scores: { freeReal: 10, usefulness: 7, ease: 3, transparency: 9, creatorValue: 7 },
    sources: [
      { url: 'https://github.com/genmoai/mochi', label: 'Repositorio oficial', kind: 'repo', publisher: 'github.com', checkedAt: HOY },
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://github.com/genmoai/mochi',
        verifiedAt: HOY,
        quote:
          'released under a permissive Apache 2.0 license […] requires approximately 60GB VRAM when running on a single GPU […] ComfyUI can optimize to run in under 20GB VRAM',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Multiverticales: vídeo como categoría secundaria, sin duplicar ficha
// ---------------------------------------------------------------------------

/**
 * Krea, Leonardo y Grok Imagine son de imagen y además generan vídeo, con las
 * capacidades ya verificadas en la ronda anterior. `getToolsByCategory` incluye
 * `secondaryCategories`, así que aparecen en /video sin una segunda ficha que
 * mantener — dos fichas del mismo producto es la forma más rápida de que una de
 * las dos envejezca.
 */
const SECUNDARIAS = ['krea', 'leonardo-ai', 'grok-imagine'];

// ---------------------------------------------------------------------------

const resumen = { corregidas: [], nuevas: [], secundarias: [] };

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

for (const slug of SECUNDARIAS) {
  const ficha = porSlug.get(slug);
  if (!ficha) throw new Error(`No existe la ficha "${slug}".`);
  const tieneVideo = (ficha.capabilities ?? []).some((c) => c.includes('video'));
  if (!tieneVideo) throw new Error(`"${slug}" no tiene ninguna capacidad de vídeo verificada.`);
  if (!ficha.secondaryCategories.includes('video')) {
    ficha.secondaryCategories = [...ficha.secondaryCategories, 'video'];
    ficha.updatedAt = HOY;
    resumen.secundarias.push(slug);
  }
}

catalogo.sort((a, b) => a.slug.localeCompare(b.slug, 'es'));
writeFileSync(RUTA, `${JSON.stringify(catalogo, null, 2)}\n`, 'utf8');

console.log(`Corregidas (${resumen.corregidas.length}): ${resumen.corregidas.join(', ')}`);
console.log(`Nuevas (${resumen.nuevas.length}): ${resumen.nuevas.join(', ')}`);
console.log(`Vídeo como categoría secundaria (${resumen.secundarias.length}): ${resumen.secundarias.join(', ')}`);
console.log(`\nTotal del catálogo: ${catalogo.length}`);
