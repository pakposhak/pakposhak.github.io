/* resolve-remaining.js — second pass over group3-unsure.json
 *
 * Buckets the 1,986 not-resolved-by-product collections:
 *   - empty collection / HTTP error  → brand's DOMINANT catalog category (brand-index)
 *   - first product is non-clothing   → collection-noise.json (hidden from listing)
 *   - product data also vague         → group3-final.json (Danish decides)
 *
 * Merges the brand-context picks into collection-overrides.json.  Run after
 * classify-vague-collections.js:  node resolve-remaining.js
 */
'use strict';
const fs=require('fs'), path=require('path'), DIR=__dirname;
const CATGROUP={};
['kids_infant','kids_boys_eastern','kids_boys_western','kids_boys_formal','kids_girls_eastern','kids_girls_western','kids_girls_formal'].forEach(k=>CATGROUP[k]='kids');
['mens_kurta','mens_shalwar_kameez','mens_sherwani','mens_waistcoat','mens_suit','mens_shirt','mens_trouser','mens_jeans','mens_unstitched'].forEach(k=>CATGROUP[k]='men');
CATGROUP['footwear']='other';
['abaya','bridal','heavy_formal_3pc','formal_emb_3pc','formal_emb_2pc','handmade_emb','pret_3pc_emb','pret_3pc','pret_2pc_emb','shirt_dupatta_2pc','shirt_trouser_2pc','kurti_1pc','western_top','maxi_dress','kaftan','lehenga','saree','coord_western','loungewear','lawn_3pc_unstitch','unstitch_3pc_emb','shirt_dupatta_2pc_unstitch','shirt_trouser_2pc_unstitch','kurti_1pc_unstitch','winter_3pc_stitch','winter_3pc_unstitch','winter_2pc_stitch','winter_2pc_unstitch','dupatta_only','shawl','womens_trouser'].forEach(k=>CATGROUP[k]='women');

async function main(){
  const overrides=JSON.parse(fs.readFileSync(path.join(DIR,'collection-overrides.json'),'utf8'));
  const g=JSON.parse(fs.readFileSync(path.join(DIR,'group3-unsure.json'),'utf8'));
  let brandIndex={};
  try{ const r=await fetch('https://103.83.91.34.sslip.io/search/brand-index'); const j=await r.json(); brandIndex=j.brands||j; }catch(e){ console.log('brand-index fetch failed'); }

  function brandDominantCat(name){
    const cm=brandIndex[name]; if(!cm) return null;
    let best=null,bn=0;
    for(const k in cm){ const grp=CATGROUP[k]; if(!grp||grp==='other') continue; if((cm[k]||0)>bn){bn=cm[k]; best=k;} }
    return best;
  }

  const noise=[], finalG3=[];
  let ctx=0, noctx=0;
  for(const x of g){
    const key=x.brand+'||'+x.handle;
    if(/^fetch:no products|^fetch:HTTP/.test(x.reason)){
      const dc=brandDominantCat(x.brand);
      if(dc){ overrides[key]=dc; ctx++; }
      else { finalG3.push({...x, note:'empty + brand not in index'}); noctx++; }
    } else if(/non-clothing/.test(x.reason)){
      noise.push(key);
    } else { // product data also vague
      finalG3.push(x);
    }
  }

  fs.writeFileSync(path.join(DIR,'collection-overrides.json'), JSON.stringify(overrides,null,0));
  fs.writeFileSync(path.join(DIR,'collection-noise.json'), JSON.stringify(noise,null,0));
  fs.writeFileSync(path.join(DIR,'group3-final.json'), JSON.stringify(finalG3,null,1));

  console.log('Brand-context resolved (empty/HTTP): '+ctx);
  console.log('Marked non-clothing (hidden)       : '+noise.length);
  console.log('FINAL Group 3 (Danish decides)     : '+finalG3.length+'  ('+noctx+' empty+no-index)');
  console.log('Total overrides now                : '+Object.keys(overrides).length);
}
main().catch(e=>{console.error(e);process.exit(1);});
