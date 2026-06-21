# Browse-Brands "Store Types" model — RETIRED from the page 2026-06-21 (build 21e)

The **Store Types** view (the 5-department brand mega-menu + the "Two ways to search brands"
sub-tab toggle + the standalone brand-name search) was removed from the live Browse-Brands tab
on 2026-06-21 so that **desktop matches mobile**: one unified Product-Category view (smart
search + the 5 department tabs Kids · Women · Men · Multi-Dept · Premium) on every width.

## It is NOT deleted — it is hidden, and fully restorable

The model was **kept in `order-form.html`** (and `index.html`), just hidden + unwired, so it
can be brought back without rebuilding it. Two preservation layers:

1. **Git tag `store-types-model-20260621`** — points at the commit *before* removal, where Store
   Types was live. `git checkout store-types-model-20260621` to see/restore the exact working code.
2. **In-file (dormant)** — all the Store-Types HTML/JS/CSS still lives in `order-form.html`:
   - HTML: `#bbStore` (the `#catBar` mega-menu + `#catGrid`), the `.bb-subtabs`/`.bb-two-ways`
     toggle+header, and `#brandSearchSection` (`#brandSearch`/`#brandDropdown`).
   - JS: `renderCatBar()`, `switchCat()`, `brandGrid()`, `measureCatPages()`, `catSlide()`,
     `onBrandSearch()`, `bbSwitch()`, and the data `BRAND_CATS` + `CAT_LIMIT`.
   - CSS: `.bb-subtabs`, `.bb-two-ways`, `.cat-bar`, `.cat-tab`, `.cat-panel`, `.cat-head`,
     `.brand-search*`, `.brand-dropdown` (the shared `.cat-grid/.cat-track/.cat-page/.cat-pagegrid/.cat-brand`
     classes stayed — the Product view reuses them).

## How to restore (revert 3 small changes — build 21e)

1. **CSS** — remove `#bbStore, #brandSearchSection` (and revert `.bb-subtabs, .bb-two-ways`) from
   the unconditional `display:none` rule back to the `@media(max-width:819px){ … }` form, so the
   sub-tabs/mega-menu show on desktop again.
2. **`switchBrowse()`** — change `if(brands) bbSwitch('product');` back to
   `if(brands && bbIsMobile()) bbSwitch('product');` so desktop opens on Store Types.
3. **`bbRenderProduct()`** — change `const tabs = BB_TABS_MOBILE;` back to
   `const tabs = _bbWasMobile ? BB_TABS_MOBILE : BB_GENDERS;` (desktop's 3 gender tabs).

That's the whole retirement — reverting those 3 hunks re-enables Store Types exactly as it was.
