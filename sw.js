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
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Debug
  console.log(`[SW] Fetching ${url.href}`);

  // --- STRATEGY 1: Network First for critical manifest files ---
  // This ensures users always get the latest list of languages, packs, and lessons when online.
  if (url.pathname.endsWith('languages.json') || 
      url.pathname.endsWith('packs.json') || 
      url.pathname.endsWith('lessons.json')) {
      
      event.respondWith(
          fetch(event.request)
              .then(networkResponse => {
                  // If we get a response, update the cache and return it
                  return caches.open(CACHE_NAME).then(cache => {
                      cache.put(event.request, networkResponse.clone());
                      return networkResponse;
                  });
              })
              .catch(() => {
                  // If the network fails, try to get it from the cache
                  console.log(`[SW] Network failed for ${url.pathname}, serving from cache.`);
                  return caches.match(event.request);
              })
      );
      return; // End execution here
  }

  // AUDIO & TRANSCRIPTS (cache-first + proper range support)
  if (url.pathname.endsWith('.mp3') || url.pathname.endsWith('.json')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);

      const isRange = url.pathname.endsWith('.mp3') && event.request.headers.has('range');

      try {
        // If it's a range request, first try to serve from the cached full file.
        if (isRange) {
          const fullCached = await cache.match(url.href);
          if (fullCached) {
            // Serve the requested byte range from the cached full file
            const rangeHeader = event.request.headers.get('range') || '';
            const buffer = await fullCached.arrayBuffer();
            const byteLength = buffer.byteLength;

            const matches = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
            let start = matches && matches[1] ? parseInt(matches[1], 10) : 0;
            let end = matches && matches[2] ? parseInt(matches[2], 10) : byteLength - 1;

            // Validate / clamp
            if (isNaN(start)) start = 0;
            if (isNaN(end)) end = byteLength - 1;
            if (start > end) {
              return new Response(null, {
                status: 416,
                statusText: 'Requested Range Not Satisfiable',
                headers: { 'Content-Range': `bytes */${byteLength}` }
              });
            }
            if (start >= byteLength) {
              return new Response(null, {
                status: 416,
                statusText: 'Requested Range Not Satisfiable',
                headers: { 'Content-Range': `bytes */${byteLength}` }
              });
            }

            const sliced = buffer.slice(start, end + 1);
            return new Response(sliced, {
              status: 206,
              statusText: 'Partial Content',
              headers: {
                'Content-Range': `bytes ${start}-${end}/${byteLength}`,
                'Content-Length': String((end - start) + 1),
                'Content-Type': fullCached.headers.get('Content-Type') || 'audio/mpeg'
              }
            });
          }

          // Not in cache: fetch the FULL resource (no Range header), cache it (ONLY if 200),
          // then serve the requested range from the fetched full file.
          try {
            const fullResp = await fetch(url.href); // fetch without Range header
            if (fullResp && fullResp.ok && fullResp.status === 200) {
              // Cache the full file safely (only 200)
              await cache.put(url.href, fullResp.clone());

              // Now slice and return the requested range
              const buffer = await fullResp.arrayBuffer();
              const byteLength = buffer.byteLength;
              const rangeHeader = event.request.headers.get('range') || '';
              const matches = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
              let start = matches && matches[1] ? parseInt(matches[1], 10) : 0;
              let end = matches && matches[2] ? parseInt(matches[2], 10) : byteLength - 1;

              if (isNaN(start)) start = 0;
              if (isNaN(end)) end = byteLength - 1;
              if (start > end || start >= byteLength) {
                return new Response(null, {
                  status: 416,
                  statusText: 'Requested Range Not Satisfiable',
                  headers: { 'Content-Range': `bytes */${byteLength}` }
                });
              }

              const sliced = buffer.slice(start, end + 1);
              return new Response(sliced, {
                status: 206,
                statusText: 'Partial Content',
                headers: {
                  'Content-Range': `bytes ${start}-${end}/${byteLength}`,
                  'Content-Length': String((end - start) + 1),
                  'Content-Type': fullResp.headers.get('Content-Type') || 'audio/mpeg'
                }
              });
            } else {
              // If network response is not 200, don't try to cache it. Fall back:
              return caches.match(FALLBACK_AUDIO);
            }
          } catch (err) {
            // Network failed -> offline fallback
            console.warn('[SW] Range fetch/full fetch failed:', err);
            return caches.match(FALLBACK_AUDIO);
          }
        } // end isRange handling

        // NON-RANGE logic (regular cache-first)
        // Try cache by URL string (matches what handleDownloadPack used)
        const cached = await cache.match(url.href);
        if (cached) return cached;

        // Not in cache — fetch from network; only cache full 200 responses.
        const networkResponse = await fetch(event.request);
        if (networkResponse && networkResponse.ok && networkResponse.status === 200) {
          try {
            await cache.put(url.href, networkResponse.clone());
          } catch (putErr) {
            // Defensive: shouldn't happen for 200, but log if it does.
            console.warn('[SW] cache.put failed for', url.href, putErr);
          }
        }
        return networkResponse;
      } catch (err) {
        console.error('[SW] Audio fetch handler error:', err);
        return caches.match(FALLBACK_AUDIO);
      }
    })());
    return;
  }

  // APP SHELL & STATIC ASSETS (stale-while-revalidate)
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(url.href);

    const networkPromise = (async () => {
      try {
        const networkResponse = await fetch(event.request);
        if (networkResponse && networkResponse.ok && networkResponse.status === 200) {
          await cache.put(url.href, networkResponse.clone());
        }
        return networkResponse;
      } catch (err) {
        if (event.request.destination === 'document') {
          return caches.match(FALLBACK_HTML);
        }
        if (event.request.destination === 'image') {
          return caches.match(FALLBACK_IMAGE);
        }
        throw err;
      }
    })();

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