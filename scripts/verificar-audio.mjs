#!/usr/bin/env node
/**
 * La vertical de audio, verificada contra fuente oficial.
 *
 * Todo lo que escribe este fichero salió de una página oficial abierta el 18 de
 * agosto de 2026. Donde la fuente no lo dice, el campo se queda sin afirmar.
 *
 * Dos cosas que esta ronda deja claras y que ninguna otra vertical había
 * enseñado tan bien:
 *
 *   **Gratis no es lo mismo que poder usarlo.** Suno da cincuenta créditos al
 *   día y dice «No commercial use». ElevenLabs da diez mil créditos al mes y
 *   reserva la licencia comercial para los planes de pago. Fish Audio lo
 *   escribe con todas las letras: «Fish Audio's free plan is for personal use
 *   only». Tres de las cuatro plataformas gratuitas más relevantes de audio no
 *   dejan monetizar lo que produces, y eso decide más que cualquier cifra.
 *
 *   **Código abierto no es lo mismo que pesos abiertos.** AudioCraft publica su
 *   código con licencia MIT y sus pesos con CC-BY-NC. F5-TTS, igual. Un
 *   catálogo que dijera «open source» y parara ahí estaría contando la mitad.
 *
 * Y una regla que este fichero respeta al pie de la letra: **no se convierten
 * unidades**. «10k credits» no son «X minutos» salvo que la propia página
 * publique la equivalencia.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RUTA = resolve(ROOT, 'src/data/tools-v2.json');
const HOY = '2026-08-18';
const PROXIMA = '2026-11-16';

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
};

// ---------------------------------------------------------------------------
// Fichas existentes que la verificación corrige
// ---------------------------------------------------------------------------

const CORREGIDAS = {
  'suno-ai': {
    verification: 'verified',
    officialUrl: 'https://suno.com/',
    pricingUrl: 'https://suno.com/pricing',
    freeModel: 'credits',
    tagline: 'Cincuenta créditos al día, diez canciones, y nada de uso comercial.',
    descriptionShort:
      'Generador de canciones completas —letra, voz e instrumentación— desde una descripción. Su plan gratuito renueva 50 créditos cada día, que su propia página equipara a diez canciones, y no permite usar comercialmente lo que produces.',
    verdict:
      'De los planes gratuitos más generosos que existen en música, con una condición que conviene leer antes de invertir una tarde: lo que salga de ahí no se puede monetizar.',
    freePlan: {
      summary:
        'Plan gratuito con 50 créditos que se renuevan a diario, equivalentes a diez canciones según la propia página. Sin uso comercial. Sin descargas mensuales de canciones a partir del 3/9/26 y sin compra de créditos adicionales. El plan de pago más barato es Pro, 8 $/mes.',
      limits: [
        '50 créditos al día (10 canciones)',
        'Uso comercial NO permitido',
        'Sin descargas mensuales de canciones a partir del 3/9/26',
        'Sin compra de créditos adicionales',
        'Plan de pago más barato: Pro, 8 $/mes',
      ],
      requiresSignup: 'yes',
      requiresCreditCard: 'unverified',
      hasWatermark: 'unverified',
      commercialUse: 'no',
      creditsAmount: '50 créditos/día (10 canciones)',
      creditReset: 'daily',
      verifiedAt: HOY,
    },
    capabilities: ['text-to-music'],
    startEffort: 'signup',
    startEffortReason: 'Requiere cuenta; los créditos diarios van asociados a ella.',
    sources: [
      { url: 'https://suno.com/', label: 'Web oficial', kind: 'official', publisher: 'suno.com', checkedAt: HOY },
      { url: 'https://suno.com/pricing', label: 'Página oficial de precios', kind: 'pricing', publisher: 'suno.com', checkedAt: HOY },
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://suno.com/pricing',
        verifiedAt: HOY,
        quote:
          '50 credits renew daily (10 songs) · No commercial use · No monthly song downloads (starting 9/3/26) · No add-on credit purchases',
      },
    },
    auditNotes:
      'La equivalencia «10 canciones» se publica en la misma línea que los créditos, así que se recoge tal cual. No se convierte nada que la página no convierta.',
  },

  elevenlabs: {
    verification: 'verified',
    officialUrl: 'https://elevenlabs.io/',
    pricingUrl: 'https://elevenlabs.io/pricing',
    freeModel: 'credits',
    categorySlug: 'voz',
    secondaryCategories: ['musica'],
    tagline: 'Diez mil créditos al mes, y la licencia comercial empieza en el plan de pago.',
    descriptionShort:
      'Plataforma de voz con texto a voz, transcripción, efectos de sonido, diseño de voz y música. Su plan gratuito da 10.000 créditos al mes; la clonación de voz y el doblaje son de pago, y la licencia comercial también.',
    verdict:
      'La referencia en voz sintética, y su plan gratuito sirve para probarlo todo salvo lo que probablemente vas buscando: clonar una voz y poder usar el resultado en un trabajo.',
    freePlan: {
      summary:
        'Plan gratuito con 10.000 créditos al mes que se reinician al empezar cada ciclo de facturación. Incluye texto a voz, transcripción, efectos de sonido, diseño de voz, música y tres proyectos de Studio. La clonación de voz y el doblaje no están incluidos, y la licencia comercial empieza en el plan Starter, 6 $/mes con 30.000 créditos.',
      limits: [
        '10.000 créditos al mes',
        'Licencia comercial NO incluida: empieza en Starter',
        'Clonación de voz y doblaje: no incluidos en el plan gratuito',
        '3 proyectos en Studio',
        'Plan de pago más barato: Starter, 6 $/mes (30.000 créditos)',
      ],
      requiresSignup: 'yes',
      requiresCreditCard: 'unverified',
      hasWatermark: 'unverified',
      commercialUse: 'no',
      creditsAmount: '10.000 créditos/mes',
      creditReset: 'monthly',
      verifiedAt: HOY,
    },
    capabilities: [
      'text-to-speech',
      'transcription',
      'sound-effects',
      'text-to-music',
      'voice-clone',
      'dubbing',
      'api',
    ],
    startEffort: 'signup',
    startEffortReason: 'Requiere cuenta; los créditos mensuales van asociados a ella.',
    sources: [
      { url: 'https://elevenlabs.io/', label: 'Web oficial', kind: 'official', publisher: 'elevenlabs.io', checkedAt: HOY },
      { url: 'https://elevenlabs.io/pricing', label: 'Página oficial de precios', kind: 'pricing', publisher: 'elevenlabs.io', checkedAt: HOY },
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://elevenlabs.io/pricing',
        verifiedAt: HOY,
        quote:
          '10k credits per month · Text to Speech, Speech to Text, Sound Effects, Voice Design, Music, Productions, Image · 3 Projects in Studio. [Commercial License aparece a partir de Starter; clonación y doblaje, en planes de pago.]',
      },
    },
    auditNotes:
      'Las capacidades describen la plataforma; el plan gratuito no incluye clonación ni doblaje y así consta en los límites. 10.000 créditos no se traducen a minutos ni a caracteres: la página no publica esa equivalencia.',
  },

  descript: {
    secondaryCategories: ['voz'],
  },
};

// ---------------------------------------------------------------------------
// Fichas nuevas
// ---------------------------------------------------------------------------

const NUEVAS = {
  cartesia: {
    id: 'tool_cartesia',
    slug: 'cartesia',
    name: 'Cartesia',
    kind: 'platform',
    verification: 'verified',
    categorySlug: 'voz',
    officialUrl: 'https://cartesia.ai/',
    pricingUrl: 'https://cartesia.ai/pricing',
    hosting: 'cloud',
    openSource: 'no',
    platforms: ['web', 'api'],
    freeModel: 'credits',
    tagline: 'Veinte mil créditos al mes, con la equivalencia en minutos publicada.',
    descriptionShort:
      'Plataforma de voz en tiempo real con texto a voz (Sonic), transcripción (Ink) y clonación instantánea o profesional. Su plan gratuito da 20.000 créditos al mes, que su propia tabla equipara a unos 27 minutos de audio.',
    verdict:
      'De las pocas que publican a cuántos minutos equivalen sus créditos, que es justo lo que hace falta para saber si alcanzan. Orientada a agentes de voz y a integrarse por API.',
    freePlan: {
      summary:
        'Plan gratuito con 20.000 créditos al mes, que la tabla oficial equipara a unos 27 minutos de audio generado. Incluye texto a voz y transcripción, un espacio de agente con ocho llamadas simultáneas. El plan de pago más barato es Pro, 5 $/mes con 100.000 créditos.',
      limits: [
        '20.000 créditos al mes (≈27 minutos según su tabla)',
        '1 espacio de agente, 8 llamadas simultáneas',
        'Plan de pago más barato: Pro, 5 $/mes (100.000 créditos, ≈133 minutos)',
      ],
      requiresSignup: 'yes',
      requiresCreditCard: 'unverified',
      hasWatermark: 'unverified',
      commercialUse: 'unverified',
      creditsAmount: '20.000 créditos/mes (≈27 min)',
      creditReset: 'monthly',
      verifiedAt: HOY,
    },
    capabilities: ['text-to-speech', 'transcription', 'voice-clone', 'api'],
    startEffort: 'signup',
    startEffortReason: 'Requiere cuenta y clave de API; está pensada para integrarse en código.',
    scores: { freeReal: 6, usefulness: 8, ease: 6, transparency: 9, creatorValue: 6 },
    sources: [
      { url: 'https://cartesia.ai/', label: 'Web oficial', kind: 'official', publisher: 'cartesia.ai', checkedAt: HOY },
      { url: 'https://cartesia.ai/pricing', label: 'Página oficial de precios', kind: 'pricing', publisher: 'cartesia.ai', checkedAt: HOY },
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://cartesia.ai/pricing',
        verifiedAt: HOY,
        quote:
          'Free — 20K credits / month · Text to Speech and Speech to Text · approximately 27 minutes of generated audio monthly · 1 agent slot with 8 concurrent calls',
      },
      capabilities: {
        sourceUrl: 'https://cartesia.ai/pricing',
        verifiedAt: HOY,
        quote: 'Text to Speech (Sonic) · Speech to Text (Ink) · Voice Cloning (instant and professional) · Voice Agents (Line)',
      },
    },
    auditNotes:
      'La equivalencia en minutos se recoge porque la publica la propia tabla. Si no la publicara, se habrían dejado los créditos a secas.',
  },

  'fish-audio': {
    id: 'tool_fish-audio',
    slug: 'fish-audio',
    name: 'Fish Audio',
    kind: 'app',
    verification: 'partially_verified',
    categorySlug: 'voz',
    officialUrl: 'https://fish.audio/',
    hosting: 'cloud',
    openSource: 'unverified',
    platforms: ['web', 'api'],
    freeModel: 'freemium',
    tagline: 'Clona una voz en quince segundos. El plan gratuito es sólo para uso personal.',
    descriptionShort:
      'Plataforma de voz con clonación en quince segundos, más de treinta idiomas y etiquetas de emoción. Tiene plan gratuito con «generaciones mensuales» cuya cantidad no publica, y su web dice sin rodeos que ese plan es sólo para uso personal.',
    verdict:
      'La clonación rápida es su argumento, y la letra pequeña está donde importa: para monetizar en YouTube, en un pódcast o en un negocio hay que pagar.',
    freePlan: {
      summary:
        'Existe un plan gratuito con «generaciones mensuales» cuya cantidad no se publica. La web afirma que el plan gratuito es sólo para uso personal: monetizar contenido o usar las voces comercialmente exige un plan de pago.',
      limits: [
        'Sólo uso personal: monetizar exige plan de pago',
        'La cantidad de generaciones mensuales no se publica',
      ],
      requiresSignup: 'yes',
      requiresCreditCard: 'unverified',
      hasWatermark: 'unverified',
      commercialUse: 'no',
      creditReset: 'unknown',
      verifiedAt: HOY,
    },
    capabilities: ['text-to-speech', 'voice-clone', 'transcription', 'api'],
    startEffort: 'signup',
    startEffortReason: 'Requiere cuenta antes de generar o clonar.',
    scores: { freeReal: 5, usefulness: 8, ease: 8, transparency: 5, creatorValue: 5 },
    sources: [
      { url: 'https://fish.audio/', label: 'Web oficial', kind: 'official', publisher: 'fish.audio', checkedAt: HOY },
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://fish.audio/',
        verifiedAt: HOY,
        quote:
          "Fish Audio's free plan is for personal use only. To monetize content or use voices commercially (YouTube, podcasts, business), upgrade to our paid plans for full commercial rights.",
      },
      capabilities: {
        sourceUrl: 'https://fish.audio/',
        verifiedAt: HOY,
        quote:
          'text-to-speech, voice cloning, speech-to-text · Voice cloning in as little as 15 seconds · 30+ languages',
      },
    },
    auditNotes:
      'Publica modelos abiertos (Fish Speech), pero `openSource` se queda en `unverified`: no se leyó el identificador de licencia del repositorio en esta comprobación.',
  },

  // -------------------------------------------------------------------------
  // Local y pesos abiertos. Aquí la licencia de los pesos manda sobre la del
  // código, y no siempre coinciden.
  // -------------------------------------------------------------------------

  whisper: {
    id: 'tool_whisper',
    slug: 'whisper',
    name: 'Whisper',
    kind: 'model',
    verification: 'verified',
    categorySlug: 'voz',
    secondaryCategories: ['modelos-open-source'],
    officialUrl: 'https://github.com/openai/whisper',
    repoUrl: 'https://github.com/openai/whisper',
    hosting: 'local',
    openSource: 'yes',
    licence: 'MIT',
    platforms: ['linux', 'macos', 'windows'],
    freeModel: 'open_source',
    tagline: 'Transcribir en tu equipo con licencia MIT, desde 1 GB de memoria de vídeo.',
    descriptionShort:
      'Modelo de reconocimiento de voz de OpenAI publicado con licencia MIT, código y pesos. Transcribe y traduce en varios idiomas. Sus seis tamaños van de 1 GB de VRAM en el más pequeño a 10 GB en el mayor.',
    verdict:
      'La respuesta por defecto cuando la transcripción no puede salir de tu equipo. MIT en código y pesos, que en audio abierto es menos común de lo que parece.',
    freePlan: {
      summary:
        'Código y pesos publicados con licencia MIT. Sin cuotas ni cuenta: el coste es el equipo. Seis tamaños de modelo, de 39M de parámetros y ~1 GB de VRAM al de 1550M y ~10 GB.',
      limits: [
        'tiny y base: ~1 GB de VRAM',
        'small: ~2 GB · medium: ~5 GB · turbo: ~6 GB · large: ~10 GB',
        'Sin cuotas ni cuenta: el coste es el hardware',
      ],
      requiresSignup: 'no',
      requiresCreditCard: 'no',
      hasWatermark: 'unverified',
      commercialUse: 'unverified',
      creditReset: 'none',
      verifiedAt: HOY,
    },
    capabilities: ['transcription', 'model-download'],
    startEffort: 'technical',
    startEffortReason: 'Se instala con pip y se ejecuta desde la terminal o desde código.',
    hardwareRequirements: 'De ~1 GB de VRAM (tiny) a ~10 GB (large).',
    scores: { freeReal: 10, usefulness: 9, ease: 4, transparency: 10, creatorValue: 9 },
    sources: [
      { url: 'https://github.com/openai/whisper', label: 'Repositorio oficial', kind: 'repo', publisher: 'github.com', checkedAt: HOY },
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://github.com/openai/whisper',
        verifiedAt: HOY,
        quote: "Whisper's code and model weights are released under the MIT License.",
      },
    },
  },

  kokoro: {
    id: 'tool_kokoro',
    slug: 'kokoro',
    name: 'Kokoro',
    kind: 'model',
    verification: 'verified',
    categorySlug: 'voz',
    secondaryCategories: ['modelos-open-source'],
    officialUrl: 'https://github.com/hexgrad/kokoro',
    repoUrl: 'https://github.com/hexgrad/kokoro',
    hosting: 'local',
    openSource: 'yes',
    licence: 'Apache-2.0',
    platforms: ['linux', 'macos', 'windows'],
    freeModel: 'open_source',
    tagline: 'Ochenta y dos millones de parámetros, Apache 2.0, y cabe en un Colab.',
    descriptionShort:
      'Modelo de texto a voz de 82 millones de parámetros con licencia Apache 2.0. Habla nueve idiomas, genera a 24 kHz y se instala con pip; su repositorio lo describe como comparable en calidad a modelos mayores y bastante más rápido.',
    verdict:
      'La opción a mirar cuando la voz tiene que salir de tu equipo y con licencia permisiva. Apache 2.0 en un terreno donde la mayoría de los pesos abiertos son no comerciales.',
    freePlan: {
      summary:
        'Publicado con licencia Apache 2.0. Sin cuotas ni cuenta. 82 millones de parámetros, salida a 24 kHz, nueve idiomas y ejecución posible en Google Colab según su repositorio.',
      limits: [
        '82 millones de parámetros',
        'Nueve idiomas: inglés americano y británico, español, francés, hindi, italiano, japonés, portugués de Brasil y chino mandarín',
        'Salida a 24 kHz',
        'Sin cuotas ni cuenta: el coste es el hardware',
      ],
      requiresSignup: 'no',
      requiresCreditCard: 'no',
      hasWatermark: 'unverified',
      commercialUse: 'unverified',
      creditReset: 'none',
      verifiedAt: HOY,
    },
    capabilities: ['text-to-speech', 'model-download'],
    startEffort: 'technical',
    startEffortReason: 'Se instala con pip y se usa desde código; no hay interfaz.',
    scores: { freeReal: 10, usefulness: 8, ease: 4, transparency: 9, creatorValue: 8 },
    sources: [
      { url: 'https://github.com/hexgrad/kokoro', label: 'Repositorio oficial', kind: 'repo', publisher: 'github.com', checkedAt: HOY },
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://github.com/hexgrad/kokoro',
        verifiedAt: HOY,
        quote:
          'Apache-2.0 · 82 million parameters · comparable quality to larger models while being significantly faster and more cost-efficient · 24,000 Hz',
      },
    },
  },

  'f5-tts': {
    id: 'tool_f5-tts',
    slug: 'f5-tts',
    name: 'F5-TTS',
    kind: 'model',
    verification: 'verified',
    categorySlug: 'voz',
    secondaryCategories: ['modelos-open-source'],
    officialUrl: 'https://github.com/SWivid/F5-TTS',
    repoUrl: 'https://github.com/SWivid/F5-TTS',
    hosting: 'local',
    openSource: 'yes',
    licence: 'MIT (código) · CC-BY-NC (pesos)',
    platforms: ['linux', 'windows'],
    freeModel: 'open_source',
    tagline: 'Código MIT, pesos no comerciales. La diferencia importa.',
    descriptionShort:
      'Modelo de voz que imita a partir de un audio de referencia, con generación multiestilo y multihablante. Su código es MIT, pero **los pesos preentrenados son CC-BY-NC** por el conjunto de datos con el que se entrenaron.',
    verdict:
      'Un ejemplo de por qué «open source» no basta como etiqueta: el código se puede usar para lo que sea, y los pesos que lo hacen útil no permiten uso comercial.',
    freePlan: {
      summary:
        'Código con licencia MIT. Pesos preentrenados con licencia CC-BY-NC, es decir, no comercial, por el conjunto de datos Emilia con el que se entrenaron. Sin cuotas ni cuenta.',
      limits: [
        'Código: MIT',
        'Pesos preentrenados: CC-BY-NC, sin uso comercial',
        'Sin cuotas ni cuenta: el coste es el hardware',
      ],
      requiresSignup: 'no',
      requiresCreditCard: 'no',
      hasWatermark: 'unverified',
      commercialUse: 'no',
      creditReset: 'none',
      verifiedAt: HOY,
    },
    capabilities: ['text-to-speech', 'voice-clone', 'model-download'],
    startEffort: 'technical',
    startEffortReason: 'Exige entorno de Python, descarga de pesos y GPU.',
    scores: { freeReal: 8, usefulness: 8, ease: 3, transparency: 9, creatorValue: 6 },
    sources: [
      { url: 'https://github.com/SWivid/F5-TTS', label: 'Repositorio oficial', kind: 'repo', publisher: 'github.com', checkedAt: HOY },
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://github.com/SWivid/F5-TTS',
        verifiedAt: HOY,
        quote:
          'The pre-trained models are licensed under the CC-BY-NC license due to the training data Emilia, which is an in-the-wild dataset.',
      },
      capabilities: {
        sourceUrl: 'https://github.com/SWivid/F5-TTS',
        verifiedAt: HOY,
        quote: 'Basic TTS with Chunk Inference · Multi-Style / Multi-Speaker Generation · Voice Chat',
      },
    },
    auditNotes:
      '`commercialUse: no` viene de la licencia de los pesos, no del código. La ficha lo dice en el titular porque es el dato que cambia la decisión.',
  },

  audiocraft: {
    id: 'tool_audiocraft',
    slug: 'audiocraft',
    name: 'AudioCraft (MusicGen)',
    kind: 'model',
    verification: 'verified',
    categorySlug: 'musica',
    secondaryCategories: ['modelos-open-source'],
    officialUrl: 'https://github.com/facebookresearch/audiocraft',
    repoUrl: 'https://github.com/facebookresearch/audiocraft',
    hosting: 'local',
    openSource: 'yes',
    licence: 'MIT (código) · CC-BY-NC 4.0 (pesos)',
    platforms: ['linux'],
    freeModel: 'open_source',
    tagline: 'Música y sonido en local, con pesos que no permiten uso comercial.',
    descriptionShort:
      'Biblioteca de Meta con MusicGen (texto a música), AudioGen (texto a sonido), MAGNeT y JASCO, condicionable por acordes, melodía y percusión. Código MIT; **pesos CC-BY-NC 4.0**.',
    verdict:
      'La vía para generar música sin depender de nadie, con el mismo pero que F5-TTS: los pesos no son comerciales. Sirve para aprender, prototipar y uso personal.',
    freePlan: {
      summary:
        'Código publicado con licencia MIT. Pesos de los modelos publicados con licencia CC-BY-NC 4.0, es decir, sin uso comercial. Sin cuotas ni cuenta.',
      limits: [
        'Código: MIT',
        'Pesos: CC-BY-NC 4.0, sin uso comercial',
        'Sin cuotas ni cuenta: el coste es el hardware',
      ],
      requiresSignup: 'no',
      requiresCreditCard: 'no',
      hasWatermark: 'unverified',
      commercialUse: 'no',
      creditReset: 'none',
      verifiedAt: HOY,
    },
    capabilities: ['text-to-music', 'sound-effects', 'model-download'],
    startEffort: 'technical',
    startEffortReason: 'Exige entorno de Python, descarga de pesos y GPU.',
    scores: { freeReal: 8, usefulness: 7, ease: 3, transparency: 9, creatorValue: 6 },
    sources: [
      { url: 'https://github.com/facebookresearch/audiocraft', label: 'Repositorio oficial', kind: 'repo', publisher: 'github.com', checkedAt: HOY },
    ],
    evidence: {
      freePlan: {
        sourceUrl: 'https://github.com/facebookresearch/audiocraft',
        verifiedAt: HOY,
        quote:
          'The code in this repository is released under the MIT license as found in the LICENSE file. The models weights in this repository are released under the CC-BY-NC 4.0 license as found in the LICENSE_weights file.',
      },
      capabilities: {
        sourceUrl: 'https://github.com/facebookresearch/audiocraft',
        verifiedAt: HOY,
        quote:
          'MusicGen: A controllable text-to-music generation system · AudioGen: A text-to-sound synthesis model · MAGNeT · JASCO, conditioned on chords, melodies and drum tracks',
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
