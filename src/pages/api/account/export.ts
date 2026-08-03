import type { APIRoute } from 'astro';
import { json } from '@lib/api/respond';
import { exportUserData } from '@lib/data/user-data';
import { logger } from '@lib/observability/logger';

export const prerender = false;

/**
 * GDPR art. 20 (data portability).
 *
 * A GET so it can be a plain download link, which is the least friction for
 * the user. It is safe as a GET because it only reads the requester's own data
 * and the response is `no-store` with an attachment disposition, so it can
 * neither be cached nor embedded cross-origin.
 */
export const GET: APIRoute = async ({ locals }) => {
  const user = locals.user;
  if (!user) return json({ ok: false, message: 'Necesitas una cuenta.' }, 401);

  const payload = await exportUserData(user.id, user.email);
  logger.info('account.data_exported', { userId: user.id });

  const filename = `free-ai-radar-datos-${new Date().toISOString().slice(0, 10)}.json`;

  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
