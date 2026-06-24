/* Verify the combined bookmarklet from desktop-cart.html:
 *  1. syntax valid as embedded
 *  2. WISHLIST page → extracts saved products, dedupes, skips recs + header wishlist link
 *  3. CART page (regression) → still reads cart line-items, wishlist step does NOT hijack
 *  4. PRODUCT page → no cart/wishlist DOM, cart.js empty → falls back to the single page
 * Uses jsdom. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'desktop-cart.html'), 'utf8');
const m = html.match(/var code = ("javascript:[\s\S]*?");\r?\n/);
if (!m) { console.log('FAIL: bookmarklet not found'); process.exit(1); }
const code = JSON.parse(m[1]);
const body = code.replace(/^javascript:/, '');
try { new Function(body); console.log('SYNTAX OK (' + code.length + ' chars)\n'); }
catch (e) { console.log('SYNTAX ERROR:', e.message); process.exit(1); }

function run(name, pageHtml, url, cartJson) {
  const dom = new JSDOM(pageHtml, { url });
  let captured = null;
  // href GET returns the real page URL until the bookmarklet SETS it (so the single-page
  // fallback `go([location.href])` reads the current product URL, like a real browser).
  const stubLocation = { origin: new URL(url).origin, get href() { return captured !== null ? captured : url; }, set href(v) { captured = v; } };
  const stubFetch = (u) => {
    if (cartJson && String(u).includes('/cart.js')) return Promise.resolve({ ok: true, json: () => Promise.resolve(cartJson) });
    return Promise.reject(new Error('no cart.js'));
  };
  const runner = new Function('location', 'document', 'fetch', body);
  try { runner(stubLocation, dom.window.document, stubFetch); } catch (e) {}
  return new Promise((res) => setTimeout(() => {
    const links = captured ? decodeURIComponent(new URL(captured).searchParams.get('cart') || '').split('\n').filter(Boolean) : [];
    res({ name, links });
  }, 60));
}

const WISHLIST = `<body>
  <header><a class="wishlist-link" href="/pages/wishlist">Wishlist (3)</a></header>
  <div class="swym-wishlist swym-wishlist-page">
    <a href="/products/red-lawn-suit?variant=111">Red</a>
    <a href="/products/blue-kurta?variant=222">Blue</a>
    <div class="swym-wishlist-product"><a href="/products/green-saree">Green</a></div>
    <a href="/products/red-lawn-suit?variant=111">Red dup</a>
  </div>
  <section class="product-recommendations you-may-also-like">
    <a href="/products/rec-1">Rec1</a><a href="/products/rec-2">Rec2</a>
  </section></body>`;

const CART = `<body>
  <header><a class="header-wishlist" href="/pages/wishlist">Wishlist</a></header>
  <div class="cart-items">
    <div class="line-item"><a href="/products/cart-suit-a?variant=1">A</a><input name="updates[quantity]" value="1"></div>
    <div class="line-item"><a href="/products/cart-suit-b?variant=2">B</a><div class="qty"><input value="2"></div></div>
  </div>
  <section class="recently-viewed"><a href="/products/seen-1">Seen</a></section></body>`;

const PRODUCT = `<body>
  <header><a class="wishlist-link" href="/pages/wishlist">Wishlist (0)</a></header>
  <main class="product"><h1>A Lawn Suit</h1><button class="add-wishlist">♡ Add to wishlist</button></main></body>`;

(async () => {
  const results = await Promise.all([
    run('WISHLIST page', WISHLIST, 'https://brand.example.com/pages/wishlist'),
    run('CART page', CART, 'https://brand.example.com/cart'),
    run('PRODUCT page (empty cart.js)', PRODUCT, 'https://brand.example.com/products/a-lawn-suit', { items: [] }),
  ]);
  const has = (links, s) => links.some(l => l.includes(s));
  let ok = true;
  const check = (cond, label) => { console.log((cond ? 'PASS ' : 'FAIL ') + label); if (!cond) ok = false; };

  const wl = results[0].links;
  console.log('— WISHLIST —'); console.log('  ' + wl.join('\n  '));
  check(wl.length === 3, 'wishlist: 3 unique products');
  check(wl.filter(l => l.includes('red-lawn-suit')).length === 1, 'wishlist: deduped');
  check(has(wl, 'variant=111'), 'wishlist: variant preserved');
  check(!has(wl, 'rec-'), 'wishlist: recommendations excluded');
  check(!has(wl, '/pages/wishlist'), 'wishlist: header page-link excluded');

  const ct = results[1].links;
  console.log('— CART —'); console.log('  ' + ct.join('\n  '));
  check(ct.length === 2, 'cart: 2 line-items (wishlist step did NOT hijack)');
  check(has(ct, 'cart-suit-a') && has(ct, 'cart-suit-b'), 'cart: both items read');
  check(!has(ct, 'seen-1'), 'cart: recently-viewed excluded');
  check(!has(ct, '/pages/wishlist'), 'cart: header wishlist link not added');

  const pr = results[2].links;
  console.log('— PRODUCT —'); console.log('  ' + pr.join('\n  '));
  check(pr.length === 1 && has(pr, '/products/a-lawn-suit'), 'product: falls back to single current page');

  console.log(ok ? '\nALL CHECKS PASSED ✅' : '\nSOME CHECKS FAILED ❌');
  process.exit(ok ? 0 : 1);
})();
