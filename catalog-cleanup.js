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
const GIRLS_KIDS_BRANDS = new Set(['Alizeh']);
// GIRL-garment markers for kids items the harvester defaulted to BOYS (no gender word in title).
// Image-confirmed on One Kids / Hopscotch / Wear Ochre / Beechtree / ETHNC western kids lines.
// STRONG = girl-only garments a boys' item would never carry → move even if the title says "boys"
// (titles are often mis-tagged). SOFT = feminine prints/silhouettes that rarely-but-can appear on
// boys → move ONLY when the title does NOT say boy/boys (so "Boys floral polo" stays a boy).
// \b guards stop false hits (rainbow≠bow, elbow≠bow). GUARD excludes a boy's dress-shirt/fancy-dress.
const KGIRL_STRONG = /\bfrock\b|\bgown\b|\bpeplum\b|pinafore|\btutu\b|princess|\bbarbie\b|unicorn|fairy|jasmine|\bblouse\b|lehenga|sharara|gharara|\btulle\b|lace (dress|frock|top|gown)/;
const KGIRL_SOFT = /\bdress\b|\bskirt\b|\bfloral\b|\bflower\b|smock|gathered|\bpoof\b|sequin|ruffl|butterfly|cold[\s-]?shoulder|crop[\s-]?(tee|top|polo)|jegging|bow (top|dress|frock|blouse)/;
const KGIRL_GUARD = /dress shirt|dress pant|fancy dress/;
const KGIRL_EAST = /\bfrock\b|kaftan|kameez|shalwar|\bkurta\b|\bkurti\b|anarkali|lehenga|gharara|sharara|peshwas|abaya/;   // eastern girls' garment → kids_girls_eastern (else western)
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
  if (/\bjeans?\b|\bdenim\b/.test(s) && !/(kurta|kameez|shalwar|shirt)/.test(s)) return 'mens_jeans';   // a "Denim Casual Shirt" is a shirt, not jeans
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
  if (/\bmen[’'`]?s\b|\bmens\b|\bfor men\b|\bgents\b|dress shirt|tuxedo shirt/.test(s)) {
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
  if (/\bniqab\b|\bjilbab\b|\bburqa\b|\bburka\b|\babaya\b/.test(s) && p.cat !== 'abaya') return 'abaya';
  if (/\b(trouser|straight pants?|culottes?|tights|palazzo|cigarette pants?|farshi shalwar|pants?)\b/.test(s)
      && !/(shirt|kameez|kurti|kurta|dupatta|\bsuit\b|3 ?pc|2 ?pc|3 ?piece|2 ?piece|\btop\b|co-?ord|frock|\bmaxi\b|gown|saree|lehenga|abaya|kaftan|peplum)/.test(s)) return isUnstitched(p) ? 'kurti_1pc_unstitch' : 'womens_trouser';
  if (/\bt-?shirt\b|tank top/.test(s) && !/(\bsuit\b|3 ?pc|2 ?pc|dupatta|trouser|kameez)/.test(s)) return 'western_top';
  return null;
}
const GARMENT = /shirt|kameez|kurti|kurta|\bdress\b|gown|frock|trouser|\bpant|\btop\b|abaya|hijab|shalwar|\bsuit\b|\blawn\b|saree|lehenga|dupatta|kaftan|maxi|peplum|blouse|tunic|\bcape\b|co-?ord|jumpsuit|romper|\btee\b|t-?shirt|polo|jeans|waistcoat|sweater|cardigan|hoodie|jacket|\bcoat\b|sweatshirt|nightwear|loungewear|pajama|angrakha|gharara|sharara|outfit|ensemble|\d ?piece|\d ?pc\b|unstitch|fabric/i;
const ACC = /\bsunglass|\beyewear\b|\bgoggles?\b|jewell?ery|\bearrings?\b|\bnecklace|\bbangles?\b|\bbracelet|\bpendant|\bbrooch|\bperfume\b|\bfragrance\b|\battar\b|\bwrist ?watch|\bwatch\b|\bbeanie\b|\bscrunchie|\bhair ?band|\bhair ?clip|\bkeychain|\bkey ?chain|\bsocks?\b|\bwallet\b|\bcard ?holder|\bcufflink|\btote\b|\bbackpack|\bsling ?bag|\bhand ?bag|\bclutch\b|\bpouch\b|\bbelt\b|\bcap\b/i;
const FOOT = /\bshoes?\b|\bheels?\b|\bsandal|\bslipper|\bsneaker|\bpump\b|\bwedge|\bmule\b|khussa|\bloafer|\bjutt?i\b|kolhapuri/i;
// Clearly NON-APPAREL (homeware / cosmetics / fragrance / headwear / innerwear / gifting /
// neckwear) — delete outright. These are unambiguous (a gift box / lampshade / beard oil never
// names a garment), so no garment-exclusion is needed. Surfaced by the brand-by-brand audit.
// NON-APPAREL -> delete (from the brand audit). STRONG terms never appear in a garment title
// (gift box/lampshade/ceramic jar/pocket square/koofi) -> delete unconditionally. WEAK terms also
// double as colour/scent names ("Incense","Oud","Musk") or set components ("Sando shirt","Turban
// ...Kurta") -> delete ONLY when the title has no garment NOUN (nouns, not piece-counts, so a
// "Seamless Boxers 2pc" still goes).
const NONAPPAREL_STRONG = /gift ?(box|card|set|hamper|voucher|pack)\b|\bhamper\b|beard ?oil|\bcologne\b|body ?spray|lip ?(&|and|n) ?cheek|lip ?tint|cheek ?tint|argan ?oil|\bconditioner\b|\bshampoo\b|hair ?(serum|oil|catcher|grip|band|clip|tie)|\bdiffuser\b|room ?spray|scented ?candle|\bcandle\b|\bbukhoor\b|\blampshade\b|\bcomforter\b|\bduvet\b|bed ?sheet|bedsheet|\bcushion\b|coffee ?table|table ?set|brass ?table|\bfurniture\b|ceramic ?(jar|mug|vase|plate|bowl|pot|ware)|\bcrockery\b|\btumbler\b|water ?bottle|\bzamzam\b|\bcooler\b|\bperfume\b|\bfragrance\b|gift ?wrap|ear ?cuff|tasbeeh|tasbih|misbaha|placemat|place ?mat|table ?runner|table ?cloth|tablecloth|\bcoaster|\bnapkin|prayer ?mat|jaye ?namaz|janamaz|\bmiswak\b|hijab ?(crown ?)?grip|\bself[\s-]?tie\b|\(TIE-\d+\)|designer[\s-]?tie\b/i;
const NONAPPAREL_WEAK = /\bmusk\b|\boud\b|\bincense\b|\bturban\b|\bimamah\b|\bkoofi\b|\bkufi\b|\btopi\b|prayer ?cap|pocket ?square|bow ?tie|bowtie|\bnecktie\b|\bboxers?\b|\bbriefs?\b|boy ?shorts|\bsando\b|\bundershirt\b|cotton ?vest|vest ?pack|pack of \d+ ?(vest|boxer|brief)|undergarment|seamless ?boxer|\bmuffler\b|\bcharm\b|\bhipster\b|\btrunks?\b|men'?s vest|vest with sleeves|jersey vest|seamless ?(jersey )?vest|sleeveless vest|\bcaps?\b/i;
const GARMENT_NOUN = /\b(kurti|kurta|kameez|shirt|t-?shirt|tee|polo|dress|gown|frock|trouser|pants?|abaya|hijab|shalwar|saree|lehenga|dupatta|kaftan|maxi|peplum|blouse|top|tank|tunic|sherwani|waistcoat|jacket|sweater|cardigan|hoodie|outfit|romper|jumpsuit|suit|blazer|coat|tuxedo)\b/i;

// Apply the full multi-tier cleanup to a products array → { products, stats }. Pure &
// idempotent. MUTATES each kept product's .cat in place and drops accessories / men footwear.
// Call from the harvester (right before it writes catalog.json) or from the CLI below.
function cleanupProducts(ps) {
  let del = 0, footDel = 0, footMove = 0, fwdN = 0, revN = 0, pieceN = 0, menUnsN = 0, menPcN = 0, junkN = 0, womenN = 0, girlsKidN = 0;
  const out = [];
  for (const p of ps) {
    { const _t = p.t || ''; if (NONAPPAREL_STRONG.test(_t) || (NONAPPAREL_WEAK.test(_t) && !GARMENT_NOUN.test(_t))) { junkN++; continue; } }   // homeware/cosmetics/headwear/innerwear/gifting -> delete
    if (ACC.test(p.t || '') && !GARMENT.test(p.t || '') && p.cat !== 'footwear') { del++; continue; }
    if (FOOT.test(p.t || '') && p.cat !== 'footwear') { if (/^mens_/.test(p.cat)) { footDel++; continue; } p.cat = 'footwear'; footMove++; out.push(p); continue; }
    if (/^kids_boys_/.test(p.cat) && GIRLS_KIDS_BRANDS.has(p.b)) { p.cat = 'kids_girls_eastern'; girlsKidN++; out.push(p); continue; }   // girls-only brand mis-tagged boys (image-confirmed)
    // One Kids (beoneshopone) encodes kids' gender in the product SLUG: /products/g… = GIRL,
    // /products/b… = BOY. The harvester defaults its code-named kids to BOYS, so trust the slug:
    // vision-confirmed 28/30 g-slug items sitting in kids_boys are girls (incl. title-impossible
    // ones like "Raglan Tee"/"Birds Tee"/"Boiler Suit"); 2 b-slug items sat in kids_girls.
    if (p.b === 'One Kids' && /^kids_(boys|girls)_/.test(p.cat)) {
      const _m = (p.u || '').match(/\/products\/([a-z])/i);
      const _g = _m ? _m[1].toLowerCase() : '';
      const _suf = (p.cat.match(/_(eastern|western|formal)$/) || [, 'western'])[1];
      if (_g === 'g' && /^kids_boys_/.test(p.cat)) { p.cat = 'kids_girls_' + _suf; girlsKidN++; out.push(p); continue; }
      if (_g === 'b' && /^kids_girls_/.test(p.cat)) { p.cat = 'kids_boys_' + _suf; girlsKidN++; out.push(p); continue; }
    }
    if (/^kids_boys_/.test(p.cat)) {
      const _tb = (p.t||'').toLowerCase();
      const _sz0 = Array.isArray(p.sz) && p.sz.length ? (p.sz[0]||'').trim() : '';
      // (a) ADULT-sized item parked in kids_boys → women (vision: crop hoodies/skinny jeans on adult models)
      if (szLetter(p) || /^(2[4-9]|3[0-9]|4[0-2])$/.test(_sz0)) {
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
      if (p.cat === 'kids_boys_eastern' && /\btuxedo\b/.test(_tb)) { p.cat = 'kids_boys_formal'; girlsKidN++; out.push(p); continue; }
    }
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
  return { products: out, stats: { junkN, del, footDel, footMove, fwdN, revN, pieceN, menUnsN, menPcN, womenN, girlsKidN, before: ps.length, after: out.length } };
}

module.exports = { cleanupProducts };

// ── CLI: node catalog-cleanup.js [apply] ──
if (require.main === module) {
  const APPLY = process.argv[2] === 'apply';
  const FILE = process.env.PSB_CATALOG || 'catalog.json';
  const cat = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const r = cleanupProducts(cat.products || []);
  const s = r.stats;
  console.log(`delete-nonapparel=${s.junkN} delete-accessories=${s.del} delete-men-footwear=${s.footDel} move-footwear=${s.footMove} fwd-unstitch=${s.fwdN} rev-stitch=${s.revN} piece-count=${s.pieceN} men-unstitch=${s.menUnsN} men-piece=${s.menPcN} women-type=${s.womenN} girls-kid=${s.girlsKidN}`);
  console.log(`total ${s.before} -> ${s.after}`);
  if (APPLY) { cat.products = r.products; fs.writeFileSync(FILE, JSON.stringify(cat)); console.log('*** WROTE ' + FILE + ' ***'); }
  else console.log('(dry-run — pass "apply" to write)');
}
