import type { APIRoute } from 'astro';
import { guard, json } from '@lib/api/respond';
import { createPortalSession } from '@lib/billing/stripe';
import { SITE_URL } from '@lib/seo/site';

export const prerender = false;

/**
 * Customer Portal.
 *
 * Plan changes, cancellations, payment-method updates and invoice downloads all
 * happen inside Stripe's hosted portal. Building our own would mean handling
 * card data and proration, which is neither necessary nor wise.
 */
export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return json({ ok: false, message: 'Entra en tu cuenta.' }, 401);

  const check = await guard(context, { rateLimit: 'checkout' });
  if (!check.ok) return check.response!;

  const result = await createPortalSession(user.id, `${SITE_URL}/cuenta/suscripcion`);

  if (!result.ok || !result.url) {
    return json({ ok: false, message: result.message }, 502);
  }

  return json({ ok: true, message: result.message, data: { url: result.url } });
};
