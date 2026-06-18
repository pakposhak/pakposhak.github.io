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
const CACHE_VERSION = 'psb-v4';
const APP_SHELL = [
  './',
  './index.html',
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

  const isHTML =
    req.mode === 'navigate' ||
    req.destination === 'document' ||
    req.headers.get('accept')?.includes('text/html');

  if (isHTML) {
    // Network-first: always try to get the freshest page. Cache a copy for
    // offline. Fall back to cache only when the network is unavailable.
    //
    // CRITICAL: fetch with {cache: 'reload'} so this request BYPASSES the
    // browser's HTTP cache. GitHub Pages serves HTML with Cache-Control:
    // max-age=600 (10 min). Without 'reload', a plain fetch(req) is served
    // from that 10-min-stale HTTP cache — so "network-first" silently returns
    // an OLD build (the zero-price / stale-build bug). 'reload' forces a real
    // network round-trip to the CDN every navigation, then updates the cache.
    // Use the URL string + {cache:'reload'} rather than new Request(req,…),
    // which throws for navigation-mode requests in some browsers.
    event.respondWith(
      fetch(req.url, { cache: 'reload' })
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
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
