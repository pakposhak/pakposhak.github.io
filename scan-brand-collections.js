#!/usr/bin/env node
/* PakPoshak — brand collection scanner  (READ-ONLY, no catalog change)
 *
 * "The brand's own website already categorises its products." This script visits every
 * Shopify brand we harvest, reads its OWN category structure via /collections.json, and
 * marks what each brand actually sells and how THEY organise it:
 *   • departments present  — women / men / boys / girls / infant
 *   • sections present     — eastern / western / formal / unstitched / fabric / accessories
 *   • notable flags        — eastern-only (no gender split), kids girls-only or boys-only, …
 *
 * Output:
 *   • brand-collections.json   — machine-readable: every collection + its classification.
 *   • BRAND-COLLECTIONS-MAP.md  — the human "category guide book", brand by brand.
 *
 * This is the GROUND TRUTH input for moving products into the right category (the brand's
 * own collection beats our title-guess). It changes nothing on its own — run, then review.
 *
 * Usage:  node scan-brand-collections.js            (all brands)
 *         node scan-brand-collections.js  Sana       (only brands whose name matches /Sana/i)
 */
'use strict';
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const CONC = 6;                 // polite concurrency
const FILTER = process.argv[2]; // optional name substring

// ── 1) Brand list — parsed straight out of harvest-catalog.js so it never drifts.
//    Captures ['Name','host'(,'group')?] across SHOPIFY / COLLECTIONS / KIDS_BRANDS.
//    A host must contain a dot+TLD, which excludes collection-handle pairs like
//    ['women-khussa','footwear']. SFCC brands (Khaadi/Sapphire) have no collections.json
//    and are listed via {name:'…',host:'…'} — captured separately and flagged.
function loadBrands(){
  const src = fs.readFileSync(path.join(__dirname, 'harvest-catalog.js'), 'utf8');
  const out = new Map();   // name -> {name, host, group, hosts:Set}
  const re = /\['([^']+)',\s*'((?:[a-z0-9-]+\.)+[a-z]{2,})'(?:\s*,\s*'([a-z]{1,3})')?/g;
  let m;
  while((m = re.exec(src))){
    const [, name, host, group] = m;
    if(!out.has(name)) out.set(name, { name, host, group: group || '', hosts: new Set() });
    out.get(name).hosts.add(host);
  }
  // SFCC (no collections.json) — record so the report notes them.
  const sfcc = [];
  const reS = /\{\s*name:'([^']+)',\s*host:'([^']+)'/g;
  while((m = reS.exec(src))) sfcc.push({ name: m[1], host: m[2] });
  return { shopify: [...out.values()], sfcc };
}

function get(url){
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers:{ 'User-Agent':UA, 'Accept':'application/json' }, timeout:25000 }, res => {
      if(res.statusCode !== 200){ res.resume(); return reject(new Error('HTTP '+res.statusCode)); }
      let d=''; res.on('data', c => d += c); res.on('end', () => resolve(d));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── 2) Collection classifier — what does this collection tell us?
// NOISE = not a real category (sale / new-in / all / homepage / gift card …) — recorded
// but ignored in the brand summary.
const NOISE = /\ball\b|all-?products|new-?(arrival|in)|newin|featured|best[\s-]?sell|trending|hot[\s-]?sell|\bsale\b|discount|clearance|flat[\s-]?\d|\d{1,2}%|[\s-]off\b|under[\s-]?\d|gift[\s-]?card|home[\s-]?page|frontpage|shop[\s-]?all|view[\s-]?all|everything|coming[\s-]?soon|back[\s-]?in[\s-]?stock|wishlist|\bnew\b$|preorder|pre-?order|catalog|collections?$/;
const ACCESSORY = /accessor|\bshoe|footwear|sneaker|sandal|khussa|kolhapuri|heel|slipper|\bbag\b|hand[\s-]?bag|clutch|purse|jewell?ery|earring|bangle|bracelet|\bring\b|necklace|fragrance|perfume|attar|\bbelt\b|sunglass|eyewear|\bwatch\b|\bcap\b|\bhat\b|\bsocks?\b|stole|\bscarf\b|hijab|dupatta|mask|home|bed|fragrance/;
function classify(handle, title){
  const s = ((handle||'') + ' ' + (title||'')).toLowerCase().replace(/[_\/]+/g,'-');
  const tags = { dept:null, kidSub:null, sections:[], noise:false, accessory:false };
  if(NOISE.test(s)) tags.noise = true;
  // department — kids beats men/women; women before men (so "women" never reads as "men").
  const isKids = /\bkid|kids|\bboys?\b|\bgirls?\b|inf?ants?|ifants?|new[\s-]?born|junior|toddler|\bbaby\b|\bteen\b|child|nursery/.test(s);
  if(isKids){
    tags.dept = 'kids';
    const boy = /\bboys?\b|\bboy[\s-]/.test(s);
    const girl = /\bgirls?\b|\bgirl[\s-]/.test(s);
    const inf = /inf?ants?|ifants?|new[\s-]?born|\bnb\b|nursery|\bbaby\b|romper|0-?\d\s?m|months?\b/.test(s);
    tags.kidSub = boy && girl ? 'boys+girls' : boy ? 'boys' : girl ? 'girls' : inf ? 'infant' : 'kids';
    if(inf && tags.kidSub === 'kids') tags.kidSub = 'infant';
  } else if(/\bwomen\b|\bwoman\b|\bwomens\b|\bladies\b|\blady\b|\bfemale\b|\bwmn\b|\bher\b|\bshe\b/.test(s)){
    tags.dept = 'women';
  } else if(/\bmen\b|\bmens\b|\bman\b|men[\s-]?s?wear|\bgents?\b|\bmale\b|mardana|\bhim\b|\bhis\b|\bboys?wear\b/.test(s)){
    tags.dept = 'men';
  }
  // sections — a collection can carry several.
  if(/eastern|ethnic|\bpret\b|stitched|ready[\s-]?to[\s-]?wear|\brtw\b|shalwar|kameez|\bkurtas?\b|\bkurtis?\b|\blawn\b|festive|wedding|\bbridal\b|\bformal\b|embroider|3[\s-]?pc|2[\s-]?pc|saree|lehenga|gharara|sharara|\bsuit\b|\babaya\b|anarkali|cambric|khaddar|chiffon|organza|luxury/.test(s)) tags.sections.push('eastern');
  if(/western|\bwest\b|denim|\bjeans?\b|t[\s-]?shirt|\btees?\b|\bpolo\b|trouser|\bpants?\b|jacket|hoodie|sweat|knit|cardigan|co-?ord|\bdress\b|skirt|\btops?\b|jumpsuit|loungewear|night[\s-]?wear|\bpaj?ama|pyjama/.test(s)) tags.sections.push('western');
  if(/unstitch|un-?stitch|fabric|piece[\s-]?goods|\buns\b|yardage|\bcloth\b/.test(s)) tags.sections.push('unstitched');
  if(/\bformal\b|festive|wedding|\bbridal\b|party[\s-]?wear|luxury|couture|nikkah|nikah|walima/.test(s)) tags.sections.push('formal');
  if(ACCESSORY.test(s)){ tags.accessory = true; tags.sections.push('accessory'); }
  tags.sections = [...new Set(tags.sections)];
  // An EXPLICIT eastern/western token in the name is ground truth — it must win over an
  // incidental garment word ("Boy Eastern Top" is eastern, the word "top" doesn't make it
  // western too). Only when neither token is present do the garment-word guesses stand.
  const eastTok = /\beastern\b|\bethnic\b/.test(s), westTok = /\bwest(ern)?\b/.test(s);
  if(eastTok && !westTok) tags.sections = tags.sections.filter(x => x !== 'western');
  if(westTok && !eastTok) tags.sections = tags.sections.filter(x => x !== 'eastern');
  return tags;
}

async function scanBrand(b){
  const rec = { name:b.name, host:b.host, group:b.group, ok:false, error:null, total:0, collections:[],
                depts:{}, kidSubs:{}, sections:{}, flags:[] };
  let cols = [];
  for(let page = 1; page <= 2; page++){
    let raw = null;
    for(let attempt = 1; attempt <= 2; attempt++){
      try{ raw = await get(`https://${b.host}/collections.json?limit=250&page=${page}`); break; }
      catch(e){ if(attempt < 2){ await sleep(900); continue; } rec.error = e.message; }
    }
    if(raw == null) break;
    let j; try{ j = JSON.parse(raw); }catch(e){ rec.error = 'not-json (SFCC/non-Shopify?)'; break; }
    const part = (j.collections || []);
    cols = cols.concat(part);
    if(part.length < 250) break;
    await sleep(300);
  }
  if(!cols.length){ if(!rec.error) rec.error = 'no collections'; return rec; }
  rec.ok = true; rec.total = cols.length;
  for(const c of cols){
    const t = classify(c.handle, c.title);
    rec.collections.push({ handle:c.handle, title:c.title, count:c.products_count || 0, ...t });
    if(t.noise) continue;
    if(t.dept){ rec.depts[t.dept] = (rec.depts[t.dept]||0) + 1; if(t.dept==='kids' && t.kidSub) rec.kidSubs[t.kidSub] = (rec.kidSubs[t.kidSub]||0)+1; }
    t.sections.forEach(s => rec.sections[s] = (rec.sections[s]||0) + 1);
  }
  // ── flags: the at-a-glance findings Danish asked for ──
  const d = rec.depts, ks = rec.kidSubs, kSet = new Set(Object.keys(ks));
  const hasW = !!d.women, hasM = !!d.men, hasK = !!d.kids;
  if(hasK){
    const boy = kSet.has('boys') || kSet.has('boys+girls');
    const girl = kSet.has('girls') || kSet.has('boys+girls');
    const inf = kSet.has('infant');
    if(girl && !boy) rec.flags.push('KIDS: girls only (no boys collection)');
    else if(boy && !girl) rec.flags.push('KIDS: boys only (no girls collection)');
    else if(boy && girl) rec.flags.push('KIDS: boys + girls');
    else rec.flags.push('KIDS: present (gender not split in collection names)');
    if(inf) rec.flags.push('KIDS: has infant/newborn');
  }
  const genders = [hasW && 'women', hasM && 'men', hasK && 'kids'].filter(Boolean);
  if(genders.length > 1) rec.flags.push('MULTI-DEPT: ' + genders.join(' + '));
  if(genders.length === 0) rec.flags.push('NO gender-named collections (organised by section only — likely a single-dept "eastern" house)');
  if(rec.sections.western && !rec.sections.eastern) rec.flags.push('SECTION: western-led');
  if(rec.sections.eastern && !rec.sections.western) rec.flags.push('SECTION: eastern only (no western)');
  return rec;
}

// ── concurrency pool ──
async function pool(items, fn, conc){
  const out = new Array(items.length); let i = 0;
  async function worker(){ while(i < items.length){ const idx = i++; out[idx] = await fn(items[idx], idx); await sleep(250); } }
  await Promise.all(Array.from({length:conc}, worker));
  return out;
}

(async () => {
  const { shopify, sfcc } = loadBrands();
  let brands = shopify;
  if(FILTER) brands = brands.filter(b => new RegExp(FILTER, 'i').test(b.name));
  console.log(`Scanning ${brands.length} Shopify brands (collections.json) …\n`);
  let done = 0;
  const results = await pool(brands, async b => {
    const r = await scanBrand(b);
    done++;
    const tag = r.ok ? `${r.total} cols${r.flags.length ? '  ['+r.flags[0]+']' : ''}` : `✗ ${r.error}`;
    console.log(`  [${String(done).padStart(3)}/${brands.length}] ${r.name.padEnd(26)} ${tag}`);
    return r;
  }, CONC);

  // ── JSON (machine) ──
  fs.writeFileSync(path.join(__dirname, 'brand-collections.json'),
    JSON.stringify({ scanned: new Date().toISOString(), brands: results, sfcc }, null, 1));

  // ── Markdown (the guide book) ──
  const ok = results.filter(r => r.ok), bad = results.filter(r => !r.ok);
  const L = [];
  L.push('# Brand Collections Map  (brands\' OWN category structure)');
  L.push('');
  L.push(`_Generated ${new Date().toISOString().slice(0,16).replace('T',' ')} by \`scan-brand-collections.js\`. Read-only snapshot of how each brand organises its store. Use this as the GROUND TRUTH when deciding a product\'s category — the brand\'s own collection beats our title-guess._`);
  L.push('');
  L.push(`**${ok.length} Shopify brands scanned**, ${bad.length} unreachable / non-Shopify, ${sfcc.length} SFCC (no collections.json: ${sfcc.map(s=>s.name).join(', ')}).`);
  L.push('');
  // findings summary
  const girlsOnly = ok.filter(r => r.flags.some(f => /girls only/.test(f)));
  const boysOnly  = ok.filter(r => r.flags.some(f => /boys only/.test(f)));
  const westLed   = ok.filter(r => r.flags.some(f => /western-led/.test(f)));
  const singleEast= ok.filter(r => r.flags.some(f => /single-dept/.test(f)));
  L.push('## Key findings');
  L.push('');
  L.push(`- **Kids GIRLS-ONLY brands** (we must not place them in boys): ${girlsOnly.map(r=>r.name).join(', ') || '—'}`);
  L.push(`- **Kids BOYS-ONLY brands**: ${boysOnly.map(r=>r.name).join(', ') || '—'}`);
  L.push(`- **Western-led brands** (their western section is real, e.g. pajamas → western): ${westLed.map(r=>r.name).join(', ') || '—'}`);
  L.push(`- **Single-dept "eastern" houses** (no gender-named collections): ${singleEast.map(r=>r.name).join(', ') || '—'}`);
  L.push('');
  L.push('## Per-brand');
  L.push('');
  ok.sort((a,b)=>a.name.localeCompare(b.name)).forEach(r => {
    const deptStr = Object.entries(r.depts).map(([k,v])=>`${k}(${v})`).join(' ') || '—';
    const kidStr  = Object.keys(r.kidSubs).length ? '  kids: ' + Object.entries(r.kidSubs).map(([k,v])=>`${k}(${v})`).join(' ') : '';
    const secStr  = Object.entries(r.sections).map(([k,v])=>`${k}(${v})`).join(' ') || '—';
    L.push(`### ${r.name}  \`${r.host}\`${r.group?` (group: ${r.group})`:''}`);
    if(r.flags.length) L.push(r.flags.map(f=>`> ⚑ ${f}`).join('  \n'));
    L.push(`- depts: ${deptStr}${kidStr}`);
    L.push(`- sections: ${secStr}`);
    // list the meaningful (non-noise) collections, biggest first, capped
    const real = r.collections.filter(c => !c.noise).sort((a,b)=>b.count-a.count);
    const top = real.slice(0, 24).map(c => {
      const dt = [c.dept, c.kidSub, ...c.sections].filter(Boolean).join('/');
      return `  - \`${c.handle}\` — ${c.title} _(${c.count})_${dt?`  → ${dt}`:''}`;
    });
    L.push(`- collections (${real.length} real${real.length>24?', top 24 shown':''}):`);
    L.push(top.join('\n'));
    L.push('');
  });
  if(bad.length){
    L.push('## Unreachable / non-Shopify');
    L.push('');
    bad.forEach(r => L.push(`- **${r.name}** \`${r.host}\` — ${r.error}`));
    L.push('');
  }
  fs.writeFileSync(path.join(__dirname, 'BRAND-COLLECTIONS-MAP.md'), L.join('\n'));

  console.log(`\n✓ Wrote brand-collections.json + BRAND-COLLECTIONS-MAP.md`);
  console.log(`  ${ok.length} scanned · ${bad.length} failed`);
  console.log(`  girls-only: ${girlsOnly.map(r=>r.name).join(', ') || '—'}`);
  console.log(`  boys-only:  ${boysOnly.map(r=>r.name).join(', ') || '—'}`);
  console.log(`  western-led: ${westLed.map(r=>r.name).join(', ') || '—'}`);
})();
