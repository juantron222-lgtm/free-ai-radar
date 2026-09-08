import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { serieDeBandas } from '../../scripts/newsroom-cobertura.mjs';
import { resumirPasada } from '@lib/data/newsroom-store';

/**
 * La ruta que informa de la semana.
 *
 * Lo que más importa probar aquí no es lo que devuelve, sino lo que **no puede
 * hacer**: es la única ruta que se añadió durante una semana declarada sin
 * cambios, y su justificación entera es que sólo lee. Si algún día importara el
 * código de la pasada diaria, un parámetro mal escrito podría dispararla.
 */

const FUENTE = readFileSync(resolve(process.cwd(), 'src/pages/api/newsroom/series.ts'), 'utf-8');

/*
 * Se mira lo que el fichero importa, no lo que menciona: el comentario de
 * cabecera nombra `runDailyNewsroom` justo para explicar que no la importa, y
 * una prueba que buscara la palabra suelta se pondría roja por la explicación.
 */
const IMPORTS = FUENTE.split('\n')
  .filter((linea) => /^\s*import\b/.test(linea))
  .join('\n');

describe('la ruta de informe no puede ejecutar nada', () => {
  it('no importa la pasada diaria', () => {
    expect(IMPORTS).not.toMatch(/runDailyNewsroom/);
    expect(IMPORTS).not.toMatch(/newsroom\/daily/);
  });

  it('no importa nada que escriba en la base', () => {
    for (const escritura of ['recordRun', 'publishItem', 'appendDecision', 'decide']) {
      expect(IMPORTS).not.toContain(escritura);
    }
  });

  it('lo único que trae del almacén es un lector', () => {
    expect(IMPORTS).toMatch(/readRuns/);
  });

  it('sólo expone GET', () => {
    expect(FUENTE).toMatch(/export const GET/);
    expect(FUENTE).not.toMatch(/export const (POST|PUT|PATCH|DELETE)/);
  });

  it('exige el mismo secreto que el cron y responde 404 al fallar', () => {
    /*
     * 404 y no 401: un endpoint que responde «no autorizado» confirma a quien
     * sondea que existe y que hay un secreto que adivinar.
     */
    expect(FUENTE).toMatch(/authorizeTrigger/);
    expect(FUENTE).toMatch(/status:\s*404/);
  });
});

describe('lo que resume de la semana', () => {
  const pasada = (dia: string, bandas: Record<string, [number, number, number, number]>) => ({
    started_at: `${dia}T06:00:00Z`,
    trigger: 'cron',
    status: 'ok',
    notes: resumirPasada({
      sources: 37,
      errors: 0,
      drafted: 0,
      published: 0,
      held: [],
      archived: 0,
      superseded: 0,
      readMs: 1200,
      investigated: {
        total: 0,
        promote: 0,
        recall: 0,
        byBand: Object.fromEntries(
          Object.entries(bandas).map(([b, [l, v, d, p]]) => [
            b,
            { leidas: l, verificadas: v, borradores: d, publicadas: p },
          ])
        ),
      },
    }),
  });

  it('acumula por banda a lo largo de varios días', () => {
    const { total } = serieDeBandas([
      pasada('2026-09-09', { '80+': [5, 2, 2, 0], '70-74': [14, 7, 7, 1] }),
      pasada('2026-09-10', { '80+': [3, 1, 1, 0], '70-74': [10, 6, 5, 1] }),
    ]);

    expect(total['80+']).toEqual({ leidas: 8, verificadas: 3, borradores: 3, publicadas: 0 });
    expect(total['70-74']).toEqual({ leidas: 24, verificadas: 13, borradores: 12, publicadas: 2 });
  });

  it('los ratios distinguen volumen de rendimiento', () => {
    /*
     * Es la confusión que este informe existe para evitar: 80+ puede leer más
     * y rendir menos, y mirando sólo los totales parece la banda buena.
     */
    const { total } = serieDeBandas([
      pasada('2026-09-09', { '80+': [20, 4, 4, 0], '70-74': [10, 6, 6, 2] }),
    ]);

    const ratio = (b: string) => total[b]!.verificadas / total[b]!.leidas;
    expect(ratio('80+')).toBeCloseTo(0.2);
    expect(ratio('70-74')).toBeCloseTo(0.6);
    expect(ratio('70-74')).toBeGreaterThan(ratio('80+'));
  });

  it('una semana sin ninguna pasada registrada no inventa bandas', () => {
    expect(serieDeBandas([])).toEqual({ total: {}, pasadas: [] });
  });

  it('conserva el día y el disparo de cada pasada', () => {
    const { pasadas } = serieDeBandas([pasada('2026-09-09', { '70-74': [1, 1, 1, 1] })]);
    expect(pasadas[0]).toMatchObject({ dia: '2026-09-09', trigger: 'cron', status: 'ok' });
  });
});
