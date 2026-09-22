#!/usr/bin/env node
/**
 * Baja lo aprobado y lo deja donde el build lo espera.
 *
 * `/noticias` se prerenderiza: el sitio es `output: 'static'`, así que la
 * página se genera en el build y no consulta nada en cada visita. Eso es lo que
 * queremos —es la sección con más peso de SEO y no va a pagar una función
 * serverless por lectura— pero obliga a que lo aprobado esté en disco *antes*
 * de que Astro empiece.
 *
 * De ahí este paso. Se ejecuta como `prebuild`, funde dos orígenes y escribe el
 * fichero que `src/lib/data/news.ts` importa:
 *
 *   src/data/news/news.json        la semilla, versionada, anterior a la base
 *   newsroom_published             lo que una persona ha aprobado desde la mesa
 *   → src/data/generated/news.json lo que el build prerenderiza
 *
 * Es el mismo patrón que ya usa el catálogo con `generated/tools.json`, por lo
 * que no introduce una forma nueva de hacer las cosas.
 *
 * Falla ruidosamente a propósito. Si Supabase está configurado y no responde,
 * este script rompe el build en lugar de escribir sólo la semilla: publicar
 * silenciosamente una versión del sitio sin las noticias aprobadas sería el
 * peor fallo posible, porque nadie lo notaría hasta que un lector no encontrase
 * algo que sí se aprobó.
 *
 * Antes de bajar nada comprueba que el esquema es el que dice `0015`. La
 * migración se aplica a mano en el editor SQL de Supabase, y ahí caben todos
 * los fallos callados: pegarla cortada, pegarla vieja, que una sentencia falle
 * y las siguientes no lleguen. Ninguno da error visible en el momento; dan una
 * columna de menos que la pasada diaria descubre semanas después. Comprobarlo
 * aquí es lo que convierte ese fallo en un build rojo, y un build rojo no
 * despliega: el sitio sigue sirviendo la versión anterior mientras se arregla.
 *
 *   node scripts/newsroom-sync.mjs            funde y escribe
 *   node scripts/newsroom-sync.mjs --dry-run  informa sin escribir
 *   node scripts/newsroom-sync.mjs --seed     fuerza sólo la semilla
 *   node scripts/newsroom-sync.mjs --no-schema  omite la comprobación de esquema
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verificarEsquema, imprimirInforme } from './newsroom-schema.mjs';
import { checkReaderReady } from './draft/legible.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SEED = resolve(ROOT, 'src/data/news/news.json');
const OUT = resolve(ROOT, 'src/data/generated/news.json');

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const seedOnly = args.has('--seed');
const sinEsquema = args.has('--no-schema');

const url = process.env.PUBLIC_SUPABASE_URL ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const configured = Boolean(url && serviceKey);

function read(path) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

/**
 * Merge, with the seed winning.
 *
 * A slug in both places means the item was approved from the desk and later
 * committed to the repository. The committed one is the reviewed one, so it
 * takes precedence; the database copy is left alone rather than deleted, so
 * the history of who approved it survives.
 */
function merge(seed, approved) {
  const bySlug = new Map(seed.map((item) => [item.slug, item]));
  const origen = new Map(seed.map((item) => [item.slug, 'semilla']));
  let added = 0;

  for (const item of approved) {
    if (bySlug.has(item.slug)) continue;
    bySlug.set(item.slug, item);
    origen.set(item.slug, 'supabase');
    added += 1;
  }

  /*
   * La puerta de legibilidad sobre el conjunto fundido, y ésta es la que
   * faltaba.
   *
   * `canApprove` la aplica en la mesa, pero este paso es otra puerta de
   * entrada al sitio: una fila aprobada antes de que la puerta existiera —o
   * aprobada en otra máquina, o escrita directamente en la base— llegaba al
   * build sin pasar por el repositorio y sin que nadie la mirase.
   *
   * Pasó de verdad. El 15 y el 16 de septiembre de 2026 salieron así una guía
   * de Together y un reportaje de cliente del blog de NVIDIA, las dos con el
   * titular en inglés y «queda pendiente la revisión editorial» puesto, y no
   * estaban en ninguna rama: ni la auditoría ni la fusión las vieron, porque
   * las dos miraban el repositorio.
   *
   * Se pasa después de fundir, no sobre cada origen por separado, porque lo
   * que decide qué ve un lector es el conjunto final. Las archivadas quedan
   * fuera: no se publican, y su texto se conserva precisamente porque es el
   * que salió —pasarles la puerta sería exigirle a un registro histórico que
   * esté bien escrito.
   */
  const rechazadas = [];
  for (const [slug, item] of bySlug) {
    if (item.status !== 'published') continue;
    const legible = checkReaderReady(item);
    if (legible.ok) continue;

    rechazadas.push({ slug, motivos: legible.reasons, origen: origen.get(slug) });

    /*
     * De Supabase se cae; de la semilla, no.
     *
     * Una fila de la base no la ha revisado nadie en un diff, así que se queda
     * fuera del sitio. Una entrada de la semilla sí, y descartarla en silencio
     * borraría trabajo revisado por un falso positivo de una expresión
     * regular: se avisa a gritos y sale igual. Que no haya ninguna lo vigila
     * `tests/unit/newsroom.test.ts`, donde sí es un fallo.
     */
    if (origen.get(slug) === 'supabase') {
      bySlug.delete(slug);
      added -= 1;
    }
  }

  const items = [...bySlug.values()].sort(
    (a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.slug.localeCompare(b.slug)
  );

  return { items, added, rechazadas };
}

async function fetchApproved() {
  const endpoint = `${url.replace(/\/$/, '')}/rest/v1/newsroom_published`;
  const query = '?select=slug,item&order=approved_at.asc';

  const response = await fetch(endpoint + query, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase respondió ${response.status} ${response.statusText}`);
  }

  const rows = await response.json();
  return rows.map((row) => row.item);
}

/**
 * El esquema tiene que ser el que dice la migración, o no se construye.
 *
 * Un fallo de red al pedir el spec no es lo mismo que un esquema distinto, pero
 * aquí se tratan igual y a propósito: los dos significan que no se ha podido
 * comprobar contra qué se va a escribir esta noche, y construir a ciegas es
 * exactamente lo que este paso existe para impedir.
 */
async function comprobarEsquema() {
  let informe;

  try {
    informe = await verificarEsquema({
      url,
      key: serviceKey,
      anonKey: process.env.PUBLIC_SUPABASE_ANON_KEY ?? '',
    });
  } catch (error) {
    console.error('\n✗ No se ha podido comprobar el esquema de Newsroom.');
    console.error(`  ${error.message}\n`);
    process.exit(1);
  }

  /* El host identifica el proyecto sin enseñar ninguna clave. */
  imprimirInforme(informe, new URL(url).host);

  if (!informe.ok) {
    console.error('\n  El esquema vivo no es el de supabase/migrations/0015_newsroom.sql.');
    console.error('  El build se detiene: aplica una migración aditiva que cierre esas');
    console.error('  diferencias antes de desplegar.\n');
    process.exit(1);
  }
}

async function main() {
  const seed = read(SEED);
  let approved = [];
  let origen = 'sólo semilla';

  if (seedOnly) {
    origen = 'sólo semilla (--seed)';
  } else if (!configured) {
    /*
     * Sin credenciales no hay nada que bajar y tampoco hay nada que perder:
     * es el caso del portátil y el de CI. No es un fallo.
     */
    origen = 'sólo semilla (Supabase no configurado)';
  } else {
    if (!sinEsquema) await comprobarEsquema();

    try {
      approved = await fetchApproved();
      origen = `semilla + ${approved.length} aprobadas de Supabase`;
    } catch (error) {
      console.error('\n✗ Supabase está configurado y no ha respondido.');
      console.error(`  ${error.message}`);
      console.error('\n  El build se detiene aquí a propósito. Escribir sólo la semilla');
      console.error('  publicaría el sitio sin las noticias aprobadas y nadie lo notaría.\n');
      process.exit(1);
    }
  }

  const { items, added, rechazadas } = merge(seed, approved);

  console.log('Newsroom sync');
  console.log('─────────────');
  console.log(`  Origen:     ${origen}`);
  console.log(`  Semilla:    ${seed.length}`);
  console.log(`  Aprobadas:  ${approved.length} (${added} no estaban en la semilla)`);
  console.log(`  Total:      ${items.length}`);

  /*
   * Lo rechazado se nombra, no se calla.
   *
   * Una fila que se queda fuera sin decirlo es la misma clase de fallo que
   * esto viene a arreglar: algo que cambia lo que ve un lector y que nadie
   * descubre hasta semanas después.
   */
  if (rechazadas.length) {
    console.log(`\n  ${rechazadas.length} no pasan la puerta de legibilidad:`);
    for (const r of rechazadas) {
      console.log(`    · ${r.slug} (${r.origen}) — ${r.origen === 'supabase' ? 'fuera del sitio' : 'SALE IGUAL: está en la semilla'}`);
      for (const m of r.motivos) console.log(`        ${m}`);
    }
    console.log('    Para retirar una del todo, añádela a la semilla con "status":');
    console.log('    "archived", su texto original y un 301 desde su URL.');
  }

  if (dryRun) {
    console.log('  --dry-run: no se ha escrito nada.');
    return;
  }

  mkdirSync(dirname(OUT), { recursive: true });

  const payload = `${JSON.stringify(items, null, 2)}\n`;
  const previo = existsSync(OUT) ? readFileSync(OUT, 'utf-8') : '';

  if (previo === payload) {
    console.log(`  Sin cambios: ${OUT}`);
    return;
  }

  writeFileSync(OUT, payload, 'utf-8');
  console.log(`  Escrito:    ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
