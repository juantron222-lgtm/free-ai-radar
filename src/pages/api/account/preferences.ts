import type { APIRoute } from 'astro';
import { guard, json } from '@lib/api/respond';
import { getUserData, savePreferences } from '@lib/data/user-data';
import { CATEGORY_SLUGS } from '@lib/domain/taxonomy';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return json({ ok: false, message: 'Necesitas una cuenta.' }, 401);

  const check = await guard(context, { rateLimit: 'api' });
  if (!check.ok) return check.response!;

  const form = check.form!;
  const current = await getUserData(user.id);

  // Only accept slugs from the real taxonomy: this array ends up in an email
  // segmentation query, so unvalidated input would be a poor idea.
  const categories = form
    .getAll('categories')
    .map(String)
    .filter((slug) => CATEGORY_SLUGS.includes(slug));

  // The alerts page submits only the category chips; preferences submits all.
  const scope = String(form.get('scope') ?? 'all');

  const preferences =
    scope === 'categories'
      ? { ...current.preferences, categories }
      : {
          weeklyDigest: form.get('weeklyDigest') !== null,
          instantAlerts: form.get('instantAlerts') !== null,
          productUpdates: form.get('productUpdates') !== null,
          marketingOptIn: form.get('marketingOptIn') !== null,
          categories,
        };

  const result = await savePreferences(user.id, preferences);

  return json(
    {
      ok: result.ok,
      message: result.ok ? 'Preferencias guardadas.' : 'No se han podido guardar.',
    },
    result.ok ? 200 : 500
  );
};
