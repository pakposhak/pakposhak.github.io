// PakPoshak — Pakistan Price Relay
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
const fs = require('fs');

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
  'faizasaqlain.pk','hussainrehar.com','nomiansari.com','nomiansari.com.pk','saniamaskatiya.com',
  'tenadurrani.com','threadsandmotifs.com','zaha.pk','zainabchottani.com',
  'amiradnan.com','lakhanyonline.com','furorjeans.com','republicbespoke.com',
  'naushemian.com','thecambridgeshop.com','charcoal.com.pk','cougar.com.pk',
  'deepakperwani.com','ismailfarid.com','royaltag.com.pk','savoir.pk',
  'minnieminors.com','bachaaparty.com','ilovehopscotch.com','rangrasiya.com.pk',
  'saya.pk',
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
  // Some brands pad size codes for sort order (Khaadi: 0XS, 00S, 00M…) — strip
  // leading zeros that precede a letter so chips read XS/S/M/L/XL.
  const cleanSize = s => String(s == null ? '' : s).replace(/^0+(?=[A-Za-z])/, '').trim();
  const sizes = sizeAttr ? (sizeAttr.values || []).map(v => ({
    size: cleanSize(v.displayValue || v.value), available: !!v.selectable,
    // Raw SFCC variation code (e.g. MDM, 0XS) so the form can map a pasted
    // ?dwvar_<pid>_size=<code> back to the display size and pre-select it.
    value: v.value == null ? null : String(v.value),
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

async function fetchText(url, extraHeaders){
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try{
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,*/*', ...(extraHeaders||{}) },
    });
    if(!r.ok) throw new Error('upstream HTTP ' + r.status);
    return await r.text();
  } finally { clearTimeout(tid); }
}

// Khaadi/Sapphire sell some articles as a "product set" (bundle) — e.g. a kurta
// shown on the same PDP as its matching trouser, each its own price + sizes. The
// SFRA PDP marks this with a `bundled-product-set-detail` wrapper and renders one
// `set-item` block per piece, each carrying its own data-pid. Return the member
// PIDs (in page order) so each piece can be priced/sized separately; [] = not a set.
function extractSetMembers(html){
  if(!html || !/bundled-product-set-detail/.test(html)) return [];
  const pids = new Set();
  const res = [
    /class="[^"]*\bset-item\b[^"]*"[^>]*\bdata-pid="([^"]+)"/g,
    /\bdata-pid="([^"]+)"[^>]*class="[^"]*\bset-item\b[^"]*"/g,
  ];
  for(const re of res){ let m; while((m = re.exec(html))) pids.add(m[1]); }
  return [...pids];
}

// Generic price extractor for NON-Shopify brands (Magento/Woo/custom). Reads the
// product page's schema.org JSON-LD Product → {title, price (rupees), currency,
// available}. Robust to @graph wrappers, offer arrays and AggregateOffer. Sizes
// are JS-rendered on these sites (absent from server HTML) so they're not here.
function extractJsonLdProduct(html){
  const flat = [];
  for(const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    let j; try{ j = JSON.parse(m[1].trim()); }catch(e){ continue; }
    if(Array.isArray(j)) flat.push(...j);
    else if(j && Array.isArray(j['@graph'])) flat.push(...j['@graph']);
    else if(j) flat.push(j);
  }
  const isProd = x => x && (x['@type'] === 'Product' || (Array.isArray(x['@type']) && x['@type'].includes('Product')));
  const p = flat.find(isProd);
  if(!p) return null;
  let off = p.offers;
  if(Array.isArray(off)) off = off[0];
  let price = null, currency = null, avail = null;
  if(off){
    const ps = off.priceSpecification && (Array.isArray(off.priceSpecification) ? off.priceSpecification[0] : off.priceSpecification);
    currency = off.priceCurrency || (ps && ps.priceCurrency) || null;
    let raw = off.price != null ? off.price : (off.lowPrice != null ? off.lowPrice : (ps && ps.price != null ? ps.price : null));
    if(raw != null){ const num = parseFloat(String(raw).replace(/[^0-9.]/g, '')); if(!isNaN(num) && num > 0) price = num; }
    avail = off.availability || null;
  }
  return {
    title: (p.name != null ? String(p.name) : '').trim() || null,
    price, currency,
    available: avail ? !/SoldOut|OutOfStock|Discontinued/i.test(avail) : true,
  };
}

// Some non-Shopify storefronts (notably LAAM, a Nuxt SPA) embed per-size
// availability in the page payload as tag strings like
// "Phy_InStock_Kids Size_5-6Y_RDLRG" / "Phy_OutOfStock_Women Size_M_ABC".
// Pull the size + stock from those tags. Sizes the buyer can pick (in stock)
// come from InStock tags; OutOfStock tags mark sold-out. Brands without such
// tags → returns [] (price-only). The format could change → fragile by nature,
// so it just degrades to price-only if it stops matching.
function extractTagSizes(html){
  const grab = re => [...new Set([...html.matchAll(re)].map(m => m[1].trim()).filter(Boolean))];
  const inS  = grab(/InStock[^"]*?Size_([^_"]+)_/g);
  const outS = grab(/OutOfStock[^"]*?Size_([^_"]+)_/g);
  return [
    ...inS.map(s => ({ size: s, available: true })),
    ...outS.filter(s => !inS.includes(s)).map(s => ({ size: s, available: false })),
  ];
}

// ── GLOBAL CONFIG STORE (admin-set rates + weights, shared by every form) ────
// Persisted to the systemd StateDirectory (writable under ProtectSystem=strict).
// GET /config (public read) → forms use these rates/weights; POST /config,
// /admin/setup & /admin/verify are gated by the admin password (SHA-256 hash).
const CONFIG_DIR  = process.env.STATE_DIRECTORY || '/var/lib/psb-relay';
const CONFIG_FILE = CONFIG_DIR + '/config.json';
function loadConfig(){
  try{ const o = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return { adminHash: o.adminHash || null, rates: o.rates || null, weights: o.weights || null, updatedAt: o.updatedAt || null }; }
  catch(e){ return { adminHash: null, rates: null, weights: null, updatedAt: null }; }
}
let CONFIG = loadConfig();
function saveConfig(){
  try{ fs.mkdirSync(CONFIG_DIR, { recursive: true }); fs.writeFileSync(CONFIG_FILE, JSON.stringify(CONFIG)); return true; }
  catch(e){ console.error('config save failed:', e.message); return false; }
}
const RATE_KEYS = ['conv','log','usd_pkr','comm_1','comm_23','comm_4p','maxqty'];
function sanitizeRates(r){ if(!r || typeof r !== 'object') return null; const o = {};
  for(const k of RATE_KEYS){ const n = parseFloat(r[k]); if(isFinite(n) && n >= 0) o[k] = n; } return Object.keys(o).length ? o : null; }
function sanitizeWeights(w){ if(!w || typeof w !== 'object') return null; const o = {};
  for(const k in w){ if(!/^[a-z0-9_]{1,40}$/i.test(k)) continue; const n = parseFloat(w[k]); if(isFinite(n) && n > 0 && n < 100) o[k] = n; } return Object.keys(o).length ? o : null; }
function readBody(req){ return new Promise(resolve => { let d=''; req.on('data', c => { d += c; if(d.length > 1e6) req.destroy(); });
  req.on('end', () => { try{ resolve(JSON.parse(d || '{}')); }catch(e){ resolve(null); } }); req.on('error', () => resolve(null)); }); }
const isHash = h => typeof h === 'string' && /^[a-f0-9]{64}$/i.test(h);

// ── Per-IP rate limit for the password endpoints (anti brute-force) ──────────
// Caddy proxies from localhost, so the real client IP is in X-Forwarded-For.
function clientIp(req){
  const xff = req.headers['x-forwarded-for'];
  if(xff) return String(xff).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || '?';
}
const RL_WINDOW_MS = 10 * 60 * 1000;   // 10-minute window
const RL_MAX = 20;                     // max hits to the gated endpoints per IP per window
const rl = new Map();                  // ip → { n, reset }
function rateLimited(req){
  const ip = clientIp(req), now = Date.now();
  let e = rl.get(ip);
  if(!e || now > e.reset){ e = { n: 0, reset: now + RL_WINDOW_MS }; rl.set(ip, e); }
  e.n++;
  if(rl.size > 5000){ for(const [k,v] of rl){ if(now > v.reset) rl.delete(k); } }  // prune expired
  return e.n > RL_MAX;                  // true → block (brute-force)
}

// CORS: echo the form's OWN origin for the (password-gated) write endpoints, so
// another website can't drive them from a victim's browser. Public GET reads
// (config/price/scrape) keep '*' so the live form never breaks.
const ALLOWED_ORIGINS = ['https://pakposhak.github.io', 'https://pakiposhak.github.io'];
function corsOrigin(req, strict){
  const o = req.headers.origin;
  if(o && ALLOWED_ORIGINS.includes(o)) return o;
  return strict ? ALLOWED_ORIGINS[0] : '*';
}

function send(res, status, obj, origin){
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': origin || '*',
    'Vary': 'Origin',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');

  if(u.pathname === '/health') return send(res, 200, { ok: true });

  // ── CORS preflight (browser POSTs to /config etc.) ───────────────────────
  if(req.method === 'OPTIONS'){
    // Preflight only fires for the JSON POSTs (writes); lock it to the form origin.
    res.writeHead(204, { 'Access-Control-Allow-Origin': corsOrigin(req, true), 'Access-Control-Allow-Methods':'GET,POST,OPTIONS', 'Access-Control-Allow-Headers':'Content-Type', 'Access-Control-Max-Age':'86400', 'Vary':'Origin' });
    return res.end();
  }

  // ── GLOBAL RATE/WEIGHT CONFIG (admin panel writes here; every form reads it)
  if(u.pathname === '/config' && req.method === 'GET')
    return send(res, 200, { ok:true, hasPassword: !!CONFIG.adminHash, rates: CONFIG.rates, weights: CONFIG.weights, updatedAt: CONFIG.updatedAt });

  if(u.pathname === '/admin/setup' && req.method === 'POST'){
    const co = corsOrigin(req, true);
    if(rateLimited(req)) return send(res, 429, { ok:false, error:'too many attempts — try again later' }, co);
    // First-time password creation — only allowed while none is set.
    const b = await readBody(req);
    if(!b || !isHash(b.hash)) return send(res, 400, { ok:false, error:'bad hash' }, co);
    if(CONFIG.adminHash) return send(res, 403, { ok:false, error:'password already set' }, co);
    CONFIG.adminHash = b.hash.toLowerCase(); CONFIG.updatedAt = new Date().toISOString();
    return send(res, saveConfig() ? 200 : 500, { ok: !!CONFIG.adminHash }, co);
  }

  if(u.pathname === '/admin/verify' && req.method === 'POST'){
    const co = corsOrigin(req, true);
    if(rateLimited(req)) return send(res, 429, { ok:false, error:'too many attempts — try again later' }, co);
    const b = await readBody(req);
    return send(res, 200, { ok: !!CONFIG.adminHash && !!b && isHash(b.hash) && b.hash.toLowerCase() === CONFIG.adminHash }, co);
  }

  // Rotate the admin password. Authenticated by the CURRENT password hash (so only the
  // existing admin can change it) → replaces it with newHash. Lets the password be rotated
  // anytime without a VPS edit (setup is locked once a password exists). Rate-limited.
  if(u.pathname === '/admin/change' && req.method === 'POST'){
    const co = corsOrigin(req, true);
    if(rateLimited(req)) return send(res, 429, { ok:false, error:'too many attempts — try again later' }, co);
    const b = await readBody(req);
    if(!b || !isHash(b.hash) || !isHash(b.newHash)) return send(res, 400, { ok:false, error:'bad hash' }, co);
    if(!CONFIG.adminHash || b.hash.toLowerCase() !== CONFIG.adminHash) return send(res, 401, { ok:false, error:'unauthorized' }, co);
    CONFIG.adminHash = b.newHash.toLowerCase(); CONFIG.updatedAt = new Date().toISOString();
    return send(res, saveConfig() ? 200 : 500, { ok: !!CONFIG.adminHash }, co);
  }

  if(u.pathname === '/config' && req.method === 'POST'){
    const co = corsOrigin(req, true);
    if(rateLimited(req)) return send(res, 429, { ok:false, error:'too many attempts — try again later' }, co);
    const b = await readBody(req);
    if(!b || !isHash(b.hash)) return send(res, 400, { ok:false, error:'bad request' }, co);
    if(!CONFIG.adminHash || b.hash.toLowerCase() !== CONFIG.adminHash) return send(res, 401, { ok:false, error:'unauthorized' }, co);
    const r = sanitizeRates(b.rates), w = sanitizeWeights(b.weights);
    if(r) CONFIG.rates   = { ...(CONFIG.rates   || {}), ...r };
    if(w) CONFIG.weights = { ...(CONFIG.weights || {}), ...w };
    CONFIG.updatedAt = new Date().toISOString();
    const ok = saveConfig();
    return send(res, ok ? 200 : 500, { ok, updatedAt: CONFIG.updatedAt, rates: CONFIG.rates, weights: CONFIG.weights }, co);
  }

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
      // Detect a product set (kurta + matching trouser, etc.) by reading the PDP
      // HTML once. For a normal product the member list is just the page PID.
      let memberPids = [pid], isSet = false;
      try{
        const html = await fetchText(t.origin + t.pathname);
        const found = extractSetMembers(html);
        if(found.length > 1){
          // Keep the page's own product first (it's the one the buyer opened).
          isSet = true;
          memberPids = found.includes(pid) ? [pid, ...found.filter(x => x !== pid)] : found;
        }
      }catch(e){ /* HTML unavailable → treat as a single product */ }
      // Price + per-size stock (+ raw size codes) for each member, via the SFCC
      // Product-Variation controller.
      const members = [];
      for(const mpid of memberPids){
        try{
          const vUrl = `${brand.variation}?pid=${encodeURIComponent(mpid)}&quantity=1`;
          const j = await fetchJson(vUrl, {
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest',
            'Accept-Language': 'en-PK,en;q=0.9',
          });
          const norm = normalizeSfcc(j);
          if(norm && norm.price != null) members.push({ pid: mpid, ...norm });
        }catch(e){ /* skip a member that fails to parse */ }
      }
      if(!members.length) return send(res, 502, { ok:false, error:'could not parse product' });
      // Top-level fields mirror the first member (back-compat with single-product
      // callers); `members` + `isSet` are additive for set-aware callers.
      const body = { ok:true, isSet: isSet && members.length > 1, members, ...members[0] };
      cacheSet(key, body);
      return send(res, 200, body);
    }catch(e){ return send(res, 502, { ok:false, error:String(e.message || e) }); }
  }

  // ── /scrapeld — generic JSON-LD price scraper for NON-Shopify brands ──────
  //    (Magento/Woo/custom SPAs). Returns price (rupees) + currency + title from
  //    the product page's schema.org JSON-LD. Sizes are JS-rendered on these
  //    sites so they are NOT available here (sizes:[]) — the form has the buyer
  //    pick size manually. Shape mirrors /scrape so the form reuses that path.
  if(u.pathname === '/scrapeld' && req.method === 'GET'){
    const target = u.searchParams.get('url') || '';
    let t; try{ t = new URL(target); }catch(e){ return send(res, 400, { ok:false, error:'bad url' }); }
    if(t.protocol !== 'https:' || !hostAllowed(t.hostname))
      return send(res, 403, { ok:false, error:'host not allowed' });
    const key = 'scrapeld:' + t.hostname + t.pathname;
    const hit = cacheGet(key);
    if(hit) return send(res, 200, hit);
    try{
      const html = await fetchText(t.origin + t.pathname);
      const ld = extractJsonLdProduct(html);
      let price = (ld && ld.price != null) ? ld.price : null;
      let currency = (ld && ld.currency) || null;
      let title = (ld && ld.title) || null;
      let via = 'jsonld';
      if(price == null){
        // No JSON-LD price (custom sites, e.g. Nomi Ansari). Conservative
        // price-text fallback: accept a Rs/PKR amount ONLY if exactly one
        // distinct sane value (>=500) is on the page — avoids grabbing sale /
        // shipping / related-product numbers. Made-to-order items show no price
        // → no match → 502 → the form falls back to manual entry.
        const nums = [...new Set([...html.matchAll(/(?:Rs\.?|PKR|₨)\s*([\d,]{3,})/gi)]
          .map(m => parseInt(m[1].replace(/,/g, ''), 10)).filter(n => n >= 500))];
        if(nums.length === 1){ price = nums[0]; currency = currency || 'PKR'; via = 'pricetext'; }
        if(!title){ const tm = html.match(/<title[^>]*>([^<|]+)/i); if(tm) title = tm[1].trim() || null; }
      }
      if(price == null) return send(res, 502, { ok:false, error:'no price found' });
      const sizes = extractTagSizes(html);
      const body = { ok:true, currency: currency || null, price, title, available: ld ? ld.available : true, sizes, via };
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
  console.log(`PakPoshak price relay listening on 127.0.0.1:${PORT}`);
  console.log(`${ALLOWED_HOSTS.length} brand domains whitelisted`);
});
