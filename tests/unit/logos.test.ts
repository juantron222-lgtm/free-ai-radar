import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { getAllTools } from '@lib/data/catalog';
import registro from '@/data/logos.json';

/**
 * Un logo mal traído es peor que ninguno.
 *
 * Enlazar el favicon de un tercero en tiempo de ejecución nos ata a que
 * mañana no lo cambie, manda a nuestros lectores a un dominio ajeno sin
 * decírselo y publica una imagen cuya procedencia no consta. Estas pruebas
 * guardan las cuatro condiciones que lo impiden: el activo es local, viene de
 * una fuente atribuible, existe de verdad, y si falta cualquier cosa la
 * tarjeta sigue entera.
 */

interface EntradaDeLogo {
  ruta: string;
  sourceUrl: string;
  sourceKind: string;
  obtenidoEl: string;
  bytes: number;
  placa?: string;
  descubiertoEn?: string;
}

const entradas = Object.entries(registro as Record<string, EntradaDeLogo>);
const tools = getAllTools();
const porSlug = new Map(tools.map((t) => [t.slug, t]));
const DIR = 'public/logos';

describe('el activo es nuestro y está aquí', () => {
  it('toda ruta apunta a nuestro propio dominio', () => {
    for (const [slug, meta] of entradas) {
      expect(meta.ruta, slug).toMatch(/^\/logos\/[a-z0-9-]+\.(svg|png|webp)$/);
      expect(meta.ruta, slug).not.toMatch(/^https?:/);
    }
    expect(entradas.length).toBeGreaterThan(0);
  });

  it('y el fichero existe de verdad', () => {
    for (const [slug, meta] of entradas) {
      const fichero = join(DIR, meta.ruta.replace('/logos/', ''));
      expect(existsSync(fichero), `${slug}: falta ${fichero}`).toBe(true);
      expect(statSync(fichero).size, slug).toBeGreaterThan(0);
    }
  });

  it('no hay ficheros huérfanos sin entrada en el registro', () => {
    /*
     * Un fichero en `public/logos` que nadie declara se sirve igual y nadie
     * sabe de dónde salió. Es exactamente el activo sin procedencia que esta
     * fase quiere evitar.
     */
    const declarados = new Set(entradas.map(([, m]) => m.ruta.replace('/logos/', '')));
    const huerfanos = existsSync(DIR) ? readdirSync(DIR).filter((f) => !declarados.has(f)) : [];
    expect(huerfanos).toEqual([]);
  });

  it('cada slug del registro corresponde a una ficha real', () => {
    for (const [slug] of entradas) {
      expect(porSlug.has(slug), `${slug} no está en el catálogo`).toBe(true);
    }
  });
});

describe('la procedencia consta', () => {
  it('cada activo dice de dónde vino, de qué clase y cuándo', () => {
    for (const [slug, meta] of entradas) {
      expect(meta.sourceUrl, slug).toMatch(/^https:\/\//);
      expect(meta.sourceKind, slug).toBeTruthy();
      expect(meta.obtenidoEl, slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('ninguna viene de un buscador de imágenes ni de un paquete de terceros', () => {
    const prohibidos =
      /google\.com\/imgres|images\.google|pinterest|freepik|flaticon|iconfinder|vectorlogo|worldvectorlogo|seeklogo|logos-download|wikimedia/i;
    for (const [slug, meta] of entradas) {
      expect(meta.sourceUrl, slug).not.toMatch(prohibidos);
    }
  });

  it('el anfitrión es el del producto, su forja, o la página oficial que lo enlaza', () => {
    /*
     * GitHub reparte sus iconos desde `githubassets.com` y Google desde
     * `gstatic.com`: quien atribuye no es el anfitrión sino la página oficial
     * que los referencia, y esa página queda anotada en `descubiertoEn`.
     */
    for (const [slug, meta] of entradas) {
      const tool = porSlug.get(slug)!;
      const anfitrion = new URL(meta.sourceUrl).hostname.replace(/^www\./, '');
      const oficial = new URL(tool.officialUrl).hostname.replace(/^www\./, '');

      const propio =
        anfitrion === oficial || anfitrion.endsWith(`.${oficial}`) || oficial.endsWith(`.${anfitrion}`);
      const forja = ['github.com', 'avatars.githubusercontent.com', 'huggingface.co'].includes(anfitrion);
      const referida = Boolean(meta.descubiertoEn);

      expect(propio || forja || referida, `${slug}: ${anfitrion} sin atribución`).toBe(true);
      if (referida) {
        expect(new URL(meta.descubiertoEn!).hostname.replace(/^www\./, ''), slug).toBe(oficial);
      }
    }
  });
});

describe('el peso no convierte la portada en una galería', () => {
  it('ningún activo pasa de 32 kB', () => {
    for (const [slug, meta] of entradas) {
      expect(meta.bytes, `${slug} pesa ${(meta.bytes / 1024).toFixed(1)} kB`).toBeLessThan(32 * 1024);
    }
  });

  it('el conjunto de la cohorte cabe holgadamente', () => {
    const total = entradas.reduce((n, [, m]) => n + m.bytes, 0);
    expect(total, `${(total / 1024).toFixed(1)} kB en total`).toBeLessThan(400 * 1024);
  });
});

describe('ningún componente pide un logo a un tercero', () => {
  const fuentes = [
    'src/components/tools/ToolLogo.astro',
    'src/components/catalog/ToolMention.astro',
    'src/components/discovery/ToolExplorer.astro',
    'src/pages/comparar.astro',
    'src/lib/search/client-index.ts',
  ];

  it('nadie construye una URL de icono en tiempo de ejecución', () => {
    /*
     * El atajo tentador es `https://www.google.com/s2/favicons?domain=…` o
     * `https://icon.horse/…`: una línea y salen los noventa y cuatro. Y cada
     * carga de página le cuenta a un tercero quién está mirando qué.
     */
    const atajos = /google\.com\/s2\/favicons|icon\.horse|favicone|besticon|duckduckgo\.com\/ip3|clearbit/i;
    for (const ruta of fuentes) {
      expect(readFileSync(ruta, 'utf8'), ruta).not.toMatch(atajos);
    }
  });

  it('ninguna ruta de logo del código apunta fuera de nuestro dominio', () => {
    for (const ruta of fuentes) {
      const fuente = readFileSync(ruta, 'utf8');
      for (const m of fuente.matchAll(/["'`](https?:\/\/[^"'`]*\/logos?\/[^"'`]*)["'`]/g)) {
        expect(m[1], `${ruta} enlaza un logo externo`).toBeUndefined();
      }
    }
  });
});

describe('el respaldo cubre lo que falta', () => {
  it('las fichas sin activo son la mayoría y no rompen nada', () => {
    const conLogo = entradas.length;
    expect(conLogo).toBeGreaterThanOrEqual(30);
    expect(conLogo).toBeLessThan(tools.length);

    // Y las que no lo tienen siguen teniendo nombre del que sacar iniciales.
    for (const tool of tools) {
      if ((registro as Record<string, unknown>)[tool.slug]) continue;
      expect(tool.name.trim().length, tool.slug).toBeGreaterThan(0);
    }
  });

  it('las seis verticales tienen representación en la cohorte', () => {
    const familias: Record<string, readonly string[]> = {
      imagen: ['imagen'],
      video: ['video'],
      audio: ['musica', 'voz'],
      codigo: ['codigo'],
      agentes: ['agentes'],
      modelos: ['modelos'],
    };
    for (const [nombre, slugs] of Object.entries(familias)) {
      const cuantas = entradas.filter(([slug]) => {
        const t = porSlug.get(slug)!;
        return slugs.includes(t.categorySlug) || t.secondaryCategories.some((c) => slugs.includes(c));
      }).length;
      expect(cuantas, `${nombre} no tiene ni un logo`).toBeGreaterThan(0);
    }
  });
});

describe('la placa se decide midiendo, no a ojo', () => {
  it('cada activo declara qué fondo necesita', () => {
    for (const [slug, meta] of entradas) {
      expect(['ninguna', 'clara', 'oscura', 'tema'], slug).toContain(meta.placa);
    }
  });

  it('hay marcas de los dos extremos, así que una sola placa no valdría', () => {
    /*
     * La comprobación que justifica el mecanismo: en la cohorte conviven
     * siluetas casi negras y casi blancas. Cualquier fondo único haría
     * desaparecer a unas o a otras.
     */
    const placas = entradas.map(([, m]) => m.placa);
    expect(placas).toContain('clara');
    expect(placas).toContain('oscura');
  });
});
