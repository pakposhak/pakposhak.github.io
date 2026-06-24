/* ============================================================================
 * COMBINED "Send to PakPoshak" on-page reader  —  CART or WISHLIST, auto-detected.
 * Runs in the brand page context (iOS Shortcut "Run JavaScript", desktop/Android
 * bookmarklet). Produces a list of product URLs and opens order-form.html?cart=...
 * The order-form ?cart= handler is unchanged: it makes one draft per link.
 *
 * Detection order (first hit wins):
 *   1. CART line-items  — quantity control next to a product link (cart/bag page)
 *   2. WISHLIST items   — product links inside a wishlist-scoped container,
 *                          excluding recommendation/related carousels
 *   3. Shopify /cart.js — JSON cart fallback (works from any page)
 *   4. Single page      — the current URL (one product)
 * ==========================================================================*/
(async () => {
  var origin = location.origin;
  var abs = function (h) { try { var u = new URL(h, origin); u.hash = ''; return u.href; } catch (e) { return null; } };
  var isProd = function (h) { try { var p = new URL(h, origin).pathname; return /\.html$/i.test(p) || /\/products?\//i.test(p); } catch (e) { return false; } };
  // class+id text of an element, SVG-safe.
  var cid = function (e) { var c = e.className; if (c && c.baseVal !== undefined) c = c.baseVal; return (String(c || '') + ' ' + (e.id || '')); };
  // Is this anchor inside a "you may also like / related / recently viewed" block?
  var inRecs = function (el) {
    for (var e = el; e && e !== document.body; e = e.parentElement) {
      if (/recommend|related|you-?may|also-?like|cross-?sell|upsell|recently-?viewed|trending|bestsell|complete-?the-?look|similar|carousel/i.test(cid(e))) return true;
    }
    return false;
  };
  var finish = function (list) {
    var seen = {}, urls = [];
    (list || []).forEach(function (u) { if (u && !seen[u]) { seen[u] = 1; urls.push(u); } });
    var href = 'https://pakposhak.github.io/order-form.html?cart=' + encodeURIComponent(urls.join('\n'));
    if (typeof completion === 'function') { completion(href); } else { location.href = href; }
  };

  // 1) CART line-items — a quantity control with a product link nearby.
  try {
    var out = [];
    document.querySelectorAll(
      'input[name*="quantity" i],select[name*="quantity" i],[class*="quantity"] input,[class*="quantity"] select,[class*="qty"] input,[class*="qty"] select'
    ).forEach(function (q) {
      var el = q;
      for (var i = 0; i < 6 && el; i++, el = el.parentElement) {
        var a = el.querySelector && el.querySelector('a[href]');
        if (a && isProd(a.getAttribute('href'))) { var u = abs(a.getAttribute('href')); if (u) { out.push(u); break; } }
      }
    });
    if (!out.length) {
      document.querySelectorAll('.product-line-item,.line-item,[class*="line-item"],[class*="cart-item"]').forEach(function (li) {
        var a = li.querySelector('a[href]');
        if (a && isProd(a.getAttribute('href'))) { var u = abs(a.getAttribute('href')); if (u) out.push(u); }
      });
    }
    if (out.length) { finish(out); return; }
  } catch (e) {}

  // 2) WISHLIST items — product links inside a wishlist-scoped container.
  try {
    var wsel = '[class*="wishlist" i],[id*="wishlist" i],[class*="wish-list" i],[class*="favourite" i],[class*="favorite" i],[class*="swym" i],[id*="swym" i],[class*="growave" i],[class*="saved-item" i],[data-wishlist],[data-swym-product-id]';
    var wl = [];
    document.querySelectorAll(wsel).forEach(function (sc) {
      if (sc === document.body || sc === document.documentElement) return;   // too broad to trust
      sc.querySelectorAll('a[href]').forEach(function (a) {
        var h = a.getAttribute('href');
        if (isProd(h) && !inRecs(a)) { var u = abs(h); if (u) wl.push(u); }
      });
    });
    if (wl.length) { finish(wl); return; }
  } catch (e) {}

  // 3) Shopify /cart.js fallback.
  try {
    var res = await fetch('/cart.js', { headers: { Accept: 'application/json' } });
    if (res.ok) {
      var cart = await res.json();
      var urls = (cart.items || []).map(function (i) {
        return abs(i.handle ? ('/products/' + i.handle + (i.variant_id ? '?variant=' + i.variant_id : '')) : i.url);
      });
      if (urls.filter(Boolean).length) { finish(urls); return; }
    }
  } catch (e) {}

  // 4) Single current page.
  finish([location.href]);
})();
