// _variant_audit_report.js — print the aggregate report from variant_audit_full.json
const fs=require('fs'), path=require('path');
const TMPDIR=path.join(__dirname,'_audit_tmp');
const results=JSON.parse(fs.readFileSync(path.join(TMPDIR,'variant_audit_full.json'),'utf8'));
const withComp=results.filter(r=>r.classes&&r.classes.COMPONENT>0).sort((a,b)=>b.classes.COMPONENT-a.classes.COMPONENT);
const withSV=results.filter(r=>r.classes&&r.classes.SIZE_VARIES>0).sort((a,b)=>b.classes.SIZE_VARIES-a.classes.SIZE_VARIES);
const notShopify=results.filter(r=>r.notShopify);
let totU=0,totS=0,totC=0,totScan=0;
results.forEach(r=>{if(r.classes){totU+=r.classes.UNIFORM;totS+=r.classes.SIZE_VARIES;totC+=r.classes.COMPONENT;totScan+=r.scanned;}});
console.log('================ VARIANT-PRICING AUDIT (full, 300/brand) ================');
console.log('brands:',results.length,'| scanned products:',totScan);
console.log('UNIFORM:',totU,'('+(100*totU/totScan).toFixed(1)+'%) | SIZE_VARIES:',totS,'('+(100*totS/totScan).toFixed(1)+'%) | COMPONENT(bug-prone):',totC,'('+(100*totC/totScan).toFixed(1)+'%)');
console.log('');
console.log('---- COMPONENT-PRICED BRANDS (form/card shows cheapest sub-piece; chips collapse) ----');
console.log('brand'.padEnd(22),'COMP'.padStart(5),'scan'.padStart(5),'  %comp  dims / maxSpread');
withComp.forEach(r=>{
  const dims=Object.keys(r.otherDimNames||{}).slice(0,4).join(',')||'(ambiguous-size)';
  const maxSpread=Math.max(0,...(r.componentSamples||[]).map(s=>s.spread||0));
  const pct=(100*r.classes.COMPONENT/Math.max(1,r.scanned)).toFixed(0);
  console.log(r.brand.padEnd(22),String(r.classes.COMPONENT).padStart(5),String(r.scanned).padStart(5),' '+pct.padStart(3)+'%  '+dims+' / '+maxSpread+'x');
});
console.log('');
console.log('---- SIZE_VARIES BRANDS (per-size chips SHOULD show — legit age/size pricing) ----');
console.log('brand'.padEnd(22),'SV'.padStart(5),'scan'.padStart(5));
withSV.forEach(r=>console.log(r.brand.padEnd(22),String(r.classes.SIZE_VARIES).padStart(5),String(r.scanned).padStart(5)));
console.log('');
console.log('---- NOT SHOPIFY (relay/SFCC path) ----');
console.log(notShopify.map(r=>r.brand).join(', ')||'(none)');
console.log('');
// dimension-name frequency across all COMPONENT brands (informs detection, NOT used by fix)
const dimFreq={};
withComp.forEach(r=>Object.entries(r.otherDimNames||{}).forEach(([n,c])=>{dimFreq[n]=(dimFreq[n]||0)+c;}));
console.log('---- price-bearing dimension NAMES seen (messy; fix must use STRUCTURE not names) ----');
console.log(Object.entries(dimFreq).sort((a,b)=>b[1]-a[1]).map(([n,c])=>n+':'+c).join(' | '));
