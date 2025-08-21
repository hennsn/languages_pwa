// ===================================
// Audio PWA Service Worker
// Production-Grade Offline Support
// ===================================

// Cache version
const CACHE_NAME = 'audio-pwa-v1';

// --- Get generic root path logic ---

// Get the full path to the service worker file.
// e.g., on GitHub Pages it might be '/my-repo/sw.js'
// on localhost it will be '/sw.js'
const swPath = self.location.pathname;

// Derive the base path by removing the filename.
// e.g., '/my-repo/sw.js' becomes '/my-repo/'
// e.g., '/sw.js' becomes '/'
const basePath = swPath.substring(0, swPath.lastIndexOf('/') + 1);

//console.log('[SW] Base path:', basePath);

// App shell files (core UI)
const APP_SHELL = [
  `${basePath}`,
  `${basePath}index.html`,
  `${basePath}style.css`,
  `${basePath}app.js`,
  `${basePath}db.js`,
  `${basePath}libs/marked.js`,
  `${basePath}dashboard.html`,
  `${basePath}dashboard.css`,
  `${basePath}dashboard.js`,
  `${basePath}manifest.json`,
  `${basePath}images/icon-192x192.png`,
  `${basePath}images/icon-512x512.png`,
  `${basePath}data/languages.json`
];

//console.log('[SW] App shell files:', APP_SHELL);

// Fallbacks
const FALLBACK_HTML = `${basePath}offline.html`;
const FALLBACK_IMAGE = `${basePath}images/fallback.png`;
const FALLBACK_AUDIO = `${basePath}data/offline.mp3`;

// -------------------------------
// Install Event - fetch on demand
// -------------------------------
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Caching app shell and fallbacks');
      // Add the fallbacks to the list of assets to cache on install
      return cache.addAll([...APP_SHELL, FALLBACK_HTML, FALLBACK_IMAGE, FALLBACK_AUDIO]);
    })
  );
  self.skipWaiting();
});

// -------------------------------
// Activate Event - Clean old caches
// -------------------------------
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// -------------------------------
// Fetch Event - Smart Strategies
// -------------------------------
self.addEventListener('fetch', event => {

  // --- Add a guard clause to ignore non-HTTP/HTTPS requests ---
  const requestUrl = new URL(event.request.url);
  if (requestUrl.protocol !== 'http:' && requestUrl.protocol !== 'https:') {
    // If the request is for a chrome-extension, blob, etc., do not handle it.
    // Let the browser handle it as it normally would.
    return; 
  }

  // 1. Cache-first for audio and transcripts
  if (requestUrl.pathname.endsWith('.mp3') || requestUrl.pathname.endsWith('.json')) {
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then(networkResponse => {
          const isPartial = event.request.headers.has('range');
          if (!isPartial && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        }).catch(() => {
          if (requestUrl.pathname.endsWith('.mp3')) {
            return caches.match(FALLBACK_AUDIO);
          }
        });
      })
    );
    return;
  }

  // 2. Stale-while-revalidate for app shell and static assets
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchPromise = fetch(event.request).then(networkResponse => {
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      }).catch(() => {
        if (event.request.destination === 'document') {
          return caches.match(FALLBACK_HTML);
        }
        if (event.request.destination === 'image') {
          return caches.match(FALLBACK_IMAGE);
        }
      });
      return cachedResponse || fetchPromise;
    })
  );
});