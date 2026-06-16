# Browse Products — multi-brand search page

A faceted product search ("Browse products" tab, beside "Browse brands") so buyers
can discover items by **price / category / brand** instead of only pasting links.

## How it works (and why it's cheap to run)

There is **no live per-search fetching** of brand sites — that would be slow and
would get the VPS bot-blocked. Instead:

1. **`harvest-catalog.js`** crawls each brand's public Shopify feed
   (`/products.json`) and writes one compact **`catalog.json`**
   (`{b,t,u,img,pkr,cat,sz}` per product).
2. The page **loads `catalog.json` once** and filters it **client-side** —
   price/category/brand are all instant, zero per-search server load.
3. Product **images load straight from the brands' own CDNs** (the VPS never
   touches images).
4. Tapping a product hands its URL to the existing **live add pipeline**
   (`handleAddUrl`), so price / stock / category are **verified live on add**.

The catalog is the only moving part, and it's a light periodic job.

## Phase 1 (LIVE now)

- `catalog.json` is committed to the repo → GitHub Pages serves it same-origin.
- 782 products from the top 20 Shopify brands. Refresh by re-running the harvester
  and committing:
  ```
  node harvest-catalog.js        # rewrites catalog.json
  git add catalog.json && git commit -m "refresh catalog" && git push
  ```
- Add/remove brands or change `PER_BRAND` in `harvest-catalog.js` (the `BRANDS`
  list at the top). SFCC brands (Khaadi, Sapphire) have no `/products.json` and
  are skipped — they need the relay `/scrape` (a later add).

## Phase 2 — automate the refresh

Pick whichever is easier:

### Option A — VPS nightly cron (matches existing infra)
On the relay VPS (103.83.91.34):
```bash
# one-time: copy the harvester up
scp harvest-catalog.js root@103.83.91.34:/opt/psb/

# cron 3×/day at 10:00, 17:00, 22:00 PKT (Danish — most buying happens at night).
# The job is light (~55 brands + 2 SFCC, gentle 700ms spacing ≈ 2–3 min); the
# 700ms delay in harvest-catalog.js keeps it from tripping brand bot-walls.
# (The VPS clock should be Asia/Karachi; else convert these to the box's TZ.)
crontab -e
0 10,17,22 * * *  cd /opt/psb && /usr/bin/node harvest-catalog.js && cp catalog.json /var/www/psb/catalog.json
```
Serve it from Caddy (gzip + permissive CORS, same as the relay):
```
103.83.91.34.sslip.io {
  handle /catalog.json {
    header Access-Control-Allow-Origin *
    encode gzip
    root * /var/www/psb
    file_server
  }
  # …existing relay routes…
}
```
Then point the page at it: open the app with `?admin`, or set in the console:
```
localStorage.setItem('psb_catalog_url','https://103.83.91.34.sslip.io/catalog.json')
```

### Option B — GitHub Action (no VPS needed for the catalog)
A scheduled workflow runs `node harvest-catalog.js` and commits `catalog.json`.
`/products.json` returns the store's **base PKR price regardless of the runner's
geo**, so this works from GitHub's IPs. (SFCC brands still need the VPS relay.)

## Notes / future

- `catalog.json` size: ~200 KB raw / ~55 KB gzipped for 20 brands. At all ~150
  brands, shard by department (women/men/kids) and lazy-load the relevant shard.
- Category in the harvester mirrors `order-form.html` PT_CAT — keep roughly in
  sync (it only drives the catalog filter; the cart category is set by the live
  fetch on add, so exactness isn't critical).
- `sz` is indicative (the `.json` feed has no per-variant stock); real in-stock
  filtering happens on add via the live `.js` fetch.
