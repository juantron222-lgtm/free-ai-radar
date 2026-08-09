import { describe, expect, it } from 'vitest';
import { catalogRows } from '../../scripts/catalog-source.mjs';
import { getAllTools } from '@lib/data/catalog';
import { CATEGORIES } from '@lib/domain/taxonomy';

/**
 * The mirror written into Postgres, checked against the catalogue it mirrors.
 *
 * `public.tools` exists so `user_favorites.tool_id` can point at something.
 * When it was empty every favourite failed with `23503` and no page showed an
 * error, because nothing on the public site reads that table — the only way to
 * find out was to log in for real. These assertions are the cheap version of
 * that discovery.
 */

/**
 * `catalog-source.mjs` is plain JavaScript, so its return type is untyped and
 * every callback parameter below would be an implicit `any`. Naming the shape
 * once here is more honest than annotating each one: the rows really are bags
 * of columns, and the test's job is to check what is in them.
 */
type Row = Record<string, unknown>;

const rows = (await catalogRows()) as {
  toolRows: Row[];
  categoryRows: Row[];
  unknownKeys: string[];
  orphans: string[];
};

describe('el espejo cubre el catálogo entero', () => {
  it('una fila por herramienta, ni una de más', () => {
    expect(rows.toolRows).toHaveLength(getAllTools().length);
  });

  it('una fila por categoría', () => {
    expect(rows.categoryRows).toHaveLength(CATEGORIES.length);
  });

  it('los slugs coinciden exactamente con los del catálogo', () => {
    const mirrored = rows.toolRows.map((row) => row.slug).sort();
    const real = getAllTools().map((tool) => tool.slug).sort();
    expect(mirrored).toEqual(real);
  });
});

describe('los ids son los que la aplicación construye al guardar', () => {
  /*
   * `toggleFavorite` writes `tool_${slug}`. If the mirror stored anything else,
   * the foreign key would reject every write while the table looked perfectly
   * populated — the same failure as an empty table, harder to see.
   */
  it('cada id es tool_<slug>', () => {
    for (const row of rows.toolRows) {
      expect(row.id).toBe(`tool_${row.slug}`);
    }
  });
});

describe('integridad referencial antes de tocar la base de datos', () => {
  it('ninguna herramienta apunta a una categoría inexistente', () => {
    expect(rows.orphans).toEqual([]);
  });

  it('ninguna clave del catálogo se queda fuera del esquema', () => {
    expect(rows.unknownKeys).toEqual([]);
  });
});

describe('sólo se copia lo almacenado', () => {
  /*
   * `scoreTotal` is computed by `hydrateTool` from the five components. Writing
   * it to a second place creates a value that can disagree with the one derived
   * from the same data.
   */
  it('scoreTotal no viaja a la base de datos', () => {
    for (const row of rows.toolRows) {
      expect(row.scores).not.toHaveProperty('scoreTotal');
      expect(row).not.toHaveProperty('score_total');
    }
  });

  it('las cinco componentes sí viajan', () => {
    for (const row of rows.toolRows) {
      expect(Object.keys(row.scores as object).sort()).toEqual(
        ['creatorValue', 'ease', 'freeReal', 'transparency', 'usefulness']
      );
    }
  });
});

describe('las columnas obligatorias van completas', () => {
  /*
   * `jsonb_populate_recordset` turns an absent key into an explicit NULL, and an
   * explicit NULL defeats a column default. Anything `not null` without a value
   * here fails at insert time, against a real database, at the worst moment.
   */
  const REQUIRED = [
    'id', 'slug', 'name', 'category_slug', 'free_model', 'free_plan',
    'official_url', 'scores', 'created_at',
  ] as const;

  it('ninguna herramienta llega sin ellas', () => {
    for (const row of rows.toolRows) {
      for (const column of REQUIRED) {
        expect(row[column], `${row.slug} → ${column}`).toBeDefined();
        expect(row[column], `${row.slug} → ${column}`).not.toBeNull();
      }
    }
  });

  it('ninguna categoría llega sin las suyas', () => {
    rows.categoryRows.forEach((row, index) => {
      expect(row.slug).toBeTruthy();
      expect(row.name).toBeTruthy();
      expect(row.position).toBe(index);
      expect(row.created_at).toBeTruthy();
    });
  });
});
