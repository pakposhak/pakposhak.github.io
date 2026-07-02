/* PakPoshak service worker.
 *
 * Goals:
 *  - Make the site an installable PWA (Android "Install app", iOS "Add to Home Screen").
 *  - Provide a basic offline fallback.
 *  - NEVER serve a stale build of the page. The HTML changes often, so the page
 *    is always network-FIRST; the cached copy is only used when the network fails
 *    (offline). Static assets (icons/manifest) are cache-first since they rarely
 *    change â€” bump CACHE_VERSION below when an icon changes.
 *  - NEVER touch cross-origin requests (Shopify product fetches, Apps Script order
 *    submission, Formspree). Those must always hit the network untouched.
 */
const CACHE_VERSION = 'psb-v193';
const APP_SHELL = [
  './',
  './index.html',
  './order-form.html',
  './style.css',
  './app.js',
  './manifest.json',
  './pakposhak-icon-192.png',
  './pakposhak-icon-512.png',
  './maskable-icon-192.png',
  './maskable-icon-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  // Activate the new SW immediately instead of waiting for old tabs to close.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      // Best-effort precache â€” don't fail install if one asset 404s.
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

  // Cache-bust probes (?_v= / ?_fresh=) â€” used by the in-app auto-updater to read the
  // live build tag and to force a fresh reload â€” are network-only: don't intercept,
  // cache, or risk serving a stale copy for them.
  if (url.searchParams.has('_v') || url.searchParams.has('_fresh')) return;

  const isHTML =
    req.mode === 'navigate' ||
    req.destination === 'document' ||
    req.headers.get('accept')?.includes('text/html');
  // The MANIFEST decides PWA installability. Serve it network-FIRST too, so an
  // updated manifest (e.g. display:"browser" â†’ "standalone") reaches the browser
  // immediately instead of a stale cache-first copy silently blocking the one-tap
  // "Install app" prompt â€” which is exactly the bug that broke install.
  const isManifest = url.pathname.endsWith('manifest.json');

  if (isHTML || isManifest) {
    // Network-first: always try to get the freshest page/manifest. Cache a copy
    // for offline. Fall back to cache only when the network is unavailable.
    //
    // CRITICAL: fetch with {cache: 'reload'} so this request BYPASSES the
    // browser's HTTP cache. GitHub Pages serves with Cache-Control: max-age=600
    // (10 min). Without 'reload', a plain fetch(req) is served from that 10-min-
    // stale HTTP cache â€” so "network-first" silently returns an OLD build.
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

  // app.js / style.css: STALE-WHILE-REVALIDATE. These minified artifacts change on
  // EVERY deploy, but were previously cache-first â€” so their content only refreshed when
  // the service worker ITSELF reinstalled (a CACHE_VERSION bump), which is unreliable on
  // iOS and left users stuck on an OLD app.js: network-first HTML gave them the fresh page,
  // but the cache-first app.js stayed stale, so newly-added pages/posters silently fell
  // back and looked "missing". SWR serves the cached copy INSTANTLY (fast open) but ALWAYS
  // revalidates in the background ({cache:'reload'} bypasses GitHub Pages' 10-min HTTP
  // cache), so the NEXT load is fresh regardless of SW-version timing. Offline still works
  // (falls back to the cached copy). The in-app updater's app.js?_v= probe is unaffected â€”
  // it carries _v and is skipped above.
  if (url.pathname.endsWith('app.js') || url.pathname.endsWith('style.css')) {
    event.respondWith(
      caches.open(CACHE_VERSION).then((cache) =>
        cache.match(req).then((hit) => {
          const net = fetch(req.url, { cache: 'reload' })
            .then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; })
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
