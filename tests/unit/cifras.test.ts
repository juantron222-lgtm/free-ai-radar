import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getAllTools, getCatalogStats, getToolsByCategory, getPopulatedCategories } from '@lib/data/catalog';
import { cifraDe, cifrasDelCatalogo, devuelveElFiltro, fraseDeCobertura } from '@lib/data/cifras';
import { conteosDeDecision } from '@lib/data/portada';
import { produceMedios } from '@lib/domain/medios';
import { COLLECTIONS, getCollection, getCollectionTools, tieneAccesoGratuito } from '@lib/data/collections';

/**
 * Una sola fuente para cada cifra pública.
 *
 * La auditoría del 15 de septiembre leyó «Sin tarjeta 37» junto a «confirmado
 * en 38» y «Uso comercial 15» junto a «27». Eran cifras ciertas de cosas
 * distintas, calculadas en sitios distintos. Estas pruebas fijan que todas las
 * vistas beben del mismo cálculo y que la nota de cobertura suma el catálogo.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const tools = getAllTools();
const cifras = cifrasDelCatalogo(tools);

describe('las cifras del catálogo cuadran entre sí', () => {
  it('cada condición suma el catálogo: cumplen + no cumplen + sin dato', () => {
    for (const cifra of [cifras.sinTarjeta, cifras.sinRegistro, cifras.usoComercial]) {
      expect(cifra.cumplen + cifra.noCumplen + cifra.sinDato, cifra.clave).toBe(tools.length);
      expect(cifra.noCumplen, cifra.clave).toBeGreaterThanOrEqual(0);
      expect(cifra.enContra, cifra.clave).toBeLessThanOrEqual(cifra.noCumplen);
    }
  });

  it('el pie, la portada, las colecciones y el filtro dicen el mismo número', () => {
    const stats = getCatalogStats();
    const conteos = Object.fromEntries(conteosDeDecision(tools).map((c) => [c.clave, c.n]));

    expect(stats.noCard).toBe(cifras.sinTarjeta.cumplen);
    expect(stats.commercialUse).toBe(cifras.usoComercial.cumplen);
    expect(stats.openSource).toBe(cifras.openSource);

    expect(conteos['nocard']).toBe(cifras.sinTarjeta.cumplen);
    expect(conteos['nosignup']).toBe(cifras.sinRegistro.cumplen);
    expect(conteos['comm']).toBe(cifras.usoComercial.cumplen);
    expect(conteos['oss']).toBe(cifras.openSource);

    expect(getCollectionTools(getCollection('sin-tarjeta')!).length).toBe(cifras.sinTarjeta.cumplen);
    expect(getCollectionTools(getCollection('uso-comercial')!).length).toBe(cifras.usoComercial.cumplen);
    expect(getCollectionTools(getCollection('open-source')!).length).toBe(cifras.openSource);

    expect(devuelveElFiltro(tools, 'nocard')).toBe(cifras.sinTarjeta.cumplen);
  });

  it('las categorías cuentan con la misma función, sobre sus herramientas', () => {
    /*
     * Una herramienta cuenta también en sus categorías secundarias, así que la
     * suma no es el total: lo que se fija es que cada categoría usa la misma
     * función y que su cifra es la del filtro sobre esas mismas herramientas.
     */
    expect(readFileSync(join(ROOT, 'src/pages/categorias/index.astro'), 'utf8')).toContain("cifraDe('nocard', tools)");
    for (const categoria of getPopulatedCategories()) {
      const propias = getToolsByCategory(categoria.slug);
      expect(cifraDe('nocard', propias).cumplen, categoria.slug).toBe(devuelveElFiltro(propias, 'nocard'));
    }
  });

  it('cada casilla de condición tiene su cifra y su frase, también la marca de agua', () => {
    /*
     * El 22 de octubre de 2026 la marca de agua cruzó el 25 % de cobertura, el
     * panel de filtros pidió su frase de cobertura y no existía: el catálogo no
     * se generaba. Toda casilla que pueda llegar a «parcial» tiene que poder
     * contarse aquí.
     */
    // La marca de agua se cuenta entre lo que produce imagen, vídeo o audio (24 de octubre de 2026).
    const universo = { nocard: tools, nosignup: tools, nowm: tools.filter((t) => produceMedios(t.capabilities)), comm: tools };
    for (const clave of ['nocard', 'nosignup', 'nowm', 'comm'] as const) {
      const cifra = cifraDe(clave, tools);
      expect(cifra.cumplen, clave).toBe(devuelveElFiltro(tools, clave));
      expect(cifra.total, clave).toBe(universo[clave].length);
      expect(cifra.cumplen + cifra.noCumplen + cifra.sinDato, clave).toBe(universo[clave].length);
      expect(fraseDeCobertura(cifra).startsWith(`${cifra.cumplen} `), clave).toBe(true);
    }
    const panel = readFileSync(join(ROOT, 'src/components/discovery/FilterPanel.astro'), 'utf8');
    for (const clave of panel.matchAll(/key: '(\w+)'[^}]*field: '/g)) {
      expect(['nocard', 'nosignup', 'nowm', 'comm'], `${clave[1]} filtra un hecho y no tiene cifra`).toContain(clave[1]);
    }
  });

  it('la frase de cobertura empieza por el número del chip y suma el catálogo', () => {
    const frase = fraseDeCobertura(cifras.sinTarjeta);
    expect(frase.startsWith(`${cifras.sinTarjeta.cumplen} `)).toBe(true);
    const numeros = (frase.match(/\d+/g) ?? []).map(Number);
    expect(numeros.reduce((a, b) => a + b, 0)).toBe(tools.length);
  });
});

describe('«gratis» sólo donde hay acceso gratuito', () => {
  it('ninguna colección «IA gratis» contiene una herramienta sin plan gratuito, una prueba o una demo', () => {
    /* «IA gratis sin marca de agua» incluía Claude Code, que es sólo de pago. */
    for (const coleccion of COLLECTIONS) {
      if (!/gratis/i.test(coleccion.title)) continue;
      const colados = getCollectionTools(coleccion).filter((t) => !tieneAccesoGratuito(t));
      expect(colados.map((t) => `${t.slug} (${t.freeModel})`), coleccion.slug).toEqual([]);
    }
  });

  it('los títulos del catálogo, categorías y comparador no llaman «gratuitas» a todas', () => {
    /*
     * «Catálogo de 94 herramientas de IA gratuitas» con 9 sin plan gratuito.
     * Los títulos dicen ahora lo que hay: herramientas revisadas y qué dan gratis.
     */
    for (const ruta of [
      'src/pages/herramientas/index.astro',
      'src/pages/categorias/index.astro',
      'src/pages/categorias/[slug].astro',
      'src/pages/comparar.astro',
    ]) {
      expect(readFileSync(join(ROOT, ruta), 'utf8'), ruta).not.toMatch(/herramientas de (IA|\$\{[^}]+\}) gratuitas|\$\{category\.name\} gratis:/);
    }
  });

  it('una ficha sin plan gratuito no se titula «¿es gratis de verdad?»', () => {
    const ficha = readFileSync(join(ROOT, 'src/pages/herramientas/[slug].astro'), 'utf8');
    expect(ficha).toContain("tool.freeModel === 'paid_only'");
    expect(ficha).toContain('no tiene plan gratuito');
    expect(getAllTools().some((t) => t.freeModel === 'paid_only')).toBe(true);
  });

  it('«en local» no promete a las híbridas lo que sólo cumple lo local', () => {
    const local = getCollection('en-local')!;
    expect(getCollectionTools(local).some((t) => t.hosting === 'hybrid')).toBe(true);
    expect(local.lede).not.toMatch(/^Sin cuotas/);
    expect(local.description).not.toMatch(/sin límites de generación/);
  });
});

describe('nadie vuelve a contar por su cuenta', () => {
  /*
   * Contar «requiresCreditCard === 'no'» fuera de este módulo, de los filtros o
   * de la regla de una colección es exactamente cómo aparecieron dos cifras.
   */
  const PERMITIDOS = new Set([
    'src/lib/data/cifras.ts',
    'src/lib/search/filters.ts',
    'src/lib/data/collections.ts',
    'src/lib/data/category-page.ts',
    'src/lib/search/client-index.ts',
  ]);
  /* Contar en una variable y leer `.length` después también es contar por su cuenta. */
  const enVariable = /=\s*\w+\.filter\(\s*\(?\w+\)?\s*=>\s*\w+\.freePlan\.(requiresCreditCard|requiresSignup|commercialUse)\s*===\s*'(no|yes)'\s*\)\s*;/;

  function recorrer(dir: string): string[] {
    return readdirSync(dir).flatMap((nombre) => {
      const ruta = join(dir, nombre);
      return statSync(ruta).isDirectory() ? recorrer(ruta) : [ruta];
    });
  }

  it('no hay recuentos de tarjeta, registro, uso comercial u open source sueltos en páginas y componentes', () => {
    const sueltos: string[] = [];
    const recuento = /\.filter\(\s*\(?\w+\)?\s*=>\s*\w+\.(freePlan\.(requiresCreditCard|requiresSignup|commercialUse)|openSource)\s*===\s*'(no|yes)'\s*\)\s*\.length/;
    for (const fichero of recorrer(join(ROOT, 'src'))) {
      if (!/\.(ts|astro)$/.test(fichero)) continue;
      const rel = relative(ROOT, fichero).replace(/\\/g, '/');
      if (PERMITIDOS.has(rel) || rel.startsWith('src/pages/admin/')) continue;
      const texto = readFileSync(fichero, 'utf8');
      if (recuento.test(texto) || enVariable.test(texto)) sueltos.push(rel);
    }
    expect(sueltos).toEqual([]);
  });
});
