import { test, expect, type Page, type Request } from '@playwright/test';
import { seedConsent } from './helpers';

/**
 * The crawler.
 *
 * Every other spec asserts that a particular thing works. This one asserts
 * that nothing is *broken anywhere* — it walks the public site from the home
 * page, follows every internal link it finds, and fails on the classes of
 * defect that only appear once a site has more than a handful of pages:
 * dead links, pages that render empty, duplicate titles, canonical tags that
 * point at the wrong URL, buttons with no destination, images that 404, and
 * console errors on pages nobody thought to open.
 *
 * It is deliberately one test per concern rather than one giant test: when the
 * suite goes red, the failure name should say what kind of thing broke.
 */

/** Routes the crawler must never follow. */
const EXCLUDED = [
  '/admin', // noindex, requires a session, and mutating
  '/cuenta', // per-user state
  '/api/', // not HTML
  '/sin-conexion', // only meaningful from the service worker
];

/** Query strings are filter permutations of a page already visited. */
function normalise(href: string, origin: string): string | null {
  let url: URL;
  try {
    url = new URL(href, origin);
  } catch {
    return null;
  }

  if (url.origin !== origin) return null;
  if (!/^https?:$/.test(url.protocol)) return null;

  const path = url.pathname.replace(/\/$/, '') || '/';
  if (EXCLUDED.some((prefix) => path === prefix || path.startsWith(prefix))) return null;

  // A path with a file extension is an asset, not a page.
  if (/\.[a-z0-9]{2,4}$/i.test(path) && !path.endsWith('.html')) return null;

  return path;
}

interface CrawlResult {
  visited: Map<string, { status: number; title: string; canonical: string | null }>;
  brokenLinks: string[];
  consoleErrors: string[];
  failedRequests: string[];
  emptyPages: string[];
  linklessControls: string[];
  brokenImages: string[];
}

/**
 * The page count at which we stop and call it a runaway.
 *
 * Set well clear of the real inventory on purpose. A limit close to the actual
 * number is worse than no limit: the crawl stops early, the pages it never
 * reached are silently unchecked, and the suite still reports green. Growing
 * the catalogue must never quietly shrink the coverage of this test.
 */
const RUNAWAY_LIMIT = 250;

/**
 * Walks the site breadth-first from `/`.
 *
 * Hitting `limit` is itself the failure signal: the site is finite, so the only
 * way to reach it is something generating URLs — a filter permutation leaking
 * into links, or a redirect loop.
 */
async function crawl(page: Page, origin: string, limit = RUNAWAY_LIMIT): Promise<CrawlResult> {
  const result: CrawlResult = {
    visited: new Map(),
    brokenLinks: [],
    consoleErrors: [],
    failedRequests: [],
    emptyPages: [],
    linklessControls: [],
    brokenImages: [],
  };

  let currentPath = '/';

  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    // The dev server's HMR client and favicon probing are not site defects.
    if (/favicon|\[vite\]|HMR|WebSocket/i.test(text)) return;
    result.consoleErrors.push(`${currentPath} → ${text}`);
  });

  page.on('requestfailed', (request: Request) => {
    const failure = request.failure()?.errorText ?? '';
    if (/ERR_ABORTED|net::ERR_INTERNET_DISCONNECTED/.test(failure)) return;
    // Only same-origin failures are ours to fix.
    if (!request.url().startsWith(origin)) return;
    result.failedRequests.push(`${currentPath} → ${request.url()} (${failure})`);
  });

  page.on('response', (response) => {
    if (!response.url().startsWith(origin)) return;
    if (response.status() < 400) return;
    const type = response.request().resourceType();
    if (type === 'image' || type === 'stylesheet' || type === 'script' || type === 'font') {
      result.brokenImages.push(`${currentPath} → ${type} ${response.url()} (${response.status()})`);
    }
  });

  const queue: string[] = ['/'];
  const seen = new Set<string>(['/']);

  while (queue.length > 0 && result.visited.size < limit) {
    const path = queue.shift()!;
    currentPath = path;

    const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
    const status = response?.status() ?? 0;

    if (status >= 400) {
      result.brokenLinks.push(`${path} devuelve ${status}`);
      continue;
    }

    const title = (await page.title()).trim();
    const canonical = await page
      .locator('link[rel="canonical"]')
      .first()
      .getAttribute('href')
      .catch(() => null);

    result.visited.set(path, { status, title, canonical });

    // A page that renders a shell and no content is a silent failure: it
    // returns 200, so nothing else in the suite would notice.
    const mainText = await page.locator('main').innerText().catch(() => '');
    if (mainText.replace(/\s+/g, ' ').trim().length < 120) {
      result.emptyPages.push(`${path} (${mainText.trim().length} caracteres en <main>)`);
    }

    // Controls that look clickable but go nowhere.
    const dead = await page.evaluate(() => {
      const offenders: string[] = [];

      /*
       * Hidden controls are excluded on purpose: `[hidden]` and
       * `display:none` remove an element from the accessibility tree, so a
       * nameless one is not yet a defect. What matters is that it has a name
       * by the time it is shown — which is why the empty-state button carries
       * a fallback label in the markup rather than waiting for script.
       */
      const isVisible = (el: Element) => {
        if (el.closest('[hidden]')) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
      };

      for (const anchor of document.querySelectorAll('a')) {
        if (!isVisible(anchor)) continue;
        const href = anchor.getAttribute('href');
        if (href === null || href.trim() === '' || href.trim() === '#') {
          const label = (anchor.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
          offenders.push(`<a> sin destino: "${label || '(sin texto)'}"`);
        }
      }

      for (const button of document.querySelectorAll('button')) {
        if (!isVisible(button)) continue;
        const label = (button.textContent ?? '').replace(/\s+/g, ' ').trim();
        const accessible = label || button.getAttribute('aria-label') || button.title;
        if (!accessible) offenders.push('<button> sin nombre accesible');
      }

      return offenders;
    });
    for (const offender of dead) result.linklessControls.push(`${path} → ${offender}`);

    const hrefs = await page.locator('a[href]').evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLAnchorElement).getAttribute('href') ?? '')
    );

    for (const href of hrefs) {
      const next = normalise(href, origin);
      if (!next || seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }

  return result;
}

test.describe('rastreo del sitio', () => {
  // One crawl, many assertions: walking the site five times would be wasteful.
  test.describe.configure({ mode: 'serial' });

  let result: CrawlResult;
  let origin: string;

  test.beforeAll(async ({ browser, baseURL }) => {
    origin = new URL(baseURL ?? 'http://localhost:4321').origin;
    const context = await browser.newContext();
    const page = await context.newPage();
    await seedConsent(page);
    result = await crawl(page, origin);
    await context.close();
  });

  test('alcanza todas las secciones principales', () => {
    const paths = [...result.visited.keys()];
    for (const expected of [
      '/',
      '/herramientas',
      '/categorias',
      '/colecciones',
      '/comparar',
      '/noticias',
      '/modelos',
      '/agentes',
      '/metodologia',
      '/politica-editorial',
      '/transparencia/cambios-del-radar',
      '/pro',
      '/contacto',
      '/enviar-herramienta',
    ]) {
      expect(paths, `no se llega a ${expected} navegando desde la portada`).toContain(expected);
    }
  });

  test('ninguna página enlazada devuelve 404 o 500', () => {
    expect(result.brokenLinks).toEqual([]);
  });

  test('ninguna página se queda vacía', () => {
    expect(result.emptyPages).toEqual([]);
  });

  test('no hay errores de consola en ninguna página', () => {
    expect(result.consoleErrors).toEqual([]);
  });

  test('no hay peticiones propias fallidas', () => {
    expect(result.failedRequests).toEqual([]);
  });

  test('no hay imágenes ni recursos rotos', () => {
    expect(result.brokenImages).toEqual([]);
  });

  test('ningún enlace o botón se queda sin destino ni nombre', () => {
    expect(result.linklessControls).toEqual([]);
  });

  test('cada página tiene un título propio', () => {
    const byTitle = new Map<string, string[]>();
    for (const [path, meta] of result.visited) {
      expect(meta.title, `${path} no tiene título`).not.toBe('');
      byTitle.set(meta.title, [...(byTitle.get(meta.title) ?? []), path]);
    }

    const duplicates = [...byTitle.entries()]
      .filter(([, paths]) => paths.length > 1)
      .map(([title, paths]) => `"${title}" en ${paths.join(', ')}`);

    expect(duplicates).toEqual([]);
  });

  test('cada canónico apunta a su propia URL en el dominio real', () => {
    const wrong: string[] = [];

    for (const [path, meta] of result.visited) {
      if (!meta.canonical) {
        wrong.push(`${path} no declara canónico`);
        continue;
      }
      // The canonical must always name the production host, never the
      // preview or localhost: a preview that indexes itself competes with the
      // real site for its own keywords.
      if (!meta.canonical.includes('freeairadar.com')) {
        wrong.push(`${path} apunta a ${meta.canonical}`);
        continue;
      }
      const canonicalPath = new URL(meta.canonical).pathname.replace(/\/$/, '') || '/';
      if (canonicalPath !== path) {
        wrong.push(`${path} declara ${canonicalPath}`);
      }
    }

    expect(wrong).toEqual([]);
  });

  test('el rastreo termina por sí solo, no por el tope', () => {
    // Finishing below the limit means the crawl ran out of links, which is
    // what a finite site does. Reaching it means something is generating URLs
    // — and, worse, that the pages beyond it quedaron sin comprobar.
    expect(result.visited.size).toBeGreaterThan(20);
    expect(
      result.visited.size,
      'el rastreo ha tocado el tope: hay páginas sin comprobar'
    ).toBeLessThan(RUNAWAY_LIMIT);
  });
});

test.describe('rutas que deben fallar bien', () => {
  test('una URL inexistente devuelve 404 con página útil', async ({ page }) => {
    await seedConsent(page);
    const response = await page.goto('/esta-ruta-no-existe-jamas');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Scoped to <main>: on mobile the header's own link to the catalogue is
    // inside a collapsed menu, so matching page-wide would assert against a
    // link that is hidden by design and say nothing about the 404 page.
    await expect(page.locator('main a[href="/herramientas"]').first()).toBeVisible();
  });

  test('una ficha inexistente devuelve 404, no una página en blanco', async ({ page }) => {
    await seedConsent(page);
    const response = await page.goto('/herramientas/herramienta-inventada');
    expect(response?.status()).toBe(404);
  });

  test('la URL antigua /cambios lleva a las noticias', async ({ page }) => {
    await seedConsent(page);
    await page.goto('/cambios');
    expect(new URL(page.url()).pathname.replace(/\/$/, '')).toBe('/noticias');
  });

  test('el sitemap sólo lista URLs que existen', async ({ request }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.status()).toBe(200);

    const xml = await response.text();
    const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map((match) => new URL(match[1]!).pathname.replace(/\/$/, '') || '/');

    expect(new Set(paths).size, 'el sitemap repite URLs').toBe(paths.length);

    // Checking every entry would be slow; a sample catches a broken generator.
    const sample = paths.filter((_, index) => index % 4 === 0).slice(0, 15);
    for (const path of sample) {
      const page = await request.get(path);
      expect(page.status(), `${path} está en el sitemap pero devuelve ${page.status()}`).toBe(200);
    }
  });

  test('robots.txt no bloquea lo que el sitemap ofrece', async ({ request }) => {
    const robots = await request.get('/robots.txt');
    expect(robots.status()).toBe(200);

    const text = await robots.text();
    expect(text).toContain('Sitemap:');
    expect(text).toMatch(/Disallow:\s*\/admin/);
    expect(text).toMatch(/Disallow:\s*\/cuenta/);
    // The public sections must not be disallowed.
    expect(text).not.toMatch(/Disallow:\s*\/herramientas\s*$/m);
    expect(text).not.toMatch(/Disallow:\s*\/noticias\s*$/m);
  });

  test('el feed RSS es XML válido y no va vacío', async ({ request }) => {
    const response = await request.get('/rss.xml');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('xml');

    const xml = await response.text();
    expect(xml).toContain('<rss');
    expect((xml.match(/<item>/g) ?? []).length).toBeGreaterThan(0);
  });
});
