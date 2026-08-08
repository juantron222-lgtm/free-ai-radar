import { z } from 'zod';

/**
 * The Creators API integration, built before it is connected.
 *
 * Amazon has deprecated PA-API 5.0; Creators API replaces it, and a new
 * architecture should not be built on the thing being retired. Nothing here
 * makes a request: there is no key, no token and no endpoint call. What exists
 * is the machinery every caller will have to go through, so that the day
 * credentials arrive the limits are already enforced and already tested.
 *
 * The shape of the problem, and why each piece exists:
 *
 *   **Amazon's quota is small and provisional.** One transaction per second,
 *   and 8,640 per day for the first thirty days. After that it depends on how
 *   the account performs — it can go up, and it can go down. So the numbers
 *   are configuration with a recorded observation date, never constants the
 *   code trusts forever.
 *
 *   **The content expires in 24 hours.** Combined with a small quota, that
 *   makes a question the system has to be able to answer: *can we refresh
 *   everything we are showing before it goes stale?* If the answer is no, the
 *   only honest response is to show less — never to keep stale content
 *   because refreshing it was inconvenient.
 *
 *   **Tokens last an hour.** Requesting one per call would burn quota on
 *   authentication and hit Amazon's own limits on the token endpoint. They are
 *   cached, and the cache is shared, because AutoCraw may run as more than one
 *   process and two processes with private caches request twice as many
 *   tokens for no benefit.
 */

// ---------------------------------------------------------------------------
// Quota
// ---------------------------------------------------------------------------

/**
 * What we believe Amazon currently allows, and when we last checked.
 *
 * `recordedAt` is not decoration. Amazon adjusts these limits per account, so
 * a number with no date attached is a number nobody can evaluate: 8,640 was
 * true for the first thirty days of *some* account at *some* point, and
 * treating it as a standing guarantee is how a system quietly starts
 * exceeding a limit it thinks it is respecting.
 */
export const AmazonQuota = z.object({
  /** Transactions per second. */
  maxTps: z.number().positive().max(100),
  /** Transactions per day. */
  maxTpd: z.number().int().positive(),
  /** When this was last confirmed against Amazon's documentation or console. */
  recordedAt: z.string().datetime(),
  /** Where the figure came from, so a stale one can be traced. */
  source: z.string().min(1),
  /**
   * True while the account is inside the introductory window. After it, the
   * limits are performance-dependent and the recorded figure is a guess until
   * somebody re-checks.
   */
  provisional: z.boolean().default(true),
});
export type AmazonQuota = z.infer<typeof AmazonQuota>;

/**
 * Amazon's published starting limits.
 *
 * Deliberately named `INITIAL` and marked `provisional`. They are a starting
 * point to configure from, **not** a guarantee: after the first thirty days
 * the limits depend on account performance, and nothing in this system may
 * assume 8,640 remains available.
 */
export const AMAZON_INITIAL_QUOTA: AmazonQuota = {
  maxTps: 1,
  maxTpd: 8_640,
  recordedAt: '2026-08-08T00:00:00.000Z',
  source: 'Documentación de Amazon Creators API, límites iniciales de los primeros 30 días',
  provisional: true,
};

/** How old a recorded quota may be before it should be re-checked. */
export const QUOTA_RECHECK_AFTER_DAYS = 30;

export function quotaNeedsRecheck(quota: AmazonQuota, now: Date = new Date()): boolean {
  const recorded = Date.parse(quota.recordedAt);
  if (Number.isNaN(recorded)) return true;
  return (now.getTime() - recorded) / 86_400_000 > QUOTA_RECHECK_AFTER_DAYS;
}

// ---------------------------------------------------------------------------
// The shared store
// ---------------------------------------------------------------------------

/**
 * Where the limiter and the token cache keep their state.
 *
 * An interface rather than a concrete implementation because it has to work
 * two ways: in memory for a single process and for tests, and in Postgres when
 * AutoCraw runs more than one instance. Two processes each counting their own
 * transactions against a shared quota will exceed it together while each
 * believes it is within budget.
 */
export interface AmazonStateStore {
  /** Transactions already spent on `day` (UTC, YYYY-MM-DD). */
  getDailyCount(day: string): Promise<number>;
  /** Records `n` transactions against `day`, returning the new total. */
  addDailyCount(day: string, n: number): Promise<number>;
  /** Instant of the most recent transaction, for the per-second limit. */
  getLastRequestAt(): Promise<number | null>;
  setLastRequestAt(at: number): Promise<void>;
  /** The cached LwA token, if one is still valid. */
  getToken(): Promise<CachedToken | null>;
  setToken(token: CachedToken): Promise<void>;
  clearToken(): Promise<void>;
}

export interface CachedToken {
  accessToken: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}

/** In-memory implementation. Correct for one process; useless for two. */
export function createMemoryStore(): AmazonStateStore {
  const daily = new Map<string, number>();
  let lastRequestAt: number | null = null;
  let token: CachedToken | null = null;

  return {
    async getDailyCount(day) {
      return daily.get(day) ?? 0;
    },
    async addDailyCount(day, n) {
      const next = (daily.get(day) ?? 0) + n;
      daily.set(day, next);
      return next;
    },
    async getLastRequestAt() {
      return lastRequestAt;
    },
    async setLastRequestAt(at) {
      lastRequestAt = at;
    },
    async getToken() {
      return token;
    },
    async setToken(next) {
      token = next;
    },
    async clearToken() {
      token = null;
    },
  };
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

/**
 * Seconds of headroom before a token is treated as expired.
 *
 * A token that expires in four seconds is not usable for a request that takes
 * three: the clock can drift, the network can be slow, and the failure lands
 * as an opaque 401 rather than as "the token ran out". Sixty seconds is enough
 * to make that impossible without meaningfully shortening the token's life.
 */
export const TOKEN_EXPIRY_MARGIN_SECONDS = 60;

export interface TokenRequest {
  (): Promise<{ access_token: string; expires_in: number }>;
}

export class AmazonTokenCache {
  private inFlight: Promise<string> | null = null;

  constructor(
    private readonly store: AmazonStateStore,
    private readonly requestToken: TokenRequest,
    private readonly now: () => number = () => Date.now()
  ) {}

  /**
   * Returns a usable access token, reusing the cached one whenever possible.
   *
   * Three things happen here that all matter:
   *
   *   - A valid cached token is returned without a request. Asking for a fresh
   *     token on every call spends Amazon's token-endpoint budget to obtain
   *     something we already had.
   *   - The cache is read from the shared store, so a second AutoCraw process
   *     benefits from the first one's token instead of requesting its own.
   *   - Concurrent callers within one process share a single in-flight
   *     request. Without this, ten simultaneous calls on a cold cache make ten
   *     token requests, which is the exact behaviour the cache exists to stop.
   */
  async getAccessToken(): Promise<string> {
    const cached = await this.store.getToken();
    if (cached && cached.expiresAt > this.now() + TOKEN_EXPIRY_MARGIN_SECONDS * 1000) {
      return cached.accessToken;
    }

    if (this.inFlight) return this.inFlight;

    this.inFlight = (async () => {
      try {
        const response = await this.requestToken();
        const token: CachedToken = {
          accessToken: response.access_token,
          expiresAt: this.now() + response.expires_in * 1000,
        };
        await this.store.setToken(token);
        return token.accessToken;
      } finally {
        this.inFlight = null;
      }
    })();

    return this.inFlight;
  }

  /** Called on a 401: the token is gone, whatever its stated expiry said. */
  async invalidate(): Promise<void> {
    await this.store.clearToken();
  }
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

export interface RateDecision {
  allowed: boolean;
  /** Milliseconds to wait before the request would be allowed. */
  waitMs: number;
  reason?: 'tps' | 'tpd';
  /** How many transactions remain today. */
  remainingToday: number;
}

export function utcDay(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

/**
 * The single place that decides whether a request may go out.
 *
 * Central on purpose: a limiter each caller applies for itself is a limiter
 * that the next caller forgets. Everything that talks to Amazon goes through
 * `acquire`, and there is no path around it.
 */
export class AmazonRateLimiter {
  constructor(
    private readonly store: AmazonStateStore,
    private quota: AmazonQuota,
    private readonly now: () => number = () => Date.now()
  ) {}

  getQuota(): AmazonQuota {
    return this.quota;
  }

  /** Quota is configuration, so it can be corrected without a deploy. */
  setQuota(quota: AmazonQuota): void {
    this.quota = AmazonQuota.parse(quota);
  }

  async check(): Promise<RateDecision> {
    const at = this.now();
    const day = utcDay(at);
    const spent = await this.store.getDailyCount(day);
    const remainingToday = Math.max(0, this.quota.maxTpd - spent);

    if (remainingToday <= 0) {
      // Until midnight UTC. Waiting is pointless before then.
      const midnight = Date.parse(`${day}T00:00:00.000Z`) + 86_400_000;
      return { allowed: false, waitMs: midnight - at, reason: 'tpd', remainingToday: 0 };
    }

    const minGapMs = 1000 / this.quota.maxTps;
    const last = await this.store.getLastRequestAt();
    if (last !== null && at - last < minGapMs) {
      return {
        allowed: false,
        waitMs: Math.ceil(minGapMs - (at - last)),
        reason: 'tps',
        remainingToday,
      };
    }

    return { allowed: true, waitMs: 0, remainingToday };
  }

  /** Records a transaction. Call only when one is actually being made. */
  async consume(): Promise<void> {
    const at = this.now();
    await this.store.setLastRequestAt(at);
    await this.store.addDailyCount(utcDay(at), 1);
  }
}

// ---------------------------------------------------------------------------
// Feasibility
// ---------------------------------------------------------------------------

export interface RefreshFeasibility {
  feasible: boolean;
  /** How many items the remaining quota could refresh in the window. */
  capacity: number;
  reason?: string;
}

/**
 * Whether the quota can refresh everything we intend to show, in time.
 *
 * This is the question that decides whether an Amazon placement renders at
 * all. Content expires in 24 hours; if the budget cannot cover a refresh of
 * every item within that window, then some of it *will* go stale, and the only
 * two options are to show less or to show something expired.
 *
 * Showing something expired is not an option — it is the licence term, not a
 * preference — so the system shows less. Never the third thing a tired
 * engineer reaches for, which is to quietly treat the cache as valid for a bit
 * longer.
 */
export function refreshFeasibility(
  itemCount: number,
  quota: AmazonQuota,
  spentToday: number,
  now: Date = new Date()
): RefreshFeasibility {
  const remaining = Math.max(0, quota.maxTpd - spentToday);

  /*
   * The per-second limit also caps a 24-hour window, and for a small TPS it
   * binds before the daily total does: at 1 TPS the most you can make in a day
   * is 86,400 requests, but the daily cap of 8,640 is the tighter of the two.
   * Taking the minimum means whichever limit actually binds is the one used.
   */
  const tpsCeiling = Math.floor(quota.maxTps * 86_400);
  const capacity = Math.min(remaining, tpsCeiling);

  if (itemCount > capacity) {
    return {
      feasible: false,
      capacity,
      reason:
        `Refrescar ${itemCount} elementos en 24 h necesita ${itemCount} transacciones y sólo quedan ${capacity}. ` +
        'Se muestran menos productos de Amazon; la caché no se extiende.',
    };
  }

  if (quota.provisional && quotaNeedsRecheck(quota, now)) {
    return {
      feasible: false,
      capacity,
      reason:
        'La cuota registrada es provisional y lleva más de 30 días sin comprobarse. ' +
        'Los límites de Amazon dependen del rendimiento de la cuenta y pueden haber bajado.',
    };
  }

  return { feasible: true, capacity };
}

// ---------------------------------------------------------------------------
// The client
// ---------------------------------------------------------------------------

export interface CreatorsApiResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export interface CreatorsApiTransport {
  (request: { url: string; token: string; body: unknown }): Promise<CreatorsApiResponse>;
}

export interface BackoffOptions {
  /** First wait, in milliseconds. Doubles each attempt. */
  baseMs: number;
  /** Never wait longer than this, however many attempts have failed. */
  maxMs: number;
  /** Attempts, including the first. */
  maxAttempts: number;
}

export const DEFAULT_BACKOFF: BackoffOptions = {
  baseMs: 1_000,
  maxMs: 60_000,
  maxAttempts: 5,
};

/**
 * How long to wait after a throttled response.
 *
 * `Retry-After` wins whenever Amazon sends one: they know when the window
 * reopens and we are guessing. Only when it is absent does the exponential
 * schedule apply.
 *
 * Jitter is deliberate. Without it, every process that got throttled at the
 * same moment retries at the same moment, which is how a rate limit turns into
 * a synchronised stampede that gets everyone throttled again.
 */
export function backoffDelay(
  attempt: number,
  retryAfterHeader: string | undefined,
  options: BackoffOptions = DEFAULT_BACKOFF,
  random: () => number = Math.random
): number {
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, options.maxMs);
    }
    // Retry-After may be an HTTP date rather than a number of seconds.
    const asDate = Date.parse(retryAfterHeader);
    if (!Number.isNaN(asDate)) {
      return Math.min(Math.max(0, asDate - Date.now()), options.maxMs);
    }
  }

  const exponential = Math.min(options.baseMs * 2 ** (attempt - 1), options.maxMs);
  return Math.round(exponential * (0.5 + random() * 0.5));
}

export class AmazonApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly throttled = false
  ) {
    super(message);
    this.name = 'AmazonApiError';
  }
}

/**
 * The only way to call Creators API.
 *
 * Every request passes the limiter, carries a cached token, and retries a
 * throttled response with backoff. A caller cannot skip any of it, because
 * there is no other method that reaches the transport.
 */
export class CreatorsApiClient {
  constructor(
    private readonly transport: CreatorsApiTransport,
    private readonly tokens: AmazonTokenCache,
    private readonly limiter: AmazonRateLimiter,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
    private readonly backoff: BackoffOptions = DEFAULT_BACKOFF
  ) {}

  async request(url: string, body: unknown): Promise<CreatorsApiResponse> {
    let lastError: AmazonApiError | null = null;

    for (let attempt = 1; attempt <= this.backoff.maxAttempts; attempt += 1) {
      const decision = await this.limiter.check();

      if (!decision.allowed) {
        if (decision.reason === 'tpd') {
          // Waiting for midnight is not a retry, it is a different day.
          throw new AmazonApiError(
            `Cuota diaria agotada: ${this.limiter.getQuota().maxTpd} transacciones. No se reintenta.`,
            429,
            true
          );
        }
        await this.sleep(decision.waitMs);
        continue;
      }

      const token = await this.tokens.getAccessToken();
      await this.limiter.consume();

      let response: CreatorsApiResponse;
      try {
        response = await this.transport({ url, token, body });
      } catch (error) {
        // The API being unreachable is a normal condition, not an exception
        // the site should propagate. It is retried like any other failure.
        lastError = new AmazonApiError(
          `Creators API inalcanzable: ${error instanceof Error ? error.message : String(error)}`,
          0
        );
        if (attempt < this.backoff.maxAttempts) {
          await this.sleep(backoffDelay(attempt, undefined, this.backoff));
          continue;
        }
        throw lastError;
      }

      if (response.status === 429) {
        lastError = new AmazonApiError('Creators API ha limitado la petición (429).', 429, true);
        if (attempt < this.backoff.maxAttempts) {
          const retryAfter = response.headers['retry-after'] ?? response.headers['Retry-After'];
          await this.sleep(backoffDelay(attempt, retryAfter, this.backoff));
          continue;
        }
        throw lastError;
      }

      if (response.status === 401) {
        // The token was rejected regardless of what its expiry claimed.
        await this.tokens.invalidate();
        lastError = new AmazonApiError('Token rechazado por Creators API (401).', 401);
        if (attempt < this.backoff.maxAttempts) continue;
        throw lastError;
      }

      if (response.status >= 500) {
        lastError = new AmazonApiError(`Creators API ha fallado (${response.status}).`, response.status);
        if (attempt < this.backoff.maxAttempts) {
          await this.sleep(backoffDelay(attempt, undefined, this.backoff));
          continue;
        }
        throw lastError;
      }

      if (response.status >= 400) {
        throw new AmazonApiError(`Creators API ha rechazado la petición (${response.status}).`, response.status);
      }

      return response;
    }

    throw lastError ?? new AmazonApiError('Creators API: se agotaron los intentos.', 0);
  }
}
