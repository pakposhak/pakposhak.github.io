'use strict';
/*
 * catalog-cleanup.js — post-harvest catalogue corrector for PakPoshak.
 *
 * WHY: the harvester's mapCatWomen decides stitched-vs-unstitched from TITLE/TAGS only, so
 * "RTS" (Ready-To-Stitch) / Unstitched items whose title doesn't contain the word "unstitch"
 * (e.g. Alkaram "RTW/RTS SHIRT, TROUSER & DUPATTA") land in STITCHED cats, and accessories
 * (sunglasses etc.) leak into apparel cats. The sizes field (sz=["Unstitched"]) is a RELIABLE
 * stitched/unstitched authority that the classifier ignored.
 *
 * This pass (idempotent) corrects catalog.json using sz + title:
 *   1. delete non-apparel accessories (only when the title has NO garment word) + men footwear
 *   2. move footwear-titled apparel-cat items into the footwear category
 *   3. forward: unstitched-flagged items in a stitched cat -> correct unstitched cat
 *      (piece-count preserved from the source cat; title overrides when it clearly says 2/3pc)
 *   4. reverse: women items with real S/M/L sizes in an unstitched cat -> stitched sibling
 *   5. piece-count: clear multi-piece enumerations sitting in a 1-piece kurti cat -> 2/3pc cat
 *
 * Run:  node catalog-cleanup.js          (dry-run, prints the plan)
 *       node catalog-cleanup.js apply     (writes catalog.json)
 * Re-run any time after a harvest. Safe to run repeatedly (idempotent).
 */
const fs = require('fs');
const APPLY = process.argv[2] === 'apply';
const FILE = process.env.PSB_CATALOG || 'catalog.json';
const cat = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const ps = cat.products || [];

const txt = p => ((p.t || '') + ' ' + (p.u || '')).toLowerCase();
const isUnsSz = p => Array.isArray(p.sz) && p.sz.length === 1 && /unstitch/i.test(p.sz[0]);
const unsTitle = p => /\bunstitch|un-?stitch|unstiched|ready[\s-]?to[\s-]?stitch|\brts\b|raw fabric|\bgreige\b/.test(txt(p));
const isUnstitched = p => isUnsSz(p) || unsTitle(p);
const szLetter = p => Array.isArray(p.sz) && p.sz.length && /^(xxs|xs|s|m|l|xl|xxl|3xl|small|medium|large)$/i.test((p.sz[0] || '').trim());

const STITCHED = new Set(['kurti_1pc','western_top','kaftan','maxi_dress','womens_trouser','shirt_dupatta_2pc','shirt_trouser_2pc','coord_western','pret_2pc_emb','formal_emb_2pc','pret_3pc','pret_3pc_emb','formal_emb_3pc','heavy_formal_3pc','handmade_emb','winter_2pc_stitch','winter_3pc_stitch']);
const FWD = {kurti_1pc:'kurti_1pc_unstitch',western_top:'kurti_1pc_unstitch',kaftan:'kurti_1pc_unstitch',womens_trouser:'kurti_1pc_unstitch',shirt_dupatta_2pc:'shirt_dupatta_2pc_unstitch',shirt_trouser_2pc:'shirt_trouser_2pc_unstitch',coord_western:'shirt_trouser_2pc_unstitch',pret_2pc_emb:'shirt_dupatta_2pc_unstitch',formal_emb_2pc:'shirt_dupatta_2pc_unstitch',pret_3pc:'lawn_3pc_unstitch',pret_3pc_emb:'unstitch_3pc_emb',formal_emb_3pc:'unstitch_3pc_emb',heavy_formal_3pc:'unstitch_3pc_emb',handmade_emb:'unstitch_3pc_emb',winter_2pc_stitch:'winter_2pc_unstitch',winter_3pc_stitch:'winter_3pc_unstitch',maxi_dress:null};
// MEN tier model. Tier-1 unstitched authority = sz=["Unstitched"] OR explicit unstitch/RTS in
// the title — NOT fabric-material words (suiting / wash-n-wear / gabardine describe a STITCHED
// men's garment's cloth, so they must NOT flag it unstitched).
const MEN_STITCHED = new Set(['mens_shirt','mens_trouser','mens_jeans','mens_kurta','mens_shalwar_kameez','mens_waistcoat','mens_suit','mens_sherwani']);
const menUns = p => isUnsSz(p) || /\bunstitch|un-?stitch|unstiched|ready[\s-]?to[\s-]?stitch|\brts\b/.test(txt(p));
const REV = {kurti_1pc_unstitch:'kurti_1pc',shirt_dupatta_2pc_unstitch:'shirt_dupatta_2pc',shirt_trouser_2pc_unstitch:'shirt_trouser_2pc',lawn_3pc_unstitch:'pret_3pc',unstitch_3pc_emb:'pret_3pc_emb',winter_2pc_unstitch:'winter_2pc_stitch',winter_3pc_unstitch:'winter_3pc_stitch'};
const ONE = new Set(['kurti_1pc','western_top','kaftan']);
const emb = s => /embroider|\bemb\b|zari|sequin|zardozi|\badda\b|chikan|ka?amdani|\bgota\b|hand ?work|resham|threadwork|kasab/.test(s);
const winterRe = s => /khaddar|khadar|karandi|\blinen\b|velvet|\bwool|winter|marina|pashmina/.test(s);

function fwdCat(p){
  const s = txt(p);
  const shirt = /(shirt|kameez|kurta|kurti|front|peplum)/.test(s), bottom = /(trouser|pajama|pajami|bottom|shalwar|pants|capri|tulip)/.test(s), dup = /(dupatta|chunri|chunni|stole)/.test(s);
  const s3 = /\b3\s*-?\s*(pc|piece|pcs)\b|three[\s-]?piece/.test(s) || (shirt && bottom && dup);
  const s2 = !s3 && (/\b2\s*-?\s*(pc|piece|pcs)\b|two[\s-]?piece/.test(s) || (shirt && dup && !bottom) || (shirt && bottom && !dup));
  const coord = shirt && bottom && !dup;
  if (s3) return emb(s) ? 'unstitch_3pc_emb' : (winterRe(s) ? 'winter_3pc_unstitch' : 'lawn_3pc_unstitch');
  if (s2) return winterRe(s) ? 'winter_2pc_unstitch' : (coord ? 'shirt_trouser_2pc_unstitch' : 'shirt_dupatta_2pc_unstitch');
  const sib = FWD[p.cat]; if (sib) return sib;
  return winterRe(s) ? 'winter_3pc_unstitch' : (emb(s) ? 'unstitch_3pc_emb' : 'lawn_3pc_unstitch');
}
function pieceCat(p){   // for a 1-piece kurti cat that's really 2/3pc
  const s = txt(p);
  const shirt = /(shirt|kameez|kurta|kurti|front)/.test(s), trouser = /(trouser|pajama|pajami|bottom|shalwar|\bpants?\b|capri|tulip)/.test(s), dup = /(dupatta|chunri|chunni|stole)/.test(s);
  const three = (shirt && trouser && dup) || /\b3\s*-?\s*(pc|piece|pcs)\b|three[\s-]?piece/.test(s);
  const two = !three && ((shirt && dup && !trouser) || (shirt && trouser && !dup) || /\b2\s*-?\s*(pc|piece|pcs)\b|two[\s-]?piece/.test(s));
  if (three) return emb(s) ? 'pret_3pc_emb' : 'pret_3pc';
  if (two) return (shirt && trouser && !dup) ? 'shirt_trouser_2pc' : (emb(s) ? 'pret_2pc_emb' : 'shirt_dupatta_2pc');
  return null;
}
const GARMENT = /shirt|kameez|kurti|kurta|\bdress\b|gown|frock|trouser|\bpant|\btop\b|abaya|hijab|shalwar|\bsuit\b|\blawn\b|saree|lehenga|dupatta|kaftan|maxi|peplum|blouse|tunic|\bcape\b|co-?ord|jumpsuit|romper|\btee\b|t-?shirt|polo|jeans|waistcoat|sweater|cardigan|hoodie|jacket|\bcoat\b|sweatshirt|nightwear|loungewear|pajama|angrakha|gharara|sharara|outfit|ensemble|\d ?piece|\d ?pc\b|unstitch|fabric/i;
const ACC = /\bsunglass|\beyewear\b|\bgoggles?\b|jewell?ery|\bearrings?\b|\bnecklace|\bbangles?\b|\bbracelet|\bpendant|\bbrooch|\bperfume\b|\bfragrance\b|\battar\b|\bwrist ?watch|\bwatch\b|\bbeanie\b|\bscrunchie|\bhair ?band|\bhair ?clip|\bkeychain|\bkey ?chain|\bsocks?\b|\bwallet\b|\bcard ?holder|\bcufflink|\btote\b|\bbackpack|\bsling ?bag|\bhand ?bag|\bclutch\b|\bpouch\b|\bbelt\b|\bcap\b/i;
const FOOT = /\bshoes?\b|\bheels?\b|\bsandal|\bslipper|\bsneaker|\bpump\b|\bwedge|\bmule\b|khussa|\bloafer|\bjutt?i\b|kolhapuri/i;

let del = 0, footDel = 0, footMove = 0, fwdN = 0, revN = 0, pieceN = 0, menUnsN = 0, menPcN = 0;
const out = [];
for (const p of ps) {
  if (ACC.test(p.t || '') && !GARMENT.test(p.t || '') && p.cat !== 'footwear') { del++; continue; }
  if (FOOT.test(p.t || '') && p.cat !== 'footwear') { if (/^mens_/.test(p.cat)) { footDel++; continue; } p.cat = 'footwear'; footMove++; out.push(p); continue; }
  if (isUnstitched(p) && STITCHED.has(p.cat)) { p.cat = fwdCat(p); fwdN++; out.push(p); continue; }
  if (szLetter(p) && REV[p.cat] && !unsTitle(p)) { p.cat = REV[p.cat]; revN++; out.push(p); continue; }
  // ── MEN: Tier-1 stitched/unstitched, then Tier-2 piece-count ──
  if (MEN_STITCHED.has(p.cat) && menUns(p)) { p.cat = 'mens_unstitched'; menUnsN++; out.push(p); continue; }
  if (p.cat === 'mens_shalwar_kameez') {   // 2pc: standalone top -> kurta, standalone bottom -> trouser
    const s = txt(p), top = /(kameez|kurta|shirt)/.test(s), bottom = /(shalwar|trouser|pajama|\bpant)/.test(s), pair = /(suit|2 ?pc|two[\s-]?piece|\bset\b|waistcoat|prince)/.test(s);
    if (!pair) { if (top && !bottom) { p.cat = 'mens_kurta'; menPcN++; } else if (bottom && !top) { p.cat = 'mens_trouser'; menPcN++; } }
    out.push(p); continue;
  }
  if (p.cat === 'mens_kurta') {             // 1pc: a kurta+pajama/shalwar pair is really 2pc
    const s = txt(p);
    if (/(kurta|kameez)[\s\S]*(pajama|shalwar)|(pajama|shalwar)[\s\S]*(kurta|kameez)|kurta ?pajama|\b2 ?pc|two[\s-]?piece/.test(s)) { p.cat = 'mens_shalwar_kameez'; menPcN++; }
    out.push(p); continue;
  }
  if (ONE.has(p.cat)) { const nc = pieceCat(p); if (nc && nc !== p.cat) { p.cat = nc; pieceN++; } }
  out.push(p);
}
console.log(`delete-accessories=${del} delete-men-footwear=${footDel} move-footwear=${footMove} fwd-unstitch=${fwdN} rev-stitch=${revN} piece-count=${pieceN} men-unstitch=${menUnsN} men-piece=${menPcN}`);
console.log(`total ${ps.length} -> ${out.length}`);
if (APPLY) { cat.products = out; fs.writeFileSync(FILE, JSON.stringify(cat)); console.log('*** WROTE ' + FILE + ' ***'); }
else console.log('(dry-run — pass "apply" to write)');
