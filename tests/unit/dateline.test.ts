import { describe, expect, it } from 'vitest';
import { VENTANA_CABECERA, fechaVisible } from '../../scripts/dateline.mjs';

/**
 * El lector de fechas visibles, probado sobre todo por lo que se niega a leer.
 *
 * Una fecha equivocada aquí es peor que ninguna: `canAutoPublish` mide la edad
 * de la historia, así que darle frescura falsa a algo viejo colaría por detrás
 * lo que la puerta rechaza por delante. Por eso casi todos los casos de abajo
 * comprueban que devuelve `null`.
 */

const HOY = new Date('2026-09-08T00:00:00Z');
const leer = (t: string) => fechaVisible(t, { hoy: HOY });

describe('lo que sí es una fecha de publicación', () => {
  it('la que Anthropic imprime junto al titular', () => {
    expect(leer('News Product Introducing Claude Opus 5 Jul 24, 2026 Claude Opus 5 is available')).toEqual(
      { value: '2026-07-24', quote: 'Jul 24, 2026' }
    );
  });

  it('el mes escrito entero', () => {
    expect(leer('Partnership August 12, 2026 Groq Becomes')).toMatchObject({ value: '2026-08-12' });
  });

  it('el día delante, como se escribe en Europa', () => {
    expect(leer('Publicado el 24 July 2026 por el equipo')).toMatchObject({ value: '2026-07-24' });
  });

  it('en español', () => {
    expect(leer('Actualizado 3 de septiembre de 2026 en el blog')).toMatchObject({
      value: '2026-09-03',
    });
  });

  it('en ISO', () => {
    expect(leer('Changelog 2026-09-02 Self-hosted machines')).toMatchObject({ value: '2026-09-02' });
  });

  it('gana la que aparece antes, no la del patrón que se pruebe primero', () => {
    /*
     * La de la cabecera es la del artículo. Si la segunda ganara, una mención
     * dentro del primer párrafo desplazaría a la fecha real.
     */
    expect(leer('Sep 2, 2026 · Changelog. Comparado con 2026-01-15, esto es nuevo.')).toMatchObject({
      value: '2026-09-02',
    });
  });

  it('devuelve la cita literal, no una fecha reformateada', () => {
    /* Es lo que la convierte en evidencia y no en una conclusión nuestra. */
    expect(leer('Home Blog Recraft V4.1 May 14, 2026 • min read')!.quote).toBe('May 14, 2026');
  });
});

describe('lo que se niega a leer', () => {
  it('una fecha ambigua en cifras', () => {
    /*
     * `03/04/2026` es 3 de abril para media Europa y 4 de marzo para Estados
     * Unidos, y aquí se cubren fabricantes de los dos sitios. No hay forma de
     * acertar, así que no se intenta.
     */
    expect(leer('Publicado 03/04/2026 por el equipo')).toBeNull();
  });

  it('una fecha del futuro', () => {
    expect(leer('Únete al evento Dec 1, 2027 en San Francisco')).toBeNull();
  });

  it('una fecha de hace más de una década', () => {
    expect(leer('Fundada en Jan 1, 2011, la empresa')).toBeNull();
  });

  it('un día que no existe', () => {
    expect(leer('Publicado Feb 31, 2026')).toBeNull();
  });

  it('nada, cuando no hay ninguna', () => {
    expect(leer('Un artículo sin fecha por ninguna parte')).toBeNull();
  });

  it('una fecha que está en el cuerpo y no en la cabecera', () => {
    /*
     * El caso que obliga a la ventana: «en enero de 2024 lanzamos...» es una
     * frase del artículo, no su fecha de publicación.
     */
    const cuerpo = 'x'.repeat(VENTANA_CABECERA) + ' Como contamos el Jan 15, 2026, aquello salió bien';
    expect(leer(cuerpo)).toBeNull();
  });

  it('texto vacío o ausente', () => {
    expect(leer('')).toBeNull();
    expect(fechaVisible(undefined as unknown as string, { hoy: HOY })).toBeNull();
  });
});

describe('la ventana se mide sobre texto normalizado', () => {
  it('el HTML sin colapsar no empuja la fecha fuera de la ventana', () => {
    /*
     * Esta versión llegó a existir sin encontrar una sola fecha. La ventana se
     * calibró sobre texto legible, y quien llamaba pasaba texto con los saltos
     * y sangrías del HTML original: la misma fecha estaba en el carácter 172 de
     * uno y más allá del 4000 del otro. Colapsar aquí es lo que hace que la
     * ventana signifique lo mismo la llame quien la llame.
     */
    const conRuido = `Cabecera${'   \n'.repeat(1500)}Publicado Jul 24, 2026 sobre el modelo`;
    expect(conRuido.length).toBeGreaterThan(VENTANA_CABECERA);
    expect(leer(conRuido)).toMatchObject({ value: '2026-07-24' });
  });

  it('no lee una fecha del cuerpo aunque el texto venga sin colapsar', () => {
    /* Colapsar no puede convertirse en «buscar en todo el documento». */
    const cuerpo = 'palabra '.repeat(VENTANA_CABECERA) + ' Como dijimos el Jan 15, 2026, aquello';
    expect(leer(cuerpo)).toBeNull();
  });
});

describe('el margen alrededor de hoy', () => {
  it('acepta hoy mismo', () => {
    expect(leer('Sep 8, 2026 novedad')).toMatchObject({ value: '2026-09-08' });
  });

  it('acepta un día por delante, porque las zonas horarias existen', () => {
    /* Un fabricante en Asia publica «9 de septiembre» cuando aquí es el 8. */
    expect(leer('Sep 9, 2026 novedad')).toMatchObject({ value: '2026-09-09' });
  });

  it('no acepta una semana por delante', () => {
    expect(leer('Sep 20, 2026 novedad')).toBeNull();
  });
});
