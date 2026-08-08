import type { APIRoute } from 'astro';
import { createHash } from 'node:crypto';
import { guard, json } from '@lib/api/respond';
import { createCheckoutSession } from '@lib/billing/stripe';
import { getPlan } from '@lib/billing/plans';
import { runtimeUrl } from '@lib/runtime-origin';
import { logger } from '@lib/observability/logger';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return json({ ok: false, message: 'Entra en tu cuenta para suscribirte.' }, 401);
  }

  const check = await guard(context, { rateLimit: 'checkout' });
  if (!check.ok) return check.response!;

  const planId = String(check.form!.get('plan') ?? '');
  const plan = getPlan(planId);

  if (!plan || plan.tier !== 'pro') {
    return json({ ok: false, message: 'Ese plan no existe.' }, 400);
  }

  if (!plan.stripePriceId) {
    return json(
      {
        ok: false,
        message:
          'Los pagos todavía no están activos. Falta configurar el identificador de precio en Stripe.',
      },
      503
    );
  }

  // Idempotency key derived from user + plan + the current minute: a
  // double-click reuses the same Checkout session instead of creating two.
  const minute = Math.floor(Date.now() / 60_000);
  const idempotencyKey = createHash('sha256')
    .update(`${user.id}:${plan.id}:${minute}`)
    .digest('hex');

  const result = await createCheckoutSession({
    userId: user.id,
    userEmail: user.email,
    priceId: plan.stripePriceId,
    successUrl: runtimeUrl(context.request, '/cuenta/suscripcion'),
    cancelUrl: runtimeUrl(context.request, '/pro'),
    idempotencyKey,
  });

  logger.info('billing.checkout_started', {
    userId: user.id,
    plan: plan.id,
    simulated: result.simulated,
  });

  if (!result.ok || !result.url) {
    return json({ ok: false, message: result.message }, 502);
  }

  return json({ ok: true, message: result.message, data: { url: result.url } });
};
