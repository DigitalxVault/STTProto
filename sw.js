// RADStrat RT Trainer — Service Worker
// Cache-first strategy for app shell offline support.

const CACHE_NAME = 'rt-trainer-v1';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png'
];

// ─── Install: precache app shell ─────────────────────────────────────────────
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(PRECACHE_URLS);
    })
  );
  self.skipWaiting();
});

// ─── Activate: delete old caches ─────────────────────────────────────────────
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (key) { return key !== CACHE_NAME; })
          .map(function (key) { return caches.delete(key); })
      );
    })
  );
  self.clients.claim();
});

// ─── Fetch: cache-first for app shell, skip /api/* ───────────────────────────
self.addEventListener('fetch', function (event) {
  var req = event.request;

  // Only handle GET requests
  if (req.method !== 'GET') return;

  // Only handle same-origin requests
  if (!req.url.startsWith(self.location.origin)) return;

  // Skip /api/* routes — never cache dynamic API responses
  var pathname = new URL(req.url).pathname;
  if (pathname.startsWith('/api/')) return;

  event.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) {
        return cached;
      }
      return fetch(req).then(function (response) {
        // Cache valid responses for future use
        if (response && response.status === 200 && response.type === 'basic') {
          var toCache = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(req, toCache);
          });
        }
        return response;
      });
    })
  );
});
