import type { APIRoute } from 'astro';
import { z } from 'zod';
import { guard, json, respond, validationResponse } from '@lib/api/respond';
import { createList, toggleListItem } from '@lib/data/user-data';
import { getTool } from '@lib/data/catalog';
import { ROUTES } from '@lib/nav';

export const prerender = false;

const CreateListSchema = z.object({
  title: z.string().trim().min(1, 'Ponle un nombre a la lista.').max(80),
  description: z.string().trim().max(200).optional(),
  isPublic: z.boolean().optional(),
});

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return json({ ok: false, message: 'Necesitas una cuenta.' }, 401);

  const check = await guard(context, { rateLimit: 'api' });
  if (!check.ok) return check.response!;

  const form = check.form!;

  // Same endpoint handles "add tool to list" so the tool page needs one call.
  const toolSlug = form.get('toolSlug');
  const listId = form.get('listId');

  if (toolSlug && listId) {
    if (!getTool(String(toolSlug))) {
      return json({ ok: false, message: 'Esa herramienta no existe.' }, 404);
    }
    const result = await toggleListItem(
      user.id,
      String(listId),
      String(toolSlug),
      form.get('action') !== 'remove'
    );
    return json(
      { ok: result.ok, message: result.ok ? 'Lista actualizada.' : 'No se ha podido actualizar.' },
      result.ok ? 200 : 400
    );
  }

  const parsed = CreateListSchema.safeParse({
    title: form.get('title'),
    description: (form.get('description') as string | null) || undefined,
    isPublic: form.get('isPublic') === 'on' || form.get('isPublic') === 'true',
  });

  if (!parsed.success) return validationResponse(parsed.error);

  const result = await createList(user.id, parsed.data, user.plan);

  return respond(
    context,
    { ok: result.ok, message: result.message ?? 'Lista creada.', data: result.list },
    result.ok ? 201 : 409,
    ROUTES.lists
  );
};
