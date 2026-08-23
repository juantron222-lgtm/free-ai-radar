#!/usr/bin/env node
/**
 * Un producto en la nube no se instala.
 *
 * Siete modelos y una plataforma decían a la vez «Nube» y «Instalación
 * técnica, modelos o GPU». Las dos frases estaban en la misma tarjeta, una
 * encima de la otra, y la segunda describía algo que no ocurre: en GPT-5.6 o
 * en Gemini no hay nada que instalar ni ninguna GPU que tener.
 *
 * De dónde venía: `technical` se usó como taquigrafía de «esto es para
 * desarrolladores». Pero `startEffort` no mide para quién es, mide qué hay que
 * hacer antes del primer resultado, y con una clave de API eso es exactamente
 * lo mismo que con cualquier cuenta: registrarse y configurar. Eso es `signup`.
 *
 * El motivo de cada ficha ya lo decía —«Se usa con una clave de API»— así que
 * lo que había que corregir era el dato, no el texto.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RUTA = resolve(ROOT, 'src/data/tools-v2.json');

const catalogo = JSON.parse(readFileSync(RUTA, 'utf8'));
const cambiadas = [];

for (const ficha of catalogo) {
  if (ficha.hosting !== 'cloud' || ficha.startEffort !== 'technical') continue;
  ficha.startEffort = 'signup';
  cambiadas.push(`${ficha.slug} (${ficha.kind})`);
}

writeFileSync(RUTA, `${JSON.stringify(catalogo, null, 2)}\n`, 'utf8');
console.log(`Corregidas (${cambiadas.length}): ${cambiadas.join(', ')}`);
