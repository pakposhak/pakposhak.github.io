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

// Landed ৳BDT price buckets — MUST match the app's PS_BUCKETS (Under 3k / 3-4.5k / 4.5-6k / 6-8k / 8-10k / 10k+).
const BUCKETS = [[0, 3000], [3000, 4500], [4500, 6000], [6000, 8000], [8000, 10000], [10000, 1e12]];

let db = null;
function openDb(){
  try {
    const ndb = new Database(DB_PATH, { readonly: true, fileMustExist: true });
    ndb.pragma('query_only = true');
    const old = db; db = ndb;
    if (old) { try { old.close(); } catch (e) {} }
    console.log('opened', DB_PATH, '—', db.prepare('SELECT count(*) c FROM products').get().c, 'products');
  } catch (e) { console.error('openDb failed:', e.message); }
}
openDb();
// Reopen when build-search-db.js swaps in a new DB file (atomic rename).
try { fs.watchFile(DB_PATH, { interval: 5000 }, (cur, prev) => { if (cur.mtimeMs !== prev.mtimeMs) { console.log('db changed — reopening'); openDb(); } }); } catch (e) {}

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

  const sort = q.get('sort') || '';
  let orderBy = 'p.ord ASC';
  if (sort === 'asc') orderBy = 'p.bdt ASC, p.ord ASC';
  else if (sort === 'desc') orderBy = 'p.bdt DESC, p.ord ASC';
  else if (sort === 'new') { where.push('p.sale = 0'); orderBy = 'p.pub DESC, p.ord ASC'; }

  const fts = ftsQuery(q.get('q'));
  if (fts) { where.push('p.id IN (SELECT rowid FROM products_fts WHERE products_fts MATCH ?)'); args.push(fts); }

  const whereSql = where.length ? ('WHERE ' + where.join(' AND ')) : '';
  let page = parseInt(q.get('page') || '0', 10); if (!(page >= 0)) page = 0;
  let pageSize = parseInt(q.get('pageSize') || '24', 10); if (!(pageSize >= 1)) pageSize = 24; if (pageSize > 60) pageSize = 60;

  try {
    const total = db.prepare(`SELECT count(*) c FROM products p ${whereSql}`).get(...args).c;
    const rows = db.prepare(
      `SELECT p.b,p.t,p.u,p.img,p.pkr,p.cat,p.sz,p.sale,p.pub,p.bdt FROM products p ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`
    ).all(...args, pageSize, page * pageSize);
    const products = rows.map(r => ({ b: r.b, t: r.t, u: r.u, img: r.img, pkr: r.pkr, cat: r.cat, sz: JSON.parse(r.sz || '[]'), sale: r.sale ? 1 : 0, pub: r.pub, bdt: r.bdt }));
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
  if (u.pathname === '/search/health') return send(res, 200, { ok: true, products: db ? db.prepare('SELECT count(*) c FROM products').get().c : 0 });
  send(res, 404, { error: 'not found' });
}).listen(PORT, '127.0.0.1', () => console.log('psb-search listening on 127.0.0.1:' + PORT));
