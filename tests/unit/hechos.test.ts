import { describe, expect, it } from 'vitest';
import {
  Hecho,
  exigenAtribucion,
  suficienteParaRedactar,
  verificarCitas,
} from '@lib/domain/hechos';

/**
 * El contrato de hechos del agente lector.
 *
 * Un agente falla de una forma que una expresión regular no puede: inventando
 * algo que suena bien. Casi todo lo que se prueba aquí es la barrera contra
 * eso — que la cita esté literalmente en el artículo — y el resto es la
 * distinción entre un dato, algo que dice el fabricante de sí mismo, y una
 * conclusión nuestra.
 */

const ARTICULO = 'https://mistral.ai/news/serie-d';

const hecho = (extra: Partial<Hecho> = {}): Hecho => ({
  afirmacion: 'Mistral ha levantado 3.000 millones de euros en una ronda de Serie D.',
  cita: 'Mistral today announced that it has raised €3 billion in a Series D funding round',
  fuente: ARTICULO,
  fecha: '2026-09-08',
  tipo: 'cifra',
  confianza: 'alta',
  naturaleza: 'dato',
  ...extra,
});

const CUERPO = {
  [ARTICULO]:
    'Company news. Mistral today announced that it has raised €3 billion in a Series D funding round ' +
    'at a post-money valuation of more than €21 billion, the largest equity fundraising round ever ' +
    'completed by a European technology company.',
};

describe('la cita tiene que estar en el artículo', () => {
  it('acepta la que aparece palabra por palabra', () => {
    expect(verificarCitas([hecho()], CUERPO)).toMatchObject({ ok: true, faltan: [] });
  });

  it('rechaza una paráfrasis presentada como cita', () => {
    /*
     * El fallo caro: el agente resume bien, la noticia se lee de maravilla y la
     * frase entrecomillada no existe. Aquí se cae, que es antes de publicarse.
     */
    const inventada = hecho({ cita: 'Mistral raised three billion euros from Samsung and others' });
    const r = verificarCitas([inventada], CUERPO);
    expect(r.ok).toBe(false);
    expect(r.faltan[0]).toMatch(/no aparece en/);
  });

  it('tolera comillas tipográficas, guiones largos y espacios de más', () => {
    /* El HTML y la prosa nunca coinciden en esto, y no es motivo para rechazar. */
    const conAdornos = hecho({
      cita: 'Mistral  today   announced that it has raised €3 billion in a Series D funding round',
    });
    expect(verificarCitas([conAdornos], CUERPO).ok).toBe(true);
  });

  it('una cita de una URL que no se descargó no pasa', () => {
    const otra = hecho({ fuente: 'https://otra.test/nota' });
    expect(verificarCitas([otra], CUERPO).ok).toBe(false);
  });

  it('marca cuál falla cuando hay varias', () => {
    const r = verificarCitas([hecho(), hecho({ cita: 'esto no está en ningún sitio del texto' })], CUERPO);
    expect(r.comprobadas.map((c) => c.literal)).toEqual([true, false]);
  });
});

describe('cuándo hay material para escribir', () => {
  const fecha = hecho({ tipo: 'fecha', afirmacion: 'Publicado el 8 de septiembre de 2026.' });
  const queHaPasado = hecho({ tipo: 'que-ha-pasado' });

  it('con fecha y algo que contar, sí', () => {
    expect(suficienteParaRedactar([fecha, queHaPasado])).toMatchObject({ ok: true });
  });

  it('sin nada que contar, no', () => {
    /*
     * Es el fallo del circuito anterior dicho al derecho: una fecha y una frase
     * de disponibilidad no son una noticia.
     */
    const disponibilidad = hecho({ tipo: 'disponibilidad' });
    const r = suficienteParaRedactar([fecha, disponibilidad]);
    expect(r.ok).toBe(false);
    expect(r.motivos).toContain('ningún hecho cuenta qué ha ocurrido: sólo hay metadatos');
  });

  it('sin fecha, no', () => {
    expect(suficienteParaRedactar([queHaPasado]).motivos).toContain(
      'no hay ningún hecho que fije la fecha de publicación'
    );
  });

  it('sólo con interpretaciones, no', () => {
    const interpretado = hecho({ tipo: 'que-ha-pasado', naturaleza: 'interpretacion' });
    const atribuido = hecho({ tipo: 'fecha', naturaleza: 'atribucion' });
    expect(suficienteParaRedactar([atribuido, interpretado]).motivos).toContain(
      'todo lo aportado es atribución o interpretación: no hay ningún dato'
    );
  });

  it('una lista vacía no da para nada', () => {
    expect(suficienteParaRedactar([]).ok).toBe(false);
  });
});

describe('lo que no puede afirmarse sin decir quién lo dice', () => {
  it('separa lo que el fabricante afirma de sí mismo', () => {
    /*
     * «La mayor ronda de una tecnológica europea» es publicable diciendo que lo
     * dice Mistral. Publicado a secas pasa a ser nuestro.
     */
    const suyo = hecho({
      afirmacion: 'Es la mayor ampliación de capital de una tecnológica europea.',
      naturaleza: 'atribucion',
    });
    expect(exigenAtribucion([hecho(), suyo])).toEqual([suyo]);
  });

  it('un dato no exige atribución', () => {
    expect(exigenAtribucion([hecho()])).toEqual([]);
  });
});

describe('la forma del hecho', () => {
  it('exige cita, fuente con URL y fecha', () => {
    expect(Hecho.safeParse({ ...hecho(), cita: '' }).success).toBe(false);
    expect(Hecho.safeParse({ ...hecho(), fuente: 'no-es-una-url' }).success).toBe(false);
    expect(Hecho.safeParse({ ...hecho(), fecha: '8 de septiembre' }).success).toBe(false);
  });

  it('acepta un hecho completo', () => {
    expect(Hecho.safeParse(hecho()).success).toBe(true);
  });
});
