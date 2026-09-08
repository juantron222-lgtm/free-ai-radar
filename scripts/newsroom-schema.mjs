#!/usr/bin/env node
/**
 * Compara el esquema vivo de un proyecto Supabase con `0015_newsroom.sql`.
 *
 * Existe porque la migración se aplica a mano en el editor SQL de Supabase, y
 * ahí caben todos los fallos silenciosos: pegar una versión antigua, pegarla
 * cortada, que una sentencia falle en medio y las siguientes no lleguen. Nada
 * de eso da error visible después: da una tabla con una columna menos, y la
 * pasada diaria lo descubre semanas más tarde al intentar escribir.
 *
 * Qué compara y de dónde saca cada mitad:
 *
 *   esperado  se lee del propio `0015_newsroom.sql`, no de una lista copiada.
 *             Una lista escrita a mano se queda vieja en la primera migración
 *             siguiente y entonces mide otra cosa que la que dice medir.
 *   vivo      del spec OpenAPI que PostgREST publica en la raíz de `/rest/v1/`
 *             para el rol que pregunta. Trae columnas, tipo real, nulabilidad,
 *             defaults, claves primarias y ajenas.
 *
 * Lo que el spec **no** trae, y por eso se sondea aparte:
 *
 *   · `canonical_url unique`, que es la deduplicación entera. Se comprueba
 *     pidiendo un `on_conflict` sobre esa columna con un cuerpo vacío: si la
 *     restricción falta, PostgreSQL responde 42P10 al planificar; si está,
 *     responde 23502 por los `not null` al ejecutar. Las dos son errores, así
 *     que no escribe nada en ninguno de los dos casos.
 *   · Que `anon` no llegue a nada, que es la mitad de RLS que sí se puede ver
 *     desde fuera: sin el `revoke`, una tabla con RLS activo pero legible
 *     devolvería `[]` en vez de negar, y `[]` es indistinguible de vacía.
 *
 * Uso directo (contra el proyecto que digan las variables de entorno):
 *
 *   node scripts/newsroom-schema.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const MIGRACION = resolve(ROOT, 'supabase/migrations/0015_newsroom.sql');

/**
 * Del tipo que escribe la migración al que devuelve PostgREST.
 *
 * PostgREST publica el nombre canónico de PostgreSQL, no el alias corto que se
 * usa al declarar la columna, así que `timestamptz` llega como `timestamp with
 * time zone` y `bigserial` como `bigint` —serial no es un tipo, es un entero
 * con una secuencia detrás—.
 */
const TIPO_CANONICO = {
  timestamptz: 'timestamp with time zone',
  timestamp: 'timestamp without time zone',
  bigserial: 'bigint',
  serial: 'integer',
  int: 'integer',
  int4: 'integer',
  int8: 'bigint',
  bool: 'boolean',
};

function canonico(tipo) {
  return TIPO_CANONICO[tipo] ?? tipo;
}

/* ------------------------------------------------------------ el esperado -- */

/**
 * Trocea la lista de columnas por las comas de nivel cero.
 *
 * Hace falta porque un `check (status in ('a', 'b'))` lleva comas dentro de sus
 * propios paréntesis, y partir por comas a secas trocearía la restricción en
 * columnas inventadas.
 */
function partirPorComas(cuerpo) {
  const partes = [];
  let profundidad = 0;
  let actual = '';
  let enCadena = false;

  for (const c of cuerpo) {
    if (c === "'") enCadena = !enCadena;
    if (!enCadena) {
      if (c === '(') profundidad += 1;
      else if (c === ')') profundidad -= 1;
      else if (c === ',' && profundidad === 0) {
        partes.push(actual);
        actual = '';
        continue;
      }
    }
    actual += c;
  }

  if (actual.trim()) partes.push(actual);
  return partes;
}

/** Restricciones de tabla: empiezan por una palabra clave, no por un nombre. */
const NO_ES_COLUMNA = /^(constraint|primary\s+key|unique|check|foreign\s+key|exclude)\b/i;

/**
 * Qué tablas y columnas exige la migración.
 *
 * Se lee el fichero y no una copia: si alguien añade una columna en `0015` sin
 * tocar esto, la comprobación la exige sola desde el minuto siguiente.
 */
export function esquemaEsperado(sql = readFileSync(MIGRACION, 'utf-8')) {
  const tablas = {};
  const rx = /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)\s*\(/gi;

  let m;
  while ((m = rx.exec(sql)) !== null) {
    const nombre = m[1];

    /* Del paréntesis de apertura hasta el que lo cierra, contando anidamiento. */
    let i = rx.lastIndex;
    let profundidad = 1;
    let enCadena = false;
    while (i < sql.length && profundidad > 0) {
      const c = sql[i];
      if (c === "'") enCadena = !enCadena;
      else if (!enCadena && c === '(') profundidad += 1;
      else if (!enCadena && c === ')') profundidad -= 1;
      i += 1;
    }

    const cuerpo = sql.slice(rx.lastIndex, i - 1);
    const columnas = {};

    for (const parte of partirPorComas(cuerpo)) {
      /* Los comentarios `--` van al final de línea y no forman parte del tipo. */
      const limpia = parte
        .split('\n')
        .map((l) => l.replace(/--.*$/, ''))
        .join(' ')
        .trim();

      if (!limpia || NO_ES_COLUMNA.test(limpia)) continue;

      const [, columna, tipo] = limpia.match(/^(\w+)\s+([\w]+)/) ?? [];
      if (!columna || !tipo) continue;

      columnas[columna] = {
        tipo: canonico(tipo.toLowerCase()),
        /* Una clave primaria es `not null` aunque no lo diga. */
        noNulo: /\bnot\s+null\b/i.test(limpia) || /\bprimary\s+key\b/i.test(limpia),
        unica: /\bunique\b/i.test(limpia),
        clave: /\bprimary\s+key\b/i.test(limpia),
      };
    }

    tablas[nombre] = columnas;
  }

  return tablas;
}

/* ---------------------------------------------------------------- el vivo -- */

/** El spec OpenAPI que PostgREST publica para el rol que pregunta. */
export async function inspeccionar({ url, key, fetchImpl = fetch }) {
  const respuesta = await fetchImpl(`${String(url).replace(/\/$/, '')}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
  });

  if (!respuesta.ok) {
    throw new Error(`PostgREST respondió ${respuesta.status} ${respuesta.statusText}`);
  }

  return respuesta.json();
}

/**
 * Traduce el spec a la misma forma que `esquemaEsperado`, para poder restar.
 *
 * `required` de OpenAPI es exactamente el `not null` de la columna, con default
 * o sin él, así que se puede comparar directamente.
 */
export function esquemaVivo(spec) {
  const tablas = {};

  for (const [nombre, definicion] of Object.entries(spec.definitions ?? {})) {
    if (!nombre.startsWith('newsroom_')) continue;

    const requeridas = new Set(definicion.required ?? []);
    const columnas = {};

    for (const [columna, prop] of Object.entries(definicion.properties ?? {})) {
      columnas[columna] = {
        tipo: canonico(String(prop.format ?? '').toLowerCase()),
        noNulo: requeridas.has(columna),
        clave: /<pk\/>/.test(prop.description ?? ''),
      };
    }

    tablas[nombre] = columnas;
  }

  return tablas;
}

/* --------------------------------------------------------------- la resta -- */

/**
 * Qué se aparta de la migración, separado por si rompe algo o no.
 *
 * `fallos` detiene un despliegue: son cosas que la pasada diaria va a intentar
 * escribir y no va a poder. `avisos` no: una columna de más la puede haber
 * añadido una migración posterior, y exigir igualdad exacta convertiría este
 * guardia en un obstáculo para cualquier cambio futuro.
 */
export function compararEsquema(esperado, vivo) {
  const fallos = [];
  const avisos = [];

  for (const [tabla, columnas] of Object.entries(esperado)) {
    const real = vivo[tabla];

    if (!real) {
      fallos.push(`falta la tabla ${tabla}`);
      continue;
    }

    for (const [columna, quiero] of Object.entries(columnas)) {
      const tengo = real[columna];

      if (!tengo) {
        fallos.push(`${tabla}.${columna}: no existe`);
        continue;
      }

      if (tengo.tipo !== quiero.tipo) {
        fallos.push(`${tabla}.${columna}: es ${tengo.tipo} y la migración pide ${quiero.tipo}`);
      }

      /*
       * Una columna que la migración declara obligatoria y en la base admite
       * nulos deja pasar filas incompletas sin avisar. Al revés —obligatoria en
       * la base y opcional en la migración— rechaza escrituras que el código
       * cree válidas, y eso sí rompe la pasada.
       */
      if (quiero.noNulo && !tengo.noNulo) {
        avisos.push(`${tabla}.${columna}: la migración la declara not null y aquí admite nulos`);
      }
      if (!quiero.noNulo && tengo.noNulo) {
        fallos.push(`${tabla}.${columna}: es obligatoria aquí y opcional en la migración`);
      }
      if (quiero.clave && !tengo.clave) {
        fallos.push(`${tabla}.${columna}: debería ser clave primaria y no lo es`);
      }
    }

    for (const columna of Object.keys(real)) {
      if (!columnas[columna]) avisos.push(`${tabla}.${columna}: sobra, no está en la migración`);
    }
  }

  for (const tabla of Object.keys(vivo)) {
    if (!esperado[tabla]) avisos.push(`${tabla}: existe y no está en la migración`);
  }

  return { fallos, avisos, ok: fallos.length === 0 };
}

/* ------------------------------------------------------------- los sondeos -- */

/**
 * ¿Sigue existiendo la restricción única sobre `canonical_url`?
 *
 * No escribe. Se pide un `on_conflict` sobre esa columna con un cuerpo vacío:
 * PostgreSQL resuelve la especificación del `on conflict` al planificar, antes
 * de ejecutar nada, así que si la restricción no está responde 42P10 sin tocar
 * la tabla; y si está, la ejecución se para en el primer `not null` con 23502.
 */
export async function sondearUnicidad({ url, key, fetchImpl = fetch }) {
  const respuesta = await fetchImpl(
    `${String(url).replace(/\/$/, '')}/rest/v1/newsroom_candidates?on_conflict=canonical_url`,
    {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates',
      },
      body: '{}',
    }
  );

  const cuerpo = await respuesta.json().catch(() => ({}));
  const codigo = cuerpo.code ?? '';

  if (codigo === '42P10') return { ok: false, motivo: 'no hay restricción única sobre canonical_url' };
  if (codigo === '23502' || codigo === '23514') return { ok: true, motivo: `restricción presente (${codigo})` };
  if (respuesta.ok) return { ok: false, motivo: 'el sondeo ha escrito una fila: revísalo a mano' };

  return { ok: false, motivo: `respuesta inesperada ${respuesta.status} ${codigo}` };
}

/**
 * ¿Le llega algo a `anon`?
 *
 * Es la única mitad de RLS observable desde fuera, y es la que importa: todo
 * Newsroom es material interno, incluido lo descartado y su motivo. Un 401 o un
 * 42501 son la respuesta correcta. Un 200 con `[]` no lo es —significa que el
 * `revoke` no llegó y que la tabla sólo está vacía—.
 */
export async function sondearAnon({ url, anonKey, tablas, fetchImpl = fetch }) {
  const abiertas = [];

  for (const tabla of tablas) {
    const respuesta = await fetchImpl(
      `${String(url).replace(/\/$/, '')}/rest/v1/${tabla}?select=count&limit=1`,
      { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, Accept: 'application/json' } }
    );
    if (respuesta.ok) abiertas.push(tabla);
    await respuesta.body?.cancel?.().catch(() => {});
  }

  return { ok: abiertas.length === 0, abiertas };
}

/* ----------------------------------------------------------------- informe -- */

/**
 * La comprobación entera, en una llamada.
 *
 * Devuelve el informe en vez de imprimirlo para que quien la usa decida qué
 * hacer: el `prebuild` rompe el build, la línea de órdenes sólo lo cuenta.
 */
export async function verificarEsquema({ url, key, anonKey, fetchImpl = fetch }) {
  const esperado = esquemaEsperado();
  const spec = await inspeccionar({ url, key, fetchImpl });
  const vivo = esquemaVivo(spec);
  const { fallos, avisos } = compararEsquema(esperado, vivo);

  const unicidad = await sondearUnicidad({ url, key, fetchImpl });
  if (!unicidad.ok) fallos.push(`newsroom_candidates: ${unicidad.motivo}`);

  let anon = null;
  if (anonKey) {
    anon = await sondearAnon({ url, anonKey, tablas: Object.keys(esperado), fetchImpl });
    for (const tabla of anon.abiertas) fallos.push(`${tabla}: anon puede leerla`);
  }

  return {
    ok: fallos.length === 0,
    tablas: Object.keys(esperado).length,
    presentes: Object.keys(esperado).filter((t) => vivo[t]).length,
    columnas: Object.values(esperado).reduce((n, c) => n + Object.keys(c).length, 0),
    fallos,
    avisos,
    unicidad,
    anon,
  };
}

/** Lo imprime. Se usa igual desde el `prebuild` y desde la línea de órdenes. */
export function imprimirInforme(informe, destino) {
  console.log('\nEsquema Newsroom vs 0015_newsroom.sql');
  console.log('─────────────────────────────────────');
  if (destino) console.log(`  proyecto : ${destino}`);
  console.log(`  tablas   : ${informe.presentes}/${informe.tablas}`);
  console.log(`  columnas : ${informe.columnas} comprobadas`);
  console.log(`  unicidad : ${informe.unicidad.motivo}`);
  if (informe.anon) {
    console.log(`  anon     : ${informe.anon.ok ? 'sin acceso a ninguna' : `LEE ${informe.anon.abiertas.join(', ')}`}`);
  }

  for (const aviso of informe.avisos) console.log(`  · ${aviso}`);
  for (const fallo of informe.fallos) console.log(`  ✗ ${fallo}`);

  console.log(informe.ok ? '\n  ✓ coincide con la migración.' : `\n  ✗ ${informe.fallos.length} diferencias.`);
}

/* -------------------------------------------------------------------- cli -- */

const invocadoDirectamente = process.argv[1]?.replace(/\\/g, '/').endsWith('newsroom-schema.mjs');

if (invocadoDirectamente) {
  const url = process.env.PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

  if (!url || !key) {
    console.error('\nFaltan PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.\n');
    process.exit(1);
  }

  const informe = await verificarEsquema({
    url,
    key,
    anonKey: process.env.PUBLIC_SUPABASE_ANON_KEY ?? '',
  });

  /* El host identifica el proyecto sin enseñar ninguna clave. */
  imprimirInforme(informe, new URL(url).host);
  process.exit(informe.ok ? 0 : 1);
}
