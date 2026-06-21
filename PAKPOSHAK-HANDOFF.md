# PakPoshak — Session Handoff & Reading Guide
_Written 2026-06-15 by a prior Claude session. Start here, then read the sources below._

## What PakPoshak is
A static **GitHub Pages** web app that lets buyers in **Bangladesh** order **Pakistani fashion-brand** products. A buyer pastes a product URL; the form auto-detects the brand, fetches **category + PKR price + in-stock sizes**, converts to an **estimated BDT total** (products + commission + logistics + flat fee), and submits the order. Business name: **Moors Attire / PakPoshak** (formerly "PakiPoshak" / "PakStyle BD").

## Where everything lives
- **Local repo:** `C:\Users\Danish.Wazir\Documents\Claude\Projects\Lawn Busines For Bangladesh\`
- **Main app file:** `order-form.html` (the order form + all logic). Landing = `index.html`.
- **Other files:** `relay-server.js`, `sw.js` (PWA, network-first for HTML), `manifest.json`, `tracking.html`, `weight-chart.html`, `how-to-video.html`, `order-aggregator.html`, `admin-dashboard.html`, `google-apps-script.gs`, plus many `*.md` planning docs.
- **Git remote:** `origin = github.com/pakiposhak/pakiposhak.github.io` ⚠️ see naming note below.
- **Live site:** `https://pakiposhak.github.io/` per `CLAUDE.md`. ⚠️ The brand is being renamed to **PakPoshak**; the new home may be `pakposhak.github.io`. **Verify the canonical URL / remote / order email before deploying** — local repo + `CLAUDE.md` still use the old "pakiposhak" naming.
- **VPS / PKR relay:** CloudVPS box `103.83.91.34` (Lahore). Relay is LIVE at `https://103.83.91.34.sslip.io` (`DEFAULT_RELAY_URL` in `order-form.html`); it also exposes `/scrape` for Group-4 SFCC brands (Khaadi/Sapphire).

## Read these, in order
1. **Your memory** — `MEMORY.md` index + every linked note under `C:\Users\Danish.Wazir\.claude\projects\D--Personal-Danish\memory\` (brand-catalog, category-mapping, pkr-price-relay, pakiposhak-vps, browse-products, admin-global-config, search-api, theme-system, payment/backup, etc.). This is the canonical project knowledge.
2. **Repo docs** — `CLAUDE.md` (project brief), `BRAND-GROUPS.md` (the brand pricing-path survey, G1–G5), `README.md`, `project-brief.md`, `tech-spec.md`, `brands-catalog.md`, `pricing-calculator.md`, `ops-workflow.md`.
3. **The app** — skim `order-form.html`: `getRates()` / `saveRates()` / `openAdminPanel()` (admin rates + password gate), the cost calc (`productBdt` + `commission` + `logistics` + `TRANS_FEE`), `commRate()` (tiered commission), `TWIN_MAP` / `USD_ONLY_BRANDS` (brand-group handling), and the relay fetch path (`DEFAULT_RELAY_URL`).

## Cost calculation (how the estimated total works)
```
productBdt = round(totalPkr / BDT_PKR)            // BDT_PKR rate, default 2.20  (PKR per 1 BDT)
commission = round(productBdt * commRate(items))  // 1 item 20% · 2–3 items 18% · 4+ items 15%
logistics  = round(totalWeight_kg * LOG_RATE)     // LOG_RATE default 1600 BDT/kg
total      = productBdt + commission + logistics + TRANS_FEE   // TRANS_FEE = 100 BDT
```
- Rates are editable in the in-app **admin panel** (open via `?admin` URL or `Ctrl+Shift+A`), stored in `localStorage` (per-device). Buyers without saved rates get the **code defaults** above.
- Admin panel is **password-gated** (SHA-256 hash in `ADMIN_PASS_HASH`). Current password: **`[REDACTED — not stored in repo; ask Danish]`**. Change it: run `adminHash('newpass')` in the browser console, paste the printed hash into `ADMIN_PASS_HASH`.

## Brand groups (see BRAND-GROUPS.md for the full ~105-brand list)
- **G1 — 88 brands** Shopify, native PKR → full auto; the PK-IP relay bulletproofs prices for BD buyers.
- **G2 — 10 brands** twin sites (international + Pakistani store) → `TWIN_MAP` rewrites the intl URL to the PK store.
- **G3 — 1 brand** (Suffuse) USD-native → `USD_ONLY_BRANDS` treats USD as the true price.
- **G4 — 15 brands** non-Shopify (Khaadi & Sapphire on Salesforce + others) → needs the relay `/scrape` (JSON-LD from a PK IP).
- **G5** dead/wrong links → all fixed.

## Current git / work state (2026-06-15)
- Branch **`main` (local)** was just merged with **`feat/admin-gate-bdt-pkr`** (`0bbd822`), bringing in: rate flipped to **BDT→PKR 2.20** (key `psb_bdtpkr`; convert = PKR ÷ 2.20); per-item taka line **removed** from the order list; **admin password gate** (`[REDACTED — not stored in repo; ask Danish]`); **safe-localStorage** wrappers (`lsGet`/`lsSet`/`lsDel`) so blocked-storage in-app browsers don't crash the form.
- ⚠️ Local `main` is **ahead 2 / behind 3** vs `origin/main` — the remote has 3 newer commits. **`git pull origin main` and reconcile BEFORE pushing/deploying.**
- Other branches: `feat/g4-form-scrape`, `feat/pkr-relay-default`, `feat/category-overhaul` (holds WIP commit `967b218` = another session's `index.html`/`order-form.html`/new `faq.html`), `feat/search-100-brands`, `website-dev`.

## Pending / next steps
1. **Finish safe-localStorage**: a few raw `localStorage` reads are still unwrapped — the relay-URL reads (`order-form.html` ~`:1563`, `:1667`), the startup `psb_lang` read, the `psb_usd_pkr` reads, and `saveBuyerDetails`. Wrap them in `lsGet`/`lsSet`.
2. **Test the admin panel locally** (preview): open `?admin` (or `Ctrl+Shift+A`) → password `[REDACTED — not stored in repo; ask Danish]` → set rates → Save → confirm the weight chart renders and the BDT total uses ÷2.20.
3. **Reconcile + deploy**: `git pull origin main`, resolve any conflict, then push → GitHub Pages rebuilds. Outward-facing — confirm with Danish first.
4. Consider rotating the admin password (it appeared in a prior chat transcript).

## ⚠️ Critical rule: ONE session per working folder
Running two agent sessions against `C:\Users\…\Lawn Busines For Bangladesh\` at once caused repeated "the file reverted" churn (branch switches swap the shared working tree, discarding uncommitted edits). **Use one session at a time, or give each its own `git worktree`.** Always check `git status` is clean before switching branches.

## Workflow norms (from memory)
- Feature branch → PR against `main` (live GH Pages). Don't push untested work straight to live.
- Keep `index.html` ↔ `order-form.html` in sync where they overlap.
- Every in-app dropdown/popover must be theme-styled (light + dark) — no native black/white selects.
- Brand names stay in English even under the EN/BN i18n toggle; keep the `notranslate` meta.
