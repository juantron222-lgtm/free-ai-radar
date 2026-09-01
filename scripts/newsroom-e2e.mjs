#!/usr/bin/env node
/**
 * Batería de extremo a extremo de Newsroom contra un Supabase real.
 *
 * Existe porque PGlite demuestra que el esquema es correcto y no demuestra que
 * *este* proyecto lo tenga aplicado. Son dos preguntas distintas: una es sobre
 * el SQL, la otra sobre la instalación. Esta batería responde la segunda.
 *
 * Cada comprobación imprime lo que ha observado, no un «OK». Un informe que
 * sólo dice que todo va bien es indistinguible de uno que no ha mirado.
 *
 *   node scripts/newsroom-e2e.mjs            comprueba esquema, RLS e idempotencia
 *   node scripts/newsroom-e2e.mjs --seed     además carga la semilla controlada
 *   node scripts/newsroom-e2e.mjs --cleanup  retira sólo lo que esta batería creó
 *
 * Nunca toca producción: se apoya en el mismo guardián que el resto del
 * utillaje y aborta si el destino no es el staging declarado.
 */

import { connect } from './db-connect.mjs';
import { evaluateEnvironment, loadEnv, readDbUrl, scrub } from './staging-guard.mjs';

const FLAGS = new Set(process.argv.slice(2));
const SEMBRAR = FLAGS.has('--seed');
const LIMPIAR = FLAGS.has('--cleanup');

const TABLAS = [
  'newsroom_runs',
  'newsroom_candidates',
  'newsroom_triage',
  'newsroom_verification',
  'newsroom_drafts',
  'newsroom_decisions',
  'newsroom_published',
];

/*
 * Todo lo que la batería inserta lleva este prefijo, y es lo único que
 * `--cleanup` borra. Una limpieza que borrase por tabla se llevaría por delante
 * lo que el cron hubiera descubierto de verdad.
 */
const MARCA = 'e2e-newsroom';

const resultados = [];
function anota(id, ok, detalle) {
  resultados.push({ id, ok, detalle });
  console.log(`  ${ok ? '✓' : '✗'} ${id.padEnd(34)} ${detalle}`);
}

/* ------------------------------------------------------------------ esquema -- */

async function comprobarEsquema(sql) {
  console.log('\nESQUEMA');

  const tablas = await sql`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_name like 'newsroom%'
    order by table_name`;
  const nombres = tablas.map((r) => r.table_name);
  const faltan = TABLAS.filter((t) => !nombres.includes(t));
  anota(
    'siete tablas',
    faltan.length === 0,
    faltan.length === 0 ? nombres.join(', ') : `faltan: ${faltan.join(', ')}`
  );

  const constraints = await sql`
    select conrelid::regclass::text as tabla, conname, contype
    from pg_constraint
    where connamespace = 'public'::regnamespace
      and conrelid::regclass::text like 'newsroom%'
    order by tabla, conname`;

  const unicos = constraints.filter((c) => c.contype === 'u' || c.contype === 'p');
  const checks = constraints.filter((c) => c.contype === 'c');
  const fks = constraints.filter((c) => c.contype === 'f');

  anota('claves únicas y primarias', unicos.length >= 8, `${unicos.length} encontradas`);
  anota('restricciones CHECK', checks.length >= 5, `${checks.length} encontradas`);
  anota('claves foráneas', fks.length >= 4, `${fks.length} encontradas`);

  const dedupe = constraints.find(
    (c) => c.tabla === 'newsroom_candidates' && c.contype === 'u' && /canonical/.test(c.conname)
  );
  anota(
    'deduplicación por url canónica',
    Boolean(dedupe),
    dedupe ? `restricción única: ${dedupe.conname}` : 'NO EXISTE la restricción única'
  );

  const indices = await sql`
    select tablename, indexname from pg_indexes
    where schemaname = 'public' and tablename like 'newsroom%'
    order by tablename, indexname`;
  anota('índices', indices.length >= 7, `${indices.length}: ${indices.map((i) => i.indexname).join(', ')}`);
}

/* ---------------------------------------------------------------------- RLS -- */

async function comprobarRls(sql) {
  console.log('\nRLS');

  const rls = await sql`
    select relname, relrowsecurity from pg_class
    where relnamespace = 'public'::regnamespace and relname like 'newsroom%'
    order by relname`;
  const sinRls = rls.filter((r) => !r.relrowsecurity).map((r) => r.relname);
  anota('RLS activo en las siete', sinRls.length === 0, sinRls.length ? `sin RLS: ${sinRls}` : 'las siete');

  const politicas = await sql`
    select tablename, policyname, cmd from pg_policies
    where schemaname = 'public' and tablename like 'newsroom%'
    order by tablename, cmd`;
  anota('políticas', politicas.length >= 9, `${politicas.length} políticas`);

  /*
   * Lo que se comprueba aquí no es que exista una política de borrado, sino que
   * NO exista. El historial de decisiones y lo publicado no se reescriben, y la
   * forma de garantizarlo es que RLS no tenga por dónde permitirlo.
   */
  const mutables = politicas.filter(
    (p) =>
      ['newsroom_decisions', 'newsroom_published'].includes(p.tablename) &&
      ['UPDATE', 'DELETE', 'ALL'].includes(p.cmd)
  );
  anota(
    'historial inmutable',
    mutables.length === 0,
    mutables.length === 0
      ? 'sin política de update ni delete en decisiones ni publicados'
      : `PELIGRO: ${mutables.map((m) => `${m.tablename}/${m.cmd}`).join(', ')}`
  );

  const grants = await sql`
    select table_name, grantee, string_agg(distinct privilege_type, ',' order by privilege_type) as privs
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name like 'newsroom%'
      and grantee in ('anon', 'authenticated')
    group by table_name, grantee
    order by table_name, grantee`;

  const anonConAcceso = grants.filter((g) => g.grantee === 'anon');
  anota(
    'anon sin permisos de tabla',
    anonConAcceso.length === 0,
    anonConAcceso.length === 0 ? 'ninguno' : `PELIGRO: ${anonConAcceso.map((g) => `${g.table_name}:${g.privs}`).join(' ')}`
  );

  const escribibles = grants.filter(
    (g) => g.grantee === 'authenticated' && /INSERT/.test(g.privs)
  );
  anota(
    'insert sólo donde debe',
    escribibles.every((g) => ['newsroom_decisions', 'newsroom_published'].includes(g.table_name)),
    escribibles.map((g) => g.table_name).join(', ') || 'ninguno'
  );
}

/* ------------------------------------------------------- comportamiento RLS -- */

/**
 * Comprueba el comportamiento, no sólo la declaración.
 *
 * Que exista una política llamada «staff reads» no dice qué ve un anónimo. Esto
 * se sienta en cada rol y mira.
 */
async function comprobarComportamiento(sql) {
  console.log('\nRLS EN EJECUCIÓN');

  const como = async (rol, fn) => {
    let salida;
    await sql.begin(async (tx) => {
      await tx.unsafe(`set local role ${rol}`);
      salida = await fn(tx);
      throw new Error('rollback deliberado');
    }).catch((e) => {
      if (!/rollback deliberado/.test(e.message)) throw e;
    });
    return salida;
  };

  for (const rol of ['anon', 'authenticated']) {
    const visto = await como(rol, async (tx) => {
      const filas = [];
      for (const t of TABLAS) {
        try {
          const r = await tx.unsafe(`select count(*)::int as n from public.${t}`);
          filas.push(`${t}:${r[0].n}`);
        } catch {
          filas.push(`${t}:denegado`);
        }
      }
      return filas;
    });
    const filtra = visto.every((v) => /:(0|denegado)$/.test(v));
    anota(`${rol} sin lectura`, filtra, visto.join(' '));
  }

  const insercion = await como('authenticated', async (tx) => {
    try {
      await tx.unsafe(`insert into public.newsroom_published (slug, news_id, item, approved_by)
                       values ('${MARCA}-sin-permiso', 'news-${MARCA}-x', '{}'::jsonb, 'nadie')`);
      return 'PERMITIDO';
    } catch (e) {
      return `denegado (${String(e.message).slice(0, 48)})`;
    }
  });
  anota('publicar sin ser admin', insercion !== 'PERMITIDO', insercion);
}

/* ------------------------------------------------------------ idempotencia -- */

async function comprobarIdempotencia(sql) {
  console.log('\nIDEMPOTENCIA Y DEDUPLICACIÓN');

  const url = `openai.com/index/${MARCA}-dedupe`;
  const id = `inbox-${MARCA.slice(0, 6)}dedup`;

  await sql`delete from public.newsroom_candidates where canonical_url = ${url}`;

  await sql`
    insert into public.newsroom_candidates
      (id, title, url, canonical_url, publisher, observed_at, discovered_via, vertical, status)
    values (${id}, 'Semilla de deduplicación', ${'https://' + url}, ${url},
            'openai.com', current_date, 'e2e', 'modelo-lenguaje', 'candidate')`;

  let segundo = 'permitido';
  try {
    await sql`
      insert into public.newsroom_candidates
        (id, title, url, canonical_url, publisher, observed_at, discovered_via, vertical, status)
      values (${id + '2'}, 'Misma historia con utm', ${'https://' + url + '?utm_source=rss'}, ${url},
              'openai.com', current_date, 'e2e', 'modelo-lenguaje', 'candidate')`;
  } catch (e) {
    segundo = /duplicate key|unique/i.test(e.message) ? 'rechazado por la restricción única' : e.message;
  }
  anota('misma url canónica dos veces', segundo !== 'permitido', segundo);

  const conflicto = await sql`
    insert into public.newsroom_candidates
      (id, title, url, canonical_url, publisher, observed_at, discovered_via, vertical, status)
    values (${id}, 'Segunda pasada del cron', ${'https://' + url}, ${url},
            'openai.com', current_date, 'e2e', 'modelo-lenguaje', 'candidate')
    on conflict (id) do nothing
    returning id`;
  anota(
    'segunda pasada no duplica',
    conflicto.length === 0,
    conflicto.length === 0 ? 'on conflict do nothing: 0 filas nuevas' : 'INSERTÓ una fila'
  );

  const total = await sql`select count(*)::int as n from public.newsroom_candidates where canonical_url = ${url}`;
  anota('una sola fila superviviente', total[0].n === 1, `${total[0].n} fila(s)`);
}

/* ----------------------------------------------------------------- semilla -- */

async function sembrar(sql) {
  console.log('\nSEMILLA CONTROLADA');

  const run = await sql`
    insert into public.newsroom_runs (trigger, status, notes)
    values ('manual', 'ok', ${MARCA}) returning id`;
  const runId = run[0].id;

  const candidato = `inbox-${MARCA.slice(0, 6)}seed1`;
  const url = `openai.com/index/${MARCA}-semilla`;

  await sql`
    insert into public.newsroom_candidates
      (id, title, url, canonical_url, publisher, observed_at, published_at,
       discovered_via, vertical, status, run_id)
    values (${candidato}, 'Aurora 2 is now available to everyone',
            ${'https://' + url}, ${url}, 'openai.com', current_date, current_date,
            'e2e', 'modelo-lenguaje', 'candidate', ${runId})
    on conflict (id) do nothing`;

  await sql`
    insert into public.newsroom_triage
      (candidate_id, decision, score, reasons, vertical, event_class, radar_status, triaged_at)
    values (${candidato}, 'promote', 88,
            ${sql.json([{ axis: 'novedad', points: 15, reason: 'presenta algo que no existía antes' }])},
            'modelo-lenguaje', 'lanzamiento', 'candidate', current_date)
    on conflict (candidate_id) do nothing`;

  anota('semilla cargada', true, `run ${runId} · candidato ${candidato}`);
  return { runId, candidato };
}

/* ---------------------------------------------------------------- histórico -- */

async function comprobarHistorico(sql) {
  console.log('\nHISTÓRICO');

  const publicadas = await sql`select slug from public.newsroom_published order by slug`;
  const slugs = publicadas.map((r) => r.slug);
  const repetidos = slugs.filter((s, i) => slugs.indexOf(s) !== i);
  anota('sin slugs duplicados en publicados', repetidos.length === 0, `${slugs.length} publicadas`);

  /*
   * Las once históricas viven en la semilla versionada, no en la base. Que la
   * base no las contenga es lo correcto: si estuvieran en las dos, el merge del
   * build las duplicaría.
   */
  const { readFileSync } = await import('node:fs');
  const semilla = JSON.parse(readFileSync('src/data/news/news.json', 'utf-8'));
  const semillaSlugs = new Set(semilla.map((n) => n.slug));
  const colisiones = slugs.filter((s) => semillaSlugs.has(s));
  anota(
    'la base no repite la semilla',
    colisiones.length === 0,
    colisiones.length === 0
      ? `${semillaSlugs.size} en semilla, ${slugs.length} en base, 0 solapadas`
      : `COLISIÓN: ${colisiones.join(', ')}`
  );
}

/* ----------------------------------------------------------------- limpieza -- */

async function limpiar(sql) {
  console.log('\nLIMPIEZA');
  const patron = `%${MARCA}%`;

  const cand = await sql`delete from public.newsroom_candidates where id like ${patron} or canonical_url like ${patron} returning id`;
  const runs = await sql`delete from public.newsroom_runs where notes = ${MARCA} returning id`;
  anota('retirado lo de la batería', true, `${cand.length} candidatos, ${runs.length} ejecuciones`);
}

/* --------------------------------------------------------------------- main -- */

async function main() {
  const env = loadEnv();
  const veredicto = evaluateEnvironment(env);

  console.log('\nDestino');
  console.log('  proyecto declarado:', env.SUPABASE_STAGING_REF ?? '(sin declarar)');

  if (!veredicto.ok) {
    console.error('\n✗ DETENIDO por el guardián de staging:');
    for (const motivo of veredicto.reasons ?? veredicto.problems ?? []) console.error('  ·', scrub(String(motivo)));
    console.error('\nNo se ejecuta nada contra una base que no es el staging declarado.');
    process.exit(1);
  }

  const sql = connect(readDbUrl(env).url);

  try {
    await comprobarEsquema(sql);
    await comprobarRls(sql);
    await comprobarComportamiento(sql);
    await comprobarIdempotencia(sql);
    if (SEMBRAR) await sembrar(sql);
    await comprobarHistorico(sql);
    if (LIMPIAR) await limpiar(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }

  const fallos = resultados.filter((r) => !r.ok);
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`${resultados.length - fallos.length} de ${resultados.length} comprobaciones en verde`);

  if (fallos.length) {
    console.log('\nFallos:');
    for (const f of fallos) console.log('  ·', f.id, '—', f.detalle);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('\n✗', scrub(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
