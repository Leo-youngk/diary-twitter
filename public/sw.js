// Bump this on every deploy that changes cached assets — the activate handler
// deletes every cache that doesn't match, which is what prevents stale bundles.
const VERSION = 'diary-v16';
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const NAVIGATION_TIMEOUT_MS = 1200;
const BACKGROUND_FETCH_TIMEOUT_MS = 10000;

const PRECACHE = ['/', '/manifest.json', '/icon-192.png', '/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Sync is the one thing that must never be served stale.
  if (url.pathname.startsWith('/api/')) return;
  // Caching dev hot-update payloads breaks Fast Refresh.
  if (url.pathname.includes('hot-update') || url.pathname.includes('webpack-hmr')) return;

  if (request.mode === 'navigate') {
    // Prefer a fresh page, but a stalled connection must not hold a previously
    // installed PWA on a blank screen. Keep the fetch alive briefly so the
    // cached page can still be refreshed for the next launch.
    event.respondWith((async () => {
      const cached = await caches.match(request) || await caches.match('/');
      const controller = cached ? new AbortController() : null;
      const abortTimer = controller
        ? setTimeout(() => controller.abort(), BACKGROUND_FETCH_TIMEOUT_MS)
        : null;
      const network = fetch(request, controller ? { signal: controller.signal } : undefined)
        .then((res) => {
          if (res.ok) {
            event.waitUntil(caches.open(SHELL).then((cache) => cache.put(request, res.clone())));
            return res;
          }
          return cached || res;
        })
        .catch(() => cached || Response.error())
        .finally(() => { if (abortTimer !== null) clearTimeout(abortTimer); });

      if (!cached) return network;
      event.waitUntil(network.then(() => undefined));
      let timeout;
      const fallback = new Promise((resolve) => {
        timeout = setTimeout(() => resolve(cached), NAVIGATION_TIMEOUT_MS);
      });
      const response = await Promise.race([network, fallback]);
      clearTimeout(timeout);
      return response;
    })());
    return;
  }

  // Static assets are content-hashed, so serving from cache is safe; the
  // background refresh only matters for the handful that aren't.
  event.respondWith(
    caches.match(request).then((hit) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            event.waitUntil(caches.open(ASSETS).then((c) => c.put(request, copy)));
          }
          return res;
        })
        .catch(() => hit);
      return hit || network;
    })
  );
});
