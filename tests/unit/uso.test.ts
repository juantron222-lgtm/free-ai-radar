import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { claveDeUso, normalizarBusqueda, paresDeFiltro } from '@lib/uso';
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
  async function ir(slug: string, consulta = '') {
    const { GET } = await import('../../src/pages/ir/[slug]');
    const context = { params: { slug }, url: new URL(`https://example.test/ir/${slug}${consulta}`) };
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

describe('dónde se engancha y qué no se abre', () => {
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
