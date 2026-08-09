#!/usr/bin/env node
/**
 * Synchronises the committed catalogue into the Postgres content mirror, and
 * refuses to finish if the result is not what was asked for.
 *
 * `public.categories` and `public.tools` are a mirror, not a source. Editorial
 * content lives in the repository and every public page renders from there;
 * these tables exist so user data can reference a tool with a foreign key and
 * have that reference mean something.
 *
 * Driver-agnostic on purpose. It takes an `exec(sql, params) => rows` function
 * rather than a connection, so the same code runs against Supabase through
 * postgres.js and against PGlite in the tests. There is exactly one
 * implementation of "what syncing means", and the tests exercise it rather
 * than a lookalike — the RLS preflight already taught this project what
 * happens when a test harness quietly builds something the real path does not.
 *
 * ## What happens when a tool disappears from the catalogue
 *
 * It is **archived, never deleted**. `delete` would cascade into
 * `user_favorites`, `user_list_items`, `view_history`, `user_tool_states` and
 * `alerts` and destroy people's data because an editor removed a row from a
 * JSON file. Archiving keeps the id, keeps every foreign key valid, keeps the
 * user's list intact, and takes the tool out of the public catalogue — which
 * is filtered on `status === 'published'` anyway.
 *
 * If the tool comes back, the next sync sets its status from the catalogue and
 * the favourites that survived are still pointing at it.
 */

/**
 * Columns the database owns, excluded from the mirror comparison.
 *
 * `created_at` says when the row first appeared and must survive later syncs.
 * `updated_at` says when the row last changed, and a `before update` trigger
 * sets it to `now()` regardless of what we send — comparing it would report
 * every row as discrepant on every run, which is how a check that always fails
 * becomes a check nobody reads.
 *
 * Everything else is compared. That is the point: the list of exceptions is
 * short, stated, and each entry has a reason.
 */
const DB_OWNED = ['created_at', 'updated_at'];

/**
 * Tables whose `tool_id` must resolve. Kept as a list rather than discovered,
 * so a new table referencing tools is a deliberate addition here — the same
 * reasoning as AutoCraw's allowlist.
 */
const USER_DATA_TABLES = [
  'user_favorites',
  'user_tool_states',
  'user_list_items',
  'view_history',
  'alerts',
];

export class SyncError extends Error {}

/**
 * Reads the columns from the database rather than a constant, so a column
 * added by a later migration is copied without anyone remembering to edit this
 * file. The primary key identifies the row, and the DB_OWNED columns belong to
 * the database; none of them may be overwritten by a later sync.
 */
async function updateAssignments(exec, table) {
  const columns = await exec(
    `select column_name from information_schema.columns
     where table_schema = 'public' and table_name = $1`,
    [table]
  );

  const names = columns
    .map((c) => c.column_name)
    .filter((c) => c !== 'id' && c !== 'slug' && !DB_OWNED.includes(c));

  if (!names.length) {
    throw new SyncError(`La tabla public.${table} no existe o no tiene columnas.`);
  }

  return names.map((c) => `"${c}" = excluded."${c}"`).join(', ');
}

async function upsert(exec, table, rows, key) {
  const assignments = await updateAssignments(exec, table);

  /*
   * `$1::text::jsonb` with a serialised string, rather than `$1::jsonb` with an
   * array, because the two drivers disagree about the second form and agree
   * about this one.
   *
   * postgres.js serialises the parameter itself when the server says the
   * placeholder is jsonb — so an array works there and an already-serialised
   * string arrives as a JSON scalar, producing `cannot call
   * jsonb_populate_recordset on a non-array`. PGlite does the opposite: the
   * array raises `invalid input syntax for type json` and the string is right.
   *
   * Casting through `text` makes the server infer `text` for the placeholder,
   * which removes the disagreement: both drivers send the string untouched and
   * Postgres parses it. Measured, not assumed — the two forms were run against
   * both drivers.
   */
  await exec(
    `insert into public.${table}
     select * from jsonb_populate_recordset(null::public.${table}, $1::text::jsonb)
     on conflict (${key}) do update set ${assignments}`,
    [JSON.stringify(rows)]
  );
}

/**
 * Everything that must be true after a sync, asked of the database rather than
 * assumed from the fact that the inserts did not error.
 *
 * Returns a list of problems. An empty list is the only acceptable outcome and
 * the caller turns anything else into a failure, which is what makes
 * `--migrate` stop rather than report success over a broken mirror.
 */
export async function verifyMirror(exec, { toolRows, categoryRows }) {
  const problems = [];

  const missingCategories = await exec(
    `select i.slug from jsonb_populate_recordset(null::public.categories, $1::text::jsonb) i
     left join public.categories c on c.slug = i.slug
     where c.slug is null`,
    [JSON.stringify(categoryRows)]
  );
  for (const row of missingCategories) {
    problems.push({ kind: 'categoria-ausente', detail: row.slug });
  }

  const missingTools = await exec(
    `select i.id from jsonb_populate_recordset(null::public.tools, $1::text::jsonb) i
     left join public.tools t on t.id = i.id
     where t.id is null`,
    [JSON.stringify(toolRows)]
  );
  for (const row of missingTools) {
    problems.push({ kind: 'herramienta-ausente', detail: row.id });
  }

  /*
   * `toggleFavorite` writes `tool_${slug}`. A mirror holding ids in any other
   * shape rejects every favourite exactly like an empty one does, while looking
   * perfectly healthy in the dashboard.
   */
  const badIds = await exec(
    `select id, slug from public.tools where id <> 'tool_' || slug`
  );
  for (const row of badIds) {
    problems.push({ kind: 'id-no-resoluble', detail: `${row.id} (slug ${row.slug})` });
  }

  const orphanCategories = await exec(
    `select t.id, t.category_slug from public.tools t
     left join public.categories c on c.slug = t.category_slug
     where c.slug is null`
  );
  for (const row of orphanCategories) {
    problems.push({ kind: 'fk-categoria-rota', detail: `${row.id} → ${row.category_slug}` });
  }

  for (const table of USER_DATA_TABLES) {
    const orphans = await exec(
      `select u.tool_id, count(*)::int as n from public.${table} u
       left join public.tools t on t.id = u.tool_id
       where u.tool_id is not null and t.id is null
       group by u.tool_id`
    );
    for (const row of orphans) {
      problems.push({
        kind: 'fk-usuario-rota',
        detail: `${table}: ${row.n} fila(s) apuntando a ${row.tool_id}`,
      });
    }
  }

  /*
   * Field-level agreement, compared as whole rows of the table's own type so
   * every column is covered without listing any of them. `is distinct from`
   * rather than `<>` because a NULL on either side must count as a difference,
   * not as unknown.
   */
  const excluded = DB_OWNED.map((c) => `- '${c}'`).join(' ');
  const drifted = await exec(
    `select i.id,
            (select string_agg(key, ', ' order by key)
             from jsonb_each(to_jsonb(i) ${excluded}) e(key, value)
             where value is distinct from (to_jsonb(t) ${excluded}) -> e.key) as columns
     from jsonb_populate_recordset(null::public.tools, $1::text::jsonb) i
     join public.tools t on t.id = i.id
     where to_jsonb(i) ${excluded} is distinct from to_jsonb(t) ${excluded}`,
    [JSON.stringify(toolRows)]
  );
  for (const row of drifted) {
    problems.push({ kind: 'campo-discrepante', detail: `${row.id}: ${row.columns}` });
  }

  const stillPublished = await exec(
    `select t.id from public.tools t
     left join jsonb_populate_recordset(null::public.tools, $1::text::jsonb) i on i.id = t.id
     where i.id is null and t.status <> 'archived'`,
    [JSON.stringify(toolRows)]
  );
  for (const row of stillPublished) {
    problems.push({ kind: 'retirada-incompleta', detail: row.id });
  }

  return problems;
}

/**
 * Syncs and verifies inside a single transaction.
 *
 * The transaction is the point. Halfway through, the mirror holds categories
 * from the new catalogue and tools from the old one, and a foreign key that
 * happened to be valid before may not be now. Committing that state because
 * the connection dropped between two statements is how a database ends up in a
 * shape nobody designed. Verification runs *inside* the transaction too, so a
 * mirror that fails its own checks is never committed.
 */
export async function syncCatalog(exec, catalogue, { log = () => {} } = {}) {
  const { toolRows, categoryRows, unknownKeys, orphans } = catalogue;

  // Refused before touching the database: half-synced is worse than un-synced.
  if (unknownKeys.length) {
    throw new SyncError(
      `El catálogo trae claves que la tabla no tiene: ${unknownKeys.join(', ')}. ` +
        'Añade la columna o corrige el dato.'
    );
  }
  if (orphans.length) {
    throw new SyncError(
      `Herramientas apuntando a categorías inexistentes: ${orphans.join(', ')}.`
    );
  }
  if (!toolRows.length || !categoryRows.length) {
    throw new SyncError(
      'El catálogo llega vacío. Sincronizar con él archivaría todas las herramientas.'
    );
  }

  /*
   * A derived value written to a second place is a derived value that can
   * disagree with the first. `scoreTotal` is computed by `hydrateTool` from the
   * five components and must never reach the database — asserted here as well
   * as in the unit tests, because this is the last point before it would.
   */
  for (const row of toolRows) {
    if (row.scores && typeof row.scores === 'object' && 'scoreTotal' in row.scores) {
      throw new SyncError(
        `${row.id} lleva scoreTotal en scores. Es un valor derivado y no se espeja.`
      );
    }
  }

  await exec('begin');

  try {
    await upsert(exec, 'categories', categoryRows, 'slug');
    await upsert(exec, 'tools', toolRows, 'id');

    /*
     * Retirement, not deletion. See the header: a cascade here would destroy
     * favourites, lists and history because a row left a JSON file.
     */
    const retired = await exec(
      `update public.tools t set status = 'archived', updated_at = now()
       where not exists (
         select 1 from jsonb_populate_recordset(null::public.tools, $1::text::jsonb) i
         where i.id = t.id
       )
       and t.status <> 'archived'
       returning t.id`,
      [JSON.stringify(toolRows)]
    );

    const problems = await verifyMirror(exec, { toolRows, categoryRows });

    if (problems.length) {
      await exec('rollback');
      const lines = problems.map((p) => `  · ${p.kind}: ${p.detail}`).join('\n');
      throw new SyncError(
        `La verificación posterior ha encontrado ${problems.length} problema(s). ` +
          `No se ha confirmado nada:\n${lines}`
      );
    }

    /*
     * A category dropped from the taxonomy is reported, not removed. Nothing in
     * user data references a category, so a stale row is inert — and deleting
     * one that a tool still points at would fail anyway. Visible beats tidy.
     */
    const staleCategories = await exec(
      `select c.slug from public.categories c
       left join jsonb_populate_recordset(null::public.categories, $1::text::jsonb) i on i.slug = c.slug
       where i.slug is null`,
      [JSON.stringify(categoryRows)]
    );

    await exec('commit');

    const counts = await exec(
      `select
         (select count(*)::int from public.categories) as categories,
         (select count(*)::int from public.tools) as tools,
         (select count(*)::int from public.tools where status = 'archived') as archived`
    );

    const summary = {
      categories: counts[0].categories,
      tools: counts[0].tools,
      archived: counts[0].archived,
      retired: retired.map((r) => r.id),
      staleCategories: staleCategories.map((r) => r.slug),
    };

    log(`  categories   ${String(summary.categories).padStart(3)} filas ✓`);
    log(`  tools        ${String(summary.tools).padStart(3)} filas ✓`);
    if (summary.retired.length) {
      log(`  retiradas    ${summary.retired.length} archivadas: ${summary.retired.join(', ')}`);
    }
    if (summary.archived) {
      log(`  archivadas   ${summary.archived} en total (conservan id, FK y datos de usuario)`);
    }
    if (summary.staleCategories.length) {
      log(`  ⚠ categorías en la base que ya no están en el catálogo: ${summary.staleCategories.join(', ')}`);
    }
    log('  verificación posterior: sin discrepancias ✓');

    return summary;
  } catch (error) {
    // Nothing half-written survives, whatever went wrong.
    await exec('rollback').catch(() => {});
    throw error;
  }
}
