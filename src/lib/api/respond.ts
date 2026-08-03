import type { APIContext } from 'astro';
import type { z } from 'zod';
import { CSRF_COOKIE, CSRF_FIELD, CSRF_HEADER, verifyCsrf } from '@lib/security/csrf';
import { checkRateLimit, clientKey, type RateLimitName } from '@lib/security/rate-limit';
import { SITE_URL } from '@lib/seo/site';
import { logger } from '@lib/observability/logger';
import { turnstile } from '@lib/config';

export interface ApiPayload {
  ok: boolean;
  message: string;
  /** Field-level errors keyed by input name. */
  errors?: Record<string, string>;
  data?: unknown;
}

export function json(payload: ApiPayload, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

export function tooManyRequests(retryAfter: number): Response {
  return json(
    {
      ok: false,
      message: `Demasiados intentos. Vuelve a probar en ${Math.ceil(retryAfter / 60)} minuto(s).`,
    },
    429,
    { 'Retry-After': String(retryAfter) }
  );
}

/**
 * Everything a mutating endpoint must check before it does anything.
 *
 * Order matters: cheap rejections first (method, rate limit) so an attacker
 * cannot use expensive validation as an amplification vector.
 */
export interface GuardOptions {
  rateLimit: RateLimitName;
  /** Skip CSRF only for endpoints authenticated another way (Stripe webhook). */
  requireCsrf?: boolean;
  /** Honeypot field name; a filled value is silently treated as success. */
  honeypot?: string;
}

export interface GuardResult {
  ok: boolean;
  response?: Response;
  form?: FormData;
  /** True when the honeypot caught a bot: pretend everything went fine. */
  trapped?: boolean;
}

export async function guard(context: APIContext, options: GuardOptions): Promise<GuardResult> {
  const { request, cookies } = context;

  const limit = checkRateLimit(options.rateLimit, clientKey(request));
  if (!limit.allowed) {
    logger.warn('api.rate_limited', { endpoint: options.rateLimit });
    return { ok: false, response: tooManyRequests(limit.retryAfter) };
  }

  let form: FormData;
  try {
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const body = (await request.json()) as Record<string, unknown>;
      form = new FormData();
      for (const [key, value] of Object.entries(body)) {
        if (Array.isArray(value)) for (const item of value) form.append(key, String(item));
        else if (value !== null && value !== undefined) form.append(key, String(value));
      }
    } else {
      form = await request.formData();
    }
  } catch {
    return { ok: false, response: json({ ok: false, message: 'Petición mal formada.' }, 400) };
  }

  if (options.requireCsrf !== false) {
    const check = verifyCsrf({
      cookieToken: cookies.get(CSRF_COOKIE)?.value,
      submittedToken:
        (form.get(CSRF_FIELD) as string | null) ?? request.headers.get(CSRF_HEADER),
      origin: request.headers.get('origin'),
      referer: request.headers.get('referer'),
      // The origin actually being served, not the canonical production URL.
      siteOrigin: new URL(request.url).origin,
    });

    if (!check.ok) {
      logger.warn('api.csrf_rejected', { endpoint: options.rateLimit, reason: check.reason });
      return {
        ok: false,
        response: json(
          {
            ok: false,
            message: 'Tu sesión ha caducado. Recarga la página e inténtalo de nuevo.',
          },
          403
        ),
      };
    }
  }

  if (options.honeypot) {
    const trap = form.get(options.honeypot);
    if (typeof trap === 'string' && trap.trim().length > 0) {
      logger.info('api.honeypot', { endpoint: options.rateLimit });
      return { ok: true, form, trapped: true };
    }
  }

  return { ok: true, form };
}

/** Turns a Zod failure into per-field messages the form can display. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    errors[key] ??= issue.message;
  }
  return errors;
}

export function validationResponse(error: z.ZodError): Response {
  const errors = fieldErrors(error);
  return json(
    {
      ok: false,
      message: Object.values(errors)[0] ?? 'Revisa los datos introducidos.',
      errors,
    },
    422
  );
}

/**
 * Cloudflare Turnstile verification.
 *
 * Returns `true` when Turnstile is not configured, so development and CI are
 * not blocked by a captcha that cannot be solved headlessly.
 */
export async function verifyTurnstile(token: string | null, remoteIp?: string): Promise<boolean> {
  if (!turnstile.isConfigured) return true;
  if (!token) return false;

  try {
    const body = new FormData();
    body.append('secret', turnstile.secretKey);
    body.append('response', token);
    if (remoteIp) body.append('remoteip', remoteIp);

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
    });
    const result = (await response.json()) as { success: boolean };
    return result.success === true;
  } catch (error) {
    logger.error('turnstile.error', { error: error instanceof Error ? error.message : String(error) });
    // Fail closed on a verification outage for abuse-prone endpoints.
    return false;
  }
}

/**
 * Returns a JSON payload for fetch callers, or a 303 redirect for plain forms.
 *
 * When a redirect target is given, the JSON branch carries it as `data.next`.
 * Without that the enhanced form would show a success message and sit there,
 * while the no-JavaScript path navigated correctly — the two would disagree,
 * which is exactly what progressive enhancement is supposed to avoid.
 */
export function respond(
  context: APIContext,
  payload: ApiPayload,
  status: number,
  redirectTo?: string
): Response {
  const wantsJson = (context.request.headers.get('accept') ?? '').includes('application/json');

  if (wantsJson || !redirectTo) {
    const body: ApiPayload =
      redirectTo && payload.ok
        ? {
            ...payload,
            data: { ...(payload.data as Record<string, unknown> | undefined), next: redirectTo },
          }
        : payload;
    return json(body, status);
  }

  const url = new URL(redirectTo, SITE_URL);
  url.searchParams.set(payload.ok ? 'ok' : 'error', payload.message);
  return context.redirect(`${url.pathname}${url.search}`, 303);
}
