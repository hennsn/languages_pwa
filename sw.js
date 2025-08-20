// ===================================
// Audio PWA Service Worker
// Production-Grade Offline Support
// ===================================

// Cache version
const CACHE_NAME = 'audio-pwa-v1';

// App shell files (core UI)
const APP_SHELL = [
  '/',
  'index.html',
  'style.css',
  'app.js',
  'dashboard.html',
  'dashboard.js',
  'dashboard.css',
  'manifest.json',
  'images/icon-192x192.png',
  'images/icon-512x512.png',
  'images/album-art.png',
  'data/lessons.json'
];

// Fallbacks
const FALLBACK_HTML = 'offline.html'; // Make sure you have this file
const FALLBACK_IMAGE = 'images/fallback.png'; // Make sure you have this file
const FALLBACK_AUDIO = 'data/offline.mp3';   // Make sure you have this file


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
  const requestUrl = new URL(event.request.url);

  // 1. Cache-first for audio and transcripts
  if (requestUrl.pathname.endsWith('.mp3') || requestUrl.pathname.endsWith('.json')) {
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        return cachedResponse || fetch(event.request).then(networkResponse => {
          return caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
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
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, networkResponse.clone());
        });
        return networkResponse;
      }).catch(() => {
        // Offline fallbacks
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
