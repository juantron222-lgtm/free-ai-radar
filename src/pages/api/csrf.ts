import type { APIRoute } from 'astro';
import { CSRF_COOKIE } from '@lib/security/csrf';

export const prerender = false;

/**
 * Hands a CSRF token to forms that live on prerendered pages.
 *
 * Those pages are served straight from the CDN and never touch the middleware,
 * so they cannot carry a server-rendered token. The browser asks for one here,
 * gets it in the body, and the middleware has already queued the matching
 * `Set-Cookie`.
 *
 * **This endpoint does not set the cookie itself.** The middleware is the only
 * writer. When both wrote it, the response carried two `Set-Cookie` headers for
 * the same name — harmless in browsers, but enough to make stricter HTTP
 * clients drop the cookie entirely and fail every subsequent POST with a 403.
 */
export const GET: APIRoute = ({ cookies, locals }) => {
  const token = locals.csrfToken || cookies.get(CSRF_COOKIE)?.value || '';

  return new Response(JSON.stringify({ token }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, private',
    },
  });
};
