#!/usr/bin/env node
/**
 * Smoke focal de la ficha de Claude.
 *
 * La primera versión de este guion dio 3 de 8 contra una producción correcta.
 * Buscaba en la página la cita literal y la URL de la evidencia, y el sitio no
 * publica ninguna de las dos cosas en la ficha: viven en el catálogo y las
 * vigilan las pruebas unitarias. Y su última comprobación cazaba el enlace «Sin
 * tarjeta» del menú de colecciones creyendo que la ficha prometía no pedirla.
 *
 * Un instrumento que mide lo que no hay da rojos que no existen, y eso es peor
 * que no medir: gasta la confianza en el rojo siguiente. Ahora comprueba lo que
 * la página sirve de verdad, y acota dónde mira.
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

const limpio = (s) =>
  s
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/\s+/g, ' ');

const texto = limpio(html);

/*
 * El bloque del plan gratuito, acotado.
 *
 * Lo que la ficha diga sobre la tarjeta hay que leerlo aquí y no en la página
 * entera: el menú de colecciones lleva un enlace «Sin tarjeta» que no afirma
 * nada de Claude.
 */
const bloqueGratis = (() => {
  const desde = html.indexOf('free-title');
  const hasta = html.indexOf('review-title');
  return desde >= 0 && hasta > desde ? limpio(html.slice(desde, hasta)) : texto;
})();

const comprobaciones = [
  ['la ventana de cinco horas se publica', () => /cada cinco horas/i.test(texto)],
  [
    'y se cuenta como límite por sesión, no como cuota',
    () => /por sesion|por sesión|sesiones que se reinician|Límite por sesión/i.test(texto),
  ],
  [
    'dice que no hay cifra fija, y por qué',
    () => /no hay cifra fija/i.test(texto) && /varía según la demanda/i.test(texto),
  ],
  [
    'el modelo por defecto va con su fecha',
    () => /Sonnet 5[\s\S]{0,140}\d{1,2} de \w+ de \d{4}|\d{1,2} de \w+ de \d{4}[\s\S]{0,140}Sonnet 5/i.test(texto),
  ],
  ['y dice que es el mismo que en Pro', () => /el mismo que (el plan )?Pro/i.test(texto)],
  [
    'la ficha no arrastra ninguna versión retirada',
    () => !/Claude 3\.5|Claude 3 |GPT-4o|DALL-E/i.test(texto),
  ],
  [
    'la tarjeta sigue sin confirmar, y el plan gratuito no promete lo contrario',
    () => !/sin tarjeta|no pide tarjeta|sin necesidad de tarjeta/i.test(bloqueGratis),
  ],
  [
    'el sello del revisor no firma más de lo que la ficha sostiene',
    () =>
      !/confirmado uno a uno/i.test(texto) ||
      /Verificada\b(?![^]{0,40}parcial)/i.test(texto.slice(texto.indexOf('Verific'))),
  ],
];

let fallos = 0;
for (const [que, prueba] of comprobaciones) {
  const ok = prueba();
  console.log(`  ${ok ? '✓' : '✗'} ${que}`);
  if (!ok) fallos++;
}

console.log(`\n${fallos === 0 ? '✓' : '✗'} ${url} · ${comprobaciones.length - fallos}/${comprobaciones.length}`);
process.exit(fallos === 0 ? 0 : 1);
