#!/usr/bin/env node
/* PakiPoshak — product catalog harvester
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
const PER_BRAND = parseInt(process.env.PER_BRAND || '50', 10);
// Most-popular-in-Bangladesh brands get a deeper harvest (req: ~100+ each).
const BRAND_CAP = { 'ETHNC':120, 'Sapphire':120, 'Nishat Linen':120, 'Maria B':120, 'Stylo':250 };  // Stylo: scan deep, only khussa/peshawari are kept anyway
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
  ['Minnie Minors','minnieminors.com','k'],['Bachaa Party','bachaaparty.com','k'],['Hopscotch','ilovehopscotch.com','k'],
  // ── added 2026-06-17 (most-popular-in-BD + abaya) — all verified live Shopify /products.json in PKR ──
  ['Gul Ahmed','gulahmedshop.com','md'],['Alkaram Studio','www.alkaramstudio.com','md'],
  ['Edenrobe','edenrobe.com','md'],   // J. Junaid Jamshed moved to COLLECTIONS (menswear-only)
  ['Lakhany by LSM','lakhanyonline.com','md'],
  ['Sana Safinaz','www.sanasafinaz.com','p'],['Asim Jofa','asimjofa.com','p'],
  ['Zara Shahjahan','www.zarashahjahan.com','p'],['Afrozeh','afrozeh.com','p'],
  ['Baroque','baroque.pk','p'],['Mushq','mushq.pk','p'],
  ['Amir Adnan','www.amiradnan.com','m'],['Lawrencepur','www.lawrencepur.com','m'],
  ['Hijabi.pk','hijabi.pk','w'],   // abaya specialist → fills the Modest / abaya category
  // ── added 2026-06-18 ──
  ['Agha Noor','pk.aghanoorofficial.com','w'],   // aghanoorofficial.com 301s → the pk store
  ['Eminent','eminent.pk','md'],
  ['Stylo','stylo.pk','f'],   // footwear-only brand → group 'f' keeps ONLY khussa/peshawari
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
  ['Zuruj','www.zuruj.com','w',30,[['ALL','footwear']]],
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
];

// ── SFCC brands (no /products.json) — parse product tiles from listing pages ──
// NOTE: Sapphire cgids are SEASONAL ("…-summer-26") — update each season.
const SFCC = [
  { name:'Khaadi', host:'pk.khaadi.com', group:'md', priceRe:/PKR\s?([0-9,]+)/, pages:[
      'https://pk.khaadi.com/ready-to-wear/?sz=40',
      'https://pk.khaadi.com/unstitched/?sz=40' ] },
  { name:'Sapphire', host:'pk.sapphireonline.pk', group:'md', priceRe:/Rs\.?\s?([0-9,]+)/, pages:[
      'https://pk.sapphireonline.pk/on/demandware.store/Sites-Sapphire-Site/en_PK/Search-UpdateGrid?cgid=rtw-summer-26&start=0&sz=72',
      'https://pk.sapphireonline.pk/on/demandware.store/Sites-Sapphire-Site/en_PK/Search-UpdateGrid?cgid=uns-summer-26&start=0&sz=72' ] },
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
const SIZE_RE = /^(xxs|xs|s|m|l|xl|xxl|xxxl|free\s*size|one\s*size|\d{1,2})$/i;

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
function mapCatKids(s){
  if(/shalwar|kameez|\bkurta\b|frock|lehenga|gharara|ethnic|eastern|abaya/.test(s)) return 'kids_eastern';
  if(/western|jean|denim|trouser|\bpant|\btee\b|t[\s-]?shirt|\bshirt\b|polo|dress|romper|legging|short|jumpsuit|hoodie|sweat/.test(s)) return 'kids_western';
  return 'kids_eastern';
}
// khussa/kolhapuri/peshawari are traditional flats we CAN ship → keep as footwear.
const KHUSSA_RE = /\b(khussa|kolhapuri|peshawari)/;
// Modern shoes we can't ship → dropped from the catalog entirely (return null).
// Word-boundaried so "bootcut"/"sandali" (garment names) are NOT caught as shoes.
const SHOE_RE = /\bshoe|sneaker|\bsandals?\b|chappal|\bheels?\b|slipper|loafer|\bmule\b|footwear|\bpump\b|\bboots?\b|slip[\s-]?on|wedge|stiletto|flip[\s-]?flop/;
const PS_NON_APPAREL = /\b(bed|mattress|\bnet\b|blanket|quilt|pillow|cushion|towel|bottle|feeder|diaper|nappy|\btoy|stroller|pram|\bcomb\b|\bsocks?\b|\bcap\b|\bhat\b|\bbib\b|mitten|booties|booti|headband|hair[\s-]?band|\bbag\b|clutch|purse|wallet|jewel|earring|necklace|\bring\b|bangle|bracelet|brooch|perfume|fragrance|\battar\b|\bwatch\b|sunglass|\bbelt\b|key[\s-]?chain|gift[\s-]?set|hamper|pouch|cufflink)\b/;
// STRONG garment signals — if present, the item is apparel even when its NAME
// contains a shoe/non-apparel word ("Sandali" lawn collection, "Net 3PC" suit).
const GARMENT_SIG = /shirt|kurti|kurta|kameez|\bsuit\b|frock|\bdress\b|gown|abaya|kaftan|trouser|\bpants?\b|\bjeans?\b|denim|shalwar|saree|lehenga|\bcoat\b|jacket|sweater|dupatta|\bmaxi\b|[23][\s-]?(pc|piece|pcs)|un[\s-]?stitch|\blawn\b|cambric|khaddar|karandi|chiffon|organza/;
const BAG_RE = /\bbag|hand[\s-]?bag|clutch|purse|wallet|tote\b|satchel|wristlet|backpack|\bpouch\b/;
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
  // gender from the text — esp. multi-department brands that mix men's & kids in
  if(/\b(boys?|girls?|infant|toddler|junior|newborn|\bbaby\b|\bkid|kids\b)\b/.test(s)) return mapCatKids(s);
  if(group === 'k') return mapCatKids(s);
  if(group === 'm') return mapCatMen(s);
  if(group === 'md' && /\b(mens?|men's|gents?|\bpolo\b|waist[\s-]?coat|sherwani|boxer|\btie\b)\b/.test(s)) return mapCatMen(s);
  return mapCatWomen(tt, tags);
}

// ── Shopify harvest (with one retry so a transient timeout doesn't drop a brand) ──
async function harvestShopify(name, host, group){
  for(let attempt = 1; attempt <= 2; attempt++){
    let raw;
    try{ raw = await get(`https://${host}/products.json?limit=250`); }
    catch(e){ if(attempt < 2){ await sleep(1500); continue; } console.error(`  ✗ ${name} (${host}): ${e.message}`); return []; }
    let j; try{ j = JSON.parse(raw); }catch(e){ if(attempt < 2){ await sleep(1500); continue; } return []; }
    const prods = (j.products||[]).filter(p => p.variants && p.variants.length && p.handle).slice(0, capFor(name));
    const out = prods.map(p => {
      const v0 = p.variants[0];
      const pkr = Math.round(parseFloat(v0 && v0.price) || 0);
      if(pkr < 500) return null;
      const img = (p.images && p.images[0] && p.images[0].src) || '';
      if(!img) return null;
      const tagStr = (Array.isArray(p.tags) ? p.tags.join(' ') : String(p.tags||'')).toLowerCase();
      let cat = mapCat(group, p.product_type, p.title, tagStr);
      if(!cat) return null;   // dropped (e.g. sneakers/heels/bags we can't ship)
      // Festive house with a too-light auto-guess → formal-embroidered weight floor.
      if(FESTIVE_BRANDS.has(name) && (cat === 'pret_3pc' || cat === 'kurti_1pc' || cat === 'pret_3pc_emb')) cat = 'formal_emb_3pc';
      const desc = (p.body_html || '').replace(/<[^>]+>/g, ' ');
      if(isHandmadeFull(cat, desc)) cat = 'handmade_emb';   // only an explicit adda/full-hand description
      let sz = [];
      const sizeOpt = (p.options||[]).find(o => /size/i.test(o.name||o));
      if(sizeOpt && Array.isArray(sizeOpt.values)) sz = sizeOpt.values.filter(x => SIZE_RE.test(String(x).trim())).slice(0, 8);
      if(!sz.length) sz = ['Unstitched'];
      // recency + on-sale signals so the page can surface fresh / discounted items first
      const pub = Math.floor((Date.parse(p.published_at || p.updated_at || p.created_at || '') || 0) / 1000);
      const onSale = (p.variants||[]).some(v => v.compare_at_price && parseFloat(v.compare_at_price) > parseFloat(v.price||0));
      const o = { b:name, t:(p.title||'').slice(0,80), u:`https://${host}/products/${p.handle}`, img, pkr, cat, sz, pub };
      if(onSale) o.sale = 1;
      return o;
    }).filter(Boolean);
    if(out.length || attempt === 2) return out;
    await sleep(1500);   // got 0 usable products → one retry before giving up
  }
  return [];
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
async function harvestSfcc(brand){
  const all = [], seen = new Set();
  for(const page of brand.pages){
    try{
      const html = await get(page);
      parseSfccPage(html, brand.host, brand.group, brand.priceRe).forEach(p => {
        if(seen.has(p.u)) return; seen.add(p.u); p.b = brand.name; all.push(p);
      });
    }catch(e){ console.error(`  ✗ ${brand.name} page: ${e.message}`); }
    await sleep(700);
    if(all.length >= capFor(brand.name)) break;
  }
  return all.slice(0, capFor(brand.name));
}

// ── Collection harvest (Shopify /collections/<handle>/products.json) ──
async function harvestCollectionUrl(name, host, group, force, handle){
  const url = handle === 'ALL'
    ? `https://${host}/products.json?limit=250`
    : `https://${host}/collections/${handle}/products.json?limit=250`;
  let raw; try{ raw = await get(url); }catch(e){ return []; }
  let j; try{ j = JSON.parse(raw); }catch(e){ return []; }
  return (j.products||[]).filter(p => p.variants && p.variants.length && p.handle).map(p => {
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
    else { cat = mapCat(group, p.product_type, p.title, tagStr); }
    if(!cat) return null;
    if(!force && FESTIVE_BRANDS.has(name) && (cat==='pret_3pc'||cat==='kurti_1pc'||cat==='pret_3pc_emb')) cat = 'formal_emb_3pc';
    const desc = (p.body_html || '').replace(/<[^>]+>/g, ' ');
    if(!force && isHandmadeFull(cat, desc)) cat = 'handmade_emb';
    let sz = [];
    const sizeOpt = (p.options||[]).find(o => /size/i.test(o.name||o));
    if(sizeOpt && Array.isArray(sizeOpt.values)) sz = sizeOpt.values.filter(x => SIZE_RE.test(String(x).trim())).slice(0, 8);
    if(!sz.length) sz = ['Unstitched'];
    const pub = Math.floor((Date.parse(p.published_at || p.updated_at || p.created_at || '') || 0) / 1000);
    const onSale = (p.variants||[]).some(v => v.compare_at_price && parseFloat(v.compare_at_price) > parseFloat(v.price||0));
    const o = { b:name, t:(p.title||'').slice(0,80), u:`https://${host}/products/${p.handle}`, img, pkr, cat, sz, pub };
    if(onSale) o.sale = 1;
    return o;
  }).filter(Boolean);
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

(async () => {
  const all = [];
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
  // de-dupe by product URL (a brand's bridal collection overlaps its main feed)
  const seenU = new Set();
  const deduped = all.filter(p => { if(seenU.has(p.u)) return false; seenU.add(p.u); return true; });
  const brands = [...new Set(deduped.map(p => p.b))];
  const out = { updated: new Date().toISOString(), count: deduped.length, brands: brands.length, products: deduped };
  fs.writeFileSync('catalog.json', JSON.stringify(out));
  console.log(`\n✓ catalog.json — ${deduped.length} products from ${brands.length} brands`);
})();
