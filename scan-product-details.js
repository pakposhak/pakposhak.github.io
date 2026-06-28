'use strict';
/*
 * scan-product-details.js — capture each product's DESCRIPTION + attributes for faceting
 * (fabric / style / work / piece-count grids) and for the Fit Assistant.
 *
 * The collection-membership scan only kept handles. This complementary pass uses each Shopify
 * brand's BRAND-LEVEL feed  https://host/products.json?limit=250&page=N  which returns the FULL
 * product objects — body_html, variants, options, tags, product_type, vendor — so ~59k products
 * come in ~240 page requests (far cheaper than the per-collection scan).
 *
 *   product URL -> { t, ptype, vendor, tags[], opts[], sizes[], sizesAvail[], desc }
 *
 * Input:  brand-collections.json  (host list; reuses b.ok + b.host = Shopify, scannable)
 * Output: product-details.jsonl   (+ product-details.progress.json for --resume)
 *
 * SFCC brands (Khaadi / Sapphire) have no /products.json — skipped (same as the membership scan).
 *
 * Usage:
 *   node scan-product-details.js                 # all Shopify brands (resumable)
 *   node scan-product-details.js --only Khaadi   # one brand (no-op for SFCC)
 *   node scan-product-details.js --resume
 *   node scan-product-details.js --conc 4 --delay 150 --desc 1500
 */
const fs = require('fs');
const path = require('path');

function arg(name, def){ const i = process.argv.indexOf('--' + name); return (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) ? process.argv[i + 1] : def; }
function flag(name){ return process.argv.includes('--' + name); }

const SRC = arg('src', 'brand-collections.json');
const OUT = arg('out', 'product-details.jsonl');
const PROG = OUT.replace(/\.jsonl$/, '') + '.progress.json';
const ONLY = arg('only', '');
const CONC = parseInt(arg('conc', '4'), 10);          // concurrent brands
const DELAY = parseInt(arg('delay', '150'), 10);      // ms between page fetches (per brand)
const DESC_MAX = parseInt(arg('desc', '1500'), 10);   // max description chars kept
const RESUME = flag('resume');
const UA = 'Mozilla/5.0 (compatible; PakPoshak-detailscan/1.0)';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const stripHtml = h => String(h || '')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
  .replace(/&#?[a-z0-9]+;/gi, ' ')
  .replace(/\s+/g, ' ').trim();

// pull all products from a brand's /products.json (paginated, backoff on 429/403/5xx)
async function brandProducts(host){
  const out = [];
  for (let page = 1; page <= 60; page++){
    const url = `https://${host}/products.json?limit=250&page=${page}`;
    let got = null;
    for (let attempt = 0; attempt < 4; attempt++){
      try {
        const r = await fetch(url, { headers: { 'User-Agent': UA } });
        if (r.status === 429 || r.status === 403 || r.status >= 500){ await sleep(800 * (attempt + 1)); continue; }
        if (!r.ok) return out;                          // 404 etc → no feed / done
        const j = await r.json();
        got = (j && j.products) || [];
        break;
      } catch (e) { await sleep(600 * (attempt + 1)); }
    }
    if (!got || !got.length) break;                     // no more pages
    out.push(...got);
    await sleep(DELAY);
  }
  return out;
}

function shape(host, p){
  const opts = (p.options || []).map(o => o.name);
  const sizeIdx = (p.options || []).findIndex(o => /size|length|age/i.test(o.name || ''));
  let sizes = [], sizesAvail = [];
  if (sizeIdx >= 0){
    const key = 'option' + (sizeIdx + 1);
    sizes = [...new Set((p.variants || []).map(v => v[key]).filter(Boolean))];
    sizesAvail = [...new Set((p.variants || []).filter(v => v.available).map(v => v[key]).filter(Boolean))];
  }
  const tags = Array.isArray(p.tags) ? p.tags : (typeof p.tags === 'string' ? p.tags.split(',').map(s => s.trim()).filter(Boolean) : []);
  return {
    u: `https://${host}/products/${p.handle}`,
    t: p.title || '',
    ptype: p.product_type || '',
    vendor: p.vendor || '',
    tags,
    opts,
    sizes,
    sizesAvail,
    desc: stripHtml(p.body_html).slice(0, DESC_MAX)
  };
}

async function pool(items, conc, worker){
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(conc, items.length) }, async () => {
    while (i < items.length){ const idx = i++; await worker(items[idx], idx); }
  }));
}

async function main(){
  const bc = JSON.parse(fs.readFileSync(path.resolve(SRC), 'utf8'));
  const brands = bc.brands || {};
  const progress = (RESUME && fs.existsSync(PROG)) ? JSON.parse(fs.readFileSync(PROG, 'utf8')) : { done: {} };
  const outStream = fs.createWriteStream(path.resolve(OUT), { flags: RESUME ? 'a' : 'w', encoding: 'utf8' });

  const keys = Object.keys(brands).filter(k => {
    const b = brands[k];
    if (!b || !b.ok || !b.host) return false;
    if (ONLY && !new RegExp(ONLY, 'i').test(b.name || k)) return false;
    if (RESUME && progress.done[k]) return false;
    return true;
  });
  console.log(`brands to scan: ${keys.length}${ONLY ? ' (filter: ' + ONLY + ')' : ''}`);
  let totalProducts = 0;

  await pool(keys, CONC, async (key) => {
    const b = brands[key];
    let prods;
    try { prods = await brandProducts(b.host); } catch (e) { prods = []; }
    let n = 0;
    for (const p of prods){ if (p && p.handle){ outStream.write(JSON.stringify(shape(b.host, p)) + '\n'); n++; } }
    progress.done[key] = { products: n, at: new Date().toISOString() };
    fs.writeFileSync(PROG, JSON.stringify(progress, null, 0));
    totalProducts += n;
    console.log(`  [${key}] ${b.host}: ${n} products`);
  });

  outStream.end();
  outStream.on('finish', () => {
    console.log(`DONE  brands=${keys.length}  product rows=${totalProducts}`);
    console.log(`  -> ${path.resolve(OUT)}`);
    console.log('  (SFCC brands like Khaadi/Sapphire have no /products.json — not captured here.)');
  });
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
