import { describe, expect, it } from 'vitest';
import {
  DIAS_VENTANA_AUTOPUBLICACION,
  clasificarRetencion,
  motivosPermanentes,
  repartirMesa,
} from '@lib/domain/caducidad';
import { canAutoPublish } from '@lib/domain/newsroom';
import type { DeskStory } from '@lib/domain/newsroom';

/**
 * La caducidad de la mesa.
 *
 * Lo peligroso de este módulo es marcar «nunca» donde sólo había un «hoy no».
 * Casi todas las pruebas de abajo comprueban que **no** caduca: un artículo que
 * no se pudo leer, un hueco sin confirmar, una historia recién publicada. Y una
 * ata esta ventana a la de `canAutoPublish`, porque si las dos se separan este
 * módulo empezaría a archivar historias que la puerta todavía aceptaría.
 */

const HOY = '2026-09-08';

function historia(overrides: Record<string, unknown> = {}): DeskStory {
  const base = {
    key: 'una-noticia',
    title: 'Un fabricante publica algo',
    publisher: 'anthropic.com',
    publishedAt: '2026-09-05',
    section: 'ready',
    radar: null,
    triage: { decision: 'promote', score: 88, reasons: [] },
    verification: {
      candidateId: 'c-1',
      decision: 'verified',
      primarySources: [{ url: 'https://anthropic.com/news/x', reachable: true }],
      verifiedFacts: [{ fact: 'algo [vía html]' }],
      unconfirmed: [],
      scope: 'first-party',
    },
    draft: { candidateId: 'c-1', slug: 'una-noticia' },
    gate: { ok: true, reasons: [] },
    published: false,
    ...overrides,
  };
  return base as unknown as DeskStory;
}

describe('lo que caduca de verdad', () => {
  it('una historia fuera de la ventana, porque la edad sólo crece', () => {
    const vieja = historia({ publishedAt: '2026-08-01' });
    expect(motivosPermanentes(vieja, { today: HOY })[0]).toMatch(/38 días/);
    expect(clasificarRetencion(vieja, { today: HOY }).permanente).toBe(true);
  });

  it('una integración de terceros, porque es una propiedad de la página', () => {
    const integracion = historia({
      verification: { ...historia().verification, scope: 'integration' },
    });
    expect(motivosPermanentes(integracion, { today: HOY })).toEqual([
      'la página acredita una integración, no el lanzamiento del fabricante',
    ]);
  });

  it('también cuando el alcance viaja dentro de los puntos sin confirmar', () => {
    /*
     * Es como llega en la práctica: el verificador escribe «Alcance: comfy.org
     * no fabrica Seedance…» en `unconfirmed`, y `scope` puede no venir puesto.
     */
    const integracion = historia({
      verification: {
        ...historia().verification,
        scope: undefined,
        unconfirmed: ['Alcance: comfy.org no fabrica Seedance, que es de ByteDance.'],
      },
    });
    expect(clasificarRetencion(integracion, { today: HOY }).permanente).toBe(true);
  });

  it('acumula los dos motivos cuando se dan a la vez', () => {
    const ambos = historia({
      publishedAt: '2026-07-01',
      verification: { ...historia().verification, scope: 'integration' },
    });
    expect(motivosPermanentes(ambos, { today: HOY })).toHaveLength(2);
  });
});

describe('lo que NO caduca, que es la mitad importante', () => {
  it('un artículo que no se pudo leer: mañana puede responder', () => {
    const sinLeer = historia({
      verification: {
        ...historia().verification,
        primarySources: [{ url: 'https://openai.com/x', reachable: false }],
      },
    });
    expect(motivosPermanentes(sinLeer, { today: HOY })).toEqual([]);
  });

  it('un hueco sin confirmar que no es de alcance: otra vía puede cerrarlo', () => {
    const hueco = historia({
      verification: {
        ...historia().verification,
        unconfirmed: ['Disponibilidad: ninguna vía oficial dice si se puede usar ya.'],
      },
    });
    expect(clasificarRetencion(hueco, { today: HOY }).permanente).toBe(false);
  });

  it('evidencia sólo de feed: es un «hoy no», no un «nunca»', () => {
    const soloFeed = historia({
      verification: {
        ...historia().verification,
        verifiedFacts: [{ fact: 'algo [vía feed]' }],
      },
    });
    expect(motivosPermanentes(soloFeed, { today: HOY })).toEqual([]);
  });

  it('una historia sin fecha no se declara vieja por no tenerla', () => {
    expect(motivosPermanentes(historia({ publishedAt: null }), { today: HOY })).toEqual([]);
  });

  it('una historia sin verificación tampoco', () => {
    expect(motivosPermanentes(historia({ verification: null }), { today: HOY })).toEqual([]);
  });
});

describe('la ventana no puede separarse de la de la puerta', () => {
  /*
   * Si `canAutoPublish` cambiara sus 21 días y esto no, se archivarían historias
   * que la puerta todavía aceptaría — en silencio, y sin que nadie las volviera
   * a mirar. Esta prueba falla si las dos dejan de coincidir.
   */
  const edad = (dias: number) => {
    const d = new Date(Date.parse(`${HOY}T00:00:00Z`) - dias * 86_400_000);
    return d.toISOString().slice(0, 10);
  };

  it('justo dentro: ni caduca aquí ni la puerta se queja de la edad', () => {
    const justa = historia({ publishedAt: edad(DIAS_VENTANA_AUTOPUBLICACION) });
    expect(motivosPermanentes(justa, { today: HOY })).toEqual([]);
    const puerta = canAutoPublish(justa, { today: HOY });
    expect(puerta.reasons.some((r) => /demasiado vieja/.test(r))).toBe(false);
  });

  it('un día fuera: caduca aquí y la puerta también la rechaza por edad', () => {
    const pasada = historia({ publishedAt: edad(DIAS_VENTANA_AUTOPUBLICACION + 1) });
    expect(motivosPermanentes(pasada, { today: HOY })).toHaveLength(1);
    const puerta = canAutoPublish(pasada, { today: HOY });
    expect(puerta.reasons.some((r) => /demasiado vieja/.test(r))).toBe(true);
  });
});

describe('el reparto de la mesa', () => {
  it('separa lo que espera decisión de lo que ya no', () => {
    const { ambiguas, caducadas } = repartirMesa(
      [
        historia({ key: 'fresca' }),
        historia({ key: 'vieja', publishedAt: '2026-06-01' }),
        historia({ key: 'integracion', verification: { ...historia().verification, scope: 'integration' } }),
      ],
      { today: HOY }
    );

    expect(ambiguas.map((s) => s.key)).toEqual(['fresca']);
    expect(caducadas.map((c) => c.story.key)).toEqual(['vieja', 'integracion']);
  });

  it('cada caducada lleva su motivo, que es lo que la hace rastreable', () => {
    const { caducadas } = repartirMesa([historia({ publishedAt: '2026-01-01' })], { today: HOY });
    expect(caducadas[0]!.motivos[0]).toMatch(/fuera de la ventana/);
  });

  it('conserva el orden dentro de cada grupo', () => {
    const stories = [
      historia({ key: 'a' }),
      historia({ key: 'b', publishedAt: '2026-01-01' }),
      historia({ key: 'c' }),
      historia({ key: 'd', publishedAt: '2026-02-01' }),
    ];
    const { ambiguas, caducadas } = repartirMesa(stories, { today: HOY });
    expect(ambiguas.map((s) => s.key)).toEqual(['a', 'c']);
    expect(caducadas.map((c) => c.story.key)).toEqual(['b', 'd']);
  });

  it('una mesa vacía no inventa nada', () => {
    expect(repartirMesa([], { today: HOY })).toEqual({ ambiguas: [], caducadas: [] });
  });
});
