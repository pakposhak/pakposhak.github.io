/* Emit the combined cart-OR-wishlist bookmarklet as an escaped JS string ready to
 * paste into desktop-cart.html (var code = <output>). Authored as a real function so
 * regex/selector escaping is exact; minified only by collapsing newlines+indent. */
function reader() {
  var o = location.origin;
  function ab(h) { try { var u = new URL(h, o); u.hash = ''; return u.href; } catch (e) { return null; } }
  function ip(h) { try { var p = new URL(h, o).pathname; return /\.html$/i.test(p) || /\/products?\//i.test(p); } catch (e) { return false; } }
  function cid(e) { var c = e.className; if (c && c.baseVal !== undefined) c = c.baseVal; return String(c || '') + ' ' + (e.id || ''); }
  function rec(el) { for (var e = el; e && e !== document.body; e = e.parentElement) { if (/recommend|related|you-?may|also-?like|cross-?sell|upsell|recently-?viewed|trending|bestsell|complete-the-look|similar|carousel/i.test(cid(e))) return true; } return false; }
  function go(l) { var s = {}, a = []; (l || []).forEach(function (u) { if (u && !s[u]) { s[u] = 1; a.push(u); } }); location.href = 'https://pakposhak.github.io/order-form.html?cart=' + encodeURIComponent(a.join('\n')); }
  var out = [];
  document.querySelectorAll('input[name*="quantity" i],select[name*="quantity" i],[class*="quantity"] input,[class*="quantity"] select,[class*="qty"] input,[class*="qty"] select').forEach(function (q) { var e = q; for (var i = 0; i < 6 && e; i++, e = e.parentElement) { var a = e.querySelector && e.querySelector('a[href]'); if (a && ip(a.getAttribute('href'))) { var u = ab(a.getAttribute('href')); if (u) { out.push(u); break; } } } });
  if (out.length) { return go(out); }
  var wl = [], ws = {};
  document.querySelectorAll('[class*="wishlist" i],[id*="wishlist" i],[class*="wish-list" i],[class*="favourite" i],[class*="favorite" i],[class*="swym" i],[id*="swym" i],[class*="growave" i],[class*="saved-item" i],[data-wishlist],[data-swym-product-id]').forEach(function (sc) { if (sc === document.body || sc === document.documentElement) return; sc.querySelectorAll('a[href]').forEach(function (a) { var h = a.getAttribute('href'); if (ip(h) && !rec(a)) { var u = ab(h); if (u && !ws[u]) { ws[u] = 1; wl.push(u); } } }); });
  if (wl.length) { return go(wl); }
  fetch('/cart.js', { headers: { Accept: 'application/json' } }).then(function (r) { return r.ok ? r.json() : null; }).then(function (c) { if (c && c.items) { var u = c.items.map(function (i) { return ab(i.handle ? ('/products/' + i.handle + (i.variant_id ? '?variant=' + i.variant_id : '')) : i.url); }).filter(Boolean); if (u.length) { return go(u); } } go([location.href]); }).catch(function () { go([location.href]); });
}

var src = reader.toString().replace(/\s*\n\s*/g, ' ').trim();
var bm = 'javascript:(' + src + ')();';
console.log(bm.length + ' chars');
console.log('--- JSON (paste into desktop-cart.html var code = ) ---');
console.log(JSON.stringify(bm));
// sanity: ensure the wishlist selector + cart fallback both survived
console.log('--- checks ---');
console.log('has wishlist sel :', bm.includes('data-swym-product-id'));
console.log('has cart.js      :', bm.includes('/cart.js'));
console.log('has rec filter   :', bm.includes('recently-?viewed'));
