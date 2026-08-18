#!/usr/bin/env node
/**
 * Separa la licencia en las capas que de verdad pueden diferir.
 *
 * `licence` guardaba una cadena por ficha, y con ella el catálogo decía
 * «Apache-2.0» de proyectos cuyo código es permisivo pero cuyos pesos no lo
 * son. Cada afirmación era cierta por su cuenta; juntas contaban una cosa que
 * no pasa.
 *
 * Sólo se rellena lo que una fuente oficial declara. `outputs` se queda vacío
 * en todas: ningún repositorio de los revisados dice qué puedes hacer con lo
 * que generas, y ese silencio es en sí mismo el dato.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RUTA = resolve(ROOT, 'src/data/tools-v2.json');

const catalogo = JSON.parse(readFileSync(RUTA, 'utf8'));
const porSlug = new Map(catalogo.map((t) => [t.slug, t]));

/** Lo que cada repositorio declara, capa por capa. */
const CAPAS = {
  audiocraft: { code: 'MIT', weights: 'CC-BY-NC 4.0' },
  'f5-tts': { code: 'MIT', weights: 'CC-BY-NC' },
  whisper: { code: 'MIT', weights: 'MIT' },
  kokoro: { code: 'Apache-2.0', weights: 'Apache-2.0' },
  'wan-2-2': { code: 'Apache-2.0', weights: 'Apache-2.0' },
  'ltx-video': { code: 'Apache-2.0', weights: 'Apache-2.0' },
  'mochi-1': { code: 'Apache-2.0', weights: 'Apache-2.0' },
};

/** El resumen de una línea, sólo cuando las capas coinciden. */
function resumen(capas) {
  if (capas.code && capas.weights && capas.code === capas.weights) return capas.code;
  const partes = [];
  if (capas.code) partes.push(`${capas.code} (código)`);
  if (capas.weights) partes.push(`${capas.weights} (pesos)`);
  return partes.join(' · ');
}

/*
 * Todas las fichas llevan el campo, aunque esté vacío.
 *
 * La columna del espejo es `not null default '{}'`, y un valor por defecto no
 * salva nada aquí: `jsonb_populate_recordset` convierte una clave ausente en un
 * NULL explícito, y un NULL explícito derrota al default. Es exactamente la
 * misma piedra con la que tropezó `skill_level`, y el error que produce —«null
 * value in column licences»— tampoco menciona qué ficha lo causa.
 */
for (const ficha of catalogo) {
  if (!ficha.licences) ficha.licences = {};
}

let tocadas = 0;
for (const [slug, capas] of Object.entries(CAPAS)) {
  const ficha = porSlug.get(slug);
  if (!ficha) throw new Error(`No existe la ficha "${slug}".`);
  ficha.licences = capas;
  ficha.licence = resumen(capas);
  tocadas += 1;
}

writeFileSync(RUTA, `${JSON.stringify(catalogo, null, 2)}\n`, 'utf8');
console.log(`Licencias por capa en ${tocadas} fichas.`);
for (const [slug, capas] of Object.entries(CAPAS)) {
  const difiere = capas.code !== capas.weights;
  console.log(`  ${slug.padEnd(14)} ${resumen(capas)}${difiere ? '   <- difieren' : ''}`);
}
