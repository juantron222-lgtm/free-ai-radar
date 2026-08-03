import type { APIRoute } from 'astro';
import { z } from 'zod';
import { guard, json, validationResponse } from '@lib/api/respond';
import { addSubmission } from '@lib/data/inbox';
import { CATEGORY_SLUGS } from '@lib/domain/taxonomy';
import { getAllTools } from '@lib/data/catalog';
import { slugify } from '@lib/domain/primitives';
import { logger } from '@lib/observability/logger';

export const prerender = false;

const SubmissionSchema = z.object({
  name: z.string().trim().min(1, 'Escribe el nombre de la herramienta.').max(120),
  url: z.string().trim().url('La URL no parece válida.'),
  categorySlug: z.string().optional(),
  notes: z.string().trim().min(20, 'Cuéntanos algo más concreto.').max(1500),
  email: z.union([z.string().email('El correo no parece válido.'), z.literal('')]).optional(),
});

const THANKS =
  'Recibido. La revisamos con el mismo criterio que el resto; si la publicamos y nos dejaste correo, te avisamos.';

export const POST: APIRoute = async (context) => {
  const check = await guard(context, { rateLimit: 'submission', honeypot: 'website' });
  if (!check.ok) return check.response!;
  if (check.trapped) return json({ ok: true, message: THANKS });

  const form = check.form!;
  const parsed = SubmissionSchema.safeParse({
    name: form.get('name'),
    url: form.get('url'),
    categorySlug: (form.get('categorySlug') as string | null) || undefined,
    notes: form.get('notes'),
    email: (form.get('email') as string | null) ?? undefined,
  });

  if (!parsed.success) return validationResponse(parsed.error);

  // Tell the sender straight away if we already have it, rather than making
  // them wait for a reply that says the same thing.
  const candidateSlug = slugify(parsed.data.name);
  const existing = getAllTools().find(
    (tool) => tool.slug === candidateSlug || tool.name.toLowerCase() === parsed.data.name.toLowerCase()
  );

  if (existing) {
    return json({
      ok: true,
      message: `Ya tenemos ficha de ${existing.name}. Si algo de lo que publicamos ya no es cierto, cuéntanoslo desde su página: es aún más útil.`,
      data: { existingSlug: existing.slug },
    });
  }

  const category =
    parsed.data.categorySlug && CATEGORY_SLUGS.includes(parsed.data.categorySlug)
      ? parsed.data.categorySlug
      : undefined;

  const stored = await addSubmission({
    name: parsed.data.name,
    url: parsed.data.url,
    notes: parsed.data.notes,
    ...(category ? { categorySlug: category } : {}),
    ...(parsed.data.email ? { email: parsed.data.email } : {}),
    ...(context.locals.user ? { userId: context.locals.user.id } : {}),
  });

  logger.info('submission.received', { ok: stored });

  return json(
    { ok: stored, message: stored ? THANKS : 'No hemos podido registrarlo. Inténtalo de nuevo.' },
    stored ? 200 : 500
  );
};
