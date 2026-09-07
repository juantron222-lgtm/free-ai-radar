#!/usr/bin/env node
/**
 * Configura las variables de Preview que Newsroom necesita, y sólo esas.
 *
 * Existe porque hacerlo a mano en el panel es donde se cuelan los errores que
 * ya nos han costado sesiones: una variable que sigue apuntando al proyecto de
 * Supabase muerto, otra definida dos veces, una clave de staging que acaba en
 * Production. Aquí las tres cosas son imposibles por construcción.
 *
 * Qué hace y qué no:
 *
 *   · Sólo toca `target: preview`. Una variable de Production se salta sin
 *     mirarla, y si alguna vez este script intentara tocarla, aborta.
 *   · Sólo toca las claves de Newsroom que declara `CLAVES`. Lo demás que haya
 *     en Preview se lista y se deja en paz.
 *   · Acota las de Newsroom a la rama `newsroom-produccion`. Una variable de
 *     Preview sin rama aplica a todas las ramas de vista previa, que es la
 *     forma silenciosa de que staging se filtre a otra parte.
 *   · Nunca imprime un valor. Ni el suyo ni el que sustituye.
 *
 * Es dry-run por defecto: sin `--apply` dice lo que haría y no hace nada.
 *
 *   node scripts/vercel-newsroom-env.mjs              informa
 *   node scripts/vercel-newsroom-env.mjs --apply      aplica
 */

import { readFileSync, existsSync } from 'node:fs';

const APLICAR = process.argv.includes('--apply');
const RAMA = 'newsroom-produccion';
const API = 'https://api.vercel.com';

/** Proyecto de Supabase que ya no existe. Ninguna variable puede seguir ahí. */
const REF_MUERTA = 'lhujloyflkllryshpkjl';
const REF_VIVA = 'zzgvpyhygzfwtyecguyi';

/**
 * Lo que Newsroom necesita en Preview, y de dónde sale cada valor.
 *
 * `.env.local` es la fuente: es lo que ya está probado contra el staging real,
 * así que Preview recibe exactamente lo mismo y no una segunda copia escrita a
 * mano que pueda divergir.
 */
const CLAVES = [
  'PUBLIC_SUPABASE_URL',
  'PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_STAGING_REF',
  'SUPABASE_ENV',
  'CRON_SECRET',
  'NEWSROOM_DEPLOY_HOOK',
];

/**
 * `SUPABASE_DATABASE_URL` no está en la lista, y es deliberado.
 *
 * Newsroom habla con Supabase por REST: el cron, el store y el `prebuild` usan
 * `PUBLIC_SUPABASE_URL` más la service role, nunca una conexión a Postgres. La
 * cadena directa es una herramienta administrativa —migraciones, la batería
 * E2E, el guardián de staging— y pedirla como variable de despliegue tendría
 * dos costes: haría que un build dependiera de algo que no necesita, y pondría
 * una credencial de acceso total a la base en un entorno donde nada la usa.
 *
 * Vive en `.env.local`, en la máquina de quien migra. No en Vercel.
 */
const HERRAMIENTA_ADMINISTRATIVA = ['SUPABASE_DATABASE_URL'];

/* --------------------------------------------------------------- entorno -- */

function leerEnv(path) {
  const valores = {};
  if (!existsSync(path)) return valores;
  for (const linea of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (linea.trim().startsWith('#')) continue;
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const valor = m[2].trim().replace(/^["']|["']$/g, '');
    if (valor) valores[m[1]] = valor;
  }
  return valores;
}

const local = { ...leerEnv('credenciales-newsroom.local.txt'), ...leerEnv('.env.local') };

const token = process.env.VERCEL_TOKEN ?? local.VERCEL_TOKEN;
const equipo = process.env.VERCEL_TEAM_ID ?? local.VERCEL_TEAM_ID ?? null;

/**
 * El identificador del proyecto sale del propio Deploy Hook.
 *
 * La URL del hook lleva dentro `prj_…`, así que no hace falta pedir un dato
 * más: si hay hook, hay proyecto, y son forzosamente el mismo.
 */
function proyectoDesdeHook(url) {
  return String(url ?? '').match(/\/deploy\/(prj_[A-Za-z0-9]+)/)?.[1] ?? null;
}

const proyecto =
  process.env.VERCEL_PROJECT_ID ??
  local.VERCEL_PROJECT_ID ??
  proyectoDesdeHook(local.NEWSROOM_DEPLOY_HOOK) ??
  (existsSync('.vercel/project.json')
    ? JSON.parse(readFileSync('.vercel/project.json', 'utf8')).projectId
    : null);

/* ------------------------------------------------------------------- api -- */

async function api(ruta, opciones = {}) {
  const sep = ruta.includes('?') ? '&' : '?';
  const url = `${API}${ruta}${equipo ? `${sep}teamId=${equipo}` : ''}`;

  const respuesta = await fetch(url, {
    ...opciones,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(opciones.headers ?? {}),
    },
  });

  const cuerpo = await respuesta.text();
  if (!respuesta.ok) {
    /* El cuerpo de un error de Vercel no lleva secretos, pero sí el token en
       algunos casos de cabecera mal formada: se recorta por si acaso. */
    throw new Error(`${respuesta.status} ${cuerpo.slice(0, 200).replace(token ?? '', '«token»')}`);
  }
  return cuerpo ? JSON.parse(cuerpo) : {};
}

/* -------------------------------------------------------------- análisis -- */

/**
 * Por qué una variable de Preview estorba.
 *
 * Tres motivos, y ninguno es «no me gusta»: apunta a un proyecto que ya no
 * existe, es una clave de Newsroom que va a ser sustituida, o es una de las
 * nuestras sin rama —y sin rama se aplica a todas las vistas previas, no sólo
 * a la de Newsroom—.
 */
export function motivoDeConflicto(variable, { claves = CLAVES, rama = RAMA } = {}) {
  return razonar(variable, claves, rama);
}

export { CLAVES, HERRAMIENTA_ADMINISTRATIVA, RAMA, REF_MUERTA, REF_VIVA, proyectoDesdeHook };

function razonar(variable, CLAVES, RAMA) {
  const enRama = (variable.gitBranch ?? null) === RAMA;

  /*
   * No se puede decidir por el valor, y conviene decirlo en voz alta.
   *
   * Estas variables son `type: sensitive`, y Vercel no devuelve su contenido ni
   * con `decrypt=true`. Aquí hubo una comprobación de «apunta al proyecto de
   * Supabase eliminado» que jamás podía dispararse: leía un campo que siempre
   * llega vacío y por tanto siempre daba verde. Un guardia que no puede fallar
   * tampoco puede proteger.
   *
   * La política que sí funciona sin leer valores es la que sigue: toda clave de
   * Newsroom se sustituye, mire a donde mire. Así la pregunta de a qué proyecto
   * apuntaba deja de importar — después apunta al que dice `.env.local`, que es
   * el que está probado contra el staging real.
   */
  if (CLAVES.includes(variable.key) && !enRama) {
    return variable.gitBranch
      ? `es de Newsroom pero está acotada a la rama "${variable.gitBranch}"`
      : 'es de Newsroom y no está acotada a ninguna rama: aplicaría a todas las vistas previas';
  }
  if (CLAVES.includes(variable.key) && enRama) return 'se sustituye por el valor actual';
  return null;
}

/* ----------------------------------------------------------------- main -- */

async function main() {
  console.log('\nConfiguración de Preview para Newsroom');
  console.log('───────────────────────────────────────────────');
  console.log('  rama destino :', RAMA);
  console.log('  proyecto     :', proyecto ?? '(sin determinar)');
  console.log('  modo         :', APLICAR ? 'APLICAR' : 'informe (sin cambios)');

  if (!token) {
    console.error('\n✗ Falta VERCEL_TOKEN.');
    console.error('  Créalo en https://vercel.com/account/tokens con ámbito sobre este proyecto');
    console.error('  y añádelo a credenciales-newsroom.local.txt como:');
    console.error('    VERCEL_TOKEN=...');
    process.exit(1);
  }

  if (!proyecto) {
    console.error('\n✗ No se ha podido determinar el proyecto.');
    console.error('  Se saca de NEWSROOM_DEPLOY_HOOK, o define VERCEL_PROJECT_ID.');
    process.exit(1);
  }

  const faltan = CLAVES.filter((k) => !local[k]);
  if (faltan.length) {
    console.error(`\n✗ Faltan valores en local para: ${faltan.join(', ')}`);
    process.exit(1);
  }

  /* Comprobación de cordura antes de escribir nada. */
  if (!local.PUBLIC_SUPABASE_URL.includes(REF_VIVA)) {
    console.error(`\n✗ PUBLIC_SUPABASE_URL local no apunta a ${REF_VIVA}. Se aborta.`);
    process.exit(1);
  }

  const info = await api(`/v9/projects/${proyecto}`);
  console.log('  nombre       :', info.name);

  const { envs } = await api(`/v9/projects/${proyecto}/env?decrypt=false`);
  const preview = envs.filter((e) => (e.target ?? []).includes('preview'));
  const produccion = envs.filter((e) => (e.target ?? []).includes('production'));

  console.log(`\n  variables en Preview   : ${preview.length}`);
  console.log(`  variables en Production: ${produccion.length} (no se tocan)`);

  const conflictivas = preview
    .map((v) => ({ v, motivo: motivoDeConflicto(v) }))
    .filter((x) => x.motivo);

  console.log('\nEn Preview ahora mismo');
  for (const v of preview) {
    const marca = conflictivas.find((c) => c.v.id === v.id);
    const rama = v.gitBranch ? `rama ${v.gitBranch}` : 'todas las ramas';
    console.log(`  ${marca ? '✗' : '·'} ${v.key.padEnd(28)} ${rama}${marca ? `  → ${marca.motivo}` : ''}`);
  }

  if (!APLICAR) {
    console.log(`\nSe eliminarían ${conflictivas.length} y se crearían ${CLAVES.length}, acotadas a ${RAMA}.`);
    console.log('Vuelve a ejecutarlo con --apply para hacerlo.');
    return;
  }

  console.log('\nAplicando');
  for (const { v, motivo } of conflictivas) {
    /* Salvaguarda: nunca borrar algo que también viva en Production. */
    if ((v.target ?? []).includes('production')) {
      console.log(`  ! ${v.key}: también está en Production, se deja intacta`);
      continue;
    }
    await api(`/v9/projects/${proyecto}/env/${v.id}`, { method: 'DELETE' });
    console.log(`  − ${v.key.padEnd(28)} eliminada (${motivo})`);
  }

  for (const clave of CLAVES) {
    await api(`/v10/projects/${proyecto}/env`, {
      method: 'POST',
      body: JSON.stringify({
        key: clave,
        value: local[clave],
        type: 'encrypted',
        target: ['preview'],
        gitBranch: RAMA,
      }),
    });
    console.log(`  + ${clave.padEnd(28)} creada en Preview, rama ${RAMA}`);
  }

  console.log('\n✓ Preview configurado. Production intacta.');
}

/*
 * Sólo se ejecuta cuando se invoca directamente. Importarlo desde una prueba
 * no debe disparar llamadas a la API de Vercel — y menos aún un borrado.
 */
const invocadoDirectamente = process.argv[1]?.replace(/\\/g, '/').endsWith('vercel-newsroom-env.mjs');

if (invocadoDirectamente) {
  main().catch((error) => {
    console.error('\n✗', error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
