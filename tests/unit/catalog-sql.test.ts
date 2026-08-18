import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSchema } from '../../scripts/pglite-schema.mjs';
import { emitSql } from '../../scripts/emit-catalog-sql.mjs';
import { syncCatalog, verifyMirror } from '../../scripts/catalog-sync.mjs';
import { catalogRows } from '../../scripts/catalog-source.mjs';

/**
 * The SQL that seeds production, applied to a real PostgreSQL.
 *
 * Production is the one database no script here may connect to, so its content
 * mirror arrives as a file pasted into the SQL Editor. That file therefore has
 * to be right the first time, against a database nobody can experiment on —
 * which is only possible if it has already been applied somewhere identical.
 *
 * These tests are that somewhere. The bar is not "it runs": it is that the
 * result is indistinguishable from what `syncCatalog` produces, because the two
 * are meant to be the same operation by different means.
 */

type Row = Record<string, unknown>;

let db: {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Row[] }>;
  exec: (sql: string) => Promise<unknown>;
  close: () => Promise<void>;
};
let exec: (sql: string, params?: unknown[]) => Promise<Row[]>;
/*
 * Lo que cuesta arrancar PostgreSQL, medido y no supuesto.
 *
 * Cada prueba de este fichero levanta una base de datos entera: PGlite compila
 * PostgreSQL 18 a WebAssembly y aplica las migraciones desde cero, y eso es
 * justo lo que la hace fiable — ninguna prueba hereda el estado de la anterior.
 * También es lo que hace que los presupuestos por defecto de Vitest, pensados
 * para funciones de JavaScript, se queden cortos: 5 s por prueba y 10 s por
 * hook. En una máquina ocupada el arranque se va por encima y el fallo dice
 * «timeout», que no señala nada.
 *
 * No es un margen para tapar lentitud: 30 s siguen siendo diez veces lo que
 * tarda una de estas pruebas cuando la máquina está libre, así que una
 * regresión de verdad en el esquema o en la sincronización seguiría saliendo
 * roja.
 */
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });


beforeEach(async () => {
  ({ db } = await createSchema({ migrations: [
      'supabase/migrations/0001_core_schema.sql',
      // El enum free_model necesita 'unknown' para que una ficha pueda decir
      // que no se ha podido comprobar. Ver 0009.
      'supabase/migrations/0009_free_model_unknown.sql',
      'supabase/migrations/0010_capabilities_start_effort.sql',
      'supabase/migrations/0011_start_effort_reason.sql',
      'supabase/migrations/0012_licence_layers.sql',
    ] }));
  exec = async (sql, params = []) => (await db.query(sql, params)).rows;
});

afterEach(async () => {
  await db.close();
});

/** The mirror, in a form two different code paths can be compared on. */
async function mirror(): Promise<string> {
  const tools = await exec(
    `select to_jsonb(t) - 'created_at' - 'updated_at' as row
     from public.tools t order by id`
  );
  const categories = await exec(
    `select to_jsonb(c) - 'created_at' as row from public.categories c order by slug`
  );
  return JSON.stringify({ tools, categories });
}

describe('el fichero versionado', () => {
  /*
   * `supabase/seed/catalog.sql` is committed because production is seeded by
   * pasting it into a SQL Editor, and whoever does that may not have a dev
   * environment to regenerate it from. A generated file in git drifts silently,
   * so the drift is a test failure instead.
   */
  it('está al día con el catálogo', async () => {
    const path = join(process.cwd(), 'supabase/seed/catalog.sql');
    const committed = readFileSync(path, 'utf8');
    const regenerated = emitSql(await catalogRows());

    expect(
      committed,
      'supabase/seed/catalog.sql no coincide con el catálogo. Ejecuta: npm run data:catalog-sql'
    ).toBe(regenerated);
  });
});

describe('la semilla SQL de producción', () => {
  it('se aplica sin error sobre un esquema recién migrado', async () => {
    const catalogue = await catalogRows();
    await db.exec(emitSql(catalogue));

    const [row] = await exec(`select count(*)::int as n from public.tools`);
    expect(Number(row?.n)).toBe(catalogue.toolRows.length);
  });

  it('deja el espejo idéntico al que produce la sincronización', async () => {
    const catalogue = await catalogRows();

    // The SQL path.
    await db.exec(emitSql(catalogue));
    const fromSql = await mirror();

    // The live path, on a database of its own.
    const { db: other } = await createSchema({
      migrations: [
      'supabase/migrations/0001_core_schema.sql',
      // El enum free_model necesita 'unknown' para que una ficha pueda decir
      // que no se ha podido comprobar. Ver 0009.
      'supabase/migrations/0009_free_model_unknown.sql',
      'supabase/migrations/0010_capabilities_start_effort.sql',
      'supabase/migrations/0011_start_effort_reason.sql',
      'supabase/migrations/0012_licence_layers.sql',
    ],
    });
    const otherExec = async (sql: string, params: unknown[] = []) =>
      (await other.query(sql, params)).rows;
    await syncCatalog(otherExec, catalogue);
    const fromSync = await otherExec(
      `select to_jsonb(t) - 'created_at' - 'updated_at' as row
       from public.tools t order by id`
    );
    const otherCategories = await otherExec(
      `select to_jsonb(c) - 'created_at' as row from public.categories c order by slug`
    );
    await other.close();

    expect(fromSql).toBe(JSON.stringify({ tools: fromSync, categories: otherCategories }));
  });

  it('pasa la misma verificación que exige la sincronización', async () => {
    const catalogue = await catalogRows();
    await db.exec(emitSql(catalogue));

    expect(await verifyMirror(exec, catalogue)).toEqual([]);
  });

  it('es idempotente: aplicarla dos veces deja el mismo estado', async () => {
    const catalogue = await catalogRows();
    const sql = emitSql(catalogue);

    await db.exec(sql);
    const first = await mirror();

    await db.exec(sql);
    expect(await mirror()).toBe(first);
  });

  it('archiva lo que ya no está en el catálogo, sin borrarlo', async () => {
    const catalogue = await catalogRows();
    await db.exec(emitSql(catalogue));

    // A tool that predates the catalogue, as a retired entry would be.
    await exec(
      `insert into public.tools (id, slug, name, category_slug, free_model, free_plan,
         official_url, scores, status)
       values ('tool_retirada', 'retirada', 'x', (select slug from public.categories limit 1),
         'free_real', '{}'::jsonb, 'https://x.example', '{}'::jsonb, 'published')`
    );

    await db.exec(emitSql(catalogue));

    const [row] = await exec(`select status from public.tools where id = 'tool_retirada'`);
    expect(row?.status).toBe('archived');
  });

  it('la comprobación incrustada aborta si el espejo queda mal', async () => {
    const catalogue = await catalogRows();

    /*
     * The point of the `do $verify$` block at the end of the file: the person
     * pasting this into a production SQL Editor gets a raised exception instead
     * of a quiet, wrong result. Removing one tool from the input makes the
     * count disagree with what the block asserts.
     */
    const sql = emitSql(catalogue).replace(
      `if n_herramientas <> ${catalogue.toolRows.length} then`,
      `if n_herramientas <> ${catalogue.toolRows.length + 1} then`
    );

    await expect(db.exec(sql)).rejects.toThrow(/Herramientas activas/);

    /*
     * The raise aborts the transaction but does not close it, so the session
     * stays in the aborted state until something ends it — every later
     * statement answers `current transaction is aborted`. Supabase's SQL Editor
     * ends the transaction for you between executions; here it has to be
     * explicit, and doing it is also what proves the rollback was real.
     */
    await db.exec('rollback');
    expect(Number((await exec(`select count(*)::int as n from public.tools`))[0]?.n)).toBe(0);
  });

  it('una comilla en el contenido editorial no rompe el fichero', async () => {
    const catalogue = await catalogRows();
    const [first] = catalogue.toolRows;
    const hostile = {
      ...catalogue,
      toolRows: [
        { ...first, verdict: "no es 'gratis'; es --gratis, y $$así$$ lo decimos" },
        ...catalogue.toolRows.slice(1),
      ],
    };

    await db.exec(emitSql(hostile));

    const [row] = await exec(`select verdict from public.tools where id = $1`, [first?.id]);
    expect(row?.verdict).toBe("no es 'gratis'; es --gratis, y $$así$$ lo decimos");
  });
});
