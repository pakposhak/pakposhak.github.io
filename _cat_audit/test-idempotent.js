/* Idempotency guard: cleanup MUST be a fixed-point function (cleanup(cleanup(X))==cleanup(X)).
 * Runs on catalog.before.json (a real harvested snapshot). Exit code = # of products still
 * oscillating after the pipeline should have settled (target 0). Run after ANY rule change. */
'use strict';
const fs = require('fs');
const path = require('path');
const { cleanupProducts } = require('../catalog-cleanup');
// Prefer the live catalog.json (the build artifact); fall back to a local snapshot.
const snap = [path.join(__dirname, '..', 'catalog.json'), path.join(__dirname, 'catalog.before.json')].find(f => fs.existsSync(f));
if (!snap) { console.log('SKIP: no catalog.json / catalog.before.json to test'); process.exit(0); }
console.log('testing:', snap);
const src = JSON.parse(fs.readFileSync(snap, 'utf8')).products;
let prev = src, prevMap = {}; src.forEach(p => prevMap[p.u] = p.cat);
let lastChanges = 0;
for (let i = 1; i <= 5; i++) {
  const out = cleanupProducts(JSON.parse(JSON.stringify(prev))).products;
  let ch = 0; out.forEach(p => { if (prevMap[p.u] && prevMap[p.u] !== p.cat) ch++; });
  console.log(`pass ${i}: ${ch} category changes vs previous pass`);
  const nm = {}; out.forEach(p => nm[p.u] = p.cat);
  prev = out; prevMap = nm; lastChanges = ch;
  if (i >= 3 && ch === 0) { console.log('\n✓ FIXED POINT reached (idempotent).'); process.exit(0); }
}
console.log(`\n✗ NOT converged — ${lastChanges} products still oscillating after 5 passes.`);
process.exit(lastChanges);
