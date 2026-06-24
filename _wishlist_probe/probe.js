/* Wishlist-tech probe.
 * For every brand in _audit_tmp/brandhost.json, fetch the homepage (browser UA)
 * and detect: e-commerce platform + which wishlist app (if any) is loaded.
 * The wishlist app determines whether a shared wishlist is fetchable
 * server-side (paste-a-link) or only via on-page JS (Shortcut/bookmarklet).
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const zlib = require('zlib');

const HOSTS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '_audit_tmp', 'brandhost.json'), 'utf8'));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Wishlist-app signatures. Each app leaves a recognisable marker in page HTML/JS.
const WISHLIST_APPS = [
  { app: 'Swym (Wishlist Plus)', re: /swymrelay|swym-snippet|SwymCallbacks|_swat\b|swym\.thirdparty|swymWishlist/i, fetch: 'api' },
  { app: 'Growave',              re: /growave|cdn\.growave\.io|socialshopwave|ssw-|gw-wishlist|gw_wishlist/i,        fetch: 'page' },
  { app: 'Wishlist King',        re: /wishlist-king|wishlistking|appikon/i,                                          fetch: 'page' },
  { app: 'Wishlist Hero',        re: /wishlist-hero|wishlisthero/i,                                                  fetch: 'page' },
  { app: 'Smart Wishlist',       re: /smart-wishlist|smartwishlist/i,                                                fetch: 'page' },
  { app: 'Wishlist Plus(other)', re: /wishlistplus|wishlist-plus/i,                                                  fetch: 'page' },
  { app: 'Loox/Judge wish',      re: /loox-wishlist/i,                                                               fetch: 'page' },
  { app: 'WooCommerce wishlist', re: /yith-woocommerce-wishlist|woocommerce-wishlist|tinvwl|wcboost-wishlist/i,      fetch: 'page' },
  { app: 'SFCC native wishlist', re: /Wishlist-(Show|Add|GetProduct| Login)|wishlist-account|js-wishlist/i,          fetch: 'page' },
];

function detectPlatform(html, host) {
  if (/demandware|dwstore|Sites-.*-Site|dw\.ac|on\/demandware/i.test(html)) return 'SFCC';
  if (/cdn\.shopify\.com|Shopify\.theme|myshopify|shopify-section|x-shopify/i.test(html)) return 'Shopify';
  if (/woocommerce|wp-content\/plugins|wp-json/i.test(html)) return 'WooCommerce';
  if (/Magento|mage\/|static\/version|Magento_/i.test(html)) return 'Magento';
  if (/wix\.com|wixstatic/i.test(html)) return 'Wix';
  return 'other';
}

function detectWishlist(html) {
  const hits = [];
  for (const w of WISHLIST_APPS) if (w.re.test(html)) hits.push(w);
  // Generic "wishlist" word present even if no known app matched.
  const genericWord = /wishlist|wish-list|add to wish|favourite|favorite/i.test(html);
  return { hits, genericWord };
}

// Node https.get works on this machine where global fetch (undici) fails at the
// TLS layer — same approach the proven harvest-catalog.js uses. Follow redirects
// (homepages 301 to www/https) and gunzip when the server compresses.
function fetchHtml(host, _url, _depth) {
  const url = _url || ('https://' + host + '/');
  const depth = _depth || 0;
  return new Promise((resolve) => {
    let done = false;
    const fin = (v) => { if (!done) { done = true; resolve(v); } };
    let lib;
    try { lib = url.startsWith('http://') ? http : https; } catch (e) { return fin({ ok: false, status: 0, err: 'BADURL' }); }
    const req = lib.get(url, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9', 'Accept-Encoding': 'gzip, deflate, br' },
      timeout: 20000,
    }, (res) => {
      const sc = res.statusCode;
      // Redirect chain (max 5).
      if (sc >= 300 && sc < 400 && res.headers.location && depth < 5) {
        res.resume();
        let next;
        try { next = new URL(res.headers.location, url).href; } catch (e) { return fin({ ok: false, status: sc, err: 'BADREDIR' }); }
        return resolve(fetchHtml(host, next, depth + 1));
      }
      const enc = (res.headers['content-encoding'] || '').toLowerCase();
      let stream = res;
      try {
        if (enc === 'gzip') stream = res.pipe(zlib.createGunzip());
        else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());
        else if (enc === 'br') stream = res.pipe(zlib.createBrotliDecompress());
      } catch (e) { /* fall through with raw */ }
      const chunks = [];
      let bytes = 0;
      stream.on('data', (c) => { bytes += c.length; if (bytes <= 1200000) chunks.push(c); });
      stream.on('end', () => fin({ ok: true, status: sc, finalUrl: url, html: Buffer.concat(chunks).toString('utf8') }));
      stream.on('error', () => fin({ ok: false, status: sc, err: 'DECODE' }));
    });
    req.on('timeout', () => { req.destroy(); fin({ ok: false, status: 0, err: 'TIMEOUT' }); });
    req.on('error', (e) => fin({ ok: false, status: 0, err: (e && e.code) || 'ERR' }));
  });
}

async function probe(name, host) {
  const r = await fetchHtml(host);
  if (!r.ok) return { name, host, status: 0, platform: '?', wishlist: 'FETCH-FAILED:' + r.err, apps: [], generic: false };
  const platform = detectPlatform(r.html, host);
  const { hits, genericWord } = detectWishlist(r.html);
  return {
    name, host, status: r.status, platform,
    apps: hits.map(h => h.app),
    fetchModes: [...new Set(hits.map(h => h.fetch))],
    generic: genericWord,
    finalUrl: r.finalUrl,
  };
}

async function pool(entries, n, worker) {
  const out = [];
  let i = 0;
  const runners = Array.from({ length: n }, async () => {
    while (i < entries.length) {
      const idx = i++;
      out[idx] = await worker(entries[idx]);
      process.stdout.write('.');
    }
  });
  await Promise.all(runners);
  return out;
}

(async () => {
  const entries = Object.entries(HOSTS);
  console.log('Probing ' + entries.length + ' brands...');
  const results = await pool(entries, 12, ([name, host]) => probe(name, host));
  console.log('\n');
  fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(results, null, 2));

  // ── Summary ──
  const byApp = {};
  const byPlatform = {};
  let withApp = 0, genericOnly = 0, none = 0, failed = 0;
  for (const r of results) {
    byPlatform[r.platform] = (byPlatform[r.platform] || 0) + 1;
    if (r.status === 0) { failed++; continue; }
    if (r.apps.length) { withApp++; r.apps.forEach(a => byApp[a] = (byApp[a] || 0) + 1); }
    else if (r.generic) genericOnly++;
    else none++;
  }
  console.log('=== PLATFORM ===');
  Object.entries(byPlatform).sort((a,b)=>b[1]-a[1]).forEach(([k,v]) => console.log(String(v).padStart(3), k));
  console.log('\n=== WISHLIST APP (detected) ===');
  Object.entries(byApp).sort((a,b)=>b[1]-a[1]).forEach(([k,v]) => console.log(String(v).padStart(3), k));
  console.log('\n=== TOTALS ===');
  console.log('with known wishlist app :', withApp);
  console.log('generic wishlist word   :', genericOnly);
  console.log('no wishlist signal      :', none);
  console.log('fetch failed            :', failed);
  console.log('total                   :', results.length);
})();
