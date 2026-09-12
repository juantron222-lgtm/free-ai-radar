import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getAllTools } from '@lib/data/catalog';
import { usableFreeNow } from '@lib/data/category-page';
import { conteosDeDecision, filaDe, filasDeEvidencia, verticalesConCifra } from '@lib/data/portada';
import { verificacionDe } from '@lib/domain/verification';
import { EMPTY_FILTERS, applyFilters, parseFilters } from '@lib/search/filters';
import { PRIMARY_NAV, ROUTES, VERTICALS } from '@lib/nav';

/**
 * Web V2, fase 2: la portada dice qué se puede hacer y lo enseña.
 *
 * La anterior ofrecía cuatro listas para el mismo viaje —un buscador, seis
 * atajos, seis tarjetas y ocho enlaces en la cabecera— y cerraba con 350
 * palabras sobre por qué fiarse. Lo que se vigila aquí es que las tres puertas
 * lleven contenido comprobable y que ninguna cifra prometa algo distinto de lo
 * que devuelve al pulsarla.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const leer = (ruta: string) => readFileSync(join(ROOT, ruta), 'utf8');

/**
 * El código sin comentarios.
 *
 * Cada arreglo explica en su sitio qué se retiró, citando la frase vieja. Hay
 * que comprobar que nadie la ejecuta, no que nadie la nombra.
 */
const codigo = (ruta: string) =>
  leer(ruta)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
const tools = getAllTools();

describe('la puerta del catálogo enseña datos, no promesas', () => {
  it('cada casilla devuelve exactamente las que anuncia su cifra', () => {
    /*
     * El número y el filtro salían de sitios distintos: «Uso comercial 25» y
     * quince fichas al pulsarlo. Aquí se calcula la cifra y se ejecuta el
     * filtro de su propio enlace.
     */
    for (const conteo of conteosDeDecision(tools)) {
      const query = conteo.href.split('?')[1] ?? '';
      const devuelve = applyFilters(tools, {
        ...EMPTY_FILTERS,
        ...parseFilters(new URLSearchParams(query)),
      }).length;
      expect(devuelve, `«${conteo.etiqueta}» anuncia ${conteo.n} y devuelve ${devuelve}`).toBe(
        conteo.n
      );
    }
  });

  it('la tabla sólo enseña fichas usables hoy y comprobadas, sin repetir', () => {
    const filas = filasDeEvidencia(5);
    expect(filas).toHaveLength(5);
    expect(new Set(filas.map((f) => f.slug)).size).toBe(filas.length);

    for (const fila of filas) {
      const tool = tools.find((t) => t.slug === fila.slug)!;
      expect(usableFreeNow(tool), `${fila.slug} no se puede usar gratis hoy`).toBe(true);
      expect(verificacionDe(tool).state, `${fila.slug} está sin comprobar`).not.toBe('catalogada');
    }
  });

  it('el tono de cada condición sale de la pregunta, no del valor', () => {
    /*
     * «¿Pide tarjeta? No» es una buena noticia y «¿Uso comercial? No» es una
     * mala. Y «sin verificar» no es ninguna de las dos: es un hueco nuestro.
     */
    for (const tool of tools) {
      const fila = filaDe(tool);
      expect(fila.tarjeta.tono === 'bien', tool.slug).toBe(tool.freePlan.requiresCreditCard === 'no');
      expect(fila.registro.tono === 'bien', tool.slug).toBe(tool.freePlan.requiresSignup === 'no');
      expect(fila.comercial.tono === 'bien', tool.slug).toBe(tool.freePlan.commercialUse === 'yes');
      expect(fila.tarjeta.sinConfirmar, tool.slug).toBe(
        tool.freePlan.requiresCreditCard === 'unverified'
      );
    }
  });

  it('cada vertical enseña una cifra que existe', () => {
    const verticales = verticalesConCifra(tools);
    expect(verticales).toHaveLength(VERTICALS.length);
    for (const vertical of verticales) {
      expect(vertical.etiqueta, vertical.id).not.toBe(vertical.id);
      expect(vertical.n, `${vertical.etiqueta} sale vacía`).toBeGreaterThan(0);
      expect(vertical.n).toBeLessThanOrEqual(tools.length);
      expect(VERTICALS.some((v) => v.href === vertical.href)).toBe(true);
    }
  });
});

describe('la navegación es la lista de lo que se puede hacer', () => {
  it('la cabecera lleva cuatro entradas y ninguna vertical', () => {
    expect(PRIMARY_NAV.map((i) => i.href)).toEqual([
      ROUTES.tools,
      ROUTES.news,
      ROUTES.compare,
      ROUTES.methodology,
    ]);
    for (const vertical of VERTICALS) {
      expect(PRIMARY_NAV.map((i) => i.href)).not.toContain(vertical.href);
    }
  });

  it('el buscador global es un formulario GET al catálogo, en todas las páginas', () => {
    const cabecera = codigo('src/components/site/Header.astro');
    expect(cabecera).toContain('role="search"');
    expect(cabecera).toContain('action={ROUTES.tools}');
    expect(cabecera).toContain('name="q"');
    // Era una lupa que llevaba al ancla del catálogo: dos clics para escribir.
    expect(cabecera).not.toContain('#buscador');
  });

  it('las seis verticales siguen a un clic en el menú móvil', () => {
    expect(codigo('src/components/site/Header.astro')).toContain('VERTICALS.map');
  });
});

describe('la portada no cuenta el mismo viaje cuatro veces', () => {
  it('se han retirado la rejilla de intenciones y el bloque largo de confianza', () => {
    const portada = codigo('src/pages/index.astro');
    expect(portada).not.toContain('IntentCard');
    expect(portada).not.toContain('Por qué fiarte');
    expect(portada).not.toContain('home-grid');
  });

  it('la comparación se puede empezar desde la portada sin JavaScript', () => {
    const puerta = codigo('src/components/home/PuertaComparar.astro');
    expect(puerta).toContain('method="get"');
    expect(puerta.match(/name="t"/g) ?? []).toHaveLength(2);
    // Dos desplegables con el mismo nombre producen `?t=a&t=b`.
    expect(codigo('src/pages/comparar.astro')).toContain("getAll('t')");
  });

  it('la actualidad de la portada sólo lee Newsroom', () => {
    const puerta = codigo('src/components/home/PuertaActualidad.astro');
    expect(puerta).not.toMatch(/publicar|aprobar|factTrace|supabase/i);
    expect(codigo('src/pages/index.astro')).toContain('getLatestNews');
  });
});
