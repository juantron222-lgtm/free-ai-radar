import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getAllTools } from '@lib/data/catalog';
import { estadoComercial } from '@lib/data/affiliate';

/**
 * Nada promete una función que no existe.
 *
 * Las auditorías del 15 de septiembre encontraron «Pulsa Avisarme» cuando ese
 * botón ya no está, un panel que vendía «avisos en el momento, listas sin
 * límite, sin anuncios» de un Radar Pro que no se puede contratar, «pásate a
 * Radar Pro» en los mensajes de límite, y un pie que decía que algunos enlaces
 * podían ser de afiliación con cero enlaces de afiliación.
 *
 * Noticias queda fuera: su limpieza va aparte y está pendiente de autorización.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const sinComentarios = (texto: string) =>
  texto
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
const codigo = (ruta: string) => sinComentarios(readFileSync(join(ROOT, ruta), 'utf8'));

function recorrer(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    return statSync(ruta).isDirectory() ? recorrer(ruta) : [ruta];
  });
}

const fuentes = recorrer(join(ROOT, 'src'))
  .filter((f) => /\.(ts|astro)$/.test(f))
  .map((f) => ({ rel: relative(ROOT, f).replace(/\\/g, '/'), texto: sinComentarios(readFileSync(f, 'utf8')) }))
  .filter(({ rel }) => !rel.startsWith('src/pages/noticias/'));

describe('ninguna página promete lo que no existe', () => {
  it('nadie manda pulsar «Avisarme»: el botón no existe', () => {
    expect(fuentes.filter(({ texto }) => texto.includes('Avisarme')).map(({ rel }) => rel)).toEqual([]);
  });

  it('nadie vende Radar Pro como si se pudiera contratar', () => {
    const vende = /pásate a Radar Pro|Radar Pro las hace ilimitadas|Disponible con Radar Pro|Suscribirte a|Ver qué incluye/;
    expect(fuentes.filter(({ texto }) => vende.test(texto)).map(({ rel }) => rel)).toEqual([]);
  });

  it('los términos dicen que Radar Pro todavía no se puede contratar', () => {
    expect(codigo('src/pages/legal/terminos.astro')).toContain('Radar Pro todavía no se puede contratar');
  });
});

describe('lo comercial se dice con lo que hay', () => {
  it('el pie y «sobre el proyecto» salen del mismo recuento que la transparencia', () => {
    for (const ruta of ['src/components/site/Footer.astro', 'src/pages/sobre-el-proyecto.astro']) {
      expect(codigo(ruta), ruta).toContain('estadoComercial(getAllTools())');
    }
    expect(codigo('src/components/site/Footer.astro')).not.toContain('pueden ser de afiliación');
  });

  it('el recuento coincide con el de /transparencia-afiliados', () => {
    const tools = getAllTools();
    expect(estadoComercial(tools).enlacesDeAfiliacion).toBe(tools.filter((t) => t.affiliation.isAffiliate).length);
  });
});
