#!/usr/bin/env node
/**
 * Añade a Production las dos variables que Newsroom necesita, y sólo esas.
 *
 * Está separado de `vercel-newsroom-env.mjs` a propósito. Aquel escribe
 * únicamente en `preview` y debe seguir así: una versión suya que aceptara
 * `production` sería la vía por la que una clave de staging acabe sirviendo a
 * lectores reales. Este toca Production, así que hace mucho menos.
 *
 * Lo que hace:
 *
 *   · Añade `CRON_SECRET` y `NEWSROOM_DEPLOY_HOOK`, nada más. La lista es una
 *     comprobación en tiempo de ejecución, no una convención: cualquier otra
 *     clave aborta.
 *   · No borra jamás. Si una de las dos ya existe, lo dice y se detiene, para
 *     que sustituirla sea una decisión y no un efecto secundario.
 *   · No mira siquiera las variables de Supabase. Ya están en Production, sus
 *     valores no se pueden leer, y Newsroom no necesita cambiarlas: habla con
 *     Supabase por REST con la URL y la service role que ya hay.
 *   · No imprime ningún valor.
 *
 * Dry-run por defecto.
 *
 *   node scripts/vercel-newsroom-prod.mjs            informa
 *   node scripts/vercel-newsroom-prod.mjs --apply    aplica
 */

import { readFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const APLICAR = process.argv.includes('--apply');

/** Lo único que este script puede escribir. Se comprueba antes de cada POST. */
const PERMITIDAS = ['CRON_SECRET', 'NEWSROOM_DEPLOY_HOOK'];

/**
 * Nunca se tocan, y se listan para que quede escrito por qué.
 *
 * Existen en Production, son `sensitive` —Vercel no devuelve su valor— y
 * Newsroom no las necesita cambiar. Recrearlas a ciegas significaría escribir
 * valores de staging encima de los de producción.
 */
const INTOCABLES = ['PUBLIC_SUPABASE_URL', 'PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];

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
const proyecto = String(local.NEWSROOM_DEPLOY_HOOK ?? '').match(/\/deploy\/(prj_[A-Za-z0-9]+)/)?.[1];

async function api(ruta, opciones = {}) {
  const respuesta = await fetch(`https://api.vercel.com${ruta}`, {
    ...opciones,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(opciones.headers ?? {}),
    },
  });
  const cuerpo = await respuesta.text();
  if (!respuesta.ok) throw new Error(`${respuesta.status} ${cuerpo.slice(0, 180)}`);
  return cuerpo ? JSON.parse(cuerpo) : {};
}

async function main() {
  if (!token || !proyecto) {
    console.error('Faltan VERCEL_TOKEN o el hook del que sacar el proyecto.');
    process.exit(1);
  }

  console.log('\nProduction · sólo CRON_SECRET y NEWSROOM_DEPLOY_HOOK');
  console.log('───────────────────────────────────────────────');
  console.log('  proyecto:', proyecto);
  console.log('  modo    :', APLICAR ? 'APLICAR' : 'informe');

  const { envs } = await api(`/v9/projects/${proyecto}/env?decrypt=false`);
  const produccion = envs.filter((e) => (e.target ?? []).includes('production'));

  console.log('\n  ya en Production:');
  for (const e of produccion) {
    const marca = INTOCABLES.includes(e.key) ? 'intocable' : PERMITIDAS.includes(e.key) ? 'gestionada' : '—';
    console.log(`    · ${e.key.padEnd(28)} ${marca}`);
  }

  const yaEstan = PERMITIDAS.filter((k) => produccion.some((e) => e.key === k));
  if (yaEstan.length) {
    console.error(`\n✗ Ya existen en Production: ${yaEstan.join(', ')}.`);
    console.error('  Este script no sustituye nada. Retíralas a mano si quieres regenerarlas.');
    process.exit(1);
  }

  /*
   * El secreto de Production se genera aquí y es distinto del de staging por
   * construcción: reutilizarlo significaría que quien conociera el de una vista
   * previa podría disparar la pasada diaria del sitio real.
   */
  const valores = {
    CRON_SECRET: randomBytes(48).toString('base64url'),
    NEWSROOM_DEPLOY_HOOK: local.NEWSROOM_DEPLOY_HOOK_PROD ?? '',
  };

  if (!valores.NEWSROOM_DEPLOY_HOOK) {
    console.error('\n✗ Falta NEWSROOM_DEPLOY_HOOK_PROD en el cuaderno local.');
    process.exit(1);
  }

  console.log(`\n  se crearían: ${PERMITIDAS.join(', ')} (target: production)`);
  console.log(`  CRON_SECRET nuevo, ${valores.CRON_SECRET.length} caracteres, distinto del de staging`);

  if (!APLICAR) {
    console.log('\n--apply para crearlas.');
    return;
  }

  for (const clave of PERMITIDAS) {
    if (!PERMITIDAS.includes(clave)) throw new Error(`clave fuera de la lista: ${clave}`);
    await api(`/v10/projects/${proyecto}/env`, {
      method: 'POST',
      body: JSON.stringify({
        key: clave,
        value: valores[clave],
        type: 'encrypted',
        target: ['production'],
      }),
    });
    console.log(`  + ${clave.padEnd(28)} creada en Production`);
  }

  console.log('\n✓ Hecho. Las de Supabase no se han tocado.');
  console.log('  Guarda el CRON_SECRET de Production en el cuaderno si quieres disparar el cron a mano:');
  console.log(`  CRON_SECRET_PROD=${valores.CRON_SECRET}`);
}

main().catch((error) => {
  console.error('\n✗', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
