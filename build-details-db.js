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
const DESC_CAP = 2000;
const SEC_CAP = 1200;

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
    let text = String(sections[rawLabel] || '').replace(/\s+/g, ' ').trim();
    if (text.length < 8) continue;
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
    let desc = String(o.desc || '').replace(/\s+/g, ' ').trim();
    if (desc.length > DESC_CAP) desc = desc.slice(0, DESC_CAP).replace(/\s+\S*$/, '') + '…';
    const rows = buildRows(o.sections);
    const imgs = Array.isArray(o.imgs) ? o.imgs.filter(x => typeof x === 'string' && /^https?:/i.test(x)).slice(0, 12) : [];
    if (!desc && !rows.length && !imgs.length){ empty++; continue; }
    const j = JSON.stringify({ desc, sections: rows, imgs });
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
