#!/usr/bin/env node
/* PakPoshak — per-brand KIDS gender census  (READ-ONLY, no catalog change)
 *
 * Goal: for every brand, decide its TRUE kids gender lineup so we can stop the
 * "genderless 'Kids' item -> wrong gender" defaulting bug. Combines THREE signals:
 *   1) product-title census  (catalog.json)  — explicit "boys"/"girls" words + boy/girl
 *      garment silhouettes across the brand's kids items. This is the MOST reliable
 *      signal and is what exposed the false positives (Saya/Kross Kulture DO sell boys).
 *   2) collection-name signal (brand-collections.json) — does the brand NAME boys/girls
 *      collections on its own site (Minnie does; Sana Safinaz doesn't).
 *   3) current catalog split — where our classifier put them today.
 *
 * Output: a per-brand verdict — BOTH / GIRLS-ONLY / BOYS-ONLY / NEEDS-CHECK — plus the
 * count of GENDERLESS items that would move if we force the verdict. NEEDS-CHECK = the
 * brand only has genderless items and names no gendered collections (e.g. Sana Safinaz);
 * those need a brand-site look or your knowledge.
 *
 * A verdict NEVER moves an item that already carries an explicit gender word in its title
 * — only the genderless ones default-defaulted by the classifier.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cat = require('./catalog.json').products;
const scan = require('./brand-collections.json').brands;
const scanBy = {}; scan.forEach(b => scanBy[b.name] = b);

const EXPLICIT_BOY  = /\bboys?\b|\bboy['’]?s\b|for\s+boys?\b/i;
const EXPLICIT_GIRL = /\bgirls?\b|\bgirl['’]?s\b|for\s+girls?\b/i;
// boy-ONLY garments (women/girls never wear these) — a strong boy signal even without "boy".
const GARMENT_BOY   = /sherwani|waist[\s-]?coat|prince[\s-]?coat|kurta[\s-]?(?:pajama|pyjama|shalwar)|\bpathani\b|nehru/i;
// girl-leaning garments.
const GARMENT_GIRL  = /\bfrock\b|\bgown\b|\blehenga\b|gharara|\bkurti\b|\bpeplum\b|\bskirt\b|\bblouse\b|ruffle|\btunic\b/i;

const KGEN = c => /^kids_(boys|girls)_/.test(c) ? (RegExp.$1) : (c === 'kids_infant' ? 'infant' : null);

const brands = {};
for(const p of cat){
  if(!/^kids_/.test(p.cat)) continue;
  const b = (brands[p.b] = brands[p.b] || { name:p.b, n:0, curBoys:0, curGirls:0, curInfant:0,
              exBoy:0, exGirl:0, garBoy:0, garGirl:0, genderless:0, genderlessSamples:[] });
  b.n++;
  const g = KGEN(p.cat);
  if(g === 'boys') b.curBoys++; else if(g === 'girls') b.curGirls++; else if(g === 'infant') b.curInfant++;
  const t = p.t || '';
  const eb = EXPLICIT_BOY.test(t), eg = EXPLICIT_GIRL.test(t);
  if(eb) b.exBoy++;
  if(eg) b.exGirl++;
  if(!eb && !eg){
    if(GARMENT_BOY.test(t)) b.garBoy++;
    else if(GARMENT_GIRL.test(t)) b.garGirl++;
    else { b.genderless++; if(b.genderlessSamples.length < 4) b.genderlessSamples.push(t.slice(0,52)); }
  }
}

// collection-name signal per brand
function collSig(name){
  const s = scanBy[name];
  const ks = (s && s.kidSubs) || {};
  const boy  = !!(ks.boys || ks['boys+girls']);
  const girl = !!(ks.girls || ks['boys+girls']);
  const inf  = !!ks.infant;
  const onlyGeneric = !boy && !girl && !inf && !!ks.kids;
  return { boy, girl, inf, onlyGeneric };
}

function verdict(b){
  const cs = collSig(b.name);
  // ANY evidence a brand sells a gender = a single explicit word, a distinctive garment,
  // or a named collection. STRONG = a named collection or overwhelming explicit words
  // (>=5) — enough to declare the brand single-gender. A COUPLE of opposite-side garment
  // items must NOT flip the verdict (Maria B has 238 genderless girls' suits + 2 boy
  // garments — that is NOT "boys only"). When the evidence is thin and the brand is
  // genderless-dominated, the honest answer is NEEDS-CHECK (look at the brand's site).
  const anyBoy  = b.exBoy > 0 || b.garBoy > 0 || cs.boy;
  const anyGirl = b.exGirl > 0 || b.garGirl > 0 || cs.girl;
  const strongBoy  = cs.boy  || b.exBoy  >= 5;
  const strongGirl = cs.girl || b.exGirl >= 5;
  if(anyBoy && anyGirl) return { v:'BOTH', conf:'high' };
  if(strongGirl && !anyBoy) return { v:'GIRLS-ONLY', conf: cs.girl ? 'high' : 'med' };
  if(strongBoy  && !anyGirl) return { v:'BOYS-ONLY',  conf: cs.boy  ? 'high' : 'med' };
  return { v:'NEEDS-CHECK', conf:'low' };
}

const rows = Object.values(brands).map(b => {
  const vd = verdict(b);
  // items that WOULD move if we force the verdict (genderless only; explicit/garment stay):
  let moves = 0;
  if(vd.v === 'GIRLS-ONLY') moves = b.curBoys && (b.genderless) ? Math.min(b.curBoys, b.genderless + b.garBoy) : 0;  // boys that are genderless-defaulted
  if(vd.v === 'BOYS-ONLY')  moves = b.curGirls && (b.genderless) ? Math.min(b.curGirls, b.genderless + b.garGirl) : 0;
  return { ...b, verdict:vd.v, conf:vd.conf, moves, coll:collSig(b.name) };
}).sort((a,b) => b.n - a.n);

// ── report ──
const pad = (s,n) => String(s).padEnd(n);
console.log(pad('BRAND',24)+pad('kids',5)+pad('cur(B/G/I)',13)+pad('explicit',11)+pad('garment',10)+pad('genderless',11)+pad('coll',9)+pad('VERDICT',13)+'conf');
console.log('-'.repeat(116));
for(const r of rows){
  console.log(
    pad(r.name,24) + pad(r.n,5) +
    pad(`${r.curBoys}/${r.curGirls}/${r.curInfant}`,13) +
    pad(`b${r.exBoy} g${r.exGirl}`,11) +
    pad(`b${r.garBoy} g${r.garGirl}`,10) +
    pad(r.genderless,11) +
    pad((r.coll.boy?'B':'')+(r.coll.girl?'G':'')+(r.coll.inf?'I':'')+(r.coll.onlyGeneric?'k':'')||'-',9) +
    pad(r.verdict,13) + r.conf
  );
}
console.log('\nSINGLE-GENDER candidates (verdict GIRLS-ONLY or BOYS-ONLY) — the fix list:');
rows.filter(r => /ONLY/.test(r.verdict)).forEach(r => {
  const wrong = r.verdict === 'GIRLS-ONLY' ? r.curBoys : r.curGirls;
  console.log(`  ${pad(r.name,24)} ${r.verdict.padEnd(11)} conf=${r.conf}  currently-wrong-gender≈${wrong}  e.g. ${r.genderlessSamples[0]||r.curBoys+'boys/'+r.curGirls+'girls'}`);
});
console.log('\nNEEDS-CHECK (all genderless, no gendered collections — need brand-site/your call):');
rows.filter(r => r.verdict === 'NEEDS-CHECK').forEach(r => {
  console.log(`  ${pad(r.name,24)} kids=${r.n} cur(B/G/I)=${r.curBoys}/${r.curGirls}/${r.curInfant}  e.g. ${r.genderlessSamples.join(' | ')}`);
});

fs.writeFileSync(path.join(__dirname,'brand-gender-census.json'), JSON.stringify(rows,null,1));
console.log('\n✓ brand-gender-census.json written ('+rows.length+' brands with kids products)');
