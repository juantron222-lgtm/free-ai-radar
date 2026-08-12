#!/usr/bin/env node
/**
 * Strips the catalogue of every claim nobody checked, once.
 *
 * The audit found 22 of 24 entries asserting `requiresCreditCard: no` and 22
 * asserting `hasWatermark: no`, all written on the same day. One of the 44 is
 * backed by a quote. The rest are defaults that read as verified facts on the
 * questions a reader most needs to trust.
 *
 * This does not guess better values. It removes the ones that were never
 * earned, sets them to `unverified`, and records evidence only where a quote
 * exists. A catalogue that says "we do not know" is worth more than one that
 * says "no" and is wrong.
 *
 * Run once, deliberately:
 *   node scripts/sanear-catalogo.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOY = '2026-08-12';

/**
 * What a primary source actually said, read during the audit.
 *
 * Only these justify a `yes` or a `no`. Everything absent from this table
 * becomes `unverified`, however plausible it looks.
 */
const EVIDENCIA = {
  cursor: {
    requiresCreditCard: { valor: 'no', cita: 'Hobby Free Includes: ✓ No credit card required', url: 'https://cursor.com/pricing' },
  },
  'suno-ai': {
    freeModel: 'credits',
    creditReset: 'daily',
    creditsAmount: '50 credits',
    commercialUse: { valor: 'no', cita: 'No commercial use', url: 'https://suno.com/pricing' },
    fuente: 'https://suno.com/pricing',
    cita: 'Free Plan Our starter plan 50 credits renew daily',
  },
  elevenlabs: {
    freeModel: 'credits',
    creditReset: 'monthly',
    creditsAmount: '10k credits per month',
    fuente: 'https://elevenlabs.io/pricing',
    cita: 'Free $0 per month ... 10k credits per month',
  },
  'pika-labs': {
    freeModel: 'credits',
    creditReset: 'monthly',
    creditsAmount: '80 monthly video credits',
    fuente: 'https://pika.art/pricing',
    cita: '$0 Free billed yearly Basic ... 80 monthly video credits',
  },
  civitai: {
    freeModel: 'credits',
    creditReset: 'unknown',
    fuente: 'https://civitai.com/pricing',
    cita: 'Buzz on daily rewards',
    nota:
      'La página menciona recompensas diarias de Buzz, pero no documenta cuántas ni si esa es la renovación del plan gratuito. creditReset queda unknown a propósito: "daily rewards" no es lo mismo que "los créditos se renuevan a diario".',
  },
};

/** Lo que la auditoría demostró que estaba mal, con su corrección. */
const CORRECCIONES = {
  comfyui: {
    officialUrl: 'https://github.com/Comfy-Org/ComfyUI',
    repoUrl: 'https://github.com/Comfy-Org/ComfyUI',
    nota: 'El repositorio pasó de comfyanonymous/ComfyUI a Comfy-Org/ComfyUI. La URL anterior redirige, pero nombraba a un propietario que ya no lo es.',
  },
  midjourney: {
    freeModel: 'unknown',
    nota: 'Su web y su centro de ayuda devuelven 403 a lectura automatizada. El "trial" que declaraba la ficha no se puede demostrar, y un trial sin prueba invita a intentar registrarse gratis y no poder.',
  },
  replicate: {
    freeModel: 'unknown',
    nota: '"demo" no describe ninguno de los accesos que ofrece: es una plataforma de inferencia de pago por uso. Sin lectura de su plan gratuito, unknown.',
  },
  fooocus: {
    skillLevel: 'intermediate',
    nota: 'Aplicación Python local que exige GPU e instalación. Presentarla como "beginner" junto a generadores web es la comparación engañosa que la auditoría señaló. Último push del repositorio: 2025-12-01.',
  },
  'stable-diffusion-webui': { skillLevel: 'advanced' },
  ollama: { skillLevel: 'intermediate' },
  'lm-studio': { skillLevel: 'intermediate' },
  pinokio: { skillLevel: 'intermediate' },
  'leonardo-ai': { freeModel: 'unknown', nota: 'Su sitio devuelve 403 a lectura automatizada. Sin fuente legible, no afirmamos nada.' },
  'perplexity-ai': { freeModel: 'unknown', nota: 'Su sitio devuelve 403 a lectura automatizada.' },
  'google-gemini': { freeModel: 'unknown', nota: 'Su página no se puede leer de forma automatizada.' },
};

const tools = JSON.parse(readFileSync(resolve(ROOT, 'src/data/generated/tools.json'), 'utf8'));

let tarjetas = 0;
let marcas = 0;
let comercial = 0;
let creditos = 0;

const saneadas = tools.map((t) => {
  const ev = EVIDENCIA[t.slug] ?? {};
  const fix = CORRECCIONES[t.slug] ?? {};
  const plan = { ...t.freePlan };
  const notas = [];

  // --- Los tres hechos perecederos: unverified salvo cita ---
  if (ev.requiresCreditCard) {
    plan.requiresCreditCard = ev.requiresCreditCard.valor;
  } else if (plan.requiresCreditCard !== 'unverified') {
    plan.requiresCreditCard = 'unverified';
    tarjetas += 1;
  }

  if (plan.hasWatermark !== 'unverified') {
    plan.hasWatermark = 'unverified';
    marcas += 1;
  }

  if (ev.commercialUse) {
    plan.commercialUse = ev.commercialUse.valor;
  } else if (plan.commercialUse !== 'unverified') {
    plan.commercialUse = 'unverified';
    comercial += 1;
  }

  // --- Créditos, sólo donde el fabricante los publica ---
  if (ev.creditReset) {
    plan.creditReset = ev.creditReset;
    if (ev.creditsAmount) plan.creditsAmount = ev.creditsAmount;
    creditos += 1;
  }

  /*
   * La evidencia viaja con el dato.
   *
   * Sin esto, dentro de seis meses nadie puede distinguir un "50 credits" que
   * alguien leyó de uno que alguien supuso, que es exactamente cómo se llegó a
   * las 22 tarjetas.
   */
  const evidence = {};
  if (ev.fuente) evidence.freePlan = { sourceUrl: ev.fuente, verifiedAt: HOY, quote: ev.cita };
  if (ev.requiresCreditCard) {
    evidence.requiresCreditCard = {
      sourceUrl: ev.requiresCreditCard.url,
      verifiedAt: HOY,
      quote: ev.requiresCreditCard.cita,
    };
  }
  if (ev.commercialUse) {
    evidence.commercialUse = {
      sourceUrl: ev.commercialUse.url,
      verifiedAt: HOY,
      quote: ev.commercialUse.cita,
    };
  }

  if (ev.nota) notas.push(ev.nota);
  if (fix.nota) notas.push(fix.nota);

  const registro = {
    ...t,
    ...(fix.officialUrl ? { officialUrl: fix.officialUrl } : {}),
    ...(fix.repoUrl ? { repoUrl: fix.repoUrl } : {}),
    ...(fix.skillLevel ? { skillLevel: fix.skillLevel } : {}),
    freeModel: ev.freeModel ?? fix.freeModel ?? t.freeModel,
    freePlan: { ...plan, verifiedAt: ev.fuente ? HOY : plan.verifiedAt },
    ...(Object.keys(evidence).length ? { evidence } : {}),
    ...(notas.length ? { auditNotes: notas } : {}),
  };

  return registro;
});

writeFileSync(
  resolve(ROOT, 'src/data/tools-v2.json'),
  `${JSON.stringify(saneadas, null, 2)}\n`,
  'utf8'
);

// El fichero heredado deja de ser fuente: de ahí salieron los valores en bloque.
writeFileSync(resolve(ROOT, 'src/data/tools.json'), '[]\n', 'utf8');

console.log(`\nSaneado del catálogo`);
console.log('─'.repeat(58));
console.log(`  fichas                                   ${saneadas.length}`);
console.log(`  requiresCreditCard → unverified          ${tarjetas}`);
console.log(`  hasWatermark → unverified                ${marcas}`);
console.log(`  commercialUse → unverified               ${comercial}`);
console.log(`  créditos documentados registrados        ${creditos}`);
console.log(`  con evidencia citada                     ${saneadas.filter((t) => t.evidence).length}`);
console.log(`\n  tools.json vaciado: la fuente es ahora tools-v2.json\n`);
