import type { APIRoute } from 'astro';
import { __envDiagnostic, deploymentEnv } from '@lib/config';

/**
 * FASE B — TEMPORARY DIAGNOSTIC. Delete before any promotion.
 *
 * Reports the shape of the environment as the running serverless function sees
 * it, alongside what Astro baked in at build. Booleans only: no value, no
 * prefix, no suffix, no length, no hash.
 *
 * Two independent gates, because a diagnostic endpoint is exactly the kind of
 * thing that gets forgotten and then found by somebody else:
 *
 *   1. Vercel's Deployment Protection already stands in front of every route on
 *      this deployment — reaching this handler at all means the caller
 *      presented the automation bypass at the edge.
 *   2. This refuses to answer unless the declared environment is `preview`. On
 *      production it 404s, which is also what it would do if it had already
 *      been deleted — the honest answer either way.
 *
 * `prerender = false` because the whole question is what the *runtime* sees.
 */
export const prerender = false;

export const GET: APIRoute = () => {
  const where = deploymentEnv();

  if (where !== 'preview') {
    return new Response('No encontrado', {
      status: 404,
      headers: { 'x-robots-tag': 'noindex, nofollow' },
    });
  }

  return new Response(JSON.stringify(__envDiagnostic(), null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
    },
  });
};
