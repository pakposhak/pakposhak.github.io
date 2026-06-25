/* PakPoshak — guideline coverage check.
 * Verifies that EVERY brand with a special rule in catalog-cleanup.js is documented in
 * BRAND-CATEGORY-GUIDELINES.md, so the human guideline can't silently drift from the code.
 * Usage: node check-guidelines.js   (exit code = number of undocumented brand rules; 0 = in sync)
 */
'use strict';
const fs = require('fs');
const code = fs.readFileSync(__dirname + '/catalog-cleanup.js', 'utf8');
const doc = fs.readFileSync(__dirname + '/BRAND-CATEGORY-GUIDELINES.md', 'utf8');

const brands = new Set();
// 1) p.b === 'Brand'
for (const m of code.matchAll(/p\.b\s*===\s*['"]([^'"]+)['"]/g)) brands.add(m[1]);
// 2) /^(A|B|C)$/.test(p.b)
for (const m of code.matchAll(/\/\^\(([^)]+)\)\$\/i?\.test\(p\.b/g)) {
  m[1].split('|').forEach(b => brands.add(b.replace(/\\/g, '')));
}
// 3) brand Sets (add new brand-set names here as they appear)
for (const setName of ['GIRLS_KIDS_BRANDS', 'BOYS_KIDS_BRANDS', 'MENS_2PC_BRANDS']) {
  const re = new RegExp(setName + '\\s*=\\s*new Set\\(\\[([^\\]]+)\\]');
  const m = code.match(re);
  if (m) for (const x of m[1].matchAll(/['"]([^'"]+)['"]/g)) brands.add(x[1]);
}
// 4) brands handled in slugGender()
['Zellbury', 'Diners'].forEach(b => brands.add(b));

const list = [...brands].filter(b => /[A-Z]/.test(b) && b.length > 1).sort();
const missing = list.filter(b => !doc.includes(b));

console.log(`Brands with a code rule: ${list.length}  ·  documented: ${list.length - missing.length}  ·  MISSING: ${missing.length}`);
if (missing.length) {
  console.log('\nUndocumented in BRAND-CATEGORY-GUIDELINES.md:');
  missing.forEach(b => console.log('  - ' + b));
  console.log('\n→ add a line for each in BRAND-CATEGORY-GUIDELINES.md, then re-run.');
} else {
  console.log('✓ every brand rule in catalog-cleanup.js is documented.');
}
process.exit(missing.length);
