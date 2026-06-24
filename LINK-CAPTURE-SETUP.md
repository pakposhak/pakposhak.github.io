# PakPoshak — Zero-Paste Link Capture (setup + customer how-to)

Goal: a customer on any brand product page sends the link into the PakPoshak order
form in **2 taps — no copy, no paste**. The order form opens with the product already
added (price, size chips, everything), exactly like a manual paste.

How it works under the hood: the order form reads a link handed to it on the address
bar and runs it through the *same* validation + draft-creation as a manual paste.
Entry points:

- **Android** → the installed PWA registers in the phone's **Share** sheet
  (`manifest.json` → `share_target`, action `/order-form.html`). Already wired.
- **iPhone** → iOS has no PWA share target, so a one-time **Shortcut** opens
  `https://pakposhak.github.io/order-form.html?add=<link>`.
- Both are handled by `handleSharedUrl()` in `app.src.js` (reads `?add=` first, then
  the Android `?url=`/`?text=`/`?title=` fields). It validates with `parseUrl` +
  `isKnownBrand` (brand allowlist), rejects non-web schemes, then creates the draft and
  strips the query so a refresh can't double-add.

---

## Part A — iPhone Shortcut (build once, share to customers)

You build this **once** on your iPhone, then send customers one iCloud link. Takes ~5 min.

### Build it
1. Open the **Shortcuts** app (built into every iPhone).
2. Tap **+** (top-right) to create a new shortcut. Name it **Add to PakPoshak**.
3. Tap **Add Action** and add these **4 actions in order**:

   | # | Action (search this name) | Set it to |
   |---|---|---|
   | 1 | **Receive** *(scroll to "Receive ___ input from ___")* | Receive **URLs** and **Safari web pages** from **Share Sheet**. If there's no input → **Stop and respond** |
   | 2 | **URL Encode** | Mode = **Encode**, input = **Shortcut Input** |
   | 3 | **Text** | type exactly: `https://pakposhak.github.io/order-form.html?add=` then insert the **URL Encoded** variable right after the `=` (no space) |
   | 4 | **Open URLs** | input = the **Text** from step 3 |

4. Tap the shortcut's **settings (ⓘ / "Details")** → turn ON **Show in Share Sheet** →
   under **Share Sheet Types** keep **URLs** and **Safari web pages** ticked.
5. Done. Test it: open a Khaadi/Sapphire product in Safari → tap **Share** →
   scroll to **Add to PakPoshak** → it should open the order form with the item added.

> **Why step 2 (URL Encode) matters:** brand links often carry their own `?variant=...`
> (the chosen size/colour). Encoding keeps that intact through the `?add=` hand-off, so
> the buyer's exact size is pre-selected. Skip it and the variant is lost.

### Share it to customers
1. In Shortcuts, long-press **Add to PakPoshak** → **Share** → **Copy iCloud Link**.
2. Send that link to customers (WhatsApp/FB). They tap it once → **Add Shortcut** → done.

> **Trigger note (honest):** the reliable iPhone trigger is **tap Share → Add to
> PakPoshak**. "Back Tap" (tap the back of the phone) can launch a shortcut, but it
> can't reliably read the *current* Safari page outside the Share sheet — so promote the
> Share-sheet method to customers, not Back Tap.

---

## Part A2 — iPhone "Send to PakPoshak" Shortcut (whole cart **or** wishlist, all brands)

Same idea as Part A, but instead of one product it grabs **every item on the page** in one
tap — works on a brand's **cart/bag page** (whole cart) *and* on its **♡ wishlist page**
(all saved items). The script auto-detects which page you're on, builds the whole PakPoshak
link itself, so the Shortcut is only **3 actions** (no fragile URL-Encode/Text wiring to get
wrong). **Open the cart/bag page or the wishlist page first, then Share** — that one habit
makes it work the same on every brand.

Build a second shortcut named **Send to PakPoshak**, with these actions:

| # | Action | Set it to |
|---|---|---|
| 1 | **Receive** | Receive **Safari web pages** from **Share Sheet**. If no input → **Stop** |
| 2 | **Run JavaScript on Web Page** | paste the script below |
| 3 | **Open URLs** | input = the **JavaScript Result** |

Self-contained script for action 2 — reads the cart **or** wishlist, builds the full
PakPoshak link, and hands it straight to **Open URLs**. Works on Shopify, Khaadi/Sapphire
(SFCC), and custom. Detection order: cart line-items → wishlist items → Shopify cart.js → the
single page you're on:

```javascript
(async () => {
  var origin = location.origin;
  var abs = function (h) { try { var u = new URL(h, origin); u.hash = ''; return u.href; } catch (e) { return null; } };
  var isProd = function (h) { try { var p = new URL(h, origin).pathname; return /\.html$/i.test(p) || /\/products?\//i.test(p); } catch (e) { return false; } };
  // class+id text of an element (SVG-safe) + whether an anchor is inside a "you may also
  // like / related / recently viewed" block — those are skipped when reading a wishlist.
  var cid = function (e) { var c = e.className; if (c && c.baseVal !== undefined) c = c.baseVal; return String(c || '') + ' ' + (e.id || ''); };
  var inRecs = function (el) { for (var e = el; e && e !== document.body; e = e.parentElement) { if (/recommend|related|you-?may|also-?like|cross-?sell|upsell|recently-?viewed|trending|bestsell|complete-the-look|similar|carousel/i.test(cid(e))) return true; } return false; };
  // Build the full PakPoshak link and hand it to Open URLs (one completion() call).
  var finish = function (list) {
    var seen = {}, urls = [];
    (list || []).forEach(function (u) { if (u && !seen[u]) { seen[u] = 1; urls.push(u); } });
    completion('https://pakposhak.github.io/order-form.html?cart=' + encodeURIComponent(urls.join('\n')));
  };

  // A) Scrape the CART PAGE — works on EVERY platform with no network call. Real
  //    line-items have a quantity control next to a product link; recommendation
  //    carousels don't, so they're skipped. (Open the cart/bag page before sharing.)
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

  // A2) WISHLIST page — product links inside a wishlist-scoped container (Swym,
  //     Growave, theme-native ?view=wishlist, SFCC). Recommendation carousels and the
  //     header "Wishlist" page link are excluded. Open your ♡ wishlist page, then share.
  try {
    var wl = [];
    document.querySelectorAll(
      '[class*="wishlist" i],[id*="wishlist" i],[class*="wish-list" i],[class*="favourite" i],[class*="favorite" i],[class*="swym" i],[id*="swym" i],[class*="growave" i],[class*="saved-item" i],[data-wishlist],[data-swym-product-id]'
    ).forEach(function (sc) {
      if (sc === document.body || sc === document.documentElement) return;   // too broad to trust
      sc.querySelectorAll('a[href]').forEach(function (a) {
        var h = a.getAttribute('href');
        if (isProd(h) && !inRecs(a)) { var u = abs(h); if (u) wl.push(u); }
      });
    });
    if (wl.length) { finish(wl); return; }
  } catch (e) {}

  // B) Shopify fallback — read the cart JSON (lets it work from any page too). Build
  //    each link from handle+variant_id so a /en-us/ Markets prefix can't break it.
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

  // C) Fallback: the current page (single item).
  finish([location.href]);
})();
```

How the customer uses it (uniform on every brand):
> **Cart:** add items to the brand's cart → open the **cart / bag page** → tap **Share → Send to PakPoshak**.
> **Wishlist:** tap the brand's **♡ / Wishlist** so the saved items are on screen → tap **Share → Send to PakPoshak**.

The order form then adds one item per cart line / wishlist item (validated, de-duped, capped
at 40), each resolving its real PKR price exactly like a single share. The cart half is
verified end-to-end on the order-form side with live products from Lawrencepur, ETHNC, Gul
Ahmed, Edenrobe, Beechtree, Cross Stitch and Sapphire (real prices, including a `/en-us/`
locale-prefixed URL). The wishlist half reuses the **same** `?cart=` order-form path, so once
a wishlist page yields product links they resolve identically — it needs a real-device pass
on a logged-in wishlist to confirm each brand's wishlist markup (see Coverage below).

> **Why "open the cart/wishlist page first":** on that page the script reads the items
> straight from the screen (strategies A / A2 — no network call), which works identically on
> every platform. The Shopify `cart.js` read (strategy B) is only a fallback for when you
> share from some other page. Being on the cart or wishlist page is the reliable habit.

### Coverage (cart tested 2026-06-24; wishlist census 2026-06-24)

| Platform | Brands (sample) | Whole cart | Wishlist |
|---|---|---|---|
| Shopify (most of the catalog) | Lawrencepur, ETHNC, Mina Hasan, Bonanza, Sana Safinaz, Gul Ahmed, Limelight, Edenrobe, Maria B, Cross Stitch | ✅ cart page (or `cart.js` fallback) | ✅ wishlist page (when the brand has one) |
| Salesforce Commerce Cloud | Khaadi, Sapphire | ✅ scrapes the **cart page** | ✅ native wishlist page (DOM scrape) |
| Custom marketplace | LAAM | ⚠️ no readable cart → single product | ⚠️ depends on markup |

> **Wishlist availability (census of 147 brands, 2026-06-24):** a homepage/`/pages/wishlist`
> probe found a wishlist on **≥63 brands** (a *lower bound* — the probe can't see JS-injected
> wishlists like Growave, so several "no" brands actually have one, e.g. Al-Deebaj). Wishlist
> **page URLs vary** by theme — `/pages/wishlist`, `/pages/wish-list`, `/search/?view=wishlist`,
> `/apps/wishlist` (Growave), `/wishlist` (Khaadi/SFCC) — which is exactly why the reader scrapes
> the rendered page DOM instead of relying on a fixed URL. There is **no universal "paste a
> wishlist link" path**: wishlists render client-side and are tied to the shopper's session, so
> the items must be read **on the page** (the Shortcut/bookmarklet), the same as whole-cart.

> **Lawrencepur note:** it's Shopify and its `cart.js` returns PKR (the USD on screen is
> just a currency selector). Whole-cart works. If it ever doesn't, it's the Shortcut step,
> not the order form — verified that a Lawrencepur `?cart=` builds the drafts with prices.

### Diagnostic — see what the cart/wishlist script built

If a brand's cart or wishlist "doesn't fetch," see what the script produced: in the Shortcut,
drag a **Quick Look** action **between Run JavaScript on Web Page and Open URLs**, then run it
from the brand's **cart page** (or **wishlist page**). It shows the final link:
- `…/order-form.html?cart=https%3A%2F%2F…%2Fproducts%2F…` with one or more product paths
  inside → good (those become order items);
- `…?cart=` ending in the **cart/wishlist page URL** (e.g. `…%2Fcart`, `…%2Fwishlist`) with no
  `/products/` inside → the items weren't read on that brand (often: not on the cart/wishlist
  page, the wishlist was empty, or its markup differs). Send that text or a screenshot and it
  gets tuned (the wishlist selector list can be widened per brand).
Remove the Quick Look action once confirmed.

## Part B — Android (nothing to build)

Already works once the customer **installs PakPoshak** (the "Add to home screen" /
install prompt). After install, PakPoshak appears in the phone's **Share** menu:

> On a brand product page → tap **Share** → **PakPoshak** → order form opens with the item.

## Part C — Desktop (Chrome / Firefox / Edge / Safari)

Desktop uses a **bookmarklet** — a one-click button on the bookmarks bar. Install page:
**`desktop-cart.html`** (`https://pakposhak.github.io/desktop-cart.html`).

- It shows a **"📥 Send to PakPoshak"** button to **drag onto the bookmarks bar**
  (one-time), plus a copy-paste fallback for Safari.
- Then: on a brand's **cart page** *or* **♡ wishlist page**, click the bookmark → the
  PakPoshak order form opens with every item. Same reading logic as the iPhone Shortcut
  (cart-page DOM → wishlist-page DOM → Shopify `cart.js` → single page), and the
  single-product paste still works as before.
- The bookmarklet was verified to parse and to pull cart line-items and wishlist items
  (skipping recommendation carousels, preserving the SFCC `?dwvar_size=`).

> A bookmarklet can only be **clicked from the bookmarks bar**, not pasted into the address
> bar (browsers strip `javascript:` there). The install page handles the drag/paste setup.

**Android Chrome (staff-grade):** the *same* bookmarklet works on Android — once it runs it
auto-loads the order form exactly like desktop; only the trigger is fiddly. Setup is on the
install page ("On an Android phone" section): Copy the code → bookmark any page → edit it →
Name `sendcart`, URL = the code (must start with `javascript:`). To run: on the cart **or
wishlist** page, type `sendcart` in the address bar and tap the **bookmark** suggestion (not a
search result). Too fiddly for shoppers — keep it for you/staff; customer-grade Android
whole-cart/wishlist = the app.

---

## Customer-facing copy (paste into WhatsApp / a help card)

**iPhone:**
> One-time setup: tap this link → **Add Shortcut** → done.
> Then to order: on any brand's product page, tap **Share** → **Add to PakPoshak**. ✅
> *[attach the iCloud Shortcut link]*

**Android:**
> One-time setup: open pakposhak.github.io → tap **Install / Add to Home screen**.
> Then to order: on any brand's product page, tap **Share** → **PakPoshak**. ✅

Both replace the old copy-the-link / paste-the-link steps. Pasting still works as a fallback.

---

## Notes / limitations
- Only **supported brands** are accepted (the `isKnownBrand` allowlist) — same as paste.
- The link is **online-only at the moment of sharing** (you're on the brand's site, so
  you're online). Offline it degrades gracefully — the item is captured, price fills in
  when back online.
- iOS share-from-Shortcut opens the order form in **Safari** (a normal tab); the buyer
  does *not* need the PWA installed for capture to work — "Add to Home" just gives them
  the app icon + standalone feel.
