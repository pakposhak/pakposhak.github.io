'use strict';
/*
 * build-search-db.js — builds the SQLite search database for PakPoshak's Browse Products.
 *
 * Reads the live catalog.json + the relay's current rates/weights (GET /config), computes
 * each product's landed ৳BDT with the SAME formula the app uses, and writes an INDEXED
 * SQLite DB (products table + FTS5 keyword index) that the search-server queries.
 *
 * Atomic: builds <db>.new then renames over <db>, so the running search-server (which
 * watches the file) never reads a half-built database.
 *
 * Run:  node build-search-db.js
 * Env:  PSB_CATALOG_URL (default live Pages catalog), PSB_CONFIG_URL (default localhost relay), PSB_DB
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const Database = require('better-sqlite3');
// SAFETY NET: re-apply the gender/category corrector at index time so the search index users
// actually see is ALWAYS cleaned — regardless of how products entered catalog.json (a stale/failed
// harvest, a manual edit, a daily VPS harvest running an old harvester). Idempotent: a no-op when
// catalog.json is already clean. This guarantees "every product, checked on the same basis" even if
// the harvest step ever skips cleanup. Requires catalog-cleanup.js alongside this file on the VPS.
const { cleanupProducts, loadMembership } = require('./catalog-cleanup');

const CATALOG_URL = process.env.PSB_CATALOG_URL || 'https://pakposhakonline.com/catalog.json';
const CONFIG_URL  = process.env.PSB_CONFIG_URL  || 'http://127.0.0.1:8787/config';
const DB_PATH     = process.env.PSB_DB          || path.join(__dirname, 'search.db');

function fetchText(url){
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, res => {
      if(res.statusCode !== 200){ res.resume(); return reject(new Error('HTTP '+res.statusCode+' for '+url)); }
      let d=''; res.setEncoding('utf8'); res.on('data', c => d += c); res.on('end', () => resolve(d));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('timeout fetching '+url)));
  });
}

// gender from category key: mens_* -> m, kids_* -> k, else women. (Reliable: only men/kids
// categories carry those prefixes; everything else is women's.)
function genderOf(cat){ cat = cat || ''; if(cat.indexOf('mens_') === 0) return 'm'; if(cat.indexOf('kids_') === 0) return 'k'; return 'w'; }
function genderRank(cat){ const g = genderOf(cat); return g === 'w' ? 0 : (g === 'm' ? 1 : 2); }

(async () => {
  const t0 = Date.now();
  const [catRaw, cfgRaw] = await Promise.all([
    fetchText(CATALOG_URL),
    fetchText(CONFIG_URL).catch(() => '{}'),   // rates are best-effort; fall back to defaults
  ]);
  const cat = JSON.parse(catRaw);
  // Re-run the catalog corrector before indexing (safety net — see require above), to a FIXED POINT.
  // cleanup is convergent (≤2 passes); a few set/couture rules legitimately need a 2nd pass to settle, so
  // re-apply until a pass changes no category. Guarantees STABLE live categories on every rebuild (without
  // this, ~a couple of products' categories could differ between rebuilds). See _cat_audit/test-idempotent.js.
  { const _mem = loadMembership(process.env.PSB_MEMBERSHIP || 'collection-membership.jsonl'); const _memArg = _mem.size ? _mem : null; if (_mem.size) console.log('search-db collection-membership:', _mem.size, 'products');
    let _c = cleanupProducts(cat.products || [], _memArg); cat.products = _c.products; console.log('search-db cleanup:', JSON.stringify(_c.stats));
    for (let _i = 0; _i < 4; _i++) { const _sig = cat.products.map(p => p.u + '\t' + p.cat).join('\n'); cat.products = cleanupProducts(cat.products, _memArg).products; if (cat.products.map(p => p.u + '\t' + p.cat).join('\n') === _sig) break; } }
  const cfg = JSON.parse(cfgRaw) || {};
  const rates = (cfg && cfg.rates) || {};
  const weights = (cfg && cfg.weights) || {};
  const conv = rates.conv != null ? rates.conv : 0.455;
  const log  = rates.log  != null ? rates.log  : 1600;
  const comm1 = (rates.comm_1 != null ? rates.comm_1 : 22) / 100;   // config stores percent
  // Per-category fallback weights (kg) for when the relay config doesn't carry one. MUST match the
  // app's DEFAULT_WEIGHTS (index.html) exactly so the search.db landed ৳ (price filter) equals what
  // the app computes. Relay config weights still override these (config has all 53 → fallback rare).
  const DEFAULT_WEIGHTS = {
    kurti_1pc:0.61, kurti_1pc_unstitch:0.55, western_top:0.45, womens_trouser:0.70, kaftan:0.90,
    shirt_dupatta_2pc:0.70, shirt_dupatta_2pc_unstitch:0.62, shirt_trouser_2pc:0.85, shirt_trouser_2pc_unstitch:0.75,
    pret_2pc_emb:0.95, lawn_3pc_unstitch:0.94, unstitch_3pc_emb:1.10, pret_3pc:1.04, pret_3pc_emb:1.25,
    winter_2pc_unstitch:0.99, winter_2pc_stitch:1.19, winter_3pc_unstitch:1.23, winter_3pc_stitch:1.43,
    formal_emb_2pc:1.18, formal_emb_3pc:1.45, heavy_formal_3pc:1.73, handmade_emb:2.50, bridal:2.55,
    saree:1.15, lehenga:1.80, coord_western:0.80, loungewear:0.75, abaya:0.95, maxi_dress:0.80,
    dupatta_only:0.46, shawl:0.87, footwear:1.10, accessories:0.50,
    mens_shirt:0.63, mens_trouser:0.85, mens_jeans:1.04, mens_kurta:0.85, mens_shalwar_kameez:1.18,
    mens_waistcoat:0.78, mens_suit:1.81, mens_sherwani:2.24, mens_unstitched:1.30,
    kids_boys_eastern:0.50, kids_girls_eastern:0.48, kids_boys_western:0.50, kids_girls_western:0.45,
    kids_boys_formal:0.60, kids_girls_formal:0.60, kids_infant:0.35,
  };
  const wOf = c => (weights[c] != null ? weights[c] : (DEFAULT_WEIGHTS[c] != null ? DEFAULT_WEIGHTS[c] : 0.6));
  // landed ৳ — IDENTICAL to the app's estLandedBdt (the Browse card "product price"): component-wise
  // rounding (productBdt, commission, logistics rounded separately), BEFORE the per-order ৳100 fee.
  // The basket adds the fee once → basket total = this + ৳100 for a single item.
  const landed = (pkr, c) => { const pb = Math.round(pkr * conv); return pb + Math.round(pb * comm1) + Math.round(wOf(c) * log); };

  let products = (cat.products || []).filter(p => p && p.u && p.pkr && p.img);

  // brand round-robin index, SCOPED PER CATEGORY (nth item of this brand WITHIN this category,
  // in source order). Category-scoped (not global) so any category filter OR keyword search
  // round-robins brands one-per-round instead of clustering the brand whose first catalog
  // items happen to match (req: "kids" returned 6/8 from one brand). Within a category tier in
  // qSort, _bi=0 items (one per brand) sort first, then _bi=1, etc.
  const seen = {};
  products.forEach(p => { const k = (p.b || '') + '|' + (p.cat || ''); p._bi = (seen[k] = (seen[k] || 0) + 1) - 1; });
  // ── Default landing order (req 2026-06-20): NO new-first. A WOMEN-PRET hero feed with a
  // light, EVERY-PAGE accent of a couple sale + one-two girls items; everything else trails.
  // Brand round-robin is a HIGH-priority sort key so every page / category / search shows
  // VARIED suppliers, not a wall of the biggest brand. ──
  const sizeOf = p => Array.isArray(p.sz) ? p.sz.length : 0;
  // Apparel is the hero; footwear/accessories/shawls/single-dupattas must NOT lead the landing.
  const heroRank = c => /^(footwear|accessories|shawl|dupatta_only)$/.test(c || '') ? 1 : 0;
  // EASTERN (desi) wear leads WESTERN within EVERY gender (req 2026-06-21: "if no specs given,
  // eastern shows first"). Western cats are the explicit minority — everything else
  // (kurta/shalwar/lawn/abaya/saree/sherwani/eastern-kids/etc.) is eastern. Within women, PRET
  // still leads the rest of eastern (brand-identity hero).
  const WESTERN = new Set([
    'western_top', 'maxi_dress', 'womens_trouser', 'coord_western', 'gown',
    'mens_shirt', 'mens_jeans', 'mens_trouser', 'mens_suit',
    'kids_boys_western', 'kids_girls_western',
  ]);
  const eastRank = c => WESTERN.has(c || '') ? 1 : 0;   // eastern (0) before western (1), all genders
  const WOMEN_PRET = new Set(['pret_3pc', 'pret_3pc_emb', 'pret_2pc_emb']);
  const womenPretRank = c => (genderOf(c) === 'w' && WOMEN_PRET.has(c)) ? 0 : 1;
  const qSort = (a, b) =>
    (heroRank(a.cat) - heroRank(b.cat))          // apparel before footwear/accessories
    || (genderRank(a.cat) - genderRank(b.cat))   // women first
    || (womenPretRank(a.cat) - womenPretRank(b.cat)) // within women: PRET first
    || (eastRank(a.cat) - eastRank(b.cat))       // EASTERN wear before western (every gender)
    || (a._bi - b._bi)                           // BRAND round-robin → varied suppliers (high priority)
    || (sizeOf(b) - sizeOf(a))                   // then best-stocked
    || ((b.pub || 0) - (a.pub || 0));            // then newer
  const isGirls = c => /^kids_girls_/.test(c || '');
  const qMain  = products.filter(p => !p.sale && !isGirls(p.cat)).sort(qSort);   // women-pret-first hero feed
  const qSale  = products.filter(p =>  p.sale).sort(qSort);
  const qGirls = products.filter(p => !p.sale && isGirls(p.cat)).sort(qSort);
  const PAGE = 24, SALE_PER_PAGE = 3, GIRLS_PER_PAGE = 2;   // per page: a couple sale + one-two girls accents
  const ordered = [];
  let iM = 0, iS = 0, iG = 0;
  while (iM < qMain.length || iS < qSale.length || iG < qGirls.length) {
    const start = ordered.length; let sale = 0, girls = 0;
    while (ordered.length - start < PAGE) {
      const slot = ordered.length - start;
      if (iG < qGirls.length && girls < GIRLS_PER_PAGE && (slot === 8 || slot === 18)) { ordered.push(qGirls[iG++]); girls++; }
      else if (iS < qSale.length && sale < SALE_PER_PAGE && (slot === 4 || slot === 12 || slot === 20)) { ordered.push(qSale[iS++]); sale++; }
      else if (iM < qMain.length) { ordered.push(qMain[iM++]); }     // women-pret hero fill
      else if (iG < qGirls.length) { ordered.push(qGirls[iG++]); }   // leftover girls
      else if (iS < qSale.length) { ordered.push(qSale[iS++]); }     // leftover sale
      else break;
    }
    if (ordered.length === start) break;   // safety: no progress
  }

  // EASTERN-FIRST final pass (req): the sale/girls interleave above can drop a western item into
  // an early slot, so reorder WITHIN EACH gender's own landing slots to put eastern wear ahead of
  // western. Done per-gender so the women-first → men → kids gender order is untouched; Array.sort
  // is stable so the best-stocked/new (and women-PRET-first) ranking from qSort is preserved within
  // each eastern/western run. This makes category-filtered + keyword views (which read p.ord) lead
  // eastern when the buyer gives no sort/category spec.
  ['w', 'm', 'k'].forEach(g => {
    const pos = [], items = [];
    ordered.forEach((p, i) => { if (genderOf(p.cat) === g) { pos.push(i); items.push(p); } });
    items.sort((a, b) => eastRank(a.cat) - eastRank(b.cat));
    pos.forEach((p, k) => { ordered[p] = items[k]; });
  });
  products = ordered;

  const tmp = DB_PATH + '.new';
  ['', '-journal', '-wal', '-shm'].forEach(s => { try { fs.unlinkSync(tmp + s); } catch (e) {} });
  const db = new Database(tmp);
  db.exec(`
    CREATE TABLE products (
      id INTEGER PRIMARY KEY,
      b TEXT, t TEXT, u TEXT, img TEXT,
      pkr INTEGER, cat TEXT, sz TEXT, sale INTEGER, pub INTEGER,
      bdt INTEGER, gender TEXT, ord INTEGER,
      dual INTEGER, altform TEXT, altbdt INTEGER
    );
  `);
  const ins = db.prepare(`INSERT INTO products (b,t,u,img,pkr,cat,sz,sale,pub,bdt,gender,ord,dual,altform,altbdt)
    VALUES (@b,@t,@u,@img,@pkr,@cat,@sz,@sale,@pub,@bdt,@gender,@ord,@dual,@altform,@altbdt)`);
  const tx = db.transaction(list => {
    list.forEach((p, i) => ins.run({
      b: p.b || '', t: p.t || '', u: p.u || '', img: p.img || '',
      pkr: p.pkr | 0, cat: p.cat || '', sz: JSON.stringify(p.sz || []),
      sale: p.sale ? 1 : 0, pub: p.pub | 0,
      bdt: landed(p.pkr, p.cat), gender: genderOf(p.cat), ord: i,
      dual: p.dual ? 1 : 0, altform: p.altform || '', altbdt: (p.dual ? landed(p.altpkr | 0, p.altcat || '') : 0),
    }));
  });
  tx(products);
  db.exec(`
    CREATE INDEX idx_cat   ON products(cat);
    CREATE INDEX idx_brand ON products(b);
    CREATE INDEX idx_bdt   ON products(bdt);
    CREATE INDEX idx_pub   ON products(pub);
    CREATE INDEX idx_ord   ON products(ord);
    CREATE INDEX idx_sale  ON products(sale);
    CREATE VIRTUAL TABLE products_fts USING fts5(b, t, content='products', content_rowid='id');
    INSERT INTO products_fts(rowid, b, t) SELECT id, b, t FROM products;
  `);
  db.close();

  fs.renameSync(tmp, DB_PATH);                                   // atomic swap
  ['-journal', '-wal', '-shm'].forEach(s => { try { fs.unlinkSync(tmp + s); } catch (e) {} });
  console.log(`built ${DB_PATH}: ${products.length} products in ${Date.now() - t0}ms (conv=${conv}, log=${log}, comm1=${comm1})`);
})().catch(e => { console.error('BUILD FAILED:', e.message); process.exit(1); });
