// _variant_audit_runner.js — run _variant_pricing_audit.js across ALL brands concurrently,
// aggregate, and print a ranked report. Reads /tmp/brandhost.json.
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const TMPDIR = path.join(__dirname, '_audit_tmp');
const MAP = JSON.parse(fs.readFileSync(path.join(TMPDIR,'brandhost.json'),'utf8'));
const SCRIPT = path.join(__dirname, '_variant_pricing_audit.js');
const LIMIT = process.argv[2] || '300';

function audit(brand, host){
  return new Promise(res => {
    execFile(process.execPath, [SCRIPT, brand, host, LIMIT], { maxBuffer: 1<<24, timeout: 120000 }, (err, stdout) => {
      try { res(JSON.parse(stdout.trim().split('\n').pop())); }
      catch(e){ res({ brand, host, error: 'runner:'+(err?err.message:e.message), classes:{UNIFORM:0,SIZE_VARIES:0,COMPONENT:0}, scanned:0 }); }
    });
  });
}

(async () => {
  const brands = Object.entries(MAP);
  const results = [];
  const q = [...brands];
  let done = 0;
  async function worker(){
    while(q.length){
      const [b,h] = q.shift();
      const r = await audit(b,h);
      results.push(r);
      done++;
      process.stderr.write(`\r[${done}/${brands.length}] ${b.slice(0,20).padEnd(20)}`);
    }
  }
  await Promise.all(Array.from({length:8}, worker));
  process.stderr.write('\n');
  fs.writeFileSync(path.join(TMPDIR,'variant_audit_full.json'), JSON.stringify(results,null,0));

  // ---- aggregate report ----
  const withComp = results.filter(r => (r.classes && r.classes.COMPONENT>0)).sort((a,b)=>b.classes.COMPONENT-a.classes.COMPONENT);
  const withSizeVaries = results.filter(r => (r.classes && r.classes.SIZE_VARIES>0)).sort((a,b)=>b.classes.SIZE_VARIES-a.classes.SIZE_VARIES);
  const errored = results.filter(r => r.error && r.scanned===0);
  const notShopify = results.filter(r => r.notShopify);

  let totU=0,totS=0,totC=0,totScan=0;
  results.forEach(r=>{ if(r.classes){ totU+=r.classes.UNIFORM; totS+=r.classes.SIZE_VARIES; totC+=r.classes.COMPONENT; totScan+=r.scanned;} });

  console.log('================ VARIANT-PRICING AUDIT (limit '+LIMIT+'/brand) ================');
  console.log('brands:', results.length, '| scanned products:', totScan);
  console.log('UNIFORM:', totU, '| SIZE_VARIES:', totS, '| COMPONENT(bug-prone):', totC);
  console.log('');
  console.log('---- BRANDS WITH COMPONENT-PRICED PRODUCTS (form/card shows cheapest sub-piece) ----');
  console.log('brand'.padEnd(22), 'COMPONENT'.padStart(9), 'scanned'.padStart(8), '  otherDims / maxSpread');
  withComp.forEach(r=>{
    const dims = Object.keys(r.otherDimNames||{}).join(',') || '(ambiguous-size)';
    const maxSpread = Math.max(0, ...(r.componentSamples||[]).map(s=>s.spread||0));
    console.log(r.brand.padEnd(22), String(r.classes.COMPONENT).padStart(9), String(r.scanned).padStart(8), '  '+dims+' / '+maxSpread+'x');
  });
  console.log('');
  console.log('---- BRANDS WITH SIZE_VARIES PRODUCTS (per-size chips SHOULD show; legit age-pricing) ----');
  console.log('brand'.padEnd(22), 'SIZE_VARIES'.padStart(11), 'scanned'.padStart(8));
  withSizeVaries.forEach(r=>{
    console.log(r.brand.padEnd(22), String(r.classes.SIZE_VARIES).padStart(11), String(r.scanned).padStart(8));
  });
  console.log('');
  console.log('---- NOT SHOPIFY / NO products.json (SFCC or other; audited via relay path) ----');
  console.log(notShopify.map(r=>r.brand).join(', ') || '(none)');
  console.log('');
  console.log('---- ERRORED (0 scanned) ----');
  errored.filter(r=>!r.notShopify).forEach(r=>console.log(r.brand.padEnd(22), r.host, '::', r.error));
  console.log('');
  console.log('Full JSON -> _audit_tmp/variant_audit_full.json');
})();
