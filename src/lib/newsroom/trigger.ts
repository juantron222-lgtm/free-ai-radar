import { createHash, timingSafeEqual } from 'node:crypto';
import { CRON_SECRET, NEWSROOM_DEPLOY_HOOK } from 'astro:env/server';
import { logger } from '@lib/observability/logger';

/**
 * Quién puede disparar el newsroom, y quién puede pedir un despliegue.
 *
 * Son dos secretos distintos con dos funciones distintas, y merece la pena
 * decir por qué. El del cron autoriza *entrar*: cualquiera que lo tenga puede
 * hacer que el sistema salga a buscar noticias. El del deploy hook es una URL
 * que sólo sabe lanzar un build — no lee, no escribe, no publica. Esa es
 * exactamente la razón por la que esta arquitectura usa un hook en lugar de un
 * token de GitHub con permiso de escritura sobre `main`: si se filtra, lo peor
 * que ocurre es un despliegue de más.
 */

/**
 * Comparación en tiempo constante.
 *
 * Un `===` sobre secretos filtra su longitud y su prefijo por el tiempo que
 * tarda en fallar. Con un endpoint público y reintentos suficientes eso es
 * suficiente para reconstruirlo carácter a carácter. Se comparan los hashes
 * para que ambos lados midan siempre lo mismo, incluso con longitudes distintas.
 */
function secretsMatch(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export type TriggerVerdict =
  | { ok: true; trigger: 'cron' | 'manual' }
  | { ok: false; reason: string };

/**
 * Autoriza una ejecución del pipeline.
 *
 * Vercel Cron envía `Authorization: Bearer <CRON_SECRET>`. El mismo secreto
 * sirve para dispararlo a mano, que es como se prueba, y por eso la respuesta
 * distingue el origen: un `manual` en el informe diario debe poder explicarse.
 *
 * Sin `CRON_SECRET` configurado no se autoriza nada. Es deliberado: la
 * alternativa —permitirlo cuando falta el secreto— convierte un despiste de
 * configuración en un endpoint abierto que hace peticiones de red en nombre
 * del sitio.
 */
export function authorizeTrigger(request: Request): TriggerVerdict {
  const secret = CRON_SECRET ?? '';

  if (!secret) {
    logger.error('newsroom.trigger_unconfigured', {});
    return { ok: false, reason: 'CRON_SECRET no está configurado' };
  }

  const header = request.headers.get('authorization') ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';

  if (!presented) return { ok: false, reason: 'falta la cabecera Authorization' };
  if (!secretsMatch(presented, secret)) return { ok: false, reason: 'secreto incorrecto' };

  /*
   * Vercel marca sus propias invocaciones de cron. Sólo sirve para el informe:
   * la autorización ya la ha dado el secreto, y confiar en una cabecera que
   * cualquiera puede escribir sería confundir una etiqueta con una prueba.
   */
  const isVercelCron = (request.headers.get('user-agent') ?? '').includes('vercel-cron');

  return { ok: true, trigger: isVercelCron ? 'cron' : 'manual' };
}

export function deployHookConfigured(): boolean {
  return Boolean(NEWSROOM_DEPLOY_HOOK);
}

/**
 * Pide a Vercel que reconstruya el sitio.
 *
 * Se llama al aprobar. La noticia ya está guardada en Supabase antes de esto,
 * así que un fallo aquí retrasa su aparición pero no la pierde: el siguiente
 * despliegue, sea de quien sea, la recogerá. Por eso devuelve el resultado en
 * lugar de lanzar — quien aprueba tiene que enterarse de que el build no se ha
 * lanzado, pero su aprobación no debe deshacerse por ello.
 */
export async function requestRebuild(): Promise<{ ok: boolean; detail: string }> {
  const hook = NEWSROOM_DEPLOY_HOOK ?? '';

  if (!hook) {
    return {
      ok: false,
      detail: 'NEWSROOM_DEPLOY_HOOK no está configurado: la noticia queda guardada, sin desplegar',
    };
  }

  try {
    const response = await fetch(hook, { method: 'POST' });
    if (!response.ok) {
      logger.error('newsroom.deploy_hook_failed', { status: response.status });
      return { ok: false, detail: `el hook respondió ${response.status}` };
    }
    logger.info('newsroom.deploy_requested', {});
    return { ok: true, detail: 'despliegue solicitado' };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    logger.error('newsroom.deploy_hook_error', { error: detail });
    return { ok: false, detail };
  }
}
