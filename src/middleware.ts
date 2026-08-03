import { defineMiddleware } from 'astro:middleware';
import { getAuthProvider } from '@lib/auth/provider';
import { CSRF_COOKIE, issueToken } from '@lib/security/csrf';
import { readConsentFromCookie, CONSENT_COOKIE, DENY_ALL } from '@lib/consent';
import { logger } from '@lib/observability/logger';
import { csrfCookie, serializeCookie } from '@lib/security/cookies';

/**
 * Request pipeline.
 *
 *   1. Attach the session user to `locals` so pages never call the provider.
 *   2. Guard `/cuenta` and `/admin`.
 *   3. Mint a CSRF token for anything that renders a form.
 *   4. Set security headers that must vary per response.
 *
 * Static security headers live in `vercel.json` so they also cover prerendered
 * pages, which never reach this middleware at request time.
 */

const PROTECTED_PREFIXES = ['/cuenta'] as const;
const PUBLIC_ACCOUNT_PATHS = [
  '/cuenta/entrar',
  '/cuenta/crear',
  '/cuenta/recuperar',
  '/cuenta/nueva-contrasena',
  '/cuenta/verificar',
] as const;
const ADMIN_PREFIX = '/admin';

function needsAuth(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path.startsWith(ADMIN_PREFIX)) return true;
  if (!PROTECTED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return false;
  }
  return !PUBLIC_ACCOUNT_PATHS.some((publicPath) => path === publicPath);
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { url, request, cookies, locals } = context;
  const started = Date.now();

  const auth = getAuthProvider();
  locals.authMode = auth.mode;
  locals.user = null;
  locals.consent = DENY_ALL;
  locals.csrfToken = '';

  /**
   * Prerendered routes run this middleware once, at build time, where there is
   * no request to read. Touching headers there would bake one visitor's state
   * into a file served to everyone — so we do nothing and let those pages get
   * their token from `/api/csrf` in the browser instead.
   */
  if (context.isPrerendered) {
    return next();
  }

  // ---- Session -----------------------------------------------------------
  try {
    locals.user = await auth.getUser(request);
  } catch (error) {
    logger.warn('auth.session_read_failed', {
      path: url.pathname,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  locals.consent = readConsentFromCookie(cookies.get(CONSENT_COOKIE)?.value);

  // ---- CSRF token --------------------------------------------------------
  let csrfToken = cookies.get(CSRF_COOKIE)?.value;
  let mintedCsrf = false;
  if (!csrfToken) {
    csrfToken = issueToken();
    mintedCsrf = true;
  }
  locals.csrfToken = csrfToken;

  // ---- Route guards ------------------------------------------------------
  if (needsAuth(url.pathname)) {
    if (!locals.user) {
      const next = encodeURIComponent(url.pathname + url.search);
      return context.redirect(`/cuenta/entrar?next=${next}`, 302);
    }

    if (url.pathname.startsWith(ADMIN_PREFIX) && locals.user.role === 'user') {
      logger.warn('admin.access_denied', { userId: locals.user.id, path: url.pathname });
      // 404 rather than 403: an unauthorised visitor learns nothing about
      // whether the admin area exists.
      return new Response('No encontrado', { status: 404 });
    }
  }

  const response = await next();

  // ---- Cookies the provider asked us to set ------------------------------
  for (const cookie of auth.drainCookies()) {
    response.headers.append(
      'set-cookie',
      serializeCookie(cookie.name, cookie.value, cookie.options)
    );
  }

  if (mintedCsrf) {
    response.headers.append('set-cookie', serializeCookie(CSRF_COOKIE, csrfToken, csrfCookie()));
  }

  // ---- Per-response security headers -------------------------------------
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'DENY');

  // Nothing behind a session may be cached by a shared proxy.
  if (locals.user || url.pathname.startsWith('/api/') || needsAuth(url.pathname)) {
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  }

  if (url.pathname.startsWith(ADMIN_PREFIX)) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  }

  const elapsed = Date.now() - started;
  if (elapsed > 1000) {
    logger.warn('request.slow', { path: url.pathname, ms: elapsed });
  }

  return response;
});
