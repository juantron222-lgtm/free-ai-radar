import type { APIRoute } from 'astro';
import { guard, json, respond } from '@lib/api/respond';
import { purgeUserData } from '@lib/data/user-data';
import { getAuthProvider } from '@lib/auth/provider';
import { recordAudit } from '@lib/observability/audit';
import { logger } from '@lib/observability/logger';
import { ROUTES } from '@lib/nav';

export const prerender = false;

/**
 * GDPR art. 17 (erasure).
 *
 * Order matters: user-owned rows first, then the identity. If the second step
 * fails the account still exists but is empty, which is recoverable. The
 * reverse order would leave orphaned data with no owner to request its
 * deletion.
 */
export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return json({ ok: false, message: 'Necesitas una cuenta.' }, 401);

  const check = await guard(context, { rateLimit: 'api' });
  if (!check.ok) return check.response!;

  if (String(check.form!.get('confirm') ?? '').trim() !== 'ELIMINAR') {
    return json(
      { ok: false, message: 'Escribe ELIMINAR exactamente para confirmar.' },
      400
    );
  }

  await purgeUserData(user.id);

  const auth = getAuthProvider();
  const result = await auth.deleteAccount(user.id);

  for (const cookie of auth.drainCookies()) {
    context.cookies.set(cookie.name, cookie.value, cookie.options as never);
  }

  // Audit keeps the user id only; the record itself is the proof the request
  // was honoured, which we are required to be able to demonstrate.
  await recordAudit({
    actorId: user.id,
    action: 'account.deleted',
    entity: 'profiles',
    entityId: user.id,
  });

  logger.info('account.deleted', { ok: result.ok });

  return respond(
    context,
    {
      ok: result.ok,
      message: result.ok
        ? 'Tu cuenta y tus datos se han eliminado.'
        : 'Tus datos se han borrado, pero la identidad no ha podido eliminarse. Escríbenos y lo terminamos.',
    },
    result.ok ? 200 : 500,
    ROUTES.home
  );
};
