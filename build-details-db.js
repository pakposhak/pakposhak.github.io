'use strict';
/*
 * build-details-db.js — builds the read-only SQLite "product details" DB for the Browse popup.
 *
 * Reads product-pages.jsonl (the rendered-HTML scrape from scan-product-pages.js: one row per
 * product = { u, host, b, desc, sections:{Label:text,...}, imgs:[...] }) and writes an INDEXED
 * SQLite DB that search-server.js serves at GET /search/details?u=<product url>.
 *
 * Why a SEPARATE db (not folded into search.db): product details change only when we RE-SCRAPE
 * (rare), not on the 3-hourly search.db rebuild. Keeping it separate means the frequent rebuild
 * never re-processes 44MB of HTML text, and a search.db rebuild can never wipe the details. If
 * details.db is absent the endpoint just returns {found:false} and the popup falls back to the
 * brand's own .js (current behaviour).
 *
 * The payload is made DISPLAY-READY here so the server + client stay dumb:
 *   - sections object -> ordered [ [label, text], ... ] array
 *   - drop the "Description"-labelled section (the top-level `desc` already carries it)
 *   - drop merchandising blocks that leaked through the scraper's keep-filter
 *     ("Shop By Fabric", "Winter/Summer Fabrics", "Featured")
 *   - Title-Case ALL-CAPS labels, strip a trailing ":"
 *   - cap section text (1200) and desc (2000) for popup readability
 *   - key each row by `seg` = last path segment (Shopify handle OR SFCC .html file), lowercased,
 *     EXACTLY as search-server.js's lastSeg() does, so the URL lookup is an indexed exact match.
 *
 * Atomic: builds <db>.new then renames over <db>, so a running search-server never reads a
 * half-built file (it watchFiles the path and reopens).
 *
 * Run (on the VPS):
 *   PSB_PAGES=/opt/pakiposhak/product-pages.jsonl PSB_DETAILS_DB=/opt/psb-search/details.db \
 *     node build-details-db.js
 * Env: PSB_PAGES (default product-pages.jsonl), PSB_DETAILS_DB (default details.db)
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const SRC = process.env.PSB_PAGES || path.join(__dirname, 'product-pages.jsonl');
const OUT = process.env.PSB_DETAILS_DB || path.join(__dirname, 'details.db');
// Generous caps — the scraper already caps each section/desc at 2500 chars, so these never bite
// real product detail; they only guard against a pathological page. "Show ALL details" (user req).
const DESC_CAP = 4000;
const SEC_CAP = 4000;
// collapse only HORIZONTAL whitespace, KEEP the newlines the scraper now preserves (line structure)
const HWS = '[ \\t\\f\\v\\u00a0\\u2000-\\u200a\\u202f\\u205f\\u3000]';   // horizontal whitespace incl. nbsp / unicode spaces
const keepLines = s => String(s || '').replace(/\r\n?/g, '\n').replace(new RegExp(HWS + '+', 'g'), ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim();
// size-chart inputs (joined per-product by brand + gender) — see resolveSC() below
const CATALOG = process.env.PSB_CATALOG || path.join(__dirname, 'catalog.json');
const SIZECHARTS = process.env.PSB_SIZECHARTS || path.join(__dirname, 'size-charts.json');
const PCHARTS = process.env.PSB_PCHARTS || path.join(__dirname, 'product-charts.jsonl');   // per-product exact charts (raw fallback)
const PCHARTS_DEDUP = process.env.PSB_PCHARTS_DEDUP || path.join(__dirname, 'product-charts-deduped.json');   // deduped: unique charts + links
const famOf = cat => { cat = cat || ''; if (cat.indexOf('kids_') === 0) return 'kids'; if (cat.indexOf('mens_') === 0) return 'men'; if (cat === 'footwear') return 'footwear'; return 'women'; };
// size-chart bucket — controls WHICH chart may appear on a product. Stricter than famOf: also separates
// LOOSE garments (abaya/kaftan) from fitted, and returns 'none' for unstitched fabric / dupatta / shawl /
// saree (no size at all). Prevents men's sizes on women, a kaftan chart on a single-piece kurti, and any
// chart on unstitched cloth. Applied to BOTH the product's category and each chart item's category.
const sizeKey = cat => { cat = cat || '';
  if (/unstitch|^dupatta_only$|^shawl$|^saree$|^handmade_emb$/.test(cat)) return 'none';
  if (cat === 'footwear') return 'footwear';
  if (cat.indexOf('kids_') === 0) return 'kids';
  if (cat === 'abaya' || cat === 'kaftan') return 'women-loose';
  if (cat.indexOf('mens_') === 0) return 'men';
  return 'women';
};
// a real size-chart table = a >=2-col grid (>=2 such rows) with no unrendered JS/Liquid template cells
const okTable = t => Array.isArray(t) && t.filter(r => Array.isArray(r) && r.length >= 2).length >= 2 && !t.flat().some(c => /\$\{|\{\{|\}\}|\[i\]/.test(String(c)));

// last non-empty path segment, lowercased — MUST match search-server.js lastSeg().
function lastSeg(pathname){ const s = (pathname || '').split('/').filter(Boolean); return s.length ? s[s.length - 1].toLowerCase() : ''; }
function segOf(u){ try { return lastSeg(new URL(u).pathname); } catch (e) { return lastSeg(String(u || '').replace(/[?#].*$/, '')); } }
function hostOf(u){ try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { return ''; } }

// merchandising blocks that matched the scraper's KEEP pattern but are store nav, not product info
const MERCH = /^shop\s*by\b|^featured$|^(winter|summer|spring|autumn|fall)\s+fabrics?$|^new\s+arrivals?$/i;
function cleanLabel(raw){
  let l = String(raw || '').replace(/\s+/g, ' ').replace(/\s*:\s*$/, '').trim();
  if (!l) return '';
  // Title-Case a SHOUTING label (no lowercase letters present); leave mixed-case ("Wash & Care") as-is
  if (/[A-Z]/.test(l) && l === l.toUpperCase()) l = l.replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
  return l.slice(0, 60);
}
// Turn the sections object into an ordered, cleaned, de-duped [label,text][] array.
function buildRows(sections){
  const rows = [], seen = new Map();   // lowercased label -> index in rows (keep the richer text)
  for (const rawLabel of Object.keys(sections || {})){
    if (MERCH.test(String(rawLabel).trim())) continue;
    if (/^description\b/i.test(String(rawLabel).trim())) continue;   // desc carries it
    const label = cleanLabel(rawLabel);
    if (!label || MERCH.test(label)) continue;
    let text = keepLines(sections[rawLabel]);
    if (text.replace(/\s/g, '').length < 6) continue;
    if (text.length > SEC_CAP) text = text.slice(0, SEC_CAP).replace(/\s+\S*$/, '') + '…';
    const lk = label.toLowerCase();
    if (seen.has(lk)){ const i = seen.get(lk); if (text.length > rows[i][1].length) rows[i][1] = text; continue; }
    seen.set(lk, rows.length); rows.push([label, text]);
  }
  return rows;
}

function main(){
  if (!fs.existsSync(SRC)){ console.error('No source file: ' + SRC); process.exit(1); }
  const tmp = OUT + '.new';
  try { fs.unlinkSync(tmp); } catch (e) {}
  const db = new Database(tmp);
  db.pragma('journal_mode = OFF');
  db.pragma('synchronous = OFF');
  db.exec('CREATE TABLE details(seg TEXT, host TEXT, u TEXT, j TEXT)');
  const ins = db.prepare('INSERT INTO details(seg,host,u,j) VALUES(?,?,?,?)');

  // ── size-chart join: each product → its brand's chart (gender-matched, generic fallback) ──
  const SC = {};
  try { const raw = JSON.parse(fs.readFileSync(SIZECHARTS, 'utf8'));
    for (const brand of Object.keys(raw)){ const rec = { generic: { imgs: [], tables: [] } };
      for (const it of (raw[brand].items || [])){ const bk = it.cat ? (rec[sizeKey(it.cat)] = rec[sizeKey(it.cat)] || { imgs: [], tables: [] }) : rec.generic; if (it.img) bk.imgs.push(it.img); if (it.table && okTable(it.table)) bk.tables.push(it.table); }
      SC[brand] = rec; }
    console.log('size charts: ' + Object.keys(SC).length + ' brands');
  } catch (e) { console.log('(no size-charts.json — chart join skipped)'); }
  const uCat = {};
  try { const c = JSON.parse(fs.readFileSync(CATALOG, 'utf8')); for (const p of (c.products || [])) if (p && p.u) uCat[p.u] = p.cat || ''; } catch (e) {}
  // per-product EXACT charts (from each brand's size-chart app): u -> [{title, table}].
  // PREFER the DEDUPED store (unique charts once + product->chart links); fall back to the raw per-product jsonl.
  const uChart = {};
  let loaded = false;
  try { const dd = JSON.parse(fs.readFileSync(PCHARTS_DEDUP, 'utf8'));
    for (const u of Object.keys(dd.links || {})){ const arr = dd.links[u].map(id => dd.charts[id]).filter(Boolean); if (arr.length) uChart[u] = arr; }
    console.log('per-product charts: ' + Object.keys(uChart).length + ' products linked to ' + Object.keys(dd.charts || {}).length + ' UNIQUE charts (deduped)'); loaded = true;
  } catch (e) {}
  if (!loaded) try { let n = 0; for (const ln of fs.readFileSync(PCHARTS, 'utf8').split('\n')){ const s = ln.trim(); if (!s) continue; let o; try { o = JSON.parse(s); } catch (e) { continue; } if (o && o.u && Array.isArray(o.charts) && o.charts.length){ uChart[o.u] = o.charts; n++; } }
    console.log('per-product charts: ' + n + ' products (raw)'); } catch (e) { console.log('(no per-product charts — skipped)'); }
  const dedup = a => [...new Set(a)];
  const resolveSC = (brand, u, perSc) => {
    const pk = sizeKey(uCat[u] || '');
    if (pk === 'none') return { sc: [], scTable: [] };   // unstitched fabric / dupatta / shawl / saree: NO size chart
    // EXACT per-product chart (this product's OWN measurements, e.g. SHIRT + TROUSER) — most accurate, wins outright.
    const pc = uChart[u];
    if (pc && pc.length) return { sc: [], scTable: pc.slice(0, 4).map(c => ({ t: c.title || '', rows: c.table })).filter(x => Array.isArray(x.rows) && x.rows.length >= 2) };
    let imgs = (perSc || []).slice(), tables = [];
    const rec = SC[brand];
    if (rec){ const f = rec[pk] || { imgs: [], tables: [] };
      // bucket-matched ONLY (no cross-bucket fallback): a kaftan never shows a fitted-kurti chart, a women's
      // product never shows a men's/kids chart. A brand-wide (un-categorised) chart counts as fitted-adult only.
      imgs = imgs.concat(f.imgs); tables = tables.concat(f.tables);
      if (rec.generic && (pk === 'men' || pk === 'women')){ imgs = imgs.concat(rec.generic.imgs); tables = tables.concat(rec.generic.tables); } }
    return { sc: dedup(imgs).slice(0, 3), scTable: tables.slice(0, 2).map(t => ({ t: '', rows: t })) };
  };

  const lines = fs.readFileSync(SRC, 'utf8').split('\n');
  let seen = 0, wrote = 0, errRows = 0, empty = 0;
  const batch = [];
  const flush = db.transaction(rows => { for (const r of rows) ins.run(r[0], r[1], r[2], r[3]); });

  for (const ln of lines){
    const s = ln.trim(); if (!s) continue;
    let o; try { o = JSON.parse(s); } catch (e) { continue; }
    if (!o || !o.u) continue;
    seen++;
    if (o.err){ errRows++; continue; }
    let desc = keepLines(o.desc);
    if (desc.length > DESC_CAP) desc = desc.slice(0, DESC_CAP).replace(/\s+\S*$/, '') + '…';
    const rows = buildRows(o.sections);
    const imgs = Array.isArray(o.imgs) ? o.imgs.filter(x => typeof x === 'string' && /^https?:/i.test(x)).slice(0, 12) : [];
    const perSc = Array.isArray(o.sc) ? o.sc.filter(x => typeof x === 'string' && /^https?:/i.test(x)) : [];
    const { sc, scTable } = resolveSC(o.b, o.u, perSc);
    if (!desc && !rows.length && !imgs.length && !sc.length && !scTable.length){ empty++; continue; }
    const j = JSON.stringify({ desc, sections: rows, imgs, sc, scTable });
    const seg = segOf(o.u);
    if (!seg) continue;
    batch.push([seg, o.host || hostOf(o.u), o.u, j]);
    wrote++;
    if (batch.length >= 2000){ flush(batch.splice(0)); }
  }
  if (batch.length) flush(batch.splice(0));
  db.exec('CREATE INDEX idx_details_seg ON details(seg)');
  db.close();
  fs.renameSync(tmp, OUT);
  const bytes = fs.statSync(OUT).size;
  console.log('details.db built: seen=' + seen + ' wrote=' + wrote + ' err=' + errRows + ' empty=' + empty +
    '  -> ' + OUT + ' (' + (bytes / 1048576).toFixed(1) + ' MB)');
}

main();
