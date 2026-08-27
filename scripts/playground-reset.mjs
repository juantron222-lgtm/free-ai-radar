#!/usr/bin/env node
/**
 * Playground renueva cada tres horas y la ficha decía «Diaria».
 *
 * Su página de precios publica «Create up to 10 images every 3 hours», y el
 * enum de cadencias no tenía forma de decirlo. Las dos salidas disponibles eran
 * falsas: «Diaria» infravalora el plan gratuito ocho veces, y `unknown` acusa
 * al fabricante de no publicar algo que publica en su tabla. Estaba puesta la
 * primera, con «Renovación: Diaria» impreso justo al lado de «10 imágenes cada
 * 3 horas».
 */
import { readFileSync, writeFileSync } from 'node:fs';

const RUTA = 'src/data/tools-v2.json';
const catalogo = JSON.parse(readFileSync(RUTA, 'utf8'));
const tools = Array.isArray(catalogo) ? catalogo : catalogo.tools;
const playground = tools.find((t) => t.slug === 'playground-ai');

playground.freePlan.creditReset = 'intraday';
playground.evidence = [
  ...playground.evidence.filter((e) => e.field !== 'freePlan.creditReset'),
  {
    field: 'freePlan.creditReset',
    outcome: 'stated',
    sourceUrl: 'https://playgroundai.com/design/pricing',
    sourceKind: 'pricing',
    scope: 'product',
    checkedAt: '2026-08-26',
    quote: 'Limited image generation — Create up to 10 images every 3 hours',
  },
];

writeFileSync(RUTA, `${JSON.stringify(catalogo, null, 2)}\n`, 'utf8');
console.log('✓ Playground: creditReset = intraday, con la cita que lo sostiene');
