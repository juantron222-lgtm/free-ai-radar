import { describe, expect, it } from 'vitest';
import {
  DIAS_SIN_APORTAR,
  embudoDesdeHistorial,
  fuentesInactivas,
  leerBandas,
  leerTiempoLectura,
  serieDeBandas,
} from '../../scripts/newsroom-cobertura.mjs';
import { resumirPasada } from '@lib/data/newsroom-store';

/**
 * La medida de cobertura por fabricante.
 *
 * Lo que se prueba aquí es sobre todo lo que **no** debe señalar. Un aviso de
 * fuente muerta que salta cuando no toca se ignora a la tercera vez, y a partir
 * de ahí deja de avisar de las que sí lo están.
 */

const HOY = new Date('2026-09-08T00:00:00Z');

const fuente = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Fuente ${id}`,
  enabled: true,
  ...extra,
});

const candidato = (id: string, via: string, dia: string) => ({
  id,
  discovered_via: via,
  observed_at: dia,
  publisher: 'ejemplo.test',
});

describe('qué fuente pide una mirada', () => {
  it('la que lleva más de tres semanas sin aportar', () => {
    const inactivas = fuentesInactivas(
      [candidato('c1', 's-001', '2026-08-01')],
      [fuente('s-001')],
      { hoy: HOY }
    );
    expect(inactivas).toHaveLength(1);
    expect(inactivas[0]).toMatchObject({ id: 's-001', diasSin: 38 });
  });

  it('no señala una que aportó ayer', () => {
    expect(
      fuentesInactivas([candidato('c1', 's-001', '2026-09-07')], [fuente('s-001')], { hoy: HOY })
    ).toEqual([]);
  });

  it('no señala una fuente apagada', () => {
    /*
     * Apagarla ya fue la decisión. Volver a avisar de ella cada día convierte
     * el informe en ruido que se salta con la vista.
     */
    expect(fuentesInactivas([], [fuente('s-009', { enabled: false })], { hoy: HOY })).toEqual([]);
  });

  it('señala la que nunca ha aportado nada, y lo dice distinto', () => {
    /*
     * No es lo mismo «se ha quedado callada» que «nunca ha dicho nada»: lo
     * segundo suele ser un patrón de enlace mal escrito, no un fabricante
     * inactivo, y se arregla de otra forma.
     */
    const [sola] = fuentesInactivas([], [fuente('s-040')], { hoy: HOY });
    expect(sola).toMatchObject({ ultimaVez: null, diasSin: null });
    expect(sola!.motivo).toMatch(/todavía/);
  });

  it('no señala una fuente que se añadió hace dos días', () => {
    /*
     * El día que se amplían las fuentes, todas las nuevas están «sin aportar
     * nada» por definición. Señalarlas convierte el primer informe útil en
     * dieciséis falsos positivos, y un aviso que salta cuando no toca se
     * aprende a ignorar — incluidas las fuentes que sí están rotas.
     */
    expect(
      fuentesInactivas([], [fuente('s-040', { since: '2026-09-06' })], { hoy: HOY })
    ).toEqual([]);
  });

  it('pasada la ventana, una fuente nueva que sigue muda sí se señala', () => {
    /* El indulto es temporal: si a las tres semanas no ha traído nada, algo va mal. */
    const [sola] = fuentesInactivas([], [fuente('s-040', { since: '2026-07-01' })], { hoy: HOY });
    expect(sola).toMatchObject({ id: 's-040' });
  });

  it('una fuente sin fecha de alta se considera antigua', () => {
    /* Es lo correcto para las que ya estaban cuando esto se escribió. */
    expect(fuentesInactivas([], [fuente('s-001')], { hoy: HOY })).toHaveLength(1);
  });

  it('ordena por la que lleva más tiempo callada', () => {
    const inactivas = fuentesInactivas(
      [candidato('a', 's-001', '2026-08-10'), candidato('b', 's-002', '2026-06-01')],
      [fuente('s-001'), fuente('s-002')],
      { hoy: HOY }
    );
    expect(inactivas.map((i) => i.id)).toEqual(['s-002', 's-001']);
  });

  it('la ventana por defecto son tres semanas', () => {
    expect(DIAS_SIN_APORTAR).toBe(21);
    /* 21 días justos antes del 8 de septiembre es el 18 de agosto: entra. */
    const justo = fuentesInactivas([candidato('c', 's-001', '2026-08-18')], [fuente('s-001')], {
      hoy: HOY,
    });
    expect(justo).toHaveLength(1);
    expect(justo[0]).toMatchObject({ diasSin: DIAS_SIN_APORTAR });

    /* Un día menos, y todavía no se avisa. */
    expect(
      fuentesInactivas([candidato('c', 's-001', '2026-08-19')], [fuente('s-001')], { hoy: HOY })
    ).toEqual([]);
  });

  it('se queda con la aportación más reciente, no con la primera que lea', () => {
    const inactivas = fuentesInactivas(
      [candidato('viejo', 's-001', '2026-01-01'), candidato('nuevo', 's-001', '2026-09-05')],
      [fuente('s-001')],
      { hoy: HOY }
    );
    expect(inactivas).toEqual([]);
  });

  it('una fila sin fecha o sin fuente no cuenta como aportación', () => {
    const inactivas = fuentesInactivas(
      [{ id: 'x', discovered_via: 's-001', observed_at: null }] as never,
      [fuente('s-001')],
      { hoy: HOY }
    );
    expect(inactivas[0]).toMatchObject({ ultimaVez: null });
  });
});

describe('el embudo por fabricante', () => {
  const fuentes = [fuente('s-001'), fuente('s-002')];

  it('cuenta candidatos, leídos y verificados por su fuente', () => {
    const filas = embudoDesdeHistorial({
      candidatos: [
        candidato('c1', 's-001', '2026-09-01'),
        candidato('c2', 's-001', '2026-09-02'),
        candidato('c3', 's-002', '2026-09-02'),
      ],
      verificaciones: [
        { candidate_id: 'c1', decision: 'verified' },
        { candidate_id: 'c2', decision: 'insufficient' },
      ],
      publicadas: [{ slug: 'c1' }],
      fuentes,
    });

    expect(filas[0]).toMatchObject({
      id: 's-001',
      candidatos: 2,
      /* Leído es haber llegado a un veredicto, sea cual sea. */
      leidos: 2,
      verificados: 1,
      publicados: 1,
      ultimaVez: '2026-09-02',
    });
    expect(filas[1]).toMatchObject({ id: 's-002', candidatos: 1, leidos: 0, verificados: 0 });
  });

  it('ordena por volumen, que es donde se mira primero', () => {
    const filas = embudoDesdeHistorial({
      candidatos: [
        candidato('a', 's-002', '2026-09-01'),
        candidato('b', 's-001', '2026-09-01'),
        candidato('c', 's-001', '2026-09-01'),
      ],
      verificaciones: [],
      publicadas: [],
      fuentes,
    });
    expect(filas.map((f) => f.id)).toEqual(['s-001', 's-002']);
  });

  it('un candidato de una fuente que ya no existe no se pierde', () => {
    /*
     * Retirar una fuente no borra lo que aportó. Si esta fila desapareciera,
     * el histórico de publicaciones dejaría de cuadrar sin decir por qué.
     */
    const filas = embudoDesdeHistorial({
      candidatos: [candidato('x', 's-999', '2026-09-01')],
      verificaciones: [],
      publicadas: [],
      fuentes,
    });
    expect(filas[0]).toMatchObject({ id: 's-999', nombre: 's-999', candidatos: 1 });
  });
});

describe('la serie por banda sobrevive en el texto', () => {
  /*
   * `newsroom_runs` no tiene columna para el reparto por banda, y añadir una
   * obligaría a otra migración a mano contra un Supabase que no se alcanza
   * desde aquí. Así que viaja dentro de `notes`. Estas pruebas son lo único
   * que impide que quien escribe el texto y quien lo lee se separen sin ruido:
   * si `resumirPasada` cambia el formato, esto se pone rojo.
   */
  const base = {
    sources: 37,
    errors: 1,
    drafted: 9,
    published: 1,
    held: [] as Array<{ slug: string; reasons: string[] }>,
    archived: 9,
    superseded: 2,
    readMs: 1500,
  };

  const conBandas = {
    ...base,
    investigated: {
      total: 23,
      promote: 0,
      recall: 23,
      byBand: {
        '80+': { leidas: 5, verificadas: 2, borradores: 2, publicadas: 0 },
        '75-79': { leidas: 9, verificadas: 3, borradores: 2, publicadas: 0 },
        '70-74': { leidas: 14, verificadas: 7, borradores: 7, publicadas: 1 },
      },
    },
  };

  it('lo que escribe la pasada es exactamente lo que se lee de vuelta', () => {
    expect(leerBandas(resumirPasada(conBandas))).toEqual(conBandas.investigated.byBand);
  });

  it('recupera también el tiempo de lectura', () => {
    expect(leerTiempoLectura(resumirPasada(conBandas))).toBe(1.5);
  });

  it('una pasada sin bandas no inventa ninguna', () => {
    /* Las pasadas anteriores a esta política no registran reparto. */
    expect(leerBandas(resumirPasada(base))).toEqual({});
    expect(leerBandas(null)).toEqual({});
    expect(leerTiempoLectura('cualquier cosa')).toBeNull();
  });

  it('acumula varias pasadas y conserva el detalle de cada una', () => {
    const runs = [
      { started_at: '2026-09-08T06:00:00Z', trigger: 'cron', status: 'ok', notes: resumirPasada(conBandas) },
      { started_at: '2026-09-09T06:00:00Z', trigger: 'cron', status: 'ok', notes: resumirPasada(conBandas) },
    ];
    const { total, pasadas } = serieDeBandas(runs);

    expect(total['70-74']).toEqual({ leidas: 28, verificadas: 14, borradores: 14, publicadas: 2 });
    expect(pasadas).toHaveLength(2);
    expect(pasadas[0]).toMatchObject({ dia: '2026-09-08', lectura: 1.5 });
  });

  it('salta las pasadas viejas en vez de contarlas como ceros', () => {
    /*
     * Contar una pasada sin registro como «0 leídas» hundiría la media de la
     * semana con días que sencillamente no medían esto.
     */
    const runs = [
      { started_at: '2026-09-01T06:00:00Z', notes: 'una pasada de antes de esta política' },
      { started_at: '2026-09-08T06:00:00Z', notes: resumirPasada(conBandas) },
    ];
    expect(serieDeBandas(runs).pasadas).toHaveLength(1);
  });
});
