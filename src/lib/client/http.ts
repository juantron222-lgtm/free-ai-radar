/**
 * Browser-side POST helper.
 *
 * Guarantees every mutating request carries a valid CSRF token, including from
 * prerendered pages that were served straight off the CDN and therefore have no
 * server-rendered token in their HTML. The token is fetched once, cached for
 * the page's lifetime, and re-fetched if the server ever rejects it.
 */

const CSRF_COOKIE = 'far_csrf';
const CSRF_HEADER = 'x-csrf-token';

let cached: string | null = null;

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export async function csrfToken(force = false): Promise<string> {
  if (!force) {
    const existing = cached ?? readCookie(CSRF_COOKIE);
    if (existing) {
      cached = existing;
      return existing;
    }
  }

  const response = await fetch('/api/csrf', { credentials: 'same-origin' });
  const payload = (await response.json()) as { token: string };
  cached = payload.token;
  return payload.token;
}

export interface PostResult<T = unknown> {
  ok: boolean;
  message: string;
  errors?: Record<string, string>;
  data?: T;
  status: number;
}

export async function postForm<T = unknown>(
  url: string,
  body: FormData | Record<string, unknown>,
  options: { method?: 'POST' | 'DELETE' } = {}
): Promise<PostResult<T>> {
  const method = options.method ?? 'POST';

  const send = async (token: string): Promise<Response> => {
    const isForm = body instanceof FormData;
    return fetch(url, {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        [CSRF_HEADER]: token,
        ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      },
      body: isForm ? body : JSON.stringify(body),
    });
  };

  try {
    let response = await send(await csrfToken());

    // A stale token (expired cookie, rotated secret) is worth exactly one
    // silent retry with a fresh one before bothering the user.
    if (response.status === 403) {
      response = await send(await csrfToken(true));
    }

    const payload = (await response.json()) as Omit<PostResult<T>, 'status'>;
    return { ...payload, status: response.status };
  } catch {
    return {
      ok: false,
      status: 0,
      message: 'No hemos podido conectar. Comprueba tu conexión e inténtalo de nuevo.',
    };
  }
}
