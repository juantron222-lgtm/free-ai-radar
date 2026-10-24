import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { claveDeUso, clasificarSalida, MEDICION_CORREGIDA, normalizarBusqueda, paresDeFiltro } from '@lib/uso';
import { getAllTools } from '@lib/data/catalog';
import type * as DatosDeUso from '@lib/data/uso';

/**
 * Los contadores de uso: qué se cuenta, de quién y con qué forma.
 *
 * La web no sabía si servía. Esto mide lo justo para saberlo —salidas a la
 * web oficial, búsquedas, filtros, comparaciones— sin guardar nada que
 * identifique a nadie, y sin contar lo que el aviso de cookies promete pedir
 * a quien no lo ha dado.
 */

const contar = vi.fn(async () => true);
vi.mock('@lib/data/uso', async (original) => ({
  ...(await original<typeof DatosDeUso>()),
  contarUso: (...args: unknown[]) => contar(...(args as [])),
}));

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const leer = (ruta: string) => readFileSync(join(ROOT, ruta), 'utf8');
const slugs = new Set(getAllTools().map((t) => t.slug));
const [a, b] = [...slugs];

afterEach(() => {
  contar.mockClear();
});

describe('qué forma tiene cada cosa que se guarda', () => {
  it('una búsqueda se guarda en minúsculas, sin espacios de sobra y como mucho con 60 caracteres', () => {
    expect(normalizarBusqueda('  Quitar   FONDO  ')).toBe('quitar fondo');
    expect(normalizarBusqueda('x'.repeat(80))).toHaveLength(60);
    expect(normalizarBusqueda('a')).toBeNull();
  });

  it('lo que parece un dato personal no se guarda', () => {
    expect(normalizarBusqueda('ana@example.com')).toBeNull();
    expect(normalizarBusqueda('mi teléfono 600123456')).toBeNull();
    expect(normalizarBusqueda('https://ejemplo.com/algo')).toBeNull();
    expect(normalizarBusqueda('www.ejemplo.com')).toBeNull();
  });

  it('un número largo escrito a trozos tampoco se guarda, y un nombre de modelo sí', () => {
    // Hasta el 21 de octubre de 2026 sólo se descartaban cinco cifras seguidas.
    expect(normalizarBusqueda('612 345 678')).toBeNull();
    expect(normalizarBusqueda('+34 612 34 56 78')).toBeNull();
    expect(normalizarBusqueda('ES91 2100 0418 4502 0005 1332')).toBeNull();
    expect(normalizarBusqueda('4111 1111 1111 1111')).toBeNull();
    expect(normalizarBusqueda('llama 3.1 405b')).toBe('llama 3.1 405b');
    expect(normalizarBusqueda('qwen3 235b a22b')).toBe('qwen3 235b a22b');
    expect(normalizarBusqueda('mejores ia 2025')).toBe('mejores ia 2025');
  });

  it('una salida o una comparación sólo valen con herramientas del catálogo', () => {
    expect(claveDeUso('salida', a!, slugs)).toBe(a);
    expect(claveDeUso('salida', 'inventada-que-no-existe', slugs)).toBeNull();
    expect(claveDeUso('comparar', `${b}|${a}`, slugs)).toBe([a, b].sort().join('|'));
    expect(claveDeUso('comparar', `${a}|${a}`, slugs), 'una sola herramienta no es una comparación').toBeNull();
    expect(claveDeUso('comparar', `${a}|inventada`, slugs)).toBeNull();
  });

  it('un filtro sólo vale si es un parámetro del catálogo', () => {
    expect(claveDeUso('filtro', 'nocard=1', slugs)).toBe('nocard=1');
    expect(claveDeUso('filtro', 'q=algo', slugs)).toBeNull();
    expect(claveDeUso('filtro', 'cat=<script>', slugs)).toBeNull();
    expect(paresDeFiltro('q=hola&cat=imagen,video&nocard=1')).toEqual(['cat=imagen', 'cat=video', 'nocard=1']);
  });
});

describe('/api/uso: sólo con permiso, y nunca salidas', () => {
  async function post(cuerpo: unknown, analytics: boolean) {
    const { POST } = await import('../../src/pages/api/uso');
    const context = {
      locals: { consent: { necessary: true, analytics, personalization: false, advertising: false } },
      request: new Request('https://example.test/api/uso', {
        method: 'POST',
        body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
        headers: { 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 250)}` },
      }),
    };
    return POST(context as unknown as Parameters<typeof POST>[0]);
  }

  it('sin «Analítica» no cuenta nada, aunque el navegador lo mande', async () => {
    const r = await post({ evento: 'busqueda', clave: 'quitar fondo' }, false);
    expect(r.status).toBe(204);
    expect(contar).not.toHaveBeenCalled();
  });

  it('con permiso, cuenta la búsqueda normalizada', async () => {
    await post({ evento: 'busqueda_vacia', clave: '  Hacer   VÍDEOS ' }, true);
    expect(contar).toHaveBeenCalledWith('busqueda_vacia', 'hacer vídeos');
  });

  it('las salidas no entran por aquí: van por /ir/', async () => {
    await post({ evento: 'salida', clave: a }, true);
    expect(contar).not.toHaveBeenCalled();
  });

  it('lo que no se entiende no se cuenta, y la respuesta no dice por qué', async () => {
    for (const malo of ['no es json', { evento: 'otra-cosa', clave: 'x' }, { evento: 'busqueda', clave: 'ana@example.com' }]) {
      const r = await post(malo, true);
      expect(r.status).toBe(204);
    }
    expect(contar).not.toHaveBeenCalled();
  });
});

describe('/ir/<slug>: cuenta y lleva al mismo sitio de siempre', () => {
  /** Lo que manda Chrome al abrir un enlace con el ratón. */
  const CLIC: Record<string, string> = {
    'sec-fetch-mode': 'navigate',
    'sec-fetch-dest': 'document',
    'sec-fetch-user': '?1',
    'sec-fetch-site': 'same-origin',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
  };

  async function ir(slug: string, consulta = '', cabeceras: Record<string, string> = CLIC) {
    const { GET } = await import('../../src/pages/ir/[slug]');
    const url = new URL(`https://example.test/ir/${slug}${consulta}`);
    const context = { params: { slug }, url, request: new Request(url, { headers: cabeceras }) };
    return GET(context as unknown as Parameters<typeof GET>[0]);
  }

  it('redirige a la web oficial y suma una salida', async () => {
    const tool = getAllTools()[0]!;
    const r = await ir(tool.slug);
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe(tool.outboundUrl);
    expect(r.headers.get('x-robots-tag')).toMatch(/noindex/);
    expect(contar).toHaveBeenCalledWith('salida', tool.slug);
  });

  it('con ?a=precios va a la página de precios', async () => {
    const tool = getAllTools().find((t) => t.pricingUrl)!;
    const r = await ir(tool.slug, '?a=precios');
    expect(r.headers.get('location')).toBe(tool.pricingUrl);
    expect(contar).toHaveBeenCalledWith('precios', tool.slug);
  });

  it('ni una precarga ni un robot cuentan, pero los dos van al mismo sitio', async () => {
    /*
     * El 24 de octubre de 2026 se vio que pasar el ratón por «Ir a…» pedía
     * /ir/<slug> (precarga de Astro) y sumaba una salida sin clic.
     */
    const tool = getAllTools()[0]!;
    const casos: Record<string, Record<string, string>> = {
      'precarga de Chrome': { ...CLIC, 'sec-purpose': 'prefetch', 'sec-fetch-mode': 'no-cors', 'sec-fetch-dest': 'empty' },
      'precarga sin Sec-Fetch': { purpose: 'prefetch', 'user-agent': CLIC['user-agent']! },
      'curl': { 'user-agent': 'curl/8.9.1' },
      'robot que navega': { ...CLIC, 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' },
      'navegador automatizado sin gesto': { ...CLIC, 'sec-fetch-user': '' },
      'Chrome sin interfaz': { ...CLIC, 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/139.0.0.0 Safari/537.36' },
      'sin agente': { ...CLIC, 'user-agent': '' },
    };
    for (const [caso, cabeceras] of Object.entries(casos)) {
      const r = await ir(tool.slug, '', cabeceras);
      expect(r.status, caso).toBe(302);
      expect(r.headers.get('location'), caso).toBe(tool.outboundUrl);
    }
    expect(contar).not.toHaveBeenCalled();
  });

  it('una herramienta que no existe es un 404, no una redirección abierta', async () => {
    expect((await ir('no-existe-de-verdad')).status).toBe(404);
  });

  it('si contar tarda, la redirección no espera más de un momento', async () => {
    contar.mockImplementationOnce(() => new Promise(() => undefined));
    const inicio = Date.now();
    const r = await ir(getAllTools()[1]!.slug);
    expect(r.status).toBe(302);
    expect(Date.now() - inicio).toBeLessThan(1500);
  });
});

describe('qué parece cada visita a /ir/', () => {
  const CLIC = {
    'sec-fetch-mode': 'navigate',
    'sec-fetch-dest': 'document',
    'sec-fetch-user': '?1',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
  };
  const clase = (h: Record<string, string>) => clasificarSalida(new Headers(h));

  it('distingue clic, precarga, automática y sin gesto', () => {
    expect(clase(CLIC)).toBe('clic');
    expect(clase({ ...CLIC, 'sec-purpose': 'prefetch' })).toBe('precarga');
    expect(clase({ ...CLIC, purpose: 'prefetch' })).toBe('precarga');
    expect(clase({ ...CLIC, 'sec-purpose': 'prefetch;prerender' })).toBe('precarga');
    expect(clase({ 'user-agent': 'curl/8.9.1' })).toBe('automatica');
    expect(clase({ ...CLIC, 'user-agent': '' })).toBe('automatica');
    expect(clase({ ...CLIC, 'user-agent': 'Mozilla/5.0 (compatible; bingbot/2.0)' })).toBe('automatica');
    expect(clase({ ...CLIC, 'sec-fetch-user': '' })).toBe('sin-gesto');
    expect(clase({ ...CLIC, 'sec-fetch-mode': 'no-cors', 'sec-fetch-dest': 'empty' })).toBe('sin-gesto');
  });

  it('un clic desde Safari o un iPhone cuenta aunque WebKit no mande Sec-Fetch-User', () => {
    /*
     * Comprobado el 24 de octubre de 2026 con clics reales en un enlace
     * target="_blank": Chromium y Firefox mandan `Sec-Fetch-User: ?1`; WebKit
     * manda `navigate` y `document`, pero no esa cabecera.
     */
    const NAV = { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' };
    const safari = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
    const chromeIos = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/139.0.0.0 Mobile/15E148 Safari/604.1';
    const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';
    const firefox = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:153.0) Gecko/20100101 Firefox/153.0';
    expect(clase({ ...NAV, 'user-agent': safari })).toBe('clic');
    expect(clase({ ...NAV, 'user-agent': iphone })).toBe('clic');
    expect(clase({ ...NAV, 'user-agent': chromeIos })).toBe('clic');
    // A Chromium y Firefox sí se les exige: sin gesto, no cuenta.
    expect(clase({ ...NAV, 'user-agent': chrome })).toBe('sin-gesto');
    expect(clase({ ...NAV, 'user-agent': firefox })).toBe('sin-gesto');
    expect(clase({ ...NAV, 'user-agent': chrome, 'sec-fetch-user': '?1' })).toBe('clic');
    expect(clase({ ...NAV, 'user-agent': firefox, 'sec-fetch-user': '?1' })).toBe('clic');
    // Y a Safari tampoco le vale una precarga.
    expect(clase({ ...NAV, 'user-agent': safari, purpose: 'prefetch' })).toBe('precarga');
  });

  it('la medición corregida tiene fecha, y lo anterior se marca como no fiable sin borrarlo', () => {
    expect(MEDICION_CORREGIDA.primerDiaFiable).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    if (MEDICION_CORREGIDA.publicada) {
      expect(MEDICION_CORREGIDA.publicada).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(MEDICION_CORREGIDA.publicada < `${MEDICION_CORREGIDA.primerDiaFiable}T00:00`).toBe(true);
    }
    const admin = leer('src/pages/admin/uso.astro');
    expect(admin).toContain('MEDICION_CORREGIDA');
    expect(admin).toContain('no fiable');
    expect(admin).toContain('se conserva');
  });

  it('no promete que haya una persona detrás', () => {
    const admin = leer('src/pages/admin/uso.astro');
    expect(admin).toContain('no garantiza que haya una persona');
    expect(admin).not.toMatch(/sólo clics de (una )?persona/i);
  });
});

describe('dónde se engancha y qué no se abre', () => {
  it('ningún enlace de salida se precarga, esté en la página que esté', () => {
    // Con prefetchAll, pasar el ratón por encima pedía /ir/ y contaba una salida.
    const astro = readdirSync(join(ROOT, 'src'), { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.astro'));
    const enlaces = astro.flatMap((f) =>
      [...leer(join('src', f)).matchAll(/<a\b[^>]*ROUTES\.salida[^>]*>/g)].map((m) => ({ f, a: m[0] }))
    );
    expect(enlaces.filter(({ f }) => f.endsWith('OutboundButton.astro')).length).toBe(2);
    expect(enlaces.filter(({ a }) => !a.includes('data-astro-prefetch="false"')).map(({ f }) => f)).toEqual([]);
  });

  it('el botón de salida y el de precios pasan por /ir/', () => {
    const boton = leer('src/components/tools/OutboundButton.astro');
    expect(boton).toContain('href={ROUTES.salida(tool.slug)}');
    expect(boton).toContain('href={ROUTES.salida(tool.slug, true)}');
    expect(boton).not.toContain('href={tool.outboundUrl}');
  });

  it('los buscadores no rastrean /ir/', () => {
    expect(leer('src/pages/robots.txt.ts')).toContain('Disallow: /ir/');
  });

  it('la tabla no tiene ninguna puerta para el navegador y se poda sola', () => {
    const sql = leer('supabase/migrations/0017_uso_diario.sql');
    expect(sql).toMatch(/alter table public\.uso_diario enable row level security;/);
    expect(sql).toMatch(/revoke all on public\.uso_diario from anon, authenticated;/);
    expect(sql).toMatch(/revoke all on function public\.contar_uso\(text, text\) from public, anon, authenticated;/);
    expect(sql).toMatch(/interval '14 months'/);
    expect(sql).not.toMatch(/create policy/i);
  });

  it('sólo se escribe en la producción de verdad, no en un Preview', () => {
    const datos = leer('src/lib/data/uso.ts');
    expect(datos).toContain('if (!isRealProduction() || !supabaseConfig.canUseServiceRole) return null;');
  });

  it('la página de uso es sólo para administradores', () => {
    expect(leer('src/pages/admin/uso.astro')).toMatch(/if \(Astro\.locals\.user\?\.role !== 'admin'\) \{\s*return new Response\('No encontrado', \{ status: 404 \}\);/);
  });

  it('la privacidad dice qué cuenta cada contador y con qué base', () => {
    const privacidad = leer('src/pages/legal/privacidad.astro');
    expect(privacidad).toContain('Clics hacia la web oficial de cada herramienta');
    expect(privacidad).toContain('Consentimiento («Analítica» en el aviso de cookies)');
  });
});

describe('en el navegador, nada sin permiso', () => {
  const original = { document: globalThis.document, navigator: globalThis.navigator };
  afterEach(() => {
    for (const [k, v] of Object.entries(original)) {
      Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
    }
  });

  async function preparar(cookie: string) {
    const beacon = vi.fn(() => true);
    Object.defineProperty(globalThis, 'document', { value: { cookie }, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'navigator', { value: { sendBeacon: beacon }, configurable: true, writable: true });
    vi.resetModules();
    const uso = await import('@lib/client/uso');
    return { beacon, uso };
  }

  const registro = (analytics: boolean) =>
    `far_consent=${encodeURIComponent(
      JSON.stringify({ version: 2, decidedAt: '2026-10-05T00:00:00Z', state: { necessary: true, analytics, personalization: false, advertising: false } })
    )}`;

  it('sin decisión o con «Analítica» rechazada no envía nada', async () => {
    for (const cookie of ['', registro(false)]) {
      const { beacon, uso } = await preparar(cookie);
      uso.medir('busqueda', 'algo');
      expect(beacon).not.toHaveBeenCalled();
    }
  });

  it('con permiso envía, y una sola vez por página vista', async () => {
    const { beacon, uso } = await preparar(registro(true));
    uso.medir('filtro', 'nocard=1');
    uso.medir('filtro', 'nocard=1');
    expect(beacon).toHaveBeenCalledTimes(1);
  });
});
