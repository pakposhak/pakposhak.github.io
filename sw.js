/* PakPoshak service worker.
 *
 * Goals:
 *  - Make the site an installable PWA (Android "Install app", iOS "Add to Home Screen").
 *  - Provide a basic offline fallback.
 *  - NEVER serve a stale build of the page. The HTML changes often, so the page
 *    is always network-FIRST; the cached copy is only used when the network fails
 *    (offline). Static assets (icons/manifest) are cache-first since they rarely
 *    change — bump CACHE_VERSION below when an icon changes.
 *  - NEVER touch cross-origin requests (Shopify product fetches, Apps Script order
 *    submission, Formspree). Those must always hit the network untouched.
 */
const CACHE_VERSION = 'psb-v15';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  // Activate the new SW immediately instead of waiting for old tabs to close.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      // Best-effort precache — don't fail install if one asset 404s.
      Promise.allSettled(APP_SHELL.map((u) => cache.add(u)))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET. Leave POST (order submission, etc.) alone entirely.
  if (req.method !== 'GET') return;

  // Only handle same-origin requests. Cross-origin (Shopify, Apps Script,
  // Formspree, fonts) passes straight through to the network.
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Cache-bust probes (?_v= / ?_fresh=) — used by the in-app auto-updater to read the
  // live build tag and to force a fresh reload — are network-only: don't intercept,
  // cache, or risk serving a stale copy for them.
  if (url.searchParams.has('_v') || url.searchParams.has('_fresh')) return;

  const isHTML =
    req.mode === 'navigate' ||
    req.destination === 'document' ||
    req.headers.get('accept')?.includes('text/html');
  // The MANIFEST decides PWA installability. Serve it network-FIRST too, so an
  // updated manifest (e.g. display:"browser" → "standalone") reaches the browser
  // immediately instead of a stale cache-first copy silently blocking the one-tap
  // "Install app" prompt — which is exactly the bug that broke install.
  const isManifest = url.pathname.endsWith('manifest.json');

  if (isHTML || isManifest) {
    // Network-first: always try to get the freshest page/manifest. Cache a copy
    // for offline. Fall back to cache only when the network is unavailable.
    //
    // CRITICAL: fetch with {cache: 'reload'} so this request BYPASSES the
    // browser's HTTP cache. GitHub Pages serves with Cache-Control: max-age=600
    // (10 min). Without 'reload', a plain fetch(req) is served from that 10-min-
    // stale HTTP cache — so "network-first" silently returns an OLD build.
    // 'reload' forces a real network round-trip to the CDN, then updates the cache.
    const cacheKey = isManifest ? './manifest.json' : './index.html';
    event.respondWith(
      fetch(req.url, { cache: 'reload' })
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(cacheKey, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match(cacheKey)))
    );
    return;
  }

  // catalog.json: stale-while-revalidate. Serve the cached copy INSTANTLY for a snappy
  // Browse-Products open, but ALWAYS kick off a background network fetch ({cache:'reload'}
  // bypasses the 10-min HTTP cache) and refresh the SW cache, so the next open is fresh.
  // This is why the client can safely switch to the stable catalog.json URL: plain
  // cache-first (below) would pin the first cached copy forever; this never does.
  if (url.pathname.endsWith('catalog.json')) {
    event.respondWith(
      caches.open(CACHE_VERSION).then((cache) =>
        cache.match('./catalog.json').then((hit) => {
          const net = fetch(req.url, { cache: 'reload' })
            .then((res) => { cache.put('./catalog.json', res.clone()); return res; })
            .catch(() => hit);
          return hit || net;
        })
      )
    );
    return;
  }

  // Static assets: cache-first, fall back to network and cache the result.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          return res;
        })
    )
  );
});
