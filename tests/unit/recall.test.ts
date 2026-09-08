import { describe, expect, it } from 'vitest';
import {
  MAX_POR_FABRICANTE,
  UMBRAL_INVESTIGACION,
  banda,
  intercalarPorFabricante,
  prioridad,
  seleccionarParaInvestigar,
} from '../../scripts/triage/recall.mjs';

/**
 * La política de recall: qué se lee.
 *
 * Lo que más importa probar aquí es la frontera. Este módulo amplía lo que se
 * investiga y no puede, por ningún camino, ampliar lo que se publica: eso lo
 * sigue decidiendo `canAutoPublish`, que no se toca. Y dentro de lo que sí
 * decide, lo que hay que sujetar es que un fabricante hablador no se lleve el
 * presupuesto entero.
 */

const HOY = '2026-09-08';

const registro = (extra: Record<string, unknown> = {}) => ({
  id: 'c-1',
  title: 'Un fabricante publica algo',
  canonicalUrl: 'ejemplo.test/algo',
  publisher: 'ejemplo.test',
  publishedAt: '2026-09-07',
  triageDecision: 'hold',
  triageScore: 72,
  eventClass: 'lanzamiento',
  product: null,
  vertical: 'modelo-lenguaje',
  ...extra,
});

describe('lo que el triaje promociona no se recorta nunca', () => {
  it('entra todo lo de promote, aunque llene el presupuesto', () => {
    const triaje = Array.from({ length: 6 }, (_, i) =>
      registro({ id: `p-${i}`, triageDecision: 'promote', triageScore: 90 })
    );
    const { seleccionadas, recall } = seleccionarParaInvestigar(triaje, { hoy: HOY, presupuesto: 4 });
    expect(seleccionadas).toHaveLength(6);
    expect(recall).toHaveLength(0);
  });

  it('van delante, para que el reloj se gaste primero en ellas', () => {
    const triaje = [
      registro({ id: 'h-1', triageScore: 79 }),
      registro({ id: 'p-1', triageDecision: 'promote', triageScore: 81, publisher: 'otro.test' }),
    ];
    const { seleccionadas } = seleccionarParaInvestigar(triaje, { hoy: HOY });
    expect(seleccionadas[0]!.id).toBe('p-1');
  });

  it('el presupuesto sólo recorta la banda de recall', () => {
    const triaje = [
      registro({ id: 'p-1', triageDecision: 'promote', triageScore: 90 }),
      ...Array.from({ length: 10 }, (_, i) =>
        registro({ id: `h-${i}`, publisher: `f${i}.test`, triageScore: 75 })
      ),
    ];
    const { seleccionadas, recall } = seleccionarParaInvestigar(triaje, { hoy: HOY, presupuesto: 5 });
    expect(recall).toHaveLength(4);
    expect(seleccionadas).toHaveLength(5);
  });
});

describe('qué entra en la banda de recall y qué no', () => {
  it('nada por debajo del umbral, por muy fresco que sea', () => {
    const triaje = [registro({ triageScore: UMBRAL_INVESTIGACION - 1, publishedAt: HOY })];
    expect(seleccionarParaInvestigar(triaje, { hoy: HOY }).recall).toHaveLength(0);
  });

  it('justo en el umbral, sí', () => {
    const triaje = [registro({ triageScore: UMBRAL_INVESTIGACION })];
    expect(seleccionarParaInvestigar(triaje, { hoy: HOY }).recall).toHaveLength(1);
  });

  it('no se relee lo que ya tiene veredicto', () => {
    /* Cada lectura cuesta una petición: repetirla gasta presupuesto en nada. */
    const triaje = [registro({ id: 'ya' }), registro({ id: 'nueva', publisher: 'otro.test' })];
    const { seleccionadas } = seleccionarParaInvestigar(triaje, {
      hoy: HOY,
      yaVerificados: new Set(['ya']),
    });
    expect(seleccionadas.map((r) => r.id)).toEqual(['nueva']);
  });

  it('cuenta cuántas se quedaron sin sitio', () => {
    /* Es el coste del presupuesto, y tiene que poder mirarse. */
    const triaje = Array.from({ length: 8 }, (_, i) =>
      registro({ id: `h-${i}`, publisher: `f${i}.test` })
    );
    expect(seleccionarParaInvestigar(triaje, { hoy: HOY, presupuesto: 3 }).sinSitio).toBe(5);
  });
});

describe('un fabricante hablador no se lleva el presupuesto', () => {
  it('tope por fabricante en la banda de recall', () => {
    /*
     * El caso real: Together publicó seis comparativas «X vs Y en DeepSWE» el
     * mismo día. Las seis se verificaban, las seis se redactaban y ninguna se
     * publicaba, porque son de modelos ajenos y el alcance las degrada.
     */
    const triaje = Array.from({ length: 6 }, (_, i) =>
      registro({ id: `t-${i}`, publisher: 'together.ai', title: `Comparativa ${i}` })
    );
    const { recall } = seleccionarParaInvestigar(triaje, { hoy: HOY, presupuesto: 20 });
    expect(recall).toHaveLength(MAX_POR_FABRICANTE);
  });

  it('el tope no se aplica a lo promocionado', () => {
    /* Cinco cosas de 80 del mismo fabricante son un día grande, no ruido. */
    const triaje = Array.from({ length: 5 }, (_, i) =>
      registro({ id: `p-${i}`, triageDecision: 'promote', triageScore: 88, publisher: 'anthropic.com' })
    );
    expect(seleccionarParaInvestigar(triaje, { hoy: HOY }).seleccionadas).toHaveLength(5);
  });

  it('dos notas del mismo producto valen menos que dos productos distintos', () => {
    const triaje = [
      registro({ id: 'a', product: 'gemini', publisher: 'f1.test' }),
      registro({ id: 'b', product: 'gemini', publisher: 'f2.test' }),
      registro({ id: 'c', product: 'llama', publisher: 'f3.test' }),
    ];
    const { recall } = seleccionarParaInvestigar(triaje, { hoy: HOY, presupuesto: 2 });
    expect(recall.map((r) => r.product)).toEqual(['gemini', 'llama']);
  });
});

describe('cómo se ordena la banda de recall', () => {
  it('lo reciente pesa más que una puntuación algo mayor', () => {
    /*
     * Es el criterio que más cambia el resultado: `canAutoPublish` exige 21
     * días o menos, así que leer algo de hace dos meses llena la mesa pero no
     * puede publicar sin que alguien lo mire.
     */
    const vieja = registro({ triageScore: 79, publishedAt: '2026-06-01' });
    const nueva = registro({ triageScore: 71, publishedAt: '2026-09-07' });
    expect(prioridad(nueva, { hoy: HOY })).toBeGreaterThan(prioridad(vieja, { hoy: HOY }));
  });

  it('un lanzamiento pesa más que una actualización menor', () => {
    const lanzamiento = registro({ eventClass: 'lanzamiento' });
    const menor = registro({ eventClass: 'actualizacion' });
    expect(prioridad(lanzamiento, { hoy: HOY })).toBeGreaterThan(prioridad(menor, { hoy: HOY }));
  });

  it('dentro de la ventana de publicación hay un salto, no una pendiente', () => {
    const dentro = registro({ publishedAt: '2026-08-20' });
    const fuera = registro({ publishedAt: '2026-08-16' });
    const salto = prioridad(dentro, { hoy: HOY }) - prioridad(fuera, { hoy: HOY });
    expect(salto).toBeGreaterThan(10);
  });

  it('una historia sin fecha no gana por serlo', () => {
    const sinFecha = registro({ publishedAt: null });
    const conFecha = registro({ publishedAt: HOY });
    expect(prioridad(conFecha, { hoy: HOY })).toBeGreaterThan(prioridad(sinFecha, { hoy: HOY }));
  });

  it('la puntuación del triaje desempata pero no manda', () => {
    /* Es exactamente lo que la auditoría desmintió: el score no predice. */
    const a = registro({ triageScore: 79, eventClass: 'actualizacion' });
    const b = registro({ triageScore: 70, eventClass: 'lanzamiento' });
    expect(prioridad(b, { hoy: HOY })).toBeGreaterThan(prioridad(a, { hoy: HOY }));
  });
});

describe('el orden de lectura reparte la carga', () => {
  it('no deja dos del mismo fabricante seguidas si puede evitarlo', () => {
    /*
     * La verificación corre en paralelo. Sin intercalar, varias peticiones
     * simultáneas caen sobre el mismo servidor, que es la diferencia entre
     * leer a un fabricante y castigarlo.
     */
    const lista = [
      { id: '1', publisher: 'a.test' },
      { id: '2', publisher: 'a.test' },
      { id: '3', publisher: 'b.test' },
      { id: '4', publisher: 'b.test' },
    ];
    const orden = intercalarPorFabricante(lista).map((x) => x.publisher);
    expect(orden[0]).not.toBe(orden[1]);
    expect(orden).toHaveLength(4);
  });

  it('no pierde ni duplica ninguna', () => {
    const lista = Array.from({ length: 9 }, (_, i) => ({ id: `x-${i}`, publisher: `f${i % 3}.test` }));
    const salida = intercalarPorFabricante(lista);
    expect(new Set(salida.map((x) => x.id)).size).toBe(9);
  });
});

describe('las bandas del informe', () => {
  it('reparten como se auditaron', () => {
    expect(banda(100)).toBe('80+');
    expect(banda(80)).toBe('80+');
    expect(banda(79)).toBe('75-79');
    expect(banda(74)).toBe('70-74');
    expect(banda(69)).toBe('<70');
  });
});
