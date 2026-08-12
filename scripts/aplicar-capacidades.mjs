#!/usr/bin/env node
/**
 * Escribe `capabilities` y `startEffort` en el catálogo.
 *
 * La extracción automática encontró candidatas leyendo páginas oficiales, y por
 * sí sola no vale: una página que *menciona* una capacidad no demuestra que la
 * herramienta la tenga. ElevenLabs salía con «text-to-image» porque su tabla de
 * precios nombra un plan «Image & Video»; Hugging Face Spaces salía con quince
 * porque aloja de todo.
 *
 * Aceptar eso habría repetido el error de la auditoría con otro disfraz: un
 * dato plausible, masivo y sin comprobar. Así que la extracción es una lista de
 * candidatas y aquí se filtra por lo que la herramienta *es*.
 *
 * Cada capacidad guardada conserva la frase que la respalda, de modo que
 * cualquiera puede discutir una concreta sin tener que rehacer las treinta y
 * tres.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOY = '2026-08-12';

const IMAGEN = new Set([
  'text-to-image', 'image-to-image', 'image-editing', 'inpainting', 'outpainting',
  'reference-image', 'character-consistency', 'upscaling', 'background-removal',
]);
const VIDEO = new Set(['text-to-video', 'image-to-video', 'video-editing']);
const AUDIO = new Set(['text-to-speech', 'voice-clone', 'text-to-music', 'transcription']);
const INFRA = new Set(['api', 'model-hosting', 'model-download']);

/**
 * Plataformas cuyo catálogo es de terceros.
 *
 * Lo que alojan no es lo que hacen. Marcar a Hugging Face Spaces con
 * `text-to-image` diría que genera imágenes, cuando lo que hace es ejecutar el
 * modelo de otra persona — y en un comparador esa diferencia lo es todo.
 */
const ALOJAN_DE_TERCEROS = new Set([
  'hugging-face-spaces', 'pinokio', 'replicate', 'civitai', 'comfy-cloud', 'fal-ai',
]);

/** El dominio de cada herramienta, para descartar lo que su página sólo nombra. */
const DOMINIO = {
  imagen: IMAGEN,
  video: new Set([...VIDEO, ...IMAGEN]),
  voz: AUDIO,
  musica: AUDIO,
  'chat-asistentes': new Set(['text-generation', 'agents']),
  escritura: new Set(['text-generation']),
  codigo: new Set(['code-generation', 'agents']),
  investigacion: new Set(['text-generation']),
  apis: INFRA,
  'modelos-open-source': new Set([...INFRA, 'text-generation']),
  'herramientas-locales': INFRA,
};

/**
 * Cuánto cuesta empezar. Lectura editorial, no afirmación sobre el fabricante:
 * lo que exige cita es lo que la empresa promete, no lo que observamos nosotros.
 */
const ESFUERZO = {
  comfyui: 'technical',
  'stable-diffusion-webui': 'technical',
  sdnext: 'technical',
  fooocus: 'install',
  invokeai: 'technical',
  ollama: 'install',
  'lm-studio': 'install',
  pinokio: 'install',
  'gemma-4': 'technical',
  replicate: 'signup',
  'hugging-face-spaces': 'signup',
  'comfy-cloud': 'signup',
  civitai: 'signup',
  midjourney: 'signup',
  'leonardo-ai': 'signup',
  cursor: 'install',
  'suno-ai': 'signup',
  elevenlabs: 'signup',
  'adobe-firefly': 'signup',
  recraft: 'signup',
  pixelcut: 'signup',
  'playground-ai': 'signup',
  clipdrop: 'instant',
  chatgpt: 'instant',
  claude: 'instant',
  'google-gemini': 'instant',
  'perplexity-ai': 'instant',
  'grok-imagine': 'signup',
};

const evidencia = existsSync(resolve(ROOT, '.capacidades.json'))
  ? JSON.parse(readFileSync(resolve(ROOT, '.capacidades.json'), 'utf8'))
  : {};

const ruta = resolve(ROOT, 'src/data/tools-v2.json');
const tools = JSON.parse(readFileSync(ruta, 'utf8'));

let conCapacidades = 0;
let descartadas = 0;

for (const t of tools) {
  const hallado = evidencia[t.slug];
  t.startEffort = ESFUERZO[t.slug] ?? (t.hosting === 'local' ? 'technical' : 'signup');

  if (!hallado?.capabilities?.length) {
    t.capabilities = [];
    continue;
  }

  const permitido = DOMINIO[t.categorySlug] ?? new Set();
  const aceptadas = hallado.capabilities.filter((cap) => {
    // Una plataforma que aloja modelos ajenos no "hace" lo que alojan.
    if (ALOJAN_DE_TERCEROS.has(t.slug)) return INFRA.has(cap);
    // `agents` se ha vuelto una palabra de marketing: casi toda página la usa.
    if (cap === 'agents' && t.categorySlug !== 'agentes' && t.kind !== 'agent') return false;
    return permitido.has(cap) || cap === 'api';
  });

  descartadas += hallado.capabilities.length - aceptadas.length;
  t.capabilities = aceptadas;

  if (aceptadas.length) {
    conCapacidades += 1;
    t.evidence = {
      ...(t.evidence ?? {}),
      capabilities: {
        sourceUrl: hallado.fuente,
        verifiedAt: HOY,
        quote: aceptadas.map((c) => hallado.citas[c]).filter(Boolean).slice(0, 3).join(' · '),
      },
    };
  }
}

writeFileSync(ruta, `${JSON.stringify(tools, null, 2)}\n`, 'utf8');

const porEsfuerzo = {};
for (const t of tools) porEsfuerzo[t.startEffort] = (porEsfuerzo[t.startEffort] ?? 0) + 1;

console.log('\nCapacidades y esfuerzo');
console.log('─'.repeat(58));
console.log(`  fichas con capacidades          ${conCapacidades}/${tools.length}`);
console.log(`  candidatas descartadas          ${descartadas}`);
console.log(`  reparto de startEffort          ${JSON.stringify(porEsfuerzo)}\n`);
