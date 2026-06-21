# PakPoshak — Cowork Project Instructions
_Paste this into the Cowork project's description / custom-instructions field._

## What this project is
PakPoshak (formerly "PakiPoshak" / "PakStyle BD"; business name **Moors Attire / PakPoshak**) is a
static **GitHub Pages** web app that lets buyers in **Bangladesh** order **Pakistani fashion-brand**
products. A buyer pastes a product URL; `order-form.html` auto-detects the brand, fetches
**category + PKR price + in-stock sizes**, converts to an **estimated BDT total**, and submits the order.
A Node **relay** on a Pakistan VPS (`https://103.83.91.34.sslip.io`) fetches prices/stock from a PK IP
so Bangladeshi buyers always see true PKR prices.

## Estimated-total formula
```
productBdt = round(totalPkr / 2.20)               // BDT_PKR rate (PKR per 1 BDT), admin-editable
commission = round(productBdt * rate)             // 1 item 20% · 2–3 items 18% · 4+ items 15%
logistics  = round(totalWeight_kg * 1600)         // BDT per kg, admin-editable
total      = productBdt + commission + logistics + 100   // +100 BDT flat fee
```
Rates are editable in an in-app **admin panel** (`?admin` URL or `Ctrl+Shift+A`), password-gated
(SHA-256 hash in `ADMIN_PASS_HASH`), stored per-device in `localStorage`. Buyers get the code defaults.

## Brand groups (full list in BRAND-GROUPS.md, ~105 brands)
- **G1 (88)** Shopify native-PKR — full auto; relay bulletproofs prices for BD.
- **G2 (10)** twin sites (intl + PK) — `TWIN_MAP` rewrites the intl URL to the PK store.
- **G3 (1, Suffuse)** USD-native — `USD_ONLY_BRANDS` treats USD as the true price.
- **G4 (15)** non-Shopify (Khaadi/Sapphire on Salesforce + others) — relay `/scrape` (JSON-LD from PK IP).
- **G5** dead links — all fixed.

## Key files
- `order-form.html` — the app (all logic). `index.html` — landing.
- `relay-server.js` — the PK price/stock relay (Node).
- `CLAUDE.md`, `BRAND-GROUPS.md`, `project-brief.md`, `tech-spec.md`, `ops-workflow.md`, `pricing-calculator.md`, `brands-catalog.md` — docs.
- `PAKPOSHAK-HANDOFF.md` — current status + reading guide. **Read this first.**

## How to work in this project
- **Read `PAKPOSHAK-HANDOFF.md` and `CLAUDE.md` before changing anything.**
- Source of truth for code is the **git repo**. Feature branch → PR to `main`; `main` = the live GitHub Pages site.
- **Never push or deploy to the live site without explicit approval.** Confirm before anything outward-facing.
- **Only one agent/session edits the repo at a time** — concurrent edits cause lost work.
- UI must be theme-styled for **light + dark** (no native black/white selects). Brand names stay in
  **English** under the EN/BN toggle; keep the `notranslate` meta. `sw.js` stays **network-first for HTML**.
- The order-tracker spreadsheet is **customer PII** (names, WhatsApp, addresses, payments) — handle with care.

## Always ask me before
Pushing/deploying, messaging buyers, changing live rates/commission, or anything that touches real orders.

## Naming note
The brand is being renamed **PakiPoshak → PakPoshak**. The local repo/remote and `CLAUDE.md` may still say
"pakiposhak"; **verify the canonical live URL, GitHub repo, and order email before deploying.**
