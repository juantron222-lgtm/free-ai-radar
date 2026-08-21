#!/usr/bin/env node
/**
 * Emits the catalogue as SQL that can be pasted into a Supabase SQL Editor.
 *
 * This is how the content mirror reaches **production**, where no script of
 * this repository is allowed to connect. `staging-guard.mjs` demands
 * `SUPABASE_ENV === "staging"` and a matching project ref before anything opens
 * a connection, so there is deliberately no code path from here to production —
 * and a runner written today would be untested code making its debut against
 * the one database that matters.
 *
 * A file of SQL has none of that problem. No credential leaves the dashboard,
 * every statement is visible before it runs, and the output can be checked
 * against a real PostgreSQL first — which is what `tests/unit/catalog-sql.test.ts`
 * does.
 *
 * It replaces the `--emit-sql` mode of `migrate-tools.mjs`, which read the
 * *legacy* dataset: it emitted 22 tools when the catalogue had 24, and no
 * categories at all — and categories are the parent foreign key, so the result
 * could not have been applied even if the count had been right.
 *
 *   node scripts/emit-catalog-sql.mjs            escribe supabase/seed/catalog.sql
 *   node scripts/emit-catalog-sql.mjs --stdout   lo imprime
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogRows } from './catalog-source.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'supabase/seed/catalog.sql');
const TO_STDOUT = process.argv.includes('--stdout');

/**
 * A Postgres string literal.
 *
 * Doubling the quote is the whole escape rule for a standard string, and
 * `standard_conforming_strings` has been on by default since PostgreSQL 9.1, so
 * a backslash is an ordinary character and needs nothing. The values here come
 * from a committed dataset rather than from user input, but the reason to get
 * this right is that the output is pasted into a SQL editor by a person, and a
 * quote in an editorial verdict should not be able to end a statement.
 */
function literal(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** A value in the shape `jsonb_populate_recordset` will accept. */
function jsonLiteral(value) {
  return literal(JSON.stringify(value));
}

export function emitSql({ toolRows, categoryRows }) {
  const lines = [];

  lines.push('-- Espejo de contenido de Free AI Radar.');
  lines.push('--');
  lines.push('-- Generado por scripts/emit-catalog-sql.mjs desde el catálogo del');
  lines.push('-- repositorio. No lo edites a mano: se regenera.');
  lines.push('--');
  lines.push('-- Es idempotente: ejecutarlo dos veces deja el mismo estado.');
  lines.push('-- Las categorías van primero porque tools.category_slug las referencia.');
  lines.push('--');
  lines.push(`-- ${categoryRows.length} categorías · ${toolRows.length} herramientas`);
  lines.push('');
  lines.push('begin;');
  lines.push('');

  /*
   * One statement per table, feeding whole rows through
   * `jsonb_populate_recordset` — the same mechanism the live sync uses. Writing
   * out column lists instead would mean this file and the sync could disagree
   * about which columns exist, which is exactly the drift that made the old
   * generator emit an unusable seed.
   */
  const table = (name, rows, key, skip) => {
    /*
     * The database's own columns are stripped from the payload and put back by
     * the statement, with `now()`, at the moment it runs.
     *
     * Two reasons, and the second is the one that bit. Semantically,
     * `created_at` means "when this row appeared in *this* database", not "when
     * somebody last ran the generator" — pasting a file from last week should
     * not claim the rows are a week old. And practically, a timestamp baked into
     * the output makes the file different on every generation: it can never be
     * compared against the committed copy, so the check that it is up to date
     * cannot exist. The check is the reason it is committed at all.
     */
    const owned = ['created_at', 'updated_at'].filter((c) => c in rows[0]);
    const payload = rows.map((row) => {
      const copy = { ...row };
      for (const column of owned) delete copy[column];
      return copy;
    });

    const injected = owned.map((c) => `'${c}', now()`).join(', ');

    lines.push(`-- ${name}`);
    lines.push(`insert into public.${name}`);
    lines.push(`select * from jsonb_populate_recordset(null::public.${name}, (`);
    lines.push(`  select jsonb_agg(fila || jsonb_build_object(${injected}))`);
    lines.push(`  from jsonb_array_elements(`);
    lines.push(`    ${jsonLiteral(payload)}::jsonb) fila))`);
    lines.push(`on conflict (${key}) do update set`);

    /*
     * La unión de las claves de todas las filas, no las de la primera.
     *
     * `product_type` sólo lo llevan las fichas de /codigo, y la primera del
     * catálogo por orden alfabético es Adobe Firefly, que no lo tiene. Con
     * `Object.keys(rows[0])` la columna se caía de la lista de actualización:
     * la semilla insertaba bien una ficha nueva y, al reaplicarla sobre una que
     * ya existía, dejaba el valor viejo sin tocar. Un fallo que no rompe nada y
     * sólo se ve comparando dos espejos.
     */
    const columns = [...new Set(rows.flatMap((fila) => Object.keys(fila)))].filter(
      (c) => !skip.includes(c)
    );
    lines.push(
      columns.map((c) => `  "${c}" = excluded."${c}"`).join(',\n')
    );
    lines.push(';');
    lines.push('');
  };

  // `created_at` and `updated_at` belong to the database: the first records when
  // the row appeared, and a trigger owns the second. See scripts/catalog-sync.mjs.
  table('categories', categoryRows, 'slug', ['slug', 'created_at', 'updated_at']);
  table('tools', toolRows, 'id', ['id', 'slug', 'created_at', 'updated_at']);

  /*
   * Retirement, matching the live sync exactly: a tool that left the catalogue
   * is archived, never deleted. A `delete` here would cascade into favourites,
   * lists, history and alerts.
   */
  lines.push('-- Herramientas que ya no están en el catálogo: se archivan, no se borran.');
  lines.push('-- Conservan id y claves foráneas, así que los datos de usuario sobreviven.');
  lines.push("update public.tools set status = 'archived', updated_at = now()");
  lines.push('where id <> all (array[');
  lines.push(`  ${toolRows.map((r) => literal(r.id)).join(',\n  ')}`);
  lines.push('])');
  lines.push("and status <> 'archived';");
  lines.push('');

  lines.push('-- Comprobación: aborta si el resultado no es el esperado.');
  lines.push('do $verify$');
  lines.push('declare');
  lines.push('  n_categorias int;');
  lines.push('  n_herramientas int;');
  lines.push('  n_ids_malos int;');
  lines.push('begin');
  lines.push('  select count(*) into n_categorias from public.categories;');
  lines.push("  select count(*) into n_herramientas from public.tools where status <> 'archived';");
  lines.push("  select count(*) into n_ids_malos from public.tools where id <> 'tool_' || slug;");
  lines.push('');
  lines.push(`  if n_categorias < ${categoryRows.length} then`);
  lines.push(`    raise exception 'Faltan categorías: hay %, se esperaban al menos ${categoryRows.length}', n_categorias;`);
  lines.push('  end if;');
  lines.push(`  if n_herramientas <> ${toolRows.length} then`);
  lines.push(`    raise exception 'Herramientas activas: hay %, se esperaban ${toolRows.length}', n_herramientas;`);
  lines.push('  end if;');
  lines.push('  if n_ids_malos > 0 then');
  lines.push("    raise exception 'Hay % ids que no son tool_<slug>: ningún favorito funcionaría', n_ids_malos;");
  lines.push('  end if;');
  lines.push('');
  lines.push("  raise notice 'Espejo verificado: % categorías, % herramientas activas', n_categorias, n_herramientas;");
  lines.push('end');
  lines.push('$verify$;');
  lines.push('');
  lines.push('commit;');
  lines.push('');

  return lines.join('\n');
}

const sql = emitSql(await catalogRows());

if (TO_STDOUT) {
  process.stdout.write(sql);
} else {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, sql, 'utf8');
  const { toolRows, categoryRows } = await catalogRows();
  console.log(`\nEscrito supabase/seed/catalog.sql`);
  console.log(`  ${categoryRows.length} categorías · ${toolRows.length} herramientas`);
  console.log(`  ${Math.round(sql.length / 1024)} KB\n`);
}
