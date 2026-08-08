import { describe, expect, it, vi } from 'vitest';
import {
  AMAZON_INITIAL_QUOTA,
  AmazonApiError,
  AmazonQuota,
  AmazonRateLimiter,
  AmazonTokenCache,
  CreatorsApiClient,
  DEFAULT_BACKOFF,
  QUOTA_RECHECK_AFTER_DAYS,
  TOKEN_EXPIRY_MARGIN_SECONDS,
  backoffDelay,
  createMemoryStore,
  quotaNeedsRecheck,
  refreshFeasibility,
  utcDay,
  type CreatorsApiResponse,
} from '@lib/amazon/creators-api';

/**
 * The Creators API machinery, tested before Amazon is connected.
 *
 * Every test drives injected time, transport and randomness, so nothing here
 * sleeps for real or depends on a clock. A rate limiter that can only be
 * verified by waiting is a rate limiter nobody verifies.
 */

const NOW = Date.parse('2026-08-08T12:00:00.000Z');

function quota(overrides: Partial<AmazonQuota> = {}): AmazonQuota {
  return AmazonQuota.parse({
    ...AMAZON_INITIAL_QUOTA,
    recordedAt: new Date(NOW).toISOString(),
    ...overrides,
  });
}

/** A clock the tests move by hand. */
function clock(start = NOW) {
  let at = start;
  return {
    now: () => at,
    advance: (ms: number) => {
      at += ms;
    },
  };
}

// ---------------------------------------------------------------------------

describe('la cuota es configuración, no una garantía', () => {
  it('los límites iniciales están marcados como provisionales', () => {
    expect(AMAZON_INITIAL_QUOTA.maxTps).toBe(1);
    expect(AMAZON_INITIAL_QUOTA.maxTpd).toBe(8_640);
    expect(AMAZON_INITIAL_QUOTA.provisional).toBe(true);
    expect(AMAZON_INITIAL_QUOTA.source).toContain('30 días');
  });

  it('registra cuándo se comprobó', () => {
    expect(() => new Date(AMAZON_INITIAL_QUOTA.recordedAt).toISOString()).not.toThrow();
  });

  it('una cuota vieja pide recomprobación', () => {
    const old = quota({ recordedAt: new Date(NOW - (QUOTA_RECHECK_AFTER_DAYS + 1) * 86_400_000).toISOString() });
    expect(quotaNeedsRecheck(old, new Date(NOW))).toBe(true);
    expect(quotaNeedsRecheck(quota(), new Date(NOW))).toBe(false);
  });

  it('se puede cambiar sin desplegar', () => {
    const limiter = new AmazonRateLimiter(createMemoryStore(), quota(), () => NOW);
    limiter.setQuota(quota({ maxTps: 5, maxTpd: 50_000, provisional: false }));
    expect(limiter.getQuota().maxTpd).toBe(50_000);
  });
});

describe('límite de transacciones por segundo', () => {
  it('permite la primera y frena la inmediata siguiente', async () => {
    const time = clock();
    const limiter = new AmazonRateLimiter(createMemoryStore(), quota({ maxTps: 1 }), time.now);

    expect((await limiter.check()).allowed).toBe(true);
    await limiter.consume();

    const second = await limiter.check();
    expect(second.allowed).toBe(false);
    expect(second.reason).toBe('tps');
    expect(second.waitMs).toBeGreaterThan(0);
    expect(second.waitMs).toBeLessThanOrEqual(1000);
  });

  it('permite de nuevo pasado el intervalo', async () => {
    const time = clock();
    const limiter = new AmazonRateLimiter(createMemoryStore(), quota({ maxTps: 1 }), time.now);
    await limiter.consume();

    time.advance(1001);
    expect((await limiter.check()).allowed).toBe(true);
  });

  it('un TPS más alto acorta el intervalo', async () => {
    const time = clock();
    const limiter = new AmazonRateLimiter(createMemoryStore(), quota({ maxTps: 4 }), time.now);
    await limiter.consume();

    time.advance(260);
    expect((await limiter.check()).allowed).toBe(true);
  });
});

describe('agotamiento de la cuota diaria', () => {
  it('deniega cuando se han gastado todas', async () => {
    const store = createMemoryStore();
    const time = clock();
    const limiter = new AmazonRateLimiter(store, quota({ maxTpd: 3, maxTps: 100 }), time.now);

    for (let i = 0; i < 3; i += 1) {
      expect((await limiter.check()).allowed, `transacción ${i + 1}`).toBe(true);
      await limiter.consume();
      time.advance(50);
    }

    const denied = await limiter.check();
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe('tpd');
    expect(denied.remainingToday).toBe(0);
  });

  it('la espera va hasta medianoche UTC, no un intervalo corto', async () => {
    const store = createMemoryStore();
    const time = clock();
    const limiter = new AmazonRateLimiter(store, quota({ maxTpd: 1, maxTps: 100 }), time.now);
    await limiter.consume();

    const denied = await limiter.check();
    // 12:00Z → medianoche son doce horas.
    expect(denied.waitMs).toBeGreaterThan(11 * 3_600_000);
    expect(denied.waitMs).toBeLessThanOrEqual(12 * 3_600_000);
  });

  it('el contador es por día UTC', () => {
    expect(utcDay(Date.parse('2026-08-08T23:59:59Z'))).toBe('2026-08-08');
    expect(utcDay(Date.parse('2026-08-09T00:00:01Z'))).toBe('2026-08-09');
  });

  it('el gasto se comparte: dos limitadores sobre el mismo almacén', async () => {
    // Two AutoCraw processes must not each get the full daily budget.
    const store = createMemoryStore();
    const time = clock();
    const a = new AmazonRateLimiter(store, quota({ maxTpd: 2, maxTps: 100 }), time.now);
    const b = new AmazonRateLimiter(store, quota({ maxTpd: 2, maxTps: 100 }), time.now);

    await a.consume();
    time.advance(10);
    await b.consume();
    time.advance(10);

    expect((await a.check()).allowed).toBe(false);
    expect((await b.check()).allowed).toBe(false);
  });
});

describe('caché del token de LwA', () => {
  it('reutiliza el token en vez de pedir uno por llamada', async () => {
    const store = createMemoryStore();
    const request = vi.fn().mockResolvedValue({ access_token: 'tok-1', expires_in: 3600 });
    const cache = new AmazonTokenCache(store, request, () => NOW);

    expect(await cache.getAccessToken()).toBe('tok-1');
    expect(await cache.getAccessToken()).toBe('tok-1');
    expect(await cache.getAccessToken()).toBe('tok-1');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('pide uno nuevo cuando el anterior ha expirado', async () => {
    const store = createMemoryStore();
    const time = clock();
    const request = vi
      .fn()
      .mockResolvedValueOnce({ access_token: 'tok-1', expires_in: 3600 })
      .mockResolvedValueOnce({ access_token: 'tok-2', expires_in: 3600 });
    const cache = new AmazonTokenCache(store, request, time.now);

    expect(await cache.getAccessToken()).toBe('tok-1');
    time.advance(3600 * 1000 + 1);
    expect(await cache.getAccessToken()).toBe('tok-2');
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('renueva con margen: no entrega un token que caduca en segundos', async () => {
    const store = createMemoryStore();
    const time = clock();
    const request = vi
      .fn()
      .mockResolvedValueOnce({ access_token: 'tok-1', expires_in: 3600 })
      .mockResolvedValueOnce({ access_token: 'tok-2', expires_in: 3600 });
    const cache = new AmazonTokenCache(store, request, time.now);

    await cache.getAccessToken();
    // Dentro del margen de seguridad, aunque técnicamente no haya expirado.
    time.advance((3600 - TOKEN_EXPIRY_MARGIN_SECONDS + 1) * 1000);
    expect(await cache.getAccessToken()).toBe('tok-2');
  });

  it('un segundo proceso aprovecha el token del primero', async () => {
    const store = createMemoryStore();
    const request = vi.fn().mockResolvedValue({ access_token: 'compartido', expires_in: 3600 });

    const primero = new AmazonTokenCache(store, request, () => NOW);
    const segundo = new AmazonTokenCache(store, request, () => NOW);

    expect(await primero.getAccessToken()).toBe('compartido');
    expect(await segundo.getAccessToken()).toBe('compartido');
    expect(request, 'el segundo proceso ha vuelto a pedir token').toHaveBeenCalledTimes(1);
  });

  it('diez llamadas simultáneas en frío hacen una sola petición', async () => {
    const store = createMemoryStore();
    const request = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ access_token: 'tok', expires_in: 3600 }), 5)
        )
    );
    const cache = new AmazonTokenCache(store, request, () => NOW);

    await Promise.all(Array.from({ length: 10 }, () => cache.getAccessToken()));
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('un 401 invalida el token guardado', async () => {
    const store = createMemoryStore();
    const request = vi.fn().mockResolvedValue({ access_token: 'tok', expires_in: 3600 });
    const cache = new AmazonTokenCache(store, request, () => NOW);

    await cache.getAccessToken();
    await cache.invalidate();
    expect(await store.getToken()).toBeNull();
  });
});

describe('backoff exponencial y Retry-After', () => {
  it('Retry-After manda cuando existe', () => {
    expect(backoffDelay(1, '5', DEFAULT_BACKOFF, () => 0.5)).toBe(5000);
    expect(backoffDelay(3, '2', DEFAULT_BACKOFF, () => 0.5)).toBe(2000);
  });

  it('Retry-After como fecha HTTP también se entiende', () => {
    const future = new Date(Date.now() + 4000).toUTCString();
    const delay = backoffDelay(1, future, DEFAULT_BACKOFF, () => 0.5);
    expect(delay).toBeGreaterThan(2000);
    expect(delay).toBeLessThanOrEqual(5000);
  });

  it('sin Retry-After, el retardo se duplica en cada intento', () => {
    const noJitter = () => 1;
    const first = backoffDelay(1, undefined, DEFAULT_BACKOFF, noJitter);
    const second = backoffDelay(2, undefined, DEFAULT_BACKOFF, noJitter);
    const third = backoffDelay(3, undefined, DEFAULT_BACKOFF, noJitter);

    expect(second).toBe(first * 2);
    expect(third).toBe(second * 2);
  });

  it('nunca supera el techo', () => {
    expect(backoffDelay(20, undefined, DEFAULT_BACKOFF, () => 1)).toBe(DEFAULT_BACKOFF.maxMs);
    expect(backoffDelay(1, '99999', DEFAULT_BACKOFF, () => 1)).toBe(DEFAULT_BACKOFF.maxMs);
  });

  it('lleva jitter: dos procesos no reintentan a la vez', () => {
    const low = backoffDelay(3, undefined, DEFAULT_BACKOFF, () => 0);
    const high = backoffDelay(3, undefined, DEFAULT_BACKOFF, () => 1);
    expect(low).toBeLessThan(high);
  });

  it('un Retry-After absurdo no se toma al pie de la letra', () => {
    expect(backoffDelay(1, 'mañana', DEFAULT_BACKOFF, () => 1)).toBe(DEFAULT_BACKOFF.baseMs);
  });
});

// ---------------------------------------------------------------------------

function makeClient(
  responses: Array<CreatorsApiResponse | Error>,
  options: { quota?: AmazonQuota; maxAttempts?: number } = {}
) {
  const store = createMemoryStore();
  const time = clock();
  const sleeps: number[] = [];

  let index = 0;
  const transport = vi.fn(async (): Promise<CreatorsApiResponse> => {
    const next = responses[Math.min(index, responses.length - 1)]!;
    index += 1;
    if (next instanceof Error) throw next;
    return next;
  });

  const tokens = new AmazonTokenCache(
    store,
    async () => ({ access_token: 'tok', expires_in: 3600 }),
    time.now
  );
  const limiter = new AmazonRateLimiter(
    store,
    options.quota ?? quota({ maxTps: 100, maxTpd: 1000 }),
    time.now
  );

  const client = new CreatorsApiClient(
    transport,
    tokens,
    limiter,
    async (ms) => {
      sleeps.push(ms);
      time.advance(ms);
    },
    { ...DEFAULT_BACKOFF, maxAttempts: options.maxAttempts ?? DEFAULT_BACKOFF.maxAttempts }
  );

  return { client, transport, sleeps, limiter, time };
}

const ok: CreatorsApiResponse = { status: 200, headers: {}, body: { items: [] } };
const throttled: CreatorsApiResponse = { status: 429, headers: { 'retry-after': '2' }, body: {} };
const throttledNoHeader: CreatorsApiResponse = { status: 429, headers: {}, body: {} };

describe('el cliente ante un 429', () => {
  it('reintenta y acaba pasando', async () => {
    const { client, transport, sleeps } = makeClient([throttled, throttled, ok]);
    const response = await client.request('/items', {});

    expect(response.status).toBe(200);
    expect(transport).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([2000, 2000]);
  });

  it('respeta Retry-After por encima del backoff', async () => {
    const { client, sleeps } = makeClient([
      { status: 429, headers: { 'retry-after': '7' }, body: {} },
      ok,
    ]);
    await client.request('/items', {});
    expect(sleeps).toEqual([7000]);
  });

  it('sin Retry-After usa el backoff exponencial', async () => {
    const { client, sleeps } = makeClient([throttledNoHeader, throttledNoHeader, ok]);
    await client.request('/items', {});

    expect(sleeps).toHaveLength(2);
    expect(sleeps[1]!).toBeGreaterThan(sleeps[0]! * 0.9);
  });

  it('se rinde tras agotar los intentos', async () => {
    const { client, transport } = makeClient([throttled], { maxAttempts: 3 });
    await expect(client.request('/items', {})).rejects.toThrow(AmazonApiError);
    expect(transport).toHaveBeenCalledTimes(3);
  });
});

describe('el cliente ante la cuota diaria agotada', () => {
  it('no reintenta: espera un día, no un backoff', async () => {
    const { client, limiter, transport } = makeClient([ok], {
      quota: quota({ maxTpd: 1, maxTps: 100 }),
    });

    await client.request('/items', {});
    expect((await limiter.check()).allowed).toBe(false);

    await expect(client.request('/items', {})).rejects.toThrow(/Cuota diaria agotada/);
    expect(transport, 'no debería haber intentado una segunda petición').toHaveBeenCalledTimes(1);
  });
});

describe('el cliente ante la API caída', () => {
  it('reintenta un fallo de red y acaba pasando', async () => {
    const { client, transport } = makeClient([new Error('ECONNREFUSED'), ok]);
    const response = await client.request('/items', {});
    expect(response.status).toBe(200);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('se rinde si nunca responde, sin colgarse', async () => {
    const { client } = makeClient([new Error('ETIMEDOUT')], { maxAttempts: 3 });
    await expect(client.request('/items', {})).rejects.toThrow(/inalcanzable/);
  });

  it('un 500 se reintenta; un 400 no', async () => {
    const server = makeClient([{ status: 503, headers: {}, body: {} }, ok]);
    expect((await server.client.request('/items', {})).status).toBe(200);

    const client400 = makeClient([{ status: 400, headers: {}, body: {} }]);
    await expect(client400.client.request('/items', {})).rejects.toThrow(/rechazado/);
    expect(client400.transport).toHaveBeenCalledTimes(1);
  });

  it('un 401 invalida el token y reintenta con uno nuevo', async () => {
    const { client, transport } = makeClient([{ status: 401, headers: {}, body: {} }, ok]);
    const response = await client.request('/items', {});
    expect(response.status).toBe(200);
    expect(transport).toHaveBeenCalledTimes(2);
  });
});

describe('¿alcanza la cuota para refrescar en 24 h?', () => {
  it('con margen de sobra, sí', () => {
    const result = refreshFeasibility(50, quota(), 0, new Date(NOW));
    expect(result.feasible).toBe(true);
    expect(result.capacity).toBe(8_640);
  });

  it('si hacen falta más transacciones de las que quedan, NO', () => {
    const result = refreshFeasibility(500, quota(), 8_500, new Date(NOW));
    expect(result.feasible).toBe(false);
    expect(result.capacity).toBe(140);
    expect(result.reason).toContain('la caché no se extiende');
  });

  it('el TPS también acota, y manda el más restrictivo', () => {
    const result = refreshFeasibility(100, quota({ maxTps: 0.001, maxTpd: 100_000 }), 0, new Date(NOW));
    // 0.001 TPS × 86 400 s = 86 transacciones al día.
    expect(result.capacity).toBe(86);
    expect(result.feasible).toBe(false);
  });

  it('una cuota provisional caducada bloquea aunque quepa', () => {
    const stale = quota({
      recordedAt: new Date(NOW - (QUOTA_RECHECK_AFTER_DAYS + 5) * 86_400_000).toISOString(),
      provisional: true,
    });
    const result = refreshFeasibility(1, stale, 0, new Date(NOW));
    expect(result.feasible).toBe(false);
    expect(result.reason).toContain('provisional');
  });

  it('una cuota confirmada no provisional no caduca así', () => {
    const confirmed = quota({
      recordedAt: new Date(NOW - 365 * 86_400_000).toISOString(),
      provisional: false,
    });
    expect(refreshFeasibility(1, confirmed, 0, new Date(NOW)).feasible).toBe(true);
  });

  it('nunca sugiere extender la caché como salida', () => {
    const result = refreshFeasibility(10_000, quota(), 0, new Date(NOW));
    expect(result.reason).not.toMatch(/extender|ampliar|prorrogar/i);
    expect(result.reason).toContain('Se muestran menos productos');
  });
});

describe('el emplazamiento se omite cuando no se puede refrescar', () => {
  /*
   * The render path is what these assert about, through the same function it
   * calls. Three separate reasons must all end in the same place: nothing
   * shown. A placement that renders for any of them is content we cannot
   * legally keep fresh.
   */
  it('omitido por cuota agotada', () => {
    const result = refreshFeasibility(1, quota(), 8_640, new Date(NOW));
    expect(result.feasible).toBe(false);
    expect(result.capacity).toBe(0);
  });

  it('omitido porque el conjunto no cabe, aunque cada elemento parezca asumible', () => {
    // Twenty items that each look affordable are not affordable together.
    const q = quota({ maxTpd: 10, maxTps: 100 });
    expect(refreshFeasibility(1, q, 0, new Date(NOW)).feasible).toBe(true);
    expect(refreshFeasibility(20, q, 0, new Date(NOW)).feasible).toBe(false);
  });

  it('omitido porque la cuota provisional lleva demasiado sin comprobarse', () => {
    const stale = quota({
      recordedAt: new Date(NOW - 60 * 86_400_000).toISOString(),
      provisional: true,
    });
    expect(refreshFeasibility(1, stale, 0, new Date(NOW)).feasible).toBe(false);
  });

  it('el motivo nunca propone alargar la caché', () => {
    for (const [items, spent] of [
      [10_000, 0],
      [1, 8_640],
      [500, 8_500],
    ]) {
      const reason = refreshFeasibility(items!, quota(), spent!, new Date(NOW)).reason ?? '';
      expect(reason, `motivo: ${reason}`).not.toMatch(/extend|alarg|prorrog|ampli/i);
    }
  });

  it('con cuota suficiente y reciente, sí se muestra', () => {
    expect(refreshFeasibility(3, quota(), 0, new Date(NOW)).feasible).toBe(true);
  });
});
