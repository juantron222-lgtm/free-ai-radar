import type { APIRoute } from 'astro';
import { authorizeTrigger } from '@lib/newsroom/trigger';
import { runDailyNewsroom } from '@lib/newsroom/daily';
import { logger } from '@lib/observability/logger';

export const prerender = false;

/**
 * El informe diario no es una respuesta de formulario.
 *
 * `json()` de `@lib/api/respond` está pensado para el navegador y exige un
 * `message` legible. Aquí el cuerpo es el informe de la pasada, que lo lee una
 * máquina y a veces una persona mirando logs, así que se serializa tal cual.
 */
function informe(cuerpo: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(cuerpo, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/**
 * La ejecución diaria.
 *
 * Vercel Cron llama aquí una vez al día con el secreto en la cabecera. Lo único
 * que hace este fichero es autorizar, ejecutar y devolver el informe; todo lo
 * que decide algo vive en `@lib/newsroom/daily`, que es puro salvo por la red y
 * la base de datos, y se prueba por separado.
 *
 * No publica. Termina dejando borradores en la mesa, que es donde una persona
 * decide. Un cron que pudiera publicar sería exactamente el sistema que este
 * proyecto no quiere: uno donde nadie ha leído la fuente.
 */

export const GET: APIRoute = async (context) => {
  const verdict = authorizeTrigger(context.request);

  if (!verdict.ok) {
    /*
     * 404 y no 401: un endpoint de cron que responde «no autorizado» confirma
     * a quien sondea que existe y que hay un secreto que adivinar.
     */
    logger.warn('newsroom.cron_denied', { reason: verdict.reason });
    return new Response('No encontrado', { status: 404 });
  }

  const started = Date.now();

  try {
    const report = await runDailyNewsroom({ trigger: verdict.trigger });

    logger.info('newsroom.cron_finished', {
      trigger: verdict.trigger,
      status: report.status,
      ingested: report.ingested,
      ms: Date.now() - started,
    });

    return informe({ ok: report.status !== 'failed', ...report }, 200);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    logger.error('newsroom.cron_crashed', { error: detail });
    return informe({ ok: false, status: 'failed', errors: [detail] }, 500);
  }
};

/** El mismo trabajo, para dispararlo a mano con el mismo secreto. */
export const POST: APIRoute = GET;
