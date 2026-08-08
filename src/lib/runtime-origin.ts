import { SITE_URL } from '@lib/seo/site';

/**
 * Where the visitor actually is, as opposed to where the site canonically
 * lives.
 *
 * These are two different questions and the codebase was answering both with
 * `SITE_URL`:
 *
 *   · **Canonical origin** — what `<link rel=canonical>`, the sitemap, the RSS
 *     feed and the JSON-LD should say. Always the production domain, even from
 *     a preview, because a preview must not compete with the real site for its
 *     own keywords.
 *
 *   · **Runtime origin** — where a redirect should land, and where a
 *     confirmation link should point. Whatever host the request arrived on. A
 *     login started on a preview has to come back to that preview; sending the
 *     visitor to the production domain mid-flow loses their session and looks
 *     like the site is broken.
 *
 * Mixing them is invisible in production, where the two are the same string,
 * and breaks the moment there is a second deployment.
 *
 * ---------------------------------------------------------------------------
 * On not trusting the host header
 *
 * The obvious implementation reads `X-Forwarded-Host`. It is also how password
 * reset emails get sent to an attacker's domain: request a reset with a forged
 * host header, and the victim receives a genuine token pointing at your
 * server. Host header injection is a well-worn account takeover, and a
 * password reset link is exactly the payload it wants.
 *
 * So the origin is taken from the request and then **checked against an
 * allow-list**. Anything unrecognised falls back to the canonical origin,
 * which is wrong-but-harmless rather than right-but-exploitable.
 */

/** Hosts that may appear as a runtime origin. Everything else is rejected. */
function isTrustedOrigin(origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }

  // The canonical site itself.
  if (origin === SITE_URL) return true;

  // Vercel preview deployments. The suffix is fixed and Vercel-controlled; a
  // hostname merely *containing* it does not match, because the check is on
  // the final labels rather than a substring.
  if (url.protocol === 'https:' && /(^|\.)vercel\.app$/.test(url.hostname)) return true;

  // Local development.
  if (
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
    (url.protocol === 'http:' || url.protocol === 'https:')
  ) {
    return true;
  }

  return false;
}

/**
 * The origin to use for redirects and confirmation links.
 *
 * Falls back to the canonical origin when the request's own origin is not
 * recognised — a redirect to the real site is a worse user experience than
 * staying put, and infinitely better than one to somebody else's.
 */
export function runtimeOrigin(request: Request | undefined): string {
  if (!request) return SITE_URL;

  let origin: string;
  try {
    origin = new URL(request.url).origin;
  } catch {
    return SITE_URL;
  }

  return isTrustedOrigin(origin) ? origin : SITE_URL;
}

/** An absolute URL on the runtime origin, for a redirect or an email link. */
export function runtimeUrl(request: Request | undefined, path: string): string {
  const base = runtimeOrigin(request);
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Exported for tests: the allow-list decision on its own. */
export const __isTrustedOrigin = isTrustedOrigin;
