import type { APIRoute } from 'astro';
import { guard, json, respond } from '@lib/api/respond';
import { deleteList } from '@lib/data/user-data';
import { ROUTES } from '@lib/nav';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return json({ ok: false, message: 'Necesitas una cuenta.' }, 401);

  const check = await guard(context, { rateLimit: 'api' });
  if (!check.ok) return check.response!;

  const listId = String(check.form!.get('listId') ?? '');
  if (!listId) return json({ ok: false, message: 'Falta la lista.' }, 400);

  // deleteList scopes by user_id, so a forged listId cannot touch another
  // account's row.
  const result = await deleteList(user.id, listId);

  return respond(
    context,
    { ok: result.ok, message: result.ok ? 'Lista eliminada.' : 'No se ha podido eliminar.' },
    result.ok ? 200 : 400,
    ROUTES.lists
  );
};
