#!/usr/bin/env node
/**
 * Smoke focal de la ficha de Claude.
 *
 * Comprueba lo único que este lote corrigió en el último paso: que la ventana de
 * cinco horas del plan gratuito aparezca publicada, con su cita, y que la cita
 * mencione explícitamente el plan gratuito.
 *
 * Esa última condición es el arreglo de verdad. El error no fue clasificar mal
 * la evidencia, fue estar a punto de sostener un dato del plan gratuito con
 * páginas que sólo hablaban de los de pago. Un smoke que sólo mirase «¿sale la
 * frase cinco horas?» habría pasado con la versión mala.
 *
 * Uso:
 *   node scripts/smoke-claude.mjs https://www.freeairadar.com
 */
const BASE = process.argv[2] ?? 'http://localhost:4321';
const url = `${BASE}/herramientas/claude`;

const html = await fetch(url).then((r) => {
  if (!r.ok) throw new Error(`${url} devolvió ${r.status}`);
  return r.text();
});

/** El texto visible, sin etiquetas ni scripts. */
const texto = html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&[a-z]+;|&#\d+;/gi, ' ')
  .replace(/\s+/g, ' ');

const comprobaciones = [
  ['la ventana de cinco horas se publica', /se reinicia[n]? cada cinco horas|sesiones que se reinician cada cinco horas|cada cinco horas/i],
  ['dice que no hay cifra fija y por qué', /no hay cifra fija|varía según la demanda/i],
  ['la cita literal está en la página', /reset every five hours/i],
  ['y la cita menciona el plan gratuito', /free Claude plan|free plan/i],
  ['la fuente es el artículo oficial', /support\.claude\.com\/en\/articles\/8114491/],
  ['se presenta como lo que dice la fuente, no como deducción nuestra', /Lo dice la fuente oficial/i],
  ['el modelo por defecto va con su fecha', /Sonnet 5[\s\S]{0,120}\d{1,2} de \w+ de \d{4}|\d{1,2} de \w+ de \d{4}[\s\S]{0,120}Sonnet 5/i],
  ['no promete lo que su campo no confirma', null],
];

let fallos = 0;
for (const [que, patron] of comprobaciones) {
  if (patron === null) {
    // La tarjeta sigue en «sin confirmar», así que la prosa no puede prometerlo.
    const promete = /sin tarjeta|no pide tarjeta|sin necesidad de tarjeta/i.test(texto);
    const confirmado = /Tarjeta[^.]{0,40}(no|No)\b/.test(texto) && !/sin verificar|Sin confirmar/i.test(texto);
    const ok = !promete || confirmado;
    console.log(`  ${ok ? '✓' : '✗'} ${que}`);
    if (!ok) fallos++;
    continue;
  }
  const ok = patron.test(texto) || patron.test(html);
  console.log(`  ${ok ? '✓' : '✗'} ${que}`);
  if (!ok) fallos++;
}

console.log(`\n${fallos === 0 ? '✓' : '✗'} ${url} · ${comprobaciones.length - fallos}/${comprobaciones.length}`);
process.exit(fallos === 0 ? 0 : 1);
