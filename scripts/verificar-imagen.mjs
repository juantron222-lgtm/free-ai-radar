#!/usr/bin/env node
/**
 * Verificación prioritaria de ocho plataformas, y el criterio de `startEffort`.
 *
 * Todo lo que este fichero escribe salió de una página oficial abierta el
 * 13 de agosto de 2026. Cuando la página no dice algo, el campo se queda en
 * `unverified` o `unknown`: ninguna casilla se rellena porque «se sabe».
 *
 * Dos lecturas de esta ronda merecen quedar escritas, porque las dos habrían
 * salido al revés leyendo el texto de la página en lugar de su tabla:
 *
 *   - **Grok.** La tarjeta de SuperGrok anuncia «Image and video generation»,
 *     lo que sugiere que ninguna de las dos está en el plan gratuito. La tabla
 *     comparativa dice otra cosa: la fila «Image generation (Imagine)» lleva
 *     marca de verificación en las siete columnas, y la fila «Video generation»
 *     lleva un guion en la primera. Imagen sí, vídeo no.
 *
 *   - **Krea.** El texto plano del plan Free enumera «All image models», «All
 *     video models» y «Commercial license», pero esa enumeración es la lista de
 *     características compartida por todos los planes: cada fila lleva al lado
 *     un icono de aspa o de visto. En el plan Free las tres llevan aspa.
 *
 * En los dos casos la comprobación fue mirar qué icono acompaña a cada fila y
 * contrastarlo con filas de control cuyo resultado ya se conocía —SSO y RBAC en
 * x.ai, que sólo están en Enterprise—. Un comparador que confunde un aspa con
 * un visto publica lo contrario de lo que dice la fuente.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RUTA = resolve(ROOT, 'src/data/tools-v2.json');
const HOY = '2026-08-13';
const PROXIMA = '2026-11-11'; // 90 días

const catalogo = JSON.parse(readFileSync(RUTA, 'utf8'));
const porSlug = new Map(catalogo.map((t) => [t.slug, t]));

// ---------------------------------------------------------------------------
// 1. Las ocho prioritarias
// ---------------------------------------------------------------------------

const VERIFICADAS = {
  midjourney: {
    verification: 'verified',
    officialUrl: 'https://www.midjourney.com/',
    pricingUrl: 'https://docs.midjourney.com/hc/en-us/articles/27870484040333-Comparing-Midjourney-Plans',
    docsUrl: 'https://docs.midjourney.com/hc/en-us',
    freeModel: 'paid_only',
    tagline: 'Generación de imagen de alta calidad, sin ninguna vía gratuita en web ni en Discord.',
    descriptionShort:
      'Generador de imagen y vídeo por suscripción. Su propia documentación afirma que no hay prueba gratuita ni en Discord ni en midjourney.com: la única prueba limitada está en la app niji·journey para iOS y Android. La suscripción más barata cuesta 10 $/mes.',
    verdict:
      'No es una herramienta gratuita y su documentación lo dice sin rodeos. Figura en el catálogo para que quien la busque sepa exactamente lo que cuesta empezar: 10 $ al mes, sin versión de prueba en la web.',
    freePlan: {
      summary:
        'No hay plan gratuito. La documentación oficial afirma que no existe prueba gratuita ni en Discord ni en midjourney.com; la única prueba limitada está en la app niji·journey (iOS y Android). Todos los planes son suscripciones.',
      limits: [
        'Sin plan gratuito ni prueba en la web ni en Discord',
        'Prueba limitada sólo en la app niji·journey (iOS y Android)',
        'Suscripción más barata: Basic, 10 $/mes o 96 $/año',
        'Relax Mode con imágenes ilimitadas desde el plan Standard (30 $/mes)',
        'Stealth Mode (creaciones privadas) sólo en Pro y Mega',
      ],
      requiresSignup: 'yes',
      requiresCreditCard: 'yes',
      hasWatermark: 'unverified',
      commercialUse: 'unverified',
      creditReset: 'none',
      verifiedAt: HOY,
    },
    /*
     * Sale de los títulos de la documentación oficial, uno por función: Image
     * Prompts, Style Reference, Omni Reference, Character Reference, Editor,
     * Upscalers, Zoom Out, Pan, Vary Region y Video.
     *
     * El vídeo es `image-to-video` y no `text-to-video`: el artículo empieza
     * «Turn your images into captivating 5 second videos» y describe alimentar
     * una imagen como primer fotograma. Es la clase de precisión que se pierde
     * si uno se limita a leer que «tiene vídeo».
     */
    capabilities: [
      'text-to-image',
      'image-to-image',
      'image-editing',
      'inpainting',
      'outpainting',
      'reference-image',
      'character-consistency',
      'upscaling',
      'image-to-video',
    ],
    startEffort: 'signup',
    startEffortReason: 'Cuenta y suscripción de pago antes de la primera imagen: no hay vía gratuita.',
    sources: [
      { url: 'https://www.midjourney.com/', label: 'Web oficial', kind: 'official', publisher: 'midjourney.com', checkedAt: HOY },
      { url: 'https://docs.midjourney.com/hc/en-us/articles/27870484040333-Comparing-Midjourney-Plans', label: 'Comparación oficial de planes', kind: 'pricing', publisher: 'docs.midjourney.com', checkedAt: HOY },
      { url: 'https://docs.midjourney.com/hc/en-us/articles/27870399340173-Free-Trials', label: 'Free Trials (documentación oficial)', kind: 'docs', publisher: 'docs.midjourney.com', checkedAt: HOY },
      { url: 'https://docs.midjourney.com/hc/en-us/articles/27870375276557-Using-Images-Videos-Commercially', label: 'Uso comercial (documentación oficial)', kind: 'docs', publisher: 'docs.midjourney.com', checkedAt: HOY },
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://docs.midjourney.com/hc/en-us/articles/27870399340173-Free-Trials',
        verifiedAt: HOY,
        quote:
          'A limited trial is available on the niji · journey app, available for iOS and Android devices. No free trial is currently available in Discord or the midjourney.com website.',
      },
      pricing: {
        sourceUrl: 'https://docs.midjourney.com/hc/en-us/articles/27870484040333-Comparing-Midjourney-Plans',
        verifiedAt: HOY,
        quote:
          'All Midjourney plans are subscriptions […] Basic Plan Monthly Price $10 Annual Price $96 ($8 / month)',
      },
      capabilities: {
        sourceUrl: 'https://docs.midjourney.com/hc/en-us/articles/37460773864589-Video',
        verifiedAt: HOY,
        quote:
          'Turn your images into captivating 5 second videos using Midjourney! […] feeding Midjourney an image to serve as the first frame',
      },
    },
    auditNotes:
      'El uso comercial está documentado («you own all the images and videos you create»), pero se refiere a los planes de pago: no hay plan gratuito al que atribuirlo, así que commercialUse queda unverified en vez de yes.',
  },

  'leonardo-ai': {
    verification: 'verified',
    officialUrl: 'https://leonardo.ai/',
    pricingUrl: 'https://leonardo.ai/pricing/',
    freeModel: 'credits',
    tagline: '150 fichas al día en el plan gratuito, con una contrapartida: tus creaciones son públicas.',
    descriptionShort:
      'Generador y editor de imagen en la nube con lienzo, inpainting, outpainting y escalado. Su plan FREE da 150 Fast Tokens que se renuevan cada día; a cambio, las creaciones del plan gratuito quedan visibles para el resto de la comunidad.',
    verdict:
      'Uno de los pocos planes gratuitos con cantidad y frecuencia publicadas, lo que permite saber de antemano cuánto se puede hacer. La letra pequeña no está en los créditos sino en la privacidad: en el plan gratuito, cualquiera puede ver y remezclar lo que generes.',
    freePlan: {
      summary:
        'Plan FREE de 0 $/mes con 150 Fast Tokens al día y un banco de 150 fichas. En el plan gratuito las creaciones son públicas: el centro de ayuda dice que quedan visibles para que otros usuarios las copien y remezclen. El plan de pago más barato es Essential, 12 $/mes.',
      limits: [
        '150 Fast Tokens al día',
        'Banco de fichas: 150',
        'Creaciones públicas: la generación privada es de pago',
        'Ajustes de calidad básicos',
        '1 colección personal',
        'Plan de pago más barato: Essential, 12 $/mes',
      ],
      requiresSignup: 'yes',
      requiresCreditCard: 'unverified',
      hasWatermark: 'unverified',
      commercialUse: 'yes',
      creditsAmount: '150 Fast Tokens/día',
      creditReset: 'daily',
      verifiedAt: HOY,
    },
    capabilities: [
      'text-to-image',
      'image-to-image',
      'image-editing',
      'inpainting',
      'outpainting',
      'upscaling',
      'image-to-video',
      'api',
    ],
    startEffort: 'signup',
    startEffortReason: 'Hay que crear cuenta y elegir plan —aunque sea el de 0 $— antes de generar.',
    sources: [
      { url: 'https://leonardo.ai/', label: 'Web oficial', kind: 'official', publisher: 'leonardo.ai', checkedAt: HOY },
      { url: 'https://leonardo.ai/pricing/', label: 'Página oficial de precios', kind: 'pricing', publisher: 'leonardo.ai', checkedAt: HOY },
      { url: 'https://intercom.help/leonardo-ai/en/articles/8044018-commercial-usage', label: 'Uso comercial (centro de ayuda oficial)', kind: 'docs', publisher: 'intercom.help', checkedAt: HOY },
      { url: 'https://intercom.help/leonardo-ai/en/articles/8093145-how-to-use-canvas-editor-tool', label: 'Canvas Editor (centro de ayuda oficial)', kind: 'docs', publisher: 'intercom.help', checkedAt: HOY },
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://leonardo.ai/pricing/',
        verifiedAt: HOY,
        quote:
          'FREE $0 /month […] Fast Tokens 150 / day · Token Bank 150 · Creations access Public · Quality settings Basic · Personal collections 1',
      },
      commercialUse: {
        sourceUrl: 'https://intercom.help/leonardo-ai/en/articles/8044018-commercial-usage',
        verifiedAt: HOY,
        quote: 'You can indeed use your images for commercial purposes!',
      },
      capabilities: {
        sourceUrl: 'https://intercom.help/leonardo-ai/en/articles/8093145-how-to-use-canvas-editor-tool',
        verifiedAt: HOY,
        quote:
          'Inpainting in Canvas Editor effectively allows you to select specific areas of a base image […] Outpainting allows you to generate a coherent extension of your base image […] Text2Img […] Img2Img […] Sketch2Image',
      },
    },
    auditNotes:
      'El uso comercial es yes para todos los planes, pero en el gratuito las creaciones son públicas y remezclables: la diferencia está en los límites, no en el permiso. Marca de agua y tarjeta siguen sin constar en ninguna página oficial.',
  },

  'grok-imagine': {
    verification: 'partially_verified',
    officialUrl: 'https://grok.com/',
    pricingUrl: 'https://x.ai/pricing',
    docsUrl: 'https://docs.x.ai/docs/overview',
    freeModel: 'freemium',
    tagline: 'Genera imágenes en el plan gratuito; el vídeo, no.',
    descriptionShort:
      'El apartado generativo de Grok, de xAI. La tabla comparativa oficial de planes marca la generación de imágenes como incluida en el plan Free, y la generación de vídeo como no incluida. xAI describe los límites del plan gratuito como «generous» sin publicar ninguna cifra.',
    verdict:
      'Sirve para generar imágenes sin pagar, con una salvedad que conviene saber antes de empezar: el vídeo que anuncia su página de producto no está en el plan gratuito. Los límites concretos no se publican, así que no se puede planificar cuánto durará.',
    freePlan: {
      summary:
        'El plan Free de 0 $/mes incluye generación de imágenes: la tabla comparativa oficial la marca en las siete columnas de planes. La generación de vídeo aparece marcada como no disponible en Free. xAI describe los límites como «generous limits» sin dar cifras.',
      limits: [
        'Generación de imágenes: incluida en el plan Free',
        'Generación de vídeo: no incluida en el plan Free',
        'Límites del plan gratuito no publicados («generous limits»)',
        'Plan de pago con precio publicado más barato: SuperGrok, 30 $/mes',
      ],
      requiresSignup: 'yes',
      requiresCreditCard: 'unverified',
      hasWatermark: 'unverified',
      commercialUse: 'unverified',
      creditReset: 'unknown',
      verifiedAt: HOY,
    },
    // Las cinco vienen de la navegación de docs.x.ai y se mantienen intactas.
    capabilities: ['text-to-image', 'image-editing', 'text-to-video', 'image-to-video', 'reference-image'],
    startEffort: 'signup',
    startEffortReason: 'Hay que iniciar sesión con cuenta de X o correo antes de poder generar.',
    sources: [
      { url: 'https://grok.com/', label: 'Aplicación oficial', kind: 'official', publisher: 'grok.com', checkedAt: HOY },
      { url: 'https://x.ai/pricing', label: 'Página oficial de precios', kind: 'pricing', publisher: 'x.ai', checkedAt: HOY },
      { url: 'https://x.ai/grok', label: 'Página oficial de producto', kind: 'official', publisher: 'x.ai', checkedAt: HOY },
      { url: 'https://docs.x.ai/docs/overview', label: 'Documentación oficial de xAI', kind: 'docs', publisher: 'x.ai', checkedAt: HOY },
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://x.ai/pricing',
        verifiedAt: HOY,
        quote:
          'Free $0 /month — Get to know Grok and its capabilities for free within generous limits. [Tabla comparativa: «Image generation (Imagine)» marcada en las siete columnas; «Video generation» sin marcar en la columna Free.]',
      },
      capabilities: {
        sourceUrl: 'https://docs.x.ai/docs/overview',
        verifiedAt: '2026-08-12',
        quote: 'Imagine Overview Image Generation Image Editing Multi-Image Editing Video Generation Image-to-Video Reference-to-Video',
      },
    },
    auditNotes:
      'La tarjeta de SuperGrok anuncia «Image and video generation», lo que sugiere que ninguna de las dos está en el plan gratuito; la tabla comparativa dice lo contrario para imagen. Se toma la tabla, que es donde xAI declara plan por plan. Filas de control usadas: SSO y RBAC, marcadas sólo en Enterprise.',
  },

  ideogram: {
    nueva: true,
    id: 'tool_ideogram',
    slug: 'ideogram',
    name: 'Ideogram',
    kind: 'app',
    verification: 'verified',
    categorySlug: 'imagen',
    officialUrl: 'https://ideogram.ai/',
    pricingUrl: 'https://ideogram.ai/pricing',
    hosting: 'cloud',
    openSource: 'no',
    platforms: ['web'],
    languages: ['en'],
    skillLevel: 'beginner',
    freeModel: 'credits',
    tagline: 'Diez créditos lentos por semana, y casi todas las herramientas de edición fuera.',
    descriptionShort:
      'Generador de imagen conocido por escribir texto legible dentro de la imagen. Su plan gratuito da 10 créditos lentos a la semana y deja fuera la referencia de estilo, la de personaje, el relleno, la ampliación de encuadre, el escalado y el recorte de fondo, que son de pago.',
    verdict:
      'La cantidad y la frecuencia están publicadas, que ya es más de lo que ofrece casi nadie. Lo que hay que mirar es la otra tabla: en el plan gratuito quedan fuera seis de las funciones de edición, y las imágenes se publican en la comunidad por defecto.',
    freePlan: {
      summary:
        'Plan gratuito con 10 créditos lentos a la semana, una generación simultánea y dos lienzos. La referencia de estilo, la de personaje, Magic Fill, Extend, el escalado y el recorte de fondo constan como no incluidos. Por defecto todas las imágenes se publican en la comunidad. El plan de pago más barato es Plus, 20 $/mes.',
      limits: [
        '10 créditos lentos a la semana',
        'Sin créditos prioritarios',
        '1 generación simultánea',
        '2 lienzos',
        'Sin referencia de estilo ni de personaje',
        'Sin Magic Fill, Extend, escalado ni recorte de fondo',
        'Las imágenes se publican en la comunidad por defecto',
        'Plan de pago más barato: Plus, 20 $/mes (15 $/mes en anual)',
      ],
      requiresSignup: 'yes',
      requiresCreditCard: 'unverified',
      hasWatermark: 'unverified',
      commercialUse: 'yes',
      creditsAmount: '10 créditos lentos/semana',
      creditReset: 'weekly',
      verifiedAt: HOY,
    },
    capabilities: [
      'text-to-image',
      'image-to-image',
      'image-editing',
      'inpainting',
      'outpainting',
      'reference-image',
      'character-consistency',
      'upscaling',
      'background-removal',
      'api',
    ],
    startEffort: 'signup',
    startEffortReason: 'Pide iniciar sesión antes de generar; los créditos van asociados a la cuenta.',
    scores: { freeReal: 5, usefulness: 8, ease: 8, transparency: 9, creatorValue: 6 },
    sources: [
      { url: 'https://ideogram.ai/', label: 'Web oficial', kind: 'official', publisher: 'ideogram.ai', checkedAt: HOY },
      { url: 'https://ideogram.ai/pricing', label: 'Página oficial de precios', kind: 'pricing', publisher: 'ideogram.ai', checkedAt: HOY },
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://ideogram.ai/pricing',
        verifiedAt: HOY,
        quote:
          'Free plan — Slow credits: 10 slow credits/week · Priority credits: Not included · Concurrent generations: 1 · Private generations: Not included · Canvas: 2 canvases · Style reference: Not included · Character reference: Not included · Magic Fill: Not included · Extend: Not included · Upscale: Not included · Background removal: Not included',
      },
      commercialUse: {
        sourceUrl: 'https://ideogram.ai/pricing',
        verifiedAt: HOY,
        quote:
          'We do not claim ownership of your generated images, and you’re free to use them for any purpose, including commercial use.',
      },
      capabilities: {
        sourceUrl: 'https://ideogram.ai/pricing',
        verifiedAt: HOY,
        quote: 'Editing — Canvas · Remix · Style · Style reference · Character reference · Magic Fill · Extend · Upscale · Background removal',
      },
    },
    auditNotes:
      'Las capacidades describen la herramienta completa; en el plan gratuito seis de ellas constan como no incluidas y así figura en los límites. Marca de agua y tarjeta no aparecen en ninguna página oficial.',
  },

  krea: {
    nueva: true,
    id: 'tool_krea',
    slug: 'krea',
    name: 'Krea',
    kind: 'app',
    verification: 'verified',
    categorySlug: 'imagen',
    officialUrl: 'https://www.krea.ai/',
    pricingUrl: 'https://www.krea.ai/pricing',
    hosting: 'cloud',
    openSource: 'no',
    platforms: ['web'],
    languages: ['en'],
    skillLevel: 'intermediate',
    freeModel: 'credits',
    tagline: 'Cien unidades al día —alrededor de una imagen— y sin licencia comercial.',
    descriptionShort:
      'Estudio de imagen, vídeo y 3D en el navegador que reúne modelos propios y de terceros. Su plan gratuito da 100 unidades de cómputo al día, que su propia tabla equipara a una sola generación con Nano Banana 2, y no incluye la licencia comercial.',
    verdict:
      'Potente y ancha, pero su plan gratuito es una demostración: una imagen al día, sólo con el modelo propio, y sin permiso para usar el resultado en un trabajo. Merece estar en el catálogo por lo que es, no por lo que regala.',
    freePlan: {
      summary:
        'Plan gratuito con 100 unidades de cómputo al día, que la propia tabla equipara a una generación de Nano Banana 2. Incluye el modelo propio Krea 2, entrenamiento LoRA limitado y escalado limitado hasta 2K. La tabla marca como no incluidos el resto de modelos de imagen, los de vídeo, los de 3D, los nodos y la licencia comercial.',
      limits: [
        '100 unidades de cómputo al día (≈1 generación de Nano Banana 2)',
        'Sólo el modelo propio Krea 2: el resto de modelos de imagen no está incluido',
        'Modelos de vídeo y de 3D no incluidos; concurrencia de vídeo: 0',
        'Escalado limitado a 2K',
        'Sin licencia comercial',
        'Sin Krea Nodes, App Builder ni Nodes Agent',
      ],
      requiresSignup: 'yes',
      requiresCreditCard: 'unverified',
      hasWatermark: 'unverified',
      commercialUse: 'no',
      creditsAmount: '100 unidades/día',
      creditReset: 'daily',
      verifiedAt: HOY,
    },
    capabilities: [
      'text-to-image',
      'image-editing',
      'upscaling',
      'background-removal',
      'text-to-video',
      'video-editing',
      'api',
    ],
    startEffort: 'signup',
    startEffortReason: 'Pide registro antes de generar y las unidades diarias van asociadas a la cuenta.',
    scores: { freeReal: 3, usefulness: 9, ease: 7, transparency: 8, creatorValue: 5 },
    sources: [
      { url: 'https://www.krea.ai/', label: 'Web oficial', kind: 'official', publisher: 'krea.ai', checkedAt: HOY },
      { url: 'https://www.krea.ai/pricing', label: 'Página oficial de precios', kind: 'pricing', publisher: 'krea.ai', checkedAt: HOY },
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://www.krea.ai/pricing',
        verifiedAt: HOY,
        quote:
          'Free — 100 units /day · 1 Nano Banana 2 generation · <1 Seedance 2.0 videos [Filas con aspa en el plan Free: All image models, All video models, All 3D & lipsync models, Krea Nodes, App Builder, Nodes Agent, Commercial license. Con visto: Limited LoRA training, Limited image upscaling. Image concurrency 1, Video concurrency 0.]',
      },
      capabilities: {
        sourceUrl: 'https://www.krea.ai/',
        verifiedAt: HOY,
        quote:
          'Generate — Text to Image · Realtime Image Generation · Text to Video · Motion Transfer · Text to 3D Object · Image to 3D Object. Edit — Upscaling · Background Remover · AI Image Editor · Frame Interpolation · Video Style Transfer · Video Upscaling',
      },
    },
    auditNotes:
      'commercialUse es «no» y no «unverified» porque la tabla lo declara explícitamente: «Commercial license» aparece con aspa en la columna Free y con visto en Basic, Pro y Max. Los precios de los planes de pago no están en el DOM de la página, así que el precio mínimo queda sin verificar.',
  },

  'google-gemini': {
    verification: 'partially_verified',
    freeModel: 'freemium',
    pricingUrl: 'https://gemini.google/subscriptions/',
    freePlan: {
      summary:
        'El plan gratuito de la app Gemini (0 €/mes) incluye generación y edición de imágenes, con la advertencia de que «se pueden aplicar límites de uso». El centro de ayuda confirma que existe una cuota diaria de imágenes, pero Google no publica la cifra. Distinto de la API: en ai.google.dev todos los modelos de imagen figuran como «Not available» en la capa gratuita.',
      limits: [
        'Generación y edición de imágenes incluidas en el plan gratuito de la app',
        'Existe una cuota diaria de imágenes; Google no publica la cantidad',
        'Hay que iniciar sesión y tener 13 años o más para generar imágenes',
        'En la API (ai.google.dev) los modelos de imagen no están en la capa gratuita',
        'Plan de pago más barato: Google AI Plus, 4,99 €/mes',
      ],
      requiresSignup: 'yes',
      requiresCreditCard: 'unverified',
      hasWatermark: 'unverified',
      commercialUse: 'unverified',
      creditReset: 'daily',
      verifiedAt: HOY,
    },
    capabilities: ['text-to-image', 'image-editing', 'text-generation', 'api'],
    startEffort: 'signup',
    startEffortReason: 'Para generar imágenes hay que estar identificado en la app con una cuenta de Google.',
    sources: [
      { url: 'https://gemini.google.com', label: 'Web oficial', kind: 'official', publisher: 'gemini.google.com', checkedAt: HOY },
      { url: 'https://gemini.google/subscriptions/', label: 'Planes oficiales de Gemini', kind: 'pricing', publisher: 'gemini.google', checkedAt: HOY },
      { url: 'https://support.google.com/gemini/answer/14286560', label: 'Generar imágenes (soporte oficial)', kind: 'docs', publisher: 'support.google.com', checkedAt: HOY },
      { url: 'https://ai.google.dev/gemini-api/docs/pricing', label: 'Precios de la API de Gemini', kind: 'pricing', publisher: 'ai.google.dev', checkedAt: HOY },
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://gemini.google/subscriptions/',
        verifiedAt: HOY,
        quote: 'Plan gratuito 0 €/mes — Generación y edición de imágenes. Se pueden aplicar límites de uso.',
      },
      capabilities: {
        sourceUrl: 'https://support.google.com/gemini/answer/14286560',
        verifiedAt: HOY,
        quote:
          'To generate images, you must be 13 (or the applicable age in your country) or over […] If you reach your daily quota of Nano Banana 2 images, you can’t redo any additional images with Nano Banana Pro',
      },
    },
    auditNotes:
      'App y API son productos distintos y responden distinto: la app incluye imágenes en el plan gratuito, la API las marca como no disponibles en su capa gratuita. Confundirlas sería publicar lo contrario de lo que dice una de las dos fuentes. La ficha se queda en Escritura: Gemini es un asistente general, no un generador de imagen, aunque la capacidad conste.',
  },

  'perplexity-ai': {
    verification: 'partially_verified',
    freeModel: 'freemium',
    freePlan: {
      summary:
        'El plan Standard (gratuito) da historial de búsquedas, búsquedas básicas «prácticamente ilimitadas», una cantidad «muy limitada» de Pro Searches y subida básica de archivos. El propio centro de ayuda dice que no incluye acceso a modelos avanzados ni generación de imágenes.',
      limits: [
        'Búsquedas básicas «prácticamente ilimitadas»',
        'Cantidad «muy limitada» de Pro Searches',
        'Subida de archivos básica y limitada',
        'Sin acceso a modelos avanzados',
        'Sin generación de imágenes: es exclusiva de Pro',
        'Education Pro: 10 $/mes con verificación de estudiante',
      ],
      requiresSignup: 'unverified',
      requiresCreditCard: 'unverified',
      hasWatermark: 'unverified',
      commercialUse: 'unverified',
      creditReset: 'none',
      verifiedAt: HOY,
    },
    startEffort: 'signup',
    startEffortReason: 'El plan gratuito es un plan con historial y cuotas, así que arranca en una cuenta.',
    sources: [
      { url: 'https://www.perplexity.ai', label: 'Web oficial', kind: 'official', publisher: 'perplexity.ai', checkedAt: HOY },
      { url: 'https://www.perplexity.ai/help-center/en/articles/11187416-which-perplexity-subscription-plan-is-right-for-you.html', label: 'Comparación oficial de planes', kind: 'docs', publisher: 'perplexity.ai', checkedAt: HOY },
      { url: 'https://www.perplexity.ai/help-center/en/articles/10354944-can-perplexity-generate-images.html', label: 'Generación de imágenes (centro de ayuda oficial)', kind: 'docs', publisher: 'perplexity.ai', checkedAt: HOY },
    ],
    evidence: {
      freePlan: {
        sourceUrl:
          'https://www.perplexity.ai/help-center/en/articles/11187416-which-perplexity-subscription-plan-is-right-for-you.html',
        verifiedAt: HOY,
        quote:
          'What do I get with the Free (Standard) plan? Search history access · Practically unlimited basic searches · Very limited amount of Pro Searches · Basic file uploads (limited) · No access to advanced AI models, image generation, or premium support.',
      },
    },
    auditNotes:
      'No entra en Imagen. Dos razones, las dos de fuente oficial: el plan gratuito excluye expresamente la generación de imágenes, y cuando la hay no la genera Perplexity sino GPT Image 1, Nano Banana o Seedream 4.5, elegidos en ajustes. Marcarla con text-to-image diría que genera imágenes, igual que decirlo de una plataforma que aloja modelos ajenos. requiresSignup baja de «no» a «unverified»: ninguna página oficial afirma que se pueda buscar sin cuenta.',
  },

  replicate: {
    verification: 'partially_verified',
    freeModel: 'trial',
    pricingUrl: 'https://replicate.com/pricing',
    docsUrl: 'https://replicate.com/docs/topics/billing',
    freePlan: {
      summary:
        'La documentación oficial de facturación dice que se pueden ejecutar «modelos seleccionados» gratis, pero que «al cabo de un rato» se pide configurar la facturación. No publica cuántos modelos, cuánto rato ni si eso se renueva. El cobro es por tiempo de cómputo, no por suscripción.',
      limits: [
        'Sólo «select models» son gratuitos; no se publica cuáles',
        'El acceso gratuito termina «after a bit» y entonces hay que configurar facturación',
        'Algunas funciones exigen tener la facturación configurada',
        'Se paga por tiempo de cómputo, no por suscripción',
      ],
      requiresSignup: 'yes',
      requiresCreditCard: 'unverified',
      hasWatermark: 'unverified',
      commercialUse: 'unverified',
      creditReset: 'unknown',
      verifiedAt: HOY,
    },
    startEffort: 'technical',
    startEffortReason: 'Se usa con token de API desde código; no hay una interfaz donde escribir y generar.',
    sources: [
      { url: 'https://replicate.com', label: 'Web oficial', kind: 'official', publisher: 'replicate.com', checkedAt: HOY },
      { url: 'https://replicate.com/pricing', label: 'Página oficial de precios', kind: 'pricing', publisher: 'replicate.com', checkedAt: HOY },
      { url: 'https://replicate.com/docs/topics/billing', label: 'Facturación (documentación oficial)', kind: 'docs', publisher: 'replicate.com', checkedAt: HOY },
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://replicate.com/docs/topics/billing',
        verifiedAt: HOY,
        quote:
          'Free limits — You can run select models on Replicate for free, but after a bit you’ll be asked to set up billing. Some features are only available to customers with billing set up.',
      },
    },
    auditNotes:
      '«Trial» y no «credits»: no hay una cantidad de créditos ni una frecuencia de renovación, sino un acceso gratuito que termina. La página de precios no menciona plan gratuito alguno; la que lo menciona es la de facturación.',
  },
};

// ---------------------------------------------------------------------------
// 2. Por qué cada ficha tiene el esfuerzo que tiene
//
// Una línea por herramienta, en castellano y sin cita: `startEffort` describe
// lo que cuesta empezar, que es una observación nuestra. Precisamente por eso
// necesita dejar escrito en qué se basó.
// ---------------------------------------------------------------------------

const MOTIVOS = {
  // instant — se abre y se genera
  chatgpt: 'Se puede escribir en la caja y obtener respuesta nada más entrar.',
  claude: 'Se puede escribir en la caja y obtener respuesta nada más entrar.',
  clipdrop: 'Cada herramienta se usa desde su página sin pasar por un alta previa.',

  // signup — cuenta o configuración antes del primer resultado
  'adobe-firefly': 'Requiere iniciar sesión con Adobe ID antes de la primera generación.',
  'bolt-new': 'Requiere cuenta para conservar y desplegar el proyecto que genera.',
  civitai: 'Requiere cuenta para descargar modelos y para generar en su nube.',
  'claude-sonnet-5': 'Se usa a través de un producto o de la API: en ambos casos hay que identificarse antes.',
  'comfy-cloud': 'Requiere cuenta y un flujo de trabajo antes de producir nada.',
  elevenlabs: 'Requiere cuenta antes de generar audio y los créditos van asociados a ella.',
  'pika-labs': 'Requiere cuenta antes de generar vídeo.',
  pixelcut: 'Requiere cuenta para guardar y exportar el resultado.',
  'playground-ai': 'Requiere cuenta: los créditos y su renovación van asociados al usuario.',
  recraft: 'Requiere cuenta antes de generar.',
  runwayml: 'Requiere cuenta antes de generar y los créditos van asociados a ella.',
  'suno-ai': 'Requiere cuenta antes de generar música.',
  'v0-by-vercel': 'Requiere cuenta de Vercel para generar y desplegar.',
  'hugging-face-spaces': 'Muchos Spaces se abren sin cuenta, pero las colas y los límites empiezan a exigirla.',

  // install — instalación guiada, sin conocimientos técnicos
  cursor: 'Se descarga e instala como cualquier editor de escritorio; el resto es configuración normal.',
  'lm-studio': 'Instalador de escritorio con catálogo de modelos integrado: no hay que tocar la línea de órdenes.',
  ollama: 'Instalador propio y una sola orden para descargar un modelo.',
  pinokio: 'Instalador de escritorio que se encarga de las dependencias de cada aplicación.',
  fooocus: 'Se descarga y se ejecuta con un solo fichero, pero exige GPU y descarga modelos de varios gigas.',

  // technical — modelos, entornos o GPU
  comfyui: 'Exige instalar el entorno, descargar los modelos y montar el grafo de nodos.',
  invokeai: 'Exige instalación, descarga de modelos y una GPU con memoria suficiente.',
  sdnext: 'Exige entorno de Python, descarga de modelos y configuración manual.',
  'stable-diffusion-webui': 'Exige entorno de Python, descarga de modelos y GPU.',
  'gemma-4': 'Son pesos que hay que descargar y servir con otra herramienta.',
};

// ---------------------------------------------------------------------------
// 3. Aplicar
// ---------------------------------------------------------------------------

const PLANTILLA_NUEVA = {
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

const resumen = { actualizadas: [], nuevas: [], motivos: 0, sinMotivo: [] };

for (const [slug, datos] of Object.entries(VERIFICADAS)) {
  const { nueva, ...campos } = datos;
  const existente = porSlug.get(slug);

  if (nueva && !existente) {
    const ficha = {
      ...PLANTILLA_NUEVA,
      ...campos,
      nextReviewAt: PROXIMA,
      lastVerifiedAt: HOY,
      updatedAt: HOY,
    };
    catalogo.push(ficha);
    porSlug.set(slug, ficha);
    resumen.nuevas.push(slug);
    continue;
  }

  if (!existente) {
    throw new Error(`No existe la ficha "${slug}" y no está marcada como nueva.`);
  }

  // `freePlan` se sustituye entero a propósito: es el bloque que la
  // verificación reescribe, y fusionarlo dejaría vivos los límites viejos.
  Object.assign(existente, campos, {
    nextReviewAt: PROXIMA,
    lastVerifiedAt: HOY,
    updatedAt: HOY,
  });
  resumen.actualizadas.push(slug);
}

for (const ficha of catalogo) {
  if (ficha.startEffortReason) continue;
  const motivo = MOTIVOS[ficha.slug];
  if (motivo) {
    ficha.startEffortReason = motivo;
    resumen.motivos += 1;
  } else {
    resumen.sinMotivo.push(ficha.slug);
  }
}

catalogo.sort((a, b) => a.slug.localeCompare(b.slug, 'es'));
writeFileSync(RUTA, `${JSON.stringify(catalogo, null, 2)}\n`, 'utf8');

console.log(`Fichas verificadas contra fuente oficial (${resumen.actualizadas.length}):`);
for (const s of resumen.actualizadas) console.log(`  · ${s}`);
console.log(`\nFichas nuevas (${resumen.nuevas.length}):`);
for (const s of resumen.nuevas) console.log(`  · ${s}`);
console.log(`\nstartEffortReason escrito en ${resumen.motivos + resumen.actualizadas.length + resumen.nuevas.length} fichas.`);
if (resumen.sinMotivo.length) {
  console.log(`\nSIN MOTIVO (${resumen.sinMotivo.length}): ${resumen.sinMotivo.join(', ')}`);
  process.exitCode = 1;
}
console.log(`\nTotal del catálogo: ${catalogo.length}`);
