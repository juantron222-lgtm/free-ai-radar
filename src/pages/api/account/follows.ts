import type { APIRoute } from 'astro';
import { guard, json, respond } from '@lib/api/respond';
import { toggleFollow } from '@lib/data/user-data';
import { getTool } from '@lib/data/catalog';
import { ROUTES } from '@lib/nav';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return json({ ok: false, message: 'Necesitas una cuenta para recibir avisos.' }, 401);
  }

  const check = await guard(context, { rateLimit: 'api' });
  if (!check.ok) return check.response!;

  const slug = String(check.form!.get('slug') ?? '');
  // The alerts page posts `action=remove`; the tool page uses POST/DELETE.
  const add = check.form!.get('action') !== 'remove';

  if (!getTool(slug)) return json({ ok: false, message: 'Esa herramienta no existe.' }, 404);

  const result = await toggleFollow(user.id, slug, add, user.plan);

  return respond(
    context,
    {
      ok: result.ok,
      message:
        result.message ??
        (add ? 'Te avisaremos si cambia su plan gratuito.' : 'Has dejado de seguirla.'),
    },
    result.ok ? 200 : 409,
    ROUTES.alerts
  );
};

export const DELETE: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return json({ ok: false, message: 'No autenticado.' }, 401);

  const check = await guard(context, { rateLimit: 'api' });
  if (!check.ok) return check.response!;

  const slug = String(check.form!.get('slug') ?? '');
  const result = await toggleFollow(user.id, slug, false, user.plan);

  return json(
    { ok: result.ok, message: result.ok ? 'Has dejado de seguirla.' : 'No se ha podido actualizar.' },
    result.ok ? 200 : 500
  );
};
