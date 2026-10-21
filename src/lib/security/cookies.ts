/**
 * Cookie attributes, defined once.
 *
 * `Secure` is derived from the build mode, **not** from `PUBLIC_SITE_URL`.
 * That URL defaults to the production HTTPS origin even when running locally,
 * so deriving `Secure` from it marked every development cookie as secure — and
 * a `Secure` cookie sent over `http://localhost` is discarded by strict HTTP
 * clients, which silently broke sign-in outside Chrome.
 */

export interface CookieAttributes {
  httpOnly: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  path: string;
  secure: boolean;
  maxAge?: number;
}

const isProduction = import.meta.env.PROD;

/** Session cookies: not readable by scripts. */
export function sessionCookie(maxAgeSeconds: number): CookieAttributes {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: isProduction,
    maxAge: maxAgeSeconds,
  };
}

/**
 * The CSRF cookie is deliberately readable by JavaScript: the double-submit
 * pattern requires the client to echo it back, and it is not a credential on
 * its own — it only proves the request came from a page we served.
 */
export function csrfCookie(maxAgeSeconds = 60 * 60 * 8): CookieAttributes {
  return {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    secure: isProduction,
    maxAge: maxAgeSeconds,
  };
}

/**
 * «Hay sesión», y nada más.
 *
 * Casi todas las páginas se sirven ya hechas desde la CDN y no saben quién
 * las mira, así que la cabecera decía «Entrar» también a quien ya había
 * entrado. Esta cookie la lee `public/sesion-init.js` antes de pintar para
 * enseñar «Tu cuenta». Vale siempre `1`: no identifica a nadie ni sirve para
 * entrar; la sesión de verdad sigue en las cookies que no lee ningún script.
 * Sólo la escribe el middleware.
 */
export const SESSION_HINT_COOKIE = 'far_hay_sesion';

export function sessionHintCookie(maxAgeSeconds: number): CookieAttributes {
  return {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    secure: isProduction,
    maxAge: maxAgeSeconds,
  };
}

export function clearedCookie(httpOnly = true): CookieAttributes {
  return { httpOnly, sameSite: 'lax', path: '/', secure: isProduction, maxAge: 0 };
}

/** Serialises for a raw `Set-Cookie` header. */
export function serializeCookie(
  name: string,
  value: string,
  options: Partial<CookieAttributes> & { domain?: string }
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  parts.push(`Path=${options.path ?? '/'}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (options.httpOnly !== false) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  const sameSite = options.sameSite ?? 'lax';
  parts.push(`SameSite=${sameSite.charAt(0).toUpperCase()}${sameSite.slice(1)}`);
  return parts.join('; ');
}
