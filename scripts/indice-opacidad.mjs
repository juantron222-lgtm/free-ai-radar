#!/usr/bin/env node
/**
 * Índice de opacidad: genera el borrador de la pieza editorial.
 *
 * Usa la misma función que pasaría a la web (src/lib/data/opacidad.ts) sobre
 * el catálogo generado, y escribe docs/borradores/indice-opacidad.md: el
 * texto de la página, la metodología y las tablas. Es un borrador: no se
 * publica nada, y la pieza la aprueba Juan.
 *
 * Uso: node scripts/indice-opacidad.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const jiti = createJiti(import.meta.url, {
  alias: { '@lib': join(ROOT, 'src/lib'), '@': join(ROOT, 'src') },
});
const { getAllTools } = await jiti.import(join(ROOT, 'src/lib/data/catalog.ts'));
const { opacidadDe, rankingDeOpacidad } = await jiti.import(join(ROOT, 'src/lib/data/opacidad.ts'));
const { INTENCIONES } = await jiti.import(join(ROOT, 'src/lib/search/intents.ts'));

const tools = getAllTools();
const ranking = rankingDeOpacidad(tools);
const pct = (x) => `${Math.round(x * 100)} %`;
const hoy = new Date().toISOString().slice(0, 10);

// Por hecho: cuántos fabricantes lo callan entre los que lo hemos mirado.
const porHecho = new Map();
for (const t of tools) {
  for (const h of opacidadDe(t).hechos) {
    const c = porHecho.get(h.clave) ?? { etiqueta: h.etiqueta, publicado: 0, noPublicado: 0, pendiente: 0 };
    c[h.casilla]++;
    porHecho.set(h.clave, c);
  }
}

// Por tarea: la mediana de opacidad de lo que la cumple.
const mediana = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const porSlug = new Map(ranking.map((o) => [o.slug, o]));
const tareas = INTENCIONES.filter((i) => i.capacidades?.length).map((i) => {
  const del = tools.filter((t) => i.capacidades.some((c) => t.capabilities.includes(c))).map((t) => porSlug.get(t.slug)).filter(Boolean);
  return { tarea: i.etiqueta, fichas: del.length, mediana: mediana(del.map((o) => o.indice)) };
}).filter((x) => x.fichas >= 2).sort((a, b) => b.mediana - a.mediana);

const fila = (o) => `| ${o.nombre} | ${pct(o.indice)} | ${o.noPublicados} de ${o.publicados + o.noPublicados} | ${o.hechos.filter((h) => h.casilla === 'noPublicado').map((h) => h.etiqueta.toLowerCase()).join(', ') || '—'} |`;
const cabecera = ['| Herramienta | Opacidad | Calla | Lo que no publica |', '|---|---|---|---|'];

const l = [];
l.push(`# Índice de opacidad — borrador del ${hoy}`, '');
l.push('> Borrador sin publicar. Pendiente de la aprobación de Juan.', '');
l.push('## Quién no publica lo que necesitas saber', '');
l.push('Antes de usar el plan gratuito de una IA hay cinco preguntas que deciden si te sirve: si te piden tarjeta, si puedes usar el resultado para trabajar, si le ponen una marca, si entrenan con lo que subes y cuánto te dan gratis. Para cada herramienta del catálogo hemos ido a la página oficial a buscar la respuesta. A veces está. A veces el fabricante, sencillamente, no la publica.', '');
l.push('Este índice mide eso: de las preguntas que hemos podido comprobar, en cuántas el fabricante calla.', '');
l.push('## Cómo se calcula', '');
l.push('- Cada pregunta cae en una de tres casillas: **lo publica** (hay una frase suya que lo dice), **no lo publica** (miramos en precios, condiciones y ayuda, y no lo dice) o **pendiente** (aún no lo hemos comprobado).');
l.push('- El índice es *no lo publica* ÷ (*lo publica* + *no lo publica*). Lo pendiente no cuenta: es trabajo nuestro, no opacidad suya.');
l.push('- Sólo se pregunta lo que tiene sentido: la tarjeta, el entrenamiento y la cuota, a servicios en la nube; la marca de agua, a lo que genera imágenes, vídeo o audio. Las herramientas sin acceso gratuito no entran.');
l.push(`- Sólo aparecen fichas con al menos tres preguntas comprobadas: ${ranking.length} herramientas.`, '');
l.push('## Las que más callan', '', ...cabecera, ...ranking.filter((o) => o.indice >= 0.5).slice(0, 15).map(fila), '');
l.push('## Las que más cuentan', '', ...cabecera, ...[...ranking].reverse().filter((o) => o.indice <= 0.2).slice(0, 15).map(fila), '');
l.push('## Qué se calla más', '', '| Pregunta | Lo publica | No lo publica | Pendiente |', '|---|---|---|---|');
for (const c of [...porHecho.values()].sort((a, b) => b.noPublicado / (b.publicado + b.noPublicado || 1) - a.noPublicado / (a.publicado + a.noPublicado || 1))) {
  l.push(`| ${c.etiqueta} | ${c.publicado} | ${c.noPublicado} | ${c.pendiente} |`);
}
l.push('', '## Por tarea', '', 'La mediana del índice entre las herramientas que hacen cada tarea.', '', '| Tarea | Herramientas | Opacidad mediana |', '|---|---|---|');
for (const t of tareas) l.push(`| ${t.tarea} | ${t.fichas} | ${pct(t.mediana)} |`);
l.push('', '## Lo que este índice no dice', '');
l.push('- No mide calidad ni si el plan gratuito es bueno: una herramienta muy transparente puede dar muy poco.');
l.push('- «No lo publica» quiere decir que no está en sus páginas oficiales el día que miramos; puede que lo diga en otro sitio o que lo publique mañana. Cada casilla tiene su fecha y su página en la ficha.');
l.push('- Las fichas con muchas preguntas pendientes quedan fuera hasta que las comprobemos.', '');

mkdirSync(join(ROOT, 'docs/borradores'), { recursive: true });
writeFileSync(join(ROOT, 'docs/borradores/indice-opacidad.md'), l.join('\n'));
console.log(`${ranking.length} fichas en el índice · docs/borradores/indice-opacidad.md`);
