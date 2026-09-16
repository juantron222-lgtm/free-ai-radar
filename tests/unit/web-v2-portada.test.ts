import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getAllTools } from '@lib/data/catalog';
import { usableFreeNow } from '@lib/data/category-page';
import { conteosDeDecision, filaDe, recomendadas } from '@lib/data/portada';
import { MOTIVO_LABEL, motivoDelHueco } from '@lib/domain/evidencia';
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

  it('las recomendadas sólo son fichas usables hoy y comprobadas, sin repetir', () => {
    const lista = recomendadas(5);
    expect(lista).toHaveLength(5);
    expect(new Set(lista.map((r) => r.fila.slug)).size).toBe(lista.length);
    // Una por clase de IA: es lo que promete el criterio escrito encima.
    expect(new Set(lista.map((r) => r.clase)).size).toBe(lista.length);

    for (const { tool, fila, clase } of lista) {
      expect(fila.slug).toBe(tool.slug);
      expect(VERTICALS.map((v) => v.label), `${fila.slug} sin clase legible`).toContain(clase);
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

  it('lo que falta dice de quién es el hueco, con las palabras del comparador', () => {
    /*
     * Decía «Sin verificar» en todas las celdas desconocidas, también cuando el
     * fabricante no lo publica y la ficha, tres filas más abajo, lo decía así.
     */
    const campos = [
      ['tarjeta', 'freePlan.requiresCreditCard', 'requiresCreditCard'],
      ['registro', 'freePlan.requiresSignup', 'requiresSignup'],
      ['comercial', 'freePlan.commercialUse', 'commercialUse'],
    ] as const;
    let noPublicados = 0;
    for (const tool of tools) {
      const fila = filaDe(tool);
      for (const [clave, field, campo] of campos) {
        const c = fila[clave];
        expect(c.etiqueta, `${tool.slug} · ${clave}`).not.toBe('Sin verificar');
        if (tool.freePlan[campo] !== 'unverified') {
          expect(c.motivo, `${tool.slug} · ${clave}`).toBeUndefined();
          continue;
        }
        const motivo = motivoDelHueco(tool, field, 'unverified');
        expect(c.motivo, `${tool.slug} · ${clave}`).toBe(motivo);
        expect(c.etiqueta, `${tool.slug} · ${clave}`).toBe(MOTIVO_LABEL[motivo!]);
        if (motivo === 'no_publicado') noPublicados++;
      }
    }
    expect(noPublicados, 'las evidencias not_published tienen que verse').toBeGreaterThan(0);
    expect(codigo('src/components/home/PuertaBuscar.astro')).not.toContain('Sin verificar');
  });

  it('la portada dice qué la diferencia, en una línea', () => {
    /*
     * La hero era deliberadamente mínima y no decía en ninguna parte por qué
     * este catálogo y no una lista de «las 50 mejores IA». Una línea, no el
     * párrafo que se quitó: si crece, vuelve a ser lo que se retiró.
     */
    const home = codigo('src/pages/index.astro');
    const linea = home.match(/<p class="hero-diferencial">([\s\S]*?)<\/p>/)?.[1]?.replace(/\s+/g, ' ').trim();
    expect(linea, 'la hero no dice qué la diferencia').toBeTruthy();
    expect(linea!.length, `son ${linea!.length} caracteres`).toBeLessThanOrEqual(220);
    expect(linea).toMatch(/fabricante/);
    expect(linea).toMatch(/no publica/);
  });

  it('la puerta del catálogo no es otro buscador', () => {
    /*
     * Llevaba su propia caja, la tercera de la portada contando la hero y la
     * cabecera. Ahora filtra y recomienda; buscar se hace arriba.
     */
    const puerta = codigo('src/components/home/PuertaBuscar.astro');
    expect(puerta).not.toContain('role="search"');
    expect(puerta).not.toContain('name="q"');
    expect(puerta).toContain('conteos.filter');
    expect(puerta).toContain('Ver todas las herramientas');
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

  it('en la portada la cabecera no lleva buscador: el de la hero es el de entrada', () => {
    const cabecera = codigo('src/components/site/Header.astro');
    expect(cabecera).toMatch(/enPortada = ruta === ROUTES\.home/);
    expect(cabecera).toMatch(/\{conBuscador && \(\s*<form class="header-search"/);
    expect(cabecera).toMatch(/\{conLupa && \(\s*<button/);
    expect(codigo('src/pages/index.astro')).toContain('class="hero-buscar" role="search"');
  });

  it('el buscador global es un formulario GET al catálogo, en el resto de páginas', () => {
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

  it('las seis verticales salen una vez: en la hero, no otra vez más abajo', () => {
    const portada = codigo('src/pages/index.astro');
    expect(portada).not.toContain('FilaVerticales');
    expect(portada.match(/VERTICALS\.find/g) ?? []).toHaveLength(1);
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
