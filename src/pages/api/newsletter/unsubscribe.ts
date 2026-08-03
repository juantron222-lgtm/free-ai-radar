import type { APIRoute } from 'astro';
import { unsubscribe } from '@lib/data/inbox';
import { logger } from '@lib/observability/logger';

export const prerender = false;

/**
 * One-click unsubscribe (RFC 8058).
 *
 * Mail clients issue a POST with no body to the List-Unsubscribe-Post URL, and
 * humans arrive via GET from the link in the footer. Both must work, and
 * neither may require a login, a form or a reason. Unsubscribing has to be at
 * least as easy as subscribing was.
 */
async function handle(token: string | null): Promise<boolean> {
  if (!token) return false;
  const done = await unsubscribe(token);
  logger.info('newsletter.unsubscribe', { ok: done });
  return done;
}

export const GET: APIRoute = async ({ url, redirect }) => {
  const done = await handle(url.searchParams.get('token'));
  return redirect(`/boletin/baja?estado=${done ? 'ok' : 'invalido'}`, 302);
};

export const POST: APIRoute = async ({ url }) => {
  const done = await handle(url.searchParams.get('token'));
  return new Response(done ? 'OK' : 'Token no válido', {
    status: done ? 200 : 400,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
