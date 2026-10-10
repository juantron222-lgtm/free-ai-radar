import type { APIRoute } from 'astro';
import { getAllTools } from '@lib/data/catalog';
import { contarUso } from '@lib/data/uso';
import { checkRateLimit, clientKey } from '@lib/security/rate-limit';
import { EVENTOS_CON_CONSENTIMIENTO, claveDeUso, esEventoUso } from '@lib/uso';

export const prerender = false;

/**
 * Búsquedas, filtros y comparaciones, contados.
 *
 * Sólo de quien aceptó «Analítica» en el aviso de cookies, que es exactamente
 * lo que ese aviso promete («medición agregada de páginas vistas y
 * búsquedas»). El navegador no envía nada sin ese permiso, y aquí se vuelve a
 * mirar la cookie: un contador que se fiara del navegador contaría también a
 * quien dijo que no.
 *
 * Las salidas a la web oficial no entran por aquí: se cuentan al pasar por
 * /ir/<slug>, sin depender del navegador.
 *
 * Siempre contesta 204 y nunca dice por qué no ha contado algo: es un
 * contador, no un servicio que haya que poder sondear.
 */
const nada = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });

let slugs: Set<string> | null = null;

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.consent?.analytics) return nada();
  if (!checkRateLimit('uso', clientKey(request)).allowed) return nada();

  const texto = (await request.text().catch(() => '')).slice(0, 400);
  let cuerpo: { evento?: unknown; clave?: unknown };
  try {
    cuerpo = JSON.parse(texto) as typeof cuerpo;
  } catch {
    return nada();
  }

  const { evento } = cuerpo;
  if (!esEventoUso(evento) || !EVENTOS_CON_CONSENTIMIENTO.includes(evento)) return nada();

  slugs ??= new Set(getAllTools().map((t) => t.slug));
  const clave = claveDeUso(evento, String(cuerpo.clave ?? ''), slugs);
  if (clave) await contarUso(evento, clave).catch(() => false);
  return nada();
};
