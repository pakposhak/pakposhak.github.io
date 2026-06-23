// _variant_pricing_audit.js — detect PRICE-INTEGRITY defects across a Shopify brand.
// Mirrors production buildProduct()/fetchProductData(): size = option matching /size|age/,
// colour = /colou?r|shade/. Classifies every product by how price relates to the choices a
// buyer can make. Usage: node _variant_pricing_audit.js "Brand" host [limit] -> one JSON line.
//
// FAILURE MODES this finds:
//  - COMPONENT  : a single size maps to >1 price (hidden price-bearing dimension like
//                 "Item: Shirt/Pants/Dupatta/Full Set", "Stitching Type", "Add Dupatta").
//                 The cheapest-variant card/form price UNDERSTATES the article and the
//                 per-size chips collapse across that dimension -> wrong prices. (Mina Hasan)
//  - SIZE_VARIES: prices differ but every size has exactly ONE price (legit kids age-pricing).
//                 Per-size chips are CORRECT and SHOULD show.
//  - UNIFORM    : every available variant the same price. No per-size chips needed. (Ego/Eminent)
const https = require('https'), zlib = require('zlib');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function getOnce(u){
  return new Promise((res, rej) => {
    const req = https.get(u, { headers:{ 'User-Agent':'Mozilla/5.0','Accept-Encoding':'gzip,deflate' } }, r => {
      if (r.statusCode>=300 && r.statusCode<400 && r.headers.location) return getOnce(new URL(r.headers.location,u).href).then(res,rej);
      const ch=[]; r.on('data',c=>ch.push(c));
      r.on('end',()=>{ let b=Buffer.concat(ch); const e=r.headers['content-encoding'];
        try{ if(e==='gzip') b=zlib.gunzipSync(b); else if(e==='deflate') b=zlib.inflateSync(b);}catch(_){}
        res({status:r.statusCode, body:b.toString()}); });
    });
    req.on('error',rej); req.setTimeout(20000,()=>req.destroy(new Error('timeout')));
  });
}
// Retry on 429 (rate-limit) with exponential backoff.
async function get(u){
  for(let i=0;i<5;i++){
    const r=await getOnce(u);
    if(r.status!==429) return r;
    await sleep(1500*(i+1)+Math.floor(Math.random()*800));
  }
  return getOnce(u);
}
const rupee = v => Math.round(parseFloat(v)||0);
const optName = o => ((o && o.name) || o || '').toString();
function sizeIdx(p){ return (p.options||[]).findIndex(o => /size|age/i.test(optName(o))); }
function colourIdx(p){ return (p.options||[]).findIndex(o => /colou?r|shade/i.test(optName(o))); }
// other dims = options that are neither size nor colour and have >=2 distinct values
function otherDims(p){
  const si=sizeIdx(p), ci=colourIdx(p);
  return (p.options||[]).map((o,i)=>({o,i})).filter(({o,i}) =>
    i!==si && i!==ci && Array.isArray(o.values) && new Set(o.values).size>=2)
    .map(({o,i})=>({name:optName(o), idx:i, values:o.values.slice(0,8)}));
}

function classify(p){
  const si=sizeIdx(p);
  const sizeKey = si>=0 ? 'option'+(si+1) : null;
  // available set (fallback all if none available — oversell brands)
  const all=(p.variants||[]);
  let av=all.filter(v=>v && v.available!==false);
  if(!av.length) av=all.slice();
  const priced=av.filter(v=>rupee(v.price)>0);
  if(!priced.length) return null;
  const prices=priced.map(v=>rupee(v.price));
  const minP=Math.min(...prices), maxP=Math.max(...prices);
  const distinct=new Set(prices);
  const others=otherDims(p);
  // size -> set of distinct prices
  const sizeMap={};
  if(sizeKey){ priced.forEach(v=>{ const s=String(v[sizeKey]||'').trim(); if(!s)return; (sizeMap[s]=sizeMap[s]||new Set()).add(rupee(v.price)); }); }
  const ambiguousSizes=Object.entries(sizeMap).filter(([s,set])=>set.size>1).map(([s])=>s);
  const ambiguous = ambiguousSizes.length>0;
  // is an other-dim price-bearing? (price varies across its values, ignoring size/colour)
  let priceBearingOther=[];
  others.forEach(d=>{
    const k='option'+(d.idx+1);
    const byVal={};
    priced.forEach(v=>{ const val=String(v[k]||'').trim(); (byVal[val]=byVal[val]||new Set()).add(rupee(v.price)); });
    // does the dim's value correlate with price? compare avg price across values
    const vals=Object.keys(byVal);
    const valMin={}; vals.forEach(val=>valMin[val]=Math.min(...byVal[val]));
    const spread=Math.max(...Object.values(valMin))/Math.min(...Object.values(valMin));
    if(spread>1.05) priceBearingOther.push({name:d.name, spread:+spread.toFixed(2), values:d.values});
  });
  let cls;
  if(distinct.size===1) cls='UNIFORM';
  else if(ambiguous || priceBearingOther.length) cls='COMPONENT';
  else cls='SIZE_VARIES';
  return { cls, minP, maxP, spread:+(maxP/minP).toFixed(2), nVariants:all.length,
    nOpts:(p.options||[]).length, hasSize:si>=0, others:others.map(d=>d.name),
    priceBearingOther, ambiguousSizes:ambiguousSizes.slice(0,6),
    sizeValues: sizeKey? [...new Set(priced.map(v=>String(v[sizeKey]||'').trim()))].slice(0,10):[] };
}

(async()=>{
  const brand=process.argv[2], host=process.argv[3], LIMIT=+(process.argv[4]||300);
  const out={ brand, host, scanned:0, classes:{UNIFORM:0,SIZE_VARIES:0,COMPONENT:0},
    componentSamples:[], sizeVariesSamples:[], otherDimNames:{}, error:null, notShopify:false };
  try{
    for(let pg=1; pg<=Math.ceil(LIMIT/250)+1 && out.scanned<LIMIT; pg++){
      let r; try{ r=await get('https://'+host+'/products.json?limit=250&page='+pg); }
      catch(e){ out.error='fetch:'+e.message; break; }
      if(r.status===404 || r.status===403){ out.notShopify=true; out.error='status '+r.status; break; }
      if(r.status!==200){ out.error='status '+r.status; break; }
      let j; try{ j=JSON.parse(r.body); }catch(e){ out.notShopify=true; out.error='parse'; break; }
      if(!j.products || !j.products.length) break;
      for(const p of j.products){
        if(!(p.variants && p.variants.length)) continue;
        const c=classify(p); if(!c) continue;
        if(c.minP<500) continue;
        out.scanned++; out.classes[c.cls]++;
        c.others.forEach(n=>{ out.otherDimNames[n]=(out.otherDimNames[n]||0)+1; });
        if(c.cls==='COMPONENT' && out.componentSamples.length<8)
          out.componentSamples.push({ u:'https://'+host+'/products/'+p.handle, t:(p.title||'').slice(0,50),
            minP:c.minP, maxP:c.maxP, spread:c.spread, others:c.others, priceBearingOther:c.priceBearingOther, ambiguousSizes:c.ambiguousSizes });
        if(c.cls==='SIZE_VARIES' && out.sizeVariesSamples.length<4)
          out.sizeVariesSamples.push({ u:'https://'+host+'/products/'+p.handle, t:(p.title||'').slice(0,50), minP:c.minP, maxP:c.maxP, sizes:c.sizeValues });
      }
      if(j.products.length<250) break;
    }
  }catch(e){ out.error=(out.error||'')+' top:'+e.message; }
  console.log(JSON.stringify(out));
})();
