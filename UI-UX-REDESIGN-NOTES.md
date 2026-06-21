# PakiPoshak — Landing / Browse-Products UI-UX Redesign (spec for LATER implementation)

**Captured 2026-06-19. NOT yet implemented — Danish wants to see mockups first, then we build.**
**Core problem to solve:** new visitors open the page and *don't know what it is* — the first mobile view (above the fold, no scrolling) must SHOW PRODUCTS, not chrome/instructions.

Current live build at capture time: `2026-06-18o`. Default tab = Browse Products.

---

## Danish's explicit instructions (verbatim intent)

**i. Move the 1·2·3·4 step indicator into the bottom bar.**
- The `1·2·3·4` steps = the checkout progress bar at the top: `step1 Add Items › step2 My Details › step3 Review › step4 Payment` (`.steps-bar`, order-form.html ~L823).
- Remove it from the top; put it in the **centre of the fixed bottom bar** (`.bottom-nav`, ~L1409).
- The bottom bar currently has 4 icons: Home · Brands · Cart · How-To. **Remove `Brands` and `How-To`** from the bottom bar.
- New bottom bar ≈ `[🏠 Home]  [1 › 2 › 3 › 4 steps]  [🛒 Cart]`.
- Removing the top steps-bar reclaims vertical space → products show sooner. (Desktop already flanks the steps with How-To + Cart via `.steps-aux`; mobile should mirror that into the bottom bar.)

**ii. Fold the counts line INTO the search bar.**
- Remove the `.ps-note` line: `12,000+ products · 80+ brands — want more? Browse by brands →` (~L899-902).
- Put the counts inside the search placeholder: **`🔍 Search 12,000+ products, 80+ brands`**.
- The `want more? Browse by brands →` clickable link: **remove the click** — either drop it, or merge into the search-bar copy with no link.

**iii. Remove the "3 ways to search products" heading.**
- Remove `.ps-rail-head` (`3 ways to search products`, ~L909).
- The **Price filter (no heading)** moves to **just above the product listing** — on the same row as the total-products count, and below "clear filters".

**iv. New stacking order + compact filters.**
- Order after search bar: **Product Category → Brands → Price filter → listing**.
- Price filter must take **less space** — share the same row as the products-total count (the `.ps-resbar`, ~L925).

**v. "Clear filters" must not take a full row.**
- Currently `.ps-clear` (~L922) is a full-width row. Place it **smartly alongside the price filter** (same compact row as count + price).

**vi. Shorten the "Add Products to Your Order" wording.**
- Current (`url_label`, ~L939): `📋 Copy a product link from any brand site and paste it below — or use the side 📋 Paste tab:`
- Danish's suggested shorter copy: **"Need only your product webpage link — paste it here or tap the side bar after copying."**
- Constraint: keep it to **2 rows, not 3**. (i18n key `url_label`; also update BN.)

---

## Three first-view layouts to choose from (mobile, above the fold)

**View 1 — Stacked (Danish's detailed spec above).**
Header → slim how-it-works line → Browse tabs → search (counts inside) → category chips → brand chips → compact results bar (count + price + clear) → 2-col product grid. Bottom bar = Home · 1·2·3·4 steps · Cart.

**View 2 — Left rail / side separation (Danish asked to see this).**
Search bar full width on top, then split: LEFT vertical rail = Categories + Brands; RIGHT = product grid. Filters always visible; trade-off = products get less width on a phone.

**View 3 — Products-first + bottom-sheet filters (Claude's suggestion).**
One-line value prop ("Any Pakistani brand → delivered to Bangladesh"), **products/brands toggle kept**, search (counts inside), a single row of scrolling category chips + a "Filters" button that opens a bottom sheet (price/brand/sort/sale/new). Big 2-col product grid dominates. Persistent "Can't find it? Browse all 155 brands →" under the grid. Daraz/Meesho/AliExpress pattern.

**View 4 — V3 + visible Sort/Sale/New (Danish likes the toggle; wants these surfaced). RECOMMENDED.**
Same as View 3 (toggle kept, products-first, Filters button, browse-all-brands route) BUT Sort/Sale/New are promoted to **visible quick-chips on the "240 products" row** — `Sort ৳` (Low→High / High→Low), one-tap `Sale` (red-tinted) and `New` (green-tinted) toggles. Costs one row of height vs V3.

**REQUIREMENT (Danish, 2026-06-19):** Sort (৳ Low→High / High→Low), Sale, and New MUST remain present — do not drop them. Existing keys: `ps_sort_lh`, `ps_sort_hl`, `ps_sale`, `ps_new`, `.ps-sortrow` (order-form.html ~L932). In V4 they're on the count row; in V3 they're inside the Filters sheet.

---

## Extra UX ideas raised (optional, for discussion)
- Value-prop one-liner at the very top so first-time visitors instantly get "order Pakistani fashion → delivered to Bangladesh".
- Category/brand filters as horizontal scroll chips (save vertical space vs. stacked blocks).
- "Filters" as a bottom-sheet button (View 3) keeps the grid full-width.
- Keep the in-app product picker as the primary add-path (no copy/paste) — see [[pakiposhak-copy-flow]], [[browse-products]].

## HARD CONSTRAINT — do NOT merge Products and Brands into one page (Danish, 2026-06-19)
The catalog is **partial**: Browse Products = ~12,648 pre-indexed items from only ~81 of 155 brands (tap-to-add). Browse Brands = the **full 155-brand directory** (open any brand → pick ANY product, even uncatalogued → paste link = the "we can get anything" promise).
- Merging would make an uncatalogued item read as "unavailable" → buyer wrongly thinks we can't get it. Keep the two modes as a **clear segmented toggle in all three views**, including View 3.
- **Tension with item ii:** the "want more? Browse brands →" route is functionally essential (not decoration) because the catalog is partial. KEEP a persistent, obvious route to the brand directory — especially in the empty / zero-results state ("Can't find it? Browse all 155 brands →"). This overrides item ii's "remove the click" for THIS element only.
- The paste-link flow (open brand site → paste product URL) stays as the path for anything not in the catalog. See [[browse-products]].

## Decision / status — ✅ SHIPPED 2026-06-19 (build 19f, commit 6b8796e on main)
- [x] Danish picked **View 4** (products-first + toggle + visible Sort/Sale/New), then refined: **removed the value-prop banner** and put **"80+ Pakistani brands"** in the search placeholder.
- [x] Implemented items i–vi + View 4 wrapper, verified mobile + desktop in preview, synced index.html, LIVE on main.
- Final first-view (mobile): header → video/how-it-works → Browse products|brands toggle → search ("Search 12,000+ products, 80+ Pakistani brands") → Category + Brands panels (collapsed) → count row [Price ৳ popover · Clear] → Sort/Sale/New → grid → "Can't find it? Browse all 155 brands →". Steps (1·2·3·4) moved into the fixed bottom bar (Home · steps · Cart); top steps-bar kept on desktop only.
- ⚠️ Known trade-off (Danish's "minimal change" choice): collapsed Category+Brands panels push the product grid just below the first fold. If he later wants products higher, switch to compact Category/Brands dropdowns or a Filters bottom-sheet.
- Restore point if needed: tag `stable-landing-pre-view4-20260619` (ef4a143, build 19c).
Related: [[browse-products]], [[ui-theme-consistency]], [[pakiposhak-copy-flow]], [[theme-system]].
