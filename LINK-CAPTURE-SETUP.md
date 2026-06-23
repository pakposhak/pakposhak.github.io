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

## Part A2 — iPhone "Send whole cart" Shortcut (Shopify brands)

Same idea as Part A, but instead of one product it grabs **every item in the brand's
cart** in one tap. It works by running a tiny script on the brand page that reads the
store's `/cart.js` (the live cart), then opens the order form with all the links.

Build a second shortcut named **Send cart to PakPoshak**, with these actions:

| # | Action | Set it to |
|---|---|---|
| 1 | **Receive** | Receive **Safari web pages** from **Share Sheet**. If no input → **Stop** |
| 2 | **Run JavaScript on Web Page** | paste the script below |
| 3 | **URL Encode** | Mode = **Encode**, input = the **JavaScript Result** |
| 4 | **Text** | `https://pakposhak.github.io/order-form.html?cart=` then insert the **URL Encoded** variable right after `=` |
| 5 | **Open URLs** | input = the **Text** |

Script for action 2:

```javascript
(async () => {
  try {
    const res = await fetch('/cart.js', { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const cart = await res.json();
      const urls = (cart.items || []).map(i => location.origin + i.url);
      if (urls.length) { completion(urls.join('\n')); return; }
    }
  } catch (e) {}
  completion(location.href);   // not Shopify / empty cart → fall back to this page
})();
```

How the customer uses it: add items to the brand's cart, then from **any page on that
brand site** tap **Share → Send cart to PakPoshak**. The order form opens with every
cart item added. (`/cart.js` is the session cart, so they don't have to be on the cart
page — any page of that brand works.)

> **Shopify-only.** This reads `/cart.js`, which **Khaadi and Sapphire (Salesforce
> Commerce Cloud) don't have**. On those, the script falls back to sending the *current
> page* as a single item — so the customer uses the normal one-product **Add to
> PakPoshak** shortcut there instead. Whole-cart for SFCC brands is a later add-on.
> The order form caps a single `?cart=` at 40 items as a safety limit.

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
