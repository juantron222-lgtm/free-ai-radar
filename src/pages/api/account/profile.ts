import type { APIRoute } from 'astro';
import { z } from 'zod';
import { guard, json, validationResponse } from '@lib/api/respond';
import { DisplayNameSchema } from '@lib/auth/password';
import { getAuthProvider } from '@lib/auth/provider';

export const prerender = false;

const ProfileSchema = z.object({
  displayName: DisplayNameSchema.or(z.literal('')).optional(),
  locale: z.enum(['es', 'en']).optional(),
});

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return json({ ok: false, message: 'Necesitas una cuenta.' }, 401);

  const check = await guard(context, { rateLimit: 'api' });
  if (!check.ok) return check.response!;

  const parsed = ProfileSchema.safeParse({
    displayName: (check.form!.get('displayName') as string | null) ?? undefined,
    locale: (check.form!.get('locale') as string | null) ?? undefined,
  });

  if (!parsed.success) return validationResponse(parsed.error);

  const auth = getAuthProvider();
  const result = await auth.updateProfile(user.id, {
    ...(parsed.data.displayName !== undefined ? { displayName: parsed.data.displayName } : {}),
    ...(parsed.data.locale !== undefined ? { locale: parsed.data.locale } : {}),
  });

  return json({ ok: result.ok, message: result.message }, result.ok ? 200 : 400);
};
