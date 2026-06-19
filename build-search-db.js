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

const CATALOG_URL = process.env.PSB_CATALOG_URL || 'https://pakposhak.github.io/catalog.json';
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
  const cfg = JSON.parse(cfgRaw) || {};
  const rates = (cfg && cfg.rates) || {};
  const weights = (cfg && cfg.weights) || {};
  const conv = rates.conv != null ? rates.conv : 0.455;
  const log  = rates.log  != null ? rates.log  : 1600;
  const comm1 = (rates.comm_1 != null ? rates.comm_1 : 22) / 100;   // config stores percent
  // Per-category fallback weights (kg) for when the relay config doesn't carry one —
  // must match the app's DEFAULT_WEIGHTS for the kids 7-cat taxonomy so the search.db
  // landed ৳ equals what the app computes. Relay config weights still override these.
  const DEFAULT_WEIGHTS = {
    kids_boys_eastern: 0.50, kids_girls_eastern: 0.48, kids_boys_western: 0.50,
    kids_girls_western: 0.45, kids_boys_formal: 0.60, kids_girls_formal: 0.60, kids_infant: 0.35,
  };
  const wOf = c => (weights[c] != null ? weights[c] : (DEFAULT_WEIGHTS[c] != null ? DEFAULT_WEIGHTS[c] : 0.6));
  // landed ৳ — identical to the app's estLandedBdt: pkr*conv*(1+comm1) + weight*log
  const landed = (pkr, c) => Math.round(pkr * conv * (1 + comm1) + wOf(c) * log);

  let products = (cat.products || []).filter(p => p && p.u && p.pkr && p.img);

  // brand round-robin index (nth item of its brand, in source order) — for varied default order
  const seen = {};
  products.forEach(p => { p._bi = (seen[p.b] = (seen[p.b] || 0) + 1) - 1; });
  const NOW = Date.now() / 1000, RECENT = 120 * 86400;
  const recent = p => (p.pub && (NOW - p.pub) < RECENT) ? 0 : 1;
  // Default front-page order: women first, then on-sale, then recently published, then brand
  // round-robin for variety, then newest. (Mirrors the app's default ordering intent.)
  products.sort((a, b) =>
    (genderRank(a.cat) - genderRank(b.cat))
    || ((b.sale ? 1 : 0) - (a.sale ? 1 : 0))
    || (recent(a) - recent(b))
    || (a._bi - b._bi)
    || ((b.pub || 0) - (a.pub || 0))
  );

  const tmp = DB_PATH + '.new';
  ['', '-journal', '-wal', '-shm'].forEach(s => { try { fs.unlinkSync(tmp + s); } catch (e) {} });
  const db = new Database(tmp);
  db.exec(`
    CREATE TABLE products (
      id INTEGER PRIMARY KEY,
      b TEXT, t TEXT, u TEXT, img TEXT,
      pkr INTEGER, cat TEXT, sz TEXT, sale INTEGER, pub INTEGER,
      bdt INTEGER, gender TEXT, ord INTEGER
    );
  `);
  const ins = db.prepare(`INSERT INTO products (b,t,u,img,pkr,cat,sz,sale,pub,bdt,gender,ord)
    VALUES (@b,@t,@u,@img,@pkr,@cat,@sz,@sale,@pub,@bdt,@gender,@ord)`);
  const tx = db.transaction(list => {
    list.forEach((p, i) => ins.run({
      b: p.b || '', t: p.t || '', u: p.u || '', img: p.img || '',
      pkr: p.pkr | 0, cat: p.cat || '', sz: JSON.stringify(p.sz || []),
      sale: p.sale ? 1 : 0, pub: p.pub | 0,
      bdt: landed(p.pkr, p.cat), gender: genderOf(p.cat), ord: i,
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
