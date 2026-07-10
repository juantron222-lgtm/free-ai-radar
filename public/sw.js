const CACHE_NAME = 'free-ai-radar-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/tools',
  '/creators',
  '/about',
  '/methodology',
  '/privacy',
];

// Helper para buscar en cache normalizando la barra final
async function matchCacheFlexible(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) return cachedResponse;

  const url = new URL(request.url);
  if (url.origin === self.location.origin && !url.pathname.match(/\.[a-z0-9]+$/i)) {
    const alternativePath = url.pathname.endsWith('/') 
      ? url.pathname.slice(0, -1) 
      : url.pathname + '/';
    return caches.match(alternativePath);
  }
  return null;
}

// Install: cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for pages, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET
  if (request.method !== 'GET') return;

  // For HTML pages: network-first (priorizar frescura de novedades)
  if (request.headers.get('Accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
          return response;
        })
        .catch(() => matchCacheFlexible(request))
    );
    return;
  }

  // For static assets (JS, CSS, images, fonts): cache-first
  if (
    url.pathname.match(/\.(js|css|png|jpg|svg|woff2?|ico)$/) ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  ) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
    return;
  }

  // Everything else: network-first
  event.respondWith(
    fetch(request).catch(() => matchCacheFlexible(request))
  );
});
