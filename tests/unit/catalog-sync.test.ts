import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSchema } from '../../scripts/pglite-schema.mjs';
import { syncCatalog, verifyMirror, SyncError } from '../../scripts/catalog-sync.mjs';
import { catalogRows } from '../../scripts/catalog-source.mjs';

/**
 * The catalogue sync, against a real PostgreSQL.
 *
 * PGlite is PostgreSQL compiled to WebAssembly, so foreign keys, triggers,
 * enums, check constraints and transactions behave exactly as they do on
 * Supabase. That matters here more than usual: every scenario below is about
 * what the *database* does — a cascade that would destroy user data, a
 * transaction that must not commit halfway, a constraint that must still hold
 * afterwards. None of it could be tested against a mock.
 *
 * The sync being driver-agnostic is what makes this possible. The same
 * `syncCatalog` that runs against Supabase runs here; there is no second
 * implementation to drift.
 */

type Row = Record<string, unknown>;
type Exec = (sql: string, params?: unknown[]) => Promise<Row[]>;

let db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Row[] }>; close: () => Promise<void> };
let exec: Exec;

beforeEach(async () => {
  // Only the core schema: the tables, constraints and triggers under test. The
  // RLS migrations add policies that say nothing about synchronising.
  ({ db } = await createSchema({ migrations: [
      'supabase/migrations/0001_core_schema.sql',
      // El enum free_model necesita 'unknown' para que una ficha pueda decir
      // que no se ha podido comprobar. Ver 0009.
      'supabase/migrations/0009_free_model_unknown.sql',
      'supabase/migrations/0010_capabilities_start_effort.sql',
    ] }));
  exec = async (sql, params = []) => (await db.query(sql, params)).rows;
});

afterEach(async () => {
  await db.close();
});

// --------------------------------------------------------------------------
// Small synthetic catalogues, so each scenario controls exactly one variable.
// --------------------------------------------------------------------------

const NOW = '2026-08-09T12:00:00.000Z';

function tool(slug: string, overrides: Row = {}): Row {
  return {
    id: `tool_${slug}`,
    slug,
    name: slug,
    tagline: '',
    description_short: '',
    description_long: '',
    kind: 'app',
    verification: 'verified',
    category_slug: 'imagen',
    secondary_categories: [],
    tags: [],
    use_cases: [],
    free_model: 'free_real',
    free_plan: { summary: 'gratis', verifiedAt: '2026-08-09' },
    open_source: 'unverified',
    hosting: 'cloud',
    platforms: [],
    languages: [],
    skill_level: 'beginner',
    capabilities: [],
    start_effort: 'signup',
    privacy: {},
    official_url: `https://${slug}.example`,
    sources: [],
    scores: { freeReal: 5, usefulness: 5, ease: 5, transparency: 5, creatorValue: 5 },
    verdict: '',
    pros: [],
    cons: [],
    best_for: [],
    not_for: [],
    alternatives: [],
    alternative_names: [],
    changelog: [],
    affiliation: { isAffiliate: false },
    sponsorship: { isSponsored: false },
    status: 'published',
    detected_at: '2026-08-01',
    last_verified_at: '2026-08-09',
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function category(slug: string): Row {
  return { slug, name: slug, intro: '', icon: 'model', position: 0, created_at: NOW };
}

function catalogue(tools: Row[], categories: Row[] = [category('imagen')]) {
  return { toolRows: tools, categoryRows: categories, unknownKeys: [], orphans: [] };
}

/** A user who has favourited something, so retirement has data to protect. */
async function seedUserWithFavourite(toolId: string): Promise<string> {
  const id = '11111111-2222-3333-4444-555555555555';
  await exec(`insert into auth.users (id, email) values ($1, 'alguien@ejemplo.test')`, [id]);
  await exec(`insert into public.profiles (id) values ($1)`, [id]);
  await exec(`insert into public.user_favorites (user_id, tool_id) values ($1, $2)`, [id, toolId]);
  return id;
}

/**
 * The single row a query was supposed to return.
 *
 * Written as a check rather than a `!` because "the row is missing" is a real
 * outcome these tests need to catch — silencing it to satisfy the compiler
 * would turn the most interesting failure into a confusing one.
 */
async function one(sql: string, params: unknown[] = []): Promise<Row> {
  const [row] = await exec(sql, params);
  if (!row) throw new Error(`La consulta no devolvió ninguna fila: ${sql}`);
  return row;
}

const count = async (table: string): Promise<number> =>
  Number((await one(`select count(*)::int as n from public.${table}`)).n);

/** Everything that must not change between two identical syncs. */
async function snapshot(): Promise<string> {
  const rows = await exec(
    `select id, to_jsonb(t) - 'updated_at' as row from public.tools t order by id`
  );
  const cats = await exec(`select to_jsonb(c) as row from public.categories c order by slug`);
  return JSON.stringify({ tools: rows, categories: cats });
}

// --------------------------------------------------------------------------

describe('1 · primera sincronización', () => {
  it('el catálogo real entra entero y se verifica solo', async () => {
    const real = await catalogRows();
    const summary = await syncCatalog(exec, real);

    expect(summary.tools).toBe(real.toolRows.length);
    expect(summary.categories).toBe(real.categoryRows.length);
    expect(summary.archived).toBe(0);
    expect(await verifyMirror(exec, real)).toEqual([]);
  });

  it('parte de una base vacía: nada se da por hecho', async () => {
    expect(await count('tools')).toBe(0);
    expect(await count('categories')).toBe(0);
  });
});

describe('2 · segunda sincronización idéntica', () => {
  it('deja exactamente el mismo estado', async () => {
    const real = await catalogRows();
    await syncCatalog(exec, real);
    const before = await snapshot();

    await syncCatalog(exec, real);
    const after = await snapshot();

    expect(after).toBe(before);
  });

  it('no inserta ni archiva nada la segunda vez', async () => {
    const real = await catalogRows();
    await syncCatalog(exec, real);
    const second = await syncCatalog(exec, real);

    expect(second.tools).toBe(real.toolRows.length);
    expect(second.retired).toEqual([]);
    expect(second.archived).toBe(0);
  });
});

describe('3 · herramienta nueva', () => {
  it('aparece en el espejo sin tocar a las demás', async () => {
    await syncCatalog(exec, catalogue([tool('uno'), tool('dos')]));
    const before = await exec(`select id from public.tools where id = 'tool_uno'`);

    const summary = await syncCatalog(exec, catalogue([tool('uno'), tool('dos'), tool('tres')]));

    expect(summary.tools).toBe(3);
    expect(summary.retired).toEqual([]);
    expect(await exec(`select id from public.tools where id = 'tool_tres'`)).toHaveLength(1);
    expect(await exec(`select id from public.tools where id = 'tool_uno'`)).toEqual(before);
  });

  it('una herramienta nueva no puede quedarse sin espejo: la verificación lo exige', async () => {
    await syncCatalog(exec, catalogue([tool('uno')]));

    // The mirror is now one tool behind the catalogue, which is exactly the
    // state that broke favourites in staging.
    const problems = await verifyMirror(exec, catalogue([tool('uno'), tool('dos')]));
    expect(problems).toContainEqual({ kind: 'herramienta-ausente', detail: 'tool_dos' });
  });
});

describe('4 · categoría nueva', () => {
  it('se inserta antes que las herramientas que la usan', async () => {
    const summary = await syncCatalog(
      exec,
      catalogue([tool('uno'), tool('dos', { category_slug: 'video' })], [category('imagen'), category('video')])
    );

    expect(summary.categories).toBe(2);
    expect(await exec(`select slug from public.categories where slug = 'video'`)).toHaveLength(1);
  });

  it('una categoría que falta se detecta como tal', async () => {
    await syncCatalog(exec, catalogue([tool('uno')]));
    const problems = await verifyMirror(exec, catalogue([tool('uno')], [category('imagen'), category('video')]));
    expect(problems).toContainEqual({ kind: 'categoria-ausente', detail: 'video' });
  });
});

describe('5 · herramienta retirada con favoritos existentes', () => {
  it('se archiva, no se borra, y el favorito sobrevive', async () => {
    await syncCatalog(exec, catalogue([tool('uno'), tool('dos')]));
    await seedUserWithFavourite('tool_dos');

    const summary = await syncCatalog(exec, catalogue([tool('uno')]));

    expect(summary.retired).toEqual(['tool_dos']);

    // The row is still there, with its identity intact.
    const retired = await one(`select id, slug, status from public.tools where id = 'tool_dos'`);
    expect(retired.status).toBe('archived');
    expect(retired.slug).toBe('dos');

    // And so is the person's favourite.
    expect(await count('user_favorites')).toBe(1);
    const fav = await one(`select tool_id from public.user_favorites`);
    expect(fav.tool_id).toBe('tool_dos');
  });

  it('la clave foránea sigue siendo válida después de retirar', async () => {
    await syncCatalog(exec, catalogue([tool('uno'), tool('dos')]));
    await seedUserWithFavourite('tool_dos');
    await syncCatalog(exec, catalogue([tool('uno')]));

    expect(await verifyMirror(exec, catalogue([tool('uno')]))).toEqual([]);
  });

  it('si la herramienta vuelve al catálogo, vuelve a publicarse con su favorito', async () => {
    await syncCatalog(exec, catalogue([tool('uno'), tool('dos')]));
    await seedUserWithFavourite('tool_dos');
    await syncCatalog(exec, catalogue([tool('uno')]));

    await syncCatalog(exec, catalogue([tool('uno'), tool('dos')]));

    const back = await one(`select status from public.tools where id = 'tool_dos'`);
    expect(back.status).toBe('published');
    expect(await count('user_favorites')).toBe(1);
  });

  it('retirar deja de estar pendiente: una segunda pasada no la reporta otra vez', async () => {
    await syncCatalog(exec, catalogue([tool('uno'), tool('dos')]));
    await syncCatalog(exec, catalogue([tool('uno')]));
    const again = await syncCatalog(exec, catalogue([tool('uno')]));

    expect(again.retired).toEqual([]);
    expect(again.archived).toBe(1);
  });
});

describe('6 · catálogo incompleto', () => {
  it('un catálogo vacío se rechaza antes de tocar la base', async () => {
    await syncCatalog(exec, catalogue([tool('uno'), tool('dos')]));

    await expect(syncCatalog(exec, catalogue([], []))).rejects.toThrow(SyncError);

    // Nothing archived, nothing lost: an empty catalogue is a broken build, not
    // an instruction to retire the entire site.
    expect(await count('tools')).toBe(2);
    const archived = await one(`select count(*)::int as n from public.tools where status = 'archived'`);
    expect(Number(archived.n)).toBe(0);
  });

  it('una clave que la tabla no tiene detiene la sincronización', async () => {
    const bad = { ...catalogue([tool('uno')]), unknownKeys: ['inventado'] };
    await expect(syncCatalog(exec, bad)).rejects.toThrow(/claves que la tabla no tiene/);
  });

  it('una herramienta apuntando a una categoría inexistente se rechaza', async () => {
    const bad = { ...catalogue([tool('uno')]), orphans: ['fantasma'] };
    await expect(syncCatalog(exec, bad)).rejects.toThrow(/categorías inexistentes/);
  });

  it('scoreTotal nunca llega a la base de datos', async () => {
    const derived = tool('uno', {
      scores: { freeReal: 5, usefulness: 5, ease: 5, transparency: 5, creatorValue: 5, scoreTotal: 25 },
    });
    await expect(syncCatalog(exec, catalogue([derived]))).rejects.toThrow(/scoreTotal/);
    expect(await count('tools')).toBe(0);
  });
});

describe('7 · FK rota', () => {
  /*
   * The constraint normally makes this state impossible, which is the point:
   * dropping it reproduces schema drift — a database where the guarantee was
   * never applied — and proves the check would catch it rather than trusting
   * the constraint to have been there all along.
   */
  it('datos de usuario apuntando a una herramienta inexistente se detectan', async () => {
    await syncCatalog(exec, catalogue([tool('uno')]));
    const user = await seedUserWithFavourite('tool_uno');

    await exec('alter table public.user_favorites drop constraint user_favorites_tool_id_fkey');
    await exec(`insert into public.user_favorites (user_id, tool_id) values ($1, 'tool_fantasma')`, [user]);

    const problems = await verifyMirror(exec, catalogue([tool('uno')]));
    expect(problems).toContainEqual({
      kind: 'fk-usuario-rota',
      detail: 'user_favorites: 1 fila(s) apuntando a tool_fantasma',
    });
  });

  it('una herramienta apuntando a una categoría inexistente se detecta', async () => {
    await syncCatalog(exec, catalogue([tool('uno')]));

    await exec('alter table public.tools drop constraint tools_category_slug_fkey');
    await exec(`update public.tools set category_slug = 'fantasma' where id = 'tool_uno'`);

    const problems = await verifyMirror(exec, catalogue([tool('uno')]));
    expect(problems).toContainEqual({ kind: 'fk-categoria-rota', detail: 'tool_uno → fantasma' });
  });

  it('un id que no es tool_<slug> se detecta: rompería cada favorito', async () => {
    await syncCatalog(exec, catalogue([tool('uno')]));
    await exec(`update public.tools set id = 'otra-cosa' where id = 'tool_uno'`);

    const problems = await verifyMirror(exec, catalogue([tool('uno')]));
    expect(problems).toContainEqual({
      kind: 'id-no-resoluble',
      detail: 'otra-cosa (slug uno)',
    });
  });

  it('un campo espejado que discrepa se detecta y se nombra', async () => {
    await syncCatalog(exec, catalogue([tool('uno')]));
    await exec(`update public.tools set verdict = 'alguien lo cambió a mano' where id = 'tool_uno'`);

    const problems = await verifyMirror(exec, catalogue([tool('uno')]));
    expect(problems).toContainEqual({ kind: 'campo-discrepante', detail: 'tool_uno: verdict' });
  });

  it('la sincronización FALLA si la verificación encuentra algo', async () => {
    await syncCatalog(exec, catalogue([tool('uno')]));

    // A tool the sync will not write, left behind as if a previous run had
    // half-finished: it is neither in the catalogue nor archived.
    await exec(
      `insert into public.tools (id, slug, name, category_slug, free_model, free_plan, official_url, scores, status)
       values ('tool_huerfana', 'huerfana', 'x', 'imagen', 'free_real', '{}'::jsonb,
               'https://x.example', '{}'::jsonb, 'published')`
    );

    // The sync archives it, which is the correct outcome — so verification
    // passes and the row survives with its identity.
    const summary = await syncCatalog(exec, catalogue([tool('uno')]));
    expect(summary.retired).toEqual(['tool_huerfana']);
    expect(await verifyMirror(exec, catalogue([tool('uno')]))).toEqual([]);
  });
});

describe('8 · fallo a mitad de sincronización', () => {
  it('una caída entre las categorías y las herramientas no deja nada escrito', async () => {
    let calls = 0;
    const flaky: Exec = async (sql, params = []) => {
      // Fails once the categories are in and the tools are going in: the exact
      // moment where a half-written mirror would have inconsistent foreign keys.
      if (/insert into public\.tools/.test(sql)) {
        calls += 1;
        throw new Error('la conexión se cayó');
      }
      return exec(sql, params);
    };

    await expect(
      syncCatalog(flaky, catalogue([tool('uno')], [category('imagen'), category('video')]))
    ).rejects.toThrow(/la conexión se cayó/);

    expect(calls).toBe(1);
    expect(await count('categories')).toBe(0);
    expect(await count('tools')).toBe(0);
  });

  it('un fallo después de una sincronización buena conserva la anterior, no la mezcla', async () => {
    await syncCatalog(exec, catalogue([tool('uno')]));
    const before = await snapshot();

    const flaky: Exec = async (sql, params = []) => {
      if (/insert into public\.tools/.test(sql)) throw new Error('la conexión se cayó');
      return exec(sql, params);
    };

    await expect(
      syncCatalog(flaky, catalogue([tool('uno'), tool('dos')], [category('imagen'), category('video')]))
    ).rejects.toThrow();

    expect(await snapshot()).toBe(before);
    expect(await count('categories')).toBe(1);
  });

  it('si la verificación falla, no se confirma nada', async () => {
    await syncCatalog(exec, catalogue([tool('uno')]));
    const before = await snapshot();

    /*
     * The verification is made to fail by breaking a foreign key the sync does
     * not touch, so the failure comes from the check rather than from the write
     * — and the rollback has to undo work that had already succeeded.
     */
    await exec('alter table public.user_favorites drop constraint user_favorites_tool_id_fkey');
    const user = await seedUserWithFavourite('tool_uno');
    await exec(`insert into public.user_favorites (user_id, tool_id) values ($1, 'tool_fantasma')`, [user]);

    await expect(
      syncCatalog(exec, catalogue([tool('uno'), tool('dos')]))
    ).rejects.toThrow(/verificación posterior/);

    expect(await snapshot()).toBe(before);
    expect(await exec(`select id from public.tools where id = 'tool_dos'`)).toHaveLength(0);
  });
});
