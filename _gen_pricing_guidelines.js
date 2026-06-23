// _gen_pricing_guidelines.js — emit BRAND-PRICING-GUIDELINES.md from the variant-pricing
// audit (_audit_tmp/variant_audit_full.json). Groups brands by how price relates to choices,
// so future brand additions know the rule. Run: node _gen_pricing_guidelines.js
const fs=require('fs'), path=require('path');
const R=JSON.parse(fs.readFileSync(path.join(__dirname,'_audit_tmp','variant_audit_full.json'),'utf8'));
const comp=R.filter(r=>r.classes&&r.classes.COMPONENT>0).sort((a,b)=>b.classes.COMPONENT-a.classes.COMPONENT);
const sv=R.filter(r=>r.classes&&r.classes.SIZE_VARIES>0&&!(r.classes.COMPONENT>0)).sort((a,b)=>b.classes.SIZE_VARIES-a.classes.SIZE_VARIES);
const notShop=R.filter(r=>r.notShopify);
let tU=0,tS=0,tC=0,tScan=0; R.forEach(r=>{if(r.classes){tU+=r.classes.UNIFORM;tS+=r.classes.SIZE_VARIES;tC+=r.classes.COMPONENT;tScan+=r.scanned;}});
const pct=n=>(100*n/tScan).toFixed(1)+'%';
let md='';
md+='# PakPoshak — Per-Brand PRICING Guidelines\n\n';
md+='> Generated from `_variant_pricing_audit.js` across all live brands. This is the price-integrity\n';
md+='> counterpart to BRAND-CATEGORY-GUIDELINES.md. **Rule of the "first promise": the price shown in\n';
md+='> the order form (and on the Browse card) must equal the brand-page price of the COMPLETE article —\n';
md+='> never a cheap sub-piece — and per-size prices appear on chips ONLY when price truly varies.**\n\n';
md+='## How the app decides (structural, NOT by brand name)\n\n';
md+='Option dimensions are messy across brands ("Type","Item","Stitching"/"Stitchng","Add on","ADD-ON\'S",\n';
md+='"WAISTCOAT WITH KURTA PAJAMA", even "Delivery"). So detection is STRUCTURAL, in `detectOtherDims()`:\n\n';
md+='- A product is **COMPONENT-priced** if it has an option (other than size/colour) whose values carry\n';
md+='  different prices (spread > 1.02×). e.g. Item: Shirt / Pants / Dupatta / **Full Set**.\n';
md+='- The app renders that dimension as a **themed dropdown**, DEFAULTED to the complete article:\n';
md+='  - component-set (Item / "Full Set" / waistcoat combo) → the **MAX-priced** value (= Full Set)\n';
md+='  - stitching/type (Unstitched/Stitched) → matches the product CATEGORY (unstitched cat → Unstitched)\n';
md+='  - add-on ("None"/"Without ...") → the **base** value (no paid upsell)\n';
md+='  - service ("Delivery"/"WhatsApp for customisation") → cheapest, no dropdown shown\n';
md+='- Size chips + per-size prices are then computed WITHIN the chosen value (no cross-component collapse).\n';
md+='- **UNIFORM** products (one price) show NO per-size price on chips. **SIZE_VARIES** (one price per size,\n';
md+='  e.g. kids age-pricing) show the correct per-size price on each chip.\n\n';
md+='## Catalog snapshot ('+R.length+' brands · '+tScan+' products scanned)\n\n';
md+='| Class | Count | Share | Handling |\n|---|---|---|---|\n';
md+='| UNIFORM | '+tU+' | '+pct(tU)+' | one price, no per-size chips |\n';
md+='| SIZE_VARIES | '+tS+' | '+pct(tS)+' | per-size price shown on chips |\n';
md+='| COMPONENT | '+tC+' | '+pct(tC)+' | dropdown, default = complete article |\n\n';
md+='## GROUP A — COMPONENT-priced brands (dropdown, default to full article)\n\n';
md+='These brands sell separable pieces / stitching options / add-ons. The card+form must show the\n';
md+='COMPLETE article price. Verify the default picks the full set after any harvest.\n\n';
md+='| Brand | #COMP | scanned | option dimension(s) | max spread | example |\n|---|---|---|---|---|---|\n';
comp.forEach(r=>{
  const dims=Object.keys(r.otherDimNames||{}).slice(0,4).join(', ')||'(ambiguous size)';
  const ms=Math.max(0,...(r.componentSamples||[]).map(s=>s.spread||0));
  const ex=(r.componentSamples&&r.componentSamples[0])?r.componentSamples[0].t:'';
  md+='| '+r.brand+' | '+r.classes.COMPONENT+' | '+r.scanned+' | '+dims+' | '+ms+'× | '+ex+' |\n';
});
md+='\n### Highest-risk (largest spread — cheapest piece is a tiny fraction of the article)\n\n';
comp.map(r=>({b:r.brand,ms:Math.max(0,...(r.componentSamples||[]).map(s=>s.spread||0)),s:r.componentSamples&&r.componentSamples[0]}))
  .filter(x=>x.ms>=4).sort((a,b)=>b.ms-a.ms).forEach(x=>{
    md+='- **'+x.b+'** — up to '+x.ms+'× (e.g. '+(x.s?(x.s.t+': '+x.s.minP+' → '+x.s.maxP+' PKR'):'')+')\n';
  });
md+='\n## GROUP B — SIZE_VARIES brands (per-size prices are CORRECT — show them)\n\n';
md+='Genuine per-size pricing (mostly kids age-sizing). Chips MUST show each size\'s price; the picked\n';
md+='size drives the total. These are NOT a bug — do not suppress their per-size chips.\n\n';
md+='| Brand | #SIZE_VARIES | scanned |\n|---|---|---|\n';
sv.forEach(r=>{ md+='| '+r.brand+' | '+r.classes.SIZE_VARIES+' | '+r.scanned+' |\n'; });
md+='\n## GROUP C — UNIFORM (everything else)\n\n';
md+='~'+pct(tU)+' of the catalog. One price for all sizes/variants → show plain size chips, no per-size price.\n\n';
md+='## Not Shopify (relay/SFCC path — handled by the dual-form toggle, not this dropdown)\n\n';
md+=(notShop.map(r=>r.brand).join(', ')||'(none)')+'\n\n';
md+='---\n_Regenerate: `node _variant_audit_runner.js 300` then `node _gen_pricing_guidelines.js`._\n';
fs.writeFileSync(path.join(__dirname,'BRAND-PRICING-GUIDELINES.md'), md);
console.log('Wrote BRAND-PRICING-GUIDELINES.md —', comp.length, 'component brands,', sv.length, 'size-varies brands');
