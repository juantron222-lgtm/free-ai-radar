import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getAllTools } from '@lib/data/catalog';
import { DEFAULT_SORT, SORT_OPTIONS, sortTools } from '@lib/search/filters';

/**
 * La nota sobre 100 no vuelve por la puerta de atrás.
 *
 * Se retiró de las fichas hace semanas y seguía viva en tres sitios que nadie
 * miraba: era el veredicto del comparador —«obtiene la puntuación más alta
 * (88/100)»—, el orden por defecto de todo el catálogo, y un desempate del
 * buscador. Ninguno de los tres se veía; los tres decidían.
 *
 * `scoreTotal` sigue existiendo como valor derivado porque el dato editorial
 * está en el catálogo, y ese es el motivo de que haga falta una prueba: nada
 * impide volver a ordenar por él salvo esto.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

function fuentes(dir: string, out: string[] = []): string[] {
  for (const entrada of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${entrada}`;
    if (statSync(join(ROOT, rel)).isDirectory()) fuentes(rel, out);
    else if (/\.(astro|ts)$/.test(entrada)) out.push(rel);
  }
  return out;
}

const VISTA = [...fuentes('src/pages'), ...fuentes('src/components'), ...fuentes('src/layouts')];

describe('ninguna página publica una nota', () => {
  it('no aparece «/100» en ningún texto', () => {
    const culpables = VISTA.filter((f) => /\/100/.test(readFileSync(join(ROOT, f), 'utf8')));
    expect(culpables).toEqual([]);
  });

  it('ninguna plantilla pinta `scoreTotal`', () => {
    /*
     * Se busca el uso, no la palabra: un comentario que explique por qué se
     * quitó es exactamente lo que queremos conservar.
     */
    const culpables = VISTA.filter((f) => {
      const texto = readFileSync(join(ROOT, f), 'utf8');
      return /\{[^}]*\bscoreTotal\b|score=\{|\.scoreTotal\s*[<>=)]/.test(texto);
    });
    expect(culpables).toEqual([]);
  });

  it('el catálogo no llega ordenado por la nota', () => {
    /*
     * `getAllTools()` alimenta la portada, el 404 y el explorador. Cuando
     * ordenaba por `scoreTotal`, las seis «destacadas» de la portada eran el
     * top-6 de una puntuación que ya no se publica.
     */
    const nombres = getAllTools().map((t) => t.name);
    const alfabetico = [...nombres].sort((a, b) => a.localeCompare(b, 'es'));
    expect(nombres).toEqual(alfabetico);
  });
});

describe('el lenguaje público sobre notas y rankings', () => {
  /*
   * No basta con no pintar el número: mientras el sitio siguiera explicando
   * «los cinco componentes», «la fórmula» o «la puntuación editorial», seguía
   * describiendo un sistema que ya no aplica. Estas frases sobrevivieron a dos
   * barridos porque vivían en transparencia, en afiliados y en la portada, no
   * en las páginas de catálogo.
   */
  const PROHIBIDAS = [
    /puntuación editorial/i,
    /la fórmula (entera|completa|está publicada)/i,
    /los cinco componentes/i,
    /mejor(es)? valorad/i,
    /mejor puntuación/i,
    /subir (de |una )?puntuación/i,
    /un punto de puntuación/i,
  ];

  it('ninguna página pública explica una nota que no publicamos', () => {
    const culpables: string[] = [];
    for (const fichero of VISTA) {
      const texto = readFileSync(join(ROOT, fichero), 'utf8')
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      for (const prohibida of PROHIBIDAS) {
        const m = texto.match(prohibida);
        if (m) culpables.push(`${fichero}: «${m[0]}»`);
      }
    }
    expect(culpables, 'lenguaje heredado de la nota sobre 100').toEqual([]);
  });
});

describe('el orden del explorador', () => {
  it('no ofrece ordenar por puntuación', () => {
    expect(SORT_OPTIONS.map((o) => o.key)).not.toContain('score');
    for (const opcion of SORT_OPTIONS) {
      expect(opcion.label, opcion.key).not.toMatch(/puntuaci/i);
    }
  });

  it('el orden por defecto es un hecho comprobable, no un juicio', () => {
    expect(DEFAULT_SORT).toBe('verified');
  });

  it('ningún orden desempata por la nota', () => {
    /*
     * Dos herramientas con la misma fecha se desempatan por nombre. Antes lo
     * hacían por `scoreTotal`, que es la forma silenciosa de seguir ordenando
     * por una nota retirada.
     */
    const tools = getAllTools();
    for (const clave of SORT_OPTIONS.map((o) => o.key)) {
      const ordenado = sortTools([...tools], clave);
      expect(ordenado.length, clave).toBe(tools.length);
    }

    const porFecha = sortTools([...tools], 'verified');
    for (let i = 1; i < porFecha.length; i++) {
      const previo = porFecha[i - 1]!;
      const actual = porFecha[i]!;
      if (previo.lastVerifiedAt !== actual.lastVerifiedAt) continue;
      expect(
        previo.name.localeCompare(actual.name, 'es') <= 0,
        `${previo.name} / ${actual.name} deben desempatar por nombre`
      ).toBe(true);
    }
  });
});
