import type { APIRoute } from 'astro';
import { guard, json } from '@lib/api/respond';
import { toggleFavorite } from '@lib/data/user-data';
import { getTool } from '@lib/data/catalog';

export const prerender = false;

async function handle(context: Parameters<APIRoute>[0], add: boolean): Promise<Response> {
  const user = context.locals.user;
  if (!user) {
    return json({ ok: false, message: 'Necesitas una cuenta para guardar herramientas.' }, 401);
  }

  const check = await guard(context, { rateLimit: 'api' });
  if (!check.ok) return check.response!;

  const slug = String(check.form!.get('slug') ?? '');
  if (!getTool(slug)) {
    return json({ ok: false, message: 'Esa herramienta no existe.' }, 404);
  }

  const result = await toggleFavorite(user.id, slug, add);
  return json({
    ok: result.ok,
    message: result.ok
      ? add
        ? 'Guardada en tus favoritos.'
        : 'Quitada de tus favoritos.'
      : 'No se ha podido guardar. Inténtalo de nuevo.',
  }, result.ok ? 200 : 500);
}

export const POST: APIRoute = (context) => handle(context, true);
export const DELETE: APIRoute = (context) => handle(context, false);
