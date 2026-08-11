import type { APIRoute } from 'astro';
import { z } from 'zod';
import { guard, json, validationResponse } from '@lib/api/respond';
import { decide } from '@lib/data/newsroom';
import { NewsroomAction } from '@lib/domain/newsroom';
import { logger } from '@lib/observability/logger';

export const prerender = false;

/**
 * The desk's only write endpoint.
 *
 * The middleware already keeps `/admin/*` behind a session and away from role
 * `user`, but this path is `/api/admin/...` and so falls outside that prefix.
 * It therefore does its own check, and a stricter one: publishing is for
 * `admin`, not for `editor`.
 *
 * It never returns the pipeline files. The desk page renders them server-side;
 * exposing `inbox.json`, `triage.json` or `verification.json` as an endpoint
 * would put the newsroom's unpublished judgements — including what was rejected
 * and why — one URL away from anybody who guessed the path.
 */

const RequestSchema = z.object({
  key: z.string().min(1).max(200),
  action: NewsroomAction,
  note: z.string().max(500).optional(),
});

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;

  /*
   * 404 rather than 403, matching the middleware: someone without access
   * learns nothing about whether this endpoint exists.
   */
  if (!user || user.role !== 'admin') {
    logger.warn('newsroom.access_denied', {
      role: user?.role ?? 'anonymous',
      path: context.url.pathname,
    });
    return new Response('No encontrado', { status: 404 });
  }

  const check = await guard(context, { rateLimit: 'api' });
  if (!check.ok) return check.response!;

  const form = check.form!;
  const parsed = RequestSchema.safeParse({
    key: form.get('key'),
    action: form.get('action'),
    note: (form.get('note') as string | null) ?? undefined,
  });

  if (!parsed.success) return validationResponse(parsed.error);

  const outcome = decide({
    key: parsed.data.key,
    action: parsed.data.action,
    actor: user.email ?? user.id,
    ...(parsed.data.note !== undefined ? { note: parsed.data.note } : {}),
  });

  logger.info('newsroom.decision', {
    key: parsed.data.key,
    action: parsed.data.action,
    ok: outcome.ok,
    published: outcome.published ?? false,
  });

  return json(outcome, outcome.ok ? 200 : 409);
};
