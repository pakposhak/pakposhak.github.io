# Collection-path capture + category audit — runbook

Goal: capture each product's **collection context** (which collections it's in + their
dept/section/path), use it to **refile products into the right categories**, and give a
clean, sortable **collection map**. This fixes the "wrong images in a category" problem
at its root and is the clean foundation the Visual Search hybrid re-rank waits on.

## Why (the reality we proved)

- Shopify collections are a **flat list** — no parent/breadcrumb field — and brand nav
  menus are JS-rendered, not reliably scrapeable. So the literal "Women ▸ Pret ▸ New
  Season ▸ Misty" menu path isn't directly available.
- It **is** recoverable from data we already have: **dept (Women/Men/Kids) + collection
  title segments** → `Women ▸ 1Pc Kurti Co-Ord Set ▸ Winter '23`.
- The real blocker for "move products by collection" was that **product→collection
  membership wasn't stored** (only 12% kids kept a leaf handle). The new scanner fixes that.

## Pieces (built)

| Script | Output | Status |
|---|---|---|
| `scan-brand-collections.js` (existing) | `brand-collections.json` (155 brands, classified collections) | refresh before a run |
| `build-collection-map.js` | `collection-map.csv` / `.json` — one row per collection: `brand,host,group,dept,kidSub,sections,path1..4,handle,collection,count` | ✅ built (20,419 collections; dept 54%) |
| `scan-collection-membership.js` | `collection-membership.jsonl` — one row per product: `{u, colls:[{h,t,dept,sec}]}` | ✅ built + tested (100% join) |
| collection-authority refile in `catalog-cleanup.js` | corrected `cat` per product | ⏳ to build after the harvest |

## Step 1 — Refresh the collection map (local, instant, low risk)

```bash
node scan-brand-collections.js        # refresh brand-collections.json (155 brand /collections.json hits)
node build-collection-map.js          # -> collection-map.csv (open in Excel) + collection-map.json
```
`collection-map.csv` is the human-reviewable map (feeds brand-map.html). Each row is a
collection with its derived path and classification. Last column = collection name.

## Step 2 — Membership harvest (BIG; run on the Pakistan VPS overnight)

This fetches every non-noise collection's product list across ~146 Shopify brands
(~hours, 403-rate-limit risk → throttled + resumable). The Pakistan IP avoids many 403s.

```bash
# on the VPS, in the repo checkout:
node scan-collection-membership.js --conc 4 --delay 150        # full run, resumable
# if it stops / rate-limits, just re-run with --resume:
node scan-collection-membership.js --resume --conc 3 --delay 250
# test one brand first:
node scan-collection-membership.js --only Kayseria
```
Output: `collection-membership.jsonl` (product URL → its collections). SFCC brands
(Khaadi/Sapphire) are not Shopify — membership isn't captured for them (their existing
title/URL rules still apply).

## Step 3 — Quantify dirtiness (read-only, needs your OK to hit live)

```bash
node audit-categories.js --deep        # flags title↔category contradictions on the live /search API
```
Run before and after the refile to measure improvement. (Read-only; no mutation.)

## Step 4 — Refile (✅ BUILT + validated 2026-06-28; deploy after the full harvest)

`catalog-cleanup.js` now has an optional `membership` param + a COLLECTION-MEMBERSHIP AUTHORITY tier
that votes across each product's collections and corrects department / kids-gender / east-west /
stitched-ness on a confident, unopposed, title-unblocked signal (routes via the existing mappers ⇒
idempotent). `loadMembership()` reads `collection-membership.jsonl`; **null membership ⇒ no-op**.
Validated on a 17%-coverage partial snapshot: idempotent on real data, ~0.34% refiled (sensible).

**Tests (all green):** `_cat_audit/test-membership.js` (16), `test-rules.js/2/3`, `test-idempotent.js`
(fixed point — also fixed a pre-existing 121-product boys↔girls oscillation), `test-sanity.js` (9).

**Deploy (when the full harvest is done):**
1. `scp` the finished `collection-membership.jsonl` to **both** run locations:
   `/opt/pakiposhak/` (harvest writes catalog.json) **and** `/opt/psb-search/` (search-db). The file
   is gitignored, so `run-harvest.sh`'s `git reset --hard` keeps it across cron runs.
2. Local dry-run sanity first: `node catalog-cleanup.js` (no `apply`) → check `coll-authority=N`.
3. Re-run `_cat_audit/test-idempotent.js` **with the full membership beside catalog.json** (set
   `PSB_MEMBERSHIP` or place the file) → must reach a fixed point.
4. Let the cron (`run-harvest.sh`) apply + commit catalog.json. The sanity gate (`catalog-sanity.js`)
   now also enforces **category churn ≤ `PSB_CAT_CHURN_MAX`** (default 0.08) — reverts a run that
   mass-mis-files. First deploy measured 0.35% (partial)/~2% (full); steady-state 0%. If the first
   full deploy legitimately exceeds 8%, bump `PSB_CAT_CHURN_MAX` for that one run, then restore.
5. `build-search-db.js` re-applies cleanup with membership too, so search.db stays consistent.

Then deploy is automatic via the 4x/day cron (commit + push catalog.json).

## Step 5 — Visual Search hybrid

Once categories are trustworthy, flip `PSB_VISUAL_HYBRID=1` on `psb-visual` (see
`visual-search/README.md`) — the Pakistani-aware re-rank now runs on clean data.

## Notes / caveats

- A product belongs to **multiple** collections; the refile should weigh them (e.g.
  prefer the most specific classified collection; ignore noise buckets).
- Membership-based dept beats title inference; use membership where available, fall back
  to the title/section heuristic (`build-collection-map.js inferDept`) otherwise.
- Generated files (`collection-map.*`, `collection-membership.*`) are git-ignored —
  regenerate them; don't commit the large outputs.
