import { describe, expect, it } from 'vitest';
import {
  compararEsquema,
  esquemaEsperado,
  esquemaVivo,
  sondearAnon,
  sondearUnicidad,
} from '../../scripts/newsroom-schema.mjs';

/**
 * El comparador de esquemas, probado sobre todo por su capacidad de fallar.
 *
 * Un guardia que sólo se ha visto en verde no es un guardia: es una línea de
 * registro. Aquí cada diferencia que puede romper la pasada diaria —una tabla
 * que no llegó, una columna que se quedó por el camino, un tipo distinto— tiene
 * su caso en rojo, y las que no rompen nada tienen el suyo en ámbar.
 */

const VIVO_COMPLETO = {
  definitions: {
    newsroom_published: {
      required: ['slug', 'news_id', 'item', 'approved_by', 'approved_at'],
      properties: {
        slug: { format: 'text', type: 'string', description: 'Note:\nThis is a Primary Key.<pk/>' },
        news_id: { format: 'text', type: 'string' },
        item: { format: 'jsonb', type: 'string' },
        approved_by: { format: 'text', type: 'string' },
        approved_at: { format: 'timestamp with time zone', type: 'string' },
      },
    },
  },
};

const ESPERADO_PUBLICADAS = { newsroom_published: esquemaEsperado().newsroom_published! };

function vivoSin(columna: string) {
  const copia = structuredClone(VIVO_COMPLETO) as typeof VIVO_COMPLETO;
  delete (copia.definitions.newsroom_published.properties as Record<string, unknown>)[columna];
  return copia;
}

describe('lo que la migración exige se lee de la migración', () => {
  it('encuentra las siete tablas y sus columnas', () => {
    const esperado = esquemaEsperado();
    expect(Object.keys(esperado).sort()).toEqual([
      'newsroom_candidates',
      'newsroom_decisions',
      'newsroom_drafts',
      'newsroom_published',
      'newsroom_runs',
      'newsroom_triage',
      'newsroom_verification',
    ]);
  });

  it('no confunde una restricción con una columna', () => {
    /*
     * `check (status in ('running', 'ok', ...))` lleva comas dentro. Partir el
     * cuerpo por comas a secas inventaría columnas llamadas `'ok'`.
     */
    const runs = esquemaEsperado().newsroom_runs!;
    expect(Object.keys(runs)).toContain('status');
    expect(Object.keys(runs).some((c) => c.includes("'"))).toBe(false);
    expect(Object.keys(runs)).toHaveLength(14);
  });

  it('traduce los alias de tipo a lo que PostgREST publica', () => {
    const runs = esquemaEsperado().newsroom_runs!;
    expect(runs.started_at!.tipo).toBe('timestamp with time zone');
    /* `bigserial` no es un tipo: es un `bigint` con una secuencia detrás. */
    expect(esquemaEsperado().newsroom_decisions!.id!.tipo).toBe('bigint');
  });

  it('una clave primaria cuenta como obligatoria aunque no diga not null', () => {
    expect(esquemaEsperado().newsroom_published!.slug).toMatchObject({ noNulo: true, clave: true });
  });
});

describe('qué detiene un despliegue', () => {
  it('una tabla que no llegó', () => {
    const { fallos, ok } = compararEsquema(ESPERADO_PUBLICADAS, {});
    expect(ok).toBe(false);
    expect(fallos).toContain('falta la tabla newsroom_published');
  });

  it('una columna que se quedó por el camino', () => {
    const { fallos, ok } = compararEsquema(ESPERADO_PUBLICADAS, esquemaVivo(vivoSin('approved_by')));
    expect(ok).toBe(false);
    expect(fallos).toContain('newsroom_published.approved_by: no existe');
  });

  it('un tipo distinto del declarado', () => {
    const roto = structuredClone(VIVO_COMPLETO);
    roto.definitions.newsroom_published.properties.item.format = 'text';
    const { fallos } = compararEsquema(ESPERADO_PUBLICADAS, esquemaVivo(roto));
    expect(fallos).toContain('newsroom_published.item: es text y la migración pide jsonb');
  });

  it('una columna obligatoria en la base que la migración cree opcional', () => {
    /*
     * Este es el que rompe la pasada: el código escribe sin ella porque la
     * migración dice que se puede, y PostgreSQL rechaza la fila entera.
     */
    const esperado = { t: { a: { tipo: 'text', noNulo: false, clave: false } } };
    const vivo = { t: { a: { tipo: 'text', noNulo: true, clave: false } } };
    expect(compararEsquema(esperado, vivo).fallos).toContain(
      't.a: es obligatoria aquí y opcional en la migración'
    );
  });

  it('una clave primaria que dejó de serlo', () => {
    const roto = structuredClone(VIVO_COMPLETO);
    roto.definitions.newsroom_published.properties.slug.description = '';
    const { fallos } = compararEsquema(ESPERADO_PUBLICADAS, esquemaVivo(roto));
    expect(fallos).toContain('newsroom_published.slug: debería ser clave primaria y no lo es');
  });
});

describe('qué se avisa y no se detiene', () => {
  it('una columna de más, que puede venir de una migración posterior', () => {
    const extra = structuredClone(VIVO_COMPLETO);
    (extra.definitions.newsroom_published.properties as Record<string, unknown>).nota = {
      format: 'text',
      type: 'string',
    };
    const { fallos, avisos } = compararEsquema(ESPERADO_PUBLICADAS, esquemaVivo(extra));
    expect(fallos).toEqual([]);
    expect(avisos).toContain('newsroom_published.nota: sobra, no está en la migración');
  });

  it('el esquema real e íntegro no produce ningún fallo', () => {
    expect(compararEsquema(ESPERADO_PUBLICADAS, esquemaVivo(VIVO_COMPLETO))).toMatchObject({
      ok: true,
      fallos: [],
    });
  });
});

describe('lo que el spec no cuenta y hay que sondear', () => {
  const respuesta = (status: number, body: unknown) => ({
    ok: status < 400,
    status,
    statusText: '',
    json: async () => body,
    body: null,
  });

  it('42P10 significa que la restricción única no está', async () => {
    const falso = async () => respuesta(400, { code: '42P10' });
    await expect(
      sondearUnicidad({ url: 'https://x.test', key: 'k', fetchImpl: falso as never })
    ).resolves.toMatchObject({ ok: false });
  });

  it('23502 significa que sí está: el plan pasó y la ejecución chocó con un not null', async () => {
    const falso = async () => respuesta(400, { code: '23502' });
    await expect(
      sondearUnicidad({ url: 'https://x.test', key: 'k', fetchImpl: falso as never })
    ).resolves.toMatchObject({ ok: true });
  });

  it('un sondeo que escribe una fila es un fallo, no un éxito', async () => {
    /*
     * Si alguna vez PostgREST aceptara el cuerpo vacío, el sondeo habría dejado
     * basura en la tabla. Devolver verde ahí sería lo peor de los dos mundos.
     */
    const falso = async () => respuesta(201, {});
    await expect(
      sondearUnicidad({ url: 'https://x.test', key: 'k', fetchImpl: falso as never })
    ).resolves.toMatchObject({ ok: false });
  });

  it('un 200 para anon es acceso abierto, aunque la respuesta venga vacía', async () => {
    /*
     * El caso silencioso: RLS activo pero sin `revoke`, tabla vacía. Devuelve
     * `[]` con 200, que es indistinguible de «no hay nada» si sólo se mira el
     * cuerpo. Lo que decide es el código de estado.
     */
    const falso = async () => respuesta(200, []);
    await expect(
      sondearAnon({
        url: 'https://x.test',
        anonKey: 'k',
        tablas: ['newsroom_runs'],
        fetchImpl: falso as never,
      })
    ).resolves.toMatchObject({ ok: false, abiertas: ['newsroom_runs'] });
  });

  it('un 401 para anon es la respuesta correcta', async () => {
    const falso = async () => respuesta(401, { code: '42501' });
    await expect(
      sondearAnon({
        url: 'https://x.test',
        anonKey: 'k',
        tablas: ['newsroom_runs'],
        fetchImpl: falso as never,
      })
    ).resolves.toMatchObject({ ok: true, abiertas: [] });
  });
});
