/*
 * Free AI Radar — service worker.
 *
 * Caching rules, and why each one is what it is:
 *
 *   · **Never cache anything behind a session.** `/cuenta`, `/admin` and
 *     `/api/` are excluded outright. A shared device must not be able to serve
 *     one person's account page to the next.
 *   · **Never cache cross-origin.** Third-party responses are opaque, cannot be
 *     validated, and would let a stale or hostile response persist.
 *   · Documents: network-first with a cache fallback, so the catalogue stays
 *     fresh but the site still opens offline.
 *   · Build assets (hashed filenames): cache-first, immutable.
 *   · No skipWaiting() on install — the page decides when to switch versions.
 */

const VERSION = 'v3';
const SHELL_CACHE = `far-shell-${VERSION}`;
const PAGES_CACHE = `far-pages-${VERSION}`;
const ASSETS_CACHE = `far-assets-${VERSION}`;

const OFFLINE_URL = '/sin-conexion';

const SHELL = [OFFLINE_URL, '/', '/herramientas', '/favicon.svg', '/theme-init.js'];

const PRIVATE_PATHS = ['/cuenta', '/admin', '/api/'];
const MAX_PAGES = 60;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      // One failed URL must not abort the whole install.
      Promise.allSettled(SHELL.map((url) => cache.add(url)))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('far-') && !key.endsWith(VERSION))
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  // Only ever activates on an explicit request from the update bar.
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isPrivate(pathname) {
  return PRIVATE_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await Promise.all(keys.slice(0, keys.length - maxEntries).map((key) => cache.delete(key)));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Same-origin only. Cross-origin responses are left entirely alone.
  if (url.origin !== self.location.origin) return;

  if (isPrivate(url.pathname)) return;

  // Hashed build output: safe to keep forever.
  if (url.pathname.startsWith('/_astro/')) {
    event.respondWith(
      caches.open(ASSETS_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  // Static files we control.
  if (/\.(?:css|js|woff2?|png|jpg|jpeg|svg|webp|ico|webmanifest)$/.test(url.pathname)) {
    event.respondWith(
      caches.open(ASSETS_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        // Stale-while-revalidate: instant, and updated for the next visit.
        return cached || network;
      })
    );
    return;
  }

  // Documents.
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            const cache = await caches.open(PAGES_CACHE);
            cache.put(request, response.clone());
            trimCache(PAGES_CACHE, MAX_PAGES);
          }
          return response;
        } catch {
          const cached = await caches.match(request, { ignoreSearch: true });
          if (cached) return cached;
          const offline = await caches.match(OFFLINE_URL);
          return (
            offline ||
            new Response('Sin conexión', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            })
          );
        }
      })()
    );
  }
});
