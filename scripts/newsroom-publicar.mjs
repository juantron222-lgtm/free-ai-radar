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

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
    /*
     * Los marcadores CDATA se quitan antes que las etiquetas, no después.
     *
     * Un feed mete el texto en `<![CDATA[ … ]]>`, y como ahí dentro no suele
     * haber ningún «>», el patrón de etiquetas se traga el bloque entero con su
     * contenido. Toda cita procedente de un feed quedaba entonces sin verificar
     * —fallando cerrado, que es la dirección buena, pero por el motivo
     * equivocado— y OpenAI, que sólo se deja leer por feed, era inpublicable.
     */
    .replace(/<!\[CDATA\[|\]\]>/g, ' ')
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

/* ---------------------------------------------------------- revalidación -- */

/**
 * @typedef {object} Proceso lo que devuelve `spawnSync`, o lo que se hace pasar por ello
 * @property {number | null} status
 * @property {string | null} [signal]
 * @property {Error} [error]
 * @property {string} [stdout]
 * @property {string} [stderr]
 */

/**
 * @typedef {(orden: string, args: string[], opciones: { cwd: string, encoding: 'utf-8' }) => Proceso} Lanzador
 */

/**
 * Tres respuestas, no dos.
 *
 * No haber podido comprobar no es haber suspendido, y se dice distinto. Las dos
 * cosas acaban igual —no se publica, la semilla vuelve atrás—, pero confundirlas
 * es lo que ocultó durante un día entero que este guardián no funcionaba: decía
 * «rechazada» cuando lo cierto era «no he podido mirar».
 *
 * @param {Proceso} proceso
 * @returns {'aprobada' | 'rechazada' | 'no-ejecutada'}
 */
export function veredicto(proceso) {
  if (proceso.error || proceso.status === null) return 'no-ejecutada';
  return proceso.status === 0 ? 'aprobada' : 'rechazada';
}

/**
 * Regenera el conjunto de datos, pasa su suite y, si la respuesta no es que sí,
 * deja el disco como estaba.
 *
 * Se llama con la noticia ya escrita en la semilla. Escribir y después
 * preguntar tiene su razón: el esquema y `isPublishable` viven en TypeScript
 * con alias de módulo, así que este script no puede invocarlos directamente; la
 * suite del conjunto de datos sí, y es exactamente la misma que aplica el
 * build. Se ejecuta aquí para que un error salga al publicar y no media hora
 * después, cuando el build lo encuentre.
 *
 * El primer lote de verdad justificó esto dos veces: un resumen de 627
 * caracteres sobre un tope de 600, y una noticia de IBM cuya única fuente
 * estaba en huggingface.co y no en el dominio del fabricante. Las dos habrían
 * llegado al build.
 *
 * `raiz` y `lanzarProceso` sólo cambian en las pruebas, que montan un
 * repositorio de mentira y miran con qué se lanza cada cosa.
 *
 * @param {object} opciones
 * @param {string} opciones.semillaAnterior la semilla tal y como estaba antes de escribir
 * @param {string} [opciones.raiz]
 * @param {Lanzador} [opciones.lanzarProceso]
 * @returns {{ veredicto: 'aprobada' | 'rechazada' | 'no-ejecutada', motivo: string, salida: string }}
 */
export function revalidar({ semillaAnterior, raiz = ROOT, lanzarProceso = spawnSync }) {
  const semilla = resolve(raiz, 'src/data/news/news.json');
  const generado = resolve(raiz, 'src/data/generated/news.json');

  /*
   * vitest se lanza con este mismo Node y su punto de entrada, no con `npx`.
   *
   * `spawnSync('npx.cmd', …)` sin shell falla con EINVAL en Node 24 sobre
   * Windows: el proceso no llega a arrancar, `status` vuelve `null`, y la
   * comprobación lo leía como «rechazada». Este paso rechazaba todas las
   * noticias sin haber ejecutado ni una prueba — incluida la de IBM que se tomó
   * por demostración de que funcionaba. Con `process.execPath` no hay `.cmd`,
   * ni shell, ni argumentos concatenados.
   */
  const vitest = resolve(raiz, 'node_modules/vitest/vitest.mjs');
  const sync = resolve(raiz, 'scripts/newsroom-sync.mjs');

  const lanzar = (entrada, args) =>
    existsSync(entrada)
      ? lanzarProceso(process.execPath, [entrada, ...args], { cwd: raiz, encoding: 'utf-8' })
      : { status: null, error: new Error(`no se encuentra ${entrada}`), stdout: '', stderr: '' };

  /*
   * La suite no valida la semilla: valida lo que `newsroom-sync.mjs` genera a
   * partir de ella, que es además lo que el build prerenderiza.
   *
   * Escribir la semilla y probar sin regenerar comparaba 16 noticias contra 15
   * y rechazaba cualquier publicación nueva por un desfase que no tenía nada
   * que ver con la noticia. Así que se regenera antes de probar, y deshacer
   * restaura los dos ficheros: si sólo volviera la semilla, el generado se
   * quedaría con una noticia que ya no existe. Por lo mismo, si el generado no
   * existía, se retira el que haya dejado la regeneración.
   */
  const generadoAnterior = existsSync(generado) ? readFileSync(generado, 'utf-8') : null;
  const deshacer = () => {
    writeFileSync(semilla, semillaAnterior, 'utf-8');
    if (generadoAnterior === null) rmSync(generado, { force: true });
    else writeFileSync(generado, generadoAnterior, 'utf-8');
  };
  const salidaDe = (proceso) => `${proceso.stdout ?? ''}${proceso.stderr ?? ''}`;

  /* Un fallo al regenerar es «no he podido mirar», no «la noticia suspende». */
  const sincronizado = lanzar(sync, ['--seed']);
  if (veredicto(sincronizado) !== 'aprobada') {
    deshacer();
    return {
      veredicto: 'no-ejecutada',
      motivo:
        sincronizado.error?.message ?? `newsroom-sync.mjs terminó con código ${sincronizado.status}`,
      salida: salidaDe(sincronizado),
    };
  }

  const prueba = lanzar(vitest, ['run', 'tests/unit/news.test.ts']);
  const resultado = veredicto(prueba);
  if (resultado !== 'aprobada') deshacer();

  return {
    veredicto: resultado,
    motivo:
      resultado === 'no-ejecutada'
        ? (prueba.error?.message ?? 'el proceso no devolvió código de salida')
        : '',
    salida: salidaDe(prueba),
  };
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

  const previo = readFileSync(SEMILLA, 'utf-8');

  semilla.push(item);
  semilla.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.slug.localeCompare(b.slug));
  writeFileSync(SEMILLA, `${JSON.stringify(semilla, null, 2)}\n`, 'utf-8');

  process.stdout.write('\n  revalidando el conjunto de datos… ');
  const revision = revalidar({ semillaAnterior: previo });

  if (revision.veredicto === 'no-ejecutada') {
    console.error('no se ha podido ejecutar.\n');
    console.error(`   ${revision.motivo}`);
    console.error('\n  Sin revalidación no se publica. La semilla se ha dejado como estaba.\n');
    process.exitCode = 1;
    return;
  }

  if (revision.veredicto === 'rechazada') {
    console.error('rechazada.\n');
    /*
     * La cola en bruto, sin filtrar por patrones.
     *
     * Un filtro por «AssertionError» no casaba con lo que vitest escribe de
     * verdad, y el resultado era un rechazo sin motivo — peor que no imprimir
     * nada, porque parece que no lo hay.
     */

    /*
     * El escape ANSI se construye, no se escribe.
     *
     * Un ESC literal dentro de una expresión regular es un carácter de control
     * y ESLint lo rechaza con razón: en el fichero no se ve, así que nadie
     * puede leer qué hace ese patrón.
     */
    const COLOR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

    for (const linea of revision.salida.split('\n').filter((l) => l.trim()).slice(-12)) {
      console.error(`   ${linea.replace(COLOR, '').trimEnd().slice(0, 150)}`);
    }
    console.error('\n  La semilla se ha dejado como estaba.\n');
    process.exitCode = 1;
    return;
  }

  console.log('vale.');
  console.log(`\n✓ Escrita en la semilla. ${semilla.length} noticias.\n`);
}

/*
 * Sólo se ejecuta cuando se invoca directamente.
 *
 * Importarlo desde una prueba no debe publicar nada, y sin esta guarda ni
 * siquiera fallaría limpio: `main()` tomaría los argumentos de vitest por el
 * fichero de la noticia y dejaría el código de salida de la suite en 1.
 *
 * `process.exitCode` y no `process.exit()`.
 *
 * Salir de golpe con una descarga todavía viva aborta libuv en Windows: el
 * proceso devolvía 127 en lugar de 1, que es indistinguible de una caída. Una
 * puerta tiene que poder decir «he rechazado esto» sin que parezca que se ha
 * roto.
 */
const invocadoDirectamente = process.argv[1]?.replace(/\\/g, '/').endsWith('newsroom-publicar.mjs');

if (invocadoDirectamente) {
  main().catch((error) => {
    console.error('\n✗', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
