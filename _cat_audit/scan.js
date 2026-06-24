/* Local catalog audit — reuses audit-categories.js flag() logic on catalog.json,
 * grouped by (cat, flag, brand) so BRAND-WIDE patterns surface. Plus targeted probes
 * for the prompt's 3 genuinely-new angles. Read-only. */
'use strict';
const cat = require('../catalog.json');
const P = cat.products;

// ── reuse the audit flag families ──
const FOOT  = /\bshoes?\b|\bheels?\b|\bsandals?\b|\bslippers?\b|\bslides?\b|sneakers?|\bpumps?\b|\bwedge|\bmule\b|khussa|\bloafer|\bjutt?i\b|kolhapuri|\bchappal|stiletto|espadrille|peshawari|\bmojari|\boxford/i;
const TOPN  = /\bshirt\b|\bkurta\b|\bkurti\b|\btop\b|\btee\b|t-?shirt|\btunic\b|\bblouse\b|\bkameez\b|\bfrock\b|kaftan|\bgown\b|\bmaxi\b|anarkali|\bpolo\b|crew[\s-]?neck|v-?neck/i;
const BOTN  = /\btrousers?\b|\bbottoms?\b|\bpants?\b|palazzo|pallazzo|plazzo|plazo|\bculottes?\b|\bjeggings?\b|\bleggings?\b|cigarette pant|\bcapri\b|\bskirt\b/i;
const DUP   = /\bdupatta\b|\bchunri\b/i;
const isMenStrong = /\bmen'?s\b|\bgents\b|sherwani|kurta ?(pajama|pyjama)|\bdhoti\b/i;
const isWomen = /\bwomen'?s?\b|\bladies\b|\bgirl'?s?\b|frock|kurti|saree|lehenga|abaya|anarkali|gharara|\bblouse\b/i;
const isKidStrong = /\binfants?\b|\btoddler|\bnewborn|\d{1,2}\s*-\s*\d{1,2}\s*y\b|\bromper\b|\bonesie\b/i;
const ONE = /\b1 ?pcs?\b|\b1 ?pieces?\b|single[\s-]?piece|\b1-piece\b/i;
const THREE = /\b3 ?pcs?\b|\b3 ?pieces?\b|three[\s-]?piece/i;
function isFalsePositive(p){const t=(p.t||'');const b=(p.b||'');
  if(/\bbaby (pink|blue|peach|yellow|green|purple|color)/i.test(t))return true;
  if(/soft girl era|desi girl|tap shoe|girl power|midnight|night ?(garden|bloom|star|sky)/i.test(t))return true;
  if(/\bdenim (pants?|jeans?|trousers?)\b/i.test(t))return true;
  if(p.cat==='mens_sherwani'&&/prince ?coat/i.test(t))return true;
  if(/waist ?coat/i.test(t)&&/^(pret_3pc|kurti_1pc|pret_3pc_emb)$/.test(p.cat))return true;
  if(b==='One Kids')return true;
  if((p.cat==='coord_western'||p.cat==='mens_waistcoat')&&/\bwaistcoat\b|poncho|\bcorset\b|bikini|\bjacket\b/i.test(t))return true;
  if(b==='Zainab Chottani'&&/\bcapri\b/i.test(t)&&p.cat==='kaftan')return true;
  return false;}
function flag(p){const t=p.t||'',c=p.cat,out=[];if(isFalsePositive(p))return out;
  const isFoot=c==='footwear',isBottom=/trouser$/.test(c)||c==='womens_trouser'||c==='mens_trouser'||c==='mens_jeans',
    isDup=c==='dupatta_only',isShawl=c==='shawl',isKidCat=/^kids_/.test(c),
    gender=/^mens_/.test(c)?'m':isKidCat?'k':'w';
  if(!isFoot&&FOOT.test(t)&&!TOPN.test(t)&&!BOTN.test(t)&&!/\bsuit\b|kameez|kurta/i.test(t))out.push('FOOTWEAR');
  if(!isBottom&&!isDup&&!isShawl&&!isKidCat&&!/^(coord_western|mens_suit|mens_sherwani)$/.test(c)&&BOTN.test(t)&&!TOPN.test(t)&&!DUP.test(t)&&!/\bsuit\b|[23] ?(pc|piece)|co-?ord/i.test(t))out.push('BOTTOM-ONLY');
  if(gender==='w'&&isMenStrong.test(t)&&!isWomen.test(t))out.push('MEN-IN-WOMEN');
  if(gender==='m'&&isWomen.test(t)&&!isMenStrong.test(t))out.push('WOMEN-IN-MEN');
  if(gender!=='k'&&isKidStrong.test(t))out.push('KID-IN-ADULT');
  if(/_3pc$|3pc_emb|3pc_unstitch|heavy_formal_3pc|formal_emb_3pc/.test(c)&&ONE.test(t)&&!THREE.test(t)&&!/\b2 ?(pc|piece)/i.test(t))out.push('1PC-IN-3PC');
  if(c==='kurti_1pc'&&THREE.test(t))out.push('3PC-IN-KURTI');
  if(c==='kurti_1pc'&&/\btank ?top|\btee\b|t-?shirt|\bblouse\b|camisole|\bpolo\b|crew[\s-]?neck|button[\s-]?(down|up)|\bjacket\b|\bblazer\b|\bskirt\b/i.test(t)&&!/kurta|kameez|kurti|dupatta|shalwar/i.test(t))out.push('WESTERN-IN-KURTI');
  return out;}

// ── 1) flag suspects grouped by cat→flag→brand ──
const g={};let total=0;
for(const p of P){for(const f of flag(p)){total++;const k=p.cat+' | '+f;(g[k]=g[k]||{});g[k][p.b]=(g[k][p.b]||0)+1;}}
console.log('=== SUSPECTS by category | flag → brand (count) ===  total='+total+'\n');
Object.entries(g).sort((a,b)=>Object.values(b[1]).reduce((x,y)=>x+y,0)-Object.values(a[1]).reduce((x,y)=>x+y,0)).forEach(([k,bs])=>{
  const tot=Object.values(bs).reduce((x,y)=>x+y,0);
  const top=Object.entries(bs).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([b,n])=>b+'('+n+')').join(', ');
  console.log(String(tot).padStart(4)+'  '+k.padEnd(40)+'  '+top);
});
