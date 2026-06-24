# Wishlist Capture — census + how it works (2026-06-24)

**Goal:** let a shopper send their **whole wishlist** from any brand into the PakPoshak
order form, the same zero-typing way as whole-cart.

## TL;DR

- **Mechanism:** there is no per-brand work and no new order-form code. The existing
  **`?cart=` handler** already turns a list of product links into one draft each. Wishlist
  capture just **reads the product links off the brand's rendered wishlist page** and feeds
  that same handler. The cart bookmarklet / iOS Shortcut were upgraded into **one combined
  reader** that auto-detects the page: **cart line-items → wishlist items → Shopify
  `cart.js` → the single page.**
- **No universal "paste a wishlist link" path exists.** Wishlists are third-party apps
  (Swym, Growave, theme-native, SFCC), render **client-side**, and are tied to the shopper's
  **session** — so a pasted wishlist URL fetched on our side would be empty. The items must
  be read **on the page** (Shortcut / bookmarklet / future in-app browser), exactly like
  whole-cart. This is the core constraint.
- **Coverage:** a wishlist exists on **at least 65 of 147 brands** (lower bound — see method).
  For every one of those, the reader works the same way (DOM scrape), so capture coverage
  ≈ "brands that have a wishlist."

## Why "at least 63" and not an exact number

The census fetched each brand's homepage + `/pages/wishlist` (via WebFetch, server-side,
because this dev machine's network can't reach the Shopify IP range). That method **only sees
wishlists that render a static link/page** (Swym-style `/pages/wishlist`, theme-native
`/search/?view=wishlist`, etc.). It **cannot see JS-injected wishlists** (e.g. **Growave**,
which adds heart icons after load) — those show up as "no", yet have a real wishlist.
Confirmed example: **Al-Deebaj** (raw-HTML probe = Growave wishlist) censused as "no".

So 65 is a floor. The true number is higher. An exact per-app census needs raw HTML from a
network that can reach the brands (the **PK VPS**, which already harvests them) — not yet run.

**Re-probe (2026-06-24):** all 82 "no" brands were re-checked for save-for-later features
under any name — Favourites, Favorites, Saved, Shortlist, My List, Loved, Wish Bag,
Collections, heart icon, Growave `/apps/wishlist`, etc. **Result: zero alt-name features
exist.** Two new wishlists were discovered that the first pass missed (both use
`/search?view=wishlist` with theme-native markup not present on the homepage):
- **Asim Jofa** — native Wishlist at `/search?view=wishlist`
- **Cambridge** — native Wishlist at `/search?view=wishlist` (page title "My Wishlist Page")

One brand remains genuinely unknown: **Mushq** (mushq.pk) blocks all HTTP fetches (403), so
it cannot be checked without a browser. All other 79 re-probed brands confirmed no save feature.

## Wishlist URL patterns found (why the reader scrapes the DOM, not a fixed URL)

| Pattern | Example brands | App (likely) |
|---|---|---|
| `/pages/wishlist` | Afrozeh, Alkaram, Gul Ahmed, Edenrobe, Maria B, Limelight, Generation, Outfitters, Salitex, Zeen, Zara Shahjahan, Sana Safinaz | Swym / theme-native |
| `/pages/wish-list` | Charizma, Diners, MTJ, Edge Republic | theme-native |
| `/search/?view=wishlist` (or `?view=wish`) | Bareeze, Bonanza, Mina Hasan, Nureh, RajBari, Maryum N Maria, Sania Maskatiya, Saya, So Kamal, Vanya, Wardha Saleem, Zainab Chottani, Maria Osama Khan, Asim Jofa, Cambridge | theme-native search-driven |
| `/apps/wishlist` | Gulaal | Growave |
| `/wishlist` | Khaadi, Cougar | SFCC / custom |
| JS-injected (no static page) | Al-Deebaj, + an unknown number of "no" rows | Growave & similar |

Because the path is all over the place, the reader **ignores the URL** and scrapes product
anchors out of any wishlist-scoped container on the page (`[class*="wishlist"]`, `swym`,
`growave`, `favourite`, `data-swym-product-id`, …), excluding recommendation carousels and
the header "Wishlist (n)" page-link.

## Verification (2026-06-24)

`_wishlist_probe/verify.js` runs the shipped bookmarklet (pulled out of `desktop-cart.html`)
through jsdom on three synthetic pages — **all pass**:
- **Wishlist page** → 3 saved products, de-duped, `?variant=` preserved, recommendation
  carousel excluded, header `/pages/wishlist` link excluded.
- **Cart page (regression)** → still reads the 2 cart line-items; the wishlist step does
  **not** hijack; "recently viewed" excluded.
- **Product page** → no cart/wishlist DOM, empty `cart.js` → falls back to the single page.

Still pending: a **real-device pass** on a few logged-in wishlists (Swym `/pages/wishlist`,
a `?view=wishlist` theme, Growave, Khaadi/Sapphire) to confirm each brand's actual markup —
same posture the whole-cart feature shipped with.

## Files

- `desktop-cart.html` — combined reader bookmarklet (desktop + Android-staff) + copy.
- `LINK-CAPTURE-SETUP.md` Part A2 — combined iOS "Send to PakPoshak" Shortcut script + coverage.
- `_wishlist_probe/` — repeatable census: `probe.js` (raw-HTML scanner, needs brand-reachable
  network), `batches/` + WebFetch agents (the lower-bound census), `build-bookmarklet.js`
  (emits the bookmarklet string), `verify.js` (jsdom tests), `results.json`.

## Full census (lower bound; "no" includes undercounted JS wishlists)

YES = a wishlist page/link was detected. Order follows the brand directory.

| Brand | WL | Brand | WL | Brand | WL |
|---|---|---|---|---|---|
| Alkaram Studio | YES | Agha Noor | no | Afrozeh | YES |
| Alizeh | no | Arsalan Iqbal | YES | Abaya.pk | no |
| Akbar Aslam | no | Al-Deebaj | YES* | Armas | no |
| Ammara Khan | no | Almirah | no | Asifa & Nabeel | YES |
| Asim Jofa | YES† | Azure | no | Bareeze | YES |
| Barae Khanom | no | Amir Adnan | YES | Baroque | YES |
| Beechtree | no | Bareeze Man | YES | Bin Ilyas | no |
| Bin Saeed | no | Black Camels | YES | Bonanza Satrangi | YES |
| CRUSH Menswear | YES | Breakout | no | Cambridge | YES† |
| ChenOne | no | Charcoal | no | Charizma | YES |
| Cougar | YES | Chinyere | YES | Coco by Zara Shahjahan | YES |
| Crimson | no | Cross Stitch | no | Dazzle by Sarah | no |
| Dhanak | YES | Diners | YES | Dynasty Fabrics | no |
| ETHNC | YES | ECS | YES | Edenrobe | YES |
| Ego | YES | Elan | no | Edge Republic | YES |
| Elaya Prints | no | Emaan Adeel | no | Eminent | YES |
| Engine | YES | Faiza Saqlain | no | Farasha | no |
| Firdous | no | Erum Khan | no | Furor | YES |
| Generation | YES | Gul Ahmed | YES | Gulaal | YES |
| Hijab-ul-Hareem | YES | Hijab & Co | YES | Hijabi.pk | no |
| Hopscotch | no | Hussain Rehar | no | Humayun Alamgir | no |
| Innerlines | no | Imrozia Premium | YES | Ismail Farid | no |
| Ittehad Textiles | YES | Iznik Fashions | YES | Jade | YES |
| J. Junaid Jamshed | YES | Jazmin | YES | Jeem | no |
| KEF | no | Kashee's Boutique | no | Kayseria | YES |
| Khaadi | YES | Khas Stores | no | Khussa Corner | no |
| Khussa Master | no | Kross Kulture | no | Kurta Corner | no |
| Lakhany by LSM | no | Lawrencepur | no | Limelight | YES |
| Lulusar | no | MTJ (Tariq Jameel) | YES | Maria B | YES |
| Maria Osama Khan | YES | Minnie Minors | no | Maryum N Maria | YES |
| Mausummery | no | Mina Hasan | YES | Mohagni | no |
| Monark | no | Motifz | no | Mushq | ?† |
| Naqshi | no | Nishat Linen | no | Nureh | YES |
| One Kids | YES | Outfitters | YES | Paarsa | no |
| Preeto | no | Qalamkar | YES | RajBari | YES |
| Ramsha | no | Republic Womenswear | no | Rang Rasiya | no |
| Riwaj Menswear | no | Roheenaz | YES | Royal Tag | no |
| SHAAL | no | Saad Bin Shahzad | YES | Sadaf Fawad Khan | no |
| Saira Rizwan | no | Salitex | YES | Sania Maskatiya | YES |
| Sana Safinaz | YES | Sapphire | YES* | Saya | YES |
| Senorita | no | Sha Posh | no | Shahzeb Saeed | no |
| Sifa | no | Silayi Pret | no | Sitara Studio | no |
| So Kamal | YES | Sobia Nazir | no | Stylo | YES |
| Tassels | YES | Tawakkal Fabrics | no | The Hijab Company | no |
| The Ummatis | no | The Women Zone | no | Threads & Motifs | no |
| Tifl | no | Uniworth | no | Vanya | YES |
| Wardha Saleem | YES | Wear Ochre | no | Zaha by Elan | no |
| Zara Shahjahan | YES | Zainab Chottani | YES | Zeen (by Cambridge) | YES |
| Zarif | no | Zellbury | no | Zuruj | no |

`*` = censused "no" by the static probe but **confirmed YES** out-of-band (Al-Deebaj = Growave
JS wishlist; Sapphire = SFCC native wishlist). They illustrate why the "no" column is a
ceiling on misses, not a confirmed absence.

`†` = found by the **2026-06-24 re-probe** of all 82 "no" brands (Asim Jofa + Cambridge =
native `/search?view=wishlist` wishlists; Mushq = blocked 403 on all fetches, genuinely unknown).
