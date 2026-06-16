# PakiPoshak — Claude Project Brief
> Renamed from "PakStyle BD" → **PakiPoshak** (final). Live URL moved to a root user-site: `pakiposhak.github.io`.

## What this is
Pakistani fashion import order form for Bangladeshi buyers. Customers paste Shopify product URLs,
build a cart, and submit — Danish (operator) purchases & ships from Pakistan to Bangladesh.

- **Live site:** https://pakiposhak.github.io/  (root user-site)
- **GitHub repo:** https://github.com/pakiposhak/pakiposhak.github.io
- **Master file:** `order-form.html` (always sync to `index.html` before pushing)
- **No build step** — pure HTML/JS/CSS, no frameworks, no npm

## About the operator
- **Danish Wazir**, Dhaka, Bangladesh
- Business name: **Moors Attire / PakiPoshak** · Email: collectionmoors@gmail.com
- Also runs iGarage (automobile startup) and DW-Bridging (textile indenting)
- Commission tiers are business-sensitive — **never expose to buyers**

---

## Git workflow (every change)
```
1. Edit order-form.html
2. cp order-form.html index.html
3. git add order-form.html index.html [any other changed files]
4. git commit -m "short description"
5. git fetch origin
6. git push origin main --force
```
GitHub Pages has 1–3 min CDN propagation. Hard-refresh with Ctrl+Shift+R to bypass cache.

---

## File map
| File | Purpose |
|---|---|
| `order-form.html` | Master — full order form, admin panel, all JS logic |
| `index.html` | Synced copy of order-form.html (GitHub Pages homepage) |
| `weight-chart.html` | Standalone weight reference page for customers |
| `order-aggregator.html` | Groups paid orders by brand for bulk purchasing |
| `google-apps-script.gs` | Apps Script — order intake + payment slip handler |
| `bulk-ordering-playbook.md` | How to turn customer orders into brand bulk orders |
| `wholesale-outreach.md` | Ready-to-send wholesale inquiry email templates |
| `CLAUDE.md` | This file — project brief for new Claude sessions |

---

## Key JS constants (order-form.html ~line 750)
```js
SHEET_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzJ_HQD2NdyFNk2wSBpR-8KzuXT_wqTIipOFWM8HD4R-Q_EHvTOM1leyJ2MvBxfZA/exec'
WEB3FORMS_KEY    = ''          // not in use
FORMSPREE_URL    = 'https://formspree.io/f/xnjypzyl'   // fallback only
TRANS_FEE        = 100         // BDT flat fee per order
```

---

## localStorage keys
| Key | Default | Purpose |
|---|---|---|
| `psb_conv` | 0.42 | PKR → BDT conversion rate |
| `psb_log` | 1600 | Logistics rate (BDT/kg) |
| `psb_usd_pkr` | 278 | USD → PKR rate |
| `psb_comm_1` | 20 | Commission % for 1 item |
| `psb_comm_23` | 18 | Commission % for 2–3 items |
| `psb_comm_4p` | 15 | Commission % for 4+ items |
| `psb_weights` | {} | Admin-overridden weights (JSON object) |
| `psb_cart` | [] | Cart persistence across page refresh |
| `psb_buyer` | {} | Remember Me — buyer name/WA/email/address |

---

## Pricing & commission logic (CRITICAL — do not change without Danish's approval)
- Commission is **hidden from buyers** — never show it in buyer-facing UI
- Tiers by number of items in cart:
  - 1 item → **20%** commission on product subtotal
  - 2–3 items → **18%** commission
  - 4+ items → **15%** commission
- Logistics: BDT 1,600/kg (admin-editable)
- Transaction fee: BDT 100 flat per order
- **Bug:** `getRates()` currently hardcodes `COMM_RATE: 0.10` — does not use tiers yet

---

## Weight system
All weights include ~20% packaging buffer.

### DEFAULT_WEIGHTS (~line 854)
```
Women — Casual/Everyday:
  kurti_1pc         0.34 kg
  kaftan            0.58 kg   (1pc long shirt, +70% vs kurti)
  shirt_dupatta_2pc 0.46 kg
  shirt_trouser_2pc 0.58 kg
  lawn_3pc_unstitch 0.66 kg
  pret_3pc          0.74 kg

Women — Winter:
  winter_2pc        0.70 kg
  winter_3pc        0.90 kg

Women — Formal:
  formal_emb_2pc    0.86 kg
  formal_emb_3pc    1.08 kg
  heavy_formal_3pc  1.32 kg
  bridal            2.00 kg

Separates:
  dupatta_only      0.22 kg
  shawl             0.56 kg   (incl. 25% buffer)
  accessories       0.24 kg

Men (all incl. 20% buffer):
  mens_kurta        0.54 kg
  mens_shalwar_kameez 0.86 kg
  mens_waistcoat    0.48 kg
  mens_suit         1.38 kg
  mens_sherwani     1.74 kg
  mens_unstitched   0.96 kg
```

---

## Admin panel
- **Access:** append `?admin` to URL, or press **Ctrl+Shift+A**
- **Location:** HTML lines ~672–725, JS ~809–943
- **Fields:** PKR→BDT rate, Logistics rate, USD→PKR rate, Commission note
- **Weight editor:** `buildWeightEditor()` populates `#weightEditorGrid`
- **Save rates:** `saveRates()` → localStorage
- **Save weights:** `saveWeights()` → `psb_weights`
- **Reset weights:** `resetWeights()` → clears `psb_weights`, rebuilds grid

---

## Product fetching
- Shopify `/products/{handle}.js` endpoint (preferred — has per-variant stock + prices in paisa×100)
- `moneyOf()` converts paisa ÷ 100 → BDT
- 14-second timeout
- Shows in-stock size chips only; sold-out and no-size warnings shown

---

## Category & gender detection
- `detectGender(url, product)` → 'men' / 'women' / 'kids'
  - Uses BRANDS array brand category ('m'=men, 'w'/'p'=women), then URL path, then product type/tags
- `detectCategory(url)` → instant URL-based detection (men's branch checked first)
- `UNSTITCHED_CATS` — keys that skip the size field
- `MENS_CATS` — Set of all men's category keys

---

## Brand directory
- ~93 brands in `BRANDS` array
- `renderBrandDirectory()` + `onBrandSearch()` — search + dropdown
- **Search fix (do not revert):** `dd.style.display = 'block'` — NOT `''` (CSS default is `display:none`)

---

## Order submission flow
1. Customer fills form → Submit
2. JS POSTs JSON to `SHEET_SCRIPT_URL`
3. Apps Script: appends row to "Order Tracker" sheet + emails collectionmoors@gmail.com
4. Customer gets order ID → uploads payment slip on success page
5. Slip → Drive folder "PakStyle Payment Slips", row status → `payment_received`

## Payment methods (hardcoded in hidden form, line ~741)
- bKash: **01352018131**
- bKash/Nagad/Upay/Rocket Send Money: **01851948690**
- City Bank – Moors Attire A/C: **1324897775001**
- UCBL – Moors Attire A/C: **7862141003465221**

---

## Critical bugs fixed this session — DO NOT re-introduce
| # | Bug | Fix |
|---|---|---|
| 1 | Cart not restoring after refresh | `loadCartFromStorage()` must be called at **end of script** after `let cart` is declared (TDZ) |
| 2 | Search dropdown invisible | `dd.style.display = 'block'` not `''` |
| 3 | Size false-positive (e.g. "s26b4569" read as size S) | `detectSizeFromUrl` only accepts `?size=` params or delimited tokens — not handle substrings |
| 4 | Men's kurta mis-detected as women's 3pc pret | `detectGender()` runs first; men's category branch checked before women's |
| 5 | Admin panel crashes entire script | `?admin` auto-open fires at **end of script** (DEFAULT_WEIGHTS is in TDZ if called early) |

---

## Website → App conversion plan (mobile-first, low-cost, Bangladesh-first)
Goal: professional mobile website where brand links open in-app, packageable as Android + iPhone apps cheaply.

- [x] **Phase 1 — Mobile redesign** (commit `b7494df`): sticky header, "how it works" strip, bottom nav, in-app brand browser (iframe overlay via `openBrandInApp`), live cart badges (`updateCartBadges`), `manifest.json`.
- [x] **Phase 2 — True installable PWA**: created app icons (`icon-192.png`, `icon-512.png`, `apple-touch-icon.png` — gold "PB" monogram on navy, maskable-safe); added `sw.js` (service worker) + registration at end of body; `apple-touch-icon` now points to 180px file.
  - **SW strategy (do NOT make it cache HTML):** page is **network-first** (fresh build always wins; cache is offline fallback only) to preserve the no-cache requirement that fixed stale-build complaints. Static assets cache-first. Cross-origin (Shopify, Apps Script, Formspree) is **never intercepted**. Bump `CACHE_VERSION` in sw.js when an icon changes.
  - Icons generated from `icon.svg` via sharp (temp dir) — no Python/ImageMagick on this machine; Node only.
  - **Still to verify on live HTTPS:** actual "Install app" / "Add to Home Screen" prompt (needs GitHub Pages HTTPS, not file://).
- [ ] **Phase 3 — Professional polish**: loading/empty states, form validation, "How it works" page, trust signals (payments/delivery).
- [ ] **Phase 4 — Android app (~$25 one-time)**: wrap PWA as TWA via PWABuilder; Danish creates Play Console acct + uploads.
- [ ] **Phase 5 — iPhone**: free via PWA "Add to Home Screen" (works after Phase 2); App Store optional ($99/yr + Mac).

## Pending issues (update each session)
- [x] **Browse UX overhaul (build 2026-06-17a, commit 5bd9a13)** — 10 items: price filter multi-select + 2-row mobile; "not everything here" notice; women-first + brand round-robin default order; how-to new section; Paste tab hidden on Products grid; bottom-nav Brands link fixed; sold-out guard on Save; category filter = collapsible Women/Men/Kids from `CAT_TREE` (accessories removed, heading "Product Category"); brand search beside the Brands heading; Browse Brands "Store Types | Product Category" sub-tabs (catalog-derived brand chips). See memory `browse-products.md` (2026-06-17a batch).
- [x] **Commission calc wired** — `getRates()` now returns `COMM_1/COMM_23/COMM_4P`; `commRate(r, itemCount)` picks the right tier; applied in `renderCart`, `buildReviewSummary`, `submitOrder`
- [x] **Admin weight chart** — fixed by adding `overflow-y:auto;max-height:85vh` to `#adminPanel` (panel was fixed at bottom, content overflowed off-screen)
- [x] **Commission field** — split into 3 numeric inputs (`adm_comm_1/23/4p`), saved to `psb_comm_1/23/4p` in localStorage

---

## How to start a new Claude session efficiently

**Step 1 — Opening prompt:**
> "Read CLAUDE.md first for full project context. Then read order-form.html lines [X–Y]. Task: [specific thing]."

**Step 2 — Always give line ranges.** The file is large. Never say "read the whole file."

**Step 3 — One task per session.** Finish one bug or feature before starting another.

**Step 4 — Update this file.** At end of session, update the "Pending issues" section.

### Line range quick-reference
| Area | Lines |
|---|---|
| Admin panel HTML | 672–725 |
| Config constants + getRates() | 744–767 |
| openAdminPanel() + saveRates() | 809–847 |
| DEFAULT_WEIGHTS + WEIGHT_LABELS | 854–901 |
| buildWeightEditor() + saveWeights() | 911–943 |
| detectGender() + detectCategory() | ~1050–1120 |
| BRANDS array | ~1150–1250 |
| Cart / order submission | ~1300–1450 |
