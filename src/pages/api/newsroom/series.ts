import type { APIRoute } from 'astro';
import { authorizeTrigger } from '@lib/newsroom/trigger';
import { readRuns } from '@lib/data/newsroom-store';
import { logger } from '@lib/observability/logger';
import { serieDeBandas } from '../../../../scripts/newsroom-cobertura.mjs';

export const prerender = false;

/**
 * Qué ha rendido cada banda de triaje durante los últimos días.
 *
 * Existe por una limitación que no tiene otra salida: la historia de producción
 * vive en `newsroom_runs`, y a esa base no llega ninguna máquina de desarrollo
 * —no hay credencial suya en ninguna parte, por diseño— ni la alcanzaría un
 * agente en la nube, cuyo clon del repositorio sólo lleva `.env.example`. El
 * único proceso que puede consultarla es este despliegue, que sí tiene la
 * service role. Así que el informe sale por aquí o no sale.
 *
 * **Es una ruta aparte y no un parámetro de `/api/cron/newsroom`, a propósito.**
 * Un modo de informe dentro del cron dependería de acertar un parámetro para no
 * ejecutar una pasada; aquí la garantía es estructural: este fichero no importa
 * `runDailyNewsroom`, así que no hay error de tecleo capaz de disparar una.
 *
 * Mismo secreto que el cron y mismo 404 al fallar: responder «no autorizado»
 * confirmaría a quien sondea que la ruta existe.
 *
 *   GET /api/newsroom/series?dias=7
 */

const DIAS_POR_DEFECTO = 7;
const DIAS_MAXIMO = 90;

export const GET: APIRoute = async (context) => {
  const verdict = authorizeTrigger(context.request);

  if (!verdict.ok) {
    logger.warn('newsroom.series_denied', { reason: verdict.reason });
    return new Response('No encontrado', { status: 404 });
  }

  const pedido = Number(context.url.searchParams.get('dias'));
  const dias = Number.isFinite(pedido) && pedido > 0 ? Math.min(pedido, DIAS_MAXIMO) : DIAS_POR_DEFECTO;

  try {
    const runs = await readRuns({ sinceDays: dias });
    const { total, pasadas } = serieDeBandas(runs);

    /*
     * Los ratios se calculan aquí y no en quien lee, porque son la comparación
     * entera: qué proporción de lo leído en cada banda llega a verificarse y
     * qué proporción llega a un lector. Sin ellos hay que hacer la división a
     * mano y es donde se cuela el error de leer volumen como calidad.
     */
    const bandas = Object.fromEntries(
      Object.entries(total).map(([banda, v]) => [
        banda,
        {
          ...v,
          verificadasPorLeida: v.leidas ? Number((v.verificadas / v.leidas).toFixed(3)) : null,
          publicadasPorLeida: v.leidas ? Number((v.publicadas / v.leidas).toFixed(3)) : null,
        },
      ])
    );

    return new Response(
      JSON.stringify(
        {
          ok: true,
          dias,
          pasadasRegistradas: pasadas.length,
          /*
           * Las pasadas anteriores a este formato no aparecen, y es correcto:
           * contarlas como ceros hundiría la media de la semana con días que
           * sencillamente no medían esto.
           */
          pasadasLeidas: runs.length,
          bandas,
          pasadas,
        },
        null,
        2
      ),
      {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      }
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    logger.error('newsroom.series_failed', { error: detail });
    return new Response(JSON.stringify({ ok: false, error: detail }, null, 2), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
};
