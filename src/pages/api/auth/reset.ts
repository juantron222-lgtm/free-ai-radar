import type { APIRoute } from 'astro';
import { guard, respond, validationResponse } from '@lib/api/respond';
import { ResetSchema } from '@lib/auth/password';
import { getAuthProvider } from '@lib/auth/provider';
import { ROUTES } from '@lib/nav';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const check = await guard(context, { rateLimit: 'passwordReset' });
  if (!check.ok) return check.response!;

  const parsed = ResetSchema.safeParse({
    token: check.form!.get('token'),
    password: check.form!.get('password'),
  });

  if (!parsed.success) return validationResponse(parsed.error);

  const auth = getAuthProvider();
  const result = await auth.resetPassword(parsed.data.token, parsed.data.password, context.request);

  for (const cookie of auth.drainCookies()) {
    context.cookies.set(cookie.name, cookie.value, cookie.options as never);
  }

  return respond(
    context,
    {
      ok: result.ok,
      message: result.message,
      ...(result.field ? { errors: { [result.field]: result.message } } : {}),
    },
    result.ok ? 200 : 400,
    result.ok ? ROUTES.login : undefined
  );
};
