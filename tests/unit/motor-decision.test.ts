import { describe, expect, it } from 'vitest';
import { getAllTools } from '@lib/data/catalog';
import { construirFichasMotor } from '@lib/decision/fichas';
import {
  decidir,
  EXIGENCIAS,
  IDS_DE_EXIGENCIA,
  IDS_DE_TAREA,
  leerConsulta,
  TAREAS,
  urlDeConsulta,
  type Consulta,
  type FichaMotor,
  type Hecho,
  type IdDeExigencia,
  type Respuesta,
} from '@lib/decision/motor';

/**
 * El motor de decisión: las reglas que no puede romper nunca.
 *
 * Las pruebas de verdad corren sobre el catálogo real y sobre todas las
 * consultas posibles —las doce tareas por las 64 combinaciones de
 * exigencias—, porque un motor que acierta en tres ejemplos y miente en el
 * cuarto es peor que no tener motor.
 */

const tools = getAllTools();
const fichas = construirFichasMotor(tools);
const porSlug = new Map(tools.map((t) => [t.slug, t]));

/** Todas las combinaciones de exigencias: 2⁶ = 64. */
const COMBINACIONES: IdDeExigencia[][] = Array.from({ length: 2 ** IDS_DE_EXIGENCIA.length }, (_, n) =>
  IDS_DE_EXIGENCIA.filter((_, i) => n & (1 << i))
);
const TODAS: Array<{ consulta: Consulta; respuesta: Respuesta }> = TAREAS.flatMap((tarea) =>
  COMBINACIONES.map((exigencias) => {
    const consulta: Consulta = { tarea: tarea.id, exigencias };
    return { consulta, respuesta: decidir(fichas, consulta) };
  })
);
const aFavor = (r: Respuesta) => [...r.recomendadas, ...r.tambien];

/** El valor confirmado de la ficha que cada exigencia exige. */
const CONFIRMA: Record<IdDeExigencia, (slug: string) => boolean> = {
  'sin-tarjeta': (s) => porSlug.get(s)!.freePlan.requiresCreditCard === 'no',
  'sin-registro': (s) => porSlug.get(s)!.freePlan.requiresSignup === 'no',
  comercial: (s) => porSlug.get(s)!.freePlan.commercialUse === 'yes',
  'sin-marca': (s) => porSlug.get(s)!.freePlan.hasWatermark === 'no',
  'en-local': (s) => porSlug.get(s)!.hosting !== 'cloud',
  abierto: (s) => porSlug.get(s)!.openSource === 'yes',
};

describe('las tareas', () => {
  it('cada tarea del motor es una intención del buscador, con sus capacidades', () => {
    expect(TAREAS.map((t) => t.id)).toEqual([...IDS_DE_TAREA]);
    for (const t of TAREAS) expect(t.capacidades.length).toBeGreaterThan(0);
  });
});

describe('las reglas que no se rompen, en todas las consultas posibles', () => {
  it('nunca recomienda nada con un hecho en contra comprobado', () => {
    for (const { respuesta } of TODAS) {
      for (const r of [...aFavor(respuesta), ...respuesta.posibles]) {
        for (const id of respuesta.exigencias) expect(r.ficha.hechos[id].estado, `${r.ficha.slug} · ${id}`).not.toBe('no-cumple');
      }
    }
  });

  it('una recomendada cumple cada exigencia con el dato confirmado en su ficha, e incluye la tarea gratis con cita', () => {
    for (const { respuesta } of TODAS) {
      for (const r of aFavor(respuesta)) {
        expect(r.gratis).toBe('incluida');
        expect(r.dudas).toEqual([]);
        for (const id of respuesta.exigencias) expect(CONFIRMA[id](r.ficha.slug), `${r.ficha.slug} · ${id}`).toBe(true);
      }
    }
  });

  it('lo que no consta nunca cuenta como sí: baja a «posibles» con su duda escrita', () => {
    for (const { respuesta } of TODAS) {
      for (const r of respuesta.posibles) {
        expect(r.dudas.length, r.ficha.slug).toBeGreaterThan(0);
        const sinConfirmar = respuesta.exigencias.filter((id) => r.ficha.hechos[id].estado !== 'cumple');
        for (const id of sinConfirmar) expect(r.dudas).toContain(r.ficha.hechos[id].texto);
      }
    }
  });

  it('toda razón tiene fuente: una dirección y una fecha, y la cita si dice que es una cita', () => {
    for (const { respuesta } of TODAS) {
      for (const r of [...aFavor(respuesta), ...respuesta.posibles]) {
        for (const razon of r.razones) {
          expect(razon.fuente.url, razon.texto).toMatch(/^(https?:\/\/|\/herramientas\/)/);
          expect(razon.fuente.fecha, razon.texto).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          if (razon.fuente.tipo === 'cita') expect(razon.fuente.cita, razon.texto).toBeTruthy();
        }
      }
    }
  });

  it('una herramienta de pago o retirada nunca sale como recomendada ni como posible', () => {
    for (const { respuesta } of TODAS) {
      for (const r of [...aFavor(respuesta), ...respuesta.posibles]) expect([3, 4]).not.toContain(r.ficha.nivel);
    }
  });

  it('no pierde ni repite ninguna herramienta', () => {
    for (const { respuesta } of TODAS) {
      const candidatas = fichas.filter(
        (f) => f.nivel !== 4 && f.capacidades.some((c) => respuesta.tarea.capacidades.includes(c))
      );
      const vistas = [
        ...aFavor(respuesta),
        ...respuesta.posibles,
        ...respuesta.siPagas,
      ].map((r) => r.ficha.slug).concat(respuesta.descartadas.flatMap((d) => d.fichas.map((f) => f.slug)));
      expect(new Set(vistas).size).toBe(vistas.length);
      expect(vistas.length).toBe(candidatas.length);
    }
  });

  it('la misma consulta da la misma respuesta, venga como venga ordenado el catálogo', () => {
    const alReves = [...fichas].reverse();
    for (const { consulta, respuesta } of TODAS.filter((_, i) => i % 7 === 0)) {
      const otra = decidir(alReves, consulta);
      expect(aFavor(otra).map((r) => r.ficha.slug)).toEqual(aFavor(respuesta).map((r) => r.ficha.slug));
      expect(otra.posibles.map((r) => r.ficha.slug)).toEqual(respuesta.posibles.map((r) => r.ficha.slug));
    }
  });
});

describe('casos que ya nos han pasado', () => {
  it('«clonar una voz gratis» no recomienda ElevenLabs ni Cartesia: lo tienen sólo de pago', () => {
    const r = decidir(fichas, { tarea: 'clonar-voz', exigencias: [] });
    const dePago = r.siPagas.map((x) => x.ficha.slug);
    expect(dePago).toEqual(expect.arrayContaining(['elevenlabs', 'cartesia']));
    expect(aFavor(r).map((x) => x.ficha.slug)).not.toContain('elevenlabs');
  });

  it('la marca de agua no cuenta en una tarea que no produce imagen, vídeo ni audio', () => {
    const r = decidir(fichas, { tarea: 'programar', exigencias: ['sin-marca'] });
    expect(r.exigencias).toEqual([]);
    expect(r.ignoradas).toEqual(['sin-marca']);
  });
});

describe('con fichas de prueba', () => {
  const fuente = { tipo: 'cita' as const, url: 'https://ejemplo.test/precios', fecha: '2026-10-21', cita: 'Free plan' };
  const si = (texto: string): Hecho => ({ estado: 'cumple', texto, fuente });
  const base = (slug: string, cambios: Partial<Record<IdDeExigencia, Hecho>> = {}): FichaMotor => ({
    slug,
    nombre: slug,
    vertical: 'Audio',
    nivel: 0,
    acceso: 'Gratis real',
    esfuerzo: 'instant',
    esfuerzoTexto: 'Abres y usas',
    plataformas: ['web'],
    verificacion: 'verified',
    revisada: '2026-10-21',
    capacidades: ['transcription'],
    incluye: [{ capacidad: 'transcription', etiqueta: 'Transcripción', fuente }],
    excluye: [],
    limites: [],
    fuenteLimites: fuente,
    hechos: {
      'sin-tarjeta': si('No pide tarjeta'),
      'sin-registro': si('Se usa sin registrarse'),
      comercial: si('Permite uso comercial'),
      'sin-marca': si('Sin marca de agua'),
      'en-local': si('Funciona en tu equipo'),
      abierto: si('Código abierto'),
      ...cambios,
    },
  });

  it('una tarjeta sin comprobar no descarta ni recomienda: dice qué no sabemos', () => {
    const duda: Hecho = { estado: 'no-sabemos', texto: 'Tarjeta: el fabricante no lo publica' };
    const r = decidir([base('a', { 'sin-tarjeta': duda })], { tarea: 'transcribir', exigencias: ['sin-tarjeta'] });
    expect(r.recomendadas).toEqual([]);
    expect(r.posibles[0]!.dudas).toEqual(['Tarjeta: el fabricante no lo publica']);
  });

  it('sin la cita de inclusión, que haga la tarea no basta para recomendarla', () => {
    const r = decidir([{ ...base('a'), incluye: [] }], { tarea: 'transcribir', exigencias: [] });
    expect(r.recomendadas).toEqual([]);
    expect(r.posibles[0]!.dudas[0]).toMatch(/No consta si el plan gratuito incluye/);
  });

  it('el vacío honesto dice qué exigencia lo vacía y cuántas habría sin ella', () => {
    const pide: Hecho = { estado: 'no-cumple', texto: 'Pide tarjeta', fuente };
    const r = decidir([base('a', { 'sin-tarjeta': pide }), base('b', { 'sin-tarjeta': pide })], {
      tarea: 'transcribir',
      exigencias: ['sin-tarjeta', 'comercial'],
    });
    expect(r.recomendadas).toEqual([]);
    expect(r.descartadas).toEqual([expect.objectContaining({ exigencia: 'sin-tarjeta', texto: EXIGENCIAS['sin-tarjeta'].descartadas })]);
    expect(r.vaciaPor).toEqual({ exigencia: 'sin-tarjeta', sinElla: 2 });
  });

  it('recomienda tres y deja el resto en «también cumplen»', () => {
    const r = decidir(['a', 'b', 'c', 'd'].map((s) => base(s)), { tarea: 'transcribir', exigencias: [] });
    expect(r.recomendadas.map((x) => x.ficha.slug)).toEqual(['a', 'b', 'c']);
    expect(r.tambien.map((x) => x.ficha.slug)).toEqual(['d']);
  });
});

describe('la URL', () => {
  it('ida y vuelta: lo que se comparte es la misma consulta', () => {
    const consulta: Consulta = { tarea: 'transcribir', exigencias: ['sin-tarjeta', 'comercial'], donde: 'navegador' };
    const url = urlDeConsulta(consulta);
    expect(url).toBe('/elegir?tarea=transcribir&sin-tarjeta=1&comercial=1&donde=navegador');
    expect(leerConsulta(new URL(url, 'https://x.test').searchParams)).toEqual(consulta);
  });

  it('una tarea que no existe no es una consulta, y lo desconocido se ignora', () => {
    expect(leerConsulta(new URLSearchParams('tarea=inventada'))).toBeNull();
    expect(leerConsulta(new URLSearchParams('tarea=transcribir&sin-tarjeta=si&donde=luna'))).toEqual({
      tarea: 'transcribir',
      exigencias: [],
    });
  });
});
