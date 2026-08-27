#!/usr/bin/env node
/**
 * Devolver las citas de la página de precios que un parche mío borró.
 *
 * `fase7-pruebas.mjs` sustituía la evidencia de un campo por la nueva en vez de
 * mirar qué había. Tres fichas perdieron así su cita documental —la de la
 * página de precios— para quedarse con una lectura de la interfaz. Es el mismo
 * error que ya cometí una vez en este repositorio y por el que `stated` exige
 * `quote`: el esquema impide inventar una cita, pero no impide tirar una buena.
 *
 * Y una de las borradas era la más importante de todas. La página de precios de
 * Clipdrop anuncia «Text to image: unlimited» en el plan gratuito, y su propio
 * producto responde que generar es exclusivo de Pro. No es que nuestra ficha se
 * equivocara por su cuenta: se equivocaba porque les creyó. Eso hay que poder
 * enseñarlo con las dos citas delante, así que cada una vuelve al campo que de
 * verdad sostiene.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const RUTA = 'src/data/tools-v2.json';
const catalogo = JSON.parse(readFileSync(RUTA, 'utf8'));
const tools = Array.isArray(catalogo) ? catalogo : catalogo.tools;
const de = (slug) => tools.find((t) => t.slug === slug);

/** Pone una evidencia en su campo, sustituyendo la que hubiera. */
const fijar = (tool, entrada) => {
  tool.evidence = [...tool.evidence.filter((e) => e.field !== entrada.field), entrada];
};

// ---------------------------------------------------------------------------
// Clipdrop: su web dice una cosa y su producto hace la contraria.
// ---------------------------------------------------------------------------
const clipdrop = de('clipdrop');
fijar(clipdrop, {
  field: 'freePlan.limits',
  outcome: 'stated',
  sourceUrl: 'https://clipdrop.co/pricing',
  sourceKind: 'pricing',
  scope: 'product',
  checkedAt: '2026-08-24',
  quote:
    'Free 0 — Text to image: unlimited · Uncrop: unlimited · Background Removal: 20/24h · Image Upscaler x2: 20/24h · Cleanup: 20/24h · Relight: 20/24h · Text Remover: 50/24h',
});

clipdrop.freePlan.limits = [
  'Su página de precios anuncia «Text to image: unlimited» en el plan gratuito, pero el producto no deja generar: responde que es exclusivo de Pro',
  'Quitar fondo: 20 cada 24 h',
  'Escalado x2: 20 cada 24 h',
  'Limpiar: 20 cada 24 h',
  'Reiluminar: 20 cada 24 h',
  'Quitar texto: 50 cada 24 h',
];
clipdrop.freePlan.summary =
  'El plan gratuito cubre las herramientas de edición con cuotas diarias —quitar fondo, escalar, limpiar, ' +
  'reiluminar y quitar texto—. Con la generación de imágenes hay un problema: su página de precios la ' +
  'anuncia como ilimitada en el plan gratuito y el producto responde que es exclusiva de Pro. Publicamos ' +
  'las dos cosas porque las dos son suyas, pero la que decide lo que puedes hacer es la segunda.';
clipdrop.verdict =
  'Cuotas diarias documentadas herramienta por herramienta, que es justo lo que un catálogo de acceso ' +
  'gratuito debe poder decir. Con una contradicción que conviene saber antes de entrar: su web promete ' +
  'generación de imágenes ilimitada y su producto no la da.';

// ---------------------------------------------------------------------------
// Krea y Leonardo: vuelve la cita de precios; la interfaz se queda en su sitio.
// ---------------------------------------------------------------------------

/*
 * La tarifa por modelo de Krea no vuelve a `evidence` y no es un descuido.
 * `evidenciaDe` devuelve la primera entrada de cada campo, así que dos citas en
 * `freePlan.limits` significarían una publicada y otra escondida. La tarifa ya
 * está archivada como captura de interfaz, con su transcripción literal y su
 * alcance, y ahí es donde le corresponde estar: es lo que el producto nos
 * enseñó con la sesión iniciada, no lo que publica en una URL.
 */
const krea = de('krea');
krea.evidence = krea.evidence.filter((e) => e.field !== 'freePlan.creditReset');
fijar(krea, {
  field: 'freePlan.limits',
  outcome: 'stated',
  sourceUrl: 'https://www.krea.ai/pricing',
  sourceKind: 'pricing',
  scope: 'cloud',
  checkedAt: '2026-08-13',
  quote:
    'Free — 100 units /day · 1 Nano Banana 2 generation · <1 Seedance 2.0 videos [Filas con aspa en el plan Free: All image models, All video models, All 3D & lipsync models, Krea Nodes, App Builder, Nodes Agent, Commercial license. Con visto: Limited LoRA training, Limited image upscaling. Image concurrency 1, Video concurrency 0.]',
});
krea.freePlan.limits = krea.freePlan.limits.filter((l) => !l.startsWith('Coste por generación'));
krea.freePlan.summary =
  'Plan gratuito con 100 unidades de cómputo al día. La tabla de precios las equipara a una generación de ' +
  'Nano Banana 2, pero al usarlo el selector del producto tarifaba cada modelo por separado —Krea 2 Turbo ' +
  '2, Medium 9, Large 20—, así que cuánto rinden depende del que elijas. Incluye el modelo propio Krea 2, ' +
  'entrenamiento LoRA limitado y escalado limitado hasta 2K. La tabla marca como no incluidos el resto de ' +
  'modelos de imagen, los de vídeo, los de 3D, los nodos y la licencia comercial.';

fijar(de('leonardo-ai'), {
  field: 'freePlan.limits',
  outcome: 'stated',
  sourceUrl: 'https://leonardo.ai/pricing/',
  sourceKind: 'pricing',
  scope: 'cloud',
  checkedAt: '2026-08-13',
  quote:
    'FREE $0 /month […] Fast Tokens 150 / day · Token Bank 150 · Creations access Public · Quality settings Basic · Personal collections 1',
});

writeFileSync(RUTA, `${JSON.stringify(catalogo, null, 2)}\n`, 'utf8');
console.log('✓ Clipdrop: vuelve «Text to image: unlimited» y la ficha enseña la contradicción');
console.log('✓ Krea: vuelve la cita de su tabla de precios; la tarifa se queda en la captura');
console.log('✓ Leonardo: vuelve la cita de su página de precios');
