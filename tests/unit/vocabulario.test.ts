import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getAllTools } from '@lib/data/catalog';
import { filaDe } from '@lib/data/portada';
import { MOTIVO_LABEL, etiquetaDeHecho, motivoDelHueco } from '@lib/domain/evidencia';
import { OPENNESS_LABEL, TRI_STATE_LABEL } from '@lib/domain/primitives';

/**
 * Lo que no sabemos se dice con las mismas palabras en todas partes.
 *
 * La auditoría contó ocho formas: «Sin verificar», «Sin comprobar», «El
 * fabricante no lo publica», «Sin analizar», «Sin confirmar», «Pendiente de
 * revisión», tres variantes de «parcial» y «No aplica». Algunas convivían en
 * la misma ficha para el mismo dato. Quedan tres para un dato —«Sin
 * comprobar», «El fabricante no lo publica», «No aplica»—, «Sin analizar» para
 * la prosa que no hemos escrito, y los tres estados de una ficha.
 *
 * Noticias y administración quedan fuera: tienen su propio vocabulario.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const FUERA = /^src\/(pages\/(noticias|admin)|lib\/(news|newsroom|amazon)|components\/news|lib\/domain\/news)/;

const sinComentarios = (texto: string) =>
  texto
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

function recorrer(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    return statSync(ruta).isDirectory() ? recorrer(ruta) : [ruta];
  });
}

const fuentes = recorrer(join(ROOT, 'src'))
  .filter((f) => /\.(ts|astro)$/.test(f))
  .map((f) => ({ rel: relative(ROOT, f).replace(/\\/g, '/'), texto: sinComentarios(readFileSync(f, 'utf8')) }))
  .filter(({ rel }) => !FUERA.test(rel) && !rel.startsWith('src/data/'));

describe('un solo vocabulario para lo que no sabemos', () => {
  it('nadie escribe «Sin verificar», «Sin confirmar» ni «Parcialmente verificada» a mano', () => {
    const sueltos = fuentes
      .filter(({ texto }) => /Sin verificar|Sin confirmar|sin confirmar'|Parcialmente verificada/.test(texto))
      .map(({ rel }) => rel)
      // La tabla de estados internos del registro no se publica.
      .filter((rel) => rel !== 'src/lib/domain/tool.ts');
    expect(sueltos).toEqual([]);
  });

  it('el valor de reserva dice lo mismo que el hueco nuestro', () => {
    expect(TRI_STATE_LABEL.unverified).toBe(MOTIVO_LABEL.pendiente);
    expect(OPENNESS_LABEL.unverified).toBe(MOTIVO_LABEL.pendiente);
  });

  it('la tabla de la ficha, el bloque de arriba y las tarjetas dicen lo mismo del mismo dato', () => {
    const campos = [
      ['tarjeta', 'freePlan.requiresCreditCard', 'requiresCreditCard'],
      ['registro', 'freePlan.requiresSignup', 'requiresSignup'],
      ['comercial', 'freePlan.commercialUse', 'commercialUse'],
    ] as const;
    for (const tool of getAllTools()) {
      const fila = filaDe(tool);
      for (const [clave, field, campo] of campos) {
        expect(fila[clave].etiqueta, `${tool.slug} · ${clave}`).toBe(etiquetaDeHecho(tool, field, tool.freePlan[campo]));
      }
    }
  });

  it('la ficha usa esa función en su tabla de condiciones y en privacidad', () => {
    const ficha = sinComentarios(readFileSync(join(ROOT, 'src/pages/herramientas/[slug].astro'), 'utf8'));
    for (const field of ['requiresCreditCard', 'requiresSignup', 'hasWatermark', 'commercialUse']) {
      expect(ficha).toContain(`etiquetaDeHecho(tool, 'freePlan.${field}'`);
    }
    expect(ficha).toContain("etiquetaDeHecho(tool, 'privacy.trainsOnUserData'");
    expect(ficha).not.toContain('TRI_STATE_LABEL[tool.freePlan.');
  });

  it('un hueco del fabricante nunca se escribe como un hueco nuestro', () => {
    let vistos = 0;
    for (const tool of getAllTools()) {
      const motivo = motivoDelHueco(tool, 'freePlan.requiresCreditCard', tool.freePlan.requiresCreditCard);
      if (motivo !== 'no_publicado') continue;
      vistos++;
      expect(etiquetaDeHecho(tool, 'freePlan.requiresCreditCard', 'unverified'), tool.slug).toBe(MOTIVO_LABEL.no_publicado);
    }
    expect(vistos).toBeGreaterThan(0);
  });
});
