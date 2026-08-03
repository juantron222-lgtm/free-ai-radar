import type { APIRoute } from 'astro';
import { applyEvent, claimEvent, verifyWebhook } from '@lib/billing/stripe';
import { logger } from '@lib/observability/logger';

export const prerender = false;

/**
 * Stripe webhook.
 *
 * Notes that matter:
 *   · No CSRF check — the signature *is* the authentication, and Stripe cannot
 *     send our cookies.
 *   · `request.text()` reads the body verbatim. Parsing it first would change
 *     the bytes and break signature verification.
 *   · Always 200 once the signature is valid, even if our own handling fails.
 *     A non-2xx makes Stripe retry, and retrying a handler that is broken for a
 *     non-transient reason just produces noise; the failure is logged instead.
 */
export const POST: APIRoute = async ({ request }) => {
  const signature = request.headers.get('stripe-signature');
  const rawBody = await request.text();

  const event = verifyWebhook(rawBody, signature);

  if (!event) {
    logger.warn('billing.webhook_rejected', { hasSignature: Boolean(signature) });
    return new Response('Firma no válida', { status: 400 });
  }

  const fresh = await claimEvent(event);
  if (!fresh) {
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    await applyEvent(event);
    logger.info('billing.webhook_applied', { id: event.id, type: event.type });
  } catch (error) {
    logger.error('billing.webhook_apply_failed', {
      id: event.id,
      type: event.type,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
