import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Ninguna `var(--algo)` puede apuntar a un token que no existe.
 *
 * Es el error más silencioso del proyecto y ya ha aparecido dos veces. La
 * primera, `AccessBadge` citaba seis variables inventadas: cada `var()` caía en
 * su valor de reserva, y la línea del esfuerzo quedó en 1,11:1 sobre fondo
 * oscuro. La segunda, la etiqueta de tipo de /agentes pedía `--surface-2` y
 * `--radius-pill`, que tampoco existen — el resultado era una etiqueta sin
 * fondo y con las esquinas rectas.
 *
 * Lo que hace que se cuele es que no rompe nada: el navegador no avisa, la
 * página se pinta, y hasta el medidor de contraste puede aprobarlo porque un
 * fondo transparente compone contra el de la tarjeta. Sólo se ve mirando el
 * píxel, o comprobando el nombre. Esto último es más barato.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** Los ficheros donde se declaran los tokens del sistema. */
const HOJAS = ['src/styles/global.css'];

function fuentes(dir: string, out: string[] = []): string[] {
  for (const entrada of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${entrada}`;
    if (statSync(join(ROOT, rel)).isDirectory()) fuentes(rel, out);
    else if (/\.(astro|css)$/.test(entrada)) out.push(rel);
  }
  return out;
}

/*
 * Se declaran donde empiezan la línea o el bloque: `--x: valor`. Se excluye el
 * caso `var(--x, --y)` —la reserva— porque no declara nada.
 */
/*
 * Una propiedad se declara de tres formas, y las tres cuentan.
 *
 * En CSS, dentro de un bloque. Desde un guion, con `setProperty`. Y en un
 * atributo `style` en línea —``style={`--logo-h: ${h}`}``—, que es como el
 * monograma de la tarjeta recibe su tono. Ahí el nombre no viene precedido de
 * `;` ni de `{`, sino de una comilla, y por eso la primera versión de esta
 * prueba lo denunciaba como inventado.
 */
const DECLARA = /(^|[;{\s"'`])(--[a-zA-Z0-9-]+)\s*:/g;
const USA = /var\(\s*(--[a-zA-Z0-9-]+)/g;
/** Las que un guion escribe en tiempo de ejecución también existen. */
const ESCRIBE = /setProperty\(\s*['"`](--[a-zA-Z0-9-]+)/g;

const declarados = new Set<string>();
for (const hoja of HOJAS) {
  const css = readFileSync(join(ROOT, hoja), 'utf8');
  for (const m of css.matchAll(DECLARA)) declarados.add(m[2]!);
}

/*
 * `--strength` no aparece en ninguna hoja y no es un error: la escribe
 * `public/auth-form.js` con `setProperty` según lo que se teclea. Una variable
 * que un guion rellena está tan declarada como una que declara el CSS, y sólo
 * se distingue de un nombre inventado mirando quién la escribe.
 */
for (const guion of readdirSync(join(ROOT, 'public'))) {
  if (!guion.endsWith('.js')) continue;
  const js = readFileSync(join(ROOT, 'public', guion), 'utf8');
  for (const m of js.matchAll(ESCRIBE)) declarados.add(m[1]!);
}

describe('los tokens de CSS', () => {
  it('la hoja global declara los suyos', () => {
    expect(declarados.size).toBeGreaterThan(50);
  });

  it('ningún componente pide un token que no existe', () => {
    const huerfanos: string[] = [];

    for (const fichero of [...fuentes('src/components'), ...fuentes('src/pages'), ...fuentes('src/layouts')]) {
      const texto = readFileSync(join(ROOT, fichero), 'utf8');

      /*
       * Los tokens que el propio fichero declara valen: un componente puede
       * definirse variables locales sin subirlas al sistema.
       */
      const propios = new Set([
        ...[...texto.matchAll(DECLARA)].map((m) => m[2]!),
        ...[...texto.matchAll(ESCRIBE)].map((m) => m[1]!),
      ]);

      for (const uso of texto.matchAll(USA)) {
        const nombre = uso[1]!;
        if (declarados.has(nombre) || propios.has(nombre)) continue;
        huerfanos.push(`${fichero}: var(${nombre})`);
      }
    }

    expect(huerfanos, 'estas variables no están declaradas en ninguna parte').toEqual([]);
  });
});
