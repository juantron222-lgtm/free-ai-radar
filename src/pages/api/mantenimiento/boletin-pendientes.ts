import type { APIRoute } from 'astro';
import { json } from '@lib/api/respond';
import { borrarSuscripcionesPendientes, newsletterStats } from '@lib/data/inbox';
import { authorizeTrigger } from '@lib/newsroom/trigger';
import { logger } from '@lib/observability/logger';

export const prerender = false;

/**
 * TEMPORAL: contar y borrar las suscripciones del formulario falso.
 *
 * La base de producción no es alcanzable desde fuera del despliegue, así que
 * la única forma de contarlas sin pedirle a Juan que pegue SQL es que lo haga
 * el propio despliegue, detrás del mismo secreto que el cron. Se usa una vez
 * —contar, decírselo, borrar— y se retira en el commit siguiente.
 *
 * GET devuelve sólo cifras, ninguna dirección. POST `?confirmar=N` borra las
 * `pending` sólo si siguen siendo exactamente N. A quien no trae el secreto se
 * le contesta 404, como si no existiera.
 */
const noExiste = () => new Response('No encontrado', { status: 404 });

export const GET: APIRoute = async ({ request }) => {
  if (!authorizeTrigger(request).ok) return noExiste();
  const s = await newsletterStats();
  return json({
    ok: true,
    message: 'recuento',
    data: { pendientes: s.pending, confirmadas: s.confirmed, bajas: s.unsubscribed },
  });
};

export const POST: APIRoute = async ({ request, url }) => {
  if (!authorizeTrigger(request).ok) return noExiste();

  const esperadas = Number(url.searchParams.get('confirmar'));
  if (!Number.isInteger(esperadas) || esperadas < 0) {
    return json({ ok: false, message: 'Falta ?confirmar=<número de pendientes contadas>' }, 400);
  }

  const r = await borrarSuscripcionesPendientes(esperadas);
  logger.info('newsletter.pending_purged', { ok: r.ok, borradas: r.borradas, motivo: r.motivo });
  return json(
    { ok: r.ok, message: r.ok ? 'borradas' : (r.motivo ?? 'no se borró nada'), data: { borradas: r.borradas } },
    r.ok ? 200 : 409
  );
};
