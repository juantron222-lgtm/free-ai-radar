#!/usr/bin/env node
/**
 * AutoCraw's real access, tested as AutoCraw.
 *
 * The RLS suite exercised this role with `set role` from the project owner.
 * That proves the grants, and it does not prove the credential: a role can be
 * correctly restricted and still be unreachable, or reachable and quietly
 * privileged through something the owner's session was carrying. This opens a
 * separate connection and authenticates, which is what the agent will actually
 * do.
 *
 * Two halves, and both matter:
 *
 *   **Capabilities** — the eight things AutoCraw must be able to do. A wall
 *   with nothing behind it is not an integration. If the agent cannot write a
 *   merchant, the isolation is perfect and useless.
 *
 *   **Attacks** — the eleven things it must not. Every one is run through the
 *   authenticated connection, so a pass means the credential itself cannot do
 *   it, not that a policy would have stopped somebody else.
 *
 * Everything happens inside a transaction that rolls back.
 *
 *   node scripts/autocraw-suite.mjs
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { loadEnv, readDbUrl, scrub } from './staging-guard.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const results = [];

function record({ id, kind, severity, action, expected, observed, pass, mechanism }) {
  results.push({ id, kind, severity, action, expected, observed, pass, mechanism });
  const mark = pass ? '✓ PASA ' : '✗ FALLA';
  console.log(`  ${id.padEnd(9)} ${severity.padEnd(8)} ${mark}  ${action.slice(0, 52)}`);
  if (!pass) console.log(`${' '.repeat(28)}↳ esperado: ${expected} · obtenido: ${observed}`);
}

function enforceGuard() {
  try {
    console.log(
      execFileSync('node', [join(ROOT, 'scripts/staging-guard.mjs')], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim()
    );
  } catch (error) {
    console.error(error.stdout ?? '');
    console.error('\nEl guardián ha detenido la ejecución.\n');
    process.exit(1);
  }
}

/** Runs one statement in a savepoint so a failure does not poison the rest. */
async function attempt(tx, statement, params = []) {
  try {
    let rows;
    await tx.savepoint(async (sp) => {
      rows = params.length ? await sp.unsafe(statement, params) : await sp.unsafe(statement);
    });
    return { ok: true, rows };
  } catch (error) {
    return { ok: false, code: error.code ?? 'error', message: String(error.message ?? error) };
  }
}

/** Why a refusal happened, in the terms the evidence needs. */
function why(result) {
  if (result.ok) return 'permitido';
  const map = {
    42501: 'permiso denegado (42501)',
    '42P01': 'la tabla no existe o no es visible (42P01)',
    '23514': 'restricción CHECK (23514)',
    '23503': 'clave foránea (23503)',
    '0A000': 'operación no soportada (0A000)',
  };
  return map[result.code] ?? `denegado (${result.code})`;
}

// ---------------------------------------------------------------------------

async function capabilities(tx, ids) {
  console.log('\nCapacidades: lo que AutoCraw SÍ debe poder hacer');
  console.log('───────────────────────────────────────────────');

  const readTools = await attempt(
    tx,
    'select id, slug, name, category_slug, status from public.tools limit 5'
  );
  record({
    id: 'CAP-01',
    kind: 'capacidad',
    severity: 'alta',
    action: 'leer los campos de tools necesarios para identificar slugs',
    expected: 'permitido',
    observed: why(readTools),
    pass: readTools.ok,
    mechanism: 'grant select (id, slug, name, category_slug, status)',
  });

  // The columns it must NOT be able to read, on a table it can read.
  const readScores = await attempt(tx, 'select scores from public.tools limit 1');
  record({
    id: 'CAP-01b',
    kind: 'capacidad',
    severity: 'crítica',
    action: 'leer columnas de tools fuera de las concedidas (scores)',
    expected: 'denegado',
    observed: why(readScores),
    pass: !readScores.ok,
    mechanism: 'permisos por columna',
  });

  const merchant = await attempt(
    tx,
    `insert into public.affiliate_merchants
       (slug, name, programme, host, market, disclosure_text, source)
     values ('tienda-sonda', 'Tienda sonda', 'Programa sonda', 'sonda.example',
             'ES', 'Enlace de afiliación de prueba. Ganamos una comisión sin coste para ti.',
             'autocraw')
     returning id, status::text`
  );
  ids.merchant = merchant.rows?.[0]?.id;
  record({
    id: 'CAP-02',
    kind: 'capacidad',
    severity: 'alta',
    action: 'crear un comerciante',
    expected: 'permitido, y en estado pendiente',
    observed: merchant.ok ? `permitido, estado ${merchant.rows[0].status}` : why(merchant),
    pass: merchant.ok && merchant.rows[0].status === 'pending_review',
    mechanism: 'grant insert + disparador force_pending_for_agent',
  });

  const updateMerchant = await attempt(
    tx,
    `update public.affiliate_merchants set name = 'Tienda sonda renombrada'
     where id = '${ids.merchant}' returning id`
  );
  record({
    id: 'CAP-03',
    kind: 'capacidad',
    severity: 'alta',
    action: 'actualizar un comerciante propio',
    expected: 'permitido',
    observed: why(updateMerchant),
    pass: updateMerchant.ok && updateMerchant.rows.length === 1,
    mechanism: 'política autocraw: updates merchants (source = autocraw)',
  });

  const product = await attempt(
    tx,
    `insert into public.affiliate_products (slug, title, source)
     values ('producto-sonda', 'Producto sonda', 'autocraw')
     returning id, status::text`
  );
  ids.product = product.rows?.[0]?.id;
  record({
    id: 'CAP-04',
    kind: 'capacidad',
    severity: 'alta',
    action: 'crear y actualizar productos',
    expected: 'permitido, y en estado pendiente',
    observed: product.ok ? `permitido, estado ${product.rows[0].status}` : why(product),
    pass: product.ok && product.rows[0].status === 'pending_review',
    mechanism: 'grant insert + disparador',
  });

  const offer = await attempt(
    tx,
    `insert into public.affiliate_offers
       (product_id, merchant_id, market, observed_price_cents, observed_currency,
        observed_price_at, availability, source)
     values ('${ids.product}', '${ids.merchant}', 'ES', 4999, 'EUR', current_date,
             'in_stock', 'autocraw')
     returning id, status::text`
  );
  ids.offer = offer.rows?.[0]?.id;
  record({
    id: 'CAP-05',
    kind: 'capacidad',
    severity: 'alta',
    action: 'crear una oferta con precio observado y fecha',
    expected: 'permitido',
    observed: offer.ok ? `permitido, estado ${offer.rows[0].status}` : why(offer),
    pass: offer.ok,
    mechanism: 'grant insert',
  });

  const link = await attempt(
    tx,
    `insert into public.affiliate_links (offer_id, url, tracking_tag, source)
     values ('${ids.offer}', 'https://sonda.example/producto', 'etiqueta-sonda', 'autocraw')
     returning id, disclosure_required`
  );
  ids.link = link.rows?.[0]?.id;
  record({
    id: 'CAP-06',
    kind: 'capacidad',
    severity: 'alta',
    action: 'gestionar enlaces afiliados',
    expected: 'permitido, con divulgación obligatoria',
    observed: link.ok ? `permitido, disclosure_required=${link.rows[0].disclosure_required}` : why(link),
    pass: link.ok && link.rows[0].disclosure_required === true,
    mechanism: 'grant insert + check (disclosure_required = true)',
  });

  const toolId = readTools.rows?.[0]?.id;
  const relation = toolId
    ? await attempt(
        tx,
        `insert into public.tool_product_relations
           (tool_id, product_id, kind, rationale, commercial_priority, source)
         values ('${toolId}', '${ids.product}', 'complements',
                 'Una razón editorial suficientemente larga para la sonda.', 40, 'autocraw')
         returning id, status::text`
      )
    : { ok: false, code: 'sin-herramienta' };
  ids.relation = relation.rows?.[0]?.id;
  record({
    id: 'CAP-07',
    kind: 'capacidad',
    severity: 'alta',
    action: 'relacionar un producto con una herramienta',
    expected: 'permitido',
    observed: relation.ok ? `permitido, estado ${relation.rows[0].status}` : why(relation),
    pass: relation.ok,
    mechanism: 'grant insert sobre tool_product_relations',
  });

  const slot = await attempt(
    tx,
    `insert into public.placement_slots (slot, relation_id, commercial_priority, source)
     values ('tool_detail_footer', '${ids.relation}', 40, 'autocraw')
     returning id, status::text`
  );
  record({
    id: 'CAP-08',
    kind: 'capacidad',
    severity: 'alta',
    action: 'usar un placement slot autorizado',
    expected: 'permitido',
    observed: slot.ok ? `permitido, estado ${slot.rows[0].status}` : why(slot),
    pass: slot.ok,
    mechanism: 'grant insert + check slots_known',
  });

  const badSlot = await attempt(
    tx,
    `insert into public.placement_slots (slot, relation_id, source)
     values ('portada_hero', '${ids.relation}', 'autocraw')`
  );
  record({
    id: 'CAP-08b',
    kind: 'capacidad',
    severity: 'crítica',
    action: 'inventar un slot que el código no declara (portada_hero)',
    expected: 'denegado',
    observed: why(badSlot),
    pass: !badSlot.ok,
    mechanism: 'restricción CHECK slots_known',
  });

  const readClicks = await attempt(
    tx,
    'select day, link_id, clicks from public.affiliate_click_events_daily limit 1'
  );
  record({
    id: 'CAP-09',
    kind: 'capacidad',
    severity: 'media',
    action: 'leer las métricas agregadas de clics',
    expected: 'permitido',
    observed: why(readClicks),
    pass: readClicks.ok,
    mechanism: 'grant select sobre affiliate_click_events_daily',
  });

  const writeClicks = await attempt(
    tx,
    `insert into public.affiliate_click_events_daily (day, link_id, slot, market, clicks)
     values (current_date, '${ids.link}', 'tool_detail_footer', 'ES', 1)`
  );
  record({
    id: 'CAP-09b',
    kind: 'capacidad',
    severity: 'alta',
    action: 'escribir métricas de clics',
    expected: 'denegado — las cuenta el sitio, no el agente',
    observed: why(writeClicks),
    pass: !writeClicks.ok,
    mechanism: 'sin grant insert sobre la tabla de clics',
  });
}

async function attacks(tx, ids) {
  console.log('\nAtaques: lo que AutoCraw NO debe poder hacer');
  console.log('───────────────────────────────────────────────');

  const probes = [
    ['ATK-01', 'crítica', 'modificar public.tools', "update public.tools set name = 'tomada'"],
    ['ATK-02', 'crítica', 'modificar la puntuación', `update public.tools set scores = '{}'::jsonb`],
    ['ATK-03', 'crítica', 'modificar el veredicto', "update public.tools set verdict = 'patrocinado'"],
    ['ATK-04', 'crítica', 'insertar una herramienta propia', `insert into public.tools (id, slug, name, category_slug, free_model, free_plan, official_url, scores, detected_at, last_verified_at) values ('x','x','X','imagen','free_real','{}'::jsonb,'https://x.example','{}'::jsonb,current_date,current_date)`],
    ['ATK-05', 'crítica', 'modificar el ranking: tocar el patrocinio de una ficha', `update public.tools set sponsorship = '{"isSponsored":true,"placementBoost":50}'::jsonb`],
    ['ATK-06', 'alta', 'modificar noticias (tool_updates)', "update public.tool_updates set summary = 'inventado'"],
    ['ATK-07', 'alta', 'insertar una noticia', `insert into public.tool_updates (tool_id, kind, summary, happened_on) values ('tool_ollama','other','inventada',current_date)`],
    ['ATK-08', 'crítica', 'leer usuarios (auth.users)', 'select id from auth.users limit 1'],
    ['ATK-09', 'crítica', 'leer perfiles', 'select id from public.profiles limit 1'],
    ['ATK-10', 'crítica', 'administrar cuentas: cambiar un rol', "update public.profiles set role = 'admin'"],
    ['ATK-11', 'crítica', 'leer el boletín', 'select email from public.newsletter_subscriptions limit 1'],
    ['ATK-12', 'crítica', 'leer el registro de auditoría', 'select id from public.audit_logs limit 1'],
    ['ATK-13', 'crítica', 'leer la facturación', 'select id from public.user_subscriptions limit 1'],
    ['ATK-14', 'alta', 'borrar productos comerciales', 'delete from public.affiliate_products'],
    ['ATK-15', 'alta', 'borrar comerciantes', 'delete from public.affiliate_merchants'],
    ['ATK-16', 'alta', 'borrar enlaces', 'delete from public.affiliate_links'],
    ['ATK-17', 'alta', 'borrar relaciones', 'delete from public.tool_product_relations'],
    ['ATK-18', 'alta', 'borrar emplazamientos', 'delete from public.placement_slots'],
    ['ATK-19', 'media', 'tabla comercial no concedida: sponsored_placements', "update public.sponsored_placements set is_active = true"],
    ['ATK-20', 'media', 'tabla comercial no concedida: affiliate_programs', "insert into public.affiliate_programs (name) values ('propio')"],
    ['ATK-21', 'media', 'tabla comercial no concedida: tool_outbound_affiliations', "update public.tool_outbound_affiliations set url = 'https://x.example'"],
    ['ATK-22', 'crítica', 'escalar privilegios: hacerse superusuario', 'alter role autocraw_ingest superuser'],
    ['ATK-23', 'crítica', 'escalar privilegios: concederse permisos', 'grant all on public.tools to autocraw_ingest'],
    ['ATK-24', 'crítica', 'escalar privilegios: asumir el rol postgres', 'set role postgres'],
    ['ATK-25', 'crítica', 'escalar privilegios: crear un rol nuevo', 'create role puerta_trasera login'],
    ['ATK-26', 'alta', 'crear una tabla propia en public', 'create table public.puerta_trasera (x int)'],
    ['ATK-27', 'alta', 'leer envíos de la comunidad', 'select email from public.tool_submissions limit 1'],
  ];

  for (const [id, severity, action, statement] of probes) {
    const result = await attempt(tx, statement);
    record({
      id,
      kind: 'ataque',
      severity,
      action,
      expected: 'denegado',
      observed: result.ok
        ? `PERMITIDO${result.rows?.length ? `, ${result.rows.length} fila(s)` : ''}`
        : why(result),
      pass: !result.ok,
      mechanism: result.ok ? 'ninguno' : why(result),
    });
  }

  // Publishing is the one it can attempt legitimately and must not achieve.
  const publish = await attempt(
    tx,
    `update public.affiliate_products set status = 'active' where id = '${ids.product}'
     returning status::text`
  );
  record({
    id: 'ATK-28',
    kind: 'ataque',
    severity: 'crítica',
    action: 'publicarse a sí mismo: poner un producto en activo',
    expected: 'la fila vuelve a pendiente',
    observed: publish.ok
      ? `la sentencia pasó y quedó en ${publish.rows[0]?.status}`
      : why(publish),
    pass: !publish.ok || publish.rows[0]?.status === 'pending_review',
    mechanism: 'disparador force_pending_for_agent',
  });

  const undisclosed = await attempt(
    tx,
    `insert into public.affiliate_links (offer_id, url, disclosure_required, source)
     values ('${ids.offer}', 'https://sonda.example/oculto', false, 'autocraw')`
  );
  record({
    id: 'ATK-29',
    kind: 'ataque',
    severity: 'crítica',
    action: 'crear un enlace afiliado sin divulgación',
    expected: 'denegado',
    observed: why(undisclosed),
    pass: !undisclosed.ok,
    mechanism: 'check links_disclosure_always + política with check',
  });

  const foreignSource = await attempt(
    tx,
    `insert into public.affiliate_products (slug, title, source)
     values ('producto-disfrazado', 'Disfrazado', 'manual')`
  );
  record({
    id: 'ATK-30',
    kind: 'ataque',
    severity: 'alta',
    action: 'escribir haciéndose pasar por alta manual (source = manual)',
    expected: 'denegado',
    observed: why(foreignSource),
    pass: !foreignSource.ok,
    mechanism: 'política autocraw: with check (source = autocraw)',
  });
}

// ---------------------------------------------------------------------------

async function main() {
  enforceGuard();

  const env = loadEnv();
  const autocrawUrl = env['AUTOCRAW_DB_URL_STAGING'];
  if (!autocrawUrl) {
    console.error('\nFalta AUTOCRAW_DB_URL_STAGING. Emite la credencial:');
    console.error('  node scripts/autocraw-credential.mjs\n');
    process.exit(1);
  }

  // The owner's connection, used only to seed a catalogue row to relate to.
  const owner = postgres(readDbUrl(env).url, { max: 1, ssl: 'require', onnotice: () => {} });
  const agent = postgres(autocrawUrl, { max: 1, ssl: 'require', onnotice: () => {} });

  let failed = 0;

  try {
    await owner`
      insert into public.categories (slug, name) values ('imagen', 'Imagen')
      on conflict (slug) do nothing`;
    await owner`
      insert into public.tools
        (id, slug, name, category_slug, free_model, free_plan, official_url, scores,
         detected_at, last_verified_at, status)
      values
        ('tool_ollama', 'ollama', 'Ollama', 'imagen', 'free_real',
         '{"summary":"sonda","verifiedAt":"2026-08-07"}'::jsonb, 'https://ollama.com',
         '{"freeReal":10,"usefulness":9,"ease":8,"transparency":9,"creatorValue":8}'::jsonb,
         current_date, current_date, 'published')
      on conflict (id) do nothing`;

    const [{ me }] = await agent`select current_user as me`;
    console.log(`\nConectado como: ${me}`);
    if (me !== 'autocraw_ingest') {
      throw new Error(`La conexión no es la de AutoCraw sino la de ${me}.`);
    }

    const ids = {};
    await agent
      .begin(async (tx) => {
        await capabilities(tx, ids);
        await attacks(tx, ids);
        throw new Error('__rollback__');
      })
      .catch((error) => {
        if (error.message !== '__rollback__') throw error;
      });

    failed = results.filter((r) => !r.pass).length;
    const caps = results.filter((r) => r.kind === 'capacidad');
    const atks = results.filter((r) => r.kind === 'ataque');

    console.log('───────────────────────────────────────────────');
    console.log(
      `\nCapacidades: ${caps.filter((r) => r.pass).length}/${caps.length}` +
        ` · Ataques bloqueados: ${atks.filter((r) => r.pass).length}/${atks.length}` +
        ` · Bypass: ${failed}`
    );
  } catch (error) {
    console.error(`\n✗ ${scrub(error)}\n`);
    failed = failed || 1;
  } finally {
    await owner`delete from public.tools where id = 'tool_ollama'`.catch(() => {});
    await owner`delete from public.categories where slug = 'imagen'`.catch(() => {});
    await agent.end({ timeout: 5 }).catch(() => {});
    await owner.end({ timeout: 5 }).catch(() => {});
  }

  mkdirSync(join(ROOT, 'docs/evidence'), { recursive: true });
  writeFileSync(
    join(ROOT, 'docs/evidence/autocraw-staging-run.json'),
    `${JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        target: 'supabase-staging',
        connectedAs: 'autocraw_ingest',
        totals: { total: results.length, passed: results.length - failed, failed },
        results,
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  console.log('\nEvidencia: docs/evidence/autocraw-staging-run.json\n');

  process.exit(failed > 0 ? 1 : 0);
}

await main();
