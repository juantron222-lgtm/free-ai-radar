import { createHash } from 'node:crypto';

/**
 * Fixed-window rate limiter.
 *
 * In-memory, per-instance. On Vercel that means the limit is per serverless
 * instance rather than global — enough to stop a single client hammering an
 * endpoint, not enough to stop a distributed attack. `docs/security-review.md`
 * records this and the upgrade path (Upstash Redis, same interface).
 *
 * Keys are hashed so raw IP addresses never sit in process memory.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_TRACKED_KEYS = 10_000;

export interface RateLimitRule {
  /** Requests allowed inside the window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

export const RATE_LIMITS = {
  signIn: { limit: 8, windowSeconds: 600 },
  signUp: { limit: 5, windowSeconds: 3600 },
  passwordReset: { limit: 4, windowSeconds: 3600 },
  newsletter: { limit: 5, windowSeconds: 3600 },
  correction: { limit: 6, windowSeconds: 3600 },
  submission: { limit: 4, windowSeconds: 3600 },
  contact: { limit: 4, windowSeconds: 3600 },
  api: { limit: 120, windowSeconds: 60 },
  checkout: { limit: 10, windowSeconds: 600 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets. Used for the Retry-After header. */
  retryAfter: number;
}

function hashKey(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

/**
 * Best-effort client identity.
 *
 * Trusts `x-forwarded-for` only because Vercel sets it at the edge and strips
 * client-supplied copies. Behind any other proxy this must be revisited.
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  const ip = forwarded.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  return hashKey(ip);
}

/**
 * End-to-end runs create dozens of accounts from one address in minutes, which
 * legitimately trips the sign-up limit and makes every later test fail for the
 * wrong reason. Under `E2E=1` the ceiling is raised rather than removed, so the
 * accounting still runs; the limiter's actual behaviour is covered by unit
 * tests. `E2E` is never set in production.
 */
const LIMIT_MULTIPLIER = process.env['E2E'] === '1' ? 200 : 1;

export function checkRateLimit(name: RateLimitName, identity: string): RateLimitResult {
  const rule = { ...RATE_LIMITS[name], limit: RATE_LIMITS[name].limit * LIMIT_MULTIPLIER };
  const key = `${name}:${identity}`;
  const now = Date.now();

  // Cheap eviction so a long-running instance cannot grow unbounded.
  if (buckets.size > MAX_TRACKED_KEYS) {
    for (const [existingKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(existingKey);
    }
    if (buckets.size > MAX_TRACKED_KEYS) buckets.clear();
  }

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + rule.windowSeconds * 1000 });
    return { allowed: true, remaining: rule.limit - 1, retryAfter: 0 };
  }

  existing.count += 1;
  const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));

  if (existing.count > rule.limit) {
    return { allowed: false, remaining: 0, retryAfter };
  }

  return { allowed: true, remaining: rule.limit - existing.count, retryAfter };
}

/** Test seam. */
export function resetRateLimits(): void {
  buckets.clear();
}
