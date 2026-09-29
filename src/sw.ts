/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare let self: ServiceWorkerGlobalScope;

// The app shell (built HTML, JS, CSS, icons), versioned per build.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Every in-app URL is the same single-page app: open it from the cache at
// once, online or not. The data comes from IndexedDB, not the network.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }));

// Images are content-addressed and never change. The page writes new ones
// into this same cache before they are uploaded.
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/api/blob/'),
  new CacheFirst({ cacheName: 'diary-blobs' }),
);

// Optional web fonts, fetched only when chosen in 设置.
registerRoute(
  ({ request }) => request.destination === 'font',
  new CacheFirst({ cacheName: 'diary-fonts', plugins: [new ExpirationPlugin({ maxEntries: 600 })] }),
);

self.addEventListener('message', (event) => {
  // 'skip-waiting' is what the pre-rebuild page sends; SKIP_WAITING is workbox-window's.
  const data: unknown = event.data;
  if (data === 'skip-waiting' || (typeof data === 'object' && data !== null && (data as { type?: string }).type === 'SKIP_WAITING')) {
    void self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  // Drop the caches of the pre-rebuild service worker (diary-v16-shell, ...).
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => /^diary-v\d+-/.test(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});
