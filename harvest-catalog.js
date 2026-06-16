#!/usr/bin/env node
/* PakiPoshak — product catalog harvester
 *
 * Crawls each brand's public Shopify product feed (/products.json) and writes a
 * compact catalog.json that the "Browse products" search page loads and filters
 * client-side. NO live per-search fetching → fast, and gentle on the brand sites.
 *
 * Runs in two homes from the SAME file:
 *   • locally (sample) :  node harvest-catalog.js  → writes ./catalog.json
 *   • VPS (Phase 2)    :  nightly cron, output served by Caddy as catalog.json
 *
 * Notes:
 *   - /products.json gives DECIMAL-rupee prices and the size OPTION values, but
 *     NOT per-variant stock (the .json feed has no `available`). So `sz` here is
 *     INDICATIVE; the real in-stock filtering happens when the buyer taps "Add"
 *     and the form re-fetches the product .js live. Good enough for discovery.
 *   - SFCC brands (Khaadi, Sapphire) have no /products.json → skipped here; they
 *     need the relay /scrape (a later add).
 *   - Category mapping below MIRRORS order-form.html PT_CAT — keep roughly in
 *     sync. Exactness isn't critical: it only drives the catalog FILTER; the cart
 *     category is set precisely by the live fetch on Add.
 */
'use strict';
const https = require('https');
const fs    = require('fs');

// Top Shopify brands (native PKR). Expand freely — unreachable ones are skipped.
const BRANDS = [
  ['Almirah','almirah.com.pk'], ['Beechtree','beechtree.pk'], ['Limelight','www.limelight.pk'],
  ['Cross Stitch','www.crossstitch.pk'], ['Generation','generation.com.pk'], ['Maria B','mariab.pk'],
  ['Gulaal','gulaal.pk'], ['Lulusar','lulusar.com'], ['Nishat Linen','nishatlinen.com'],
  ['Zellbury','zellbury.com'], ['Bonanza Satrangi','bonanzasatrangi.com'], ['Kayseria','kayseria.com.pk'],
  ['Saya','saya.pk'], ['Mausummery','mausummery.com'], ['So Kamal','sokamal.com'],
  ['Ramsha','ramsha.pk'], ['Charizma','houseofcharizma.com'], ['Alizeh','alizeh.pk'],
  ['Jazmin','jazmin.pk'], ['Sha Posh','shaposh.pk'],
];

const PER_BRAND = parseInt(process.env.PER_BRAND || '40', 10);   // products kept per brand
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

function get(url){
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers:{ 'User-Agent':UA, 'Accept':'application/json' }, timeout:25000 }, res => {
      if(res.statusCode !== 200){ res.resume(); return reject(new Error('HTTP '+res.statusCode)); }
      let d=''; res.on('data', c => d += c); res.on('end', () => resolve(d));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── category mapping (compact mirror of order-form PT_CAT; women's focus) ──
function mapCat(type, title, tagStr){
  const s = ((type||'') + ' ' + (title||'') + ' ' + (tagStr||'')).toLowerCase();
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

const SIZE_RE = /^(xxs|xs|s|m|l|xl|xxl|xxxl|free\s*size|one\s*size|\d{1,2})$/i;

function harvest(name, host){
  return get(`https://${host}/products.json?limit=250`).then(raw => {
    let j; try{ j = JSON.parse(raw); }catch(e){ return []; }
    const prods = (j.products||[]).filter(p => p.variants && p.variants.length && p.handle).slice(0, PER_BRAND);
    return prods.map(p => {
      const v0 = p.variants[0];
      const pkr = Math.round(parseFloat(v0 && v0.price) || 0);
      if(pkr < 500) return null;            // drop payment-links / samples / junk entries
      const img = (p.images && p.images[0] && p.images[0].src) || '';
      if(!img) return null;
      const tagStr = (Array.isArray(p.tags) ? p.tags.join(' ') : String(p.tags||'')).toLowerCase();
      const cat = mapCat(p.product_type, p.title, tagStr);
      // indicative sizes from the size option's values (stock-filtered later, live)
      let sz = [];
      const opts = p.options || [];
      const sizeOpt = opts.find(o => /size/i.test(o.name||o));
      if(sizeOpt && Array.isArray(sizeOpt.values)) sz = sizeOpt.values.filter(x => SIZE_RE.test(String(x).trim())).slice(0, 8);
      if(!sz.length) sz = ['Unstitched'];
      return { b:name, t:(p.title||'').slice(0,80), u:`https://${host}/products/${p.handle}`, img, pkr, cat, sz };
    }).filter(Boolean);
  }).catch(e => { console.error(`  ✗ ${name} (${host}): ${e.message}`); return []; });
}

(async () => {
  const all = [];
  for(const [name, host] of BRANDS){
    process.stdout.write(`• ${name} … `);
    const items = await harvest(name, host);
    console.log(`${items.length} products`);
    all.push(...items);
    await sleep(700);                       // gentle — avoid bot challenges
  }
  const out = { updated: new Date().toISOString(), count: all.length, products: all };
  fs.writeFileSync('catalog.json', JSON.stringify(out));
  console.log(`\n✓ catalog.json written — ${all.length} products from ${BRANDS.length} brands`);
})();
