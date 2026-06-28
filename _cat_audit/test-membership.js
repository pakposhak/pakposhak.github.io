/* Unit tests for the COLLECTION-MEMBERSHIP AUTHORITY tier (2026-06-28).
 * Exercises the 4 sub-rules + the noise-bucket guard + idempotency WITH membership active.
 * Each case passes a Map(url -> colls[]) so the tier is live (it is a no-op without one). */
'use strict';
const { cleanupProducts } = require('../catalog-cleanup');
let pass = 0, fail = 0;

const CASES = [
  // (1) cross-DEPARTMENT re-route — genderless title, collections decide -------------------------
  { label: 'genderless women→MEN by collection',
    prod: { t: 'Classic Kurta Shalwar', cat: 'pret_3pc', sz: ['M'] },
    colls: [{ h: 'mens-kurta', t: 'Men Kurta', dept: 'men', sec: '' }], expect: 'mens_shalwar_kameez' },
  { label: 'genderless men→WOMEN by collection',
    prod: { t: 'Printed Lawn 3 Piece', cat: 'mens_kurta', sz: ['M'] },
    colls: [{ h: 'womens-pret', t: 'Women Pret', dept: 'women', sec: 'eastern' }], expect: 'pret_3pc' },
  { label: 'genderless women→KIDS girls eastern by collection',
    prod: { t: 'Cotton Kurta', cat: 'pret_3pc', sz: ['M'] },
    colls: [{ h: 'girls-eastern', t: 'Girls Eastern', dept: 'kids', sec: 'eastern' }], expect: 'kids_girls_eastern' },
  { label: 'GUARD explicit "Women\'s" title beats MEN collection (no move)',
    prod: { t: "Women's Premium Suit", cat: 'pret_3pc', sz: ['M'] },
    colls: [{ h: 'mens-kurta', t: 'Men Kurta', dept: 'men', sec: '' }], expect: 'pret_3pc' },
  { label: 'GUARD conflicting men+women collections → no move',
    prod: { t: 'Printed 3 Piece', cat: 'pret_3pc', sz: ['M'] },
    colls: [{ h: 'mens', t: 'Men', dept: 'men', sec: '' }, { h: 'womens', t: 'Women', dept: 'women', sec: '' }], expect: 'pret_3pc' },

  // (2) kids gender (boys↔girls) by collection vote ----------------------------------------------
  { label: 'kids genderless boys→GIRLS by collection',
    prod: { t: 'Embroidered Suit', cat: 'kids_boys_eastern', sz: ['4Y'] },
    colls: [{ h: 'girls-suits', t: 'Girls Suits', dept: 'kids', sec: 'eastern' }], expect: 'kids_girls_eastern' },
  { label: 'GUARD explicit "Boys" title beats GIRLS collection (no move)',
    prod: { t: 'Boys Kurta', cat: 'kids_boys_eastern', sz: ['4Y'] },
    colls: [{ h: 'girls-suits', t: 'Girls Suits', dept: 'kids', sec: 'eastern' }], expect: 'kids_boys_eastern' },

  // (3) kids east/west by collection vote --------------------------------------------------------
  { label: 'kids eastern→WESTERN by collection',
    prod: { t: 'Printed Outfit', cat: 'kids_girls_eastern', sz: ['4Y'] },
    colls: [{ h: 'girls-western', t: 'Girls Western', dept: 'kids', sec: 'western' }], expect: 'kids_girls_western' },

  // (4) unstitched forward + its guards ----------------------------------------------------------
  { label: 'stitched→UNSTITCHED forward by collection',
    prod: { t: 'Printed 3 Piece', cat: 'pret_3pc', sz: ['Free Size'] },
    colls: [{ h: 'unstitched', t: 'Unstitched', dept: '', sec: 'unstitched' }], expect: 'lawn_3pc_unstitch' },
  { label: 'GUARD real S/M/L sizes block unstitched forward (anti-oscillation)',
    prod: { t: 'Printed 3 Piece', cat: 'pret_3pc', sz: ['S', 'M', 'L'] },
    colls: [{ h: 'unstitched', t: 'Unstitched', dept: '', sec: 'unstitched' }], expect: 'pret_3pc' },

  // noise-bucket guard (the One Kids "boys-best-seller" ping-pong, via the membership path) -------
  { label: 'NOISE bucket "boys-best-seller" never moves a girls item to boys',
    prod: { t: 'Lace Dress Pink', cat: 'kids_girls_western', sz: ['4Y'] },
    colls: [{ h: 'boys-best-seller', t: 'Boys Best Seller', dept: '', sec: '' }], expect: 'kids_girls_western' },

  // real-data regressions caught on the partial harvest (2026-06-28) ----------------------------
  { label: 'GUARD tights in an eastern "festive" collection stay western (KWEST_GARMENT)',
    prod: { b: 'Breakout', t: 'Girls Basic Tights', cat: 'kids_girls_western', sz: ['4Y'] },
    colls: [{ h: 'girls-festive', t: 'Girls Festive', dept: 'kids', sec: 'eastern+formal' }], expect: 'kids_girls_western' },
  { label: 'GUARD nightwear in an eastern collection stays western (KWEST)',
    prod: { b: 'Almirah', t: 'Cotton 2 Piece Stitched Nightwear', cat: 'kids_girls_western', sz: ['10Y'] },
    colls: [{ h: 'girls-stitched', t: 'Girls Stitched', dept: 'kids', sec: 'eastern' }], expect: 'kids_girls_western' },
  { label: 'GUARD dupatta in a "girls" collection stays dupatta_only (terminal cat)',
    prod: { b: 'Salitex', t: '1PC Chiffon Dupatta', cat: 'dupatta_only', sz: ['Unstitched'] },
    colls: [{ h: 'girls', t: 'Girls', dept: 'kids', sec: '' }, { h: 'dupatta-scarf', t: 'Dupatta Scarf', dept: '', sec: 'accessory' }], expect: 'dupatta_only' },
  { label: 'membership EAST beats a single-handle p.coll WEST (membership supersedes)',
    prod: { b: 'Diners', t: 'Embroidered 2PC', cat: 'kids_girls_western', sz: ['4Y'], coll: 'girls-pajamas' },
    colls: [{ h: 'girls-eastern', t: 'Girls Eastern', dept: 'kids', sec: 'eastern' }, { h: 'girls-pret', t: 'Girls Pret', dept: 'kids', sec: 'eastern' }], expect: 'kids_girls_eastern' },

  // absence-of-membership safety -----------------------------------------------------------------
  { label: 'NO membership → tier dormant (no-op)',
    prod: { t: 'Printed 3 Piece', cat: 'pret_3pc', sz: ['M'] },
    colls: null, expect: 'pret_3pc' },
];

function runOne(prod, colls, u) {
  const p = Object.assign({ b: 'X', t: '', u, pkr: 5000, sz: ['M'], cat: 'pret_3pc' }, prod, { u });
  const mem = new Map(); if (colls) mem.set(u, colls);
  return cleanupProducts([p], colls ? mem : null).products[0];
}
CASES.forEach((c, i) => {
  const u = 'https://x.com/products/p' + i;
  const r = runOne(c.prod, c.colls, u);
  const got = r ? r.cat : '(deleted)';
  const ok = got === c.expect;
  console.log((ok ? 'PASS ' : 'FAIL ') + c.label + ' → ' + got + (ok ? '' : '  (expected ' + c.expect + ')'));
  ok ? pass++ : fail++;
});

// ── idempotency WITH membership: one combined catalog + map, run 3×, assert it settles ──
const prods = CASES.map((c, i) => Object.assign({ b: 'X', t: '', u: 'https://x.com/products/p' + i, pkr: 5000, sz: ['M'], cat: 'pret_3pc' }, c.prod, { u: 'https://x.com/products/p' + i }));
const mem = new Map(); CASES.forEach((c, i) => { if (c.colls) mem.set('https://x.com/products/p' + i, c.colls); });
let prev = prods, prevMap = {}; prods.forEach(p => prevMap[p.u] = p.cat);
let settled = false;
for (let i = 1; i <= 4; i++) {
  const out = cleanupProducts(JSON.parse(JSON.stringify(prev)), mem).products;
  let ch = 0; out.forEach(p => { if (prevMap[p.u] !== p.cat) ch++; });
  const nm = {}; out.forEach(p => nm[p.u] = p.cat);
  prev = out; prevMap = nm;
  console.log('idempotency pass ' + i + ': ' + ch + ' changes vs previous');
  if (i >= 2 && ch === 0) { settled = true; break; }
}
if (settled) { console.log('✓ idempotent WITH membership'); } else { console.log('✗ NOT idempotent with membership'); fail++; }

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail);
