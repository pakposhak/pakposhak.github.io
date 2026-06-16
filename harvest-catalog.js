#!/usr/bin/env node
/* PakiPoshak — product catalog harvester
 *
 * Builds catalog.json for the "Browse products" search page. NO live per-search
 * fetching — the page loads this file once and filters client-side.
 *
 * Two source types:
 *   • Shopify brands → /products.json (decimal-rupee price, size option values).
 *   • SFCC brands (Khaadi, Sapphire) → parse category-page / Search-UpdateGrid
 *     product tiles (no /products.json exists).
 *
 * Runs locally now and as the VPS cron in Phase 2 (same file). Prices are the
 * store's base PKR. `sz` is indicative; real in-stock filtering happens when the
 * buyer taps "Add" and the form re-fetches live (.js for Shopify, relay /scrape
 * for SFCC). Category mapping mirrors order-form.html PT_CAT (only drives the
 * filter — cart category is set precisely by the live fetch).
 */
'use strict';
const https = require('https');
const fs    = require('fs');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const PER_BRAND = parseInt(process.env.PER_BRAND || '34', 10);

// ── Shopify brands [name, host, group]  (group: md/w/p → women's cats, m → men, k → kids) ──
const SHOPIFY = [
  ['Almirah','almirah.com.pk','md'],['Breakout','breakout.com.pk','md'],['Diners','diners.com.pk','md'],
  ['Limelight','www.limelight.pk','md'],['Outfitters','outfitters.com.pk','md'],['Leisure Club','leisureclub.pk','md'],
  ['Alizeh','alizeh.pk','w'],['Beechtree','beechtree.pk','w'],['Chinyere','chinyere.pk','w'],
  ['Cross Stitch','www.crossstitch.pk','w'],['ETHNC','pk.ethnc.com','w'],['Farasha','farashaonline.pk','w'],
  ['Generation','generation.com.pk','w'],['Gulaal','gulaal.pk','w'],['Jazmin','jazmin.pk','w'],
  ['Kayseria','kayseria.com.pk','w'],['Lulusar','lulusar.com','w'],['Maria B','mariab.pk','w'],
  ['Mausummery','mausummery.com','w'],['Motifz','motifz.com.pk','w'],['Nureh','nureh.pk','w'],
  ['Ramsha','ramsha.pk','w'],['Salitex','salitexonline.com','w'],['Saya','saya.pk','w'],
  ['Sha Posh','shaposh.pk','w'],['Sitara Studio','sitarastudio.pk','w'],['So Kamal','sokamal.com','w'],
  ['Zarif','zarif.pk','w'],['Zeen (by Cambridge)','zeenwoman.com','w'],['Rang Rasiya','rangrasiya.com.pk','w'],
  ['Charizma','houseofcharizma.com','w'],['Nishat Linen','nishatlinen.com','w'],
  ['Barae Khanom','baraekhanom.pk','p'],['Bareeze','bareezepk.com','p'],['Crimson','www.crimson.com.pk','p'],
  ['Elan','elan.pk','p'],['Emaan Adeel','emaanadeel.com','p'],['Erum Khan','erumkhanstores.com','p'],
  ['Imrozia Premium','imroziapremium.com','p'],['Maryum N Maria','maryumnmaria.com','p'],
  ['Faiza Saqlain','www.faizasaqlain.pk','p'],['Sania Maskatiya','pk.saniamaskatiya.com','p'],
  ['Zaha by Elan','www.zaha.pk','p'],['Zainab Chottani','pk.zainabchottani.com','p'],['Zellbury','zellbury.com','p'],
  ['Bonanza Satrangi','bonanzasatrangi.com','p'],
  ['Charcoal','charcoal.com.pk','m'],['Cougar','cougar.com.pk','m'],['Dynasty Fabrics','dynastyfabrics.com','m'],
  ['Monark','monark.com.pk','m'],['Royal Tag','royaltag.com.pk','m'],['Shahnameh','shahnameh.pk','m'],
  ['Shahzeb Saeed','shahzebsaeed.com','m'],
  ['Minnie Minors','minnieminors.com','k'],['Bachaa Party','bachaaparty.com','k'],['Hopscotch','ilovehopscotch.com','k'],
];

// ── SFCC brands (no /products.json) — parse product tiles from listing pages ──
// NOTE: Sapphire cgids are SEASONAL ("…-summer-26") — update each season.
const SFCC = [
  { name:'Khaadi', host:'pk.khaadi.com', group:'md', priceRe:/PKR\s?([0-9,]+)/, pages:[
      'https://pk.khaadi.com/ready-to-wear/?sz=40',
      'https://pk.khaadi.com/unstitched/?sz=40' ] },
  { name:'Sapphire', host:'pk.sapphireonline.pk', group:'md', priceRe:/Rs\.?\s?([0-9,]+)/, pages:[
      'https://pk.sapphireonline.pk/on/demandware.store/Sites-Sapphire-Site/en_PK/Search-UpdateGrid?cgid=rtw-summer-26&start=0&sz=40',
      'https://pk.sapphireonline.pk/on/demandware.store/Sites-Sapphire-Site/en_PK/Search-UpdateGrid?cgid=uns-summer-26&start=0&sz=40' ] },
];

function get(url){
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers:{ 'User-Agent':UA }, timeout:30000 }, res => {
      if(res.statusCode !== 200){ res.resume(); return reject(new Error('HTTP '+res.statusCode)); }
      let d=''; res.on('data', c => d += c); res.on('end', () => resolve(d));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
function dec(s){ return (s||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'"); }
const SIZE_RE = /^(xxs|xs|s|m|l|xl|xxl|xxxl|free\s*size|one\s*size|\d{1,2})$/i;

// ── category mapping (mirror of order-form PT_CAT) ──
function mapCatWomen(s, tagStr){
  const unstitch = /\bunstitch/.test(tagStr) || /\buns\b/.test(tagStr) || /unstitch/.test(s);
  const emb = /embroid|\bemb\b|chikankari|zari|schiffli|adda/.test(s);
  if(unstitch) return emb ? 'unstitch_3pc_emb' : 'lawn_3pc_unstitch';
  if(/lehenga|gharara|sharara/.test(s)) return 'lehenga';
  if(/\bsaree\b|\bsari\b/.test(s)) return 'saree';
  if(/abaya|jilbab|burqa|niqab/.test(s)) return 'abaya';
  if(/bridal|velvet|wedding|nikah|barat|walima/.test(s)) return 'bridal';
  if(/heavy[\s-]?formal|organza|tissue|jamawar/.test(s)) return 'heavy_formal_3pc';
  if(/formal|chiffon|party[\s-]?wear/.test(s)) return 'formal_emb_3pc';
  if(/night|sleep[\s-]?wear|lounge|pyjama|pajama/.test(s)) return 'loungewear';
  if(emb && /3[\s-]?pc|3[\s-]?piece/.test(s)) return 'pret_3pc_emb';
  if(emb && /2[\s-]?pc|2[\s-]?piece/.test(s)) return 'pret_2pc_emb';
  if(/3[\s-]?pc|3[\s-]?piece|shalwar[\s-]?kameez|\bsuit\b/.test(s)) return 'pret_3pc';
  if(/2[\s-]?pc|2[\s-]?piece|shirt[\s-]?dupatta/.test(s)) return 'shirt_dupatta_2pc';
  if(/trouser|pant|palazzo|plazo|capri|culotte/.test(s) && !/shirt|kurti|kurta|suit/.test(s)) return 'womens_trouser';
  if(/dress|maxi|gown|jumpsuit/.test(s)) return 'maxi_dress';
  if(/kurti|kurta|shirt|top|tee|tunic/.test(s)) return 'kurti_1pc';
  return 'pret_3pc';
}
function mapCatMen(s){
  if(/sherwani|prince/.test(s)) return 'mens_sherwani';
  if(/waist[\s-]?coat|nehru/.test(s)) return 'mens_waistcoat';
  if(/unstitch|fabric|suiting|wash[\s-]?n?[\s-]?wear|gabardine/.test(s)) return 'mens_unstitched';
  if(/pant[\s-]?coat|coat[\s-]?pant|blazer|tuxedo|2[\s-]?pc[\s-]?suit|3[\s-]?pc[\s-]?suit|formal[\s-]?suit/.test(s)) return 'mens_suit';
  if(/shalwar|kameez|kurta[\s-]?(shalwar|pajama|pyjama)/.test(s)) return 'mens_shalwar_kameez';
  if(/jeans|denim/.test(s)) return 'mens_jeans';
  if(/trouser|chino|cargo/.test(s)) return 'mens_trouser';
  if(/polo|t[\s-]?shirt|\btee\b/.test(s)) return 'mens_shirt';
  if(/kurta|kameez/.test(s)) return 'mens_kurta';
  if(/shirt/.test(s)) return 'mens_shirt';
  if(/suit/.test(s)) return 'mens_shalwar_kameez';
  return 'mens_kurta';
}
function mapCatKids(s){
  if(/western|jean|trouser|\btee\b|t[\s-]?shirt|dress|frock|romper|legging|short/.test(s)) return 'kids_western';
  return 'kids_eastern';
}
function mapCat(group, type, title, tagStr){
  const s = ((type||'') + ' ' + (title||'') + ' ' + (tagStr||'')).toLowerCase();
  if(group === 'm') return mapCatMen(s);
  if(group === 'k') return mapCatKids(s);
  return mapCatWomen(s, tagStr);
}

// ── Shopify harvest ──
function harvestShopify(name, host, group){
  return get(`https://${host}/products.json?limit=250`).then(raw => {
    let j; try{ j = JSON.parse(raw); }catch(e){ return []; }
    const prods = (j.products||[]).filter(p => p.variants && p.variants.length && p.handle).slice(0, PER_BRAND);
    return prods.map(p => {
      const v0 = p.variants[0];
      const pkr = Math.round(parseFloat(v0 && v0.price) || 0);
      if(pkr < 500) return null;
      const img = (p.images && p.images[0] && p.images[0].src) || '';
      if(!img) return null;
      const tagStr = (Array.isArray(p.tags) ? p.tags.join(' ') : String(p.tags||'')).toLowerCase();
      const cat = mapCat(group, p.product_type, p.title, tagStr);
      let sz = [];
      const sizeOpt = (p.options||[]).find(o => /size/i.test(o.name||o));
      if(sizeOpt && Array.isArray(sizeOpt.values)) sz = sizeOpt.values.filter(x => SIZE_RE.test(String(x).trim())).slice(0, 8);
      if(!sz.length) sz = ['Unstitched'];
      return { b:name, t:(p.title||'').slice(0,80), u:`https://${host}/products/${p.handle}`, img, pkr, cat, sz };
    }).filter(Boolean);
  }).catch(e => { console.error(`  ✗ ${name} (${host}): ${e.message}`); return []; });
}

// ── SFCC harvest (parse product tiles) ──
function slugToName(href){
  const m = href.match(/\/([a-z0-9-]+)\/[A-Za-z0-9_-]+\.html/);
  if(!m) return '';
  return m[1].replace(/-/g,' ').replace(/\b\w/g, c => c.toUpperCase());
}
function parseSfccPage(html, host, group, priceRe){
  const out=[], seen=new Set();
  const blocks = html.split(/class="product-tile"/);
  for(let k=1;k<blocks.length;k++){
    const seg = blocks[k].slice(0,4000);
    const pid = (seg.match(/data-(?:productid|pid)="([^"]+)"/)||[])[1];
    if(!pid || seen.has(pid)) continue;
    const href = (seg.match(/href="((?:https?:\/\/[^"]+|\/[^"]+)\.html)/)||[])[1];
    const img  = (seg.match(/data-(?:large-0|medium-0)="(https:\/\/[^"?]+)/)||seg.match(/data-src="(https:\/\/[^"?]+)/)||[])[1];
    const price= (seg.match(priceRe)||[])[1];
    let name   = (seg.match(/class="[^"]*(?:pdp-link|product-name|tile-name|name-link)[^"]*"[^>]*>\s*(?:<a[^>]*>)?\s*([^<]{3,90})/i)||[])[1];
    const pkr  = price ? parseInt(price.replace(/,/g,'')) : 0;
    if(!pid || !href || !img || pkr < 500) continue;
    seen.add(pid);
    if(!name) name = slugToName(href) || 'Product';
    const url = dec(href.startsWith('http') ? href : 'https://'+host+href);
    const title = dec(name).slice(0,80);
    const cat = mapCat(group, '', title, '');
    const sz = /unstitch/i.test(title) ? ['Unstitched'] : ['XS','S','M','L'];
    out.push({ b:'', t:title, u:url, img:dec(img), pkr, cat, sz });
  }
  return out;
}
async function harvestSfcc(brand){
  const all = [], seen = new Set();
  for(const page of brand.pages){
    try{
      const html = await get(page);
      parseSfccPage(html, brand.host, brand.group, brand.priceRe).forEach(p => {
        if(seen.has(p.u)) return; seen.add(p.u); p.b = brand.name; all.push(p);
      });
    }catch(e){ console.error(`  ✗ ${brand.name} page: ${e.message}`); }
    await sleep(700);
    if(all.length >= PER_BRAND) break;
  }
  return all.slice(0, PER_BRAND);
}

(async () => {
  const all = [];
  for(const [name, host, group] of SHOPIFY){
    process.stdout.write(`• ${name} … `);
    const items = await harvestShopify(name, host, group);
    console.log(`${items.length}`);
    all.push(...items);
    await sleep(700);
  }
  for(const brand of SFCC){
    process.stdout.write(`• ${brand.name} (SFCC) … `);
    const items = await harvestSfcc(brand);
    console.log(`${items.length}`);
    all.push(...items);
  }
  const brands = [...new Set(all.map(p => p.b))];
  const out = { updated: new Date().toISOString(), count: all.length, brands: brands.length, products: all };
  fs.writeFileSync('catalog.json', JSON.stringify(out));
  console.log(`\n✓ catalog.json — ${all.length} products from ${brands.length} brands`);
})();
