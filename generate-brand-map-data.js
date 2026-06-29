#!/usr/bin/env node
'use strict';
/**
 * generate-brand-map-data.js
 * Generates brand-map-data.json from brand-collections.json.
 * Run once after scan-brand-collections.js:
 *   node generate-brand-map-data.js
 * Output: brand-map-data.json (commit to repo alongside brand-map.html)
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'brand-collections.json');
const OUT = path.join(__dirname, 'brand-map-data.json');

const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const brands = Object.values(raw.brands);

// Brand's OWN explicit category (their Shopify product_type), keyed "host||handle", built by the
// VPS join (product-details.jsonl ptype x collection-membership). Authoritative where present.
const PTYPE = (function(){ try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'collection-ptype.json'), 'utf8')); } catch(e){ console.warn('  (no collection-ptype.json — BC-PT column will be blank)'); return {}; } })();

// ── Normalized path-dimension derivations for the Map review sheet (req: Danish). ───────────
// Each returns ONE value (or '' when unclear) regardless of WHERE it sits in a brand's menu
// path. Source = the collection TITLE (+ its sections). Blanks are intentional: they flag
// collections whose path we couldn't read, so they can be reviewed/fixed by hand.
const _lc = s => String(s || '').toLowerCase();
function deriveStitch(title){
  const s = _lc(title);
  const stitched = /\bpret\b|stitched|ready[\s-]?to[\s-]?wear|\brtw\b/.test(s);
  const unstitch = /unstitch|un[\s-]?stitch|unstiched|\bgreige\b|\byardage\b|\bfabrics?\b/.test(s);
  if (unstitch && !stitched) return 'Unstitched';
  if (stitched && !unstitch) return 'RTW';
  return '';
}
function deriveEW(title, sections){
  const sec = (sections || []).map(_lc);
  if (sec.includes('western')) return 'Western';
  if (sec.includes('eastern')) return 'Eastern';
  const s = _lc(title);
  if (/\bwestern\b|\btunic\b|t[\s-]?shirt|\btee\b|\bjeans\b|\bskirt\b|\bblazer\b|\bgown\b|\bdress\b|co[\s-]?ord|jumpsuit|\bpolo\b|hoodie|sweat|\bdenim\b|trouser pant/.test(s)) return 'Western';
  if (/kurta|kameez|shalwar|dupatta|\blawn\b|kurti|abaya|saree|\bsari\b|lehenga|sharara|gharara|\beastern\b|kaftan|angarkha|peshwas|anarkali|shadi|nikkah/.test(s)) return 'Eastern';
  return '';
}
function deriveSeason(title){
  const s = _lc(title);
  const m = s.match(/\b(winter|summer|spring|autumn|fall|eid|festive|mid[\s-]?summer|pre[\s-]?fall|resort|cruise)\b/);
  const y = title.match(/\b(20\d{2})\b/) || title.match(/['’](\d{2})\b/);
  const season = m ? m[1].replace(/^\w/, c => c.toUpperCase()) : '';
  const year = y ? (y[1].length === 4 ? y[1] : "'" + y[1]) : '';
  return [season, year].filter(Boolean).join(' ').trim();
}
function deriveOccasion(title){
  const s = _lc(title);
  for (const w of ['bridal','wedding','nikkah','mehndi','couture','luxury','luxe','premium','signature','party','formal','casual']){
    if (new RegExp('\\b' + w + '\\b').test(s)) return w.replace(/^\w/, c => c.toUpperCase());
  }
  return '';
}
// Catch-all "Others": fabric + work/technique descriptors a brand puts in the path that don't
// belong to any named column (Lawn, Organza, Hand Embroidery, Printed, Zari…). Joined with ·.
function deriveOthers(title){
  const t = String(title || '');
  const out = [], seen = new Set();
  const grab = re => { for (const m of t.matchAll(re)){ const v = m[1]; const k = v.toLowerCase().replace(/[\s-]+/g, ' ');
    if (!seen.has(k)){ seen.add(k); out.push(v.replace(/[\s-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())); } } };
  grab(/\b(lawn|organza|chiffon|cotton|cambric|khadd?ar|karandi|silk|velvet|net|linen|jacquard|viscose|georgette|tissue|jamawar|marina|woolen|wool|masoori|slub|twill|denim|leather|jamdani|grip)\b/gi);
  grab(/\b(hand[\s-]?embroidery|embroidered|embroidery|chikankari|schiffli|zari|adda|sequinned|sequins|sequin|digital[\s-]?printed|digital[\s-]?print|block[\s-]?printed|block[\s-]?print|printed|handmade|hand[\s-]?made|gota|mukaish|mirror[\s-]?work|tilla|kaamdani|resham|thread[\s-]?work|woven|foil|cutwork)\b/gi);
  return out.slice(0, 4).join(' · ');
}

// Brand's own category as a WORD in the collection title (the garment/category noun the brand uses).
function deriveBrandTitleCat(title){
  const s = _lc(title);
  const m = s.match(/\b(kurtis?|kurtas?|kameez|shalwar suit|shalwar|dupattas?|sarees?|sari|lehengas?|shararas?|ghararas?|abayas?|hijabs?|niqab|shawls?|stole|co-?ords?|dress(?:es)?|gowns?|maxi|trousers?|pants?|jeans|skirts?|tunics?|kaftans?|caftan|anarkali|peshwas|waistcoats?|sherwanis?|shirts?|t-?shirts?|hoodies?|sweaters?|cardigans?|jackets?|coats?|nightwear|loungewear|pyjamas?|pajamas?|footwear|khussas?|chappals?|juttis?|sandals?|heels?|pumps?|flats?)\b/);
  return m ? m[1].replace(/^\w/, c => c.toUpperCase()) : '';
}

let totalCols = 0;
const out = [];

for (const b of brands) {
  if (!b.ok && !b.name) continue;

  // Include ALL collections (full review, req: Danish). Mark noise/accessory so the Map's
  // hide-noise toggle still works, and derive the normalized path dimensions (one value each,
  // blank when unclear): Stitch (Unstitched/RTW), East/West, Season, Occasion.
  const cols = (b.collections || [])
    .map(c => {
      const entry = { h: c.handle, t: c.title, n: c.count };
      if (c.dept) entry.d = c.dept;
      if (c.sections && c.sections.length) entry.s = c.sections;
      if (c.kidSub) entry.k = c.kidSub;
      const sw = deriveStitch(c.title);            if (sw) entry.sw = sw;
      const ew = deriveEW(c.title, c.sections);    if (ew) entry.ew = ew;
      const se = deriveSeason(c.title);            if (se) entry.se = se;
      const oc = deriveOccasion(c.title);          if (oc) entry.oc = oc;
      const ot = deriveOthers(c.title);            if (ot) entry.ot = ot;
      const bc = PTYPE[b.host + '||' + c.handle]; if (bc && !/^configurable$/i.test(bc)) entry.bc = bc;
      const bw = deriveBrandTitleCat(c.title); if (bw) entry.bw = bw;
      if (c.noise) entry.noise = 1;
      if (c.accessory) entry.acc = 1;
      return entry;
    });

  totalCols += cols.length;

  out.push({
    name: b.name,
    host: b.host || '',
    ok: !!b.ok,
    group: b.group || 'shopify',
    cols,
  });
}

// Sort brands alphabetically
out.sort((a, b) => a.name.localeCompare(b.name));

const json = JSON.stringify({ generated: new Date().toISOString().slice(0, 10), brands: out });
fs.writeFileSync(OUT, json);
console.log(`Wrote ${out.length} brands, ${totalCols} collections → ${OUT}`);
console.log(`File size: ${(json.length / 1024).toFixed(0)} KB`);
