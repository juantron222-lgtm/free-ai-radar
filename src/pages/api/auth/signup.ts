import type { APIRoute } from 'astro';
import { guard, respond, validationResponse } from '@lib/api/respond';
import { SignUpSchema } from '@lib/auth/password';
import { getAuthProvider } from '@lib/auth/provider';
import { safeRedirect } from '@lib/security/redirect';
import { logger } from '@lib/observability/logger';
import { ROUTES } from '@lib/nav';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const check = await guard(context, { rateLimit: 'signUp', honeypot: 'website' });
  if (!check.ok) return check.response!;

  const next = safeRedirect(check.form!.get('next') as string | null, ROUTES.account);

  if (check.trapped) {
    // Bots get the same answer a human would, with nothing created.
    return respond(context, { ok: true, message: 'Cuenta creada.' }, 200, next);
  }

  const parsed = SignUpSchema.safeParse({
    email: check.form!.get('email'),
    password: check.form!.get('password'),
    displayName: (check.form!.get('displayName') as string | null) || undefined,
  });

  if (!parsed.success) return validationResponse(parsed.error);

  const auth = getAuthProvider();
  const result = await auth.signUp(parsed.data, context.request);

  /*
   * Where to send somebody who just signed up.
   *
   * `/cuenta` needs a session. With email confirmation switched on there is no
   * session yet, so sending them there had the middleware bounce them to the
   * login page — and the bounce builds a fresh URL, so the `?ok=` message
   * explaining why they are looking at a login form never survived the trip.
   * They saw an empty login page and no reason for it.
   *
   * When confirmation is pending the login page *is* the destination, and the
   * message arrives with them.
   */
  const destination = result.pendingConfirmation ? ROUTES.login : next;

  const response = respond(
    context,
    { ok: result.ok, message: result.message, ...(result.field ? { errors: { [result.field]: result.message } } : {}) },
    result.ok ? 200 : 400,
    result.ok ? destination : undefined
  );

  for (const cookie of auth.drainCookies()) {
    context.cookies.set(cookie.name, cookie.value, cookie.options as never);
  }

  logger.info('auth.signup', { ok: result.ok, mode: auth.mode });
  return response;
};
