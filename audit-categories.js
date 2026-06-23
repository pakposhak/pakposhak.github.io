/* PakPoshak — CATEGORY AUDIT TOOL  (the standard, repeatable category-accuracy check).
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * This is "Stage 1" of the visual audit method (see memory: catalog-visual-audit.md).
 *
 *   STAGE 1 — EXPLICITLY WRITTEN (this script):  for EVERY category, pull products sorted
 *             low→high, the FIRST 3 PAGES (cheapest — accessories/separates/mislabels pile up
 *             here) + the LAST page (priciest — bridal/heavy) + a couple of RANDOM middle pages,
 *             and flag any title whose words CONTRADICT its category. Known false-positives
 *             (colour names, collection names, women's waistcoats, kids' bottoms, "Denim Pants"
 *             = jeans, "Tap Shoe" = Amir Adnan jacket, "One Kids" = adult menswear) are excluded.
 *   STAGE 2 — PICTURE VIEW (done with image agents):  for the not-100%-clear residue this script
 *             surfaces (SKU-only titles, a dressed model on an "unstitched" item, eastern-vs-western
 *             calls), DOWNLOAD + LOOK at the photo before moving anything.
 *   STAGE 3 — write the fix in catalog-cleanup.js → unit-test → deploy → re-run this until clean.
 *
 * USAGE:
 *   node audit-categories.js                 # every category, low→high, first 3 pages
 *   node audit-categories.js --deep          # also pull the last page + 2 random middle pages
 *   node audit-categories.js --cat pret_3pc  # one category only
 *   node audit-categories.js --pages 5       # first N pages instead of 3
 * Exit code is the number of flagged suspects (0 = clean).  Pure read-only (no writes).
 */
'use strict';
const BASE = 'https://103.83.91.34.sslip.io/search';

// Every live category, grouped by department (keep in sync with catalog-cleanup.js).
const CATS = {
  women_stitch: ['kurti_1pc','western_top','kaftan','maxi_dress','womens_trouser','shirt_dupatta_2pc','shirt_trouser_2pc','coord_western','pret_2pc_emb','formal_emb_2pc','pret_3pc','pret_3pc_emb','formal_emb_3pc','heavy_formal_3pc','handmade_emb','winter_2pc_stitch','winter_3pc_stitch'],
  women_unstitch: ['kurti_1pc_unstitch','shirt_dupatta_2pc_unstitch','shirt_trouser_2pc_unstitch','lawn_3pc_unstitch','unstitch_3pc_emb','winter_2pc_unstitch','winter_3pc_unstitch'],
  women_other: ['abaya','saree','lehenga','shawl','dupatta_only','loungewear'],
  men: ['mens_shirt','mens_trouser','mens_jeans','mens_kurta','mens_shalwar_kameez','mens_waistcoat','mens_suit','mens_sherwani','mens_unstitched'],
  kids: ['kids_boys_eastern','kids_boys_western','kids_boys_formal','kids_girls_eastern','kids_girls_western','kids_girls_formal','kids_infant'],
  other: ['footwear'],
};

// ── word families ──
const FOOT  = /\bshoes?\b|\bheels?\b|\bsandals?\b|\bslippers?\b|\bslides?\b|sneakers?|\bpumps?\b|\bwedge|\bmule\b|khussa|\bloafer|\bjutt?i\b|kolhapuri|\bchappal|stiletto|espadrille|peshawari|\bmojari|\boxford/i;
const TOPN  = /\bshirt\b|\bkurta\b|\bkurti\b|\btop\b|\btee\b|t-?shirt|\btunic\b|\bblouse\b|\bkameez\b|\bfrock\b|kaftan|\bgown\b|\bmaxi\b|anarkali|\bpolo\b|crew[\s-]?neck|v-?neck/i;
const BOTN  = /\btrousers?\b|\bbottoms?\b|\bpants?\b|palazzo|pallazzo|plazzo|plazo|\bculottes?\b|\bjeggings?\b|\bleggings?\b|cigarette pant|\bcapri\b|\bskirt\b/i;
const DUP   = /\bdupatta\b|\bchunri\b/i;
const COSMETIC = /clay ?mask|lipstick|foundation|sunblock|sunscreen|\bserum\b|highlighter|\bkeratin\b|moisturi[sz]|face ?(wash|cream|mask)|\bprimer\b|concealer|\bkajal\b|nail ?(polish|paint)|\bmakeup\b|\bcosmetic/i;
const JEWELRY = /jewell?ery|jewelry|\bnecklace|\bearrings?\b|\bbracelet|\bbangles?\b|\bwristband\b|\bbrooch|\bpendant/i;
const isMenStrong = /\bmen'?s\b|\bgents\b|sherwani|kurta ?(pajama|pyjama)|\bdhoti\b/i;
const isWomen = /\bwomen'?s?\b|\bladies\b|\bgirl'?s?\b|frock|kurti|saree|lehenga|abaya|anarkali|gharara|\bblouse\b/i;
const isKidStrong = /\binfants?\b|\btoddler|\bnewborn|\d{1,2}\s*-\s*\d{1,2}\s*y\b|\bromper\b|\bonesie\b/i;  // strong kid signal (NOT colours like "Baby Pink")
const ONE = /\b1 ?pcs?\b|\b1 ?pieces?\b|single[\s-]?piece|\b1-piece\b/i;
const THREE = /\b3 ?pcs?\b|\b3 ?pieces?\b|three[\s-]?piece/i;

// ── KNOWN FALSE POSITIVES — never flag these (learned the hard way over many audit rounds) ──
function isFalsePositive(p) {
  const t = (p.t || ''); const b = (p.b || '');
  if (/\bbaby (pink|blue|peach|yellow|green|purple|color)/i.test(t)) return true;   // colour, not an infant
  if (/soft girl era|desi girl|tap shoe|girl power|midnight|night ?(garden|bloom|star|sky)/i.test(t)) return true; // collection names
  if (/\bdenim (pants?|jeans?|trousers?)\b/i.test(t)) return true;                  // = jeans, correct in mens_jeans
  if (p.cat === 'mens_sherwani' && /prince ?coat/i.test(t)) return true;           // "prince coat with same pant" = a sherwani set
  if (/waist ?coat/i.test(t) && /^(pret_3pc|kurti_1pc|pret_3pc_emb)$/.test(p.cat)) return true; // women's waistcoat is legit
  if (b === 'One Kids') return true;                                               // "One Kids" sells ADULT menswear (confusing name)
  if ((p.cat === 'coord_western' || p.cat === 'mens_waistcoat') && /\bwaistcoat\b|poncho|\bcorset\b|bikini|\bjacket\b/i.test(t)) return true; // set/couture pieces legitimately pair a bottom
  if (b === 'Zainab Chottani' && /\bcapri\b/i.test(t) && p.cat === 'kaftan') return true; // "Capri" = a velvet KAFTAN line, not a capri bottom
  return false;
}

// ── per-category contradiction detector → returns array of flag strings ──
function flag(p) {
  const t = p.t || '', c = p.cat, out = [];
  if (isFalsePositive(p)) return out;
  const isFoot = c === 'footwear', isBottom = /trouser$/.test(c) || c === 'womens_trouser' || c === 'mens_trouser' || c === 'mens_jeans',
        isDup = c === 'dupatta_only', isShawl = c === 'shawl', isKidCat = /^kids_/.test(c),
        gender = /^mens_/.test(c) ? 'm' : isKidCat ? 'k' : 'w';
  if (!isFoot && FOOT.test(t) && !TOPN.test(t) && !BOTN.test(t) && !/\bsuit\b|kameez|kurta/i.test(t)) out.push('FOOTWEAR');
  if (COSMETIC.test(t)) out.push('COSMETIC(delete?)');
  if (JEWELRY.test(t) && !TOPN.test(t) && !BOTN.test(t)) out.push('JEWELRY(delete?)');
  // a standalone bottom (no top word, no dupatta, no suit) in a NON-bottom adult cat. Kids cats skip
  // (no kids-trouser cat — a boys/girls trouser correctly lives in its gender/style kids cat).
  if (!isBottom && !isDup && !isShawl && !isKidCat && !/^(coord_western|mens_suit|mens_sherwani)$/.test(c) && BOTN.test(t) && !TOPN.test(t) && !DUP.test(t) && !/\bsuit\b|[23] ?(pc|piece)|co-?ord/i.test(t)) out.push('BOTTOM-ONLY');   // coord/suit/sherwani are jacket+pant SET cats — a bottom word is expected
  if (gender === 'w' && isMenStrong.test(t) && !isWomen.test(t)) out.push('MEN-IN-WOMEN');
  if (gender === 'm' && isWomen.test(t) && !isMenStrong.test(t)) out.push('WOMEN-IN-MEN');
  if (gender !== 'k' && isKidStrong.test(t)) out.push('KID-IN-ADULT');
  if (/_3pc$|3pc_emb|3pc_unstitch|heavy_formal_3pc|formal_emb_3pc/.test(c) && ONE.test(t) && !THREE.test(t) && !/\b2 ?(pc|piece)/i.test(t)) out.push('1PC-IN-3PC');
  if (c === 'kurti_1pc' && THREE.test(t)) out.push('3PC-IN-KURTI');
  if (c === 'kurti_1pc' && /\btank ?top|\btee\b|t-?shirt|\bblouse\b|camisole|\bpolo\b|crew[\s-]?neck|button[\s-]?(down|up)|\bjacket\b|\bblazer\b|\bskirt\b/i.test(t) && !/kurta|kameez|kurti|dupatta|shalwar/i.test(t)) out.push('WESTERN-IN-KURTI');
  return out;
}

// ── live API helpers ──
async function q(params) { const r = await fetch(BASE + '?' + new URLSearchParams(params)); return r.json(); }
async function pages(cat, pageList) {
  const all = [];
  for (const pg of pageList) { const j = await q({ cat, sort: 'asc', pageSize: '60', page: String(pg), include_hidden: '1' }); all.push(...(j.products || [])); }
  return all;
}

(async () => {
  const args = process.argv.slice(2);
  const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? (args[i + 1] || true) : d; };
  const nPages = +arg('--pages', 3), deep = args.includes('--deep'), onlyCat = arg('--cat', null), onlyBrand = arg('--brand', null);
  let total = 0;
  const list = onlyCat ? [['(single)', [onlyCat]]] : Object.entries(CATS);
  for (const [grp, cats] of list) {
    console.log(`\n========== ${grp.toUpperCase()} ==========`);
    for (const cat of cats) {
      // figure out total to compute the last page + random middle pages
      const head = await q({ cat, sort: 'asc', pageSize: '1', page: '0', include_hidden: '1' });
      const tot = head.total || 0, lastPg = Math.max(0, Math.ceil(tot / 60) - 1);
      const pgSet = new Set(); for (let i = 0; i < nPages; i++) pgSet.add(i);
      if (deep && lastPg > 0) { pgSet.add(lastPg); pgSet.add(Math.floor(lastPg / 3)); pgSet.add(Math.floor((2 * lastPg) / 3)); }
      let prods = await pages(cat, [...pgSet].filter(p => p <= lastPg));
      if (onlyBrand) prods = prods.filter(p => (p.b || '') === onlyBrand);
      const hits = {};
      prods.forEach(p => { flag(p).forEach(f => { (hits[f] = hits[f] || []).push(`${p.b} :: ${p.t}`); }); });
      const sum = Object.entries(hits).map(([k, v]) => `${k}=${v.length}`).join(' ');
      const n = Object.values(hits).reduce((a, v) => a + v.length, 0); total += n;
      console.log(`${cat.padEnd(26)} ${String(tot).padStart(5)} items  ${sum || '(clean)'}`);
      Object.entries(hits).forEach(([k, v]) => [...new Set(v)].slice(0, 4).forEach(s => console.log(`      ${k}: ${s.slice(0, 74)}`)));
    }
  }
  console.log(`\nTOTAL flagged suspects: ${total}  (0 = clean; remaining flags are Stage-2 picture-pass candidates)`);
  process.exit(total);
})().catch(e => { console.error('ERR', e.message); process.exit(255); });
