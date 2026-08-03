import type { APIRoute } from 'astro';
import { confirmSubscription } from '@lib/data/inbox';
import { logger } from '@lib/observability/logger';

export const prerender = false;

/**
 * Double opt-in confirmation.
 *
 * A GET, because it is reached from a link in an email. That is safe here: the
 * only state it changes is the one the recipient explicitly asked for by
 * clicking, and the token is single-use and unguessable.
 */
export const GET: APIRoute = async ({ url, redirect }) => {
  const token = url.searchParams.get('token');
  if (!token) return redirect('/boletin/confirmado?estado=invalido', 302);

  const confirmed = await confirmSubscription(token);
  logger.info('newsletter.confirm', { ok: confirmed });

  return redirect(`/boletin/confirmado?estado=${confirmed ? 'ok' : 'invalido'}`, 302);
};
