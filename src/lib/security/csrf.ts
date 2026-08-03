import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { authSecret } from '@lib/config';

/**
 * CSRF protection: double-submit cookie plus Origin check.
 *
 * Cookies are `SameSite=Lax`, which already blocks cross-site POSTs from a
 * plain form. This is defence in depth for the cases Lax does not cover
 * (top-level navigations, older browsers) and it is cheap.
 */

export const CSRF_COOKIE = 'far_csrf';
export const CSRF_FIELD = '_csrf';
export const CSRF_HEADER = 'x-csrf-token';

function key(): string {
  return authSecret || process.env['AUTH_SECRET'] || 'free-ai-radar-development-only-key';
}

export function issueToken(): string {
  const nonce = randomBytes(16).toString('base64url');
  const signature = createHmac('sha256', key()).update(nonce).digest('base64url');
  return `${nonce}.${signature}`;
}

export function isValidToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const [nonce, signature] = token.split('.');
  if (!nonce || !signature) return false;

  const expected = createHmac('sha256', key()).update(nonce).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Verifies a state-changing request.
 *
 * Both halves must hold: the cookie and the submitted token must be identical
 * and validly signed, and the Origin (or Referer) must match.
 *
 * `siteOrigin` must be **the origin of the request being handled**, not a
 * configured canonical URL. Comparing against a constant breaks every form on
 * `localhost` and on Vercel preview deployments, where the served origin
 * legitimately differs from the production one — and it adds nothing, because
 * the property that matters is "same origin as the target", which only the
 * request itself can establish.
 */
export function verifyCsrf(input: {
  cookieToken: string | undefined;
  submittedToken: string | undefined | null;
  origin: string | null;
  referer: string | null;
  siteOrigin: string;
}): { ok: boolean; reason?: string } {
  const { cookieToken, submittedToken, origin, referer, siteOrigin } = input;

  if (!cookieToken || !submittedToken) return { ok: false, reason: 'missing-token' };
  if (cookieToken !== submittedToken) return { ok: false, reason: 'token-mismatch' };
  if (!isValidToken(cookieToken)) return { ok: false, reason: 'bad-signature' };

  const source = origin ?? referer;
  if (source) {
    try {
      if (new URL(source).origin !== new URL(siteOrigin).origin) {
        return { ok: false, reason: 'origin-mismatch' };
      }
    } catch {
      return { ok: false, reason: 'bad-origin' };
    }
  }

  return { ok: true };
}
