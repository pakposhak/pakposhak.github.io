'use strict';
/*
 * search-server.js — PakPoshak Browse-Products search API (read-only).
 *
 * Serves a single endpoint that returns only the FILTERED PAGE of products from the
 * SQLite DB built by build-search-db.js — so the browser never downloads the whole
 * catalog. Runs on 127.0.0.1:8788; Caddy fronts it at https://.../search.
 *
 *   GET /search?cat=a,b&brand=x,y&price=0,2&sort=asc|desc|new&q=lawn&page=0&pageSize=24
 *   GET /search/health
 *
 * Filters combine with AND; price buckets and multi-value cat/brand combine as OR within
 * themselves — same semantics as the in-page filters. Read-only; reopens the DB when the
 * loader atomically swaps in a fresh build.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const PORT = (process.env.PSB_SEARCH_PORT | 0) || 8788;
const DB_PATH = process.env.PSB_DB || path.join(__dirname, 'search.db');
const DETAILS_DB = process.env.PSB_DETAILS_DB || path.join(__dirname, 'details.db');

// Landed ৳BDT price buckets — MUST match the app's PS_BUCKETS (Under 3k / 3-4.5k / 4.5-6k / 6-8k / 8-10k / 10-15k / 15k+).
// batch 2: the old 10k+ bucket is split at 15k so Home/Everyday can show under-15k and Premium/Luxe stays 10k+.
const BUCKETS = [[0, 3000], [3000, 4500], [4500, 6000], [6000, 8000], [8000, 10000], [10000, 15000], [15000, 1e12]];

let db = null;
let ddb = null;  // product-detail DB (build-details-db.js); optional — absent ⇒ /search/details reports found:false
let ORD_N = 0;   // MAX(ord)+1 — rotation modulus base; recomputed on each DB (re)open
let HAS_PRI = false;   // does the open DB carry the `pri` priority column? (build-search-db.js 2026-07-02).
                       // Detected per-open so a search.db built by an OLD builder still serves (falls back to PRETLEAD).
function openDb(){
  try {
    const ndb = new Database(DB_PATH, { readonly: true, fileMustExist: true });
    ndb.pragma('query_only = true');
    const old = db; db = ndb;
    if (old) { try { old.close(); } catch (e) {} }
    console.log('opened', DB_PATH, '—', db.prepare('SELECT count(*) c FROM products').get().c, 'products');
    try { ORD_N = db.prepare('SELECT IFNULL(MAX(ord),0)+1 n FROM products').get().n; } catch (e) { ORD_N = 0; }
    try { HAS_PRI = db.prepare("SELECT COUNT(*) c FROM pragma_table_info('products') WHERE name='pri'").get().c > 0; } catch (e) { HAS_PRI = false; }
  } catch (e) { console.error('openDb failed:', e.message); }
}
openDb();
// Reopen when build-search-db.js swaps in a new DB file (atomic rename).
try { fs.watchFile(DB_PATH, { interval: 5000 }, (cur, prev) => { if (cur.mtimeMs !== prev.mtimeMs) { console.log('db changed — reopening'); openDb(); } }); } catch (e) {}

// Optional product-detail DB (built by build-details-db.js). Read-only; if absent the
// /search/details endpoint returns {found:false} and the popup falls back to the brand .js.
function openDetails(){
  try {
    const ndb = new Database(DETAILS_DB, { readonly: true, fileMustExist: true });
    ndb.pragma('query_only = true');
    const old = ddb; ddb = ndb;
    if (old) { try { old.close(); } catch (e) {} }
    console.log('opened', DETAILS_DB, '—', ddb.prepare('SELECT count(*) c FROM details').get().c, 'detail rows');
  } catch (e) { ddb = null; console.log('details db not loaded (' + e.message + ') — /search/details will report found:false'); }
}
openDetails();
try { fs.watchFile(DETAILS_DB, { interval: 5000 }, (cur, prev) => { if (cur.mtimeMs !== prev.mtimeMs) { console.log('details db changed — reopening'); openDetails(); } }); } catch (e) {}

// Turn free-text keywords into a safe FTS5 prefix-AND query. Tokens are alphanumeric only
// (so safe as barewords — no injection); FTS5 reserved words are dropped so they can't be
// parsed as operators.
function ftsQuery(q){
  const RESERVED = { and: 1, or: 1, not: 1, near: 1 };
  const toks = (String(q || '').toLowerCase().match(/[a-z0-9]+/g) || []).filter(t => !RESERVED[t]);
  if (!toks.length) return null;
  return toks.slice(0, 6).map(t => t + '*').join(' AND ');
}

function send(res, code, obj){
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',          // public, read-only product data
    'Cache-Control': 'public, max-age=60',
  });
  res.end(JSON.stringify(obj));
}

// Facets: the brand + category universe (grid-visible only) so the frontend can build its
// filter checkboxes/counts without downloading the whole catalog. Small, cacheable.
function handleFacets(res){
  if (!db) return send(res, 503, { error: 'search db not ready' });
  try {
    const brands = db.prepare("SELECT b, count(*) n FROM products WHERE cat <> 'accessories' GROUP BY b ORDER BY n DESC, b").all();
    const cats = db.prepare("SELECT cat, count(*) n FROM products WHERE cat <> 'accessories' GROUP BY cat").all();
    const total = db.prepare("SELECT count(*) c FROM products WHERE cat <> 'accessories'").get().c;
    send(res, 200, { total, brands, cats });
  } catch (e) { send(res, 500, { error: e.message }); }
}

// Brand → {category: count} map for the WHOLE catalogue. Lets Browse Brands build its
// brand-index (which brand makes what, + strength counts) WITHOUT the browser ever
// downloading catalog.json — the same data the in-page bbBuildIndex() derived from
// PS_CATALOG. Bounded by brand×category (~155 brands), so it stays tiny as the product
// count grows toward 100k. Accessories are KEPT here (unlike the grid) so brand totals
// match the old PS_CATALOG-based counts exactly.
function handleBrandIndex(res){
  if (!db) return send(res, 503, { error: 'search db not ready' });
  try {
    const rows = db.prepare('SELECT b, cat, count(*) n FROM products GROUP BY b, cat').all();
    const brands = {};
    for (const r of rows){ (brands[r.b] = brands[r.b] || {})[r.cat] = r.n; }
    send(res, 200, { brands });
  } catch (e) { send(res, 500, { error: e.message }); }
}

// AUTHORITATIVE category-by-URL lookup. Given a product URL (or PK-twin URL) the order form
// returns the SAME catalogue category the Browse card shows — so the basket weight/price matches
// the pic exactly, instead of the order form re-guessing (which has no kids signal for neutral
// titles like "Basic T-Shirt"). Matches on the LAST path segment (the product handle for Shopify
// /products/<handle> AND the .html file for SFCC brands like Khaadi/Sapphire) → 100% URL coverage,
// host-disambiguated, ignoring ?variant= and www/twin-host differences. Returns {found,cat,bdt,b,sz}.
function lastSeg(pathname){ const s = (pathname || '').split('/').filter(Boolean); return s.length ? s[s.length - 1].toLowerCase() : ''; }
function handleByUrl(u, res){
  if (!db) return send(res, 503, { error: 'search db not ready' });
  const raw = u.searchParams.get('u') || '';
  let seg = '', host = '';
  try { const x = new URL(raw); host = x.hostname.replace(/^www\./, '').toLowerCase(); seg = lastSeg(x.pathname); }
  catch (e) { seg = lastSeg(String(raw).replace(/[?#].*$/, '')); }
  if (!/^[a-z0-9._%+-]{2,160}$/.test(seg)) return send(res, 200, { found: false });
  try {
    // LIKE is a cheap prefilter (its _ / % wildcards may over-match); the exact lastSeg=== check below
    // is the authority. Parameterised → no injection.
    const cand = db.prepare("SELECT b,u,cat,bdt,sz FROM products WHERE u LIKE ? COLLATE NOCASE").all('%' + seg + '%');
    const exact = cand.filter(r => { try { return lastSeg(new URL(r.u).pathname) === seg; } catch (e) { return false; } });
    if (!exact.length) return send(res, 200, { found: false });
    let pick = exact[0];
    if (host && exact.length > 1) { const h = exact.find(r => (r.u || '').toLowerCase().includes(host)); if (h) pick = h; }
    send(res, 200, { found: true, cat: pick.cat, bdt: pick.bdt, b: pick.b, sz: JSON.parse(pick.sz || '[]') });
  } catch (e) { send(res, 500, { error: e.message }); }
}

// Product DETAILS by URL — the rendered-page scrape (description + Fabric/Care/etc. sections +
// gallery images) for the Browse popup, so the buyer gets the full product info (INCLUDING SFCC
// brands like Khaadi/Sapphire that have no .js feed) without leaving for the brand site. Mirrors
// handleByUrl's last-segment + host match; the payload is pre-cleaned by build-details-db.js, so
// this just returns it. Absent details db ⇒ {found:false} and the popup falls back to the .js.
function handleDetails(u, res){
  if (!ddb) return send(res, 200, { found: false });
  const raw = u.searchParams.get('u') || '';
  let seg = '', host = '';
  try { const x = new URL(raw); host = x.hostname.replace(/^www\./, '').toLowerCase(); seg = lastSeg(x.pathname); }
  catch (e) { seg = lastSeg(String(raw).replace(/[?#].*$/, '')); }
  if (!/^[a-z0-9._%+-]{2,160}$/.test(seg)) return send(res, 200, { found: false });
  try {
    const cand = ddb.prepare('SELECT host,u,j FROM details WHERE seg = ? COLLATE NOCASE').all(seg);
    if (!cand.length) return send(res, 200, { found: false });
    let pick = cand[0];
    if (host && cand.length > 1) { const h = cand.find(r => (r.host || '').includes(host) || (r.u || '').toLowerCase().includes(host)); if (h) pick = h; }
    let j; try { j = JSON.parse(pick.j || '{}'); } catch (e) { j = {}; }
    send(res, 200, { found: true, desc: j.desc || '', sections: j.sections || [], imgs: j.imgs || [], sc: j.sc || [], scTable: j.scTable || [] });
  } catch (e) { send(res, 500, { error: e.message }); }
}

function handleSearch(u, res){
  if (!db) return send(res, 503, { error: 'search db not ready' });
  const q = u.searchParams;
  const where = [], args = [];

  // Mirror the app: the Browse-Products grid hides 'accessories' (they stay in the DB for
  // other views). Pass include_hidden=1 to include them.
  if (q.get('include_hidden') !== '1') where.push("p.cat <> 'accessories'");

  const cats = (q.get('cat') || '').split(',').map(s => s.trim()).filter(Boolean);
  if (cats.length) { where.push('p.cat IN (' + cats.map(() => '?').join(',') + ')'); args.push(...cats); }

  const brands = (q.get('brand') || '').split(',').map(s => s.trim()).filter(Boolean);
  if (brands.length) { where.push('p.b IN (' + brands.map(() => '?').join(',') + ')'); args.push(...brands); }

  const pidx = (q.get('price') || '').split(',').map(s => parseInt(s, 10)).filter(n => n >= 0 && n < BUCKETS.length);
  if (pidx.length) {
    where.push('(' + pidx.map(() => '(p.bdt >= ? AND p.bdt < ?)').join(' OR ') + ')');
    pidx.forEach(i => { args.push(BUCKETS[i][0], BUCKETS[i][1]); });
  }

  if (q.get('sale') === '1') where.push('p.sale = 1');

  // Women-PRET always leads (brand identity), even when the buyer sorts by New or price or
  // filters Sale — then the chosen intent orders WITHIN that, and p.ord (which carries the
  // women-pret-first + girls/sale interleave + brand diversity) is the final tiebreaker.
  const PRETLEAD = "(CASE WHEN p.cat IN ('pret_3pc','pret_3pc_emb','pret_2pc_emb') THEN 0 ELSE 1 END)";
  const sort = q.get('sort') || '';
  // New is a FILTER (newest non-sale items) that the price sort orders WITHIN — so New and a
  // ৳ price sort STACK (multilevel: New + Low→High = newest arrivals, cheapest first). Legacy
  // clients that still send sort=new are treated as the same New filter (newest-first).
  const newOnly = q.get('new') === '1' || sort === 'new';
  if (newOnly) where.push('p.sale = 0');
  let orderBy = 'p.ord ASC';   // default landing already leads women-pret via p.ord
  if (sort === 'asc') orderBy = PRETLEAD + ' ASC, p.bdt ASC, p.ord ASC';
  else if (sort === 'desc') orderBy = PRETLEAD + ' ASC, p.bdt DESC, p.ord ASC';
  else if (newOnly) orderBy = PRETLEAD + ' ASC, p.pub DESC, p.ord ASC';   // New + no price sort → newest first

  // Age/size BOOST ("boys 14" → 14Y-sized boys items first). Floats products whose size list
  // contains the typed token to the top, keeping everything else after. Alphanumeric-validated
  // (1–4 chars) so it's safe to inline into the ORDER BY.
  const sizeBoost = (q.get('size') || '').trim().toLowerCase();
  if (/^[a-z0-9]{1,4}$/.test(sizeBoost)) orderBy = "(instr(lower(p.sz), '" + sizeBoost + "') > 0) DESC, " + orderBy;

  const fts = ftsQuery(q.get('q'));
  if (fts) { where.push('p.id IN (SELECT rowid FROM products_fts WHERE products_fts MATCH ?)'); args.push(fts); }

  // 90s rotation: ?seed=N rotates WHICH curated products lead — not only on the plain landing but
  // WITHIN any active category / brand / price / sale / text-search filter too (req: "front-page
  // products keep changing within the selected category/brand", instead of the same first images
  // every time). p.pri leads (0-3 rank: famous women's-stitched first — built in build-search-db.js);
  // a seeded multiplicative hash of p.ord shuffles WITHIN each pri tier so the page feels fresh
  // ~every 90s without re-harvesting AND famous women's-stitched still leads every page (req
  // 2026-07-02 — before this, the hash scrambled p.ord's brand priority, halving famous density in
  // the live seeded view). The multiplier is always large so low-ord items actually rotate and
  // consecutive seeds jump far apart. Skipped only when the buyer imposed their OWN order — an
  // explicit ৳ price sort, the New filter, or an age/size boost — and when no seed is sent (then
  // byte-identical to the default p.ord order). `pri` COALESCEs to PRETLEAD so an OLD search.db
  // built before the column existed still serves (graceful during a staggered deploy).
  // FAMOUS_GAP: within each women-stitched / rest tier, famous brands take every slot while
  // non-famous take every Nth — so a famous-led feed still SPRINKLES in ~pageSize/N non-famous
  // per page (req 2026-07-02: "few pictures of other non-famous brands as well"), instead of a
  // pure famous wall. 12 ≈ two non-famous per 24-item page. Implemented via a windowed ROW_NUMBER
  // interleave in the seeded branch below.
  const FAMOUS_GAP = 12;
  const _seed = q.get('seed');
  const seeded = _seed != null && /^[0-9]{1,15}$/.test(_seed) && !sort && q.get('new') !== '1' && !/^[a-z0-9]{1,4}$/.test(sizeBoost) && ORD_N > 1;
  let _mult = 0;
  if (seeded) {
    _mult = 2000003 + ((parseInt(_seed, 10) * 524287) % 1000000);
    // Fallback (no pri column, e.g. a search.db from an older builder mid-deploy): keep the old
    // PRETLEAD-then-hash behaviour so the server still serves cleanly.
    if (!HAS_PRI) orderBy = PRETLEAD + ' ASC, (((p.ord + 1) * ' + _mult + ') % 2147483647) ASC, p.ord ASC';
  }
  // Seeded + pri available → windowed interleave (famous-first WITH sprinkle, rotating). Uses pri's
  // two bits: women-stitched tier = pri/2 (0 leads), fame = pri%2 (0 = famous). ROW_NUMBER ranks each
  // (tier,fame) group by the seed hash; multiplying the non-famous rank by FAMOUS_GAP threads them in
  // sparsely. Non-seeded / sort / new / size-boost paths keep the plain ORDER BY.
  const useInterleave = seeded && HAS_PRI;

  const whereSql = where.length ? ('WHERE ' + where.join(' AND ')) : '';
  let page = parseInt(q.get('page') || '0', 10); if (!(page >= 0)) page = 0;
  let pageSize = parseInt(q.get('pageSize') || '24', 10); if (!(pageSize >= 1)) pageSize = 24; if (pageSize > 60) pageSize = 60;

  try {
    const total = db.prepare(`SELECT count(*) c FROM products p ${whereSql}`).get(...args).c;
    const COLS = 'p.b,p.t,p.u,p.img,p.pkr,p.cat,p.sz,p.sale,p.pub,p.bdt,p.dual,p.altform,p.altbdt';
    const rowsSql = useInterleave
      ? `SELECT b,t,u,img,pkr,cat,sz,sale,pub,bdt,dual,altform,altbdt FROM (
           SELECT ${COLS}, (p.pri/2) AS _tier, (p.pri%2) AS _fame, p.ord AS _ord,
             ROW_NUMBER() OVER (PARTITION BY (p.pri/2),(p.pri%2) ORDER BY (((p.ord+1)*${_mult})%2147483647), p.ord) AS _rk
           FROM products p ${whereSql}
         ) ORDER BY _tier ASC, (_rk * CASE WHEN _fame=0 THEN 1 ELSE ${FAMOUS_GAP} END) ASC, _ord ASC LIMIT ? OFFSET ?`
      : `SELECT ${COLS} FROM products p ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
    const rows = db.prepare(rowsSql
    ).all(...args, pageSize, page * pageSize);
    const products = rows.map(r => ({ b: r.b, t: r.t, u: r.u, img: r.img, pkr: r.pkr, cat: r.cat, sz: JSON.parse(r.sz || '[]'), sale: r.sale ? 1 : 0, pub: r.pub, bdt: r.bdt, dual: r.dual ? 1 : 0, altform: r.altform || '', altbdt: r.altbdt || 0 }));
    send(res, 200, { total, page, pageSize, pages: Math.ceil(total / pageSize), products });
  } catch (e) { send(res, 400, { error: e.message }); }
}

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,OPTIONS', 'Access-Control-Max-Age': '86400' }); return res.end(); }
  if (req.method !== 'GET') return send(res, 405, { error: 'GET only' });
  if (u.pathname === '/search' || u.pathname === '/search/') return handleSearch(u, res);
  if (u.pathname === '/search/facets') return handleFacets(res);
  if (u.pathname === '/search/brand-index') return handleBrandIndex(res);
  if (u.pathname === '/search/by-url') return handleByUrl(u, res);
  if (u.pathname === '/search/details') return handleDetails(u, res);
  if (u.pathname === '/search/health') return send(res, 200, { ok: true, products: db ? db.prepare('SELECT count(*) c FROM products').get().c : 0, details: ddb ? ddb.prepare('SELECT count(*) c FROM details').get().c : 0 });
  send(res, 404, { error: 'not found' });
}).listen(PORT, '127.0.0.1', () => console.log('psb-search listening on 127.0.0.1:' + PORT));
