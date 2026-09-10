/**
 * Publica una noticia escrita por el agente, después de comprobarla.
 *
 * El plan cambió: el trabajo de juicio —barrer, seleccionar, leer, extraer y
 * redactar— lo hace un agente cuando se le activa, y no una rutina horaria. Eso
 * quita mucha maquinaria, pero deja intacta la pregunta que importa: **quién
 * impide que lo que el agente escribe llegue a un lector sin comprobar.**
 *
 * Esto. Cada noticia entra con dos ficheros: los hechos con sus citas y el
 * `NewsItem` redactado. Antes de escribir nada se vuelve a descargar cada
 * fuente y se comprueba, una por una, que las citas están ahí. Después el
 * `NewsItem` pasa por el mismo Zod y el mismo `isPublishable` que el build
 * aplica de todas formas.
 *
 * Se escribe en la semilla, no en la base. Es deliberado y tiene tres ventajas:
 * el historial queda en git y no en una tabla que nadie mira; la semilla gana
 * en la fusión, así que corregir una noticia es un commit; y no hace falta
 * ninguna credencial de producción, que desde aquí no existe.
 *
 *   node scripts/newsroom-publicar.mjs noticia.json            comprueba y escribe
 *   node scripts/newsroom-publicar.mjs noticia.json --dry-run  sólo comprueba
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SEMILLA = resolve(ROOT, 'src/data/news/news.json');
const UA = 'FreeAIRadar-Newsroom/1.0 (+https://www.freeairadar.com)';

/* --------------------------------------------------------------- lectura -- */

/** El texto que ve una persona, que es contra lo que se comprueban las citas. */
function textoVisible(html) {
  return String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8217;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function descargar(url) {
  const r = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(25_000),
  });
  if (!r.ok) throw new Error(`${url} respondió ${r.status}`);
  return textoVisible(await r.text());
}

/* ------------------------------------------------------------------ main -- */

async function main() {
  const args = process.argv.slice(2);
  const fichero = args.find((a) => !a.startsWith('--'));
  const dryRun = args.includes('--dry-run');

  if (!fichero) {
    console.error('\nUso: node scripts/newsroom-publicar.mjs noticia.json [--dry-run]\n');
    process.exitCode = 1;
    return;
  }

  const { hechos, item } = JSON.parse(readFileSync(fichero, 'utf-8'));

  if (!Array.isArray(hechos) || !item) {
    console.error('\n✗ El fichero necesita { hechos: [...], item: {...} }.\n');
    process.exitCode = 1;
    return;
  }

  console.log('\nPublicando:', item.title);
  console.log('─────────────────────────────────────────────────────────');

  /*
   * Los módulos del dominio son TypeScript y este script corre con Node a
   * secas, así que la comprobación se hace en dos tiempos: aquí se descargan
   * las fuentes y se comparan las citas, y el resto —Zod e `isPublishable`— lo
   * ejerce el build, que es de todas formas quien tiene la última palabra.
   */
  const { verificarCitas, Hechos } = await import('./publicar/gates.mjs');

  const forma = Hechos.safeParse(hechos);
  if (!forma.success) {
    console.error('\n✗ Los hechos no cumplen el contrato:');
    for (const i of forma.error.issues.slice(0, 6)) {
      console.error(`   · ${i.path.join('.')}: ${i.message}`);
    }
    process.exitCode = 1;
    return;
  }

  /* Una descarga por URL distinta, no una por hecho. */
  const urls = [...new Set(hechos.map((h) => h.fuente))];
  const cuerpos = {};

  for (const url of urls) {
    try {
      cuerpos[url] = await descargar(url);
      console.log(`  descargada  ${url} (${cuerpos[url].length} car.)`);
    } catch (error) {
      console.error(`\n✗ No se ha podido leer ${url}: ${error.message}`);
      console.error('  Sin la fuente no se puede comprobar la cita, y sin eso no se publica.\n');
      process.exitCode = 1;
      return;
    }
  }

  const { ok, faltan, comprobadas } = verificarCitas(hechos, cuerpos);

  console.log(`\n  citas comprobadas: ${comprobadas.filter((c) => c.literal).length}/${comprobadas.length}`);

  if (!ok) {
    console.error('\n✗ Hay citas que no aparecen literalmente en su fuente:');
    for (const f of faltan) console.error(`   · ${f}`);
    console.error('\n  Una paráfrasis no es una cita. Corrige el texto o el hecho.\n');
    process.exitCode = 1;
    return;
  }

  /* Lo que el lector no debe leer nunca: nuestro propio proceso de verificación. */
  const prosa = `${item.title} ${item.summary} ${item.impact}`;
  const METACOMENTARIO = [
    /seg[úu]n la fecha que declara/i,
    /no hemos podido verificar/i,
    /la fuente no menciona/i,
    /queda pendiente la revisi[óo]n/i,
    /verificado leyendo la p[áa]gina/i,
  ];
  const meta = METACOMENTARIO.filter((rx) => rx.test(prosa));
  if (meta.length > 0) {
    console.error('\n✗ El texto habla de cómo verificamos, y eso es material interno:');
    for (const rx of meta) console.error(`   · coincide con ${rx}`);
    console.error('');
    process.exitCode = 1;
    return;
  }

  const semilla = JSON.parse(readFileSync(SEMILLA, 'utf-8'));

  if (semilla.some((x) => x.slug === item.slug)) {
    console.error(`\n✗ Ya existe una noticia con el slug "${item.slug}".\n`);
    process.exitCode = 1;
    return;
  }

  if (dryRun) {
    console.log('\n  --dry-run: comprobado, no se ha escrito nada.\n');
    return;
  }

  semilla.push(item);
  semilla.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.slug.localeCompare(b.slug));
  writeFileSync(SEMILLA, `${JSON.stringify(semilla, null, 2)}\n`, 'utf-8');

  console.log(`\n✓ Escrita en la semilla. ${semilla.length} noticias.`);
  console.log('  El build revalida con Zod e isPublishable antes de desplegar.\n');
}

/*
 * `process.exitCode` y no `process.exit()`.
 *
 * Salir de golpe con una descarga todavía viva aborta libuv en Windows: el
 * proceso devolvía 127 en lugar de 1, que es indistinguible de una caída. Una
 * puerta tiene que poder decir «he rechazado esto» sin que parezca que se ha
 * roto.
 */
main().catch((error) => {
  console.error('\n✗', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
