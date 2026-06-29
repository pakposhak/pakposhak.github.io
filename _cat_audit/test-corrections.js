/* Unit tests for ADMIN CORRECTIONS (Phase 4, 2026-06-29) — applyCorrections().
 * The PakPoshak Map review tool emits collection-corrections.json:
 *   { moves: { "host||handle": "category_key" }, removes: ["host||handle", ...] }
 * applyCorrections maps each product to its "host||handle" keys via the membership Map
 * (host = new URL(p.u).host; each membership coll has {h:handle}). A MOVE overrides p.cat
 * (top authority); a REMOVE drops the product; REMOVE wins when both match. Empty ⇒ no-op.
 * Run: node _cat_audit/test-corrections.js  (exit code = # failures). */
'use strict';
const { applyCorrections } = require('../catalog-cleanup');
let pass = 0, fail = 0;
const assert = (cond, label) => { console.log((cond ? 'PASS ' : 'FAIL ') + label); cond ? pass++ : fail++; };

// ── synthetic catalog: 3 products on mausummery.com + 1 on another host ──
const mk = () => [
  { b: 'Mausummery', t: 'Lawn Shirt', u: 'https://mausummery.com/products/x', cat: 'kurti_1pc', sz: ['M'] },
  { b: 'Mausummery', t: 'Old Stock Item', u: 'https://mausummery.com/products/y', cat: 'pret_3pc', sz: ['M'] },
  { b: 'Mausummery', t: 'Both Move And Remove', u: 'https://mausummery.com/products/z', cat: 'pret_3pc', sz: ['M'] },
  { b: 'Other', t: 'Untouched Kurti', u: 'https://other.com/products/w', cat: 'kurti_1pc', sz: ['M'] },
];
// membership: url -> colls[] (each {h:handle, ...}). x∈lawn-collection, y∈clearance,
// z∈BOTH lawn-collection AND clearance, w∈some-collection.
const membership = new Map([
  ['https://mausummery.com/products/x', [{ h: 'lawn-collection', t: 'Lawn', dept: 'women', sec: '' }]],
  ['https://mausummery.com/products/y', [{ h: 'clearance', t: 'Clearance', dept: '', sec: '' }]],
  ['https://mausummery.com/products/z', [{ h: 'lawn-collection', t: 'Lawn' }, { h: 'clearance', t: 'Clearance' }]],
  ['https://other.com/products/w', [{ h: 'some-collection', t: 'Some' }]],
]);

// ── (1) MOVE sets p.cat to the target; REMOVE drops; both-match product is REMOVED; untouched stays ──
const corr1 = { moves: { 'mausummery.com||lawn-collection': 'mens_kurta' }, removes: new Set(['mausummery.com||clearance']) };
const r1 = applyCorrections(mk(), membership, corr1);
const byU1 = {}; r1.products.forEach(p => byU1[p.u] = p);
assert(byU1['https://mausummery.com/products/x'] && byU1['https://mausummery.com/products/x'].cat === 'mens_kurta', 'MOVE sets p.cat to the target category');
assert(!byU1['https://mausummery.com/products/y'], 'REMOVE drops the product in the removed collection');
assert(!byU1['https://mausummery.com/products/z'], 'product matching BOTH move+remove is REMOVED (remove wins)');
assert(byU1['https://other.com/products/w'] && byU1['https://other.com/products/w'].cat === 'kurti_1pc', 'product on another host is untouched');
assert(r1.stats.moved === 1 && r1.stats.removed === 2, 'stats: 1 moved, 2 removed (got ' + r1.stats.moved + '/' + r1.stats.removed + ')');

// ── (2) EMPTY corrections leaves everything unchanged (no-op) ──
const inEmpty = mk();
const rEmpty = applyCorrections(inEmpty, membership, { moves: {}, removes: new Set() });
const sameEmpty = rEmpty.products.length === inEmpty.length &&
  rEmpty.products.every((p, i) => p.cat === mk()[i].cat) &&
  rEmpty.stats.moved === 0 && rEmpty.stats.removed === 0;
assert(sameEmpty, 'EMPTY corrections ⇒ no-op (no products dropped, no cats changed, stats 0/0)');

// ── (3) ABSENT membership ⇒ no-op even with corrections present ──
const rNoMem = applyCorrections(mk(), null, corr1);
assert(rNoMem.products.length === 4 && rNoMem.stats.moved === 0 && rNoMem.stats.removed === 0, 'NO membership ⇒ corrections dormant (no-op)');

// ── (4) IDEMPOTENT: applying twice yields the same result (same surviving set + same cats) ──
const once = applyCorrections(mk(), membership, corr1);
const twice = applyCorrections(once.products, membership, corr1);
const sig = arr => arr.map(p => p.u + '\t' + p.cat).sort().join('\n');
assert(sig(once.products) === sig(twice.products), 'applying twice is IDEMPOTENT (identical survivors + cats)');
assert(twice.stats.moved === 0 && twice.stats.removed === 0, '2nd application reports 0 moved / 0 removed (already settled)');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail);
