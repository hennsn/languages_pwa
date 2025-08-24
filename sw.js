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

console.log('[SW] Base path:', basePath);

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
  //`${basePath}data/zhn/lessons.json`,
  //`${basePath}data/zhn/packs.json`,
  //`${basePath}data/zhn/lesson_001/morning_routine.json`,
  //`${basePath}data/zhn/lesson_001/morning_routine.mp3`,
  //`${basePath}data/zhn/lesson_002/making_breakfast.json`,
  //`${basePath}data/zhn/lesson_002/making_breakfast.mp3`
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
// self.addEventListener('fetch', event => {

//   // --- Add a guard clause to ignore non-HTTP/HTTPS requests ---
//   const requestUrl = new URL(event.request.url);
//   if (requestUrl.protocol !== 'http:' && requestUrl.protocol !== 'https:') {
//     // If the request is for a chrome-extension, blob, etc., do not handle it.
//     // Let the browser handle it as it normally would.
//     return; 
//   }

//   //1. Cache-first for audio and transcripts
//   if (requestUrl.pathname.endsWith('.mp3') || requestUrl.pathname.endsWith('.json')) {
//     event.respondWith(
//       caches.match(event.request).then(cachedResponse => {
//         if (cachedResponse) {
//           return cachedResponse;
//         }
//         return fetch(event.request).then(networkResponse => {
//           const isPartial = event.request.headers.has('range');
//           if (!isPartial && networkResponse.status === 200) {
//             const responseToCache = networkResponse.clone();
//             caches.open(CACHE_NAME).then(cache => {
//               cache.put(event.request, responseToCache);
//             });
//           }
//           return networkResponse;
//         }).catch(() => {
//           if (requestUrl.pathname.endsWith('.mp3')) {
//             return caches.match(FALLBACK_AUDIO);
//           }
//         });
//       })
//     );
//     return;
//   }

//   // 2. Stale-while-revalidate for app shell and static assets
//   event.respondWith(
//     caches.match(event.request).then(cachedResponse => {
//       const fetchPromise = fetch(event.request).then(networkResponse => {
//         return caches.open(CACHE_NAME).then(cache => {
//           cache.put(event.request, networkResponse.clone());
//           return networkResponse;
//         });
//       }).catch(() => {
//         if (event.request.destination === 'document') {
//           return caches.match(FALLBACK_HTML);
//         }
//         if (event.request.destination === 'image') {
//           return caches.match(FALLBACK_IMAGE);
//         }
//       });
//       return cachedResponse || fetchPromise;
//     })
//   );
// });

self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Ignore non-http(s) schemes
  const url = new URL(event.request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Optional: short-circuit for certain origins or APIs you don't want cached
  // if (url.origin !== self.location.origin) return;

  // Example: cache-first for audio/transcripts (uncomment if you want it)
  if (url.pathname.endsWith('.mp3') || url.pathname.endsWith('.json')) {
    event.respondWith((async () => {
      try {
        const cached = await caches.match(event.request);
        if (cached) return cached;

        // Perform fetch; don't cache partial (range) requests. Cache only OK responses.
        const networkResponse = await fetch(event.request);
        const isPartial = event.request.headers.has('range');
        if (!isPartial && networkResponse && networkResponse.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch (err) {
        // Network failed — provide audio fallback if requested, otherwise rethrow
        if (url.pathname.endsWith('.mp3')) {
          return caches.match(FALLBACK_AUDIO);
        }
        throw err;
      }
    })());
    return;
  }

  // Stale-while-revalidate for other GETs
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(event.request);
    const networkPromise = (async () => {
      try {
        const networkResponse = await fetch(event.request);
        // Only cache successful (200) responses and skip partial/range requests
        const isPartial = event.request.headers.has('range');
        if (!isPartial && networkResponse && networkResponse.ok) {
          // Optionally: skip caching cross-origin opaque responses:
          if (networkResponse.type !== 'opaque') {
            await cache.put(event.request, networkResponse.clone());
          } else {
            // If you want to cache opaque responses, remove the check above.
          }
        }
        return networkResponse;
      } catch (err) {
        // Provide fallbacks for navigation/image when offline
        if (event.request.destination === 'document') {
          return caches.match(FALLBACK_HTML);
        }
        if (event.request.destination === 'image') {
          return caches.match(FALLBACK_IMAGE);
        }
        // otherwise rethrow to let browser handle error
        throw err;
      }
    })();

    // If cached exists, return immediately and update in background.
    // If no cached, wait for networkPromise.
    return cachedResponse || await networkPromise;
  })());
});


/**
 * Handles the download and caching of a lesson pack.
 * Reports progress back to the client.
 * @param {object} payload - The message payload.
 * @param {string} payload.packId - The ID of the pack being downloaded.
 * @param {Array<string>} payload.urls - The list of file URLs to download.
 * @param {string} clientId - The ID of the client window to send messages back to.
 */
async function handleDownloadPack(payload, clientId) {
  // Get a reference to the specific browser tab that sent the message
  const client = await self.clients.get(clientId);
  if (!client) return; // Exit if the client tab is no longer open

  const { packId, urls } = payload;

  try {
    console.log(`[SW] Starting download for pack: ${packId}`);
    const cache = await caches.open(CACHE_NAME);
    const totalFiles = urls.length;

    for (let i = 0; i < totalFiles; i++) {
      const url = urls[i];
      
      // Check if the file is already in the cache to avoid re-downloading
      const cachedResponse = await cache.match(url);
      if (!cachedResponse) {
        await cache.add(url);
      }
      
      // Calculate and report progress after each file
      const progress = Math.round(((i + 1) / totalFiles) * 100);
      client.postMessage({
        type: 'DOWNLOAD_PROGRESS',
        payload: { packId, progress }
      });
    }

    // Report completion
    client.postMessage({
      type: 'DOWNLOAD_COMPLETE',
      payload: { packId }
    });
    console.log(`[SW] Successfully downloaded all files for pack: ${packId}`);

  } catch (error) {
    console.error(`[SW] Error downloading pack ${packId}:`, error);
    // Report the error
    client.postMessage({
      type: 'DOWNLOAD_ERROR',
      payload: { packId, message: error.message }
    });
  }
}

/**
 * Handles the deletion of a cached lesson pack.
 * Reports completion back to the client.
 * @param {object} payload - The message payload.
 * @param {string} payload.packId - The ID of the pack being deleted.
 * @param {Array<string>} payload.urls - The list of file URLs to delete from the cache.
 * @param {string} clientId - The ID of the client window to send messages back to.
 */
async function handleDeletePack(payload, clientId) {
  const client = await self.clients.get(clientId);
  if (!client) return;

  const { packId, urls } = payload;

  try {
    console.log(`[SW] Starting deletion for pack: ${packId}`);
    const cache = await caches.open(CACHE_NAME);

    // Loop through each URL and delete it from the cache
    for (const url of urls) {
      await cache.delete(url);
    }

    // Report successful deletion
    client.postMessage({
      type: 'DELETE_COMPLETE',
      payload: { packId }
    });
    console.log(`[SW] Successfully deleted all files for pack: ${packId}`);

  } catch (error) {
    console.error(`[SW] Error deleting pack ${packId}:`, error);
    // Report the error (optional, but good practice)
    client.postMessage({
      type: 'DELETE_ERROR',
      payload: { packId, message: error.message }
    });
  }
}

// ===================================
// Message Handler for App Commands
// ===================================

self.addEventListener('message', event => {
  if (!event.data || !event.data.type) return;

  const { type, payload } = event.data;
  // Get the ID of the client (the browser tab) that sent the message
  const clientId = event.source.id;
  
  console.log(`[SW] Received command: ${type}`);

  switch (type) {
    case 'DOWNLOAD_PACK':
      // Use event.waitUntil to keep the service worker alive during the download
      event.waitUntil(handleDownloadPack(payload, clientId));
      break;
    
    case 'DELETE_PACK':
      console.log('[SW] Delete command received for pack:', payload.packId);
      event.waitUntil(handleDeletePack(payload, clientId));
      break;
      
    default:
      console.warn(`[SW] Unknown command received: ${type}`);
      break;
  }
});