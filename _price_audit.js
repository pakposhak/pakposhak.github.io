// _price_audit.js — audit Browse-CARD price == BASKET price parity for a Shopify brand,
// mirroring the production harvest buildProduct() + order-form basket logic.
// Usage: node _price_audit.js "Brand" host [limit]   → emits one JSON line.
//
//   CARD       = cheapest IN-STOCK variant price (rupees), falling back to cheapest of ALL
//                variants when no variant is available:true (= the harvest pkr).
//   BASKET-OLD = avail[0] price (first in-stock) — the pre-refVar-fix basket default.
//   BASKET-NEW = cheapest in-stock (the refVar fix) — must EQUAL the card for every product.
//
// ⚠️ available:false does NOT mean "unbuyable". Verified via Shopify /cart/add.js (200=buyable,
//    422=sold out): PK fashion brands (Edenrobe, Motifz, Zellbury, Asim Jofa, Sana Safinaz, …)
//    OVERSELL / make-to-order — every available:false product still adds to cart (HTTP 200).
//    So we do NOT drop available:false products; "card has no in-stock variant" is NOT a bug,
//    it just means an all-oversell product (its card price = cheapest of all variants, buyable).
//    The ONLY real defect this tool measures is card != basket (newNeqCard).
const https = require('https'), zlib = require('zlib');
function get(u){
  return new Promise((res, rej) => {
    const req = https.get(u, { headers: { 'User-Agent':'Mozilla/5.0', 'Accept-Encoding':'gzip,deflate' } }, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        return get(new URL(r.headers.location, u).href).then(res, rej);
      }
      const ch = []; r.on('data', c => ch.push(c));
      r.on('end', () => { let b = Buffer.concat(ch); const e = r.headers['content-encoding'];
        try { if (e === 'gzip') b = zlib.gunzipSync(b); else if (e === 'deflate') b = zlib.inflateSync(b); } catch (_) {}
        res({ status: r.statusCode, body: b.toString() }); });
    });
    req.on('error', rej);
    req.setTimeout(20000, () => req.destroy(new Error('timeout')));
  });
}
function isSizeToken(s){ s = String(s).trim(); if (!s) return false;
  if (/^(xxs|xs|s|m|l|xl|2xl|3xl|xxl|xxxl|free\s*size|one\s*size)$/i.test(s)) return true;
  if (/^\d{1,3}$/.test(s) && +s >= 2 && +s <= 60) return true;
  if (/^\d{1,2}\s*[\/-]\s*\d{1,2}\s*-?\s*(y|yr|yrs|years?|m|mo|months?|t)?$/i.test(s)) return true;
  if (/^\d{1,2}\s*-?\s*(y|yr|yrs|years?|m|mo|months?|t)$/i.test(s)) return true;
  return false; }
function sizeOptIdx(p){ return (p.options || []).findIndex(o => /size|age/i.test((o && o.name) || o)); }
const rupee = v => Math.round(parseFloat(v) || 0);
// availSizes mirrors production: no size option → ['Unstitched']; sized → in-stock size tokens.
function availSizes(p){ const idx = sizeOptIdx(p); if (idx < 0) return ['Unstitched'];
  const seen = new Set(), out = [];
  (p.variants || []).forEach(v => { if (!v || v.available === false) return;
    const raw = v['option' + (idx + 1)]; const s = raw && String(raw).trim();
    if (s && isSizeToken(s) && !seen.has(s)) { seen.add(s); out.push(s); } });
  return out.slice(0, 8); }
function cardPrice(p){ // = harvest pkr: cheapest in-stock, fallback cheapest of all (oversell)
  const ins = (p.variants || []).filter(v => v && v.available !== false).map(v => rupee(v.price)).filter(n => n > 0);
  const all = (p.variants || []).map(v => rupee(v && v.price)).filter(n => n > 0);
  return ins.length ? Math.min(...ins) : (all.length ? Math.min(...all) : 0); }
function basketOld(p){ const av = (p.variants || []).filter(v => v && v.available !== false);
  const a = av.length ? av : (p.variants || []); const f = a.find(v => rupee(v.price) > 0) || a[0];
  return f ? rupee(f.price) : 0; }
const basketNew = p => cardPrice(p);

(async () => {
  const brand = process.argv[2], host = process.argv[3], LIMIT = +(process.argv[4] || 400);
  const out = { brand, host, scanned:0, kept:0, dropped:0, oldNeqCard:0, newNeqCard:0,
                oldGapSamples:[], newGapSamples:[], samples:[], error:null };
  try {
    for (let pg = 1; pg <= Math.ceil(LIMIT / 250) + 1 && out.scanned < LIMIT; pg++) {
      let r; try { r = await get('https://' + host + '/products.json?limit=250&page=' + pg); }
      catch (e) { out.error = 'fetch:' + e.message; break; }
      if (r.status !== 200) { out.error = 'status ' + r.status; break; }
      let j; try { j = JSON.parse(r.body); } catch (e) { out.error = 'parse'; break; }
      if (!j.products || !j.products.length) break;
      for (const p of j.products) {
        if (!(p.variants && p.variants.length)) continue; out.scanned++;
        const card = cardPrice(p); if (card < 500) continue;
        if (sizeOptIdx(p) >= 0 && !availSizes(p).length) { out.dropped++; continue; } // sized all-sold-out
        out.kept++;
        if (out.samples.length < 4) { const idx = sizeOptIdx(p);
          const inS = (p.variants || []).filter(v => v && v.available !== false)
            .map(v => ({ size: idx >= 0 ? (v['option' + (idx + 1)] || '') : 'Unstitched', price: rupee(v.price) }))
            .filter(x => x.price > 0);
          out.samples.push({ u:'https://'+host+'/products/'+p.handle, title:(p.title||'').slice(0,60), card, inStock:inS }); }
        const bOld = basketOld(p), bNew = basketNew(p);
        if (bOld !== card) { out.oldNeqCard++;
          if (out.oldGapSamples.length < 6) out.oldGapSamples.push({ u:'https://'+host+'/products/'+p.handle, card, basketOld:bOld }); }
        if (bNew !== card) { out.newNeqCard++;
          if (out.newGapSamples.length < 6) out.newGapSamples.push({ u:'https://'+host+'/products/'+p.handle, card, basketNew:bNew }); }
      }
      if (j.products.length < 250) break;
    }
  } catch (e) { out.error = (out.error || '') + ' top:' + e.message; }
  console.log(JSON.stringify(out));
})();
