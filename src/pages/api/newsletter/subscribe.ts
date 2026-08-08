import type { APIRoute } from 'astro';
import { z } from 'zod';
import { guard, json, verifyTurnstile } from '@lib/api/respond';
import { EmailSchema } from '@lib/auth/password';
import { subscribe } from '@lib/data/inbox';
import { sendMail } from '@lib/email/send';
import { newsletterConfirmEmail } from '@lib/email/templates';
import { CATEGORY_SLUGS } from '@lib/domain/taxonomy';
import { runtimeUrl } from '@lib/runtime-origin';
import { logger } from '@lib/observability/logger';

export const prerender = false;

const SubscribeSchema = z.object({
  email: EmailSchema,
  categories: z.array(z.string()).default([]),
});

/**
 * Identical response for every outcome.
 *
 * Whether the address is new, already pending or already confirmed, the caller
 * sees the same message. Otherwise this endpoint becomes a way to test whether
 * a given address is subscribed.
 */
const SAME_ANSWER =
  'Casi está. Te hemos enviado un correo para confirmar la suscripción — hasta que lo abras no te escribiremos.';

export const POST: APIRoute = async (context) => {
  const check = await guard(context, { rateLimit: 'newsletter', honeypot: 'website' });
  if (!check.ok) return check.response!;
  if (check.trapped) return json({ ok: true, message: SAME_ANSWER });

  const form = check.form!;

  const captchaOk = await verifyTurnstile(
    (form.get('cf-turnstile-response') as string | null) ?? null,
    context.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  );
  if (!captchaOk) {
    return json({ ok: false, message: 'No hemos podido verificar que no eres un bot.' }, 400);
  }

  const parsed = SubscribeSchema.safeParse({
    email: form.get('email'),
    categories: form.getAll('categories').map(String).filter((c) => CATEGORY_SLUGS.includes(c)),
  });

  if (!parsed.success) {
    return json({ ok: false, message: 'Introduce un correo electrónico válido.' }, 422);
  }

  const result = await subscribe({
    email: parsed.data.email,
    categories: parsed.data.categories,
    ip: context.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
    userAgent: context.request.headers.get('user-agent') ?? undefined,
    source: String(form.get('source') ?? 'web'),
  });

  if (!result.ok) {
    return json(
      { ok: false, message: 'Algo ha fallado por nuestra parte. Vuelve a intentarlo en un momento.' },
      500
    );
  }

  if (result.confirmToken) {
    await sendMail(
      newsletterConfirmEmail({
        to: parsed.data.email,
        confirmUrl: runtimeUrl(context.request, `/api/newsletter/confirm?token=${result.confirmToken}`),
      })
    );
  }

  logger.info('newsletter.subscribe', {
    alreadyConfirmed: Boolean(result.alreadyConfirmed),
    categories: parsed.data.categories.length,
  });

  return json({ ok: true, message: SAME_ANSWER });
};
