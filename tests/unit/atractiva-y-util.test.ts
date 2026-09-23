import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getAllTools } from '@lib/data/catalog';
import { VERTICALES, carasDe } from '@lib/data/home';
import { freeAccessLabel } from '@lib/data/category-page';
import { CATEGORIES, TAREA_DE_CATEGORIA } from '@lib/domain/taxonomy';
import { DEFAULT_SORT, SORT_OPTIONS, nivelDeAcceso, sortTools } from '@lib/search/filters';
import registro from '@/data/logos.json';

/**
 * Lo que hace el sitio más fácil de usar sin prometer nada nuevo.
 *
 * Tres cambios, y los tres salen de mirar el sitio como alguien que llega:
 * el catálogo abría con un modelo retirado; la primera pantalla de la
 * portada no enseñaba ni una herramienta; y la etiqueta más leída del
 * catálogo estaba en inglés.
 */

const tools = getAllTools();
const tieneLogo = (t: (typeof tools)[number]) =>
  Boolean(t.logo || (registro as Record<string, { ruta?: string }>)[t.slug]?.ruta);

describe('el catálogo empieza por lo que se puede usar', () => {
  const orden = sortTools([...tools], DEFAULT_SORT);

  it('la etiqueta dice lo que hace el orden', () => {
    const opcion = SORT_OPTIONS.find((o) => o.key === DEFAULT_SORT)!;
    expect(opcion.label).toMatch(/gratis/i);
    expect(opcion.label).toMatch(/empezar/i);
  });

  it('la primera fila se abre y se usa gratis, sin instalar nada', () => {
    /*
     * Con el orden por confirmaciones, la primera fila eran siete modelos de
     * pesos abiertos que exigen un centro de datos. Gratis, sí; para quien
     * llega, no.
     */
    for (const tool of orden.slice(0, 6)) {
      expect(nivelDeAcceso(tool), tool.slug).toBe(0);
      expect(['instant', 'signup'], `${tool.slug} exige instalar`).toContain(tool.startEffort);
    }
  });

  it('dentro de lo gratuito, lo técnico va después de lo que se abre', () => {
    const gratis = orden.filter((t) => nivelDeAcceso(t) === 0);
    const primeraTecnica = gratis.findIndex((t) => t.startEffort === 'technical');
    const ultimaConCuenta = gratis.findLastIndex((t) => t.startEffort === 'signup');
    expect(primeraTecnica).toBeGreaterThan(ultimaConCuenta);
  });

  it('el HTML sale ya en ese orden, sin esperar al script', () => {
    const explorador = readFileSync(
      new URL('../../src/components/discovery/ToolExplorer.astro', import.meta.url),
      'utf8'
    );
    expect(explorador).toMatch(/sortTools\(\[\.\.\.entrada\], DEFAULT_SORT\)/);
  });
});

describe('las puertas de la portada enseñan caras', () => {
  const usadas = new Set<string>();
  const puertas = VERTICALES.map((v) => ({ id: v.id, caras: carasDe(tools, v.slugs, tieneLogo, usadas) }));

  it('cada puerta tiene sus tres, y todas con logo de verdad', () => {
    for (const { id, caras } of puertas) {
      expect(caras.length, id).toBe(3);
      for (const t of caras) expect(tieneLogo(t), `${id}: ${t.slug} sin logo`).toBe(true);
    }
  });

  it('ninguna cara es de pago, está retirada o por comprobar', () => {
    for (const { id, caras } of puertas) {
      for (const t of caras) expect(nivelDeAcceso(t), `${id}: ${t.slug}`).toBe(0);
    }
  });

  it('ninguna cara se repite entre puertas', () => {
    /*
     * Sin esto, Agentes y Código enseñaban los mismos Cursor y Copilot, y
     * Vídeo se parecía a Imagen: seis puertas con tres caras no dicen nada si
     * las caras son las mismas.
     */
    const todas = puertas.flatMap((p) => p.caras.map((t) => t.slug));
    expect(new Set(todas).size).toBe(todas.length);
  });

  it('va primero lo que tiene esa vertical como categoría principal', () => {
    for (const v of VERTICALES) {
      const caras = puertas.find((p) => p.id === v.id)!.caras;
      const principales = caras.map((t) => (v.slugs as readonly string[]).includes(t.categorySlug));
      // Un «sí» nunca va detrás de un «no».
      expect([...principales].sort((a, b) => Number(b) - Number(a)), v.id).toEqual(principales);
    }
  });
});

describe('la pila de logos habla español', () => {
  const pila = readFileSync(
    new URL('../../src/components/tools/PilaDeLogos.astro', import.meta.url),
    'utf8'
  );
  const conjuncion = new Function(
    `return ${pila.match(/const conjuncion = (\(siguiente: string\) => [^;]+);/)![1]!.replace(': string', '')}`
  )() as (s: string) => string;

  it('«y» delante de casi todo, «e» delante del sonido /i/', () => {
    expect(conjuncion('Ideogram')).toBe('e');
    expect(conjuncion('Higgsfield')).toBe('e');
    expect(conjuncion('Krea')).toBe('y');
    expect(conjuncion('Aider')).toBe('y');
    // «hie-» suena /je/, no /i/: «agua y hielo».
    expect(conjuncion('Hierro')).toBe('y');
  });
});

describe('el catálogo no mezcla idiomas en sus etiquetas', () => {
  it('ninguna ficha dice «Free tier»', () => {
    /*
     * Era la única etiqueta del catálogo en inglés, y salía en diecisiete
     * fichas justo en la columna que se usa para decidir.
     */
    for (const tool of tools) {
      expect(freeAccessLabel(tool).kind, tool.slug).not.toMatch(/free tier/i);
    }
    const freemium = tools.filter((t) => t.freeModel === 'freemium');
    expect(freemium.length).toBeGreaterThan(0);
    for (const tool of freemium) expect(freeAccessLabel(tool).kind).toBe('Plan gratuito');
  });
});

describe('«Encaja si…» dice la tarea, no la etiqueta', () => {
  it('cada categoría tiene su frase, y ninguna repite el nombre de la etiqueta', () => {
    /*
     * La ficha escribía «Quieres trabajar con Imagen IA». Una categoría sin
     * frase se queda sin esa línea en vez de inventarse una, así que una
     * categoría nueva olvidada aquí sería una línea que desaparece en silencio.
     */
    for (const categoria of CATEGORIES) {
      const frase = TAREA_DE_CATEGORIA[categoria.slug];
      expect(frase, `${categoria.slug} sin frase`).toBeTruthy();
      expect(frase!, categoria.slug).toMatch(/^Quieres /);
      expect(frase!, `${categoria.slug} copia la etiqueta`).not.toContain(categoria.name);
    }
  });

  it('la ficha ya no pega el nombre de la categoría en la frase', () => {
    const ficha = readFileSync(
      new URL('../../src/pages/herramientas/[slug].astro', import.meta.url),
      'utf8'
    );
    expect(ficha).not.toMatch(/Quieres trabajar con \{category\.name\}/);
  });
});
