import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import seed from '@/data/news/news.json';
import generated from '@/data/generated/news.json';
import { NewsItem, NewsImage, isPublishable, NEWS_IMAGE_MIN_WIDTH } from '@lib/domain/news';

const CARPETA = resolve(__dirname, '../../src/assets/noticias');
const base = NewsItem.parse(seed[0]);

const ilustracion = {
  file: 'ejemplo.webp',
  alt: 'Un radar verde sobre un fondo oscuro con puntos que representan servidores',
  kind: 'ilustracion-ia',
  generator: 'Modelo de ejemplo',
} as const;

describe('esquema de la imagen de una noticia', () => {
  it('una ilustración IA sin generador no pasa', () => {
    const { generator: _, ...sin } = ilustracion;
    expect(NewsImage.safeParse(sin).success).toBe(false);
    expect(NewsImage.safeParse(ilustracion).success).toBe(true);
  });

  it('una captura sin página o sin fecha no pasa', () => {
    const captura = { ...ilustracion, kind: 'captura-oficial', generator: undefined };
    expect(NewsImage.safeParse(captura).success).toBe(false);
    expect(NewsImage.safeParse({ ...captura, sourceUrl: 'https://example.com/a' }).success).toBe(false);
    expect(
      NewsImage.safeParse({ ...captura, sourceUrl: 'https://example.com/a', capturedAt: '2026-11-20' }).success
    ).toBe(true);
  });

  it('el archivo es un nombre suelto, sin rutas', () => {
    for (const file of ['../x.webp', 'carpeta/x.webp', 'X.WEBP', 'x.gif', 'x.svg']) {
      expect(NewsImage.safeParse({ ...ilustracion, file }).success, file).toBe(false);
    }
  });

  it('el texto alternativo no puede ser una etiqueta vacía', () => {
    expect(NewsImage.safeParse({ ...ilustracion, alt: 'imagen' }).success).toBe(false);
  });

  it('una captura tiene que ser de una fuente citada y no posterior a la comprobación', () => {
    const fuente = base.sources[0]!.url;
    const ok = { ...base, image: { file: 'c.png', alt: ilustracion.alt, kind: 'captura-oficial' as const, sourceUrl: fuente, capturedAt: base.checkedAt } };
    expect(isPublishable(ok).reasons).not.toContain('la captura no es de ninguna de las fuentes citadas');

    const ajena = { ...ok, image: { ...ok.image, sourceUrl: 'https://otra-web.example/pagina' } };
    expect(isPublishable(ajena).reasons).toContain('la captura no es de ninguna de las fuentes citadas');

    const tarde = { ...ok, image: { ...ok.image, capturedAt: '2099-01-01' } };
    expect(isPublishable(tarde).reasons).toContain('la captura es posterior a la fecha de comprobación');
  });

  it('una noticia sin imagen sigue siendo válida', () => {
    expect(NewsItem.safeParse({ ...seed[0], image: undefined }).success).toBe(true);
  });
});

/*
 * El estado real: lo que la redacción ha adjuntado.
 *
 * Cada imagen declarada existe, tiene tamaño para compartirse y para Google
 * Discover, y no hay archivos sueltos que nadie use.
 */
const conImagen = [...seed, ...generated]
  .map((n) => NewsItem.parse(n))
  .filter((n) => n.image);

const archivos = existsSync(CARPETA) ? readdirSync(CARPETA).filter((f) => !f.startsWith('.')) : [];

describe('imágenes adjuntas a noticias', () => {
  it.each(conImagen.map((n) => [n.slug, n.image!.file]))('%s: el archivo %s existe y tiene tamaño', async (_slug, file) => {
    const ruta = resolve(CARPETA, file);
    expect(existsSync(ruta), `falta src/assets/noticias/${file}`).toBe(true);

    const { width = 0, height = 0 } = await sharp(ruta).metadata();
    expect(width, `${file}: ${width} px de ancho, mínimo ${NEWS_IMAGE_MIN_WIDTH}`).toBeGreaterThanOrEqual(NEWS_IMAGE_MIN_WIDTH);
    const proporcion = width / height;
    expect(proporcion, `${file}: proporción ${proporcion.toFixed(2)}, se espera entre 1,6 y 2 (16:9 o parecido)`).toBeGreaterThanOrEqual(1.6);
    expect(proporcion).toBeLessThanOrEqual(2);

    expect(statSync(ruta).size, `${file} pesa más de 3 MB`).toBeLessThanOrEqual(3 * 1024 * 1024);
  });

  it('el texto alternativo no repite el titular', () => {
    for (const n of conImagen) expect(n.image!.alt.trim(), n.slug).not.toBe(n.title.trim());
  });

  it('no hay archivos sin noticia', () => {
    const usados = new Set(conImagen.map((n) => n.image!.file));
    expect(archivos.filter((f) => !usados.has(f))).toEqual([]);
  });

  it('dos noticias no comparten imagen', () => {
    // La misma noticia está en la semilla y en el generado: se cuenta por slug.
    const porSlug = new Map(conImagen.map((n) => [n.slug, n.image!.file]));
    const valores = [...porSlug.values()];
    expect(new Set(valores).size).toBe(valores.length);
  });
});
