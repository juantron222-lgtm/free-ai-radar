import type { APIRoute } from 'astro';
import { guard, respond, validationResponse } from '@lib/api/respond';
import { ResetRequestSchema } from '@lib/auth/password';
import { getAuthProvider } from '@lib/auth/provider';
import { GENERIC_RESET_MESSAGE } from '@lib/auth/types';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const check = await guard(context, { rateLimit: 'passwordReset', honeypot: 'website' });
  if (!check.ok) return check.response!;

  if (check.trapped) {
    return respond(context, { ok: true, message: GENERIC_RESET_MESSAGE }, 200);
  }

  const parsed = ResetRequestSchema.safeParse({ email: check.form!.get('email') });
  if (!parsed.success) return validationResponse(parsed.error);

  const auth = getAuthProvider();
  await auth.requestPasswordReset(parsed.data.email, context.request);

  // Always the same response and the same status, whatever happened.
  return respond(context, { ok: true, message: GENERIC_RESET_MESSAGE }, 200);
};
