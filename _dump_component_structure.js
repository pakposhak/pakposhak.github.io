// _dump_component_structure.js — for a set of COMPONENT brands, dump the price-bearing
// non-size/non-colour dimension's value->price breakdown so we can design the default rule.
const https=require('https'), zlib=require('zlib');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function getOnce(u){return new Promise((res,rej)=>{const rq=https.get(u,{headers:{'User-Agent':'Mozilla/5.0','Accept-Encoding':'gzip,deflate'}},r=>{if(r.statusCode>=300&&r.statusCode<400&&r.headers.location)return getOnce(new URL(r.headers.location,u).href).then(res,rej);const ch=[];r.on('data',c=>ch.push(c));r.on('end',()=>{let b=Buffer.concat(ch);const e=r.headers['content-encoding'];try{if(e==='gzip')b=zlib.gunzipSync(b);else if(e==='deflate')b=zlib.inflateSync(b);}catch(_){}res({status:r.statusCode,body:b.toString()});});});rq.on('error',rej);rq.setTimeout(20000,()=>rq.destroy(new Error('timeout')));});}
async function get(u){for(let i=0;i<5;i++){const r=await getOnce(u);if(r.status!==429)return r;await sleep(1500*(i+1));}return getOnce(u);}
const rupee=v=>Math.round(parseFloat(v)||0);
const optName=o=>((o&&o.name)||o||'').toString();
const sizeIdx=p=>(p.options||[]).findIndex(o=>/size|age/i.test(optName(o)));
const colourIdx=p=>(p.options||[]).findIndex(o=>/colou?r|shade/i.test(optName(o)));

// brand, host, handle(optional)
const TARGETS=[
  ['Mina Hasan','minahasan.com'],
  ['Sania Maskatiya','pk.saniamaskatiya.com'],
  ['Wardha Saleem','wardhasaleem.com'],
  ['Zainab Chottani','pk.zainabchottani.com'],
  ['Alizeh','alizeh.pk'],
  ['Afrozeh','afrozeh.com'],
  ['Ramsha','ramsha.pk'],
  ['Emaan Adeel','emaanadeel.com'],
  ['Imrozia Premium','imroziapremium.com'],
  ['Humayun Alamgir','humayunalamgir.com'],
  ['Faiza Saqlain','www.faizasaqlain.pk'],
  ['Asifa & Nabeel','asifaandnabeel.pk'],
  ['Erum Khan','erumkhanstores.com'],
  ['Ammara Khan','ammarakhan.com'],
];
(async()=>{
  for(const [brand,host] of TARGETS){
    let r; try{ r=await get('https://'+host+'/products.json?limit=120'); }catch(e){ console.log('##',brand,'FETCH ERR',e.message); continue; }
    let j; try{ j=JSON.parse(r.body);}catch(e){ console.log('##',brand,'parse err',r.status); continue; }
    const prods=(j.products||[]);
    // find first 2 products with a price-bearing non-size/non-colour dim
    let shown=0;
    for(const p of prods){
      if(shown>=2) break;
      const si=sizeIdx(p), ci=colourIdx(p);
      const others=(p.options||[]).map((o,i)=>({o,i})).filter(({o,i})=>i!==si&&i!==ci&&Array.isArray(o.values)&&new Set(o.values).size>=2);
      if(!others.length) continue;
      const av=(p.variants||[]).filter(v=>v&&v.available!==false);
      const use=av.length?av:(p.variants||[]);
      // for each other dim, value->[min,max] price
      const dimReport=others.map(({o,i})=>{
        const k='option'+(i+1); const byVal={};
        use.forEach(v=>{const val=String(v[k]||'').trim();const pr=rupee(v.price);if(pr>0){(byVal[val]=byVal[val]||[]).push(pr);}});
        const vals=Object.entries(byVal).map(([val,arr])=>val+'='+Math.min(...arr)+(Math.max(...arr)!==Math.min(...arr)?('..'+Math.max(...arr)):''));
        return optName(o)+': '+vals.join('  ');
      });
      const allP=use.map(v=>rupee(v.price)).filter(n=>n>0);
      console.log('## '+brand+' :: '+(p.title||'').slice(0,45)+'  (min '+Math.min(...allP)+' max '+Math.max(...allP)+')');
      dimReport.forEach(d=>console.log('     '+d));
      shown++;
    }
    if(!shown) console.log('## '+brand+' :: (no price-bearing other-dim in first 120)');
  }
})();
