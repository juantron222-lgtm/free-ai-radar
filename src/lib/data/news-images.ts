import type { ImageMetadata } from 'astro';
import type { NewsImage } from '@lib/domain/news';

/*
 * Las imágenes de noticias viven en `src/assets/noticias/`, no en `public/`.
 *
 * Desde `src/assets` Astro las procesa al compilar: sabe su tamaño (así el
 * navegador reserva el hueco y no salta nada al cargar) y las sirve en AVIF y
 * WebP al ancho que pide cada pantalla. Desde `public/` saldría el archivo tal
 * cual, que si viene de un generador suele pesar varios megas.
 */
const ARCHIVOS = import.meta.glob<{ default: ImageMetadata }>(
  '../../assets/noticias/*.{webp,png,jpg,jpeg}',
  { eager: true }
);

/** El archivo de la imagen, o `undefined` si no está en la carpeta. */
export function resolveNewsImage(image: Pick<NewsImage, 'file'>): ImageMetadata | undefined {
  return ARCHIVOS[`../../assets/noticias/${image.file}`]?.default;
}

/** Pie de la imagen: qué es y de dónde sale. Nunca se omite. */
export function newsImageCredit(image: NewsImage): string {
  if (image.kind === 'ilustracion-ia') {
    return `Ilustración generada con IA (${image.generator}). No es una imagen real del producto.`;
  }
  const host = image.sourceUrl ? new URL(image.sourceUrl).hostname.replace(/^www\./, '') : '';
  const fecha = image.capturedAt
    ? new Date(`${image.capturedAt}T00:00:00Z`).toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : '';
  return `Captura de ${host}, tomada el ${fecha}.`;
}

/** Etiqueta corta para la tarjeta. */
export const NEWS_IMAGE_BADGE = {
  'ilustracion-ia': 'Ilustración IA',
  'captura-oficial': 'Captura oficial',
} as const;
