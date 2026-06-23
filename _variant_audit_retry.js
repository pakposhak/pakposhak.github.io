// _variant_audit_retry.js — re-audit only the brands that errored/0-scanned (429s),
// gently (low concurrency), merge into variant_audit_full.json, reprint the report.
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const TMPDIR = path.join(__dirname, '_audit_tmp');
const MAP = JSON.parse(fs.readFileSync(path.join(TMPDIR,'brandhost.json'),'utf8'));
const SCRIPT = path.join(__dirname, '_variant_pricing_audit.js');
const LIMIT = process.argv[2] || '300';
const FULL = path.join(TMPDIR,'variant_audit_full.json');
let results = JSON.parse(fs.readFileSync(FULL,'utf8'));
const byBrand = Object.fromEntries(results.map(r=>[r.brand,r]));
const todo = results.filter(r => (r.error && r.scanned===0) && !r.notShopify).map(r=>r.brand);

function audit(brand, host){
  return new Promise(res => {
    execFile(process.execPath, [SCRIPT, brand, host, LIMIT], { maxBuffer:1<<24, timeout:240000 }, (err,stdout)=>{
      try{ res(JSON.parse(stdout.trim().split('\n').pop())); }
      catch(e){ res({ brand, host, error:'retry:'+(err?err.message:e.message), classes:{UNIFORM:0,SIZE_VARIES:0,COMPONENT:0}, scanned:0 }); }
    });
  });
}
(async()=>{
  const q=[...todo]; let done=0;
  async function worker(){
    while(q.length){
      const b=q.shift(); const h=MAP[b];
      const r=await audit(b,h);
      byBrand[b]=r; done++;
      process.stderr.write(`\r[retry ${done}/${todo.length}] ${b.slice(0,20).padEnd(20)} scanned=${r.scanned}   `);
    }
  }
  await Promise.all(Array.from({length:3}, worker)); // gentle
  process.stderr.write('\n');
  results = Object.values(byBrand);
  fs.writeFileSync(FULL, JSON.stringify(results,null,0));
  const stillErr = results.filter(r=>r.error && r.scanned===0 && !r.notShopify);
  console.log('retried', todo.length, '| still-errored:', stillErr.length);
  console.log(stillErr.map(r=>r.brand+' ('+r.error+')').join(', ')||'(none)');
})();
