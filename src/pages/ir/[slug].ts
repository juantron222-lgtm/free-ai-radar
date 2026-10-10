import type { APIRoute } from 'astro';
import { getTool } from '@lib/data/catalog';
import { contarUso } from '@lib/data/uso';

export const prerender = false;

/**
 * Salida hacia la web oficial de una herramienta, contada.
 *
 * Es la mejor señal de que la web sirve: alguien leyó una ficha y fue a usar
 * la herramienta. Se cuenta aquí, en el servidor, porque así no se guarda ni
 * se lee nada en el navegador de nadie: es un enlace nuestro que redirige,
 * como cualquier otro. Sólo se suma uno al total del día de esa herramienta.
 *
 * El destino es exactamente el de antes —`outboundUrl`, o la página de precios
 * con `?a=precios`—, y el enlace conserva su `rel`. Para que contar no retrase
 * a nadie, se espera como mucho 600 ms; si la base tarda más, se redirige
 * igual y ese clic no cuenta.
 */
const ESPERA_MAXIMA_MS = 600;

export const GET: APIRoute = async ({ params, url }) => {
  const tool = getTool(params['slug'] ?? '');
  if (!tool) return new Response('No encontrado', { status: 404 });

  const precios = url.searchParams.get('a') === 'precios' && Boolean(tool.pricingUrl);
  const destino = precios ? tool.pricingUrl! : tool.outboundUrl;

  await Promise.race([
    contarUso(precios ? 'precios' : 'salida', tool.slug).catch(() => false),
    new Promise((listo) => setTimeout(listo, ESPERA_MAXIMA_MS)),
  ]);

  return new Response(null, {
    status: 302,
    headers: {
      Location: destino,
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
};
