// _verify_component_logic.js — deterministically verify the component-pricing fix's CORE
// logic (detectOtherDims / defaultOptValue / avail-filter / refVar / sizePrice / priceVaries)
// against LIVE product data. Mirrors the exact source added to app.src.js. Proves the
// form price == complete article (never a cheap sub-piece) and chips are per-component.
const https=require('https'), zlib=require('zlib');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function getOnce(u){return new Promise((res,rej)=>{const rq=https.get(u,{headers:{'User-Agent':'Mozilla/5.0','Accept-Encoding':'gzip,deflate'}},r=>{if(r.statusCode>=300&&r.statusCode<400&&r.headers.location)return getOnce(new URL(r.headers.location,u).href).then(res,rej);const ch=[];r.on('data',c=>ch.push(c));r.on('end',()=>{let b=Buffer.concat(ch);const e=r.headers['content-encoding'];try{if(e==='gzip')b=zlib.gunzipSync(b);else if(e==='deflate')b=zlib.inflateSync(b);}catch(_){}res({status:r.statusCode,body:b.toString()});});});rq.on('error',rej);rq.setTimeout(20000,()=>rq.destroy(new Error('timeout')));});}
async function get(u){for(let i=0;i<5;i++){const r=await getOnce(u);if(r.status!==429)return r;await sleep(1500*(i+1));}return getOnce(u);}

// ---- mirrors of the shipped source ----
const UNSTITCHED_CATS = new Set(['lawn_3pc_unstitch','unstitch_3pc_emb','winter_3pc_unstitch','unstitch_1pc','unstitch_2pc','fabric']);
const _OPT_SERVICE_RE=/deliver|whats\s*app|whatsapp|customi[sz]|stitch.*time|ready.*in|call|contact|availab/i;
const _OPT_ADDON_RE=/\b(none|without|no\b)/i;
const optName=o=>((o&&o.name)||o||'').toString();
function normSizeFull(raw){ const s=String(raw||'').trim(); if(!s) return null;
  if(/^(xxs|xs|s|m|l|xl|2xl|3xl|xxl|xxxl|free\s*size|one\s*size)$/i.test(s)) return s.toUpperCase();
  if(/^\d{1,2}\s*[-\/]?\s*\d{0,2}\s*(y|yr|years?|m|mo|months?)?$/i.test(s)) return s; return null; }
function detectOtherDims(normOpts, vars, sizeIdxAll, colourIdx){
  const out=[];
  normOpts.forEach((o,idx)=>{ if(sizeIdxAll.includes(idx)||idx===colourIdx) return;
    const key='option'+(idx+1);
    const valSet=new Set(vars.map(v=>String(v[key]||'').trim()).filter(Boolean)); if(valSet.size<2) return;
    const minByVal={}; vars.forEach(v=>{const val=String(v[key]||'').trim();const p=parseFloat(v.price)||0;if(!val||p<=0)return;if(minByVal[val]==null||p<minByVal[val])minByVal[val]=p;});
    const mins=Object.values(minByVal); if(mins.length<2) return;
    const spread=Math.max(...mins)/Math.min(...mins); if(spread<=1.02) return;
    const kind=_OPT_SERVICE_RE.test(o.name)?'service':'component';
    out.push({key,idx,name:o.name,values:[...valSet],minByVal,kind}); });
  return out;
}
function _maxPricedValue(dim){let hi=dim.values[0],hiP=dim.minByVal[hi]||0;dim.values.forEach(v=>{const p=dim.minByVal[v]||0;if(p>hiP){hiP=p;hi=v;}});return hi;}
function defaultOptValue(dim,cat){
  if(dim.kind==='service'){let lo=dim.values[0],loP=dim.minByVal[lo]!=null?dim.minByVal[lo]:Infinity;dim.values.forEach(v=>{const p=dim.minByVal[v];if(p!=null&&p<loP){loP=p;lo=v;}});return lo;}
  if(dim.values.some(v=>/stitch/i.test(v))){const unst=dim.values.find(v=>/un[\s-]?stitch/i.test(v));const st=dim.values.find(v=>/stitch/i.test(v)&&!/un[\s-]?stitch/i.test(v));if(cat&&UNSTITCHED_CATS.has(cat)&&unst)return unst;return st||_maxPricedValue(dim);}
  const base=dim.values.find(v=>_OPT_ADDON_RE.test(v)); if(base)return base;
  return _maxPricedValue(dim);
}
// variantLabel: size (+colour) label per pickDims
function variantLabel(v,pickDims){ return pickDims.map(d=>String(v[d.key]||'').trim()).filter(Boolean).join(' / '); }

function simulate(product, cat){
  const moneyOf=v=>(parseFloat(v)||0)/100; // .js endpoint = paisa
  const opts=product.options||[];
  const normOpts=opts.map(o=>typeof o==='string'?{name:o,values:[]}:o);
  let sizeIdxAll=normOpts.map((o,i)=>/size|age/i.test(optName(o))?i:-1).filter(i=>i>=0);
  const sizeKey=sizeIdxAll.length?'option'+(sizeIdxAll[0]+1):null;
  const colourIdx=normOpts.findIndex(o=>/colou?r|shade/i.test(optName(o)));
  let vars=product.variants||[];
  let avail=vars.filter(v=>v.available);
  if(!avail.length) avail=vars.slice();
  const otherDims=detectOtherDims(normOpts,vars,sizeIdxAll,colourIdx);
  const otherSel={};
  otherDims.forEach(dim=>{ otherSel[dim.idx]=defaultOptValue(dim,cat);
    const f=avail.filter(v=>String(v[dim.key]||'').trim()===otherSel[dim.idx]); if(f.length) avail=f; });
  // pickDims = colour(if≥2)+size
  const pickDims=[]; const colourKey=colourIdx>=0?'option'+(colourIdx+1):null;
  const colourVals=colourKey?new Set(avail.map(v=>(v[colourKey]||'').trim()).filter(Boolean)):new Set();
  if(colourKey&&colourVals.size>=2) pickDims.push({key:colourKey,isSize:false});
  sizeIdxAll.forEach(i=>pickDims.push({key:'option'+(i+1),isSize:true}));
  const _ap=avail.filter(v=>moneyOf(v.price)>0);
  const refVar=_ap.length?_ap.reduce((lo,v)=>moneyOf(v.price)<moneyOf(lo.price)?v:lo):(avail[0]||vars[0]);
  const sizePrice={}; avail.forEach(v=>{const l=variantLabel(v,pickDims);if(l&&sizePrice[l]==null)sizePrice[l]=moneyOf(v.price);});
  const priceVaries=new Set(Object.values(sizePrice).map(p=>Math.round(p))).size>1;
  return { otherDims:otherDims.map(d=>({name:d.name,kind:d.kind,default:otherSel[d.idx]})),
    formPrice:refVar?Math.round(moneyOf(refVar.price)):0, priceVaries,
    chipPrices:Object.fromEntries(Object.entries(sizePrice).map(([k,v])=>[k,Math.round(v)])) };
}

const CASES=[
  ['Mina Hasan modern-baroque','https://minahasan.com/products/modern-baroque.js','pret_3pc'],
  ['Ego misty 2pc','https://wearego.com/products/ks0459-ll0-misty-2-piece-little-ego.js','kids_girls_eastern'],
  ['Eminent boys kameez (size-varies)','https://eminent.pk/products/boys-plain-shalwar-kameez-eminent-a2330590306.js','kids_boys_eastern'],
  ['Alizeh Type (unstitched cat)','https://alizeh.pk/products/af-ch-2025-surkh.js','lawn_3pc_unstitch'],
  ['Wardha Saleem Ayezel','https://wardhasaleem.com/products/ayezel.js','pret_3pc'],
  ['Humayun prince coat','https://humayunalamgir.com/products/teal-green-floral-embroidered-prince-coat.js','mens_shalwar_kameez'],
];
(async()=>{
  for(const [name,u,cat] of CASES){
    let r; try{ r=await get(u);}catch(e){ console.log('##',name,'FETCH ERR',e.message); continue; }
    let p; try{ p=JSON.parse(r.body);}catch(e){ console.log('##',name,'parse err',r.status); continue; }
    const s=simulate(p,cat);
    console.log('## '+name);
    console.log('   otherDims:', JSON.stringify(s.otherDims));
    console.log('   FORM PRICE (PKR):', s.formPrice, '| priceVaries:', s.priceVaries);
    console.log('   chip prices:', JSON.stringify(s.chipPrices));
    console.log('');
  }
})();
