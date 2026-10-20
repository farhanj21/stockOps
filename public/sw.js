// StockOps service worker: makes the installed app open and work offline.
// All app data lives in localStorage, so caching the pages and build assets is enough.

const CACHE = 'stockops-v1';
const PRECACHE = ['/', '/signin', '/stock', '/plan', '/orders', '/setup', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request, isPage) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: isPage });
    return cached || (isPage && (await cache.match('/'))) || Response.error();
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) (await caches.open(CACHE)).put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const fresh = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached || fresh;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') return event.respondWith(networkFirst(request, true));
  // Client-side navigation payloads must match the deployed build, so prefer the network.
  if (request.headers.get('RSC') || url.searchParams.has('_rsc')) return event.respondWith(networkFirst(request, false));
  // Hashed build output never changes under the same URL.
  if (url.pathname.startsWith('/_next/static/')) return event.respondWith(cacheFirst(request));
  return event.respondWith(staleWhileRevalidate(request));
});
