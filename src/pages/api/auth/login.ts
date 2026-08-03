import type { APIRoute } from 'astro';
import { guard, respond, validationResponse } from '@lib/api/respond';
import { SignInSchema } from '@lib/auth/password';
import { getAuthProvider } from '@lib/auth/provider';
import { safeRedirect } from '@lib/security/redirect';
import { logger } from '@lib/observability/logger';
import { ROUTES } from '@lib/nav';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const check = await guard(context, { rateLimit: 'signIn' });
  if (!check.ok) return check.response!;

  const parsed = SignInSchema.safeParse({
    email: check.form!.get('email'),
    password: check.form!.get('password'),
  });

  if (!parsed.success) return validationResponse(parsed.error);

  const auth = getAuthProvider();
  const result = await auth.signIn(parsed.data, context.request);

  for (const cookie of auth.drainCookies()) {
    context.cookies.set(cookie.name, cookie.value, cookie.options as never);
  }

  // Failure is deliberately generic: never reveal whether the address exists.
  logger.info('auth.login', { ok: result.ok, mode: auth.mode });

  if (!result.ok) {
    return respond(context, { ok: false, message: result.message, errors: { password: result.message } }, 401);
  }

  const next = safeRedirect(check.form!.get('next') as string | null, ROUTES.account);
  return respond(context, { ok: true, message: result.message, data: { next } }, 200, next);
};
