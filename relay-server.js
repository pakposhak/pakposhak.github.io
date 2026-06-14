// PakStyle BD — Pakistan Price Relay
// Runs on a Pakistan-IP VPS. The order form calls this when a brand geo-serves
// a foreign currency (USD) to a Bangladesh buyer; because THIS server's IP is
// Pakistani, Shopify serves it real PKR prices + stock.
//
// API:   GET /price?url=<full product URL>   → { ok, currency, product }
//        GET /health                          → { ok: true }
// product is the raw Shopify /products/{handle}.js JSON (paisa prices,
// per-variant "available" flags) — same shape the form already parses.
//
// Zero dependencies — needs only Node.js 18+ (built-in fetch).
// Run:   node relay-server.js          (listens on 127.0.0.1:8787)
// Front with Caddy/Cloudflare for HTTPS — the form is served over HTTPS and
// browsers block mixed-content HTTP calls.

'use strict';
const http = require('http');

const PORT = process.env.PORT || 8787;
const CACHE_TTL_MS = 10 * 60 * 1000;   // 10 min — fresh enough for stock/price
const FETCH_TIMEOUT_MS = 15000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// Mirror of BRAND_MAP domains in order-form.html — the relay refuses any
// other host so it can never be abused as an open proxy. Keep in sync when
// adding brands to the form.
const ALLOWED_HOSTS = [
  'pk.sapphireonline.pk','sapphireonline.pk','crossstitch.pk','generation.com.pk',
  'generation.pk','outfitters.com.pk','beechtree.pk','breakout.com.pk','diners.com.pk',
  'monark.com.pk','shahnameh.pk','nureh.pk','alizeh.pk','jazmin.pk','limelight.pk',
  'baraekhanom.pk','laam.pk','almirah.com.pk','khaadi.com','pk.khaadi.com',
  'gulahmedshop.com','gulahmed.com','bonanzasatrangi.com','mariab.com','mariab.pk',
  'sanasafinaz.com','nishatlinen.com','pk.ethnc.com','ethnc.com','asimjofa.com',
  'baroque.com','baroque.com.pk','elan.com','elan.pk','farahtalibaziz.com',
  'farahtalibaziz.com.pk','mtjonline.com','uniworthshop.com','edenrobe.com','mushq.com',
  'afrozeh.com','zaha.com','crimson.com','mohsinnaveedranjha.com','faizasaqlain.com',
  'zarashahjahan.com','junaidjamshed.com','alkaramstudio.com','alkaramstudio.pk',
  'zellbury.com','houseofcharizma.com','houseofcharizma.com.pk','myrangja.com',
  'rangja.com.pk','saadbinshahzad.com','sobianazir.net','silayipret.com',
  'tawakkalfabrics.co','binsaeedfabric.com','binilyas.com','rangrasiya.com',
  'bareezepk.com','armasclothing.com','ittehadtextiles.com','republicwomenswear.com',
  // PK twins of intl domains + brands added 2026-06-13
  'pk.saniamaskatiya.com','pk.zainabchottani.com','salitexonline.com','salitex.com',
  'suffuse.pk','baraekhanom.pk','suffusebysanayasir.com',
  'zeenwoman.com','lulusar.com','sokamal.com','mausummery.com','sitarastudio.pk',
  'maryumnmaria.com','imroziapremium.com','emaanadeel.com','dynastyfabrics.com',
  'shahzebsaeed.com','leisureclub.pk','pepperland.pk',
  // brands listed in the directory but missing from the original map
  'chenone.com','khasstores.com','aghanoorofficial.com','chinyere.pk','wearego.com',
  'farashaonline.pk','gulaal.pk','image1993.com','kayseria.com.pk','krosskulture.com',
  'motifz.com.pk','ramsha.pk','salitex.com','shaposh.pk','thredzonline.com',
  'warda.com.pk','zarif.pk','bareeze.com','crimson.com.pk','erumkhancouture.com',
  'faizasaqlain.pk','hussainrehar.com','nomiansari.com','saniamaskatiya.com',
  'tenadurrani.com','threadsandmotifs.com','zaha.pk','zainabchottani.com',
  'amiradnan.com','lakhanyonline.com','furorjeans.com','republicbespoke.com',
  'naushemian.com','thecambridgeshop.com','charcoal.com.pk','cougar.com.pk',
  'deepakperwani.com','ismailfarid.com','royaltag.com.pk','savoir.pk',
  'minnieminors.com','bachaaparty.com','ilovehopscotch.com','rangrasiya.com.pk',
];

function hostAllowed(hostname){
  const h = hostname.replace(/^www\./,'').toLowerCase();
  return ALLOWED_HOSTS.some(a => h === a || h.endsWith('.' + a));
}

// ── Group 4: Salesforce Commerce Cloud brands (no Shopify API) ───────────────
// Khaadi & Sapphire run SFCC. Their PDPs have no /products/{handle}.js, but the
// SFCC Product-Variation controller returns JSON with price (PKR), per-size
// availability (`selectable` flags) and the product name — all in one call. The
// PID is the last path segment of the PDP URL (…/<PID>.html). Verified 2026-06-14.
const SFCC_BRANDS = [
  { match:'khaadi.com',        variation:'https://pk.khaadi.com/on/demandware.store/Sites-Khaadi_PK-Site/en_PK/Product-Variation' },
  { match:'sapphireonline.pk', variation:'https://pk.sapphireonline.pk/on/demandware.store/Sites-Sapphire-Site/default/Product-Variation' },
];
function sfccBrandFor(hostname){
  const h = hostname.replace(/^www\./,'').toLowerCase();
  return SFCC_BRANDS.find(b => h === b.match || h.endsWith('.' + b.match)) || null;
}
// Normalize an SFCC Product-Variation payload to the relay's scrape shape.
function normalizeSfcc(j){
  const p = j && j.product;
  if(!p) return null;
  const sales = p.price && p.price.sales;
  const price = sales ? (typeof sales.value === 'number' ? sales.value : parseFloat(sales.decimalPrice)) : null;
  const currency = sales ? (sales.currency || null) : null;
  const sizeAttr = (p.variationAttributes || []).find(a => a.id === 'size');
  const sizes = sizeAttr ? (sizeAttr.values || []).map(v => ({
    size: v.displayValue || v.value, available: !!v.selectable,
  })) : [];
  return {
    currency,                 // 'PKR'
    price,                    // number, in RUPEES (not paisa, unlike /price)
    title: p.productName || null,
    productType: p.productType || null,
    available: p.available !== false,
    sizes,
  };
}

const cache = new Map(); // key → { at, body }
function cacheGet(key){
  const e = cache.get(key);
  if(e && Date.now() - e.at < CACHE_TTL_MS) return e.body;
  cache.delete(key);
  return null;
}
function cacheSet(key, body){
  cache.set(key, { at: Date.now(), body });
  if(cache.size > 500){ // bound memory
    const oldest = [...cache.entries()].sort((a,b)=>a[1].at-b[1].at)[0];
    if(oldest) cache.delete(oldest[0]);
  }
}

async function fetchJson(url, extraHeaders){
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try{
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, 'Accept': 'application/json', ...(extraHeaders||{}) },
    });
    if(!r.ok) throw new Error('upstream HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(tid); }
}

function send(res, status, obj){
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');

  if(u.pathname === '/health') return send(res, 200, { ok: true });

  // ── /scrape — Group 4 (Khaadi/Sapphire, SFCC). Returns a NORMALIZED shape
  //    { ok, currency, price (rupees), title, productType, available, sizes:[{size,available}] }
  if(u.pathname === '/scrape' && req.method === 'GET'){
    const target = u.searchParams.get('url') || '';
    let t; try{ t = new URL(target); }catch(e){ return send(res, 400, { ok:false, error:'bad url' }); }
    if(t.protocol !== 'https:' || !hostAllowed(t.hostname))
      return send(res, 403, { ok:false, error:'host not allowed' });
    const brand = sfccBrandFor(t.hostname);
    if(!brand) return send(res, 400, { ok:false, error:'not an SFCC brand' });
    const pm = t.pathname.match(/\/([^/]+?)\.html$/);
    if(!pm) return send(res, 400, { ok:false, error:'not a product url' });
    const pid = decodeURIComponent(pm[1]);
    const key = 'scrape:' + brand.match + '/' + pid;
    const hit = cacheGet(key);
    if(hit) return send(res, 200, hit);
    try{
      const vUrl = `${brand.variation}?pid=${encodeURIComponent(pid)}&quantity=1`;
      const j = await fetchJson(vUrl, {
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
        'Accept-Language': 'en-PK,en;q=0.9',
      });
      const norm = normalizeSfcc(j);
      if(!norm || norm.price == null) return send(res, 502, { ok:false, error:'could not parse product' });
      const body = { ok:true, ...norm };
      cacheSet(key, body);
      return send(res, 200, body);
    }catch(e){ return send(res, 502, { ok:false, error:String(e.message || e) }); }
  }

  if(u.pathname !== '/price' || req.method !== 'GET')
    return send(res, 404, { ok: false, error: 'not found' });

  const target = u.searchParams.get('url') || '';
  let t;
  try{ t = new URL(target); }
  catch(e){ return send(res, 400, { ok: false, error: 'bad url' }); }

  if(t.protocol !== 'https:' || !hostAllowed(t.hostname))
    return send(res, 403, { ok: false, error: 'host not allowed' });

  const m = t.pathname.match(/\/products\/([^/?#]+)/);
  if(!m) return send(res, 400, { ok: false, error: 'not a product url' });
  const handle = m[1];

  const key = t.hostname + '/' + handle;
  const hit = cacheGet(key);
  if(hit) return send(res, 200, hit);

  try{
    // From this PK IP, Shopify serves the Pakistan market: PKR prices.
    const product = await fetchJson(`${t.origin}/products/${handle}.js?_psbrelay=${Date.now()}`);
    let currency = null;
    try{ currency = (await fetchJson(`${t.origin}/cart.js`)).currency || null; }
    catch(e){ /* currency stays null — form treats non-PKR as unresolved */ }
    const body = { ok: true, currency, product };
    cacheSet(key, body);
    return send(res, 200, body);
  }catch(e){
    return send(res, 502, { ok: false, error: String(e.message || e) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`PakStyle BD price relay listening on 127.0.0.1:${PORT}`);
  console.log(`${ALLOWED_HOSTS.length} brand domains whitelisted`);
});
