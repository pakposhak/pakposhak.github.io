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
const OUT = path.join(__dirname, '..', 'Lawn Busines For Bangladesh', 'brand-map-data.json');

const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const brands = Object.values(raw.brands);

let totalCols = 0;
const out = [];

for (const b of brands) {
  if (!b.ok && !b.name) continue;

  // Keep only useful collections: non-noise, non-accessory, count > 0
  const cols = (b.collections || [])
    .filter(c => !c.noise && !c.accessory && c.count > 0)
    .map(c => {
      const entry = { h: c.handle, t: c.title, n: c.count };
      if (c.dept) entry.d = c.dept;
      if (c.sections && c.sections.length) entry.s = c.sections;
      if (c.kidSub) entry.k = c.kidSub;
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
