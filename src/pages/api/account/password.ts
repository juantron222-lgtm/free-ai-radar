import type { APIRoute } from 'astro';
import { guard, json, validationResponse } from '@lib/api/respond';
import { ChangePasswordSchema } from '@lib/auth/password';
import { getAuthProvider } from '@lib/auth/provider';
import { logger } from '@lib/observability/logger';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return json({ ok: false, message: 'Necesitas una cuenta.' }, 401);

  const check = await guard(context, { rateLimit: 'passwordReset' });
  if (!check.ok) return check.response!;

  const parsed = ChangePasswordSchema.safeParse({
    currentPassword: check.form!.get('currentPassword'),
    password: check.form!.get('password'),
  });

  if (!parsed.success) return validationResponse(parsed.error);

  const auth = getAuthProvider();
  const result = await auth.changePassword(
    user.id,
    parsed.data.currentPassword,
    parsed.data.password
  );

  logger.info('auth.password_changed', { ok: result.ok, userId: user.id });

  return json(
    {
      ok: result.ok,
      message: result.message,
      ...(result.field ? { errors: { [result.field]: result.message } } : {}),
    },
    result.ok ? 200 : 400
  );
};
