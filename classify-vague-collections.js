/* classify-vague-collections.js
 *
 * For every GENUINELY-VAGUE brand collection (a season/line name with no category
 * signal in its title), fetch ONE real product from the brand's Shopify store, read
 * its product_type + tags, and classify the WHOLE collection into one of our 46 real
 * categories — using the SAME classifier as brand-map.html (keep in sync).
 *
 *   Output: collection-overrides.json  { "Brand||handle": "category_key" }
 *           group3-unsure.json          [ {brand,handle,title,host,reason,...} ]
 *
 * Resumable: re-run to retry only the not-yet-resolved ones. Run:  node classify-vague-collections.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const BRAND_INDEX_URL = 'https://103.83.91.34.sslip.io/search/brand-index';
const OUT_OVERRIDES = path.join(DIR, 'collection-overrides.json');
const OUT_GROUP3    = path.join(DIR, 'group3-unsure.json');
const CONCURRENCY = 10;
const REQ_TIMEOUT = 12000;

// ── CATEGORY GROUPS (key → women|men|kids|other) ───────────────────────────────
const CATGROUP = {};
['kids_infant','kids_boys_eastern','kids_boys_western','kids_boys_formal','kids_girls_eastern','kids_girls_western','kids_girls_formal'].forEach(k=>CATGROUP[k]='kids');
['mens_kurta','mens_shalwar_kameez','mens_sherwani','mens_waistcoat','mens_suit','mens_shirt','mens_trouser','mens_jeans','mens_unstitched'].forEach(k=>CATGROUP[k]='men');
CATGROUP['footwear']='other';
['abaya','bridal','heavy_formal_3pc','formal_emb_3pc','formal_emb_2pc','handmade_emb','pret_3pc_emb','pret_3pc','pret_2pc_emb','shirt_dupatta_2pc','shirt_trouser_2pc','kurti_1pc','western_top','maxi_dress','kaftan','lehenga','saree','coord_western','loungewear','lawn_3pc_unstitch','unstitch_3pc_emb','shirt_dupatta_2pc_unstitch','shirt_trouser_2pc_unstitch','kurti_1pc_unstitch','winter_3pc_stitch','winter_3pc_unstitch','winter_2pc_stitch','winter_2pc_unstitch','dupatta_only','shawl','womens_trouser'].forEach(k=>CATGROUP[k]='women');
const VALID = new Set(Object.keys(CATGROUP));

let brandIndex = null;  // {BrandName: {cat:count}}

// ── CLASSIFIER — verbatim from brand-map.html (keep in sync) ────────────────────
function classifyWomenCat(s, tags){
  tags = tags || ''; const both = s + ' ' + tags;
  const stitched = /\bpret\b|\bstitched\b|ready[\s-]?to[\s-]?wear|\brtw\b/.test(s);
  const unstitch = !stitched && (/\bunstitch/.test(both) || /\buns\b/.test(tags) || /\b(un[\s-]?stitch(?:ed)?)\b/.test(s) || /\bunstiched\b/.test(s));
  const emb = /embroid|\bemb\b|chikankari|zari|schiffli|adda/.test(both);
  const two   = /\b2[\s-]?(pc|piece|pcs)\b/.test(s);
  const three = /\b3[\s-]?(pc|piece|pcs)\b/.test(s);
  if(/\bshawl\b|pashmina|\bstole\b|chadar|chaddar|chaadar|dhussa|\bloi\b/.test(s)) return 'shawl';
  if(/\bdupatta\b|\bscarf\b/.test(s) && !/shirt|kurti|kurta|kameez|suit|[23][\s-]?(pc|piece)|trouser|bottom/.test(s)) return 'dupatta_only';
  if(/\bsarees?\b|\bsaris?\b/.test(s)) return 'saree';
  if(/lehenga|gharara|sharara/.test(s)) return 'lehenga';
  if(/abaya|jilbab|burqa|niqab|niqaab|\bhijab\b|khimar|\bnaqab\b/.test(s)) return 'abaya';
  if(/kaftan|kaftaan|caftan/.test(s)) return 'kaftan';
  if(/\bbridal\b|dulhan|dulha|\bbride\b/.test(s)) return 'bridal';
  if(/mehndi|mayon|mayun|dholki|sangeet|\bbaraat?\b|barat|walima|valima|\bshaadi\b|\bshadi\b|nikk?ah/.test(s)) return 'heavy_formal_3pc';
  if(/\bwinter\b|khaddar|khadar|karandi|\bwool|woolen|velvet|marina|corduroy/.test(both)){
    if(two) return unstitch ? 'winter_2pc_unstitch' : 'winter_2pc_stitch';
    return unstitch ? 'winter_3pc_unstitch' : 'winter_3pc_stitch';
  }
  if(/\btank\b|crop[\s-]?top|t[\s-]?shirt|\btee\b|camisole|\bcami\b|western[\s-]?top|halter|\bbodysuit\b|hoodie|sweat\s?shirt|\bsweater\b|jumper|\bpullover\b|cardigan/.test(s)
     && !/kurti|kurta|kameez|\bsuit\b|dupatta|[23][\s-]?(pc|piece)|trouser|shalwar/.test(s)) return 'western_top';
  if(/heavy[\s-]?formal|organza|tissue|jamawar/.test(s)) return 'heavy_formal_3pc';
  if(/\bformal\b|party[\s-]?wear/.test(s)){ if(unstitch) return 'unstitch_3pc_emb'; return two ? 'formal_emb_2pc' : 'formal_emb_3pc'; }
  if(/night|sleep[\s-]?wear|lounge|loungewear|pyjama|pajama|\bnighty\b/.test(s)) return 'loungewear';
  if(three || /(shalwar|trouser|pant|bottom|gharara)[\s\w]*dupatta|dupatta[\s\w]*(shalwar|trouser|pant|bottom)/.test(s)){
    if(unstitch) return emb ? 'unstitch_3pc_emb' : 'lawn_3pc_unstitch';
    return emb ? 'pret_3pc_emb' : 'pret_3pc';
  }
  if(two || /shirt[\s-]?dupatta|(shirt|kameez|kurti)[\s\w]{0,10}dupatta/.test(s)){
    if(emb && !unstitch) return 'pret_2pc_emb';
    const coord = /co[\s-]?ord|coord|(shirt|kameez)[\s\w]{0,10}(trouser|pant|shalwar)|(trouser|pant|shalwar)[\s\w]{0,10}(shirt|kameez)/.test(s);
    if(coord) return unstitch ? 'shirt_trouser_2pc_unstitch' : 'shirt_trouser_2pc';
    return unstitch ? 'shirt_dupatta_2pc_unstitch' : 'shirt_dupatta_2pc';
  }
  if(/shalwar[\s-]?kameez|kameez[\s-]?shalwar|(shirt|kurti|kurta|kameez)\b[\s\w]{0,12}\b(trouser|bottom|pant|shalwar)\b|\b(trouser|bottom|pant|shalwar)\b[\s\w]{0,12}\b(shirt|kurti|kurta|kameez)\b/.test(s)){
    if(emb && !unstitch) return 'pret_2pc_emb';
    return unstitch ? 'shirt_trouser_2pc_unstitch' : 'shirt_trouser_2pc';
  }
  if(/\bsuit\b/.test(s)){ if(unstitch) return emb ? 'unstitch_3pc_emb' : 'lawn_3pc_unstitch'; return emb ? 'pret_3pc_emb' : 'pret_3pc'; }
  if(/co[\s-]?ord|coord/.test(s)) return unstitch ? 'shirt_trouser_2pc_unstitch' : 'coord_western';
  if(/trouser|pant|palazzo|plazo|capri|culotte|tights|leggings?|\bjeans?\b|\bdenim\b|\bskirt\b|\bshorts?\b|\bbottoms?\b/.test(s) && !/shirt|kurti|kurta|kameez/.test(s)) return 'womens_trouser';
  if(/dress|maxi|gown|jumpsuit|\bfrock\b|anarkali/.test(s) && !unstitch) return 'maxi_dress';
  if(/kurti|kurta|shirt|tunic|\bcape\b|\btop\b|peplum|blouse/.test(s)) return unstitch ? 'kurti_1pc_unstitch' : 'kurti_1pc';
  if(/\blawn\b|cambric|voile|khaddar|karandi|fabric|piece[\s-]?goods/.test(s)) return stitched ? 'pret_3pc' : (emb ? 'unstitch_3pc_emb' : 'lawn_3pc_unstitch');
  return unstitch ? 'lawn_3pc_unstitch' : 'pret_3pc';
}
const PT_CAT_MEN=[
  [/sherwani|prince[\s-]?coat/i,'mens_sherwani'],
  [/waist[\s-]?coat|nehru[\s-]?jacket/i,'mens_waistcoat'],
  [/unstitch|fabric|suiting|wash[\s-]?n?[\s-]?wear|gabardine/i,'mens_unstitched'],
  [/pant[\s-]?coat|coat[\s-]?pant|blazer|2[\s-]?pc[\s-]?suit|formal[\s-]?suit|tuxedo|3[\s-]?pc[\s-]?suit/i,'mens_suit'],
  [/shalwar[\s-]?kameez|kameez[\s-]?shalwar|shalwar[\s-]?suit|kurta[\s-]?shalwar|kurta[\s-]?pajama/i,'mens_shalwar_kameez'],
  [/jeans|denim/i,'mens_jeans'],
  [/trouser|chino|cargo[\s-]?pant/i,'mens_trouser'],
  [/polo|t[\s-]?shirt/i,'mens_shirt'],
  [/kurta|kameez/i,'mens_kurta'],
  [/shirt/i,'mens_shirt'],
  [/suit/i,'mens_shalwar_kameez'],
];
function mapPtToCatMen(pt){ const s=(pt||'').toLowerCase(); for(const[re,c] of PT_CAT_MEN){ if(re.test(s)) return c; } return ''; }
function brandKidGender(name){
  const cm=brandIndex&&brandIndex[name];
  if(cm){
    const g=(cm.kids_girls_eastern||0)+(cm.kids_girls_western||0)+(cm.kids_girls_formal||0);
    const b=(cm.kids_boys_eastern||0)+(cm.kids_boys_western||0)+(cm.kids_boys_formal||0);
    if(g||b) return g>=b ? 'girls' : 'boys';
  }
  return 'girls';
}
function brandPrimaryDept(name){
  const cm=brandIndex&&brandIndex[name]; if(!cm) return 'women';
  let k=0,w=0,m=0;
  for(const key in cm){ const g=CATGROUP[key]; if(!g) continue; const n=cm[key]||0; if(g==='kids')k+=n; else if(g==='men')m+=n; else w+=n; }
  if(m>=w && m>=k && m>0) return 'men';
  if(k>w && k>=m && k>0) return 'kids';
  return 'women';
}
function brandMenDefault(name){
  const cm=brandIndex&&brandIndex[name];
  if(cm){ const shirt=cm.mens_shirt||0; const kurta=(cm.mens_kurta||0)+(cm.mens_shalwar_kameez||0); if(shirt>kurta && shirt>0) return 'mens_shirt'; }
  return 'mens_kurta';
}
function classifyMen(s, brandName){
  const c=mapPtToCatMen(s); if(c) return c;
  if(/unstitch|fabric|suiting/.test(s)) return 'mens_unstitched';
  if(/\bshirt\b/.test(s)) return 'mens_shirt';
  if(/\btee\b|t\s?shirt|polo|hoodie|sweat|pullover|jersey|jumper|cardigan|\bupper\b|\btops?\b/.test(s)) return 'mens_shirt';
  if(/trouser|chino|\bpant|\bbottoms?\b|pajama|pyjama/.test(s)) return 'mens_trouser';
  return brandMenDefault(brandName);
}
// Routing — mirrors collToOurCatKey but on a pre-built string (from product data).
function classifyFromString(raw, col, brandName){
  const sect=(col&&col.s)||[], kid=(col&&col.k)||'';
  let s=(raw||'').toLowerCase().replace(/[+&\/\\|]/g,' ').replace(/\bun[\s-]?stitch/g,'unstitch');
  if(sect.includes('unstitched')) s+=' unstitched';
  if(sect.includes('formal'))     s+=' formal';
  if(sect.includes('western'))    s+=' western';
  if(kid==='infant') s+=' infant'; if(kid==='girls') s+=' girls'; if(kid==='boys') s+=' boys';
  const sl=s;
  const isKids = (col&&col.d==='kids') || !!kid || /\b(kids?|boys?|girls?|infant|toddler|newborn|baby|junior|teen|child|children)\b/.test(sl);
  if(isKids){
    if(kid==='infant' || /\binfant\b|new[\s-]?born|\btoddler\b|baby[\s-]?(boy|girl|wear|set|frock|suit|romper)|\bromper\b/.test(sl)) return 'kids_infant';
    const g = (kid==='girls'||/\bgirls?\b/.test(sl)) ? 'girls' : (kid==='boys'||/\bboys?\b/.test(sl)) ? 'boys' : brandKidGender(brandName);
    if(sect.includes('formal') || /\bformal\b|\bparty\b|festive|\beid\b|ceremon|wedding|\bgown\b|sherwani|waist[\s-]?coat/.test(sl)) return 'kids_'+g+'_formal';
    if(sect.includes('western')|| /\btee\b|t[\s-]?shirt|\bpolo\b|jean|denim|trouser|\bpant|short|legging|tights|jogger|hoodie|sweat|jacket|\bwestern\b|\bskirt\b/.test(sl)) return 'kids_'+g+'_western';
    return 'kids_'+g+'_eastern';
  }
  const isMen = (col&&col.d==='men') ||
    /(^|[\s\/_-])(men|mens|man|gents|gentlemen|male|groom|dulha)([\s\/_-]|$)/.test(sl) ||
    /sherwani|waist[\s-]?coat|prince[\s-]?coat|kurta[\s-]?pajama|\bthobe\b|\bthoub\b|\bjubba\b|kandora|kandura/.test(sl);
  if(isMen) return classifyMen(s, brandName);
  const womenWord = /(^|[\s\/_-])(women|womens|woman|ladies|female)([\s\/_-]|$)/.test(sl);
  if(!womenWord && brandPrimaryDept(brandName)==='men'
     && !/abaya|niqab|jilbab|hijab|saree|sari|lehenga|gharara|sharara|kaftan|kurti|frock|maxi|gown|\bdupatta\b|blouse|bridal|lawn|unstitch|\b2\s?pc\b|\b3\s?pc\b|2\s?piece|3\s?piece|kameez/.test(sl))
    return classifyMen(s, brandName);
  return classifyWomenCat(s, sect.join(' '));
}

// ── NOISE + VAGUE detection (mirror brand-map.html) ─────────────────────────────
const NOISE_RE=/\b(furniture|sofa|chair|table|cushion|curtain|carpet|rug|lamp|decor|candle|bedsheet|pillow|comforter|mattress|toy|toys|teddy|puzzle|game|games|doll|belt|belts|bag|bags|purse|wallet|clutch|handbag|tote|satchel|perfume|fragrance|cologne|attar|deodorant|jewellery|jewelry|necklace|earring|earrings|bracelet|bangle|bangles|makeup|cosmetic|lipstick|foundation|skincare|sunscreen|electronic|phone|mobile|gadget|laptop|stationery|diary|planner|supplement|vitamin|protein|umbrella|sunglasses|spectacle|eyewear|watches|cap|caps|scrunchie|scrunchies|cufflink|cufflinks|undergarment|undergarments|lingerie|turban|turbans|potli|body\s*mist|slides|pumps|nail|mascara|kohl|liner|blush|concealer|primer|palette|lashes|lash|serum|toner|moisturiser|moisturizer|diffuser|incense|room\s*spray|home\s*decor|throw|runner|acne|ageing|aging|brightening|scarring|wrinkle|cleanser|exfoliat|micellar|niacinamide|retinol|sunblock|body\s*wash|face\s*wash|hair\s*oil|shampoo|conditioner|grooming|\bbeard\b|shaving|swimwear|swimsuit|bikini|burkini|gift\s*card|e-?gift|\bvoucher\b|gift\s*box|gift\s*hamper|bundle\s*builder|tasbeeh|tasbih|janamaz|prayer\s*mat|miswak|\bsocks?\b|\bgloves?\b|keychain|\bmug\b)\b/i;
const SHOES_RE=/\b(sneaker|sneakers|boot|boots|heel|heels|loafer|loafers|moccasin|moccasins|slipper|slippers|stiletto|stilettos|wedge|wedges|pump)\b/i;
const KEEP_FOOT=/\b(khussa|chappal|kulapuri|kolhapuri|khusa|khusse)\b/i;
function isNoise(txt){ txt=(txt||'').toLowerCase(); if(NOISE_RE.test(txt))return true; if(SHOES_RE.test(txt)&&!KEEP_FOOT.test(txt))return true; return false; }
// "STRONG" = any category/garment/fabric/occasion/gender signal. Absence ⇒ vague.
const STRONG=/abaya|niqab|hijab|jilbab|burqa|makhna|khimar|saree|\bsari\b|lehenga|gharara|sharara|kaftan|dupatta|shawl|pashmina|stole|chadar|chaddar|bridal|dulhan|mehndi|barat|walima|shaadi|nikkah|nikah|mayun|dholki|sangeet|sherwani|prince\s?coat|waist\s?coat|\bvest\b|\bkurta\b|kameez|shalwar|\bjeans?\b|denim|trouser|\bpant|palazzo|plazo|capri|culotte|tights|legging|\bskirt\b|\bshorts?\b|\bbottoms?\b|kurti|tunic|\bmaxi\b|\bgown\b|frock|anarkali|peshwas|jumpsuit|\bdress|\bsuit\b|2\s?pc|3\s?pc|1\s?pc|2\s?piece|3\s?piece|unstitch|\bfabric\b|\blawn\b|cambric|voile|khaddar|karandi|marina|chiffon|organza|tissue|jamawar|georgette|silk|cotton|linen|velvet|\bnet\b|formal|party|festive|\beid\b|\bwinter\b|summer|spring|autumn|\btee\b|t\s?shirt|polo|hoodie|sweat|jumper|pullover|cardigan|blouse|\btop\b|co\s?ord|coord|lounge|pajama|pyjama|night|sleep|infant|new\s?born|\bbaby\b|romper|toddler|\bboys?\b|\bgirls?\b|\bkids?\b|junior|\bteen|\bmen\b|\bmens\b|\bman\b|\bwomen|ladies|embroider|thobe|jubba|kandora|\bpret\b|stitched|ready\s?to\s?wear|\brtw\b|outerwear|jacket|coat|capsule|essentials|basics|core/i;
const GENERIC_TYPE=/^$|^(clothing|apparel|default|default\s*title|products?|collection|new|new\s*arrivals?|summer|winter|spring|autumn|sale|featured|all|home|misc|other)$/i;

// ── FETCH ───────────────────────────────────────────────────────────────────────
async function fetchProduct(host, handle){
  const url = `https://${host}/collections/${encodeURIComponent(handle)}/products.json?limit=1`;
  const ctrl = new AbortController();
  const timer = setTimeout(()=>ctrl.abort(), REQ_TIMEOUT);
  try{
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent':'Mozilla/5.0 (PakPoshak categorizer)', 'Accept':'application/json' } });
    if(!r.ok) return { err:'HTTP '+r.status };
    const ct = r.headers.get('content-type')||'';
    if(!/json/.test(ct)) return { err:'non-json ('+ct.split(';')[0]+')' };
    const j = await r.json();
    const p = j && j.products && j.products[0];
    if(!p) return { err:'no products' };
    return { type:p.product_type||'', title:p.title||'', tags:Array.isArray(p.tags)?p.tags.join(' '):(p.tags||''), img:(p.images&&p.images[0]&&p.images[0].src)||'' };
  }catch(e){ return { err: e.name==='AbortError'?'timeout':e.message }; }
  finally{ clearTimeout(timer); }
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main(){
  const data = JSON.parse(fs.readFileSync(path.join(DIR,'brand-map-data.json'),'utf8'));
  process.stdout.write('Fetching brand-index… ');
  try{ const r=await fetch(BRAND_INDEX_URL); const j=await r.json(); brandIndex=j.brands||j; console.log('ok ('+Object.keys(brandIndex).length+' brands)'); }
  catch(e){ brandIndex={}; console.log('FAILED ('+e.message+') — brand-skew defaults disabled'); }

  // Build the vague work-list
  const work=[];
  for(const b of data.brands){
    if(!b.host) continue;
    for(const c of (b.cols||[])){
      const t=(c.t||'');
      if(isNoise((c.h||'')+' '+t)) continue;
      if(STRONG.test(t)) continue;     // already confidently classified by title
      work.push({brand:b.name, host:b.host, handle:c.h, title:t, col:{s:c.s,k:c.k,d:c.d,h:c.h,t:c.t}});
    }
  }
  console.log('Vague collections to resolve: '+work.length);

  // Resume
  let overrides={}, group3=[];
  if(fs.existsSync(OUT_OVERRIDES)){ try{ overrides=JSON.parse(fs.readFileSync(OUT_OVERRIDES,'utf8')); }catch(e){} }
  const done=new Set(Object.keys(overrides));
  const todo=work.filter(w=>!done.has(w.brand+'||'+w.handle));
  console.log('Already resolved: '+done.size+' · remaining: '+todo.length+'\n');

  let i=0, ok=0, g3=0, fail=0;
  const stats={};
  async function worker(){
    while(i<todo.length){
      const w=todo[i++];
      const r=await fetchProduct(w.host, w.handle);
      const key=w.brand+'||'+w.handle;
      if(r.err){
        group3.push({brand:w.brand,handle:w.handle,title:w.title,host:w.host,reason:'fetch:'+r.err});
        fail++;
      } else {
        const signal=(r.type+' '+r.tags);
        if(isNoise(r.type+' '+r.title+' '+r.tags)){
          group3.push({brand:w.brand,handle:w.handle,title:w.title,host:w.host,reason:'product looks non-clothing',type:r.type,img:r.img});
          g3++;
        } else if(GENERIC_TYPE.test(r.type.trim()) && !STRONG.test(signal)){
          group3.push({brand:w.brand,handle:w.handle,title:w.title,host:w.host,reason:'product data also vague',type:r.type,tags:r.tags.slice(0,80),img:r.img});
          g3++;
        } else {
          const cat=classifyFromString(r.type+' '+r.tags+' '+r.title, w.col, w.brand);
          if(VALID.has(cat)){ overrides[key]=cat; stats[cat]=(stats[cat]||0)+1; ok++; }
          else { group3.push({brand:w.brand,handle:w.handle,title:w.title,host:w.host,reason:'invalid cat '+cat,type:r.type,img:r.img}); g3++; }
        }
      }
      const n=ok+g3+fail;
      if(n%100===0){
        fs.writeFileSync(OUT_OVERRIDES, JSON.stringify(overrides,null,0));
        fs.writeFileSync(OUT_GROUP3, JSON.stringify(group3,null,1));
        console.log(`  ${n}/${todo.length}  resolved=${ok} group3=${g3} failed=${fail}`);
      }
    }
  }
  await Promise.all(Array.from({length:CONCURRENCY},()=>worker()));

  fs.writeFileSync(OUT_OVERRIDES, JSON.stringify(overrides,null,0));
  fs.writeFileSync(OUT_GROUP3, JSON.stringify(group3,null,1));
  const dist=Object.entries(stats).sort((a,b)=>b[1]-a[1]);
  console.log('\n══════════ DONE ══════════');
  console.log('resolved → override : '+ok);
  console.log('group 3 (unsure)    : '+g3);
  console.log('fetch failed        : '+fail);
  console.log('total overrides file: '+Object.keys(overrides).length);
  console.log('\nTop categories assigned:');
  dist.slice(0,20).forEach(([k,n])=>console.log('  '+k+': '+n));
}
main().catch(e=>{ console.error('FATAL', e); process.exit(1); });
