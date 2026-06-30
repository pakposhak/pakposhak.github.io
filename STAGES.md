# PakPoshak — App Stages (milestone record)

A human-readable index of stable milestones. Each stage is also a **git tag** you can
restore to. To see a tag's notes: `git tag -n20 <tag>`. To restore a stage into a fresh
folder without disturbing current work:

```bash
git worktree add ../PakPoshak-<stage> <tag>      # opens that stage in a new folder
# or, to inspect only:  git checkout <tag>        (then: git checkout main to return)
```

Naming scheme going forward: `<short-name>-stable-YYYYMMDD` (tag) + a "Stage N" label here.

---

## Stage 10 — Overlay-Fixed Stable  ·  tag `app-stable-overlay-fixed-20260630`  ·  2026-06-30
**The app loads clean after the stuck "Finding your size" overlay was fixed at the root.**
- **Root cause** (the real one, after several symptom-layer attempts): a class with `display:flex`
  (`.ps-vis-load`, `.ps-vis-sheet`) silently **overrides the HTML `hidden` attribute**, so the
  full-screen loading overlay rendered on **every** page load — fresh, incognito, any device —
  with the home page scrolling behind it. Earlier checks read the `.hidden` *attribute* (true)
  instead of `getComputedStyle().display` (`flex`), so it went undiagnosed.
- **Fix**: one global guard `[hidden]{display:none!important}` so the attribute always wins.
- **Also hardened this saga**: UTF-8 BOM removed from built HTML (`build.ps1` writes no-BOM);
  versioned asset URLs `app.js?b=<build>` so updates land in ONE reopen; overlay watchdog +
  Cancel + bfcache guard as defence-in-depth.
- **New regression guard**: `verify-build.js` runs at the end of `build.ps1` and FAILS the build
  if the `[hidden]` rule, no-BOM, versioned URLs, or build/cache stamps regress (12 checks).
- **Feature state at this stage**: Visual search OFF (will return decoupled from Fit); Fit
  Assistant OFF for this tag (re-enabled in the next deploy). Core (browse/brands/order/WhatsApp
  phone widget/posters) fully intact.
- Live HTML build stamp: `2026-06-30-hiddenfix` / `psb-v149`.

---

## Stage 1 restore points — per-subsystem rollback (set 2026-06-23)

Independent "go back to stage 1" anchors for the LAAM/Aarong-inspired UX redesign. Each is a
git tag at commit `626bdb5` — the live state on 2026-06-23 (build 23l / psb-v27, which already
includes the Browse Brands featured-star marker). Say **"go back to stage 1 for &lt;area&gt;"**
and only that area is reverted to its tag; the other areas keep their newer changes.

| Area | Say | Tag |
|---|---|---|
| Browse Products | "go back to stage 1 for browsing products" | `browse-products-stage1-20260623` |
| Browse Brands | "go back to stage 1 for browsing brands" | `browse-brands-stage1-20260623` |
| Order form + Cart | "go back to stage 1 for the order form / cart" | `orderform-cart-stage1-20260623` |

Mechanism: every redesign change ships as its own clearly-labelled commit per area, so reverting
one area = `git revert` its commit(s) back to the tag while the others stay untouched.

- 2026-06-23 build 23m / psb-v28 — **Order form + Cart: image-led** (product photo + title on the
  draft card and cart line, brand-monogram fallback). Revert this commit to return order-form/cart
  to Stage 1.

---

## Stage 9 — Catalog-Accuracy Stable  ·  tag `catalog-accuracy-stable-20260622`  ·  2026-06-22
**Category accuracy, VPS fully deployed, security hardened.**
- **Kids eastern routing**: `kidsCatFor()` now recognises `\beastern\b` keyword directly; thobe/jhuba
  in kids_boys_western migrated to kids_boys_eastern; adult-thobe rule guarded (`!/^kids_/`).
- **Sha Posh**: sizes ≥ 36 are adult women (continuous run 20–40); pre-emptive guard prevents
  re-routing back to kids by the explicit-gender block.
- **18 accessories removed**: potli bags, Gulab Envelop (and the "Envelop" spelling variant),
  Mirchi Sahara, Hand-Crafted Phool — via `NONAPPAREL_STRONG`/`NONAPPAREL_WEAK`.
- **VPS fully deployed**: `relay-server.js` (adds `/admin/change` password-rotation endpoint) +
  `catalog-cleanup.js` deployed to `/opt/psb-search/`; `search.db` rebuilt (59,845 products).
- **Security**: VPS server password + admin panel password both rotated 2026-06-22. SSH key-only.
- **Performance**: relay `/config` GET now sends `Cache-Control: public, max-age=60`; app fetches
  use `cache:'default'` so repeat page-loads within 60 s skip the Pakistan round-trip entirely.
- Live HTML build stamp: `2026-06-22`.

---

## Stage 8 — Price-Parity Stable  ·  tag `price-parity-stable-20260621`  ·  2026-06-21
**The card price == the basket price, everywhere, using only in-stock prices.**
- Browse-card price now = **cheapest in-stock variant** (was `variants[0]`, often a sold-out
  smallest size that showed an unbuyable price). Harvest `6529c39`.
- Basket default price = cheapest in-stock too → card == basket by construction (`af945eb`).
- **Per-size billing**: cart bills each picked size at its own price, shown as separate rows
  (`order-form.html` mirrored to `index.html`).
- Authoritative category-by-URL (`/search/by-url`) so basket weight == card weight.
- Cougar harvest host fixed (`cougar.com.pk` 404 → `www.cougar.com.pk`, ~376 products).
- **Audited 54 brands**: parity confirmed clean; verified that `available:false` ≠ unbuyable
  (PK brands oversell/make-to-order) so sold-out-looking products are NOT dropped.
- Live HTML build stamp at this stage: `2026-06-21i`.
- ⚠️ The card-price change is in the harvest code; it goes live on the next VPS catalog
  re-harvest (regenerates `catalog.json` + search index).

### Prior checkpoints (existing tags — older stages)
- `store-types-model-20260621` — Browse "Store Types" model snapshot (before retirement).
- `pre-ux-collapse-live` — before the collapsed-filters UX work.
- `stable-landing-pre-view4-20260619` — landing rotation, pre view-4.
- `stable-brands-20260616` — Browse Brands directory stable.
- `core-stable-20260615` — core order-form stable.
- `v1-order-form-stable` — first stable order form.

---

## How to start a NEW stage (when a milestone is reached)
1. Make sure `main` is clean and pushed.
2. Tag it:  `git tag -a <name>-stable-YYYYMMDD -m "what this stage contains"`
3. Push the tag:  `git push origin <name>-stable-YYYYMMDD`
4. Add a section at the top of this file, then commit.
5. Run a backup (see `PakPoshak-Backups/make-backup.ps1`) and upload to Drive.
