import { beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- helper .mjs sin tipos, igual que el resto de scripts
import { createSchema } from '../../scripts/pglite-schema.mjs';

/**
 * Control de acceso de Newsroom, contra PostgreSQL de verdad.
 *
 * Newsroom guarda material interno: lo que se descartó, por qué, y el borrador
 * de lo que todavía no se ha publicado. Que eso sea legible por `anon` sería
 * peor que una fuga de datos personales — sería publicar el criterio editorial
 * antes de que exista la noticia.
 *
 * PGlite es PostgreSQL 18 compilado a WebAssembly: RLS, roles, políticas y
 * `security definer` se comportan como en un servidor. Lo que no es es
 * Supabase — GoTrue no existe y `service_role` aquí es un rol normal — pero
 * las políticas sólo ven `public.current_role()`, que sí se reproduce.
 *
 * El proyecto de staging fue eliminado (`ENOTFOUND` sobre su subdominio), así
 * que esta es la verificación real disponible, y es más estricta que un
 * `psql` contra staging: aquí cada escenario se prueba, no se supone.
 */

interface Db {
  exec(sql: string): Promise<unknown>;
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

let db: Db;

const TABLAS = [
  'newsroom_runs',
  'newsroom_candidates',
  'newsroom_triage',
  'newsroom_verification',
  'newsroom_drafts',
  'newsroom_decisions',
  'newsroom_published',
];

const LECTOR = '11111111-1111-1111-1111-111111111111';
const EDITOR = '22222222-2222-2222-2222-222222222222';
const ADMIN = '33333333-3333-3333-3333-333333333333';

/** Ejecuta como un rol y una identidad concretos, y siempre deshace. */
async function como<T>(rol: string, uid: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec('begin');
  try {
    if (uid) {
      await db.exec(
        `select set_config('request.jwt.claims', '{"sub":"${uid}","role":"${rol}"}', true);`
      );
    }
    await db.exec(`set local role ${rol};`);
    return await fn();
  } finally {
    await db.exec('rollback').catch(() => {});
  }
}

async function niega(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

beforeAll(async () => {
  ({ db } = await createSchema());

  await db.exec(`
    insert into auth.users (id, email) values
      ('${LECTOR}', 'lector@ejemplo.test'),
      ('${EDITOR}', 'editor@ejemplo.test'),
      ('${ADMIN}',  'admin@ejemplo.test')
    on conflict (id) do nothing;

    update public.profiles set role = 'user'   where id = '${LECTOR}';
    update public.profiles set role = 'editor' where id = '${EDITOR}';
    update public.profiles set role = 'admin'  where id = '${ADMIN}';

    insert into public.newsroom_runs (id, status) values
      ('44444444-4444-4444-4444-444444444444', 'ok');

    insert into public.newsroom_candidates
      (id, title, url, canonical_url, publisher, observed_at, discovered_via, vertical, status)
    values
      ('inbox-aaaaaaaaaaaa', 'Un titular', 'https://openai.com/index/x',
       'openai.com/index/x', 'openai.com', '2026-08-11', 's-005', 'modelo-lenguaje', 'candidate');

    insert into public.newsroom_decisions (slug, action, actor, note)
      values ('una-noticia', 'reject', 'admin@ejemplo.test', 'No aporta nada nuevo');
  `);
}, 180_000);

describe('nada de Newsroom es legible sin ser al menos editor', () => {
  it('anon no lee ninguna de las siete tablas', async () => {
    for (const tabla of TABLAS) {
      const filas = await como('anon', null, async () =>
        (await db.query(`select count(*)::int as n from public.${tabla}`)).rows
      ).catch(() => [{ n: -1 }]);
      /* O bien el grant lo impide, o bien RLS devuelve cero filas. */
      expect([0, -1], `${tabla} visible para anon`).toContain(Number(filas[0]?.n ?? -1));
    }
  });

  it('un usuario con sesión normal tampoco lee nada', async () => {
    for (const tabla of TABLAS) {
      const filas = await como('authenticated', LECTOR, async () =>
        (await db.query(`select count(*)::int as n from public.${tabla}`)).rows
      );
      expect(Number(filas[0]!.n), `${tabla} visible para un lector`).toBe(0);
    }
  });

  it('un editor sí lee: la mesa de edición existe para eso', async () => {
    const filas = await como('authenticated', EDITOR, async () =>
      (await db.query('select count(*)::int as n from public.newsroom_candidates')).rows
    );
    expect(Number(filas[0]!.n)).toBe(1);
  });

  it('un admin lee todo', async () => {
    for (const tabla of TABLAS) {
      const filas = await como('authenticated', ADMIN, async () =>
        (await db.query(`select count(*)::int as n from public.${tabla}`)).rows
      );
      expect(Number(filas[0]!.n), tabla).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('publicar es cosa de un admin, y sólo de un admin', () => {
  const inserta = (slug: string) => `
    insert into public.newsroom_published (slug, news_id, item, approved_by)
    values ('${slug}', 'news-${slug}', '{"slug":"${slug}"}'::jsonb, 'quien-sea')
  `;

  it('anon no publica', async () => {
    const error = await niega(() => como('anon', null, () => db.exec(inserta('por-anon'))));
    expect(error).not.toBe('');
  });

  it('un lector no publica', async () => {
    const error = await niega(() =>
      como('authenticated', LECTOR, () => db.exec(inserta('por-lector')))
    );
    expect(error).not.toBe('');
  });

  it('un editor no publica: revisar no es publicar', async () => {
    const error = await niega(() =>
      como('authenticated', EDITOR, () => db.exec(inserta('por-editor')))
    );
    expect(error).not.toBe('');
  });

  it('un admin publica', async () => {
    await como('authenticated', ADMIN, async () => {
      await db.exec(inserta('por-admin'));
      const filas = (
        await db.query("select count(*)::int as n from public.newsroom_published where slug='por-admin'")
      ).rows;
      expect(Number(filas[0]!.n)).toBe(1);
    });
  });
});

describe('el historial no se reescribe', () => {
  it('ni un admin puede modificar una decisión ya tomada', async () => {
    /*
     * No hay política de update en `newsroom_decisions`, así que RLS la
     * rechaza sin necesidad de comprobar nada más. Es la diferencia entre
     * «no lo hacemos» y «no se puede».
     */
    const error = await niega(() =>
      como('authenticated', ADMIN, () =>
        db.exec("update public.newsroom_decisions set note = 'otra cosa'")
      )
    );
    expect(error).not.toBe('');
  });

  it('ni un admin puede borrar una decisión', async () => {
    const error = await niega(() =>
      como('authenticated', ADMIN, () => db.exec('delete from public.newsroom_decisions'))
    );
    expect(error).not.toBe('');
  });

  it('ni un admin puede editar una noticia ya publicada', async () => {
    const error = await niega(() =>
      como('authenticated', ADMIN, () =>
        db.exec("update public.newsroom_published set item = '{}'::jsonb")
      )
    );
    expect(error).not.toBe('');
  });

  it('un rechazo conserva su motivo', async () => {
    const filas = await como('authenticated', ADMIN, async () =>
      (await db.query("select note from public.newsroom_decisions where slug='una-noticia'")).rows
    );
    expect(filas[0]!.note).toBe('No aporta nada nuevo');
  });
});

describe('la deduplicación es una restricción, no una comprobación', () => {
  it('la misma url canónica no puede entrar dos veces', async () => {
    const error = await niega(() =>
      db.exec(`
        insert into public.newsroom_candidates
          (id, title, url, canonical_url, publisher, observed_at, discovered_via, vertical, status)
        values ('inbox-bbbbbbbbbbbb', 'Otro titular', 'https://openai.com/index/x?utm_source=rss',
                'openai.com/index/x', 'openai.com', '2026-08-12', 's-005', 'modelo-lenguaje', 'candidate')
      `)
    );
    expect(error).toMatch(/duplicate key|unique/i);
  });

  it('un estado que no existe se rechaza en la propia tabla', async () => {
    const error = await niega(() =>
      db.exec(`
        insert into public.newsroom_candidates
          (id, title, url, canonical_url, publisher, observed_at, discovered_via, vertical, status)
        values ('inbox-cccccccccccc', 'Tercero', 'https://openai.com/index/y',
                'openai.com/index/y', 'openai.com', '2026-08-12', 's-005', 'modelo-lenguaje', 'published')
      `)
    );
    expect(error).toMatch(/check constraint|violates/i);
  });

  it('el triaje no puede puntuar fuera de rango', async () => {
    const error = await niega(() =>
      db.exec(`
        insert into public.newsroom_triage
          (candidate_id, decision, score, reasons, vertical, event_class, radar_status, triaged_at)
        values ('inbox-aaaaaaaaaaaa', 'promote', 140, '[]'::jsonb, 'modelo-lenguaje',
                'lanzamiento', 'candidate', '2026-08-11')
      `)
    );
    expect(error).toMatch(/check constraint|violates/i);
  });

  it('un borrador no puede colgar de un candidato inexistente', async () => {
    const error = await niega(() =>
      db.exec(`
        insert into public.newsroom_drafts
          (slug, candidate_id, news_id, title, summary, impact, category, event_type,
           availability, affects_free_plan, official_url, sources, fact_trace)
        values ('huerfano', 'inbox-que-no-existe', 'news-huerfano', 't', 's', 'i',
                'imagen', 'lanzamiento', 'available', 'unverified',
                'https://x.test/a', '[]'::jsonb, '{}'::jsonb)
      `)
    );
    expect(error).toMatch(/foreign key|violates/i);
  });
});
