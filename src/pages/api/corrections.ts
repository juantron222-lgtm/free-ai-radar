import type { APIRoute } from 'astro';
import { z } from 'zod';
import { guard, json, validationResponse } from '@lib/api/respond';
import { addCorrection } from '@lib/data/inbox';
import { getTool } from '@lib/data/catalog';
import { logger } from '@lib/observability/logger';

export const prerender = false;

const CorrectionSchema = z.object({
  toolSlug: z.string().min(1),
  field: z.string().min(1).max(40),
  message: z.string().trim().min(10, 'Cuéntanos un poco más para poder verificarlo.').max(1000),
  evidenceUrl: z
    .union([z.string().url('El enlace no parece válido.'), z.literal('')])
    .optional()
    .transform((v) => (v ? v : undefined)),
  email: z.union([z.string().email('El correo no parece válido.'), z.literal('')]).optional(),
});

const THANKS =
  'Gracias. Lo revisamos y, si se confirma, actualizamos la ficha y anotamos el cambio en el registro público.';

export const POST: APIRoute = async (context) => {
  const check = await guard(context, { rateLimit: 'correction', honeypot: 'website' });
  if (!check.ok) return check.response!;
  if (check.trapped) return json({ ok: true, message: THANKS });

  const form = check.form!;
  const parsed = CorrectionSchema.safeParse({
    toolSlug: form.get('toolSlug'),
    field: form.get('field'),
    message: form.get('message'),
    evidenceUrl: (form.get('evidenceUrl') as string | null) ?? undefined,
    email: (form.get('email') as string | null) ?? undefined,
  });

  if (!parsed.success) return validationResponse(parsed.error);

  if (!getTool(parsed.data.toolSlug)) {
    return json({ ok: false, message: 'Esa herramienta no existe.' }, 404);
  }

  const stored = await addCorrection({
    toolSlug: parsed.data.toolSlug,
    field: parsed.data.field,
    message: parsed.data.message,
    ...(parsed.data.evidenceUrl ? { evidenceUrl: parsed.data.evidenceUrl } : {}),
    ...(parsed.data.email ? { email: parsed.data.email } : {}),
    ...(context.locals.user ? { userId: context.locals.user.id } : {}),
  });

  logger.info('correction.received', { tool: parsed.data.toolSlug, ok: stored });

  return json(
    {
      ok: stored,
      message: stored ? THANKS : 'No hemos podido registrarlo. Inténtalo de nuevo.',
    },
    stored ? 200 : 500
  );
};
