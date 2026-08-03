/**
 * Open-redirect protection.
 *
 * `?next=` parameters are the classic phishing vector: an attacker sends a
 * legitimate-looking login link that bounces the victim to their own page after
 * authentication. Only same-origin, path-only destinations are honoured.
 */

const ALLOWED_PATH = /^\/(?!\/)[\w\-./?=&%,:#]*$/;

export function safeRedirect(candidate: string | null | undefined, fallback = '/cuenta'): string {
  if (!candidate) return fallback;

  const value = candidate.trim();

  // Reject anything that is not a plain, single-slash absolute path.
  if (!value.startsWith('/')) return fallback;
  if (value.startsWith('//')) return fallback;
  if (value.includes('\\')) return fallback;
  if (/^\/+\s*[a-z][a-z0-9+.-]*:/i.test(value)) return fallback;
  if (!ALLOWED_PATH.test(value)) return fallback;

  // Never bounce back into an endpoint or the admin area from a login link.
  if (value.startsWith('/api/')) return fallback;

  return value;
}
