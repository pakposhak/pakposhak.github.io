#!/usr/bin/env node
/* PakPoshak — product catalog harvester
 *
 * Builds catalog.json for the "Browse products" search page. NO live per-search
 * fetching — the page loads this file once and filters client-side.
 *
 * Two source types:
 *   • Shopify brands → /products.json (decimal-rupee price, size option values).
 *   • SFCC brands (Khaadi, Sapphire) → parse category-page / Search-UpdateGrid
 *     product tiles (no /products.json exists).
 *
 * Runs locally now and as the VPS cron in Phase 2 (same file). Prices are the
 * store's base PKR. `sz` is indicative; real in-stock filtering happens when the
 * buyer taps "Add" and the form re-fetches live (.js for Shopify, relay /scrape
 * for SFCC). Category mapping mirrors order-form.html PT_CAT (only drives the
 * filter — cart category is set precisely by the live fetch).
 */
'use strict';
const https = require('https');
const fs    = require('fs');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const PER_BRAND = parseInt(process.env.PER_BRAND || '110', 10);
// Per-brand depth. Shopify brands now PAGINATE (/products.json?page=N), so caps
// above 250 pull multiple pages. SFCC (Khaadi/Sapphire) paginate via &start=.
// Target a ~9,000-product catalog at roughly 70% women / 15% men / 15% kids, with
// the priority lawn / first-tier houses (Khaadi, Sapphire, ETHNC, Nishat, Gul
// Ahmed, Alkaram, Maria B …) contributing the deepest.
const BRAND_CAP = {
  // ── priority women lawn / multi-department (paginated → hundreds each) ──
  'Khaadi':460, 'Sapphire':520, 'ETHNC':340, 'Nishat Linen':340, 'Gul Ahmed':340,
  'Alkaram Studio':320, 'Maria B':280, 'Limelight':260, 'Edenrobe':240, 'Outfitters':220,
  'Bonanza Satrangi':220, 'Sana Safinaz':240, 'Asim Jofa':240, 'Cross Stitch':200,
  'Beechtree':190, 'Generation':190, 'Zellbury':190, 'Almirah':180, 'Eminent':180,
  'Breakout':170, 'Zara Shahjahan':180, 'Afrozeh':150, 'Baroque':150, 'Mushq':140,
  'Charizma':150, 'Rang Rasiya':150, 'Motifz':150, 'Saya':140, 'Sha Posh':150,
  'Republic Womenswear':180, 'Iznik Fashions':170, 'Coco by Zara Shahjahan':170,
  // ── men (boosted to reach ~15% men) ──
  'Amir Adnan':240, 'Cambridge':220, 'Charcoal':200, 'Cougar':190, 'Dynasty Fabrics':170,
  'Royal Tag':190, 'Monark':160, 'Shahnameh':130, 'Shahzeb Saeed':130, 'Lawrencepur':130,
  // ── kids (boosted; limited live sources — paginate the two kids houses) ──
  'Minnie Minors':320, 'Hopscotch':280,
  'Stylo':250,  // footwear-only — scan deep, only khussa/peshawari are kept anyway
};
function capFor(name){ return BRAND_CAP[name] || PER_BRAND; }

// ── Shopify brands [name, host, group]  (group: md/w/p → women's cats, m → men, k → kids) ──
const SHOPIFY = [
  ['Almirah','almirah.com.pk','md'],['Breakout','breakout.com.pk','md'],['Diners','diners.com.pk','md'],
  ['Limelight','www.limelight.pk','md'],['Outfitters','outfitters.com.pk','md'],['Leisure Club','leisureclub.pk','md'],
  ['Alizeh','alizeh.pk','w'],['Beechtree','beechtree.pk','w'],['Chinyere','chinyere.pk','w'],
  ['Cross Stitch','www.crossstitch.pk','w'],['ETHNC','pk.ethnc.com','w'],['Farasha','farashaonline.pk','w'],
  ['Generation','generation.com.pk','w'],['Gulaal','gulaal.pk','w'],['Jazmin','jazmin.pk','w'],
  ['Kayseria','kayseria.com.pk','w'],['Lulusar','lulusar.com','w'],['Maria B','mariab.pk','w'],
  ['Mausummery','mausummery.com','w'],['Motifz','motifz.com.pk','w'],['Nureh','nureh.pk','w'],
  ['Ramsha','ramsha.pk','w'],['Salitex','salitexonline.com','w'],['Saya','saya.pk','w'],
  ['Sha Posh','shaposh.pk','w'],['Sitara Studio','sitarastudio.pk','w'],['So Kamal','sokamal.com','w'],
  ['Zarif','zarif.pk','w'],['Zeen (by Cambridge)','zeenwoman.com','w'],['Rang Rasiya','rangrasiya.com.pk','w'],
  ['Charizma','houseofcharizma.com','w'],['Nishat Linen','nishatlinen.com','w'],
  ['Barae Khanom','baraekhanom.pk','p'],['Bareeze','bareezepk.com','p'],['Crimson','www.crimson.com.pk','p'],
  ['Elan','elan.pk','p'],['Emaan Adeel','emaanadeel.com','p'],['Erum Khan','erumkhanstores.com','p'],
  ['Imrozia Premium','imroziapremium.com','p'],['Maryum N Maria','maryumnmaria.com','p'],
  ['Faiza Saqlain','www.faizasaqlain.pk','p'],['Sania Maskatiya','pk.saniamaskatiya.com','p'],
  ['Zaha by Elan','www.zaha.pk','p'],['Zainab Chottani','pk.zainabchottani.com','p'],['Zellbury','zellbury.com','md'],
  ['Bonanza Satrangi','bonanzasatrangi.com','md'],
  ['Charcoal','charcoal.com.pk','m'],['Cougar','cougar.com.pk','m'],['Dynasty Fabrics','dynastyfabrics.com','m'],
  ['Monark','monark.com.pk','m'],['Royal Tag','royaltag.com.pk','m'],['Shahnameh','shahnameh.pk','m'],
  ['Shahzeb Saeed','shahzebsaeed.com','m'],
  // Bachaa Party removed: its live /products.json is a general kids store (Toys,
  // Crockery, Baby Care, School Supplies) — no clothing in the feed, only pollution.
  // NOTE: Minnie Minors & Hopscotch moved to KIDS_BRANDS (collection-scoped 7-cat harvest).
  // ── added 2026-06-17 (most-popular-in-BD + abaya) — all verified live Shopify /products.json in PKR ──
  ['Gul Ahmed','gulahmedshop.com','md'],['Alkaram Studio','www.alkaramstudio.com','md'],
  ['Edenrobe','edenrobe.com','md'],   // J. Junaid Jamshed moved to COLLECTIONS (menswear-only)
  ['Lakhany by LSM','lakhanyonline.com','md'],
  ['Sana Safinaz','www.sanasafinaz.com','p'],['Asim Jofa','asimjofa.com','p'],
  ['Zara Shahjahan','www.zarashahjahan.com','p'],['Afrozeh','afrozeh.com','p'],
  ['Baroque','baroque.pk','p'],['Mushq','mushq.pk','p'],
  ['Amir Adnan','www.amiradnan.com','m'],['Lawrencepur','www.lawrencepur.com','m'],
  ['Cambridge','thecambridgeshop.com','m'],   // menswear (shalwar kameez, suits, polo, unstitched)
  ['Hijabi.pk','hijabi.pk','w'],   // abaya specialist → fills the Modest / abaya category
  // ── added 2026-06-18 ──
  ['Agha Noor','pk.aghanoorofficial.com','w'],   // aghanoorofficial.com 301s → the pk store
  ['Eminent','eminent.pk','md'],
  ['Stylo','stylo.pk','f'],   // footwear-only brand → group 'f' keeps ONLY khussa/peshawari
  // ── added 2026-06-19 (catalog 3k→9k): first-tier women, verified live Shopify in PKR ──
  ['Republic Womenswear','republicwomenswear.com','p'],
  ['Iznik Fashions','iznikfashions.com','p'],
  ['Coco by Zara Shahjahan','www.cocobyzarashahjahan.com','p'],
];

// ── Collection-scoped harvests: pull SPECIFIC Shopify collections (not whole
// stores). [name, host, group, totalCap, [[handle, forceCat|null], ...]]
//   forceCat 'footwear'/'lehenga' = force every item; 'bridal' = bridal UNLESS the
//   title says lehenga/gharara/saree; null = normal mapCat. 'ALL' handle = whole store.
const COLLECTIONS = [
  // khussa / kolhapuri — force EVERYTHING in the collection to footwear
  ['ECS','shopecs.com','w',40,[['women-khussa','footwear']]],
  ['Dazzle by Sarah','dazzlebysarah.com','w',40,[['khussa-shoes-online','footwear'],['kolhapuri-chappal','footwear']]],
  ['Khussa Corner','www.khussacorner.com','w',40,[['all-khussa','footwear']]],
  ['Khussa Master','khussamaster.com','w',40,[['ALL','footwear']]],
  // Zuruj sells BOTH khussa AND clothing — only force the footwear collections (the
  // whole-store force was wrong; "Mehrun" etc. are kaftans/suits, not khussa).
  // Zuruj — TWO separate entries so footwear doesn't eat the whole cap and the
  // clothing (kaftans/suits/co-ords) actually gets harvested into its real category.
  ['Zuruj','www.zuruj.com','w',20,[['casual-khussa','footwear'],['bow-khussa','footwear'],['casual-kolhapuri','footwear']]],
  ['Zuruj','www.zuruj.com','w',30,[['stiched',null],['3-piece-unstitched',null],['co-ord-sets',null]]],
  // Kaftans — a hot category; force the collection (titles are kaftan design names)
  ['Silayi Pret','silayipret.com','w',80,[['kaftaan','kaftan']]],
  ['Lulusar','lulusar.com','w',35,[['kaftan','kaftan'],['flat-70-kaftan','kaftan']]],
  // J. Junaid Jamshed — menswear ONLY (req)
  ['J. Junaid Jamshed','www.junaidjamshed.com','m',60,[['men-collections',null]]],
  // bridal / lehenga top-ups — the COLLECTION is the category, so force it
  ['Maria B','mariab.pk','p',28,[['bridals','bridal']]],
  ['Faiza Saqlain','www.faizasaqlain.pk','p',24,[['bridals','bridal'],['bridal-dresses','bridal']]],
  ['Zainab Chottani','pk.zainabchottani.com','p',40,[['bridals-lengha','lehenga'],['bridals-gharara','lehenga'],['bridals','bridal']]],
  ['Sania Maskatiya','pk.saniamaskatiya.com','p',18,[['arezu-bridals','bridal'],['baradari-formals','bridal']]],
  ['Maryum N Maria','maryumnmaria.com','p',24,[['bridal-couture-1','bridal'],['bridals','bridal']]],
  ['Imrozia Premium','imroziapremium.com','p',15,[['imrozia-bridals','bridal'],['bridals','bridal']]],
  ['Elan','elan.pk','p',18,[['wedding-festive','bridal'],['festive','bridal']]],
  // KIDS are now harvested by the dedicated KIDS_BRANDS pass (auto-discovers each
  // brand's boys/girls/infant collections → the 7-category taxonomy, eastern-first).
];

// ── SFCC brands (no /products.json) — parse product tiles from listing pages ──
// NOTE: Sapphire cgids are SEASONAL ("…-summer-26") — update each season.
// Each page is {path|cgid, group, sz, max}. The harvester paginates &start=0..max
// (step sz) until a page repeats/empties or the brand cap is hit. Khaadi uses clean
// category PATHS; Sapphire uses Search-UpdateGrid cgids. Both verified live 2026-06-19.
//   Khaadi: /unstitched/ 404s → use /fabrics/. kids/men paths 404 → women only here.
//   Sapphire cgids are SEASONAL ("…-summer-26") — update each season; cgid=man is the menswear grid.
const SFCC = [
  { name:'Khaadi', host:'pk.khaadi.com', priceRe:/PKR\s?([0-9,]+)/, pages:[
      { path:'ready-to-wear', group:'md', sz:120, max:480 },   // women's pret — paginates 400+
      { path:'fabrics',       group:'w',  sz:48,  max:192 },   // unstitched fabric
      { path:'new-in',        group:'md', sz:48,  max:96  } ] },
  { name:'Sapphire', host:'pk.sapphireonline.pk', priceRe:/Rs\.?\s?([0-9,]+)/, pages:[
      { cgid:'rtw-summer-26',  group:'w', sz:72, max:432 },     // ~446 women's RTW
      { cgid:'uns-summer-26',  group:'w', sz:72, max:288 },     // unstitched
      { cgid:'west-summer-26', group:'w', sz:72, max:144 },     // western
      { cgid:'man',            group:'m', sz:72, max:216 },     // menswear grid
      { cgid:'sale',           group:'w', sz:72, max:144 } ] },
];

function get(url){
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers:{ 'User-Agent':UA }, timeout:30000 }, res => {
      if(res.statusCode !== 200){ res.resume(); return reject(new Error('HTTP '+res.statusCode)); }
      let d=''; res.on('data', c => d += c); res.on('end', () => resolve(d));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
function dec(s){ return (s||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'"); }
// A valid size token: standard apparel sizes, plain numeric (waist/EU), OR kids AGE
// sizing (2-3Y, 4-5 Y, 5Y, 12-18M, 2T, newborn). Kids feeds size by age — the old
// strict list rejected those, so availSizes returned [] and EVERY kids product was
// silently dropped as "all sold out". This is why Minnie/Hopscotch/Edenrobe-kids
// yielded ~0. (Catalog sz is indicative; the live fetch on Add re-validates stock.)
function isSizeToken(s){
  s = String(s||'').trim().toLowerCase();
  if(!s || s.length > 16) return false;
  if(/^(xxs|xs|s|m|l|xl|xxl|xxxl|4xl|xs\/s|s\/m|m\/l|l\/xl|free\s*size|one\s*size|newborn|nb|standard)$/.test(s)) return true;
  if(/^\d{1,2}(\.5)?$/.test(s)) return true;                                                       // 28, 30, 5, 7.5
  if(/^\d{1,2}\s*[\/-]\s*\d{1,2}\s*-?\s*(y|yr|yrs|years?|m|mo|months?|t)?$/.test(s)) return true;   // 2-3, 4-5 Y, 12-18 M, 9/12-M, 3/4-Y, 24/36-M
  if(/^\d{1,2}\s*-?\s*(y|yr|yrs|years?|m|mo|months?|t)$/.test(s)) return true;                      // 5Y, 4-Y, 6 M, 2T
  return false;
}
// IN-STOCK sizes only: from each AVAILABLE variant take its Size/Age option value.
// Returns ['Unstitched'] for products with no size option; [] when every size of a
// sized product is sold out (caller drops those — only available items are listed).
function availSizes(p){
  const idx = (p.options||[]).findIndex(o => /size|age/i.test((o && o.name) || o));
  if(idx < 0) return ['Unstitched'];
  const seen = new Set(), out = [];
  (p.variants||[]).forEach(v => {
    if(!v || v.available === false) return;          // skip sold-out variants
    const raw = v['option' + (idx + 1)];
    const s = raw && String(raw).trim();
    if(s && isSizeToken(s) && !seen.has(s)){ seen.add(s); out.push(s); }
  });
  return out.slice(0, 8);
}
// Made-to-order policy: products whose every sized variant is sold out are DROPPED
// (incl. bridal/lehenga whose variants are all available:false). Per Danish — no
// "Made to order" items in the listings; only items we can actually buy now.

// ── category mapping (mirror of order-form PT_CAT) ──
// `s` = type+title (reliable for garment/piece-count); `tags` = tag string
// (used only for unstitched/embroidery signals — piece-count tags are noisy).
function mapCatWomen(s, tags){
  const both = s + ' ' + tags;
  const stitched = /\bpret\b|\bstitched\b|ready[\s-]?to[\s-]?wear|\brtw\b/.test(s);  // \bstitched\b so it does NOT match "unstitched"
  const unstitch = !stitched && (/\bunstitch/.test(both) || /\buns\b/.test(tags) || /\b(un[\s-]?stitched)\b/.test(s));
  const emb = /embroid|\bemb\b|chikankari|zari|schiffli|adda/.test(both);
  // 1) standalone accessories / single dupatta (NOT a suit-with-dupatta)
  if(/\bshawl\b|pashmina|\bstole\b/.test(s)) return 'shawl';
  if(/\bdupatta\b|\bscarf\b/.test(s) && !/shirt|kurti|kurta|kameez|suit|[23][\s-]?(pc|piece)|trouser|bottom/.test(s)) return 'dupatta_only';
  // 2) festive / occasion
  if(/\bsaree\b|\bsari\b/.test(s)) return 'saree';
  if(/lehenga|gharara|sharara/.test(s)) return 'lehenga';
  if(/abaya|jilbab|burqa|niqab/.test(s)) return 'abaya';
  if(/kaftan|kaftaan|caftan/.test(s)) return 'kaftan';
  if(/bridal|nikah|barat|walima/.test(s)) return 'bridal';
  // WINTER (khaddar/karandi/velvet/wool) — split by piece count AND stitched vs
  // unstitched (stitched ~+200g). Default 3pc unstitched. MUST mirror the form's
  // classifyWomenCat so a browsed card and the carted line agree.
  if(/\bwinter\b|khaddar|khadar|karandi|\bwool|woolen|velvet|marina|corduroy/.test(both)){
    const two = /\b2[\s-]?(pc|piece|pcs)\b/.test(s);
    const st = stitched && !unstitch;
    if(two) return st ? 'winter_2pc_stitch' : 'winter_2pc_unstitch';
    return st ? 'winter_3pc_stitch' : 'winter_3pc_unstitch';
  }
  // 3) unstitched (explicit signal, and not a stitched/pret item)
  if(unstitch) return emb ? 'unstitch_3pc_emb' : 'lawn_3pc_unstitch';
  // 4) formal / festive-wear tiers
  if(/heavy[\s-]?formal|organza|tissue|jamawar/.test(s)) return 'heavy_formal_3pc';
  if(/\bformal\b|chiffon|party[\s-]?wear/.test(s)) return 'formal_emb_3pc';
  if(/night|sleep[\s-]?wear|lounge|pyjama|pajama/.test(s)) return 'loungewear';
  // 5) PIECE COUNT (drives weight) — explicit 3-piece: number 3, OR a suit/kameez
  //    that names a dupatta (the 3rd piece).
  if(/\b3[\s-]?(pc|piece|pcs)\b|(shirt|kameez|suit|kurta)[\s\w]*dupatta|dupatta[\s\w]*(shirt|kameez|suit|kurta)/.test(s)) return emb ? 'pret_3pc_emb' : 'pret_3pc';
  // explicit 2-piece / shirt+dupatta
  if(/\b2[\s-]?(pc|piece|pcs)\b|shirt[\s-]?dupatta/.test(s)) return emb ? 'pret_2pc_emb' : 'shirt_dupatta_2pc';
  // kameez+shalwar or shirt+trouser with NO 3rd piece = 2-piece, NOT a 3pc suit
  if(/shalwar[\s-]?kameez|kameez[\s-]?shalwar|(shirt|kurti|kurta|kameez)\b[\s\w]{0,12}\b(trouser|bottom|pant|shalwar)\b|\b(trouser|bottom|pant|shalwar)\b[\s\w]{0,12}\b(shirt|kurti|kurta|kameez)\b/.test(s)) return emb ? 'pret_2pc_emb' : 'shirt_trouser_2pc';
  // a generic "suit" with no piece number defaults to 3-piece (most lawn suits)
  if(/\bsuit\b/.test(s)) return emb ? 'pret_3pc_emb' : 'pret_3pc';
  // 6) single garments / separates
  if(/co[\s-]?ord|coord/.test(s)) return 'coord_western';
  if(/trouser|pant|palazzo|plazo|capri|culotte|tights|leggings?/.test(s) && !/shirt|kurti|kurta|kameez/.test(s)) return 'womens_trouser';
  if(/dress|maxi|gown|jumpsuit/.test(s)) return 'maxi_dress';
  if(/kurti|kurta|shirt|top|tunic|\btee\b|blouse|\bcape\b/.test(s)) return 'kurti_1pc';
  // 7) bare fabric name with no garment word = unstitched
  if(/\blawn\b|cambric|voile|khaddar|karandi|fabric|piece[\s-]?goods/.test(s)) return 'lawn_3pc_unstitch';
  return 'pret_3pc';
}
function mapCatMen(s){
  if(/sherwani|prince/.test(s)) return 'mens_sherwani';
  if(/waist[\s-]?coat|nehru/.test(s)) return 'mens_waistcoat';
  if(/unstitch|fabric|suiting|wash[\s-]?n?[\s-]?wear|gabardine/.test(s)) return 'mens_unstitched';
  if(/pant[\s-]?coat|coat[\s-]?pant|blazer|tuxedo|2[\s-]?pc[\s-]?suit|3[\s-]?pc[\s-]?suit|formal[\s-]?suit/.test(s)) return 'mens_suit';
  if(/shalwar|kameez|kurta[\s-]?(shalwar|pajama|pyjama)/.test(s)) return 'mens_shalwar_kameez';
  if(/jeans|denim/.test(s)) return 'mens_jeans';
  if(/trouser|chino|cargo/.test(s)) return 'mens_trouser';
  if(/polo|t[\s-]?shirt|\btee\b/.test(s)) return 'mens_shirt';
  if(/kurta|kameez/.test(s)) return 'mens_kurta';
  if(/shirt/.test(s)) return 'mens_shirt';
  if(/suit/.test(s)) return 'mens_shalwar_kameez';
  return 'mens_kurta';
}
// ── KIDS: 7-category classifier — boys/girls × eastern/western/formal + infant ──
// Gender + garment-type come from the COLLECTION handle (strong hint, passed in by the
// kids harvest) AND the product title; the title fills whatever the collection didn't
// encode. eastern-first: an unknown type defaults to eastern.
function kidGender(s){
  if(/infant|new[\s-]?born|\bnb\b|\bmonths?\b|toddler|\bbaby\b|romper|\b0-2\b|\b1-2\s?y/.test(s)) return 'infant';
  if(/\bgirls?\b|girl[-\s]|\bfrock\b|\bgown\b/.test(s)) return 'girls';
  if(/\bboys?\b|boy[-\s]|sherwani|waist[\s-]?coat/.test(s)) return 'boys';
  return null;
}
function kidType(s){
  // formal = FESTIVE / CEREMONIAL only. NOT plain "embroidered" — kids casual tees are
  // routinely "embroidered" and must stay western (validation caught this).
  if(/festive|\beid\b|ceremon|wedding|\bformal\b|\bparty\b|\bgown\b|sherwani|fancy[\s-]?frock/.test(s)) return 'formal';
  if(/western|\btees?\b|t[-\s]?shirt|polo|\bshirts?\b|\bjeans?\b|denim|\bshorts?\b|trouser|\bpants?\b|hoodie|sweat|jacket|knit|woven|co-?ord|legging|tights|jogger|cargo|chino/.test(s)) return 'western';
  if(/eastern|ethnic|kurta|shalwar|kameez|\bpret\b|\blawn\b|frock|kurti|[23][-\s]?(pc|piece)|\bsuit\b|\bmaxi\b|abaya|waist[\s-]?coat/.test(s)) return 'eastern';
  return null;
}
function mapCatKids(s, hint){
  hint = hint || {};
  s = String(s||'').toLowerCase();
  // gender: the collection hint is reliable; fall back to title, then a garment guess.
  let g = hint.g || kidGender(s);
  if(g === 'infant') return 'kids_infant';
  // type: the TITLE wins (a jogger/tee in a "festive" collection is still western); a
  // formal/festive COLLECTION only upgrades a NON-western title to formal. Unknown →
  // collection hint → eastern-first default.
  const tt = kidType(s);
  let t = tt || hint.t || 'eastern';
  if(hint.t === 'formal' && tt !== 'western') t = 'formal';
  if(!g) g = /frock|\bmaxi\b|\bgown\b|\bdress\b|kurti|\bgirl/.test(s) ? 'girls' : 'boys';
  if(t === 'formal')  return g === 'girls' ? 'kids_girls_formal'  : 'kids_boys_formal';
  if(t === 'western') return g === 'girls' ? 'kids_girls_western' : 'kids_boys_western';
  return g === 'girls' ? 'kids_girls_eastern' : 'kids_boys_eastern';
}
// khussa/kolhapuri/peshawari are traditional flats we CAN ship → keep as footwear.
const KHUSSA_RE = /\b(khussa|kolhapuri|peshawari)/;
// Modern shoes we can't ship → dropped from the catalog entirely (return null).
// Word-boundaried so "bootcut"/"sandali" (garment names) are NOT caught as shoes.
const SHOE_RE = /\bshoe|sneaker|\bsandals?\b|chappal|\bheels?\b|slipper|loafer|\bmule\b|footwear|\bpump\b|\bboots?\b|slip[\s-]?on|wedge|stiletto|flip[\s-]?flop/;
const PS_NON_APPAREL = /\b(bed|mattress|\bnet\b|blanket|quilt|pillow|cushion|towel|bottle|feeder|diaper|nappy|\btoy|stroller|pram|\bcomb\b|\bsocks?\b|\bcap\b|\bhat\b|\bbib\b|mitten|booties|booti|headband|hair[\s-]?band|\bbag\b|clutch|purse|wallet|jewel|earring|necklace|\bring\b|bangle|bracelet|brooch|perfume|fragrance|\battar\b|\bwatch\b|sunglass|\bbelt\b|key[\s-]?chain|gift[\s-]?set|hamper|pouch|cufflink)\b/;
// STRONG garment signals — if present, the item is apparel even when its NAME
// contains a shoe/non-apparel word ("Sandali" lawn collection, "Net 3PC" suit).
// `\b[23]…\b` so "22Pcs"/"42Pcs" (toy quantities) do NOT read as a 2pc/3pc suit.
const GARMENT_SIG = /shirt|kurti|kurta|kameez|\bsuit\b|frock|\bdress\b|gown|abaya|kaftan|trouser|\bpants?\b|\bjeans?\b|denim|shalwar|saree|lehenga|\bcoat\b|jacket|sweater|dupatta|\bmaxi\b|\b[23][\s-]?(pc|piece|pcs)\b|un[\s-]?stitch|\blawn\b|cambric|khaddar|karandi|chiffon|organza/;
const BAG_RE = /\bbag|hand[\s-]?bag|clutch|purse|wallet|tote\b|satchel|wristlet|backpack|\bpouch\b/;
// Fragrances/perfumes & ANY liquid — STRICTLY excluded (we can't ship liquids).
// UNAMBIGUOUS terms (never a garment) → drop unconditionally:
const FRAGRANCE_STRONG = /perfume|fragrance|deodorant|body[\s-]?mist|body[\s-]?spray|eau[\s-]?de|\bedt\b|\bedp\b|pour[\s-]?homme|pour[\s-]?femme|sanitizer|essential[\s-]?oil/;
// AMBIGUOUS terms that ALSO appear in suit/collection NAMES ("Cologne Blue", "Attar
// Silk Lawn") → drop ONLY when there's no garment signal. (Plain "mist"/"deo"/"oil"
// stay out of both lists — "Pearl Mist"/"DEODAR"/"Bell Mist" are suits.)
const FRAGRANCE_WEAK = /\bcologne\b|\battar\b|\bcandle\b|\bserum\b|\blotion\b/;
// Gift/perfume BUNDLES (e.g. "Father's Day Bundle", tag=bundle) — these often contain
// a perfume; drop when there's NO garment signal (a real "3-suit bundle" survives).
const BUNDLE_RE = /\bbundle\b|gift[\s-]?set|gift[\s-]?bundle|\bhamper\b|combo[\s-]?(?:deal|pack|set)/;
// Per-PRODUCT drop filter for KIDS collections. A kids collection mixes garments with
// shoes / underwear / eyewear / accessories; the collection vouches the item is "kids"
// so (unlike mapCat) we don't require a garment word — we only drop the clearly
// non-garment items. (Validation caught "Pack of 3-Briefs", "Low-Top Sneakers",
// "Wayfarer Sunglasses" leaking in as apparel.)
const KIDS_DROP = /\b(briefs?|boxer|panty|panties|trunks?|innerwear|under[\s-]?wear|undergarment|sunglass(?:es)?|eye[\s-]?wear|spectacles?|\bglasses\b|socks?|\bcaps?\b|beanie|\bhats?\b|\bbib\b|mittens?|booti(?:es)?|shoes?|sneakers?|sandals?|slippers?|loafers?|\bpumps?\b|\bbags?\b|backpack|bottle|feeder|sipper|diaper|nappy|toys?|\bcomb\b|towel|blanket|pillow|cushion|jewell?ery|earrings?|bangles?|bracelets?|hair[\s-]?(?:band|clip|tie|accessor)|head[\s-]?band|\bbelts?\b|watch|perfume|fragrance|deodorant)\b/;
// Decide if a Shopify collection is a kids APPAREL collection; extract gender/type hint
// from the handle+title. Returns null to skip (accessories / sale-duplicate / non-kids).
const KIDS_COLL_SKIP = /accessor|sunglass|fragrance|perfume|\bshoe|footwear|sneaker|\bsock|\bcap\b|\bhat\b|\bbag\b|jewel|\bwatch\b|\bbelt\b|bottle|feeding|hygiene|diaper|\btoy|school|stationer|grooming|\bbib\b|mitten|booti|stroller|pram|\bgift|towel|blanket|bedding|skincare|\bsale\b|discount|flat[-\s]?\d|[-\s]off\b|clearance|\bunder-?\d|everything-under|\d{1,2}%/i;
function classifyKidsCollection(handle, title){
  const s = (handle + ' ' + (title||'')).toLowerCase();
  if(!/kid|boys?|girls?|infant|newborn|junior|teen|toddler|\bbaby\b/.test(s)) return null;   // not a kids collection
  if(KIDS_COLL_SKIP.test(s)) return null;                                                       // accessories / sale-dup
  return { g: kidGender(s), t: kidType(s) };
}
// Full HAND-embroidery (adda work) = heavy (~2.5kg), regardless of stitched/unstitched.
// Detected from the product DESCRIPTION's hand/adda wording, plus a brand-default for
// houses that are predominantly handmade (their feed often omits the wording).
// Festive/luxury houses whose pieces are embroidered formal-wear (heavier than plain
// lawn) — bump a light auto-guess up to formal-embroidered so the weight is sensible.
// (Replaces the old blanket "all Emaan = 2.5kg handmade" rule, which over-weighted.)
const FESTIVE_BRANDS = new Set(['Emaan Adeel']);
const HEAVY_WOMEN_CATS = new Set(['pret_3pc','pret_3pc_emb','pret_2pc_emb','shirt_dupatta_2pc','shirt_trouser_2pc','formal_emb_2pc','formal_emb_3pc','heavy_formal_3pc','lawn_3pc_unstitch','unstitch_3pc_emb','bridal']);
function isHandmadeFull(cat, desc){
  if(!HEAVY_WOMEN_CATS.has(cat)) return false;
  // Brand-default: houses that are predominantly full hand-embroidery (their feed
  // often omits the wording) → any embroidered piece counts.
  // (no per-brand blanket rule — only an explicit hand-work description qualifies)
  // Otherwise require a STRONG hand-work signal (adda, or explicitly "fully/all-over
  // hand embroidered") — a casual "hand-embroidered neckline" must NOT count, or every
  // mid-range lawn suit would wrongly become 2.5kg.
  return /\badda[\s-]?work|\badda\b|fully hand[\s-]?embroider|all[\s-]?over hand[\s-]?embroider|complete(?:ly)? hand[\s-]?embroider|entirely hand[\s-]?embroider|pure hand[\s-]?embroider/i.test(desc);
}
function mapCat(group, type, title, tagStr){
  const tt = ((type||'') + ' ' + (title||'')).toLowerCase();   // garment/piece-count: reliable
  const tags = (tagStr||'').toLowerCase();                      // unstitch/emb signals only
  const s = tt + ' ' + tags;
  // Liquids/perfumes & gift-bundles — strictly excluded, before anything else.
  if(FRAGRANCE_STRONG.test(s)) return null;                         // perfume/cologne-spray etc. — never a garment
  if(FRAGRANCE_WEAK.test(s) && !GARMENT_SIG.test(s)) return null;   // ambiguous (cologne/attar) only if not a suit
  if(BUNDLE_RE.test(s) && !GARMENT_SIG.test(s)) return null;
  // Footwear-only brand (e.g. Stylo): keep ONLY khussa/peshawari, drop everything
  // else (so a vaguely-named shoe never defaults to a women's 3pc suit).
  if(group === 'f') return KHUSSA_RE.test(s) ? 'footwear' : null;
  // Non-garment classification ONLY when there is NO real garment signal — so a
  // suit/lawn whose NAME happens to contain "sandal"/"net" is never mis-flagged.
  if(!GARMENT_SIG.test(s)){
    if(KHUSSA_RE.test(s)) return 'footwear';      // khussa etc. — shippable
    if(SHOE_RE.test(s)) return null;              // sneakers/heels/sandals — drop (we can't ship)
    if(BAG_RE.test(s)) return null;               // bags removed from listings entirely (req)
    if(PS_NON_APPAREL.test(s)) return 'accessories';
  }
  // Hijab / headscarf — a women's scarf-class item. Classify BEFORE the kids/gender
  // check so a "Wardah Cotton Hijab – Baby pink" isn't misread as kids on the word "baby".
  if(/\bhijab\b|head[\s-]?scarf|\bshayla\b/.test(s)) return 'dupatta_only';
  // gender from the text — esp. multi-department brands that mix men's & kids in.
  // Kids items must carry a GARMENT signal: a kids brand also stocks toys / baby
  // gear / books (Bachaa Party: "R/C Car", "Building Blocks", "Piano Play Mat") and
  // those have no garment word → drop them (we only list clothing).
  // Keep/drop uses `s` (tags too); the eastern/frock/formal SUB-split uses `tt`
  // (type+title) — tags are noisy ("3 piece Dresses" tag on a plain lawn 2pc).
  if(/\b(boys?|girls?|infant|toddler|junior|newborn|\bbaby\b|\bkid|kids\b)\b/.test(s)) return GARMENT_SIG.test(s) ? mapCatKids(tt) : null;
  if(group === 'k') return GARMENT_SIG.test(s) ? mapCatKids(tt) : null;
  if(group === 'm') return mapCatMen(s);
  if(group === 'md' && /\b(mens?|men's|gents?|\bpolo\b|waist[\s-]?coat|sherwani|boxer|\btie\b)\b/.test(s)) return mapCatMen(s);
  return mapCatWomen(tt, tags);
}

// ── Shared Shopify product → catalog object mapper ───────────────────────────
// Used by BOTH the whole-store harvest and the collection harvest. `force`
// overrides the category for collection-scoped pulls (null = normal mapCat).
function buildProduct(p, name, host, group, force, kidsHint){
  const v0 = p.variants[0];
  const pkr = Math.round(parseFloat(v0 && v0.price) || 0);
  if(pkr < 500) return null;
  const img = (p.images && p.images[0] && p.images[0].src) || '';
  if(!img) return null;
  const tagStr = (Array.isArray(p.tags) ? p.tags.join(' ') : String(p.tags||'')).toLowerCase();
  let cat;
  if(force === 'bridal'){
    const tt = ((p.product_type||'') + ' ' + (p.title||'')).toLowerCase();
    cat = /lehenga|gharara|sharara/.test(tt) ? 'lehenga' : (/\bsaree\b|\bsari\b/.test(tt) ? 'saree' : 'bridal');
  } else if(force){ cat = force; }
  else if(group === 'k'){
    // Kids (collection-scoped): the collection vouches it's apparel, so drop only the
    // clear non-garments (shoes/underwear/eyewear/accessories), then 7-cat classify
    // using the collection's gender/type hint + the title.
    const s2 = ((p.product_type||'') + ' ' + (p.title||'') + ' ' + tagStr).toLowerCase();
    if(FRAGRANCE_STRONG.test(s2) || KIDS_DROP.test(s2)) return null;
    cat = mapCatKids((p.product_type||'') + ' ' + (p.title||''), kidsHint);
  }
  else { cat = mapCat(group, p.product_type, p.title, tagStr); }
  if(!cat) return null;   // dropped (sneakers/heels/bags/perfume we can't ship)
  // Festive house with a too-light auto-guess → formal-embroidered weight floor.
  if(!force && FESTIVE_BRANDS.has(name) && (cat === 'pret_3pc' || cat === 'kurti_1pc' || cat === 'pret_3pc_emb')) cat = 'formal_emb_3pc';
  const desc = (p.body_html || '').replace(/<[^>]+>/g, ' ');
  if(!force && isHandmadeFull(cat, desc)) cat = 'handmade_emb';   // only an explicit adda/full-hand description
  const sz = availSizes(p);
  if(!sz.length) return null;   // every size sold out (incl. made-to-order bridal) → drop
  const pub = Math.floor((Date.parse(p.published_at || p.updated_at || p.created_at || '') || 0) / 1000);
  const onSale = (p.variants||[]).some(v => v.compare_at_price && parseFloat(v.compare_at_price) > parseFloat(v.price||0));
  const o = { b:name, t:(p.title||'').slice(0,80), u:`https://${host}/products/${p.handle}`, img, pkr, cat, sz, pub };
  if(onSale) o.sale = 1;
  return o;
}

// ── Shopify whole-store harvest — PAGINATED (?page=N) so deep caps pull multiple
// pages. One retry per page so a transient timeout doesn't drop the brand. Stops at
// the cap, at a short (<250) page, or when a page returns empty. ──
async function harvestShopify(name, host, group){
  const cap = capFor(name);
  const out = [], seenH = new Set();
  const maxPages = Math.min(10, Math.ceil(cap / 200) + 1);
  for(let page = 1; page <= maxPages && out.length < cap; page++){
    let raw = null;
    for(let attempt = 1; attempt <= 2; attempt++){
      try{ raw = await get(`https://${host}/products.json?limit=250&page=${page}`); break; }
      catch(e){ if(attempt < 2){ await sleep(1300); continue; } if(page === 1) console.error(`  ✗ ${name} (${host}): ${e.message}`); }
    }
    if(raw == null) break;
    let j; try{ j = JSON.parse(raw); }catch(e){ break; }
    const prods = (j.products||[]).filter(p => p.variants && p.variants.length && p.handle);
    if(!prods.length) break;                 // no more pages
    for(const p of prods){
      if(out.length >= cap) break;
      if(seenH.has(p.handle)) continue; seenH.add(p.handle);
      const o = buildProduct(p, name, host, group, null);
      if(o) out.push(o);
    }
    if(prods.length < 250) break;            // last page reached
    await sleep(450);
  }
  return out;
}

// ── SFCC harvest (parse product tiles) ──
function slugToName(href){
  const m = href.match(/\/([a-z0-9-]+)\/[A-Za-z0-9_-]+\.html/);
  if(!m) return '';
  return m[1].replace(/-/g,' ').replace(/\b\w/g, c => c.toUpperCase());
}
function parseSfccPage(html, host, group, priceRe){
  const out=[], seen=new Set();
  const blocks = html.split(/class="product-tile"/);
  for(let k=1;k<blocks.length;k++){
    const seg = blocks[k].slice(0,4000);
    const pid = (seg.match(/data-(?:productid|pid)="([^"]+)"/)||[])[1];
    if(!pid || seen.has(pid)) continue;
    const href = (seg.match(/href="((?:https?:\/\/[^"]+|\/[^"]+)\.html)/)||[])[1];
    const img  = (seg.match(/data-(?:large-0|medium-0)="(https:\/\/[^"?]+)/)||seg.match(/data-src="(https:\/\/[^"?]+)/)||[])[1];
    const price= (seg.match(priceRe)||[])[1];
    let name   = (seg.match(/class="[^"]*(?:pdp-link|product-name|tile-name|name-link)[^"]*"[^>]*>\s*(?:<a[^>]*>)?\s*([^<]{3,90})/i)||[])[1];
    const pkr  = price ? parseInt(price.replace(/,/g,'')) : 0;
    if(!pid || !href || !img || pkr < 500) continue;
    seen.add(pid);
    if(!name) name = slugToName(href) || 'Product';
    const url = dec(href.startsWith('http') ? href : 'https://'+host+href);
    const title = dec(name).slice(0,80);
    const cat = mapCat(group, '', title, '');
    if(!cat) continue;   // dropped (sneakers/heels etc.)
    const sz = /unstitch/i.test(title) ? ['Unstitched'] : ['XS','S','M','L'];
    out.push({ b:'', t:title, u:url, img:dec(img), pkr, cat, sz, pub:0 });
  }
  return out;
}
function sfccUrl(host, pg, start){
  if(pg.cgid) return `https://${host}/on/demandware.store/Sites-Sapphire-Site/en_PK/Search-UpdateGrid?cgid=${pg.cgid}&start=${start}&sz=${pg.sz}`;
  return `https://${host}/${pg.path}/?sz=${pg.sz}&start=${start}`;
}
// Paginate each SFCC category (&start=0..max step sz) until it repeats / empties or
// the brand cap is hit. Per-page group lets Sapphire's `man` grid map to men's cats.
async function harvestSfcc(brand){
  const all = [], seen = new Set();
  const cap = capFor(brand.name);
  for(const pg of brand.pages){
    for(let start = 0; start <= pg.max && all.length < cap; start += pg.sz){
      let html;
      try{ html = await get(sfccUrl(brand.host, pg, start)); }
      catch(e){ console.error(`  ✗ ${brand.name} ${pg.cgid||pg.path}@${start}: ${e.message}`); break; }
      const items = parseSfccPage(html, brand.host, pg.group, brand.priceRe);
      if(!items.length) break;                 // end of this category
      let added = 0;
      for(const p of items){ if(seen.has(p.u)) continue; seen.add(p.u); p.b = brand.name; all.push(p); added++; }
      await sleep(650);
      if(!added) break;                         // only repeats → category exhausted
    }
    if(all.length >= cap) break;
  }
  return all.slice(0, cap);
}

// ── Collection harvest (Shopify /collections/<handle>/products.json) ──
async function harvestCollectionUrl(name, host, group, force, handle){
  const url = handle === 'ALL'
    ? `https://${host}/products.json?limit=250`
    : `https://${host}/collections/${handle}/products.json?limit=250`;
  let raw; try{ raw = await get(url); }catch(e){ return []; }
  let j; try{ j = JSON.parse(raw); }catch(e){ return []; }
  return (j.products||[]).filter(p => p.variants && p.variants.length && p.handle)
    .map(p => buildProduct(p, name, host, group, force)).filter(Boolean);
}
async function harvestCollections(entry){
  const [name, host, group, cap, handles] = entry;
  const out = [], seen = new Set();
  for(const [handle, force] of handles){
    const items = await harvestCollectionUrl(name, host, group, force, handle);
    for(const it of items){ if(seen.has(it.u)) continue; seen.add(it.u); out.push(it); }
    await sleep(600);
    if(out.length >= cap) break;
  }
  return out.slice(0, cap);
}

// ── KIDS harvest — auto-discover each brand's kids collections, classify per product
// (collection hint + title), dedupe by URL, EASTERN-FIRST (eastern/formal/infant
// collections pulled before western, and western sub-capped per brand). ──
const KIDS_CAP = parseInt(process.env.KIDS_CAP || '1400', 10);          // per-brand kids ceiling
const KIDS_WEST_CAP = parseInt(process.env.KIDS_WEST_CAP || '240', 10); // western sub-cap → keeps kids eastern-led
// Brands to pull KIDS from: family/multi houses (their boys/girls sections) + dedicated
// kids/baby brands. Each [name, host]. Adult lines still come from SHOPIFY/SFCC/COLLECTIONS.
const KIDS_BRANDS = [
  ['Outfitters','outfitters.com.pk'],['Breakout','breakout.com.pk'],['Edenrobe','edenrobe.com'],
  ['Diners','diners.com.pk'],['Eminent','eminent.pk'],['Limelight','www.limelight.pk'],
  ['Zellbury','zellbury.com'],['Gul Ahmed','gulahmedshop.com'],['Maria B','mariab.pk'],
  ['Sana Safinaz','www.sanasafinaz.com'],['Almirah','almirah.com.pk'],['Bonanza Satrangi','bonanzasatrangi.com'],
  ['Alkaram Studio','www.alkaramstudio.com'],['Minnie Minors','minnieminors.com'],['Hopscotch','ilovehopscotch.com'],
  ['Tifl','tifl.pk'],['Baby Planet','babyplanet.pk'],['Buttoned On','buttonedon.pk'],['Preeto','preeto.pk'],
  ['One Kids','beoneshopone.com'],['Engine','engine.com.pk'],
];
async function harvestKidsCollection(name, host, handle, hint, need){
  const out = [];
  for(let page = 1; page <= 4 && out.length < need; page++){
    let raw; try{ raw = await get(`https://${host}/collections/${handle}/products.json?limit=250&page=${page}`); }catch(e){ break; }
    let prods; try{ prods = (JSON.parse(raw).products) || []; }catch(e){ break; }
    if(!prods.length) break;
    for(const p of prods){
      if(!(p.variants && p.variants.length && p.handle)) continue;
      const o = buildProduct(p, name, host, 'k', null, hint);
      if(o) out.push(o);
    }
    if(prods.length < 250) break;
    await sleep(350);
  }
  return out;
}
async function harvestKidsBrand(name, host){
  let raw; try{ raw = await get(`https://${host}/collections.json?limit=250`); }catch(e){ return []; }
  let cols; try{ cols = (JSON.parse(raw).collections) || []; }catch(e){ return []; }
  const kc = cols.map(c => ({ handle:c.handle, n:c.products_count || 0, hint:classifyKidsCollection(c.handle, c.title) }))
    .filter(c => c.hint && c.n > 0);
  // eastern / formal / infant collections first, western last → eastern-first within the cap
  kc.sort((a,b) => ((a.hint.t === 'western' ? 1 : 0) - (b.hint.t === 'western' ? 1 : 0)) || b.n - a.n);
  const out = [], seen = new Set(); let west = 0;
  for(const c of kc){
    if(out.length >= KIDS_CAP) break;
    const items = await harvestKidsCollection(name, host, c.handle, c.hint, 400);
    for(const it of items){
      if(seen.has(it.u)) continue; seen.add(it.u);
      if(/_western$/.test(it.cat)){ if(west >= KIDS_WEST_CAP) continue; west++; }   // eastern-first cap
      out.push(it);
      if(out.length >= KIDS_CAP) break;
    }
    await sleep(300);
  }
  return out;
}

(async () => {
  const KIDS_ONLY = process.env.KIDS_ONLY === '1';   // dry-run: kids brands only, report 7-cat split, no catalog.json write
  const all = [];
  // KIDS first so the hint-based classification wins URL-dedup over any kids items that
  // leak into a family brand's whole-store (adult) harvest.
  for(const [name, host] of KIDS_BRANDS){
    process.stdout.write(`• ${name} (kids) … `);
    const items = await harvestKidsBrand(name, host);
    console.log(`${items.length}`);
    all.push(...items);
    await sleep(500);
  }
  if(!KIDS_ONLY){
    for(const [name, host, group] of SHOPIFY){
      process.stdout.write(`• ${name} … `);
      const items = await harvestShopify(name, host, group);
      console.log(`${items.length}`);
      all.push(...items);
      await sleep(700);
    }
    for(const brand of SFCC){
      process.stdout.write(`• ${brand.name} (SFCC) … `);
      const items = await harvestSfcc(brand);
      console.log(`${items.length}`);
      all.push(...items);
    }
    for(const entry of COLLECTIONS){
      process.stdout.write(`• ${entry[0]} (collection) … `);
      const items = await harvestCollections(entry);
      console.log(`${items.length}`);
      all.push(...items);
      await sleep(500);
    }
  }
  // de-dupe by product URL (a brand's bridal collection overlaps its main feed)
  const seenU = new Set();
  const deduped = all.filter(p => { if(seenU.has(p.u)) return false; seenU.add(p.u); return true; });
  const brands = [...new Set(deduped.map(p => p.b))];
  const out = { updated: new Date().toISOString(), count: deduped.length, brands: brands.length, products: deduped };
  const file = KIDS_ONLY ? 'catalog-kids-sample.json' : 'catalog.json';
  fs.writeFileSync(file, JSON.stringify(out));
  console.log(`\n✓ ${file} — ${deduped.length} products from ${brands.length} brands`);
  // gender mix (cat → gender): mens_* = men, kids_* = kids, else women.
  const genOf = c => /^mens_/.test(c) ? 'm' : /^kids_/.test(c) ? 'k' : 'w';
  const split = { w:0, m:0, k:0 };
  deduped.forEach(p => split[genOf(p.cat)]++);
  const pct = g => deduped.length ? Math.round(split[g] / deduped.length * 100) : 0;
  console.log(`  gender mix → women ${split.w} (${pct('w')}%) · men ${split.m} (${pct('m')}%) · kids ${split.k} (${pct('k')}%)`);
  // KIDS 7-category breakdown (the new taxonomy) + eastern-vs-western check.
  const KCATS = ['kids_boys_eastern','kids_girls_eastern','kids_boys_western','kids_girls_western','kids_boys_formal','kids_girls_formal','kids_infant'];
  const kc = {}; KCATS.forEach(c => kc[c] = 0);
  deduped.forEach(p => { if(kc[p.cat] != null) kc[p.cat]++; });
  const kTot = KCATS.reduce((s,c) => s + kc[c], 0);
  if(kTot){
    console.log('  kids 7-cat:');
    KCATS.forEach(c => console.log(`    ${c.padEnd(20)} ${kc[c]}`));
    const east = kc.kids_boys_eastern + kc.kids_girls_eastern + kc.kids_boys_formal + kc.kids_girls_formal;
    const west = kc.kids_boys_western + kc.kids_girls_western;
    console.log(`    → eastern+formal ${east} vs western ${west} | infant ${kc.kids_infant}  (kids total ${kTot})`);
    const kb = [...new Set(deduped.filter(p => /^kids_/.test(p.cat)).map(p => p.b))];
    console.log(`    kids brands (${kb.length}): ${kb.join(', ')}`);
  }
})();
