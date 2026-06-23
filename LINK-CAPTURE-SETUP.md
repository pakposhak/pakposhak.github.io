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

## Part A2 — iPhone "Send whole cart" Shortcut (all brands)

Same idea as Part A, but instead of one product it grabs **every item in the brand's
cart** in one tap. The script builds the whole PakPoshak link itself, so the Shortcut is
only **3 actions** (no fragile URL-Encode/Text wiring to get wrong). **Open the brand's
cart/bag page first, then Share** — that one habit makes it work the same on every brand.

Build a second shortcut named **Send cart to PakPoshak**, with these actions:

| # | Action | Set it to |
|---|---|---|
| 1 | **Receive** | Receive **Safari web pages** from **Share Sheet**. If no input → **Stop** |
| 2 | **Run JavaScript on Web Page** | paste the script below |
| 3 | **Open URLs** | input = the **JavaScript Result** |

Self-contained script for action 2 — reads the cart, builds the full PakPoshak link, and
hands it straight to **Open URLs**. Works on Shopify, Khaadi/Sapphire (SFCC), and custom:

```javascript
(async () => {
  var origin = location.origin;
  var abs = function (h) { try { var u = new URL(h, origin); u.hash = ''; return u.href; } catch (e) { return null; } };
  var isProd = function (h) { try { var p = new URL(h, origin).pathname; return /\.html$/i.test(p) || /\/products?\//i.test(p); } catch (e) { return false; } };
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
> Add items to the brand's cart → open the **cart / bag page** → tap **Share → Send cart
> to PakPoshak**.

The order form then adds one item per cart line (validated, de-duped, capped at 40), each
resolving its real PKR price exactly like a single share. Verified end-to-end on the
order-form side with live products from Lawrencepur, ETHNC, Gul Ahmed, Edenrobe, Beechtree,
Cross Stitch and Sapphire (real prices, including a `/en-us/` locale-prefixed URL).

> **Why "open the cart page first":** on the cart page the script reads the line-items
> straight from the screen (strategy A — no network call), which works identically on every
> platform. The Shopify `cart.js` read (strategy B) is only a fallback for when you share
> from some other page. Being on the cart page is the reliable habit.

### Coverage by platform (tested 2026-06-24)

| Platform | Brands (sample) | Whole cart |
|---|---|---|
| Shopify (most of the catalog) | Lawrencepur, ETHNC, Mina Hasan, Bonanza, Sana Safinaz, Gul Ahmed, Limelight, Nishat Linen, Asim Jofa, Edenrobe, Beechtree, Maria B, Cross Stitch | ✅ cart page (or `cart.js` fallback) |
| Salesforce Commerce Cloud | Khaadi, Sapphire | ✅ scrapes the **cart page** |
| Custom marketplace | LAAM | ⚠️ no readable cart → sends the single product you're on |

> **Lawrencepur note:** it's Shopify and its `cart.js` returns PKR (the USD on screen is
> just a currency selector). Whole-cart works. If it ever doesn't, it's the Shortcut step,
> not the order form — verified that a Lawrencepur `?cart=` builds the drafts with prices.
> `?cart=` was confirmed across Lawrencepur, Gul Ahmed, Edenrobe, Beechtree, Cross Stitch
> and Sapphire, all resolving real prices.

### Diagnostic — see what the cart script built

If a brand's cart "doesn't fetch," see what the script produced: in the Shortcut, drag a
**Quick Look** action **between Run JavaScript on Web Page and Open URLs**, then run it from
the brand's **cart page**. It shows the final link:
- `…/order-form.html?cart=https%3A%2F%2F…%2Fproducts%2F…` with one or more product paths
  inside → good (those become order items);
- `…?cart=` ending in the **cart page URL** (e.g. `…%2Fcart`) with no `/products/` inside →
  the cart wasn't read on that brand (often: not on the cart page, or its markup differs).
  Send that text or a screenshot of the cart page and it gets tuned.
Remove the Quick Look action once confirmed.

## Part B — Android (nothing to build)

Already works once the customer **installs PakPoshak** (the "Add to home screen" /
install prompt). After install, PakPoshak appears in the phone's **Share** menu:

> On a brand product page → tap **Share** → **PakPoshak** → order form opens with the item.

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
