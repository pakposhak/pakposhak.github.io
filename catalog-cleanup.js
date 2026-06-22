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

const txt = p => ((p.t || '') + ' ' + (p.u || '')).toLowerCase();
// Bare metre lengths of ≥2 ("6M", "2.5 M", "4M") = fabric sold by the METRE, never an infant age.
// The ≥2 floor is critical: infant sizes start at "0 M"/"1 M" (0–1 months, newborn) — those are
// months, NOT metres (you can't buy 0 metres of cloth). A genuine infant size is also a RANGE
// ("0-3M"/"3-6M") or carries NB/Newborn — never a lone "6M".
const meterSz = p => Array.isArray(p.sz) && p.sz.length > 0 && p.sz.every(z => { const m = /^(\d{1,2}(?:\.\d)?)\s*m$/i.exec(String(z || '').trim()); return m && parseFloat(m[1]) >= 2; });
// Words that mark a GENUINE infant/baby garment (so we never mistake real baby clothes for cloth).
const INFANT_WORD = /\bromper|bodysuit|sleep[\s-]?suit|jhabla|\bonesie|swaddle|\bbib\b|booties|\bbaby\b|\binfant\b|newborn|\bnb\b|toddler|\bfrock\b|\bpram\b|overall|dungaree|jumpsuit|\bvest\b|mitten|smocking/i;
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
// Girls-only festive brands whose KIDS line is girls — the harvester defaults code-named kids
// (e.g. Alizeh "AFK-..." design codes, no gender word) to BOYS; the product image confirms they
// are girls eastern festive. So their kids_boys_* items -> kids_girls_eastern. (Extend as found.)
// Girls-only kids labels the harvester defaults to BOYS (code-named items, no gender word).
// Alizeh = festive girls brand. ETHNC (Ethnic by Outfitters) = women's + girls' label with NO
// boys line — vision-confirmed its kids_boys (co-ord sets, jumpsuits, tights, tees) are all on
// girl models, and 0 ETHNC items carry a "boy" title. Move kids_boys_* → kids_girls_* (keep suffix).
const GIRLS_KIDS_BRANDS = new Set(['Alizeh', 'ETHNC']);
// Women-first brands that ALSO carry a men's line which the harvester (no men cat for them) dumps
// into the women 2-piece cats. Vision-confirmed WHOLE-category (not per image): every "Shalwar
// Kameez" / "Kurta Shalwar" / "Kurta with Trouser" 2pc listing of these brands is their MENSWEAR.
// (Azure shirt_trouser_2pc = 13 men's; Al-Deebaj = 27 men's "Kurta Shalwar".) Extend as found.
const MENS_2PC_BRANDS = new Set(['Azure', 'Al-Deebaj']);
const MENS_2PC_TITLE = /shalwar kameez|kameez shalwar|kurta shalwar|kurta with[\s\S]*(trouser|shalwar)/i;
const MENS_2PC_GUARD = /dupatta|chunri|3 ?pc|3 ?piece|2 ?piece\b|\bsuit\b|lehenga|saree|\bfrock\b|\bgown\b|\bmaxi\b|\babaya\b|co-?ord/i;   // women 3pc/suit/dupatta → NOT the men's 2pc line
// GIRL-garment markers for kids items the harvester defaulted to BOYS (no gender word in title).
// Image-confirmed on One Kids / Hopscotch / Wear Ochre / Beechtree / ETHNC western kids lines.
// STRONG = girl-only garments a boys' item would never carry → move even if the title says "boys"
// (titles are often mis-tagged). SOFT = feminine prints/silhouettes that rarely-but-can appear on
// boys → move ONLY when the title does NOT say boy/boys (so "Boys floral polo" stays a boy).
// \b guards stop false hits (rainbow≠bow, elbow≠bow). GUARD excludes a boy's dress-shirt/fancy-dress.
const KGIRL_STRONG = /\bfrock\b|\bgown\b|\bpeplum\b|pinafore|\btutu\b|princess|\bbarbie\b|unicorn|fairy|jasmine|\bblouse\b|lehenga|sharara|gharara|\btulle\b|lace (dress|frock|top|gown)|\babaya\b|\bmakhna\b|\bhijab\b|\bniqab\b|\bjilbab\b|\bburqa\b|\bburka\b|\bkhimar\b/;   // …+ girls' modest wear (abaya/makhna/hijab/niqab — a boy's item never carries these; were leaking into kids_boys_western from Hijabi.pk/Hijab-ul-Hareem/Abaya.pk)
const KGIRL_SOFT = /\bdress\b|\bskirt\b|\bfloral\b|\bflower\b|smock|gathered|\bpoof\b|sequin|ruffl|butterfly|cold[\s-]?shoulder|crop[\s-]?(tee|top|polo)|jegging|bow (top|dress|frock|blouse)/;
const KGIRL_GUARD = /dress shirt|dress pant|fancy dress/;
const KGIRL_EAST = /\bfrock\b|kaftan|kameez|shalwar|\bkurta\b|\bkurti\b|anarkali|lehenga|gharara|sharara|peshwas|abaya|makhna|hijab|niqab|jilbab|burqa|burka|khimar/;   // eastern girls' garment / modest wear → kids_girls_eastern (else western)
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
// MEN garment-type correction (tier-2/3), image-validated on the brand audit. Returns the correct
// men cat for a product currently in some men (non-fabric) category, or null to leave it. Order
// matters: the 2pc kurta+bottom rule runs BEFORE jeans so a "Jeans Kurta Pajama" stays a 2pc
// kurta-pajama; prince/sherwani are never moved to shalwar-kameez or suit.
function menType(p){
  const s = (p.t || '').toLowerCase();   // TITLE only — product URLs carry collection names ("...kameez-collection") that wrongly trip the rules
  if (!/\bprince\b|\bsherwani\b/.test(s)
      && /(kurta|kameez)[\s\S]{0,30}(trouser|pajama|pyjama|shalwar|drawstring)|(shalwar|pajama|trouser)[\s\S]{0,30}(kurta|kameez)|kameez shalwar|shalwar kameez|kurta pajama|kurta trouser/.test(s))
    return 'mens_shalwar_kameez';                                            // 2pc kameez+shalwar / kurta+bottom
  if (/\btuxedo\b|\bblazer\b|pant ?coat|coat ?pant|bespoke suit/.test(s) && !/(shalwar|kameez|kurta|sherwani|prince)/.test(s)) return 'mens_suit';   // western suit BEFORE jeans ("Blazer | Denim" is a suit)
  if (/\bjeans?\b|\bdenim\b/.test(s) && !/(kurta|kameez|shalwar|shirt|jacket)/.test(s)) return 'mens_jeans';   // a "Denim Casual Shirt"/"Denim Jacket" is not jeans
  if (/\bhenley\b|\bpolo\b|t-?shirt|dress shirt|formal shirt|tuxedo shirt|casual shirt|button ?down|\bsweat ?shirt\b|\bhoodie\b|track ?suit/.test(s)) return 'mens_shirt';
  if ((p.cat === 'mens_kurta' || p.cat === 'mens_shalwar_kameez' || p.cat === 'mens_jeans')
      && /\btrouser|\bchino|\bcargo\b|dress pant|\bshorts?\b|\bpants?\b|\bshalwar\b|sleepwear|sleep ?wear/.test(s)
      && !/(kurta|kameez|shirt|\bsuit\b|kurti|waistcoat|\bjeans?\b|\bdenim\b)/.test(s)) return 'mens_trouser';   // standalone bottom
  if (p.cat === 'mens_shalwar_kameez'
      && /(kameez|kurta)/.test(s)
      && !/(shalwar|trouser|pajama|pyjama|\bpant|\bsuit\b|\bset\b|waistcoat|2 ?pc|two[\s-]?piece|prince)/.test(s)) return 'mens_kurta';  // standalone top
  return null;
}
// WOMEN-category corrector (title-based, image-validated on the audit): routes kids items
// mis-parked in women cats to kids (girls default — brands like Senorita/Sha Posh confirmed via
// product image), niqab/abaya -> abaya, standalone bottoms -> womens_trouser, lone tees ->
// western_top. The "baby blue/pink" colour guard stops a women's lawn shirt going to infant.
function womenType(p){
  const s = (p.t || '').toLowerCase();
  // explicit MEN markers in a women cat -> route to the right men cat (image-confirmed: Gul Ahmed
  // "Dress Shirts" image = a man; Sitara "…Men's Unstitched Suit" = men's suiting fabric). "women's"
  // is NOT matched (no word boundary before "men" in "women's").
  if (/\bmen[’'`]?s\b|\bmens\b|\bfor men\b|\bgents\b|dress shirt|tuxedo shirt/.test(s) && !/\bwomen|\bwoman\b|\bladies\b|\bgirls?\b/.test(s)) {   // "Women's & Men's Couple Dress" is NOT men's
    if (isUnstitched(p) || /\bunstitch/.test(s)) return 'mens_unstitched';
    if (/dress shirt|tuxedo shirt|\bshirt\b|\bpolo\b|t-?shirt|\bhenley\b/.test(s)) return 'mens_shirt';
    if (/\btrouser\b|\bpants?\b|\bchino|\bcargo\b/.test(s)) return 'mens_trouser';
    if (/(kameez|kurta)[\s\S]*(shalwar|trouser|pajama)|shalwar kameez|kameez shalwar/.test(s)) return 'mens_shalwar_kameez';
    if (/\btuxedo\b|\bblazer\b|\bsuit\b|pant ?coat/.test(s)) return 'mens_suit';
    return 'mens_kurta';
  }
  if (/\bkids?\b|\binfant\b|\bnewborn\b|\btoddler\b|\bbaby\b/.test(s) && !/baby ?(blue|pink|peach|green|yellow|purple|lilac|colou?r|.?s breath)|maybe ?baby/.test(s)) {
    if (/\binfant\b|\bnewborn\b|\btoddler\b|\bbaby\b|\b0-?2 ?y/.test(s)) return 'kids_infant';
    const boy = /\bboys?\b/.test(s);
    if (/\bformal\b|wedding|party ?wear|festive|frock/.test(s)) return boy ? 'kids_boys_formal' : 'kids_girls_formal';
    if (/\bjeans?\b|t-?shirt|\btop\b|\bdress\b|\bmaxi\b|skirt|legging|jumpsuit|co-?ord|\bpolo\b|\btee\b|\bshort/.test(s)) return boy ? 'kids_boys_western' : 'kids_girls_western';
    return boy ? 'kids_boys_eastern' : 'kids_girls_eastern';
  }
  // Loungewear false-positive: luxury brands name formal collections "Night Affair"/"Night Edit"/etc.
  // and the word "night" alone triggers loungewear routing. Only reroute when "night" is present
  // WITHOUT an actual sleepwear/lounge-garment qualifier (suit, wear, dress, gown, set, pyjama …).
  if (p.cat === 'loungewear' && /\bnight\b/i.test(p.t||'') && !/nightsuit|night[\s-]?(?:suit|wear|dress|gown|shirt|shorts?|pants?|set)|pyjama|pyajma|pajama|sleepwear|sleep[\s-]?(?:set|wear)|lounge[\s-]?(?:wear|set)|loungewear|\bnighty\b/i.test(p.t||'')) {
    const _wc = womenCatFor(p); return _wc !== 'loungewear' ? _wc : null;
  }
  if (/\bniqab\b|\bjilbab\b|\bburqa\b|\bburka\b|\babaya\b/.test(s) && p.cat !== 'abaya') return 'abaya';
  // Hijab head-coverings routed to dupatta_only → abaya (modest wear garment, not a fashion accessory)
  if (p.cat === 'dupatta_only' && /\bhijab\b|\bhead[\s-]?(?:scarf|veil|cover)\b|\bkhimar\b/i.test(s)) return 'abaya';
  // Groom formalwear (sherwani / prince-coat) parked in a women cat → men. These titles carry NO
  // "men's" word so the men-marker rule above misses them (Zainab Chottani / Asim Jofa bridal groom
  // pieces in pret_3pc). Guard against women's "sherwani-style kurti" and bridal lehengas.
  if (/\bsherwani\b|\bprince[\s-]?coat\b/.test(s) && !/\bwomen|\bladies\b|\bgirls?\b|\bkurti\b|\bstyle\b|inspired|lehenga|gharara|sharara|\bfrock\b|\bsaree\b|\bmaxi\b|\bgown\b/.test(s)) return 'mens_sherwani';
  if (/\b(trouser|straight pants?|culottes?|tights|palazzo|cigarette pants?|farshi shalwar|pants?)\b/.test(s)
      && !/(shirt|kameez|kurti|kurta|dupatta|\bsuit\b|3 ?pc|2 ?pc|3 ?piece|2 ?piece|\btop\b|co-?ord|frock|\bmaxi\b|gown|saree|lehenga|abaya|kaftan|peplum)/.test(s)) return isUnstitched(p) ? 'kurti_1pc_unstitch' : 'womens_trouser';
  if (/\bt-?shirt\b|tank top/.test(s) && !/(\bsuit\b|3 ?pc|2 ?pc|dupatta|trouser|kameez)/.test(s)) return 'western_top';
  return null;
}
// ── BRAND SLUG-GENDER (req 2026-06-21): some multi-gender brands tag gender in the product SLUG,
// and the harvester mis-genders chunks of them into WOMEN categories. Trust the slug to fix the
// WHOLE brand at once (not one image): returns 'm'|'kb'|'kg' for an item that should NOT be in a
// women cat, or '' to leave it. VERIFIED: Zellbury SKU lead letter (m=men, w=women, g=kids-boys);
// Diners prefix (w*=women, kb*=boys, kg*=girls, else men). Extend as new brands are confirmed. ──
function slugGender(p) {
  const seg = ((p.u || '').toLowerCase().match(/\/products\/(.+?)(?:\?|$)/) || [, ''])[1];
  if (p.b === 'Zellbury') {
    let lead = '';
    for (const t of seg.split('-')) { const a = t.match(/^([a-z]{1,6})\d{3,}/); if (a) { lead = a[1][0]; break; } }
    return lead === 'm' ? 'm' : '';   // w=women & g=kids-boys are already placed right; only m-coded leak into women
  }
  if (p.b === 'Diners') {
    if (/ladies|women|woman/.test(seg)) return '';          // explicit women slug ("ladies-trouser-…") wins
    const pre = (seg.match(/^([a-z]+)/) || [, ''])[1];
    if (/^kb/.test(pre)) return 'kb';
    if (/^kg/.test(pre)) return 'kg';
    if (/^(w|k)/.test(pre)) return '';                      // women (wtr/wkl/wu/wk) & kids lines already right
    if (/for[\s-]?men|[-_]men[-_]|\bmens\b|gents/.test(seg) || /^(ad|us|eg|ab|ba|ag|formal)/.test(pre)) return 'm';   // verified men lines
    return '';                                              // unknown prefix → don't guess
  }
  return '';
}
// garment → men's category (for a slug-confirmed men's item sitting in a women cat)
function menCatFor(t) {
  const s = (t || '').toLowerCase();
  if (/unstitch|\brts\b/.test(s)) return 'mens_unstitched';
  if (/sherwani/.test(s)) return 'mens_sherwani';
  if (/waistcoat/.test(s)) return 'mens_waistcoat';
  if (/tuxedo|blazer|pant ?coat|coat ?pant/.test(s) && !/kameez|shalwar|kurta/.test(s)) return 'mens_suit';
  if (/jeans?|denim/.test(s) && !/kameez|shalwar|kurta|shirt|jacket/.test(s)) return 'mens_jeans';   // "Denim Jacket" is a jacket, not jeans
  if (/shalwar|kameez/.test(s)) return 'mens_shalwar_kameez';
  if (/kurta/.test(s)) return /trouser|pajama|pyjama|shalwar/.test(s) ? 'mens_shalwar_kameez' : 'mens_kurta';
  if (/trouser|\bchino|\bcargo\b|\bpants?\b|\bshorts?\b/.test(s) && !/shirt/.test(s)) return 'mens_trouser';
  if (/polo|t-?shirt|\btee\b|\bshirt\b|henley|sweat ?shirt|hoodie|sweater|jacket|bomber|puffer|track|\bvest\b|cardigan|pullover|mock ?neck|high ?neck/.test(s)) return 'mens_shirt';
  return 'mens_shalwar_kameez';
}
// FULLY-resolved men's category for a brand-rule move — applies the SAME unstitched + garment-type
// refinement the men pipeline would, so the move is idempotent (no flip on the next harvest pass).
function finalMenCat(p) {
  if (isUnstitched(p)) return 'mens_unstitched';
  const base = menCatFor(p.t);
  const ref = menType({ t: p.t, cat: base });
  return ref || base;
}
// garment → kids category. boy: true→boys, false→girls, null→infer from garment (frock/dress=girl).
function kidsCatFor(t, boy) {
  const s = (t || '').toLowerCase();
  if (boy == null) boy = !/frock|\bdress\b|gown|lehenga|gharara|sharara|peplum|skirt|\bbarbie\b|princess|unicorn/.test(s);
  const g = boy ? 'boys' : 'girls';
  if (/tuxedo|\bsuit\b|blazer|\bformal\b|prince ?coat/.test(s)) return 'kids_' + g + '_formal';
  if (/kurta|kameez|shalwar|sherwani|waistcoat|pajama|pyjama|sharara|gharara|lehenga|frock|anarkali|\bthobe\b|\bjhuba\b|\beastern\b/.test(s)) return 'kids_' + g + '_eastern';
  return 'kids_' + g + '_western';
}
// garment → WOMEN category (for an item whose title explicitly says women but sits in men/kids)
function womenCatFor(p) {
  const s = (p.t || '').toLowerCase();
  if (/\bsaree\b|\bsari\b/.test(s)) return 'saree';
  if (/\blehenga\b/.test(s)) return 'lehenga';
  if (/\b(abaya|niqab|jilbab|burqa)\b/.test(s)) return 'abaya';
  if (/(\bdupatta\b|\bhijab\b|\bscarf\b|\bshawl\b|\bstole\b)/.test(s) && !/(shirt|kameez|kurta|\bsuit\b|3 ?pc|2 ?pc)/.test(s)) return 'dupatta_only';
  const uns = isUnstitched(p);
  const three = /\b3 ?pc\b|\b3 ?piece\b|three[\s-]?piece/.test(s);
  const two = /\b2 ?pc\b|\b2 ?piece\b|two[\s-]?piece/.test(s);
  if (uns || /\bfabric\b|unstitch/.test(s)) { if (three) return emb(s) ? 'unstitch_3pc_emb' : 'lawn_3pc_unstitch'; if (two) return 'shirt_dupatta_2pc_unstitch'; return 'lawn_3pc_unstitch'; }
  if (three) return emb(s) ? 'pret_3pc_emb' : 'pret_3pc';
  if (two) return emb(s) ? 'pret_2pc_emb' : 'shirt_dupatta_2pc';
  if (/\bdress\b|\bgown\b|\bmaxi\b|frock/.test(s)) return 'maxi_dress';
  if (/jacket|\bcoat\b|cardigan|sweater|hoodie|sweatshirt/.test(s)) return 'western_top';
  if (/trouser|\bpants?\b|culotte|palazzo|tights/.test(s) && !/(shirt|kameez|kurti|kurta|\bsuit\b)/.test(s)) return 'womens_trouser';
  if (/kurti|\bkurta\b|\bshirt\b|tunic|\btop\b/.test(s)) return uns ? 'kurti_1pc_unstitch' : 'kurti_1pc';
  return 'pret_3pc';
}
// EXPLICIT-title gender (high-confidence, guarded): returns m|w|kb|kg|ki|k or null. Guards strip
// superhero names ("Iron Man") and require possessive/plural or garment-adjacency for girl/boy so
// collection NAMES ("A Girl In The Garden", "It Girl", "Who's That Girl") don't trip it; "baby" is
// only kids when it's not a colour ("Baby Blue").
const SUPERHERO = /iron ?man|spider ?man|super ?man|bat ?man|he-?man|ant ?man|wonder ?woman|sales ?man|chair ?man/g;
const BABYCOLOR = /baby ?(blue|pink|peach|green|yellow|purple|lilac|white|grey|gray|brown|mint|sky|colou?r|.?s? ?breath)|maybe ?baby/;
function explicitGender(t) {
  const s = (t || '').toLowerCase().replace(SUPERHERO, ' ');
  if (/\bwomen[’'`]?s?\b|\bwoman[’'`]?s?\b|\bladies\b|\bfor women\b/.test(s)) return 'w';
  if (/\bgirls[’'`]?\b|\bgirl[’'`]s\b/.test(s) || /\b(\d ?pc|\d ?piece|2pc|3pc) girl\b/.test(s) || /\bgirl (suit|kurta|frock|dress|lawn|kameez|shalwar|2 ?pc|3 ?pc)\b/.test(s)) return 'kg';
  if (/\bboys[’'`]?\b|\bboy[’'`]s\b/.test(s) || /\bboy (suit|kurta|shirt|shalwar|kameez|pajama|trouser)\b/.test(s)) return 'kb';
  if (/\b(infant|newborn|toddler)\b/.test(s)) return 'ki';
  if (/\bkids?[’'`]?\b/.test(s)) return 'k';
  if (/\bmen[’'`]?s\b|\bgents\b|\bfor men\b/.test(s)) return 'm';
  if (/\bbaby\b/.test(s) && !BABYCOLOR.test(s)) return 'ki';
  return null;
}
const coarseGender = g => (g === 'kb' || g === 'kg' || g === 'ki' || g === 'k') ? 'k' : g;
const catGenderOf = c => /^mens_/.test(c) ? 'm' : /^kids_/.test(c) ? 'k' : 'w';
const GARMENT = /shirt|kameez|kurti|kurta|\bdress\b|gown|frock|trouser|\bpant|\btop\b|abaya|hijab|shalwar|\bsuit\b|\blawn\b|saree|lehenga|dupatta|kaftan|maxi|peplum|blouse|tunic|\bcape\b|co-?ord|jumpsuit|romper|\btee\b|t-?shirt|polo|jeans|waistcoat|sweater|cardigan|hoodie|jacket|\bcoat\b|sweatshirt|nightwear|loungewear|pajama|angrakha|gharara|sharara|outfit|ensemble|\d ?piece|\d ?pc\b|unstitch|fabric/i;
const ACC = /\bsunglass|\beyewear\b|\bgoggles?\b|jewell?ery|\bearrings?\b|\bnecklace|\bbangles?\b|\bbracelet|\bpendant|\bbrooch|\bperfume\b|\bfragrance\b|\battar\b|\bwrist ?watch|\bwatch\b|\bbeanie\b|\bscrunchie|\bhair ?band|\bhair ?clip|\bkeychain|\bkey ?chain|\bsocks?\b|\bwallet\b|\bcard ?holder|\bcufflink|\btote\b|\bbackpack|\bsling ?bag|\bhand ?bag|\bclutch\b|\bpouch\b|\bbelt\b|\bcap\b/i;
const FOOT = /\bshoes?\b|\bheels?\b|\bsandal|\bslipper|\bslides?\b|\bsneaker|\bpump\b|\bwedge|\bmule\b|khussa|\bloafer|\bjutt?i\b|kolhapuri/i;
// ── CATALOG URL REWRITE: known intl-twin domains → PK store ──
// Mirrors order-form.html TWIN_MAP but applied at cleanup time so browse-product links
// always point to the PKR store, not a USD international twin.
const DOMAIN_REWRITE = {
  'us.mushq.com': 'mushq.com',   // USD international twin → PK PKR store
};

// Clearly NON-APPAREL (homeware / cosmetics / fragrance / headwear / innerwear / gifting /
// neckwear) — delete outright. These are unambiguous (a gift box / lampshade / beard oil never
// names a garment), so no garment-exclusion is needed. Surfaced by the brand-by-brand audit.
// NON-APPAREL -> delete (from the brand audit). STRONG terms never appear in a garment title
// (gift box/lampshade/ceramic jar/pocket square/koofi) -> delete unconditionally. WEAK terms also
// double as colour/scent names ("Incense","Oud","Musk") or set components ("Sando shirt","Turban
// ...Kurta") -> delete ONLY when the title has no garment NOUN (nouns, not piece-counts, so a
// "Seamless Boxers 2pc" still goes).
const NONAPPAREL_STRONG = /gift ?(box|card|set|hamper|voucher|pack)\b|\bhamper\b|beard ?oil|\bcologne\b|body ?spray|lip ?(&|and|n) ?cheek|lip ?tint|cheek ?tint|argan ?oil|\bconditioner\b|\bshampoo\b|hair ?(serum|oil|catcher|grip|band|clip|tie)|\bdiffuser\b|room ?spray|scented ?candle|\bcandle\b|\bbukhoor\b|\blampshade\b|\bcomforter\b|\bduvet\b|bed ?sheet|bedsheet|\bcushion\b|coffee ?table|table ?set|brass ?table|\bfurniture\b|ceramic ?(jar|mug|vase|plate|bowl|pot|ware)|\bcrockery\b|\btumbler\b|water ?bottle|\bzamzam\b|\bcooler\b|\bperfume\b|\bfragrance\b|gift ?wrap|ear ?cuff|tasbeeh|tasbih|misbaha|placemat|place ?mat|table ?runner|table ?cloth|tablecloth|\bcoaster|\bnapkin|prayer ?mat|jaye ?namaz|janamaz|\bmiswak\b|hijab ?(crown ?)?grip|\bself[\s-]?tie\b|\(TIE-\d+\)|designer[\s-]?tie\b|\[\+\s*rs\.?|\bstorage[\s-]+basket\b|\bwicker\s+basket\b|\blaundry\s+basket\b|\brattan\s+basket\b|\blapel\s*pin\b|\beyeliner\b|\bmascara\b|\bburp[\s-]*cloth\b|\bburp[\s-]*bib\b|\bpotli\s*bag\b|\bhand[\s-]?crafted\s+phool\b|\bmirchi\s+sahara\b/i;
const NONAPPAREL_WEAK = /\bmusk\b|\boud\b|\bincense\b|\bturban\b|\bimamah\b|\bkoofi\b|\bkufi\b|\btopi\b|prayer ?cap|pocket ?square|bow ?tie|bowtie|\bbow\b|\bnecktie\b|^tie\b|\btie[\s-]?pin\b|\bboxers?\b|\bbriefs?\b|boy ?shorts|\bsando\b|\bundershirt\b|cotton ?vest|vest ?pack|pack of \d+ ?(vest|boxer|brief)|undergarment|seamless ?boxer|\bmuffler\b|\bcharm\b|\bhipster\b|\btrunks?\b|men'?s vest|vest with sleeves|jersey vest|seamless ?(jersey )?vest|sleeveless vest|\bcaps?\b|\bsofa\b|\bottoman\b|recliner|\bcouch\b|dining ?table|cente?r ?table|coff?e?e? ?table|breakfast ?table|console ?table|room ?chair|bed ?spread|bedspread|l-?shape ?sofa|sideboard|\bmattress\b|\bdresser\b|\benvelop(?:e)?\b|\bpotli\b/i;
const GARMENT_NOUN = /\b(kurti|kurta|kameez|shirt|t-?shirt|sweat ?shirt|sweat ?pants?|tee|polo|dress|gown|frock|trousers?|pants?|joggers?|leggings?|shorts?|skirt|abaya|hijab|shalwar|saree|lehenga|dupatta|kaftan|maxi|peplum|blouse|top|tank|tunic|sherwani|waistcoat|jacket|bomber|sweater|cardigan|hoodie|pullover|outfit|romper|jumpsuit|suit|blazer|coat|tuxedo)\b/i;

// Apply the full multi-tier cleanup to a products array → { products, stats }. Pure &
// idempotent. MUTATES each kept product's .cat in place and drops accessories / men footwear.
// Call from the harvester (right before it writes catalog.json) or from the CLI below.
function cleanupProducts(ps) {
  let del = 0, footDel = 0, footMove = 0, fwdN = 0, revN = 0, pieceN = 0, menUnsN = 0, menPcN = 0, junkN = 0, womenN = 0, girlsKidN = 0, slugN = 0, explicitN = 0;
  const out = [];
  // ── URL rewrite: international twin → PK domain ──
  for (const p of ps) { if (p.u) { for (const [intl, pk] of Object.entries(DOMAIN_REWRITE)) { if (p.u.includes('//' + intl)) { p.u = p.u.replace('//' + intl, '//' + pk); break; } } } }
  for (const p of ps) {
    { const _t = p.t || ''; if (NONAPPAREL_STRONG.test(_t) || (NONAPPAREL_WEAK.test(_t) && !GARMENT_NOUN.test(_t))) { junkN++; continue; } }   // homeware/cosmetics/headwear/innerwear/gifting -> delete
    if (ACC.test(p.t || '') && !GARMENT.test(p.t || '') && p.cat !== 'footwear') { del++; continue; }
    if (FOOT.test(p.t || '') && p.cat !== 'footwear') { if (/^mens_/.test(p.cat)) { footDel++; continue; } p.cat = 'footwear'; footMove++; out.push(p); continue; }
    // FABRIC-by-the-metre mis-filed as an infant size: a bare "<N>M" means N METRES of cloth
    // (6M = 6 metres), but the size reader treats "M" as months and dumps it in kids_infant.
    // Every size a bare metre length + no infant/baby word in the title ⇒ unstitched cloth →
    // men's unstitched (e.g. Dynasty Fabrics "Egyptian Delight … 6M"). Runs before kids rules.
    if (/^kids_/.test(p.cat) && meterSz(p) && !INFANT_WORD.test(p.t || '')) { p.cat = 'mens_unstitched'; menUnsN++; out.push(p); continue; }
    // Footwear cat with S/M/L clothing sizes (not shoe sizes) = garment misfiled as footwear.
    if (p.cat === 'footwear' && szLetter(p) && !FOOT.test(p.t||'')) { p.cat = womenCatFor(p); womenN++; out.push(p); continue; }
    // Sha Posh is a KIDS (girls') brand — image-verified (14 product photos): every "Kids …"/ck2p
    // item is a young girl, INCLUDING the larger numeric sizes. Its frock size chart runs 20→40, so
    // 36–40 are the OLDER-KIDS end, NOT adult. Route "Kids"-titled Sha Posh to girls'. (Supersedes an
    // earlier size>=36 heuristic that kept these in women's cats — the photos disprove it.)
    if (p.b === 'Sha Posh' && !/^kids_/.test(p.cat) && /\bkids?\b/i.test(p.t || '')) { p.cat = /\bformal\b|\bparty\b|\bwedding\b|\bfancy\b/i.test(p.t || '') ? 'kids_girls_formal' : 'kids_girls_eastern'; girlsKidN++; out.push(p); continue; }
    // EXPLICIT-TITLE gender corrector (highest-confidence, guarded). Footwear stays footwear (a
    // "Boys Peshawari" is still a shoe). Catches cross-gender mislabels any direction: Edge Republic
    // "Women's 3-Piece" in mens, Wear Ochre "Women's Dress" in kids, Kurta Corner "Kids Kurta Pajama"
    // in mens, Kross Kulture "2PC Girl" in women, etc.
    if (p.cat !== 'footwear') {
      const eg = explicitGender(p.t);
      if (eg && coarseGender(eg) !== catGenderOf(p.cat)) {
        const cg = coarseGender(eg);
        if (cg === 'w') p.cat = womenCatFor(p);
        else if (cg === 'm') p.cat = finalMenCat(p);
        else p.cat = eg === 'ki' ? 'kids_infant' : kidsCatFor(p.t, eg === 'kb' ? true : eg === 'kg' ? false : null);
        explicitN++; out.push(p); continue;
      }
    }
    if (/^kids_boys_/.test(p.cat) && GIRLS_KIDS_BRANDS.has(p.b)) { p.cat = p.cat.replace('kids_boys_', 'kids_girls_'); girlsKidN++; out.push(p); continue; }   // girls-only brand mis-tagged boys (image-confirmed); keep eastern/western/formal suffix
    // One Kids (beoneshopone) encodes kids' gender in the product SLUG: /products/g… = GIRL,
    // /products/b… = BOY. The harvester defaults its code-named kids to BOYS, so trust the slug:
    // vision-confirmed 28/30 g-slug items sitting in kids_boys are girls (incl. title-impossible
    // ones like "Raglan Tee"/"Birds Tee"/"Boiler Suit"); 2 b-slug items sat in kids_girls.
    // One Kids is a FAMILY brand: slug first letter = g(girl) b(boy) m(MEN) w(women). Trust it for
    // every gender. g/b swap within kids; m→men (vision-confirmed 12/12: polos/tees/bomber/cargo on
    // adult male models); w→women.
    if (p.b === 'One Kids' && p.cat !== 'footwear') {
      const _m = (p.u || '').match(/\/products\/([a-z])/i);
      const _g = _m ? _m[1].toLowerCase() : '';
      if (_g === 'm' && catGenderOf(p.cat) !== 'm') { p.cat = finalMenCat(p); slugN++; out.push(p); continue; }
      // One Kids' WOMEN's line is WESTERN (jeans/tees/tops/co-ords/jackets/shorts) — image-verified.
      // Route every w-slug item by GARMENT, including those already sitting in a women's EASTERN cat
      // (pret_3pc etc.): their descriptive titles ("Slitted Skinny Indigo", "Baggy Tee") gave the
      // harvester no garment signal, so it defaulted them to 3pc pret. (Eastern-keyword items, if any,
      // are left to womenCatFor.)
      if (_g === 'w' && !/kurta|kameez|\bshalwar\b|dupatta|\bkurti\b|\bfrock\b|lehenga|\babaya\b|anarkali|gharara/i.test(txt(p))) {
        const s = txt(p);
        const nc = /skinny|\bjeans?\b|denim|jegging|\btrouser|\bpant|legging|\bshorts?\b|culotte|jogger/i.test(s) ? 'womens_trouser'
                 : /co-?ord|\bset\b/i.test(s) ? 'coord_western'
                 : /\bdress\b|\bmaxi\b|\bgown\b|jumpsuit/i.test(s) ? 'maxi_dress'
                 : 'western_top';
        p.cat = nc; womenN++; out.push(p); continue;
      }
      if (_g === 'w' && catGenderOf(p.cat) !== 'w') { p.cat = womenCatFor(p); slugN++; out.push(p); continue; }
      if (/^kids_(boys|girls)_/.test(p.cat)) {
        const _suf = (p.cat.match(/_(eastern|western|formal)$/) || [, 'western'])[1];
        if (_g === 'g' && /^kids_boys_/.test(p.cat)) { p.cat = 'kids_girls_' + _suf; girlsKidN++; out.push(p); continue; }
        if (_g === 'b' && /^kids_girls_/.test(p.cat)) { p.cat = 'kids_boys_' + _suf; girlsKidN++; out.push(p); continue; }
      }
    }
    // Hopscotch encodes kids gender in the SKU code "h026-[g/b]" (g=girl, b=boy), vision-confirmed
    // (g-coded "Pink Striped Tights"/"Plum Pull-up Trousers"/floral "Bloomer" shirt sat in boys).
    // Trust the code: swap to the matching kids gender, keeping the eastern/western/formal suffix.
    if (p.b === 'Hopscotch' && /^kids_(boys|girls)_/.test(p.cat)) {
      const _hc = (p.u || '').toLowerCase().match(/h026-([gb])/);
      if (_hc) {
        const _suf = (p.cat.match(/_(eastern|western|formal)$/) || [, 'western'])[1];
        if (_hc[1] === 'g' && /^kids_boys_/.test(p.cat)) { p.cat = 'kids_girls_' + _suf; girlsKidN++; out.push(p); continue; }
        if (_hc[1] === 'b' && /^kids_girls_/.test(p.cat)) { p.cat = 'kids_boys_' + _suf; girlsKidN++; out.push(p); continue; }
      }
    }
    // Maria B: slug "mbm"=Maria B Man (→men, vision-confirmed 12/12), "mbk"=kids. Fix mbm in women cats.
    if (p.b === 'Maria B' && /\/products\/mbm/i.test(p.u) && catGenderOf(p.cat) !== 'm') { p.cat = finalMenCat(p); slugN++; out.push(p); continue; }
    // Nishat Linen: "Naqsh" is its MENSWEAR line (vision-confirmed) — 2pc kurta+shalwar on male models.
    if (p.b === 'Nishat Linen' && /\bnaqsh\b/i.test(p.t) && catGenderOf(p.cat) !== 'm') { p.cat = finalMenCat(p); slugN++; out.push(p); continue; }
    // Sadaf Fawad Khan: standalone "X Kurta" (not kurti, not part of a suit) = its MEN's kurta line
    // (vision-confirmed). The "Kurta [+Rs.…]" add-on variants are deleted by NONAPPAREL above.
    if (p.b === 'Sadaf Fawad Khan' && /\bkurta\b/i.test(p.t) && !/kurti|\bsuit\b|\b[23] ?pc\b|\b[23] ?piece\b|dupatta/i.test(p.t) && catGenderOf(p.cat) !== 'm') { p.cat = finalMenCat(p); slugN++; out.push(p); continue; }
    // Asim Jofa: AJMRW slug prefix = Asim Jofa Men's Ready-to-Wear (vision-confirmed: "AJMRW-27"
    // 2pc stitched kurta+shalwar on male model, lands in shirt_dupatta_2pc from women's harvest).
    if (p.b === 'Asim Jofa' && /\/products\/ajmrw/i.test(p.u) && catGenderOf(p.cat) !== 'm') { p.cat = finalMenCat(p); slugN++; out.push(p); continue; }
    // Asim Jofa: AJUBM slug prefix = Asim Jofa Unstitched Bundle for Men (men's fabric sets in winter cats).
    if (p.b === 'Asim Jofa' && /\/products\/ajubm/i.test(p.u) && p.cat !== 'mens_unstitched') { p.cat = 'mens_unstitched'; slugN++; out.push(p); continue; }
    // Senorita: K[A-Z]{2}-xxxxx SKU code in title = children's girls clothing (sizes 16-32 = ages 2-10y,
    // vision-confirmed on audit: KAC/KBC casual 2pc, KDD/KBD festive 3pc sat in adult women cats).
    if (p.b === 'Senorita' && /\bK[A-Z]{2}-\d+/.test(p.t||'') && !/^kids_/.test(p.cat)) {
      const _ts = (p.t||'').toLowerCase();
      p.cat = /formal|party|wedding|festive|3\s*(?:pc|piece)/i.test(_ts) ? 'kids_girls_formal' : 'kids_girls_eastern';
      girlsKidN++; out.push(p); continue;
    }
    // SHAAL: luxury Kashmiri shawl brand. Gender-aware: men's shawls → mens_unstitched (we have no
    // mens_shawl cat); women's/unisex shawls → shawl. Unicode-aware apostrophe (U+2019 = ’).
    if (p.b === 'SHAAL') {
      const _smens = /\bmen[’''`]?s\b|\bgents\b|\bfor men\b/i.test(p.t||'');
      if (_smens && p.cat !== 'mens_unstitched') { p.cat = 'mens_unstitched'; slugN++; out.push(p); continue; }
      if (!_smens && p.cat !== 'shawl') { p.cat = 'shawl'; slugN++; out.push(p); continue; }
    }
    // Sha Posh: sells kids-styled garments in a continuous size run 20–40. Sizes ≥36 = adult women.
    // Keep small sizes in kids cat; reclassify adult-sized items to the appropriate women's cat.
    if (p.b === 'Sha Posh' && /^kids_/.test(p.cat) && (p.sz || []).some(s => { const n = parseInt(s); return !isNaN(n) && n >= 36; })) { p.cat = womenCatFor(p); womenN++; out.push(p); continue; }
    // Dynasty Fabrics: men's suiting brand with no kids line — kids-misclassified items → mens_unstitched.
    if (p.b === 'Dynasty Fabrics' && /^kids_/.test(p.cat)) { p.cat = 'mens_unstitched'; slugN++; out.push(p); continue; }
    // Diners Autograph: formal menswear shirt collection wrongly landing in women's formal/emb cats.
    if (p.b === 'Diners' && /\bautograph\b/i.test(p.t||'') && catGenderOf(p.cat) !== 'm') { p.cat = 'mens_shirt'; slugN++; out.push(p); continue; }
    // Royal Tag LP/GT/FT/DOT SKU codes = lapel pins / formal ties / grooming sets (accessories, not garments).
    if (p.b === 'Royal Tag' && /\b(LP|GT|FT|DOT)-\d/i.test(p.t||'') && !/\bshirt\b|\bkurta\b|\bsuit\b/i.test(p.t||'')) { junkN++; continue; }
    // Charcoal menswear scarves/ties in unstitched cat → delete (fashion accessories, not fabric).
    if (p.b === 'Charcoal' && /\bscarf\b|\btie\b/i.test(p.t||'') && !/\bshirt\b|\bkurta\b|\bshalwar\b|\bsuit\b/i.test(p.t||'')) { junkN++; continue; }
    // Bonanza Satrangi: slug first letter = gender (m=men, w=women, k=kids). Fix any item whose slug
    // gender contradicts its cat — vision-confirmed: 6 women's 3pc/lawn ("WP…/WU…") sat in men cats.
    if (p.b === 'Bonanza Satrangi' && p.cat !== 'footwear') {
      const _c = (p.u.toLowerCase().match(/\/products\/([a-z])/) || [, ''])[1];
      const _sg = _c === 'm' ? 'm' : _c === 'w' ? 'w' : _c === 'k' ? 'k' : '';
      if (_sg && coarseGender(_sg) !== catGenderOf(p.cat)) {
        p.cat = _sg === 'm' ? finalMenCat(p) : _sg === 'w' ? womenCatFor(p) : kidsCatFor(p.t, null);
        slugN++; out.push(p); continue;
      }
    }
    // Senorita is a GIRLS eastern/festive brand (image-verified: every sampled item is a girl in a
    // frock/gharara/shalwar-kameez 3pc). The harvester scatters it into kids_boys_formal AND
    // kids_girls_formal, but its "Casual … 3 Piece Suit" line is everyday EASTERN, not formal.
    // Route the whole brand: casual/summer → girls eastern; formal/party → girls formal; else eastern.
    if (p.b === 'Senorita' && /^kids_/.test(p.cat)) {
      p.cat = /\bcasual\b|\bsummer\b/i.test(p.t || '') ? 'kids_girls_eastern'
            : /\bformal\b|\bparty\b|\bwedding\b|\bfancy\b/i.test(p.t || '') ? 'kids_girls_formal'
            : 'kids_girls_eastern';
      girlsKidN++; out.push(p); continue;
    }
    if (/^kids_boys_/.test(p.cat)) {
      const _tb = (p.t||'').toLowerCase();
      const _sz0 = Array.isArray(p.sz) && p.sz.length ? (p.sz[0]||'').trim() : '';
      // (z) Zellbury SKU: first slug-code letter 'g' = girls (harvester defaults code-named kids to boys).
      // 'gps1777'-style SKUs confirmed as girls' eastern wear sitting in kids_boys_eastern.
      if (p.b === 'Zellbury') { const _zSeg=((p.u||'').toLowerCase().match(/\/products\/(.+?)(?:\?|$)/)||[,''])[1]; let _zLead=''; for(const _zt of _zSeg.split('-')){const _za=_zt.match(/^([a-z]{1,6})\d{3,}/);if(_za){_zLead=_za[1][0];break;}} if(_zLead==='g'){const _suf=(p.cat.match(/_(eastern|western|formal)$/)||[,'eastern'])[1];p.cat='kids_girls_'+_suf;girlsKidN++;out.push(p);continue;} }
      // (a) ADULT-sized item parked in kids_boys → women (vision: crop hoodies/skinny jeans on adult
      // models). Guard: skip if title explicitly says boys/girls/kids — a "Boys Kurta Pajama" size 32
      // is a KID measurement, not an adult waist.
      if ((szLetter(p) || /^(2[4-9]|3[0-9]|4[0-2])$/.test(_sz0)) && !/\bboys?\b|\bgirls?\b|\bkids?\b/.test(_tb)) {
        p.cat = /trouser|pant|jeans|legging|tight|shorts|capri|bottom|\bskinny\b/i.test(_tb) ? 'womens_trouser' : 'western_top';
        womenN++; out.push(p); continue;
      }
      // (b) GIRL-garment titled (kid-sized) → kids_girls. STRONG words move even if title says "boys";
      // SOFT cues move only when title has no explicit boy. GUARD keeps boy dress-shirt/fancy-dress.
      if (!KGIRL_GUARD.test(_tb) && (KGIRL_STRONG.test(_tb) || (KGIRL_SOFT.test(_tb) && !/\bboys?\b/.test(_tb)))) {
        p.cat = KGIRL_EAST.test(_tb) ? 'kids_girls_eastern' : 'kids_girls_western';
        girlsKidN++; out.push(p); continue;
      }
      // (c) prince coat (eastern sherwani coat) in western → eastern; tuxedo (western suit) in eastern → formal
      if (p.cat === 'kids_boys_western' && /\bprince[\s-]?coat\b/.test(_tb)) { p.cat = 'kids_boys_eastern'; girlsKidN++; out.push(p); continue; }
      if (p.cat === 'kids_boys_western' && /\bthobe\b|\bjhuba\b/.test(_tb)) { p.cat = 'kids_boys_eastern'; girlsKidN++; out.push(p); continue; }
      // (e) "Pajama Suit" in Pakistani context = shalwar kameez (not sleepwear) → eastern
      if (p.cat === 'kids_boys_western' && /\bpajama[\s-]?suit\b/i.test(_tb)) { p.cat = 'kids_boys_eastern'; girlsKidN++; out.push(p); continue; }
      if (p.cat === 'kids_boys_eastern' && /\btuxedo\b/.test(_tb)) { p.cat = 'kids_boys_formal'; girlsKidN++; out.push(p); continue; }
      // (d) western garments in kids_boys_eastern → kids_boys_western.
      // Polo/henley/t-shirt = western tops (Engine, Preeto); standalone pajama without kurta = sleepwear
      // not shalwar, so it's western too (Minnie Minors). "except shalwar" = guard below.
      if (p.cat === 'kids_boys_eastern') {
        if (/\bhenley\b|polo|t-?shirt|\btee\b|\bhoodie\b|\bsweat[\s-]?shirt\b|\btrack\b|button[\s-]?down|\bjeans\b|\bdenim\b|\bshorts?\b|\bjogger|\bcargo\b|camp[\s-]?collar/.test(_tb) && !/(kurta|kameez|shalwar|waist[\s-]?coat|sherwani)/.test(_tb)) { p.cat='kids_boys_western'; girlsKidN++; out.push(p); continue; }
        if (/\bpajama\b|\bpyjama\b|\bsleepwear\b|\bnightsuit\b|\bnight[\s-]?suit\b/.test(_tb) && !/(kurta|kameez|\bpajama[\s-]?suit\b)/.test(_tb)) { p.cat='kids_boys_western'; girlsKidN++; out.push(p); continue; }
      }
    }
    // Girls' WESTERN garments mislabeled kids_girls_eastern (Engine tops, Eminent camisoles, playsuits)
    // → kids_girls_western. Specific western nouns only (bare "top" is ambiguous with an eastern kurti).
    if (p.cat === 'kids_girls_eastern') {
      const _tg = (p.t||'').toLowerCase();
      if (/\btank[\s-]?top\b|\bcamisole\b|\bcami\b|t-?shirt|\btee\b|\bjeans\b|\bdenim\b|\blegging|\bplaysuit\b|\bjumpsuit\b|\bskirt\b|\bhoodie\b|\bsweat[\s-]?shirt\b|\bshorts?\b/.test(_tg)
          && !/kurta|kameez|shalwar|frock|dupatta|lehenga|abaya|gharara|peshwas|angrakha|\bkurti\b|makhna|hijab|niqab|jilbab/.test(_tg)) { p.cat='kids_girls_western'; girlsKidN++; out.push(p); continue; }
    }
    // Men's WESTERN tees/polos mislabeled as shalwar-kameez/kurta (One Kids "mtt/mtp" knit basics) →
    // men's shirt; a pajama/trouser-only listing mislabeled as kurta → men's trouser.
    if (p.cat === 'mens_shalwar_kameez' || p.cat === 'mens_kurta') {
      const _tm = (p.t||'').toLowerCase();
      if (/t-?shirt|\btee\b|\bpolo\b|crew[\s-]?neck|v-?neck/.test(_tm) && !/kurta|kameez|shalwar|sherwani|waist[\s-]?coat/.test(_tm)) { p.cat='mens_shirt'; menPcN++; out.push(p); continue; }
      if (p.cat === 'mens_kurta' && /\bpajama\b|\bpyjama\b|\bpayjama\b|\btrouser/.test(_tm) && !/kurta|kameez|shirt|\bsuit\b|sherwani/.test(_tm)) { p.cat='mens_trouser'; menPcN++; out.push(p); continue; }
    }
    // ── VISUAL-AUDIT wave 3 (image-verified brand-wide corrections) ──
    // Cougar is MULTI-DEPT (image-verified): its men's polos/shirts/tees (slugs ps/ss/se/ts) are
    // correctly in men's cats, but its WOMEN'S line (slugs ft/wt/ww/tlf/ltt/lcs = female-top/women-tee/
    // wrap/blazer) leaked into men's cats → women's western, routed by garment. Slug-gated so the
    // genuine men's items are NOT touched.
    if (p.b === 'Cougar' && /^mens_/.test(p.cat) && /\/products\/(ft|wt|ww|tlf|ltt|lcs)\d/i.test(p.u||'')) {
      const s = (p.t||'').toLowerCase();
      p.cat = /\b(trouser|pant|jean|legging|tight|jogger|shorts?|capri|bottom|skinny|flare|cargo|culotte|palazzo)\b/.test(s) ? 'womens_trouser'
            : /\b(dress|maxi|gown)\b/.test(s) ? 'maxi_dress'
            : /co-?ord/.test(s) ? 'coord_western' : 'western_top';
      womenN++; out.push(p); continue;
    }
    // Al-Deebaj "Printed Cotton Co-Ord Set" = women's EASTERN kameez+shalwar 2pc (hijab-styled), not a
    // western co-ord → eastern 2pc.
    if (p.b === 'Al-Deebaj' && p.cat === 'coord_western') { p.cat = 'shirt_trouser_2pc'; womenN++; out.push(p); continue; }
    // men's shawls dumped into mens_unstitched (which is for FABRIC) → the shawl category.
    if (p.cat === 'mens_unstitched' && /\bshawl\b/i.test(p.t||'')) { p.cat = 'shawl'; womenN++; out.push(p); continue; }
    // a "shirt"-titled top mis-filed as jeans → men's shirt (Diners/Eminent "… Shirt" in mens_jeans).
    if (p.cat === 'mens_jeans' && /\bshirt\b/i.test(p.t||'') && !/\bjeans?\b|\bdenim\b/i.test(p.t||'')) { p.cat = 'mens_shirt'; menPcN++; out.push(p); continue; }
    // inners/camisoles/slips/"shameez" mis-filed as a 3-piece suit → western top (inner).
    if (p.cat === 'pret_3pc' && /\binner\b|\biner\b|shameez|camisole|\bslip\b/i.test(p.t||'') && !/(suit|3 ?pc|3 ?piece|kameez|dupatta|shirt)/i.test(p.t||'')) { p.cat = 'western_top'; womenN++; out.push(p); continue; }
    // Chinyere "1 Pc … Sharara" = a standalone sharara trouser, not a festive lehenga set → bottoms.
    if (p.cat === 'lehenga' && /\b1 ?pc\b|\b1 ?piece\b|\bsingle\b/i.test(p.t||'') && /sharara|gharara/i.test(p.t||'') && !/kameez|shirt|\bset\b|dupatta|[23] ?pc|[23] ?piece/i.test(p.t||'')) { p.cat = 'womens_trouser'; womenN++; out.push(p); continue; }
    // an explicitly WESTERN top mis-filed as an eastern kurti → western top (Beechtree "… (WESTERN)").
    if (p.cat === 'kurti_1pc' && /\bwestern\b/i.test(p.t||'') && /\btop\b|\btee\b|t-?shirt|jersey/i.test(p.t||'')) { p.cat = 'western_top'; womenN++; out.push(p); continue; }
    // ── VISUAL-AUDIT wave 4 (image-verified) ──
    // ChenOne "LDS-####" ladies WESTERN tops/shirts dumped into winter/pret stitched suits → western top.
    if (p.b === 'ChenOne' && /lds/i.test(p.u||'') && /\btop\b|\bshirt\b|western|blouse/i.test(p.t||'') && !/\bsuit\b|[23] ?pc|kameez|dupatta|kurta/i.test(p.t||'') && !/^(western_top|kurti_1pc)$/.test(p.cat)) { p.cat='western_top'; womenN++; out.push(p); continue; }
    // Salitex "1Pc … Bottom" embroidered trousers mis-filed as 3-piece suits → women's bottoms.
    if (/^(pret_3pc|pret_3pc_emb|pret_2pc_emb|formal_emb_3pc|formal_emb_2pc|lawn_3pc_unstitch)$/.test(p.cat) && /\b1 ?pc\b|\b1 ?piece\b|\bsingle\b/i.test(p.t||'') && /\bbottom\b|\btrouser\b/i.test(p.t||'') && !/shirt|kameez|kurta|dupatta/i.test(p.t||'')) { p.cat='womens_trouser'; womenN++; out.push(p); continue; }
    // a standalone RTW SHALWAR / trouser / pajama (no shirt/kameez/kurta/dupatta) is a BOTTOM, not a
    // 3-piece suit (Alkaram "RTW | SHALWAR"). Men SKU/word → men's trouser; kids-numeric sizes (≤16)
    // → girls' eastern; else women's bottoms.
    if (/^(pret_3pc|pret_3pc_emb|lawn_3pc_unstitch)$/.test(p.cat) && /\bshalwar\b|\btrouser\b|\bpajama\b|\bpyjama\b|\bculottes?\b/i.test(p.t||'') && !/kameez|kurta|\bshirt\b|dupatta|\bsuit\b|kurti|\b[23] ?pc\b|\b[23] ?piece\b|co-?ord/i.test(p.t||'')) {
      if (/gmss|\bmens?\b|gents|\bmen'?s\b/i.test(txt(p))) p.cat = 'mens_trouser';
      else if (Array.isArray(p.sz) && p.sz.length && p.sz.every(z => /^\d{1,2}$/.test(String(z).trim()) && +z <= 16)) p.cat = 'kids_girls_eastern';
      else p.cat = 'womens_trouser';
      womenN++; out.push(p); continue;
    }
    // a standalone SHAWL mis-filed in a suit/fabric cat → the shawl category.
    if (p.cat !== 'shawl' && /\bshawl\b/i.test(p.t||'') && !/shawl[\s-]?collar|\bsuit\b|[23] ?pc|kameez|kurta|\bshirt\b|blazer|\bcoat\b|cardigan/i.test(p.t||'')) { p.cat='shawl'; womenN++; out.push(p); continue; }
    // a standalone DUPATTA mis-filed as a suit → dupatta_only.
    if (p.cat !== 'dupatta_only' && /\bdupatta\b/i.test(p.t||'') && !/shirt|kameez|kurta|\bsuit\b|trouser|\b[23] ?pc\b|\b[23] ?piece\b/i.test(p.t||'')) { p.cat='dupatta_only'; womenN++; out.push(p); continue; }
    // stitched tights/leggings mislabeled unstitched → women's bottoms (Limelight "Jersey Tights").
    if (/unstitch/.test(p.cat) && /\btights?\b|\bleggings?\b/i.test(p.t||'')) { p.cat='womens_trouser'; womenN++; out.push(p); continue; }
    // Gul Ahmed "MN-FS" men's formal shirts dumped into women's formal → men's shirt.
    if (/^(formal_emb_3pc|formal_emb_2pc|pret_3pc|pret_3pc_emb)$/.test(p.cat) && /mn-?fs/i.test(p.u||'')) { p.cat='mens_shirt'; menPcN++; out.push(p); continue; }
    // Al-Deebaj men's waistcoats dumped into women's formal → men's waistcoat.
    if (p.b === 'Al-Deebaj' && /waist[\s-]?coat/i.test(p.t||'') && catGenderOf(p.cat) !== 'm') { p.cat='mens_waistcoat'; menPcN++; out.push(p); continue; }
    // modest head/face wear (niqab/hijab/chadar/makhna) leaking into SUIT/fabric cats → abaya (the
    // documented modest-wear umbrella). Hijab pins are pure accessories → drop.
    if (/glider[\s-]?pin|hijab[\s-]?pin/i.test(p.t||'')) { del++; continue; }
    if (p.cat !== 'abaya' && /\bniqab\b|\bnaqab\b|face[\s-]?cover|face[\s-]?veil|\bmakhna\b|\bchadar\b|\bhijab\b/i.test(p.t||'') && !/\bsuit\b|kameez|kurta|\bshirt\b|\b[23] ?pc\b|trouser/i.test(p.t||'')) { p.cat='abaya'; womenN++; out.push(p); continue; }
    // BRAND SLUG-GENDER: a women-cat item whose brand slug says men/boys/girls → route by garment
    // (Zellbury men's shalwar-kameez/shirts, Diners boys' kurta-pajama & men's shirts, etc.). Fixes
    // the whole brand at once, not per image. Runs before womenType (title-only) — slug wins.
    if (!/^mens_|^kids_/.test(p.cat)) {
      const sg = slugGender(p);
      const womanTitle = /\bladies\b|\bwomen[’'`]?s?\b|\bwoman\b|\bgirls?\b/i.test(p.t || '');   // explicit women/girl title overrides a men slug-code collision (e.g. colour-prefix)
      if (sg === 'm' && !womanTitle) { p.cat = finalMenCat(p);        slugN++; out.push(p); continue; }
      if (sg === 'kb') { p.cat = kidsCatFor(p.t, true);  slugN++; out.push(p); continue; }
      if (sg === 'kg') { p.cat = kidsCatFor(p.t, false); slugN++; out.push(p); continue; }
      // women-first brand's MEN line dumped into women 2pc cats (Azure/Al-Deebaj, vision-confirmed)
      if (MENS_2PC_BRANDS.has(p.b) && !womanTitle && MENS_2PC_TITLE.test(p.t || '') && !MENS_2PC_GUARD.test(p.t || '')) {
        p.cat = finalMenCat(p); slugN++; out.push(p); continue;
      }
    }
    // AUDIT FIX (category audit, 2026-06-22): western JEANS dumped into women's 3pc/suit cats —
    // "jeans" in a title is a western bottom, never a 3-piece pret. Move to women's bottoms.
    // (Runs after the slug/brand rules so a kids brand's jeans is placed in kids first.)
    if (/\bjeans?\b/i.test(p.t || '') && !/\b(boys?|girls?|kids?|infant|junior|toddler|baby)\b/i.test(p.t || '') && /^(pret_3pc|pret_3pc_emb|kurti_1pc|shirt_dupatta_2pc|shirt_dupatta_2pc_unstitch|lawn_3pc_unstitch|womens_trouser)$/.test(p.cat)) {
      // Western jeans dumped into women's pret. Split by gender: a men's SKU/word (Gul Ahmed
      // "MNJNS…"/"mn-jns", "Salt-Men-Jeans") → mens_jeans; everything else → women's bottoms.
      // (Image-verified: Gul Ahmed mn-jns = male model; Outfitters/Sapphire/One-Kids "WBJ" = women.)
      const s = txt(p);
      const men = /mn-?jns|salt-men|\bmens?\b|\bgents\b/.test(s) && !/wm-?jns|wm-ndj|salt-women|\bwomen|\bladies\b|\bgirls?\b/.test(s);
      p.cat = men ? 'mens_jeans' : 'womens_trouser'; if (men) slugN++; else womenN++; out.push(p); continue;
    }
    // AUDIT FIX: a JUBBAH / THOBE is a men's robe — move it out of women's pret to men's.
    // Guard: keep kids thobes in kids cats (children's Islamic robes are valid kidswear).
    if (/\bjubb?ah?\b|\bthobe\b/i.test(p.t || '') && catGenderOf(p.cat) !== 'm' && !/^kids_/.test(p.cat)) { p.cat = 'mens_kurta'; slugN++; out.push(p); continue; }
    if (!/^mens_|^kids_/.test(p.cat)) { const wc = womenType(p); if (wc && wc !== p.cat) { p.cat = wc; womenN++; out.push(p); continue; } }   // women: kids/niqab/bottom/tee corrections
    if (isUnstitched(p) && STITCHED.has(p.cat)) { p.cat = fwdCat(p); fwdN++; out.push(p); continue; }
    if (szLetter(p) && REV[p.cat] && !unsTitle(p)) { p.cat = REV[p.cat]; revN++; out.push(p); continue; }
    // ── MEN: Tier-1 stitched/unstitched, then Tier-2/3 garment-type + piece-count ──
    // Women's garments wrongly in mens cats (Amir Adnan lehenga/choli, image-confirmed)
    if (/^mens_/.test(p.cat) && /\blehenga\b|\bcholi\b/i.test(p.t||'')) { p.cat = 'lehenga'; womenN++; out.push(p); continue; }
    // mens_unstitched REVERSE: stitched sizes (S/M/L or trouser waist/suit chest 28-60) → correct stitched cat
    if (p.cat === 'mens_unstitched' && !isUnstitched(p)) {
      const _sz0m = Array.isArray(p.sz) && p.sz.length ? (p.sz[0]||'').trim() : '';
      if (szLetter(p) || /^(2[8-9]|3[0-9]|4[0-9]|5[0-9])$/.test(_sz0m)) {
        const _ts = (p.t||'').toLowerCase();
        let nc = 'mens_shalwar_kameez';
        if (/\bsherwani\b/.test(_ts)) nc = 'mens_sherwani';
        else if (/\bwaistcoat\b|\btalpuri\b/.test(_ts)) nc = 'mens_waistcoat';
        else if (/\btuxedo\b|\bblazer\b|pant[\s-]?coat|coat[\s-]?pant|bespoke suit/.test(_ts) && !/kameez|shalwar|kurta|sherwani/.test(_ts)) nc = 'mens_suit';
        else if (/\bjeans?\b|\bdenim\b/.test(_ts) && !/kameez|shalwar|kurta|shirt/.test(_ts)) nc = 'mens_jeans';
        else if (/\btrouser\b|\bchino\b|\bcargo\b|\bpants?\b|\bshalwar\b/.test(_ts) && !/kameez|kurta|\bsuit\b|waistcoat|\bjeans?\b|\bdenim\b/.test(_ts)) nc = 'mens_trouser';
        else if (/\bshirt\b|\bhenley\b|\bpolo\b|t-?shirt|\bhoodie\b|\bsweat[\s-]?shirt\b/.test(_ts) && !/kameez|shalwar|kurta/.test(_ts)) nc = 'mens_shirt';
        else if (/(kameez|kurta)[\s\S]{0,30}(shalwar|trouser|pajama|pyjama)|(shalwar|pajama|trouser)[\s\S]{0,30}(kameez|kurta)|kameez[\s-]?shalwar|shalwar[\s-]?kameez|kurta[\s-]?pajama|kurta[\s-]?trouser/.test(_ts)) nc = 'mens_shalwar_kameez';
        else if (/\bkurta\b|\bkameez\b/.test(_ts)) nc = 'mens_kurta';
        p.cat = nc; menUnsN++; out.push(p); continue;
      }
    }
    if (MEN_STITCHED.has(p.cat) && menUns(p)) { p.cat = 'mens_unstitched'; menUnsN++; out.push(p); continue; }
    if (/^mens_/.test(p.cat) && p.cat !== 'mens_unstitched') {
      const nc = menType(p);
      if (nc && nc !== p.cat) { p.cat = nc; menPcN++; }
      out.push(p); continue;
    }
    if (ONE.has(p.cat)) { const nc = pieceCat(p); if (nc && nc !== p.cat) { p.cat = nc; pieceN++; } }
    out.push(p);
  }
  return { products: out, stats: { junkN, del, footDel, footMove, fwdN, revN, pieceN, menUnsN, menPcN, womenN, girlsKidN, slugN, explicitN, before: ps.length, after: out.length } };
}

module.exports = { cleanupProducts };

// ── CLI: node catalog-cleanup.js [apply] ──
if (require.main === module) {
  const APPLY = process.argv[2] === 'apply';
  const FILE = process.env.PSB_CATALOG || 'catalog.json';
  const cat = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const r = cleanupProducts(cat.products || []);
  const s = r.stats;
  console.log(`delete-nonapparel=${s.junkN} delete-accessories=${s.del} delete-men-footwear=${s.footDel} move-footwear=${s.footMove} fwd-unstitch=${s.fwdN} rev-stitch=${s.revN} piece-count=${s.pieceN} men-unstitch=${s.menUnsN} men-piece=${s.menPcN} women-type=${s.womenN} girls-kid=${s.girlsKidN} slug-gender=${s.slugN} explicit-gender=${s.explicitN}`);
  console.log(`total ${s.before} -> ${s.after}`);
  if (APPLY) { cat.products = r.products; fs.writeFileSync(FILE, JSON.stringify(cat)); console.log('*** WROTE ' + FILE + ' ***'); }
  else console.log('(dry-run — pass "apply" to write)');
}
