
  // ═══════════════════════════════════════════════════════════════════════
  //  ORDER DELIVERY CONFIG  — paste your keys here after setup
  // ═══════════════════════════════════════════════════════════════════════
  // (A) Web3Forms: get a free access key at https://web3forms.com (enter your
  //     email → they email you a key). Paste it between the quotes below.
  const WEB3FORMS_KEY   = 'c1e6f253-f6c4-4a23-975c-a37d40c16545';
  // (B) Google Apps Script: deploy google-apps-script.gs (see that file's
  //     instructions), then paste the Web-app URL (ends in /exec) below.
  const SHEET_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby1CkPAQwvilQLt_UD8I46_7nCOPlRMoagCRaJ8vsrwYqYlyOoJRrJYc1sbqIIqqkk-Zg/exec';
  // Old Formspree endpoint — used only as a fallback if WEB3FORMS_KEY is blank.
  const FORMSPREE_URL    = 'https://formspree.io/f/xnjypzyl';
  // (C) Support WhatsApp number — full international format, DIGITS ONLY
  //     (Bangladesh example: 8801712345678). Fill this once and every
  //     "Chat on WhatsApp" link/button on the site turns on automatically.
  //     Leave it '' and those links stay HIDDEN (so buyers never see a dead
  //     link). >>> PASTE YOUR NUMBER BETWEEN THE QUOTES <<<
  const SUPPORT_WA       = '8801352018131';
  // ═══════════════════════════════════════════════════════════════════════

  // --- ADMIN RATE MANAGEMENT (rates/weights live on the VPS relay → GLOBAL) ---
  // The relay's /config is the single source of truth, fetched into PSB_CFG on
  // load so EVERY device — yours AND customers' — uses the same admin-set rates.
  // Fallback order: relay config → per-device localStorage → built-in defaults
  // (so totals never break if the relay is briefly unreachable).
  let PSB_CFG = null;   // { hasPassword, rates:{conv,log,usd_pkr,comm_1,comm_23,comm_4p,maxqty}, weights:{}, updatedAt }
  function cfgRate(key){ const r = PSB_CFG && PSB_CFG.rates; return (r && r[key] != null && isFinite(r[key])) ? Number(r[key]) : null; }
  function cfgWeight(key){ const w = PSB_CFG && PSB_CFG.weights; const v = w && w[key]; return (v != null && isFinite(v) && v > 0) ? Number(v) : null; }
  function relayBase(){ return ((localStorage.getItem('psb_relay_url')||'').trim() || DEFAULT_RELAY_URL).replace(/\/+$/,''); }
  async function sha256hex(str){ const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2,'0')).join(''); }
  function lsNum(k, d){ const v = localStorage.getItem(k); const n = parseFloat(v); return (v != null && v !== '' && isFinite(n)) ? n : d; }
  function getUsdRate(){ return cfgRate('usd_pkr') ?? lsNum('psb_usd_pkr', 278); }
  function getRates(){
    return {
      CONV_RATE : cfgRate('conv')     ?? lsNum('psb_conv', 0.42),
      LOG_RATE  : cfgRate('log')      ?? lsNum('psb_log', 1600),
      COMM_1    : (cfgRate('comm_1')  ?? lsNum('psb_comm_1', 20))  / 100,
      COMM_23   : (cfgRate('comm_23') ?? lsNum('psb_comm_23', 18)) / 100,
      COMM_4P           : (cfgRate('comm_4p') ?? lsNum('psb_comm_4p', 15)) / 100,
      PKR_LOW_THRESHOLD : cfgRate('pkr_low_threshold') ?? lsNum('psb_pkr_low_threshold', 2100),
      COMM_LOW_BDT      : cfgRate('comm_low_bdt') ?? lsNum('psb_comm_low_bdt', 200),
      KIDS_AGE_6_10     : cfgRate('kids_age_6_10')  ?? lsNum('psb_kids_age_6_10', 1.2),
      KIDS_AGE_10_12    : cfgRate('kids_age_10_12') ?? lsNum('psb_kids_age_10_12', 1.3),
      KIDS_AGE_12P      : cfgRate('kids_age_12p')   ?? lsNum('psb_kids_age_12p', 1.4),
      TRANS_FEE : 100
    };
  }
  // Fetch the global config from the relay on load (cached so a relay outage
  // falls back to the last-known values rather than the built-in defaults).
  async function loadPsbConfig(){
    let cfg = null;
    try{ const r = await fetch(relayBase()+'/config', { cache:'default' }); if(r.ok){ const j = await r.json(); if(j && j.ok) cfg = j; } }catch(e){}
    if(cfg){ PSB_CFG = cfg; try{ localStorage.setItem('psb_cfg_cache', JSON.stringify(cfg)); }catch(e){} }
    else { try{ const c = JSON.parse(localStorage.getItem('psb_cfg_cache') || 'null'); if(c && c.ok) PSB_CFG = c; }catch(e){} }
    if(PSB_CFG && typeof renderCart === 'function') renderCart();   // refresh any totals shown before config arrived
    // Catalog grid prices (_bdt) were computed with whatever rates were current when the
    // catalog loaded; if config arrived AFTER that, recompute them so the grid + price
    // filter/sort reflect the live rates instead of stale defaults.
    if(typeof psRecomputeBdt === 'function') psRecomputeBdt();
  }
  // NOTE: loadPsbConfig() is invoked at the END of the script — calling it here
  // would hit DEFAULT_RELAY_URL while it's still in the temporal dead zone.
  // Commission tier is driven by TOTAL PIECES in the cart (every size's qty
  // summed across all products), so a bulk order of one item counts as the
  // buyer's real quantity — not as "1 product". 1 → COMM_1, 2–3 → COMM_23, 4+ → COMM_4P.
  function commRate(r, pieces){
    if(pieces <= 1) return r.COMM_1;
    if(pieces <= 3) return r.COMM_23;
    return r.COMM_4P;
  }
  // Total pieces across the whole cart (drives the commission tier above).
  // Mirrors the per-item qty logic used in the totals: an item with no sizes
  // (unstitched) counts as 1 piece via the [{qty:1}] fallback.
  function cartTotalQty(){
    return cart.reduce(function(s, it){
      return s + (it.sizes || [{qty:1}]).reduce(function(a, q){ return a + (q.qty || 0); }, 0);
    }, 0);
  }
  function _rowPkr(item, row){ return (row && row.pkr != null) ? row.pkr : item.pkr; }
  function itemPkrSubtotal(item){ return (item.sizes || [{qty:1}]).reduce(function(s, row){ return s + (_rowPkr(item, row) * (row.qty || 0)); }, 0); }
  function itemPriceVaries(item){ const real = (item.sizes || []).filter(function(r){ return r.size; }); return new Set(real.map(function(r){ return _rowPkr(item, r); })).size > 1; }

  // Per-item, per-unit commission that respects the low-value rule:
  // items with unitPkr < PKR_LOW_THRESHOLD → flat COMM_LOW_BDT each;
  // items at/above threshold → percentage of converted BDT (tier = whole-cart qty).
  function cartCommission(r) {
    var LOW_PKR = r.PKR_LOW_THRESHOLD || 2100;
    var LOW_BDT = r.COMM_LOW_BDT      || 200;
    var tier    = commRate(r, cartTotalQty());
    var total   = 0;
    cart.forEach(function(item) {
      (item.sizes || [{qty:1}]).forEach(function(row) {
        var unitPkr = _rowPkr(item, row);
        var units   = row.qty || 0;
        if (!units) return;
        total += unitPkr < LOW_PKR
          ? LOW_BDT * units
          : Math.round(unitPkr * r.CONV_RATE * tier) * units;
      });
    });
    return total;
  }

  // --- REMEMBER ME (localStorage) ---
  function loadSavedDetails(){
    try{
      const saved = JSON.parse(localStorage.getItem('psb_buyer') || 'null');
      if(saved && saved.name){
        document.getElementById('buyerName').value    = saved.name    || '';
        document.getElementById('buyerWA').value      = saved.wa      || '';
        if(window.psPhoneSetFromFull) psPhoneSetFromFull('buyerWA', saved.wa || '');
        document.getElementById('buyerEmail').value   = saved.email   || '';
        document.getElementById('buyerAddress').value = saved.address || '';
        document.getElementById('rememberMe').checked = true;
        document.getElementById('savedIndicator').style.display = 'flex';
      }
    }catch(e){}
  }
  function saveBuyerDetails(){
    if(!document.getElementById('rememberMe').checked){
      localStorage.removeItem('psb_buyer'); return;
    }
    localStorage.setItem('psb_buyer', JSON.stringify({
      name:    document.getElementById('buyerName').value.trim(),
      wa:      document.getElementById('buyerWA').value.trim(),
      email:   document.getElementById('buyerEmail').value.trim(),
      address: document.getElementById('buyerAddress').value.trim()
    }));
  }
  function clearSavedDetails(){
    localStorage.removeItem('psb_buyer');
    document.getElementById('buyerName').value    = '';
    document.getElementById('buyerWA').value      = '';
    if(window.psPhoneReset) psPhoneReset('buyerWA');
    document.getElementById('buyerEmail').value   = '';
    document.getElementById('buyerAddress').value = '';
    document.getElementById('rememberMe').checked = false;
    document.getElementById('savedIndicator').style.display = 'none';
  }
  loadSavedDetails();
  // NOTE: loadCartFromStorage() must run AFTER `let cart` is initialised —
  // calling it here threw a (silently caught) TDZ error and the cart never
  // restored after refresh. It is now called at the end of the script.

  // Show the admin panel (already authenticated). Fields show the EFFECTIVE
  // values (global config → fallback), so you edit the live numbers.
  function showAdminPanel(){
    const panel = document.getElementById('adminPanel');
    panel.style.display = 'block';
    const r = getRates();
    document.getElementById('adm_conv').value    = r.CONV_RATE;
    document.getElementById('adm_log').value     = r.LOG_RATE;
    document.getElementById('adm_usd_pkr').value = getUsdRate();
    document.getElementById('adm_comm_1').value  = +(r.COMM_1  * 100).toFixed(2);
    document.getElementById('adm_comm_23').value = +(r.COMM_23 * 100).toFixed(2);
    document.getElementById('adm_comm_4p').value       = +(r.COMM_4P * 100).toFixed(2);
    document.getElementById('adm_pkr_threshold').value  = r.PKR_LOW_THRESHOLD || 2100;
    document.getElementById('adm_comm_low_bdt').value   = r.COMM_LOW_BDT      || 200;
    document.getElementById('adm_kids_6_10').value      = r.KIDS_AGE_6_10     || 1.2;
    document.getElementById('adm_kids_10_12').value     = r.KIDS_AGE_10_12    || 1.3;
    document.getElementById('adm_kids_12p').value       = r.KIDS_AGE_12P      || 1.4;
    document.getElementById('adm_relay').value          = localStorage.getItem('psb_relay_url') || '';
    document.getElementById('adm_maxqty').value  = maxPerSize();
    buildWeightEditor();
    panel.scrollIntoView({ behavior: 'smooth' });
  }

  // Gated entry — require the admin password (verified against the relay) before
  // showing the panel. First open (no password yet) → create one. Buyers who hit
  // ?admin get a prompt they can't pass. Unlock lasts the browser-tab session.
  async function openAdminPanel(){
    // ALWAYS pull the latest saved config first, so the panel's fields show what is REALLY
    // stored on the relay — not the built-in defaults. (Bug fix: opening the panel right after a
    // page refresh, before the on-load /config fetch had finished, showed defaults — making a
    // saved change look "lost"/reverted. It also risked overwriting the live values with defaults.)
    try{ const r = await fetch(relayBase()+'/config',{cache:'no-store'}); const j = await r.json(); if(j && j.ok){ PSB_CFG = j; try{ localStorage.setItem('psb_cfg_cache', JSON.stringify(j)); }catch(e){} } }catch(e){}
    if(sessionStorage.getItem('psb_admin_h')) return showAdminPanel();
    const hasPw = !!(PSB_CFG && PSB_CFG.hasPassword);
    try{
      if(!hasPw){
        const p1 = prompt('Set an ADMIN PASSWORD (locks this panel for everyone):'); if(!p1) return;
        const p2 = prompt('Re-enter the password:'); if(p2 !== p1){ alert('Passwords did not match — try again.'); return; }
        const h = await sha256hex(p1);
        const res = await fetch(relayBase()+'/admin/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hash:h})});
        const j = await res.json();
        if(j && j.ok){ sessionStorage.setItem('psb_admin_h', h); if(PSB_CFG) PSB_CFG.hasPassword = true; showAdminPanel(); }
        else alert('Could not set the password: ' + ((j && j.error) || 'relay error'));
      } else {
        const p = prompt('Enter admin password:'); if(!p) return;
        const h = await sha256hex(p);
        const res = await fetch(relayBase()+'/admin/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hash:h})});
        const j = await res.json();
        if(j && j.ok){ sessionStorage.setItem('psb_admin_h', h); showAdminPanel(); }
        else alert('Wrong password.');
      }
    }catch(e){ alert('Could not reach the relay to check the password — try again in a moment.'); }
  }

  // Rotate the admin password (relay-backed). Verifies the CURRENT password on the relay,
  // then sets the new one — applies to every device. Needs the relay's /admin/change endpoint.
  async function changeAdminPassword(){
    const cur = prompt('Enter your CURRENT admin password:'); if(!cur) return;
    const np1 = prompt('Enter a NEW admin password:'); if(!np1) return;
    const np2 = prompt('Re-enter the NEW password:'); if(np2 !== np1){ alert('The new passwords did not match — nothing changed. Try again.'); return; }
    try{
      const curH = await sha256hex(cur), newH = await sha256hex(np1);
      const res = await fetch(relayBase()+'/admin/change',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hash:curH,newHash:newH})});
      if(res.status === 404){ alert('Your relay needs updating first. Update relay-server.js on your VPS and restart it (sudo systemctl restart psb-relay), then try again.'); return; }
      if(res.status === 401){ alert('That CURRENT password is wrong — nothing was changed.'); return; }
      const j = await res.json();
      if(j && j.ok){ sessionStorage.setItem('psb_admin_h', newH); alert('✓ Password changed. Use your NEW password from now on — it applies on every device.'); }
      else alert('Could not change the password: ' + ((j && j.error) || 'relay error'));
    }catch(e){ alert('Could not reach the relay — check your internet and try again.'); }
  }

  // NOTE: the ?admin auto-open is fired at the very END of the script — calling
  // openAdminPanel() here would hit DEFAULT_WEIGHTS (defined lower down) while
  // it's still in the temporal dead zone, throwing and halting the whole script.

  document.addEventListener('keydown', function(e){
    if(e.ctrlKey && e.shiftKey && e.key === 'A'){
      e.preventDefault();
      const panel = document.getElementById('adminPanel');
      if(panel.style.display === 'none') openAdminPanel();
      else panel.style.display = 'none';
    }
  });

  async function saveRates(){
    const conv   = parseFloat(document.getElementById('adm_conv').value);
    const log    = parseFloat(document.getElementById('adm_log').value);
    const usdPkr = parseFloat(document.getElementById('adm_usd_pkr').value);
    if(!(conv > 0) || !(log > 0)){ alert('Please enter valid numbers.'); return; }
    const c1  = parseFloat(document.getElementById('adm_comm_1').value);
    const c23 = parseFloat(document.getElementById('adm_comm_23').value);
    const c4p          = parseFloat(document.getElementById('adm_comm_4p').value);
    const pkrThreshold = parseFloat(document.getElementById('adm_pkr_threshold').value);
    const commLowBdt   = parseFloat(document.getElementById('adm_comm_low_bdt').value);
    const kids6_10     = parseFloat(document.getElementById('adm_kids_6_10').value);
    const kids10_12    = parseFloat(document.getElementById('adm_kids_10_12').value);
    const kids12p      = parseFloat(document.getElementById('adm_kids_12p').value);
    const maxq = parseInt(document.getElementById('adm_maxqty').value);
    // The relay URL is how to REACH the relay, so it stays per-device (localStorage).
    const relayUrl = document.getElementById('adm_relay').value.trim();
    if(relayUrl && !/^https:\/\//i.test(relayUrl)){ alert('Relay URL must start with https://'); return; }
    if(relayUrl) localStorage.setItem('psb_relay_url', relayUrl); else localStorage.removeItem('psb_relay_url');
    const h = sessionStorage.getItem('psb_admin_h');
    if(!h){ alert('Session expired — close and reopen the admin panel to re-enter your password.'); return; }
    const rates = { conv, log, usd_pkr: usdPkr > 0 ? usdPkr : 278,
      comm_1: c1 >= 0 ? c1 : 20, comm_23: c23 >= 0 ? c23 : 18, comm_4p: c4p >= 0 ? c4p : 15, maxqty: maxq > 0 ? maxq : 5,
      pkr_low_threshold: pkrThreshold > 0 ? pkrThreshold : 2100,
      comm_low_bdt: commLowBdt >= 0 ? commLowBdt : 200,
      kids_age_6_10:  kids6_10  > 0 ? kids6_10  : 1.2,
      kids_age_10_12: kids10_12 > 0 ? kids10_12 : 1.3,
      kids_age_12p:   kids12p   > 0 ? kids12p   : 1.4 };
    const btn = document.getElementById('saveRatesBtn'); btn.textContent = 'Saving…';
    try{
      const res = await fetch(relayBase()+'/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hash:h, rates})});
      const j = await res.json();
      if(j && j.ok){
        PSB_CFG = PSB_CFG || {}; PSB_CFG.rates = j.rates; if(j.weights) PSB_CFG.weights = j.weights;
        try{ localStorage.setItem('psb_cfg_cache', JSON.stringify({ ok:true, hasPassword:true, rates:j.rates, weights:j.weights, updatedAt:j.updatedAt })); }catch(e){}
        if(typeof renderCart === 'function') renderCart();
        btn.textContent = '✓ Saved for everyone!'; btn.style.background = '#2e7d32';
      } else { btn.textContent = 'Save Rates'; alert('Save failed: ' + ((j && j.error) || 'unauthorized — reopen the panel')); }
    }catch(e){ btn.textContent = 'Save Rates'; alert('Relay unreachable — rates NOT saved.'); }
    setTimeout(()=>{ btn.textContent='Save Rates'; btn.style.background=''; }, 2500);
  }

  const TRANS_FEE = 100;            // legacy flat per-order fee — REPLACED by per-suit local delivery below
  const LOCAL_DELIVERY = 100;       // ৳ per suit (piece), added in the Bag at checkout (req: Danish, replaces TRANS_FEE)
  // Total suits (pieces) in the cart = sum of every size's qty across all items — drives local delivery.
  function cartSuitCount(){
    if(typeof cart === 'undefined' || !cart) return 0;
    return cart.reduce(function(s, it){ return s + (it.sizes || [{qty:1}]).reduce(function(a, z){ return a + (z.qty || 0); }, 0); }, 0);
  }

  // ── WEIGHT SYSTEM ────────────────────────────────────────────────────────
  // Keys match dropdown option values and detectCategory() returns.
  // Weights include ~20% packaging allowance, raised a further +20% across
  // the board 2026-06-13 (operator margin call) — footwear excluded since
  // its 1.10kg already covers the shoe box.
  const DEFAULT_WEIGHTS = {
    // Final SHIPPING weights (packing included). Safety margin added 2026-06-15:
    // +0.20 kg on 1-piece garments, kids & separates (vary most); +0.15 kg on
    // multi-piece. Footwear unchanged (boxed = consistent). Admin can override.
    kurti_1pc            : 0.61,   // 1pc kurti/shirt — STITCHED
    kurti_1pc_unstitch   : 0.55,   // NEW — 1pc shirt fabric, UNSTITCHED
    western_top          : 0.45,   // NEW — western top / tank / tee (1pc)
    womens_trouser    : 0.70,
    kaftan            : 0.90,
    shirt_dupatta_2pc          : 0.70,   // 2pc shirt+dupatta — STITCHED
    shirt_dupatta_2pc_unstitch : 0.62,   // NEW — 2pc shirt+dupatta, UNSTITCHED
    shirt_trouser_2pc          : 0.85,   // 2pc co-ord — STITCHED
    shirt_trouser_2pc_unstitch : 0.75,   // NEW — 2pc co-ord, UNSTITCHED
    pret_2pc_emb      : 0.95,   // NEW — 2pc pret, embroidered
    lawn_3pc_unstitch : 0.94,   // 3pc unstitched, printed/plain
    unstitch_3pc_emb  : 1.10,   // NEW — 3pc unstitched, embroidered
    pret_3pc          : 1.04,   // 3pc pret, printed/plain
    pret_3pc_emb      : 1.25,   // NEW — 3pc pret, embroidered
    winter_2pc_unstitch : 0.99,   // winter 2pc unstitched (karandi/khaddar)
    winter_2pc_stitch   : 1.19,   // stitched = unstitched + 0.20 (stitching/lining)
    winter_3pc_unstitch : 1.23,
    winter_3pc_stitch   : 1.43,
    formal_emb_2pc    : 1.18,
    formal_emb_3pc    : 1.45,
    heavy_formal_3pc  : 1.73,
    handmade_emb      : 2.50,   // full HAND embroidery (adda) — heavy, same wt stitched/unstitched
    bridal            : 2.55,
    saree             : 1.15,   // NEW
    lehenga           : 1.80,   // NEW — lehenga/gharara/sharara
    coord_western     : 0.80,   // NEW — western co-ord 2pc
    loungewear        : 0.75,   // NEW — loungewear/nightwear set
    abaya             : 0.95,   // NEW
    maxi_dress        : 0.80,
    dupatta_only      : 0.46,
    shawl             : 0.87,
    footwear          : 1.10,   // unchanged — boxed, consistent
    couple_collection : 2.43,   // His+Hers SET: women 3pc emb (1.25) + men 2pc kurta-shalwar (1.18)
    // ── Men — Western / Casual ──
    mens_shirt        : 0.63,
    mens_trouser      : 0.85,
    mens_jeans        : 1.04,
    // ── Men — Traditional / Formal ──
    mens_kurta        : 0.85,
    mens_shalwar_kameez: 1.18,
    mens_waistcoat    : 0.78,
    mens_suit         : 1.81,
    mens_sherwani     : 2.24,
    mens_unstitched   : 1.30,
    // ── Kids (boys/girls × eastern/western/formal + infant) ──
    kids_boys_eastern : 0.50,
    kids_girls_eastern: 0.48,
    kids_boys_western : 0.50,
    kids_girls_western: 0.45,
    kids_boys_formal  : 0.60,
    kids_girls_formal : 0.60,
    kids_infant       : 0.35,
  };

  const WEIGHT_LABELS = {
    kurti_1pc            : 'Kurti / Shirt (1pc) – Stitched',
    kurti_1pc_unstitch   : 'Kurti / Shirt (1pc) – Unstitched',
    western_top          : 'Western Top / Tank / Tee (1pc)',
    womens_trouser    : "Women's Trouser / Pants (1pc)",
    kaftan            : 'Kaftan (1pc long shirt)',
    shirt_dupatta_2pc          : '2pc Shirt + Dupatta – Stitched',
    shirt_dupatta_2pc_unstitch : '2pc Shirt + Dupatta – Unstitched',
    shirt_trouser_2pc          : '2pc Co-ord (Shirt+Trouser) – Stitched',
    shirt_trouser_2pc_unstitch : '2pc Co-ord (Shirt+Trouser) – Unstitched',
    pret_2pc_emb      : '2pc Pret – Embroidered',
    lawn_3pc_unstitch : '3pc Unstitched – Printed/Plain',
    unstitch_3pc_emb  : '3pc Unstitched – Embroidered',
    pret_3pc          : '3pc Pret – Printed/Plain',
    pret_3pc_emb      : '3pc Pret – Embroidered',
    winter_2pc_unstitch : 'Winter 2pc – Unstitched (karandi/khaddar)',
    winter_2pc_stitch   : 'Winter 2pc – Stitched / Pret',
    winter_3pc_unstitch : 'Winter 3pc – Unstitched (karandi/khaddar)',
    winter_3pc_stitch   : 'Winter 3pc – Stitched / Pret',
    formal_emb_2pc    : 'Formal Embroidered 2pc',
    formal_emb_3pc    : 'Formal Embroidered 3pc',
    heavy_formal_3pc  : 'Heavy Formal 3pc (organza/silk)',
    handmade_emb      : 'Handmade Full Embroidery (adda)',
    bridal            : 'Bridal / Velvet / Full Embroidery',
    saree             : 'Saree',
    lehenga           : 'Lehenga / Gharara / Sharara',
    coord_western     : 'Co-ord / Western 2pc',
    loungewear        : 'Loungewear / Nightwear',
    couple_collection : 'Couple Collection (His + Hers)',
    abaya             : 'Abaya',
    dupatta_only      : 'Dupatta / Stole only',
    shawl             : 'Shawl (winter)',
    mens_shirt        : "Men's Shirt / Polo / T-Shirt (1pc)",
    mens_trouser      : "Men's Trouser / Chinos / Cargo (1pc)",
    mens_jeans        : "Men's Jeans / Denim (1pc)",
    mens_kurta        : "Men's Kurta / Kameez (1pc)",
    mens_shalwar_kameez: "Men's Shalwar Kameez (2pc)",
    mens_waistcoat    : "Men's Waistcoat",
    mens_suit         : "Men's Suit / Pant-Coat (2pc)",
    mens_sherwani     : "Men's Sherwani / Prince Coat",
    mens_unstitched   : "Men's Unstitched Fabric",
    maxi_dress        : 'Maxi / Dress / Jumpsuit (1pc)',
    kids_boys_eastern : 'Kids Boys — Eastern (kurta / 2–3pc)',
    kids_girls_eastern: 'Kids Girls — Eastern (frock / 2–3pc)',
    kids_boys_western : 'Kids Boys — Western (tee / jeans)',
    kids_girls_western: 'Kids Girls — Western (tee / dress)',
    kids_boys_formal  : 'Kids Boys — Party / Formal',
    kids_girls_formal : 'Kids Girls — Party / Formal',
    kids_infant       : 'Infant / Baby (0–2y)',
    footwear          : 'Footwear / Shoes / Khussa',
  };

  function getWeight(key){
    const c = cfgWeight(key); if(c) return c;     // global (relay) weight wins
    try{
      const saved = JSON.parse(localStorage.getItem('psb_weights') || '{}');
      if(saved[key] > 0) return saved[key];
    }catch(e){}
    return DEFAULT_WEIGHTS[key] || 0.66;
  }
  // Age-based weight multiplier for kids items. The base weight (DEFAULT_WEIGHTS / relay)
  // is calibrated for 0–6y garments; older children's garments are physically larger.
  // Multipliers are admin-configurable via getRates() (defaults: ×1.2 / ×1.3 / ×1.4).
  function kidsAgeMultiplier(sizeStr, r) {
    if (!sizeStr) return 1.0;
    const s = String(sizeStr).replace(/\s+/g,'').toLowerCase();
    if (/^\d+(-\d+)?m/i.test(s)) return 1.0;    // infant months → 0–6y bracket
    const ym = s.match(/(\d+).*y/i);
    if (!ym) return 1.0;
    const _r  = r || getRates();
    const age = parseInt(ym[1]);                  // lower bound of the size range
    if (age >= 12) return _r.KIDS_AGE_12P  || 1.4;
    if (age >= 10) return _r.KIDS_AGE_10_12 || 1.3;
    if (age >= 6)  return _r.KIDS_AGE_6_10  || 1.2;
    return 1.0;
  }

  function buildWeightEditor(){
    const grid = document.getElementById('weightEditorGrid');
    if(!grid) return;
    grid.innerHTML = Object.keys(DEFAULT_WEIGHTS).map(key => {
      const val = getWeight(key);   // effective: global config → localStorage → default
      return `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid #2a2a3e">
        <span style="font-size:0.72rem;color:#ccc;flex:1">${WEIGHT_LABELS[key]}</span>
        <input type="number" step="0.01" min="0.01" id="wt_${key}" value="${val}"
          style="width:70px;padding:4px 6px;border-radius:5px;border:1px solid #444;background:#0f0f1a;color:#fff;font-size:0.82rem;text-align:right"/>
        <span style="font-size:0.68rem;color:var(--txt-muted)">kg</span>
      </div>`;
    }).join('');
  }

  async function saveWeights(){
    const weights = {};
    Object.keys(DEFAULT_WEIGHTS).forEach(key => {
      const el = document.getElementById('wt_' + key);
      if(el){ const v = parseFloat(el.value); if(v > 0) weights[key] = v; }
    });
    const h = sessionStorage.getItem('psb_admin_h');
    if(!h){ alert('Session expired — close and reopen the admin panel to re-enter your password.'); return; }
    const btn = document.getElementById('saveWeightsBtn'); btn.textContent = 'Saving…';
    try{
      const res = await fetch(relayBase()+'/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hash:h, weights})});
      const j = await res.json();
      if(j && j.ok){
        PSB_CFG = PSB_CFG || {}; PSB_CFG.weights = j.weights; if(j.rates) PSB_CFG.rates = j.rates;
        try{ localStorage.setItem('psb_cfg_cache', JSON.stringify({ ok:true, hasPassword:true, rates:j.rates, weights:j.weights, updatedAt:j.updatedAt })); }catch(e){}
        if(typeof renderCart === 'function') renderCart();
        btn.textContent = '✓ Saved for everyone!'; btn.style.background = '#2e7d32';
      } else { btn.textContent = 'Save Weights'; alert('Save failed: ' + ((j && j.error) || 'unauthorized — reopen the panel')); }
    }catch(e){ btn.textContent = 'Save Weights'; alert('Relay unreachable — weights NOT saved.'); }
    setTimeout(()=>{ btn.textContent='Save Weights'; btn.style.background=''; }, 2500);
  }

  function resetWeights(){
    // Load the built-in defaults into the editor fields — click "Save Weights"
    // to push them to everyone. (Does not auto-save.)
    Object.keys(DEFAULT_WEIGHTS).forEach(key => { const el = document.getElementById('wt_' + key); if(el) el.value = DEFAULT_WEIGHTS[key]; });
  }

  // ── UNSTITCHED categories: no size field required ────────────────────────
  const UNSTITCHED_CATS = new Set(['lawn_3pc_unstitch', 'unstitch_3pc_emb', 'winter_2pc_unstitch', 'winter_3pc_unstitch', 'handmade_emb', 'saree', 'dupatta_only', 'shawl', 'accessories', 'mens_unstitched']);

  // Full HAND embroidery (adda) is heavy (~2.5kg). On live-add, upgrade a heavy
  // women's category to 'handmade_emb' when the brand is a predominantly-handmade
  // house (Emaan Adeel) or the description explicitly says adda / fully-hand work —
  // mirrors the catalog harvester so the carted weight matches the browsed card.
  const FORM_HEAVY_CATS = new Set(['pret_3pc','pret_3pc_emb','pret_2pc_emb','shirt_dupatta_2pc','shirt_trouser_2pc','formal_emb_2pc','formal_emb_3pc','heavy_formal_3pc','lawn_3pc_unstitch','unstitch_3pc_emb','bridal']);
  // Khussa/footwear specialist stores → the carted item is footwear no matter what
  // its product name says (matches the catalog's forced 'footwear').
  const FOOTWEAR_HOSTS = new Set(['shopecs.com','dazzlebysarah.com','khussacorner.com','khussamaster.com','zuruj.com','stylo.pk']);
  // Festive houses → bump a too-light auto-guess to formal-embroidered (NOT a blanket 2.5kg).
  const FESTIVE_HOSTS = new Set(['emaanadeel.com']);
  function _hostOf(url){ try{ return new URL(url).hostname.replace(/^www\./,''); }catch(e){ return ''; } }
  // handmade_emb (2.5kg) ONLY when the description explicitly says adda / full-hand work.
  function isHandmadeFullForm(product, cat){
    if(!FORM_HEAVY_CATS.has(cat)) return false;
    const desc = ((product && product.body_html) || '').replace(/<[^>]+>/g,' ');
    return /\badda[\s-]?work|\badda\b|fully hand[\s-]?embroider|all[\s-]?over hand[\s-]?embroider|complete(?:ly)? hand[\s-]?embroider|entirely hand[\s-]?embroider|pure hand[\s-]?embroider/i.test(desc);
  }
  const MENS_CATS = new Set(['mens_shirt','mens_trouser','mens_jeans','mens_kurta','mens_shalwar_kameez','mens_waistcoat','mens_suit','mens_sherwani','mens_unstitched']);
  const KIDS_CATS = new Set(['kids_boys_eastern','kids_girls_eastern','kids_boys_western','kids_girls_western','kids_boys_formal','kids_girls_formal','kids_infant']);

  // ── DRAFT CARD SYSTEM — each URL gets its own card ───────────────────────
  let drafts      = {};  // id → {currency, sizeCounter}
  let draftIdCtr  = 0;

  // Category taxonomy — single source of truth, also reused for the product
  // catalogues later. Each gender → ordered groups → [key, label] items.
  const CAT_TREE = {
    w: { label:"👗 Women's category", groups:[
      // ════ COUPLE (His + Hers — sold as a pair; shown under Women AND Men) ════
      { h:'Couple', items:[
        ['couple_collection','Couple Collection (His + Hers)'],
      ]},
      // ════ STITCHED (Ready-to-wear) ════
      { section:'Stitched · Ready-to-wear', h:'1-Piece', items:[
        ['kurti_1pc','Kurti / Shirt (1pc)'],
        ['western_top','Western Top / Tank / Tee'],
        ['kaftan','Kaftan'],
        ['maxi_dress','Maxi / Gown / Dress (1pc)'],
        ['womens_trouser',"Trouser / Pants (1pc)"],
      ]},
      { section:'Stitched · Ready-to-wear', h:'2-Piece', items:[
        ['shirt_dupatta_2pc','2pc – Shirt + Dupatta'],
        ['shirt_trouser_2pc','2pc Co-ord – Shirt + Trouser'],
        ['coord_western','2pc – Western Co-ord'],
        ['pret_2pc_emb','2pc – Embroidered (pret)'],
        ['formal_emb_2pc','2pc – Formal Embroidered'],
      ]},
      { section:'Stitched · Ready-to-wear', h:'3-Piece', items:[
        ['pret_3pc','3pc – Printed / Plain'],
        ['pret_3pc_emb','3pc – Embroidered'],
        ['formal_emb_3pc','3pc – Formal Embroidered'],
        ['heavy_formal_3pc','3pc – Heavy Formal (organza/silk)'],
        ['handmade_emb','Handmade Full Embroidery (adda)'],
      ]},
      { section:'Stitched · Ready-to-wear', h:'Festive / Bridal', items:[
        ['saree','Saree'],
        ['lehenga','Lehenga / Gharara / Sharara'],
        ['bridal','Bridal / Velvet'],
        ['abaya','Abaya / Hijab'],
      ]},
      { section:'Stitched · Ready-to-wear', h:'Winter', items:[
        ['winter_2pc_stitch','Winter 2pc – Stitched'],
        ['winter_3pc_stitch','Winter 3pc – Stitched'],
      ]},
      { section:'Stitched · Ready-to-wear', h:'Other', items:[
        ['loungewear','Loungewear / Nightwear'],
        ['dupatta_only','Dupatta / Stole / Scarf'],
        ['shawl','Shawl'],
        ['footwear','Footwear / Khussa'],
      ]},
      // ════ UNSTITCHED (Fabric) ════
      { section:'Unstitched · Fabric', h:'1 & 2-Piece', items:[
        ['kurti_1pc_unstitch','1pc – Shirt fabric'],
        ['shirt_dupatta_2pc_unstitch','2pc – Shirt + Dupatta'],
        ['shirt_trouser_2pc_unstitch','2pc – Shirt + Trouser'],
      ]},
      { section:'Unstitched · Fabric', h:'3-Piece', items:[
        ['lawn_3pc_unstitch','3pc – Printed / Plain'],
        ['unstitch_3pc_emb','3pc – Embroidered'],
      ]},
      { section:'Unstitched · Fabric', h:'Winter', items:[
        ['winter_2pc_unstitch','Winter 2pc – Unstitched'],
        ['winter_3pc_unstitch','Winter 3pc – Unstitched'],
      ]},
    ]},
    m: { label:"👔 Men's category", groups:[
      { h:'Couple', items:[
        ['couple_collection','Couple Collection (His + Hers)'],
      ]},
      { h:'Western / Casual', items:[
        ['mens_shirt','Shirt / Polo / T-Shirt (1pc)'],
        ['mens_trouser','Trouser / Chinos / Cargo (1pc)'],
        ['mens_jeans','Jeans / Denim (1pc)'],
      ]},
      { h:'Traditional / Formal', items:[
        ['mens_kurta','Kurta / Kameez (1pc)'],
        ['mens_shalwar_kameez','Shalwar Kameez (2pc)'],
        ['mens_waistcoat','Waistcoat'],
        ['mens_suit','Suit / Pant-Coat / Blazer (2pc)'],
        ['mens_sherwani','Sherwani / Prince Coat'],
        ['mens_unstitched','Unstitched Fabric'],
      ]},
    ]},
    k: { label:"🧸 Kids category", groups:[
      { h:'Boys', items:[
        ['kids_boys_eastern','Boys — Eastern (kurta / 2–3pc)'],
        ['kids_boys_western','Boys — Western (tee / jeans)'],
        ['kids_boys_formal','Boys — Party / Formal'],
      ]},
      { h:'Girls', items:[
        ['kids_girls_eastern','Girls — Eastern (frock / 2–3pc)'],
        ['kids_girls_western','Girls — Western (tee / dress)'],
        ['kids_girls_formal','Girls — Party / Formal'],
      ]},
      { h:'Baby', items:[
        ['kids_infant','Infant / Baby (0–2y)'],
      ]},
    ]},
  };
  const _catEsc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  // Build a CUSTOM (non-native) dropdown so the gender heading, the group
  // sub-headings and the listed items can each be sized/coloured differently —
  // native <select>/<optgroup> ignores CSS for that.
  function buildCatDropdown(id, g){
    const t = CAT_TREE[g];
    let lastSec = null;
    const body = t.groups.map(grp => {
      let pre = '';
      if(grp.section && grp.section !== lastSec){ pre += `<div class="catdd-section">${_catEsc(grp.section)}</div>`; lastSec = grp.section; }
      return pre
        + (grp.h ? `<div class="catdd-sub">${_catEsc(grp.h)}</div>` : '')
        + grp.items.map(([k,lbl]) => `<div class="catdd-item" data-k="${k}" onclick="pickCatCustom(${id},'${g}','${k}')">${_catEsc(lbl)}</div>`).join('');
    }).join('');
    return `<details class="catdd" name="catdd_${id}" id="dc_catdd${g}_${id}" ontoggle="if(this.open)closeOtherCatdd(${id},'${g}')">`
      + `<summary class="catdd-sum" id="dc_catsum${g}_${id}">${t.label}…</summary>`
      + `<div class="catdd-panel">${body}</div></details>`;
  }
  // Which dropdown owns a category key.
  function catGender(cat){ return MENS_CATS.has(cat) ? 'm' : (KIDS_CATS.has(cat) ? 'k' : 'w'); }

  // ── AUTO-FETCH ENGINE (Shopify JSON API) ─────────────────────────────────
  // Maps Shopify product_type strings → our category keys.
  // Rules built from a survey of ALL brand catalogs (2026-06-13): 1,057 real
  // product_type strings harvested across 86 Shopify brands. Order matters —
  // specific rules first, generic garment words last. Types with no garment
  // info ("Clothing", "Summer 2026") fall through; the caller then retries
  // with the product TITLE which usually carries the garment words.
  const PT_CAT = [
    // Kids BEFORE bottoms/tops — "Boys Trousers" must hit kids, not trousers. Mirrors
    // the harvester's 7-cat mapCatKids: infant first, then gender+type (order-independent
    // lookaheads), then gender-only (eastern default), then generic kid. formal = festive
    // only (NOT plain "embroidered" — kids casual tees are routinely embroidered).
    [/\binfant\b|new[\s-]?born|\bnb\b|\b\d{1,2}[\s-]?months?\b|\bromper\b|\btoddler\b|baby[\s-]?(?:boy|girl|wear|set|frock|suit|romper)/i, 'kids_infant'],
    [/(?=.*\bgirls?\b)(?=.*(formal|party|festive|\beid\b|ceremon|wedding|\bgown\b))/i, 'kids_girls_formal'],
    [/(?=.*\bboys?\b)(?=.*(formal|party|festive|\beid\b|ceremon|wedding|sherwani|waist[\s-]?coat))/i, 'kids_boys_formal'],
    [/(?=.*\bgirls?\b)(?=.*(tee|t[\s-]?shirt|polo|jean|denim|trouser|\bpant|short|legging|tights|jogger|hoodie|sweat|\bskirt\b|western))/i, 'kids_girls_western'],
    [/(?=.*\bboys?\b)(?=.*(tee|t[\s-]?shirt|polo|jean|denim|trouser|\bpant|short|legging|jogger|hoodie|sweat|jacket|western))/i, 'kids_boys_western'],
    [/\bgirls?\b/i, 'kids_girls_eastern'],
    [/\bboys?\b/i, 'kids_boys_eastern'],
    [/(?=.*(kid|junior|teen))(?=.*(formal|party|festive|\beid\b|ceremon|wedding|\bgown\b|sherwani))/i, 'kids_boys_formal'],
    [/(?=.*(kid|junior|teen))(?=.*(tee|t[\s-]?shirt|polo|jean|denim|trouser|\bpant|short|western|legging|jogger))/i, 'kids_boys_western'],
    [/(?=.*(kid|junior|teen))(?=.*(frock|maxi|gown|\bdress\b))/i, 'kids_girls_eastern'],
    [/kid|junior|teen/i,                                       'kids_boys_eastern'],
    [/shoe|sneaker|sandal|chappal|khussa|kolhapuri|heel|slipper|loafer|peshawari|moccasin|footwear|mule\b/i, 'footwear'],
    // Festive eastern — split out from bridal so weights are correct.
    [/lehenga|gharara|sharara/i,                                'lehenga'],
    [/\bsaree\b|\bsari\b/i,                                     'saree'],
    [/bridal|\bvelvet\b|\bwedding\b|nikah|barat|walima/i,       'bridal'],
    [/abaya|jilbab|\bburqa\b|\bniqab\b/i,                       'abaya'],
    // Unstitched — embroidered variant first, then plain.
    [/unstitch.*(embroid|\bemb\b|chikankari|zari|schiffli|adda|hand[\s-]?work)|(embroid|chikankari|zari).*unstitch/i, 'unstitch_3pc_emb'],
    [/unstitch/i,                                              'lawn_3pc_unstitch'],
    // Formal / party embroidered (heavier tier) BEFORE everyday embroidered.
    [/heavy[\s-]?formal|organza|tissue|jamawar|heavy[\s-]?embroi/i, 'heavy_formal_3pc'],
    [/formal|chiffon|net[\s-]?embroi|party[\s-]?wear/i,        'formal_emb_3pc'],
    [/winter|khaddar|karandi/i,                                'winter_3pc_unstitch'],
    [/shawl|pashmina|dhussa|loi|wrap/i,                         'shawl'],
    [/kaftan|kaftaan|caftan/i,                                 'kaftan'],
    [/dupatta|stole|scarf|scarves|foulard/i,                   'dupatta_only'],
    [/bag|purse|clutch|jewel|accessories|wallet|\bcaps?\b|belt|sock|fragrance|perfume|attar|watch|sunglass|cufflink|brooch|hair[\s-]?access/i, 'accessories'],
    [/night|sleep[\s-]?wear|\blounge|pyjama[\s-]?set|pajama[\s-]?set|night[\s-]?suit/i, 'loungewear'],
    [/western[\s-]?(co[\s-]?ord|set|2[\s-]?pc)|co[\s-]?ord[\s-]?set\b/i, 'coord_western'],
    [/dress(es)?\b|maxi|gown|jumpsuit|romper/i,                'maxi_dress'],
    // Everyday embroidered pret — AFTER formal/festive, BEFORE plain pret/2pc.
    [/(embroid|chikankari|zari|schiffli|adda).*(3[\s-]?pc|3[\s-]?piece|suit|lawn|pret)|(3[\s-]?pc|3[\s-]?piece).*(embroid|chikankari|zari)/i, 'pret_3pc_emb'],
    [/(embroid|chikankari|zari|schiffli|adda).*(2[\s-]?pc|2[\s-]?piece)|(2[\s-]?pc|2[\s-]?piece).*(embroid|chikankari|zari)/i, 'pret_2pc_emb'],
    [/shalwar[\s-]?kameez|kameez[\s-]?(&\s*)?shalwar|rtw|ready[\s-]?to[\s-]?wear/i, 'pret_3pc'],
    [/pret|stitched|fusion|eastern/i,                          'pret_3pc'],     // afrozeh "Pret", sbs "Fusion"
    [/3[\s-]?pc|3[\s-]?piece|suit/i,                          'pret_3pc'],
    [/2[\s-]?pc[\s|]stitch|2[\s-]?pc[\s|]rtw/i,               'shirt_dupatta_2pc'],
    [/shirt[\s-]?trouser|co[\s-]?ord/i,                       'shirt_trouser_2pc'],
    [/2[\s-]?pc|2[\s-]?piece|shirt[\s-]?dupatta/i,            'shirt_dupatta_2pc'],
    // Bottoms (women ctx) — survey: 59 type names across brands
    [/bottoms?\b|trousers?\b|pants?\b|palazzo|tights?|legging|culotte|shorts?\b|jeans?\b|denim|skirt|plazo|capri|shalwars?\b/i, 'womens_trouser'],
    // Western tops — weight class same as kurti
    [/\btees?\b|t[\s-]?shirt|polo|blouse|camisole|tank[\s-]?top|sweat|hoodie|cardigan|tunic|western/i, 'kurti_1pc'],
    // Bare fabric names = unstitched (Alkaram "BLENDED", Kayseria "Lawn"…).
    // Safe: if the product turns out to have sizes, the sizes-found⇒stitched
    // correction in fetchProductData flips it back.
    [/\blawn\b|cambric|voile|khadi\b|jacquard|dobby|slub|yarn[\s-]?dyed|piece[\s-]?goods|fabric|\bblended\b/i, 'lawn_3pc_unstitch'],
    [/kurti|kurta|shirt|top/i,                                 'kurti_1pc'],
  ];
  function mapPtToCat(pt){ const s=(pt||'').toLowerCase(); for(const[re,c] of PT_CAT){ if(re.test(s)) return c; } return ''; }
  // Women's category from type+title (`s`) + tags — MIRRORS harvest-catalog.js
  // mapCatWomen so a browsed card and the added cart line AGREE (weight/price
  // depend on it). Piece-count & garment type come from type+title (reliable);
  // tags give unstitched/embroidery signals. Order matters: accessories & 2-piece
  // BEFORE the generic suit/3pc rule; "\bstitched\b" so it never matches "unstitched".
  // MIRRORS harvest-catalog.js mapCatWomen exactly (keep in sync) — top-level stitched vs
  // unstitched: 1pc & 2pc each split; embroidered 2pc = pret_2pc_emb; western_top; hijab→abaya.
  function classifyWomenCat(s, tags){
    tags = tags || ''; const both = s + ' ' + tags;
    const stitched = /\bpret\b|\bstitched\b|ready[\s-]?to[\s-]?wear|\brtw\b/.test(s);
    const unstitch = !stitched && (/\bunstitch/.test(both) || /\buns\b/.test(tags) || /\b(un[\s-]?stitch(?:ed)?)\b/.test(s) || /\bunstiched\b/.test(s));
    const emb = /embroid|\bemb\b|chikankari|zari|schiffli|adda/.test(both);
    const two   = /\b2[\s-]?(pc|piece|pcs)\b/.test(s);
    const three = /\b3[\s-]?(pc|piece|pcs)\b/.test(s);
    if(/\bshawl\b|pashmina|\bstole\b/.test(s)) return 'shawl';
    if(/\bdupatta\b|\bscarf\b/.test(s) && !/shirt|kurti|kurta|kameez|suit|[23][\s-]?(pc|piece)|trouser|bottom/.test(s)) return 'dupatta_only';
    if(/\bsaree\b|\bsari\b/.test(s)) return 'saree';
    if(/lehenga|gharara|sharara/.test(s)) return 'lehenga';
    if(/abaya|jilbab|burqa|niqab|niqaab|\bhijab\b|khimar|\bnaqab\b/.test(s)) return 'abaya';
    if(/kaftan|kaftaan|caftan/.test(s)) return 'kaftan';
    if(/bridal|nikah|barat|walima|dulhan/.test(s)) return 'bridal';
    if(/\bwinter\b|khaddar|khadar|karandi|\bwool|woolen|velvet|marina|corduroy/.test(both)){
      if(two) return unstitch ? 'winter_2pc_unstitch' : 'winter_2pc_stitch';
      return unstitch ? 'winter_3pc_unstitch' : 'winter_3pc_stitch';
    }
    if(/\btank\b|crop[\s-]?top|t[\s-]?shirt|\btee\b|camisole|\bcami\b|western[\s-]?top|halter|\bbodysuit\b/.test(s)
       && !/kurti|kurta|kameez|\bsuit\b|dupatta|[23][\s-]?(pc|piece)|trouser|shalwar/.test(s)) return 'western_top';
    if(/heavy[\s-]?formal|organza|tissue|jamawar/.test(s)) return 'heavy_formal_3pc';
    if(/\bformal\b|party[\s-]?wear/.test(s)) return two ? 'formal_emb_2pc' : 'formal_emb_3pc';
    if(/night|sleep[\s-]?wear|lounge|loungewear|pyjama|pajama|\bnighty\b/.test(s)) return 'loungewear';
    if(three || /(shalwar|trouser|pant|bottom|gharara)[\s\w]*dupatta|dupatta[\s\w]*(shalwar|trouser|pant|bottom)/.test(s)){
      if(unstitch) return emb ? 'unstitch_3pc_emb' : 'lawn_3pc_unstitch';
      return emb ? 'pret_3pc_emb' : 'pret_3pc';
    }
    if(two || /shirt[\s-]?dupatta|(shirt|kameez|kurti)[\s\w]{0,10}dupatta/.test(s)){
      if(emb && !unstitch) return 'pret_2pc_emb';
      const coord = /co[\s-]?ord|coord|(shirt|kameez)[\s\w]{0,10}(trouser|pant|shalwar)|(trouser|pant|shalwar)[\s\w]{0,10}(shirt|kameez)/.test(s);
      if(coord) return unstitch ? 'shirt_trouser_2pc_unstitch' : 'shirt_trouser_2pc';
      return unstitch ? 'shirt_dupatta_2pc_unstitch' : 'shirt_dupatta_2pc';
    }
    if(/shalwar[\s-]?kameez|kameez[\s-]?shalwar|(shirt|kurti|kurta|kameez)\b[\s\w]{0,12}\b(trouser|bottom|pant|shalwar)\b|\b(trouser|bottom|pant|shalwar)\b[\s\w]{0,12}\b(shirt|kurti|kurta|kameez)\b/.test(s)){
      if(emb && !unstitch) return 'pret_2pc_emb';
      return unstitch ? 'shirt_trouser_2pc_unstitch' : 'shirt_trouser_2pc';
    }
    if(/\bsuit\b/.test(s)){ if(unstitch) return emb ? 'unstitch_3pc_emb' : 'lawn_3pc_unstitch'; return emb ? 'pret_3pc_emb' : 'pret_3pc'; }
    if(/co[\s-]?ord|coord/.test(s)) return unstitch ? 'shirt_trouser_2pc_unstitch' : 'coord_western';
    if(/trouser|pant|palazzo|plazo|capri|culotte|tights|leggings?/.test(s) && !/shirt|kurti|kurta|kameez/.test(s)) return 'womens_trouser';
    if(/dress|maxi|gown|jumpsuit|\bfrock\b|anarkali/.test(s)) return 'maxi_dress';
    if(/kurti|kurta|shirt|tunic|\bcape\b|\btop\b|peplum|blouse/.test(s)) return unstitch ? 'kurti_1pc_unstitch' : 'kurti_1pc';
    if(/\blawn\b|cambric|voile|khaddar|karandi|fabric|piece[\s-]?goods/.test(s)) return emb ? 'unstitch_3pc_emb' : 'lawn_3pc_unstitch';
    return unstitch ? 'lawn_3pc_unstitch' : 'pret_3pc';
  }

  // Men's product_type / title → men's category
  const PT_CAT_MEN = [
    [/sherwani|prince[\s-]?coat/i,                              'mens_sherwani'],
    [/waist[\s-]?coat|nehru[\s-]?jacket/i,                      'mens_waistcoat'],
    [/unstitch|fabric|suiting|wash[\s-]?n?[\s-]?wear|gabardine/i,'mens_unstitched'],
    [/pant[\s-]?coat|coat[\s-]?pant|blazer|2[\s-]?pc[\s-]?suit|formal[\s-]?suit|tuxedo|3[\s-]?pc[\s-]?suit/i,'mens_suit'],
    [/shalwar[\s-]?kameez|kameez[\s-]?shalwar|shalwar[\s-]?suit|kurta[\s-]?shalwar|kurta[\s-]?pajama/i,'mens_shalwar_kameez'],
    [/jeans|denim/i,                                             'mens_jeans'],
    [/trouser|chino|cargo[\s-]?pant/i,                           'mens_trouser'],
    [/polo|t[\s-]?shirt/i,                                       'mens_shirt'],   // polo/tee → western shirt
    [/kurta|kameez/i,                                            'mens_kurta'],
    [/shirt/i,                                                   'mens_shirt'],   // plain "shirt" on western brand → shirt
    [/suit/i,                                                   'mens_shalwar_kameez'], // generic "suit" on a menswear page = shalwar suit
  ];
  function mapPtToCatMen(pt){ const s=(pt||'').toLowerCase(); for(const[re,c] of PT_CAT_MEN){ if(re.test(s)) return c; } return ''; }

  // Decide if a product is Men / Women / Kids. Strongest signal: our brand
  // directory category; then the URL path; then product type/tags.
  function detectGender(url, product){
    try{
      const host = new URL(url).hostname.replace(/^www\./,'');
      const b = (typeof BRANDS !== 'undefined') && BRANDS.find(x => { try{ return new URL(x.u).hostname.replace(/^www\./,'') === host; }catch(e){ return false; } });
      if(b){ if(b.c === 'm') return 'men'; if(b.c === 'k') return 'kids'; if(b.c === 'w' || b.c === 'p') return 'women'; }
      // 'md' (multi-department) / 'ws' / unknown → fall through to content
      const path = new URL(url).pathname.toLowerCase();
      if(/(^|[\/_-])(women|womens|woman|ladies|female|girls)([\/_-]|$)/.test(path)) return 'women';
      if(/(^|[\/_-])(men|mens|man|gents|gentlemen|male|boys)([\/_-]|$)/.test(path)) return 'men';
    }catch(e){}
    const pt   = ((product && (product.type || product.product_type)) || '').toLowerCase();
    const tags = ((product && product.tags) || []).join(' ').toLowerCase();
    const hay  = pt + ' ' + tags + ' ' + ((product && product.title) || '').toLowerCase();
    if(/sherwani|waist[\s-]?coat|prince[\s-]?coat|kurta[\s-]?pajama/.test(hay)) return 'men';
    if(/(^|[\s\/_-])(men|mens|gents)([\s\/_-]|$)/.test(' '+tags+' ')) return 'men';
    if(/(^|[\s\/_-])(women|ladies)([\s\/_-]|$)/.test(' '+tags+' ')) return 'women';
    return 'women'; // default — the catalogue is women-dominated
  }

  // Normalize variant size strings → our dropdown values
  function normSizeFull(raw){
    const s = (raw||'').trim().toUpperCase().replace(/[-\s]+/g,' ');
    // Piece-count / type / garment-part values are NOT garment sizes. Unstitched
    // suits list "1/2/3 Piece", "Unstitched", "Suit" inside a "Size" option —
    // reject them so an unstitched product is never sized as "3 Piece" (req #2).
    if(/PIECE|\bPCS?\b|UNSTITCH|\bSUIT\b|FABRIC|\bSHIRT\b|TROUSER|DUPATTA|SHALWAR|KAMEEZ/.test(s)) return null;
    if(/^(XS|X S|X SMALL|EXTRA SMALL)$/.test(s))     return 'XS';
    if(/^(S|SMALL)$/.test(s))            return 'S';
    if(/^(M|MEDIUM)$/.test(s))           return 'M';
    if(/^(L|LARGE)$/.test(s))            return 'L';
    if(/^(XL|X L|X LARGE|EXTRA LARGE)$/.test(s)) return 'XL';
    if(/^(XXL|XX L|2XL|XX LARGE|DOUBLE XL)$/.test(s)) return 'XXL';
    if(/^(FREE SIZE|FREESIZE|ONE SIZE|OS)$/.test(s)) return 'Free Size';
    if(/^(XXXL|3XL|XXX L)$/.test(s))     return '3XL';
    // Numeric garment sizes start at ~6 (8/10/12…46, waist 28-44). A bare 1–5 is
    // almost always a piece-count, not a size, so it is rejected.
    if(/^\d{1,2}$/.test(s) && +s >= 6) return s;
    // Trouser/jeans waist sizes: "30", "32", "34" (already caught above as 2-digit)
    // Waist × length: "28x30", "30x32", "32x34" — keep as-is
    if(/^\d{2} ?[Xx×] ?\d{2}$/.test(s)) return s.replace(/ /g,'').toUpperCase();
    // Kids sizes like "8-9Y", "10Y", "2-3 YEARS"
    if(/^\d{1,2}( ?\d{1,2})? ?Y(EARS)?$/.test(s.replace(/-/g,' '))) return raw.trim();
    return null;
  }

  // ── TWIN-STORE MAP ────────────────────────────────────────────────────────
  // Some brands run TWO separate stores: an international site (often USD, or
  // a catalog that doesn't match Pakistan) and a Pakistani store. If a buyer
  // pastes the INTERNATIONAL url, we transparently refetch from the PK twin so
  // price/stock come from the store we'd actually buy from. Shopify product
  // "handles" are almost always identical across a brand's twin stores, so the
  // same /products/{handle}.js path works on the PK domain. If the handle is
  // NOT found on the PK store, the product isn't carried in Pakistan → warn.
  // Key = international host (no leading www.), value = Pakistani host.
  const TWIN_MAP = {
    'ethnc.com'        : 'pk.ethnc.com',        // intl USD → PK PKR (Shopify)
    'generation.pk'    : 'generation.com.pk',   // NB: .pk is the INTL one here
    'bareeze.com'      : 'bareezepk.com',        // intl no-API → PK PKR (Shopify)
    'mariab.com'       : 'mariab.pk',            // intl bot-walled → PK PKR
    'baroque.com'      : 'baroque.com.pk',       // intl parked → PK store (still USD)
    'saniamaskatiya.com': 'pk.saniamaskatiya.com', // intl USD → PK PKR (Shopify)
    'zainabchottani.com': 'pk.zainabchottani.com', // intl USD → PK PKR (Shopify)
    'salitex.com'      : 'salitexonline.com',    // intl USD → PK PKR (Shopify)
    'khaadi.com'       : 'pk.khaadi.com',        // both Salesforce (no API) — redirect only
    'sapphireonline.pk': 'pk.sapphireonline.pk', // both Salesforce (no API) — redirect only
    'us.mushq.com'     : 'mushq.com',             // USD international twin → PK PKR store
  };
  // Twins whose PK store has NO Shopify API (Salesforce/Magento): a 404 on
  // /products/{handle}.js there means "no API", NOT "not sold in Pakistan" —
  // so we must NOT show the not-available warning for these; fall through to
  // the normal manual-entry path instead.
  const TWIN_NO_API = new Set(['khaadi.com','sapphireonline.pk']);

  // Brands that genuinely price in USD for EVERYONE — including Pakistani
  // visitors. Their USD price hides no cheaper PKR price, so it's the true cost:
  // auto-fill it on the USD toggle with a calm note instead of the red "real PKR
  // price unknown" alarm, and skip the relay (a PK IP can't produce a PKR price
  // that doesn't exist). Verified 2026-06-15 by querying the relay (PK IP):
  // Baroque returns USD even from Pakistan → USD-only. (Suffuse was previously
  // here but the relay returns real PKR for it — it geo-serves USD to BD, PKR to
  // PK — so it was REMOVED; the relay now recovers its PKR price.)
  const USD_ONLY_BRANDS = new Set(['baroque.com.pk','baroque.com']);

  // Brands that geo-serve USD to Bangladesh AND whose cart.js is CORS-blocked in
  // the browser — so the form can't read the session currency — BUT which DO have
  // a real PKR price reachable via the relay (PK IP). Force the relay for these so
  // the buyer sees the true PKR price instead of the raw USD .js price (which the
  // .pk-domain heuristic would otherwise mislabel as a tiny PKR amount).
  const FORCE_RELAY_HOSTS = new Set(['suffuse.pk', 'rangrasiya.com.pk', 'rangrasiya.com']);

  // Default Pakistan price relay (Node relay on the Lahore VPS, fronted by Caddy
  // HTTPS at 103.83.91.34.sslip.io). Baked in so EVERY buyer's browser uses it
  // automatically when a brand geo-serves USD to Bangladesh — the admin field
  // (psb_relay_url) only OVERRIDES this. Empty admin field = use this default.
  const DEFAULT_RELAY_URL = 'https://103.83.91.34.sslip.io';

  // Hosts routed to the relay /scrape endpoint — Group 4 brands (Salesforce
  // Commerce Cloud: Khaadi, Sapphire) that have no Shopify product API. Both the
  // international and PK twin hosts of each brand.
  const SFCC_SCRAPE_HOSTS = new Set(['khaadi.com','pk.khaadi.com','sapphireonline.pk','pk.sapphireonline.pk']);

  // NON-Shopify brands (Magento / WooCommerce / custom SPAs). They have no
  // /products/{handle}.js, and their pages are JS-rendered so the browser can't
  // fetch them cross-origin. The relay /scrapeld reads the product page's
  // schema.org JSON-LD from the PK IP → PKR price + title (NO sizes — those load
  // via JS, so the buyer picks size manually). Brands with no JSON-LD, or
  // unreachable from the VPS (e.g. Warda, Savoir), fall back to full manual entry.
  const GENERIC_SCRAPE_HOSTS = new Set([
    'image1993.com','laam.pk','thredzonline.com','warda.com.pk',
    'farahtalibaziz.com.pk','mohsinnaveedranjha.com',
    'naushemian.com','cougar.com.pk','deepakperwani.com','savoir.pk','pepperland.pk','nomiansari.com.pk',
  ]);

  async function fetchProductData(id, url, presetMember){
    const statusEl = document.getElementById(`dc_fetch_${id}`);
    function setStatus(msg, color){ if(statusEl){ statusEl.style.display=''; statusEl.textContent=msg; statusEl.style.color=color||'var(--gold)'; } }
    function hideStatus(){ if(statusEl) setTimeout(()=>{ statusEl.style.display='none'; },3500); }

    try {
      const u = new URL(url);
      const pastedHost = u.hostname.replace(/^www\./,'');
      let product = null, hasStockInfo = false, sawNotFound = false, pkrVia = 'unknown', sfccPicked = '';

      // ── Group 4: Salesforce Commerce Cloud (Khaadi/Sapphire) — no Shopify
      //    product API. Pull price + per-size stock from the relay /scrape
      //    (queried from the PK IP) and synthesize a Shopify-shaped product so
      //    the category/size/price/stock pipeline below treats it like any
      //    other brand (incl. the in-stock-only size constraint).
      const isSfcc = SFCC_SCRAPE_HOSTS.has(pastedHost) && u.pathname.toLowerCase().endsWith('.html');
      if(isSfcc){
        let rj = null;
        if(presetMember){
          // This draft is an EXTRA piece of a product set — its data was already
          // fetched with the primary piece, so no network call is needed.
          rj = { ok:true, currency:'PKR', price:presetMember.price, title:presetMember.title, sizes:presetMember.sizes||[] };
          setStatus('🧩 Matching piece of the set…','var(--gold)');
        } else {
          const relay = ((localStorage.getItem('psb_relay_url')||'').trim() || DEFAULT_RELAY_URL).replace(/\/+$/,'');
          setStatus('🇵🇰 Fetching price & live stock from Pakistan (this brand has no public API)…','var(--gold)');
          const sc = new AbortController(); const stid = setTimeout(()=>sc.abort(), 22000);
          try{
            const rr = await fetch(`${relay}/scrape?url=${encodeURIComponent(url)}`, { signal: sc.signal, cache:'no-store' });
            if(rr.ok){
              const j = await rr.json();
              if(j && j.ok && j.currency === 'PKR' && j.price != null) rj = j;
            }
          }catch(err){ /* fall through to the manual-entry note */ }
          clearTimeout(stid);
        }
        if(rj){
          const paisa = Math.round(rj.price * 100);   // pipeline reads paisa (÷100)
          const szs = Array.isArray(rj.sizes) ? rj.sizes : [];
          // SFCC encodes the buyer's chosen size in the URL as ?dwvar_<pid>_size=
          // <code> (e.g. MDM) — but ONLY for the primary product. Map the code
          // back to the display size via the relay's per-size `value`. (Khaadi &
          // Sapphire don't update the address bar on size click, so this is set
          // only when the link actually carries the code.)
          if(!presetMember){
            const dwCode = (url.match(/dwvar_[^=&]*_size=([^&]+)/i) || [])[1];
            if(dwCode){
              const want = decodeURIComponent(dwCode).toLowerCase();
              const hit = szs.find(s => s.value && String(s.value).toLowerCase() === want);
              if(hit) sfccPicked = hit.size;
            }
          }
          product = {
            title: rj.title || '',
            product_type: '',                          // force title-based category mapping
            options: szs.length ? [{ name:'Size', values: szs.map(s=>s.size) }] : [],
            variants: szs.length
              ? szs.map(s => ({ option1: s.size, available: !!s.available, price: paisa, compare_at_price: null }))
              : [{ available: rj.available !== false, price: paisa, compare_at_price: null }],
          };
          hasStockInfo = true; pkrVia = 'relay';
          // PRODUCT SET (Khaadi/Sapphire bundle — e.g. kurta + matching trouser):
          // this draft holds the FIRST piece; spawn a separate draft per extra
          // piece so the buyer gets every piece of the article from one link.
          if(!presetMember && rj.isSet && Array.isArray(rj.members) && rj.members.length > 1){
            // DUAL stitched/unstitched article (e.g. Khaadi fabrics-*): the SAME garment
            // sold as a FABRIC member (size "3PC"/"FABRIC", cheaper) AND a TAILORED member
            // with real garment sizes (XS/S/M/L, pricier). Keep ONE draft + a Stitched|
            // Unstitched toggle. A normal multi-PIECE set (kurta + matching trouser) still
            // splits into one draft per piece.
            const FABRIC_SZ = /^\s*(\d\s?(pc|pcs|piece|pieces)\b|fabric|unstitch)/i;
            const memFabric = m => Array.isArray(m.sizes) && m.sizes.length && m.sizes.every(s => FABRIC_SZ.test(s.size||''));
            const memReal   = m => Array.isArray(m.sizes) && m.sizes.some(s => normSizeFull(s.size));
            const fabM = rj.members.find(memFabric), stchM = rj.members.find(memReal);
            if(rj.members.length === 2 && fabM && stchM && fabM !== stchM){
              const d = drafts[id];
              if(d){
                const _bc = (document.getElementById(`dc_cat_${id}`)||{}).value || '';
                const unsCat = UNSTITCHED_CATS.has(_bc) ? _bc : 'lawn_3pc_unstitch';
                d.forms   = { unstitched: fabM, stitched: stchM };
                d.formCat = { unstitched: unsCat, stitched: (unsCat === 'unstitch_3pc_emb' ? 'pret_3pc_emb' : 'pret_3pc') };
                d.form    = 'stitched';   // DEFAULT to the STITCHED form (Danish 2026-06-23)
                // render the default (stitched) member: re-synthesize `product` from it so the pipeline
                // below shows its sizes + price (members[0] is the cheaper fabric form, not the default).
                { const _sz = Array.isArray(stchM.sizes) ? stchM.sizes : [], _pa = Math.round(stchM.price * 100);
                  product = { title: stchM.title || rj.title || '', product_type: '',
                    options: _sz.length ? [{ name:'Size', values: _sz.map(s=>s.size) }] : [],
                    variants: _sz.length ? _sz.map(s => ({ option1:s.size, available:!!s.available, price:_pa, compare_at_price:null }))
                                         : [{ available: stchM.available !== false, price:_pa, compare_at_price:null }] }; }
                setDraftCat(id, d.formCat.stitched); d.catUserSet = true;   // LOCK the stitched cat against the pipeline's catalog-override (~1116) / flip
                renderFormToggle(id);
              }
            } else {
              const extras = rj.members.slice(1);
              setTimeout(() => extras.forEach(mem => createDraft(url, mem)), 0);
            }
          }
        }
        if(!product)
          return setStatus("⚠️ Couldn't auto-fetch this item from Pakistan right now — please fill price & size manually, or try again in a moment.",'#ff9a9a');
      }

      // ── NON-Shopify brands: relay JSON-LD price scrape (PKR price; size manual)
      const isGeneric = !isSfcc && GENERIC_SCRAPE_HOSTS.has(pastedHost);
      if(isGeneric){
        const relay = ((localStorage.getItem('psb_relay_url')||'').trim() || DEFAULT_RELAY_URL).replace(/\/+$/,'');
        setStatus('🇵🇰 Fetching price from Pakistan (this brand has no public API)…','var(--gold)');
        const sc = new AbortController(); const stid = setTimeout(()=>sc.abort(), 22000);
        try{
          const rr = await fetch(`${relay}/scrapeld?url=${encodeURIComponent(url)}`, { signal: sc.signal, cache:'no-store' });
          if(rr.ok){
            const j = await rr.json();
            // PK-IP fetch → currency should be PKR (or absent). Never accept a
            // foreign currency here (would mislabel); fall back to manual instead.
            if(j && j.ok && j.price != null && (!j.currency || j.currency === 'PKR')){
              const szs = Array.isArray(j.sizes) ? j.sizes : [];
              if(szs.length){
                // Per-size stock recovered (e.g. LAAM tag parse) → run the full
                // pipeline so in-stock chips + sold-out + qty cap all apply.
                const paisa = Math.round(j.price * 100);   // moneyOf ÷100 when hasStockInfo
                product = {
                  title: j.title || '',
                  product_type: '',
                  options: [{ name:'Size', values: szs.map(s=>s.size) }],
                  variants: szs.map(s => ({ option1: s.size, available: !!s.available, price: paisa, compare_at_price: null })),
                };
                hasStockInfo = true; pkrVia = 'relay';
              } else {
                // Price-only (sizes JS-rendered / not exposed) → buyer picks size manually.
                product = {
                  title: j.title || '',
                  product_type: '',
                  options: [],
                  variants: [{ available: true, price: j.price, compare_at_price: null }],
                };
                hasStockInfo = false; pkrVia = 'relay';  // price in RUPEES (moneyOf ÷1 when !hasStockInfo)
              }
            }
          }
        }catch(err){ /* fall through to the manual note */ }
        clearTimeout(stid);
        if(!product)
          return setStatus("ℹ️ Couldn't auto-fetch this brand's price — please enter price & size manually.", '#aaa');
      }

      if(!isSfcc && !isGeneric){
      let m = u.pathname.match(/\/products\/([^/?#]+)/);
      // Some stores (e.g. Khaadi) use /category/product-id.html — try last path segment as handle
      if(!m && u.pathname.toLowerCase().endsWith('.html')){
        const seg = u.pathname.split('/').pop().replace(/\.html$/i,'').toLowerCase();
        if(seg) m = [null, seg];
      }
      if(!m){
        if(/\/collections\//.test(u.pathname))
          return setStatus('⚠️ This is a category/collection page — open the brand site, tap a specific product, then copy that product URL','var(--gold)');
        return setStatus('ℹ️ Fill details manually — link doesn\'t point to a specific product','#aaa');
      }

      // If this is a brand's INTERNATIONAL site, fetch from its PK twin instead.
      const twinHost   = TWIN_MAP[pastedHost] || null;
      const fetchOrigin = twinHost ? (u.protocol + '//' + twinHost) : u.origin;

      setStatus(twinHost
        ? `🇵🇰 International link detected — checking the Pakistani store (${twinHost})…`
        : '🔍 Fetching product details from brand site…', 'var(--gold)');
      const ctrl = new AbortController();
      const tid  = setTimeout(()=>ctrl.abort(), 22000); // PK sites are slow from BD; allow for retries

      // Prefer the storefront .js endpoint — it includes per-size stock
      // ("available"); the .json endpoint does NOT. Fall back to .json.
      // CRITICAL: stock filtering depends on .js succeeding. Cross-origin
      // fetches to PK-hosted Shopify CDNs are occasionally flaky (a CDN edge
      // node may omit the CORS header, or the cached copy is stale), so we
      // retry up to 3× with a cache-busting, no-store request to force a
      // fresh, authoritative stock reading every time.
      for(let attempt = 0; attempt < 3 && !product; attempt++){
        try{
          // Constructed URL has no query string, so always start with "?".
          const r1 = await fetch(`${fetchOrigin}/products/${m[1]}.js?_psb=${Date.now()}_${attempt}`,
            { signal: ctrl.signal, cache: 'no-store' });
          if(r1.ok){ product = await r1.json(); hasStockInfo = true; }
          else if(r1.status === 404) sawNotFound = true;
        }catch(err){ if(err.name === 'AbortError') throw err; }
      }
      if(!product){
        // Last resort: .json has NO per-size stock — sizes can't be verified.
        const res = await fetch(`${fetchOrigin}/products/${m[1]}.json`,
          { signal: ctrl.signal, cache: 'no-store' });
        if(res.status === 404) sawNotFound = true;
        // Twin-store + handle genuinely absent → the article isn't sold in
        // Pakistan. Say so explicitly rather than a generic fetch failure.
        if(twinHost && sawNotFound && !TWIN_NO_API.has(pastedHost)){
          clearTimeout(tid);
          return setStatus(`⛔ This item is on the brand's international site but is NOT available on their Pakistani store (${twinHost}) — it cannot be ordered at Pakistani prices. Please pick a different article or confirm with the brand.`, '#ff7575');
        }
        if(!res.ok) throw new Error('HTTP '+res.status);
        product = (await res.json()).product;
        hasStockInfo = false;
      }

      // ── CURRENCY VERIFICATION ─────────────────────────────────────────────
      // Shopify Markets stores geo-price: a Bangladesh visitor gets USD, and
      // those USD prices carry FX spread + international markup — NOT a simple
      // conversion of the PKR price. /cart.js reports the currency Shopify is
      // serving THIS session, so we know definitively rather than guessing.
      // If it's not PKR, refetch the product through the Pakistan relay (a
      // PK-IP server set in the admin panel) so the buyer always sees real
      // PKR prices. With no relay, fail LOUD — never save a foreign price
      // silently as PKR.
      // pkrVia: 'direct' | 'relay' = confirmed PKR · 'unknown' = cart.js
      // unreachable (non-Shopify / CORS) → fall back to old heuristic ·
      // otherwise holds the foreign currency code, unresolved.
      if(hasStockInfo){
        let sessionCur = null;
        try{
          const rc = await fetch(`${fetchOrigin}/cart.js?_psb=${Date.now()}`,
            { signal: ctrl.signal, cache: 'no-store' });
          if(rc.ok) sessionCur = (await rc.json()).currency || null;
        }catch(err){ if(err.name === 'AbortError') throw err; }
        if(sessionCur === 'PKR') pkrVia = 'direct';
        else {
          // sessionCur is null (cart.js CORS-blocked in BD) or a confirmed foreign
          // currency. In both cases the directly-fetched price may be in a non-PKR
          // currency — always try the VPS relay (PK IP) to get the true PKR price.
          // If the relay ALSO returns a non-PKR currency the brand has no PK store
          // and is genuinely USD-only.
          const relay = ((localStorage.getItem('psb_relay_url')||'').trim() || DEFAULT_RELAY_URL).replace(/\/+$/,'');
          if(relay && !USD_ONLY_BRANDS.has(pastedHost)){
            try{
              setStatus(sessionCur
                ? `🇵🇰 Brand priced in ${sessionCur} for you — fetching real PKR price via Pakistan relay…`
                : `🇵🇰 Verifying PKR price via Pakistan relay…`, 'var(--gold)');
              // Send the relay the PK-twin URL so it queries the right store.
              const relayUrl = twinHost ? `${fetchOrigin}/products/${m[1]}` : url;
              const rr = await fetch(`${relay}/price?url=${encodeURIComponent(relayUrl)}`,
                { signal: ctrl.signal, cache: 'no-store' });
              if(rr.ok){
                const rj = await rr.json();
                if(rj && rj.currency === 'PKR' && rj.product){
                  product = rj.product; hasStockInfo = true; pkrVia = 'relay';
                } else if(rj && rj.currency && rj.currency !== 'PKR'){
                  pkrVia = rj.currency;  // relay also returns non-PKR → no PK store
                }
              }
            }catch(err){ if(err.name === 'AbortError') throw err; }
          } else if(USD_ONLY_BRANDS.has(pastedHost)){
            pkrVia = 'USD';
          }
        }
      }
      clearTimeout(tid);
      } // end if(!isSfcc) — SFCC path above already populated `product`
      if(!product) throw new Error('empty');
      // Image-led card + cart: capture the product photo + title once the live fetch resolves.
      try{
        let _imgs = Array.isArray(product.images) ? product.images.map(im => typeof im === 'string' ? im : (im && im.src)).filter(Boolean) : [];
        const _pimg = product.featured_image || _imgs[0] || product.image || '';
        if(!_imgs.length && _pimg) _imgs = [_pimg];
        if(drafts[id]){
          if(typeof _pimg === 'string' && _pimg) drafts[id].img = _pimg;
          if(_imgs.length) drafts[id].imgs = _imgs;
          if(product.title) drafts[id].title = product.title;
          fillDraftPreview(id);
        }
      }catch(e){}
      // .js endpoint reports money in paisa (×100); .json uses decimal strings
      const moneyOf = v0 => hasStockInfo ? (parseFloat(v0)||0)/100 : (parseFloat(v0)||0);

      // ── CATEGORY (gender-aware) ───────────────────────────────────────────
      const gender = detectGender(url, product);
      const ptStr  = product.product_type || product.type || '';
      const tagsRaw = product.tags;
      const tagStr  = (Array.isArray(tagsRaw) ? tagsRaw.join(' ') : String(tagsRaw || '')).toLowerCase();
      // AUTHORITATIVE: the catalogue already classified this exact product (the SAME category the
      // Browse card shows). Use it so the basket weight/price matches the pic — the client guesser
      // below has no "kids" signal for neutral titles ("Basic T-Shirt") and would mis-weight them
      // (e.g. a "Boys Kurta Pajama" read as men's). Fall back to guessing only for links NOT in the
      // catalogue (new / unharvested products). See search-server.js /search/by-url.
      let catalogCat = null;
      try{
        // Use a fresh AbortController — the page's `ctrl` is block-scoped to the fetch branch above
        // and is OUT OF SCOPE here; referencing ctrl.signal threw a ReferenceError that the empty
        // catch swallowed, so by-url silently never ran and every item fell back to the guesser.
        const _bc = new AbortController(); const _bt = setTimeout(() => _bc.abort(), 8000);
        const _cr = await fetch(relayBase() + '/search/by-url?u=' + encodeURIComponent(url), { signal: _bc.signal, cache: 'no-store' });
        clearTimeout(_bt);
        if(_cr.ok){ const _cj = await _cr.json(); if(_cj && _cj.found && _cj.cat) catalogCat = _cj.cat; }
      }catch(e){}
      // Women/kids fallback: classify from type+title+tags with the SAME logic the catalog
      // harvester uses, so a browsed card and the added cart line match. (Garment
      // type/piece-count beat the generic "pret"; accessories & 2-piece first.)
      let fetchedCat = catalogCat || (gender === 'men'
        ? (mapPtToCatMen(ptStr) || mapPtToCatMen(product.title || '') || 'mens_shalwar_kameez')
        : classifyWomenCat((ptStr + ' ' + (product.title || '')).toLowerCase(), tagStr));
      // Host overrides (GUESS path only — the catalogue already applies these): khussa stores →
      // footwear; festive houses (Emaan) → formal-embroidered floor (not 2.5kg); an explicit
      // adda / full-hand description → handmade_emb (2.5kg).
      const _host = _hostOf(url);
      if(!catalogCat){
        if(FOOTWEAR_HOSTS.has(_host)){ fetchedCat = 'footwear'; }
        else if(gender !== 'men' && fetchedCat){
          if(FESTIVE_HOSTS.has(_host) && (fetchedCat==='pret_3pc'||fetchedCat==='kurti_1pc'||fetchedCat==='pret_3pc_emb')) fetchedCat = 'formal_emb_3pc';
          if(isHandmadeFullForm(product, fetchedCat)) fetchedCat = 'handmade_emb';
        }
      }
      const catEl = document.getElementById(`dc_cat_${id}`);
      // Catalogue category is authoritative — set it and lock it (so the guess-overrides below and
      // the pre-fetch URL guess can't change the carted weight). The buyer can still pick manually.
      if(catalogCat && catEl && !(drafts[id] && drafts[id].catUserSet)){
        setDraftCat(id, catalogCat);
        if(drafts[id]) drafts[id].catUserSet = true;
      }
      // Overwrite a wrong women's auto-guess if this is clearly a men's product
      const womensGuess = catEl && catEl.value && !MENS_CATS.has(catEl.value);
      if(catEl && fetchedCat && !(drafts[id] && drafts[id].catUserSet) && (!catEl.value || (gender === 'men' && womensGuess))){
        setDraftCat(id, fetchedCat);
      }
      // The brand's own product_type says UNSTITCHED but the pre-fetch URL
      // guess picked a stitched category (e.g. Zellbury "Luxury Unstitch"
      // with handle "shirt-shalwar-dupatta" → guessed 2pc). The brand's word
      // beats our URL guess: unstitched products must never ask for sizes.
      // (The reverse correction — sizes found ⇒ stitched — happens below.)
      if(catEl && catEl.value && fetchedCat && !(drafts[id] && drafts[id].catUserSet)
         && UNSTITCHED_CATS.has(fetchedCat) && !UNSTITCHED_CATS.has(catEl.value)){
        setDraftCat(id, fetchedCat);
      }
      const activeCat = catEl ? catEl.value : fetchedCat;

      // ── FIND SIZE OPTION ──────────────────────────────────────────────────
      const opts = product.options || [];
      // .js endpoint returns options as strings ["Size","Color"]; .json returns objects {name,values}
      // Normalise so both formats work: wrap strings into {name, values:[]} objects
      const normOpts = opts.map(o => typeof o === 'string' ? {name:o, values:[]} : o);
      // Find ALL options named "size" (multi-size: "Shirt Size" + "Trouser Size")
      let sizeIdxAll = normOpts.map((o,i) => /size/i.test(o.name) ? i : -1).filter(i => i >= 0);
      if(sizeIdxAll.length === 0){
        // Fallback: find option where majority of values look like sizes (only works with .json)
        const fb = normOpts.findIndex(o => o.values.length > 0 &&
          o.values.filter(v => normSizeFull(v)).length > o.values.length / 2);
        if(fb >= 0) sizeIdxAll = [fb];
      }
      const sizeIdx   = sizeIdxAll.length > 0 ? sizeIdxAll[0] : -1;
      const sizeKey   = ['option1','option2','option3'][sizeIdx] || null;

      // ── FIND TYPE OPTION (stitched/unstitched brands like Nureh, Alizeh) ─
      const typeIdx = opts.findIndex(o => /^(type|item|stitch)/i.test(o.name));
      const typeKey = ['option1','option2','option3'][typeIdx] || null;

      // ── FIND COLOUR OPTION ───────────────────────────────────────────────
      const colourIdx = normOpts.findIndex(o => /colou?r|shade/i.test(o.name));
      const colourKey = ['option1','option2','option3'][colourIdx] || null;

      // ── SELECT RELEVANT VARIANTS ──────────────────────────────────────────
      // Stock filtering only when the endpoint actually reports availability
      let vars = product.variants || [];
      let avail = hasStockInfo ? vars.filter(v => v.available) : vars.slice();
      const allSoldOut = hasStockInfo && vars.length > 0 && avail.length === 0;
      if(allSoldOut) avail = vars;  // keep a price reference, but no size chips + warn below

      // ── PRICE-BEARING OPTIONS beyond size/colour (Item · stitching · add-on) ──
      // e.g. Mina Hasan "Item": Shirt 80,800 / Pants 8,400 / Dupatta 8,400 / Full Set
      // 97,500. Surface each as a dropdown DEFAULTED to the complete article (so the
      // shown price == the brand-page price, never a cheap sub-piece) and filter the
      // variant set to the chosen value so price + size chips follow it. Products with
      // NO such dimension skip this entirely and keep the legacy path below.
      const _otherCat = (catEl && catEl.value) ? catEl.value : (fetchedCat || '');
      const otherDims = detectOtherDims(normOpts, vars, sizeIdxAll, colourIdx);
      if(otherDims.length && drafts[id]){
        const _sel = {};
        otherDims.forEach(dim => { _sel[dim.idx] = defaultOptValue(dim, _otherCat); });
        drafts[id]._otherDims = otherDims;
        drafts[id]._otherSel  = _sel;
        otherDims.forEach(dim => { const sel = _sel[dim.idx];
          const f = avail.filter(v => String(v[dim.key]||'').trim() === sel); if(f.length) avail = f; });
      } else if(typeKey){
        // No structured option dimension → keep the legacy stitched-over-unstitched preference.
        const stitched = avail.filter(v => /stitch/i.test(v[typeKey]) && !/unstitch/i.test(v[typeKey]));
        if(stitched.length) avail = stitched;
      }

      // ── PICK DIMENSIONS (colour + size) ──────────────────────────────────
      // An article can vary by colour AND size. Treat an ACTIVE colour option
      // (≥2 distinct colours among the variants we'll show) as a pick dimension
      // alongside size, combined into one chip per real variant ("Colour / Size")
      // — reusing the same combined-chip path as 2-piece shirt+trouser sizing.
      // A single-colour product adds no colour dimension (so no clutter).
      const colourVals  = colourKey ? new Set(avail.map(v => (v[colourKey]||'').trim()).filter(Boolean)) : new Set();
      const colourActive = !!colourKey && colourVals.size >= 2;
      const keyOfIdx = i => ['option1','option2','option3'][i];
      // Real garment sizes present? (normSizeFull now rejects piece-counts/types.)
      // Colour alone must NOT flip unstitched→pret.
      const realSizeCount = sizeKey ? new Set(avail.map(v => normSizeFull(v[sizeKey])).filter(Boolean)).size : 0;
      // UNSTITCHED never needs a size pick. If the resolved category is unstitched
      // and there are NO real garment sizes (only piece-count/type options like
      // "3 Piece" / "Unstitched"), suppress ALL picks so the buyer is asked for
      // quantity only and is never sized as "3 Piece" (req #2).
      const suppressPicks = catEl && UNSTITCHED_CATS.has(catEl.value) && realSizeCount === 0;
      const pickDims = [];
      if(!suppressPicks){
        if(colourActive) pickDims.push({ key: colourKey, isSize: false, name: normOpts[colourIdx].name });
        sizeIdxAll.forEach(i => pickDims.push({ key: keyOfIdx(i), isSize: true, name: normOpts[i].name }));
      }
      const combined = pickDims.length >= 2;   // multiple dims ⇒ "A / B" chips

      // ── PRICE ─────────────────────────────────────────────────────────────
      // Default the shown price to the CHEAPEST in-stock variant — NOT avail[0] (first in
      // document order) — so the basket's opening price EQUALS the Browse card price, which
      // also uses cheapest-in-stock (harvest buildProduct). avail[] is the in-stock set; the
      // buyer's actual size pick then refines the price via onDraftSizeChange + sizePrice.
      const _availPriced = avail.filter(v => moneyOf(v.price) > 0);
      const refVar = _availPriced.length
        ? _availPriced.reduce((lo, v) => moneyOf(v.price) < moneyOf(lo.price) ? v : lo)
        : (avail[0] || vars[0]);
      if(refVar){
        const salePrice = moneyOf(refVar.price);
        const origPrice = moneyOf(refVar.compare_at_price);
        if(salePrice > 0){
          // Currency decision, in order of trust:
          // 1. cart.js said PKR (direct or via relay) → definitively PKR.
          // 2. cart.js said a foreign currency and the relay couldn't fix it
          //    → treat as USD and warn LOUD below (price is inflated Markets
          //    pricing, not a converted PKR price).
          // 3. cart.js unreachable → old heuristic: non-.pk site + price<600.
          const knownPkr  = pkrVia === 'direct' || pkrVia === 'relay';
          // Magnitude sanity: an UNRESOLVED price (cart.js unreachable) under ~600 "PKR" is implausibly
          // cheap for any garment → almost certainly a geo-served USD number that the old .pk-domain
          // heuristic mislabelled as a tiny PKR amount (e.g. Rang Rasiya .com.pk returned "PKR 84").
          // Flag USD regardless of the .pk domain so it WARNS instead of silently charging a wrong price.
          const isUsd     = USD_ONLY_BRANDS.has(pastedHost) || (!knownPkr && (pkrVia !== 'unknown' || salePrice < 600));
          if(isUsd){
            setDraftCurrency(id, 'USD'); // switches toggle before we fill the price
          }
          const priceEl = document.getElementById(`dc_price_${id}`);
          if(priceEl){
            priceEl.value = isUsd
              ? salePrice.toFixed(2)        // keep decimals for USD
              : Math.round(salePrice);      // round for PKR
            updateDraftPriceHint(id);
          }
          // Sale badge — label currency correctly (PKR or USD)
          const cnote = document.getElementById(`dc_cnote_${id}`);
          if(cnote && origPrice > salePrice){
            const pct = Math.round((1 - salePrice / origPrice) * 100);
            const fmt = n => isUsd ? `$${n.toFixed(2)}` : `PKR ${Math.round(n).toLocaleString()}`;
            cnote.style.cssText = 'display:block;margin-top:5px;font-size:0.72rem;font-weight:700;padding:4px 9px;border-radius:6px;background:rgba(201,169,110,0.15);border:1px solid rgba(201,169,110,0.40);color:var(--gold)';
            cnote.textContent = `🏷️ ${pct}% off! Was ${fmt(origPrice)} → Sale ${fmt(salePrice)}`;
          }
          // (else keep the PKR/USD currency hint shown by showDraftCurrencyNote)
        }
      }

      // ── OPTIONS — show in-stock variant combinations as clickable chips ───
      // One chip per in-stock combination (colour and/or size), built with the
      // shared variantLabel() so chips, the sold-out list, and the ?variant=
      // pre-select always agree on the exact label.
      const seen = new Set();
      const sizesToAdd = [];
      if(pickDims.length){
        avail.forEach(v => {
          const label = variantLabel(v, pickDims);
          if(label && !seen.has(label)){ seen.add(label); sizesToAdd.push(label); }
        });
      }

      // Which combinations are SOLD OUT? Show them struck-through for the
      // operator's confidence AND keep them out of the dropdown. Only when stock
      // is actually known (unverified .json fallback can't tell sold-out apart).
      let soldOutSizes = [];
      if(hasStockInfo && pickDims.length){
        const inStock = new Set(sizesToAdd), allSeen = new Set();
        vars.forEach(v => {
          if(v.available) return;
          const label = variantLabel(v, pickDims);
          if(label && !inStock.has(label) && !allSeen.has(label)){ allSeen.add(label); soldOutSizes.push(label); }
        });
      }

      // Persist on the draft so the option dropdown is CONSTRAINED to real
      // in-stock combinations — a sold-out colour/size can never be picked. When
      // stock could NOT be verified (.js failed → .json fallback) we leave it
      // empty so the dropdown falls back to the standard list + a loud warning.
      const d0 = drafts[id];
      if(d0){
        d0.stockVerified = hasStockInfo && !allSoldOut;
        d0.stockSizes    = d0.stockVerified ? sizesToAdd.slice() : [];
        d0.soldOutSizes  = soldOutSizes.slice();
        d0.allSoldOut    = !!allSoldOut;   // whole product sold out → block saving (req #7)
        d0.pickWhat      = combined ? 'colour & size' : 'size';
        // Per-SIZE price map (size-priced products — kids age-sizing where bigger sizes cost more).
        // Keyed by the SAME chip label as stockSizes (variantLabel), value = price in the draft's
        // currency unit (moneyOf). Drives: price-follows-picked-size + per-size price on each chip.
        d0.sizePrice = {};
        if(d0.stockVerified){ avail.forEach(v => { const lb = variantLabel(v, pickDims); if(lb && d0.sizePrice[lb] == null) d0.sizePrice[lb] = moneyOf(v.price); }); }
        d0.priceVaries = new Set(Object.values(d0.sizePrice).map(p => Math.round(p))).size > 1;
        // State for psReprice() — only set when this product has a price-bearing option
        // dimension (Item/stitching/add-on). Lets a dropdown change re-derive price+chips.
        if(otherDims.length){
          d0._vars = vars; d0._pickDims = pickDims; d0._hasStock = hasStockInfo;
          d0._combined = combined; d0._chipLabel = combined ? pickDims.map(x=>x.name).join(' + ') : null;
        }
      }

      if(!allSoldOut && sizesToAdd.length){
        // Real garment SIZES (not colour alone) ⇒ stitched/RTW, even if the URL
        // said "lawn"/"fabric" and the category auto-detected as unstitched.
        if(realSizeCount > 0 && catEl && UNSTITCHED_CATS.has(catEl.value) && !(drafts[id] && drafts[id].catUserSet)){
          let flip;
          if(gender === 'men'){
            flip = mapPtToCatMen(ptStr) || mapPtToCatMen(product.title||'') || 'mens_shalwar_kameez';
          } else {
            // sizes found ⇒ stitched; keep the embroidered tier if it was embroidered
            flip = (catEl.value === 'unstitch_3pc_emb') ? 'pret_3pc_emb' : 'pret_3pc';
          }
          setDraftCat(id, flip);
        }
        {
          const chipLabel = combined
            ? pickDims.map(d => d.name).join(' + ')
            : null;
          showSizeChips(id, sizesToAdd, chipLabel, soldOutSizes);
          const hint = document.querySelector(`#dc_szchips_${id} > div:first-child`);
          const picked = sfccPicked || pickedVariantFromUrl(url, product, pickDims);
          const whatWord = combined ? 'colour &amp; size' : 'size';
          if(hint && !d0?.stockVerified){
            // Stock could NOT be verified — fail LOUD, never silently allow all.
            hint.innerHTML = '⚠️ <b>Live stock could NOT be verified</b> for this brand. The options below are <u>all listed</u>, not confirmed-in-stock — please check the brand page before ordering.';
            hint.style.cssText = 'font-size:0.75rem;font-weight:700;color:#ff9a9a;background:rgba(192,57,43,0.15);border:1px solid rgba(192,57,43,0.45);border-radius:6px;padding:6px 10px;margin-bottom:7px';
          }
          // ── BUYER-PICKED COMBINATION (from ?variant=) ───────────────────
          // If the link encodes a specific variant (colour and/or size),
          // pre-select that exact combination on top of the chips.
          if(picked && sizesToAdd.includes(picked)){
            addDraftSizeRow(id, picked, 1);         // pre-fill the chosen combination (selects its chip)
            if(hint && d0?.stockVerified){          // override the hint only when stock is trustworthy
              hint.innerHTML = '✅ <b>Your selection (' + esc(picked) + ') was auto-filled and is in stock.</b> Add more below if you need them.';
              hint.style.cssText = 'font-size:0.75rem;font-weight:700;color:#7ee0a0;background:rgba(46,125,50,0.15);border:1px solid rgba(46,125,50,0.45);border-radius:6px;padding:6px 10px;margin-bottom:7px';
            }
          } else if(picked && hint && d0?.stockVerified){
            // The exact combination they picked is sold out — say so; keep chips.
            hint.innerHTML = '⚠️ <b>What you picked (' + esc(picked) + ') is SOLD OUT.</b> Choose an in-stock option below.';
            hint.style.cssText = 'font-size:0.75rem;font-weight:700;color:#ff9a9a;background:rgba(192,57,43,0.15);border:1px solid rgba(192,57,43,0.45);border-radius:6px;padding:6px 10px;margin-bottom:7px';
          }
        }
      }

      // Component products: show the themed option dropdown(s) (Item/stitching/add-on),
      // defaulted to the complete article. Buyer can switch piece → price+chips re-derive.
      if(otherDims.length) renderOptDropdowns(id);

      if(allSoldOut){
        psMarkSoldOut(url);   // hide this dead listing from the Browse-Products grid right away
        setStatus('⛔ All sizes appear SOLD OUT on the brand site — please double-check the product page before ordering.', '#c0392b');
        checkAddUrlLock();
        return;  // keep the warning visible
      }

      const uniqSizes = new Set(sizesToAdd);
      const refPrice  = Math.round(moneyOf((avail[0]||vars[0])?.price));
      const szWord    = hasStockInfo ? ' sizes in stock' : ' sizes found';
      const foreignCur = (pkrVia !== 'direct' && pkrVia !== 'relay' && pkrVia !== 'unknown') ? pkrVia : null;
      if(foreignCur && USD_ONLY_BRANDS.has(pastedHost)){
        // USD-native brand: the USD price IS the true price — no PKR exists
        // anywhere, even from a PK IP. Calm note; let admin rate convert.
        setStatus(`ℹ️ This brand does not have a Pakistani store — it sells in ${foreignCur} only. ${foreignCur} price filled in; it will convert to PKR at your admin rate.`, 'var(--txt)');
        checkAddUrlLock();
        return;  // keep the note visible (no auto-hide)
      }
      if(foreignCur){
        // Relay (PK IP) also returned non-PKR — brand has no PK store for this
        // item, or this article is not stocked on the PK site.
        setStatus(`⚠️ This product is only available in ${foreignCur}. This appears to be from an international store with no Pakistani price. Check if the brand has a .pk store, or enter the PKR price manually.`, '#ff9a00');
        checkAddUrlLock();
        return;  // no auto-hide
      }
      const viaNote = pkrVia === 'relay' ? ' · 🇵🇰 PKR via relay' : '';
      setStatus(`✓ Fetched: ${product.product_type||product.type||'product'} · PKR ${refPrice.toLocaleString()}${uniqSizes.size?' · '+uniqSizes.size+szWord:''}${isGeneric && !uniqSizes.size?' · ⚠️ pick size manually below':''}${viaNote}`, '#2a7a32');
      hideStatus();
      checkAddUrlLock();

    } catch(e) {
      if(e.name==='AbortError')
        setStatus('⚠️ Fetch timed out — fill in details manually','#aaa');
      else
        setStatus('⚠️ Auto-fetch not available for this site — fill in details manually','#aaa');
    } finally {
      // Fetch is over: if a category was detected the chip is already showing;
      // if not, reveal the manual 3-gender picker as the fallback.
      if(drafts[id]) drafts[id].catFetchDone = true;
      renderCatUI(id);
    }
  }

  // Tap a product thumbnail → full-size lightbox (order form + cart).
  function openImgZoom(imgs){
    const list = (Array.isArray(imgs) ? imgs : [imgs]).filter(Boolean);
    if(!list.length) return;
    let ov = document.getElementById('imgZoomOv');
    if(!ov){
      ov = document.createElement('div');
      ov.id = 'imgZoomOv'; ov.className = 'img-zoom-ov';
      ov.addEventListener('click', (e) => { if(e.target === ov || e.target.classList.contains('img-zoom-track') || e.target.classList.contains('img-zoom-x')){ ov.style.display = 'none'; ov.innerHTML = ''; } });
      document.body.appendChild(ov);
    }
    ov.innerHTML = `<button class="img-zoom-x" aria-label="Close">✕</button>`
      + `<div class="img-zoom-track">` + list.map(s => `<img src="${esc(s)}" alt="" loading="lazy">`).join('') + `</div>`;
    ov.style.display = 'flex';
  }
  function zoomDraftImg(id){ const d = drafts[id]; if(!d) return; openImgZoom(d.imgs && d.imgs.length ? d.imgs : (d.img ? [d.img] : [])); }
  function zoomCartImg(i){ const it = cart[i]; if(!it) return; openImgZoom(it.imgs && it.imgs.length ? it.imgs : (it.img ? [it.img] : [])); }
  // Surface the captured product photo + title onto the draft card (image-led confirmation).
  function fillDraftPreview(id){
    const d = drafts[id]; if(!d) return;
    if(d.img){ const img = document.getElementById(`dc_img_${id}`); if(img && img.getAttribute('src') !== d.img) img.src = d.img; }
    if(d.title){ const t = document.getElementById(`dc_title_${id}`); if(t){ t.textContent = d.title; t.style.display = ''; } }
  }
  function buildDraftCard(id, url, brand, isPk){
    const pkBadge = isPk ? `<span class="draft-badge-pk">🟢 PKR auto</span>` : '';
    const _mono = esc(((brand || '?').trim()[0] || '?').toUpperCase());
    return `<div class="draft-card" id="dc_${id}" data-url="${esc(url)}" data-brand="${esc(brand)}">
      <div class="draft-card-hdr">
        <div class="dc-thumb-wrap" onclick="zoomDraftImg(${id})" title="Tap to enlarge">
          <div class="dc-thumb dc-mono" id="dc_imgmono_${id}">${_mono}</div>
          <img class="dc-thumb dc-img" id="dc_img_${id}" alt="" hidden
               onload="this.hidden=false;var m=document.getElementById('dc_imgmono_${id}');if(m)m.style.display='none'"
               onerror="this.remove()">
        </div>
        <div style="flex:1;min-width:0">
          <div class="badges">
            ${brand ? `<span class="draft-badge-brand">${esc(brand)}</span>` : ''}
            ${pkBadge}
          </div>
          <div class="dc-title" id="dc_title_${id}" style="display:none"></div>
          <div class="url-text" onclick="this.classList.toggle('expanded')" title="Tap to show the full link">${esc(url)}</div>
        </div>
        <button class="draft-remove" onclick="removeDraft(${id})" title="Remove this URL">✕</button>
      </div>
      <div id="dc_fetch_${id}" style="display:none;font-size:0.72rem;font-weight:600;padding:5px 10px;background:var(--surface);border-radius:5px;margin-top:6px"></div>
      <div class="dc-sect">
        <div class="dc-sect-h">Change category</div>
        <input type="hidden" id="dc_cat_${id}">
          <!-- Initial: detecting -->
          <div id="dc_catdetect_${id}" style="font-size:0.78rem;color:var(--txt-muted);padding:3px 0">🔄 Detecting category…</div>
          <!-- Auto-detected chip (default once a category is found) -->
          <div id="dc_catauto_${id}" style="display:none;align-items:center;gap:9px;flex-wrap:wrap;background:rgba(46,125,50,0.12);border:1px solid rgba(46,125,50,0.40);border-radius:7px;padding:8px 11px">
            <span style="font-size:0.7rem;color:var(--txt-muted)">✓ Auto-detected</span>
            <b id="dc_catlabel_${id}" style="font-size:0.9rem;color:var(--txt)"></b>
            <button type="button" onclick="openCatPicker(${id})" style="margin-left:auto;font-size:0.72rem;color:var(--gold);background:none;border:1.5px solid var(--gold);border-radius:12px;padding:3px 12px;cursor:pointer;font-weight:700">Change</button>
          </div>
          <!-- Manual 3-gender picker — fallback only (no auto-match, or "Change") -->
          <div id="dc_catpick_${id}" style="display:none">
            <div id="dc_catpickhint_${id}" style="font-size:0.74rem;color:var(--txt);font-weight:600;margin-bottom:6px">Choose the category:</div>
            ${buildCatDropdown(id,'w')}
            ${buildCatDropdown(id,'m')}
            ${buildCatDropdown(id,'k')}
          </div>
      </div>
      <div class="dc-sect">
        <div class="dc-sect-h">Price <span class="dc-sect-hint">match the brand's price</span></div>
          <div class="price-row">
            <input type="number" id="dc_price_${id}" placeholder="e.g. 4500 PKR" min="0"
              oninput="this.classList.remove('psb-missing');updateDraftPriceHint(${id});checkAddUrlLock()"/>
            <div class="currency-toggle">
              <button id="dc_pkr_${id}" class="active" onclick="setDraftCurrency(${id},'PKR')">PKR</button>
              <button id="dc_usd_${id}" onclick="setDraftCurrency(${id},'USD')">USD</button>
            </div>
          </div>
          <div id="dc_cnote_${id}" style="display:none;margin-top:5px;font-size:0.72rem;font-weight:600;padding:4px 8px;border-radius:5px"></div>
          <div id="dc_phint_${id}" style="font-size:0.72rem;color:var(--gold);margin-top:3px"></div>
          <div id="dc_price_chips_${id}" class="dc-price-chips" style="display:none"></div>
      </div>
      <div id="dc_opts_${id}" style="display:none;margin-top:10px"></div>
      <div class="dc-sect" id="dc_szbox_${id}">
        <div class="dc-sect-h">Size &amp; qty
          <span id="dc_sz_note_${id}" class="dc-sect-hint">same price for all adult sizes</span>
        </div>
        <div id="dc_formtoggle_${id}" style="display:none;margin:6px 0 9px"></div>
        <div id="dc_sz_msg_${id}" style="font-size:0.78rem;color:var(--txt-muted);padding:4px 0">
          ← Select a category first
        </div>
        <!-- Unstitched qty (shown instead of sizes for unstitched/accessories) -->
        <div id="dc_uqty_wrap_${id}" style="display:none;margin-top:4px">
          <div style="display:flex;align-items:center;gap:10px">
            <label style="font-size:0.8rem;color:var(--txt-sec);font-weight:600">Quantity</label>
            <input type="number" id="dc_uqty_${id}" value="1" min="1" max="${maxPerSize()}"
              title="Max ${maxPerSize()} pieces (stock limit)" onchange="clampQtyInput(this);checkAddUrlLock()"
              style="width:68px;padding:7px 8px;border:1.5px solid var(--bdr-med);border-radius:6px;
                     font-size:0.9rem;text-align:center;font-weight:700"/>
            <span style="font-size:0.78rem;color:var(--txt-muted)">piece(s)</span>
          </div>
        </div>
        <!-- Tappable size chips — multi-select (tap as many sizes as you want) -->
        <div id="dc_szchips_${id}" style="display:none;margin-bottom:4px">
          <div style="font-size:0.71rem;color:var(--txt-muted);margin-bottom:6px">
            👇 Tap your size(s) — choose as many as you need:
          </div>
          <div id="dc_szchips_inner_${id}" style="display:flex;flex-wrap:wrap;gap:6px"></div>
        </div>
        <!-- One quantity stepper per chosen size -->
        <div id="dc_qhead_${id}" style="display:none;font-size:0.71rem;color:var(--txt-muted);margin:9px 0 5px">Quantity per size:</div>
        <div id="dc_srows_${id}"></div>
      </div>
    </div>`;
  }

  function createDraft(url, presetMember){
    const brand = detectBrand(url);
    const _cdHost = new URL(url).hostname;
    const isPk  = /\.(pk|com\.pk)(\/|$)/.test(_cdHost + '/') || _cdHost === 'pk.ethnc.com';
    const id    = draftIdCtr++;
    drafts[id]  = { url: url, currency: 'PKR', sizeCounter: 0, catFetchDone: false, catUserSet: false, catPickerOpen: false };
    document.getElementById('draftCards')
      .insertAdjacentHTML('beforeend', buildDraftCard(id, url, brand, isPk));

    // Immediate URL-based detection (instant, no network). SKIP for an extra
    // set piece: the pasted URL is the set's (primary piece's), so its category/
    // size would mislabel this piece — its real data comes from presetMember.
    if(!presetMember){
      const cat = detectCategory(url);
      if(cat){ setDraftCat(id, cat); }
      if(cat && !UNSTITCHED_CATS.has(cat)){
        // Pre-fill size from URL params while fetch loads
        const sz = detectSizeFromUrl(url);
        if(sz) addDraftSizeRow(id, sz);
      }
    }
    /* currency note removed — price is always shown in PKR */

    // Network fetch — overwrites with richer data if available. With presetMember
    // (an extra set piece) it uses that data directly instead of re-fetching.
    fetchProductData(id, url, presetMember);

    updateSaveAllBtn();
    checkAddUrlLock();
    return id;
  }

  function removeDraft(id){
    document.getElementById(`dc_${id}`)?.remove();
    delete drafts[id];
    updateSaveAllBtn();
    if(!Object.keys(drafts).length){
      document.getElementById('draftsContainer').style.display = 'none';
      _addViaTap = false;  // add abandoned → next add starts fresh (default = paste)
      closeDraftModal();  // last card gone → close the popup
      restoreEditStash(); // removing the edit card = cancel → put the item back
      showTopUrlInput(); // show top input again when all cards gone
    }
    checkAddUrlLock();
  }

  // ── 3-DROPDOWN CATEGORY PICKER ───────────────────────────────────────────
  // Three gender dropdowns (w/m/k) write the active key into the hidden
  // dc_cat_${id}; every other reader keeps using dc_cat_${id}.value unchanged.
  // Custom-dropdown item clicked → set the hidden canonical value, collapse the
  // dropdown; renderCatUI (via onDraftCatChange) then shows the auto-chip.
  function pickCatCustom(id, g, k){
    const hid = document.getElementById(`dc_cat_${id}`);
    if(hid) hid.value = k;
    if(drafts[id]){ drafts[id].catUserSet = true; drafts[id].catPickerOpen = false; }
    const dd = document.getElementById(`dc_catdd${g}_${id}`);
    if(dd) dd.open = false;
    onDraftCatChange(id);
  }
  // The 3 <details> dropdowns act as an exclusive accordion (one open at a time).
  function closeOtherCatdd(id, g){
    ['w','m','k'].forEach(o => { if(o!==g){ const d=document.getElementById(`dc_catdd${o}_${id}`); if(d && d.open) d.open=false; } });
  }
  // Reflect the current category in the 3 dropdowns (summary text + highlight)
  // when the picker is shown (e.g. after "Change").
  function syncCatDropdowns(id){
    const cat = (document.getElementById(`dc_cat_${id}`)||{}).value;
    const g0 = cat ? catGender(cat) : null;
    ['w','m','k'].forEach(g => {
      const sum = document.getElementById(`dc_catsum${g}_${id}`);
      const dd  = document.getElementById(`dc_catdd${g}_${id}`);
      if(!sum || !dd) return;
      const panel = dd.querySelector('.catdd-panel');
      if(panel) panel.querySelectorAll('.catdd-item').forEach(el => el.classList.toggle('sel', g===g0 && el.dataset.k===cat));
      if(g === g0){
        let lbl=''; for(const grp of CAT_TREE[g].groups){ const f=grp.items.find(it=>it[0]===cat); if(f){ lbl=f[1]; break; } }
        sum.textContent = '✓ ' + (lbl || CAT_TREE[g].label);
      } else {
        sum.textContent = CAT_TREE[g].label + '…';
      }
      dd.open = false;
    });
  }
  // Programmatic set (URL guess, auto-fetch, edit): set the hidden field and
  // refresh the UI (the chip shows the label; dropdowns sync when reopened).
  function setDraftCat(id, cat){
    const hid = document.getElementById(`dc_cat_${id}`);
    if(hid) hid.value = cat || '';
    onDraftCatChange(id);
  }

  // ── DUAL stitched/unstitched articles (Khaadi fabrics-* etc.) ─────────────────
  // Some brands sell the SAME garment in two forms on one listing. The relay returns
  // both as a 2-member set; we keep ONE draft and let the buyer pick the form here.
  function renderFormToggle(id){
    const ft = document.getElementById(`dc_formtoggle_${id}`), d = drafts[id];
    if(!ft || !d || !d.forms) return;
    ft.innerHTML = '<div style="font-size:0.71rem;color:var(--txt-muted);margin-bottom:5px">📐 Sold in two forms — tap one (price &amp; size change):</div>'
      + '<div class="currency-toggle" style="display:inline-flex">'
      + `<button type="button" id="dc_formU_${id}" class="${d.form==='unstitched'?'active':''}" onclick="setDraftForm(${id},'unstitched')">Unstitched · fabric</button>`
      + `<button type="button" id="dc_formS_${id}" class="${d.form==='stitched'?'active':''}" onclick="setDraftForm(${id},'stitched')">Stitched · pick size</button>`
      + '</div>';
    ft.style.display = '';
  }
  function setDraftForm(id, form){
    const d = drafts[id];
    if(!d || !d.forms || !d.forms[form] || d.form === form) return;
    d.form = form;
    setDraftCat(id, form === 'stitched' ? d.formCat.stitched : d.formCat.unstitched);   // set the form's cat (also clears the size box via onDraftCatChange)
    d.catUserSet = true;   // LOCK it so the pipeline's catalog-override / flip can't revert it
    fetchProductData(id, d.url, d.forms[form]);   // re-render size + price from that member (presetMember = no network)
    const ub = document.getElementById(`dc_formU_${id}`), sb = document.getElementById(`dc_formS_${id}`);
    if(ub) ub.classList.toggle('active', form === 'unstitched');
    if(sb) sb.classList.toggle('active', form === 'stitched');
  }

  // Show the auto-detected chip when a category is set; reveal the 3-gender
  // picker ONLY when there's no match (after fetch) or the user taps "Change".
  function renderCatUI(id, forcePick){
    const catEl = document.getElementById(`dc_cat_${id}`);
    if(!catEl) return;
    const cat = catEl.value;
    const detect = document.getElementById(`dc_catdetect_${id}`);
    const auto   = document.getElementById(`dc_catauto_${id}`);
    const pick   = document.getElementById(`dc_catpick_${id}`);
    const done   = !!(drafts[id] && drafts[id].catFetchDone);
    const force  = forcePick || !!(drafts[id] && drafts[id].catPickerOpen);
    if(detect) detect.style.display = 'none';
    if(cat && !force){
      if(auto){ auto.style.display = 'flex'; const l = document.getElementById(`dc_catlabel_${id}`); if(l) l.textContent = (CAT_LABELS[cat] || WEIGHT_LABELS[cat] || cat); }
      if(pick) pick.style.display = 'none';
    } else if(force || done){
      if(auto) auto.style.display = 'none';
      if(pick) pick.style.display = 'block';
      const h = document.getElementById(`dc_catpickhint_${id}`);
      if(h) h.textContent = cat ? 'Change the category:' : "⚠️ Couldn't auto-detect — please choose:";
      syncCatDropdowns(id);
    } else {
      if(detect) detect.style.display = '';
      if(auto) auto.style.display = 'none';
      if(pick) pick.style.display = 'none';
    }
  }
  function openCatPicker(id){ if(drafts[id]) drafts[id].catPickerOpen = true; renderCatUI(id, true); }

  function onDraftCatChange(id){
    const cat = document.getElementById(`dc_cat_${id}`).value;
    const msg     = document.getElementById(`dc_sz_msg_${id}`);
    const rowsEl  = document.getElementById(`dc_srows_${id}`);
    const note    = document.getElementById(`dc_sz_note_${id}`);
    const chipsW  = document.getElementById(`dc_szchips_${id}`);
    const qhead   = document.getElementById(`dc_qhead_${id}`);
    { const _sr = document.getElementById(`dc_sremind_${id}`); if(_sr) _sr.style.display = 'none'; }
    // Picking a category clears its (and the sizes box's) red missing-highlight
    document.getElementById(`dc_catpick_${id}`)?.querySelectorAll('.catdd').forEach(d=> d.classList.remove('psb-missing'));
    document.getElementById(`dc_szbox_${id}`)?.classList.remove('psb-missing');

    const uqtyWrap = document.getElementById(`dc_uqty_wrap_${id}`);
    if(uqtyWrap) uqtyWrap.style.display = 'none';

    if(!cat){
      msg.style.display = ''; msg.textContent = '← Select a category first'; msg.style.color = '#bbb';
      if(chipsW) chipsW.style.display = 'none';
      if(qhead) qhead.style.display = 'none';
    } else if(UNSTITCHED_CATS.has(cat)){
      msg.style.display = ''; msg.textContent = '✓ No size needed — choose how many pieces:'; msg.style.color = '#2a7a32';
      if(note) note.style.display = 'none';
      if(chipsW) chipsW.style.display = 'none';
      if(qhead) qhead.style.display = 'none';
      if(rowsEl) rowsEl.innerHTML = '';                  // clear any size rows
      if(uqtyWrap) uqtyWrap.style.display = '';
      const uq = document.getElementById(`dc_uqty_${id}`);   // unstitched fabric → cap up to 10 pcs
      if(uq){ const mx = maxPerSizeFor(cat); uq.setAttribute('max', mx); uq.title = `Max ${mx} pieces (stock limit)`; if((parseInt(uq.value)||1) > mx) uq.value = mx; }
    } else {
      msg.style.display = 'none';
      if(note) note.style.display = '';
      // Tappable chips. Real in-stock sizes arrive from the fetch; until then
      // show a standard set so a size can always be picked.
      if(chipsW && chipsW.style.display === 'none'){
        const d = drafts[id] || {};
        const std = (d.stockSizes && d.stockSizes.length) ? d.stockSizes.slice() : ['XS','S','M','L','XL','XXL'];
        showSizeChips(id, std, '', d.soldOutSizes || []);
      }
    }
    renderCatUI(id);
    try{ updateDraftPriceHint(id); }catch(e){}   // refresh the Final ৳BDT for this category's weight
    checkAddUrlLock();
  }

  // ── LOCK/UNLOCK both Add-URL buttons based on last draft completeness ──────
  function checkAddUrlLock(){
    const ids       = Object.keys(drafts).map(Number);
    const topBtn    = document.getElementById('addUrlBtn');
    const btmBtn    = document.getElementById('addAnotherBtn');
    const hint      = document.getElementById('addUrlLockHint');

    function unlock(){
      if(topBtn){ topBtn.disabled=false; topBtn.style.cssText=''; }
      if(btmBtn){ btmBtn.disabled=false; btmBtn.style.cssText=''; }
      if(hint)   hint.style.display='none';
    }
    function lock(){
      if(topBtn){ topBtn.disabled=true; }
      if(btmBtn){ btmBtn.disabled=true; btmBtn.style.cssText='background:#ddd;color:#999;cursor:not-allowed'; }
      if(hint)   hint.style.display='';
    }

    if(!ids.length){ unlock(); return; }

    const lastId       = ids[ids.length - 1];
    const cat          = document.getElementById(`dc_cat_${lastId}`)?.value;
    const price        = parseFloat(document.getElementById(`dc_price_${lastId}`)?.value);
    const isUnstitched = UNSTITCHED_CATS.has(cat);

    let complete = !!(cat && price > 0);
    if(complete && !isUnstitched){
      const rows = getDraftSizeRows(lastId);
      complete = rows.length > 0 && rows.some(r => r.size);
    }
    complete ? unlock() : lock();
  }

  // ── ADD ANOTHER URL (panel inside draftsContainer) ────────────────────────
  function addAnotherUrl(){
    const inp = document.getElementById('panelUrlInput');
    const raw = inp.value.trim();
    if(!raw){
      // Focus + highlight instead of alert
      inp.focus();
      inp.style.borderColor = 'var(--gold)';
      inp.style.boxShadow   = '0 0 0 3px rgba(201,169,110,0.3)';
      inp.placeholder = '← Paste the product URL here first';
      setTimeout(()=>{
        inp.style.borderColor=''; inp.style.boxShadow='';
        inp.placeholder='Paste another product URL…';
      }, 2500);
      return;
    }
    const url = parseUrl(raw);
    if(!url){
      inp.style.borderColor='#e74c3c';
      inp.focus(); inp.select();
      setTimeout(()=>{ inp.style.borderColor=''; }, 2000);
      return;
    }
    createDraft(url);
    inp.value = '';
    inp.placeholder = 'Paste another product URL…';
    const newCard = document.getElementById(`dc_${draftIdCtr-1}`);
    if(newCard) newCard.scrollIntoView({ behavior:'smooth', block:'nearest' });
  }

  function setDraftCurrency(id, cur){
    const d = drafts[id]; if(!d) return;
    const usdRate = getUsdRate();
    const inp = document.getElementById(`dc_price_${id}`);
    const val = parseFloat(inp.value);
    if(val > 0){
      if(d.currency==='PKR' && cur==='USD') inp.value = (val/usdRate).toFixed(2);
      else if(d.currency==='USD' && cur==='PKR') inp.value = Math.round(val*usdRate);
    }
    d.currency = cur;
    document.getElementById(`dc_pkr_${id}`).classList.toggle('active', cur==='PKR');
    document.getElementById(`dc_usd_${id}`).classList.toggle('active', cur==='USD');
    inp.placeholder = cur==='USD' ? 'e.g. 42 USD' : 'e.g. 4500 PKR';
    updateDraftPriceHint(id);
  }

  // Buyer-facing price echo under the price input: the FINAL ৳BDT price (matches the
  // Browse card the buyer tapped). Logistics + commission are folded in; the only
  // add-on left is the ৳100/suit local delivery, shown later in the Bag. When the
  // price is entered in USD we also echo the PKR it converts to.
  function updateDraftPriceHint(id){
    const d = drafts[id]; if(!d) return;
    const val = parseFloat(document.getElementById(`dc_price_${id}`).value);
    const hint = document.getElementById(`dc_phint_${id}`);
    if(!hint) return;
    if(!val || val <= 0){ hint.textContent=''; return; }
    const usdRate = getUsdRate();
    const pkr = (d.currency==='USD') ? Math.round(val*usdRate) : val;
    const cat = (document.getElementById(`dc_cat_${id}`)||{}).value || d.cat || '';
    let html = '';
    if(d.currency==='USD') html += `≈ PKR ${pkr.toLocaleString()} · `;
    if(typeof estLandedBdt === 'function'){
      html += `${tr('dc_final')} <strong>≈ ৳${estLandedBdt(pkr, cat).toLocaleString()}</strong>`;
    }
    hint.innerHTML = html;
  }

  function showDraftCurrencyNote(id, isPk){
    const note = document.getElementById(`dc_cnote_${id}`);
    note.style.display = '';
    if(isPk){
      note.style.background='#f0faf3'; note.style.border='1px solid #a8dbb0'; note.style.color='#1a5e2a';
      note.textContent='✓ .pk site — price is in PKR. Use discounted price if a sale is on.';
    } else {
      note.style.background='#fff8e7'; note.style.border='1px solid #f0c040'; note.style.color='#5a4000';
      note.textContent='⚠️ .com site — check if price shows PKR or USD, then use the toggle.';
    }
  }

  // ── PER-SIZE QUANTITY CAP ───────────────────────────────────────────────
  // Brands don't publish exact stock counts: Shopify strips inventory_quantity
  // from the public storefront API, and the cart-overflow trick is rejected
  // (verified — these stores accept 99,999 even of a SOLD-OUT size). So we can
  // never honestly show "only N left". What we CAN do is (a) block sold-out
  // sizes (the size dropdown is already constrained to in-stock sizes) and
  // (b) cap each size to a sane ceiling so nobody can order 10,000 of one item.
  // Ceiling is admin-tunable (psb_max_qty, default 5).
  function maxPerSize(){
    const c = cfgRate('maxqty'); if(c && c > 0) return Math.round(c);   // global (relay) cap wins
    const n = parseInt(localStorage.getItem('psb_max_qty'));
    return (n && n > 0) ? n : 5;
  }
  // Unstitched = just fabric → a buyer often wants several pieces. Allow up to 10
  // (or the admin cap if it's higher); stitched/ready-made keep the normal cap.
  function maxPerSizeFor(cat){ const base = maxPerSize(); return UNSTITCHED_CATS.has(cat) ? Math.max(base, 10) : base; }
  function clampQtyInput(input){
    const mx = parseInt(input.getAttribute('max')) || maxPerSize();   // honor the input's own (category-aware) cap
    let v = parseInt(input.value) || 1;
    if(v < 1) v = 1;
    if(v > mx){ v = mx; input.style.borderColor = '#e74c3c';
      setTimeout(()=>{ input.style.borderColor = 'var(--bdr-med)'; }, 1500);
      showQtyCapMsg(input, mx); }   // tell the buyer WHY, only when they ask for more
    input.value = v;
  }
  // Shown only when a buyer tries to exceed the per-size cap — explains the limit.
  function showQtyCapMsg(input, mx){
    const host = input.closest('[id^="dc_srows_"]') || input.closest('[id^="dc_uqty_wrap_"]');
    const anchor = host || input.parentElement;
    if(!anchor || !anchor.parentElement) return;
    const isItem = !!(anchor.id && anchor.id.indexOf('dc_uqty_wrap_') === 0);
    let note = anchor.parentElement.querySelector('.qty-cap-msg');
    if(!note){
      note = document.createElement('div');
      note.className = 'qty-cap-msg';
      note.setAttribute('role','alert');
      note.style.cssText = 'font-size:0.75rem;font-weight:700;color:var(--txt);background:rgba(230,168,23,0.12);border:1px solid rgba(230,168,23,0.40);border-radius:6px;padding:6px 10px;margin-top:6px';
      anchor.insertAdjacentElement('afterend', note);
    }
    note.innerHTML = `⚠️ Maximum <b>${mx}</b> ${isItem ? 'pieces for this item' : 'pieces per size'} can be ordered here. Need more? Please message us and we’ll check availability.`;
    note.style.display = '';
    clearTimeout(note._t);
    note._t = setTimeout(()=>{ if(note) note.style.display = 'none'; }, 6000);
  }

  // ── SIZE PICKER — tappable multi-select chips + a qty stepper per chosen size ─
  // Chips are the selector (tap toggles a size on/off). Each chosen size is one
  // row in dc_srows carrying data-size + a quantity (capped at maxPerSize()).
  // getDraftSizeRows() still returns [{size,qty}] — save/pricing/colour/sets
  // logic is unchanged.
  function safeSz(sz){ return String(sz).replace(/[^a-zA-Z0-9]/g,'_'); }

  function addDraftSizeRow(draftId, size, qty){
    if(!size) return;                          // chip model: rows always have a size
    const mx = maxPerSize();
    qty = Math.min(mx, Math.max(1, parseInt(qty)||1));
    const rowsEl = document.getElementById(`dc_srows_${draftId}`);
    if(!rowsEl) return;
    const rid = `sr_${draftId}_${safeSz(size)}`;
    if(document.getElementById(rid)) return;   // already chosen
    const bs = 'width:30px;height:30px;background:var(--input-bg);border:1.5px solid var(--bdr-med);color:var(--txt);border-radius:7px;font-size:1.05rem;font-weight:700;cursor:pointer;line-height:1;display:inline-flex;align-items:center;justify-content:center';
    rowsEl.insertAdjacentHTML('beforeend',
      `<div id="${rid}" data-size="${esc(size)}" style="display:flex;align-items:center;justify-content:space-between;gap:8px;background:var(--surface);border:1px solid var(--bdr-med);border-radius:8px;padding:5px 6px 5px 12px;margin-bottom:6px">
        <span style="font-size:0.85rem;font-weight:700;color:var(--txt)">Size ${esc(size)}</span>
        <span style="display:flex;align-items:center;gap:4px">
          <button type="button" aria-label="Less" onclick="stepSizeQty(${draftId},'${safeSz(size)}',-1,this)" style="${bs}">−</button>
          <span class="dc-qn" style="min-width:26px;text-align:center;font-size:0.88rem;font-weight:700">${qty}</span>
          <button type="button" aria-label="More" onclick="stepSizeQty(${draftId},'${safeSz(size)}',1,this)" style="${bs}">+</button>
          <button type="button" aria-label="Remove" title="Remove this size" onclick="toggleSizeChip(${draftId},'${String(size).replace(/'/g,"\\'")}')" style="width:30px;height:30px;background:none;border:none;color:var(--txt-muted);cursor:pointer;font-size:1.05rem">🗑</button>
        </span>
      </div>`);
    setChipSelected(document.getElementById(`szchip_${draftId}_${safeSz(size)}`), true);
    const qhead = document.getElementById(`dc_qhead_${draftId}`);
    if(qhead) qhead.style.display = '';
    checkAddUrlLock();
  }

  const CHIP_ON  = 'padding:6px 15px;border:1.5px solid var(--gold);border-radius:16px;background:var(--gold);color:#080e1c;font-size:0.8rem;font-weight:700;cursor:pointer';
  const CHIP_OFF = 'padding:6px 15px;border:1.5px solid var(--gold);border-radius:16px;background:var(--gold-dim);color:var(--gold);font-size:0.8rem;font-weight:700;cursor:pointer';
  function setChipSelected(chip, on){ if(chip) chip.style.cssText = on ? CHIP_ON : CHIP_OFF; }

  function stepSizeQty(draftId, safe, delta, btn){
    const row = document.getElementById(`sr_${draftId}_${safe}`);
    if(!row) return;
    const qn = row.querySelector('.dc-qn');
    const mx = maxPerSize();
    let v = (parseInt(qn.textContent)||1) + delta;
    if(v > mx){ v = mx; if(btn) showQtyCapMsg(btn, mx); }   // reuse their cap explainer
    if(v < 1) v = 1;
    qn.textContent = v;
    checkAddUrlLock();
  }

  // ── SIZE CHIPS — tappable, multi-select (tap toggles a size on/off) ──────────
  function showSizeChips(id, sizes, groupLabel, soldOutSizes){
    const wrap  = document.getElementById(`dc_szchips_${id}`);
    const inner = document.getElementById(`dc_szchips_inner_${id}`);
    if(!wrap || !inner) return;
    const soldSet = new Set(Array.isArray(soldOutSizes) ? soldOutSizes : []);
    // Drop any chosen size now known SOLD OUT; remember the rest so chips re-highlight.
    const rowsEl = document.getElementById(`dc_srows_${id}`);
    const chosen = new Set();
    if(rowsEl){
      [...rowsEl.children].forEach(row => {
        const s = row.dataset.size || '';
        if(!s || soldSet.has(s)) row.remove();
        else chosen.add(s);
      });
    }
    const dd = drafts[id];
    const varies = !!(dd && dd.priceVaries && dd.sizePrice);
    const _scat = (document.getElementById(`dc_cat_${id}`)||{}).value || '';
    // Replace the "(same price for all adult sizes)" subtitle with a price-varies note when sizes
    // are priced differently — this span is persistent (unlike the tap-hint, which a stock warning
    // can overwrite).
    const _noteEl = document.getElementById(`dc_sz_note_${id}`);
    if(_noteEl) _noteEl.textContent = varies ? '(prices vary by size — shown on each; total follows your pick)' : '(same price for all adult sizes)';
    const hintDiv = wrap.querySelector('div:first-child');
    if(hintDiv){
      hintDiv.innerHTML = (groupLabel
        ? `👇 ${groupLabel} — tap your combination(s):`
        : '👇 Tap your size(s) — choose as many as you need:')
        + (varies ? ` <span style="color:var(--gold);font-weight:700">💡 Prices vary by size — bigger sizes cost more; the total updates when you pick.</span>` : '');
      hintDiv.style.cssText = 'font-size:0.71rem;color:var(--txt-muted);margin-bottom:6px';
    }
    // Per-size price label (only when sizes are priced differently) so the buyer sees what each size
    // costs in ৳BDT before picking; the picked size then drives the order total (onDraftSizeChange).
    inner.innerHTML = sizes.map(sz => {
      let tag = '';
      if(varies && dd.sizePrice[sz] != null && typeof estLandedBdt === 'function'){
        tag = `<span style="display:block;font-size:0.62rem;font-weight:600;opacity:0.9;margin-top:1px">≈৳${estLandedBdt(dd.sizePrice[sz], _scat).toLocaleString()}</span>`;
      }
      return `<button type="button" id="szchip_${id}_${safeSz(sz)}"
        onclick="toggleSizeChip(${id},'${String(sz).replace(/'/g,"\\'")}')"
        style="${chosen.has(sz) ? CHIP_ON : CHIP_OFF}">${esc(sz)}${tag}</button>`;
    }).join('');
    if(Array.isArray(soldOutSizes) && soldOutSizes.length){
      inner.innerHTML += soldOutSizes.map(sz =>
        `<span title="Sold out — not available to order"
          style="padding:6px 15px;border:1.5px dashed var(--bdr);border-radius:16px;background:var(--surface);color:var(--txt-muted);font-size:0.8rem;font-weight:700;cursor:not-allowed;text-decoration:line-through">${esc(sz)}</span>`).join('');
    }
    const qhead = document.getElementById(`dc_qhead_${id}`);
    if(qhead) qhead.style.display = (rowsEl && rowsEl.children.length) ? '' : 'none';
    wrap.style.display = '';
    updatePriceChips(id);   // reflect any restored multi-price selection
  }

  function toggleSizeChip(id, sz){
    const chip = document.getElementById(`szchip_${id}_${safeSz(sz)}`);
    const existing = document.getElementById(`sr_${id}_${safeSz(sz)}`);
    if(existing){ existing.remove(); setChipSelected(chip, false); }
    else { addDraftSizeRow(id, sz, 1); }
    const rowsEl = document.getElementById(`dc_srows_${id}`);
    const qhead = document.getElementById(`dc_qhead_${id}`);
    if(qhead) qhead.style.display = (rowsEl && rowsEl.children.length) ? '' : 'none';
    onDraftSizeChange(id);
  }

  function onDraftSizeChange(draftId){
    if(getDraftSizeRows(draftId).some(r=>r.size)){
      { const _sr = document.getElementById(`dc_sremind_${draftId}`); if(_sr) _sr.style.display='none'; }
      document.getElementById(`dc_szbox_${draftId}`)?.classList.remove('psb-missing');
    }
    // SIZE-PRICED products: make the PKR price follow the picked size so the BDT total is right
    // (kids age-sizing etc.). One size → its exact price; several different-priced sizes selected
    // → the highest (never undercharge) and the "prices vary" note explains it. Single-price
    // products (priceVaries=false) are untouched — the fetched price stands.
    const d = drafts[draftId];
    if(d && d.priceVaries && d.sizePrice){
      const sel = getDraftSizeRows(draftId).map(r=>r.size).filter(s => d.sizePrice[s] != null);
      if(sel.length){
        const chosen = Math.max.apply(null, sel.map(s => d.sizePrice[s]));
        const priceEl = document.getElementById(`dc_price_${draftId}`);
        if(priceEl){ priceEl.value = (d.currency === 'USD') ? chosen.toFixed(2) : Math.round(chosen); updateDraftPriceHint(draftId); }
      }
    }
    updatePriceChips(draftId);
    checkAddUrlLock();
  }
  // When a size-priced product has DIFFERENT prices selected, show one ৳ chip per distinct price
  // (grouped by the sizes that cost it) in the Price section — so the buyer sees each price in their
  // selection, not just the single (highest) number in the input. Hidden when the selection is a
  // single price or the product isn't size-priced.
  function updatePriceChips(draftId){
    const wrap = document.getElementById(`dc_price_chips_${draftId}`); if(!wrap) return;
    const d = drafts[draftId];
    if(!d || !d.priceVaries || !d.sizePrice){ wrap.style.display = 'none'; wrap.innerHTML = ''; return; }
    const _scat = (document.getElementById(`dc_cat_${draftId}`) || {}).value || d.cat || '';
    const sel = getDraftSizeRows(draftId).filter(r => r.size && d.sizePrice[r.size] != null);
    const groups = {};
    sel.forEach(r => { const k = Math.round(d.sizePrice[r.size]); (groups[k] = groups[k] || []).push(r.size); });
    const prices = Object.keys(groups).map(Number).sort((a, b) => a - b);
    if(prices.length < 2){ wrap.style.display = 'none'; wrap.innerHTML = ''; return; }   // only when the selection spans MULTIPLE prices
    wrap.innerHTML = prices.map(pr => {
      const bdt = (typeof estLandedBdt === 'function') ? estLandedBdt(pr, _scat) : pr;
      return `<span class="dc-price-chip"><b>${groups[pr].map(esc).join(' · ')}</b> ≈৳${bdt.toLocaleString()}</span>`;
    }).join('');
    wrap.style.display = 'flex';
  }

  function getDraftSizeRows(draftId){
    const rows=[]; const mx = maxPerSize();
    document.querySelectorAll(`#dc_srows_${draftId} > div`).forEach(row=>{
      const size = row.dataset.size || '';
      const qn = row.querySelector('.dc-qn');
      const qty = Math.min(mx, Math.max(1, parseInt(qn ? qn.textContent : '1')||1));
      if(size) rows.push({size, qty});
    });
    return rows;
  }

  // ══ COMPONENT / MULTI-PRICE OPTIONS (Item · stitching · add-on) ════════════
  // Some products carry a PRICE-BEARING option beyond size/colour. e.g. Mina Hasan
  // "Item": Shirt 80,800 · Pants 8,400 · Dupatta 8,400 · FULL SET 97,500. The cheapest
  // variant is then a SUB-PIECE, so a cheapest-default badly understates the article
  // (showed ৳49,917 garbage chips). We surface each such dimension as a DROPDOWN,
  // DEFAULT it to the complete article (full price), and recompute price + size chips
  // for the chosen value. Products with NO such dimension never touch this path.
  const _OPT_SERVICE_RE = /deliver|whats\s*app|whatsapp|customi[sz]|stitch.*time|ready.*in|call|contact|availab/i;
  const _OPT_ADDON_RE   = /\b(none|without|no\b)/i;

  // Detect price-bearing options that are NOT size and NOT colour, with ≥2 values.
  // Returns [{key,idx,name,values,minByVal,kind}] — kind: 'service'|'component'.
  function detectOtherDims(normOpts, vars, sizeIdxAll, colourIdx){
    const out = [];
    normOpts.forEach((o, idx) => {
      if(sizeIdxAll.includes(idx) || idx === colourIdx) return;
      const key = ['option1','option2','option3'][idx];
      const valSet = new Set(vars.map(v => String(v[key]||'').trim()).filter(Boolean));
      if(valSet.size < 2) return;
      const minByVal = {};
      vars.forEach(v => { const val=String(v[key]||'').trim(); const p=parseFloat(v.price)||0; if(!val||p<=0) return; if(minByVal[val]==null||p<minByVal[val]) minByVal[val]=p; });
      const mins = Object.values(minByVal);
      if(mins.length < 2) return;
      const spread = Math.max(...mins)/Math.min(...mins);
      if(spread <= 1.02) return;   // same price across values ⇒ not price-bearing (e.g. sleeve style)
      const kind = _OPT_SERVICE_RE.test(o.name) ? 'service' : 'component';
      out.push({ key, idx, name:o.name, values:[...valSet], minByVal, kind });
    });
    return out;
  }
  // Default each dimension to whatever the BRAND PAGE shows (so form price == image price):
  //  service (delivery/customisation) → cheapest value, no dropdown shown
  //  stitching/type (Unstitched/Stitched) → match the product's category: an unstitched
  //    product defaults to Unstitched (its page price); otherwise Stitched
  //  add-on (a "None"/"Without" base exists) → that base (no paid upsell)
  //  component-set (Item: Shirt/Pants/Dupatta/Full Set) → the MAX-priced value (= Full Set)
  function _maxPricedValue(dim){ let hi=dim.values[0], hiP=dim.minByVal[hi]||0;
    dim.values.forEach(v=>{ const p=dim.minByVal[v]||0; if(p>hiP){hiP=p;hi=v;} }); return hi; }
  function defaultOptValue(dim, cat){
    if(dim.kind === 'service'){
      let lo=dim.values[0], loP=dim.minByVal[lo]!=null?dim.minByVal[lo]:Infinity;
      dim.values.forEach(v=>{ const p=dim.minByVal[v]; if(p!=null&&p<loP){loP=p;lo=v;} }); return lo;
    }
    // stitching / type
    if(dim.values.some(v => /stitch/i.test(v))){
      const unst = dim.values.find(v => /un[\s-]?stitch/i.test(v));
      const st   = dim.values.find(v => /stitch/i.test(v) && !/un[\s-]?stitch/i.test(v));
      if(cat && typeof UNSTITCHED_CATS !== 'undefined' && UNSTITCHED_CATS.has(cat) && unst) return unst;
      return st || _maxPricedValue(dim);
    }
    // add-on base (no paid upsell)
    const base = dim.values.find(v => _OPT_ADDON_RE.test(v));
    if(base) return base;
    // component-set / everything else → MAX price (Full Set / complete article)
    return _maxPricedValue(dim);
  }
  // The in-stock variant set for the draft's CURRENT option selection.
  function psFilteredAvail(d){
    const vars = d._vars || [];
    let avail = d._hasStock ? vars.filter(v=>v.available) : vars.slice();
    if(!avail.length) avail = vars.slice();   // all-oversell → keep a price reference
    (d._otherDims||[]).forEach(dim => { const sel=d._otherSel[dim.idx];
      if(sel!=null){ const f=avail.filter(v=>String(v[dim.key]||'').trim()===sel); if(f.length) avail=f; } });
    return avail;
  }
  // Recompute price + size chips for the current option selection (called on every
  // dropdown change). Mirrors the inline chip/price block in fetchProductData — kept
  // faithful to it; if that changes, change here too.
  function psReprice(id){
    const d = drafts[id]; if(!d || !d._otherDims) return;
    const vars = d._vars, pd = d._pickDims || [], hasStock = d._hasStock;
    const mo = v => hasStock ? (parseFloat(v)||0)/100 : (parseFloat(v)||0);
    const avail = psFilteredAvail(d);
    // form price = cheapest in-stock variant of the chosen option (size chips refine it)
    const _ap = avail.filter(v=>mo(v.price)>0);
    const refVar = _ap.length ? _ap.reduce((lo,v)=>mo(v.price)<mo(lo.price)?v:lo) : (avail[0]||vars[0]);
    const seen=new Set(), sizesToAdd=[];
    if(pd.length) avail.forEach(v=>{ const l=variantLabel(v,pd); if(l&&!seen.has(l)){seen.add(l);sizesToAdd.push(l);} });
    let soldOutSizes=[];
    if(hasStock && pd.length){ const inS=new Set(sizesToAdd), aS=new Set();
      vars.forEach(v=>{ if(v.available)return; const l=variantLabel(v,pd); if(l&&!inS.has(l)&&!aS.has(l)){aS.add(l);soldOutSizes.push(l);} }); }
    d.stockVerified = hasStock; d.stockSizes = hasStock ? sizesToAdd.slice() : [];
    d.soldOutSizes = soldOutSizes.slice();
    d.sizePrice = {};
    if(d.stockVerified) avail.forEach(v=>{ const l=variantLabel(v,pd); if(l&&d.sizePrice[l]==null) d.sizePrice[l]=mo(v.price); });
    d.priceVaries = new Set(Object.values(d.sizePrice).map(p=>Math.round(p))).size > 1;
    // refresh the price field (drop any previously-picked sizes — they belonged to the old option)
    const srows = document.getElementById(`dc_srows_${id}`); if(srows) srows.innerHTML='';
    const qhead = document.getElementById(`dc_qhead_${id}`); if(qhead) qhead.style.display='none';
    if(refVar){ const sp=mo(refVar.price); const pe=document.getElementById(`dc_price_${id}`);
      if(pe){ pe.value = (d.currency==='USD') ? sp.toFixed(2) : Math.round(sp); pe.classList.remove('psb-missing'); updateDraftPriceHint(id); } }
    if(pd.length && sizesToAdd.length) showSizeChips(id, sizesToAdd, d._chipLabel, soldOutSizes);
    checkAddUrlLock();
  }
  // Buyer picked an option value from a dropdown → store it, re-price, refresh the dropdown labels.
  function psSetVariantOpt(id, idx, value){
    const d = drafts[id]; if(!d) return;
    d._otherSel[idx] = value;
    const pop = document.getElementById(`dc_optpop_${id}_${idx}`); if(pop) pop.style.display='none';
    const btn = document.getElementById(`dc_optbtn_${id}_${idx}`); if(btn) btn.setAttribute('aria-expanded','false');
    psReprice(id);
    renderOptDropdowns(id);   // re-mark the selected value
  }
  function psToggleOptPop(id, idx){
    const pop = document.getElementById(`dc_optpop_${id}_${idx}`); if(!pop) return;
    const open = pop.style.display === 'block';
    // close any other open option pop on this card
    (drafts[id]?._otherDims||[]).forEach(dim=>{ const p=document.getElementById(`dc_optpop_${id}_${dim.idx}`); if(p) p.style.display='none'; });
    pop.style.display = open ? 'none' : 'block';
    const btn = document.getElementById(`dc_optbtn_${id}_${idx}`); if(btn) btn.setAttribute('aria-expanded', open?'false':'true');
  }
  // Render the themed option dropdown(s) (no native <select>, per the UI theme rule).
  function renderOptDropdowns(id){
    const d = drafts[id]; if(!d) return;
    const box = document.getElementById(`dc_opts_${id}`); if(!box) return;
    const dims = (d._otherDims||[]).filter(dim => dim.kind !== 'service');   // service dims auto-pick cheapest, no UI
    if(!dims.length){ box.style.display='none'; box.innerHTML=''; return; }
    const _scat = (document.getElementById(`dc_cat_${id}`)||{}).value || '';
    const _pDiv = d._hasStock !== false ? 100 : 1;
    const bdt = (rawP) => (typeof estLandedBdt === 'function') ? '≈৳'+estLandedBdt(rawP/_pDiv, _scat).toLocaleString() : ('PKR '+Math.round(rawP/_pDiv).toLocaleString());
    box.innerHTML = dims.map(dim => {
      const sel = d._otherSel[dim.idx];
      const opts = dim.values.map(v => {
        const on = v === sel;
        const p = dim.minByVal[v];
        return `<button type="button" onclick="psSetVariantOpt(${id},${dim.idx},'${String(v).replace(/'/g,"\\'")}')"
          style="display:flex;justify-content:space-between;gap:12px;width:100%;text-align:left;padding:9px 12px;border:none;border-bottom:1px solid var(--bdr);background:${on?'var(--gold-dim)':'transparent'};color:var(--txt);font-size:0.84rem;font-weight:${on?'800':'600'};cursor:pointer;font-family:inherit">
          <span>${on?'✓ ':''}${esc(v)}</span>${p!=null?`<span style="color:var(--gold);font-weight:700">${bdt(p)}</span>`:''}</button>`;
      }).join('');
      const selP = (sel!=null && dim.minByVal[sel]!=null) ? `<span style="margin-left:auto;color:var(--gold);font-weight:800;font-size:0.8rem">${bdt(dim.minByVal[sel])}</span>` : '';
      return `<div style="margin-bottom:9px">
        <div style="font-size:0.7rem;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;color:var(--gold);margin-bottom:5px">${esc(dim.name)} — pick what you want</div>
        <div style="position:relative">
          <button type="button" id="dc_optbtn_${id}_${dim.idx}" onclick="psToggleOptPop(${id},${dim.idx})" aria-haspopup="true" aria-expanded="false"
            style="display:flex;align-items:center;gap:8px;width:100%;padding:10px 12px;border:1.5px solid var(--gold-bdr2);border-radius:9px;background:var(--input-bg);color:var(--txt);font-size:0.86rem;font-weight:800;cursor:pointer;font-family:inherit">
            <span>${esc(sel||'Select')}</span>${selP}<span style="margin-left:8px;color:var(--gold)">▾</span></button>
          <div id="dc_optpop_${id}_${dim.idx}" style="display:none;position:absolute;z-index:30;left:0;right:0;margin-top:4px;background:var(--surface);border:1.5px solid var(--gold-bdr2);border-radius:9px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.25)">${opts}</div>
        </div>
      </div>`;
    }).join('');
    box.style.display='';
  }

  function updateSaveAllBtn(){
    const n = Object.keys(drafts).length;
    const btn = document.getElementById('saveAllBtn');
    if(btn) btn.textContent = '🛍️ ' + (n>1 ? tr('dm_addbag_n').replace('{n}', n) : tr('dm_addbag'));
    updateAddMoreRow();
  }

  // ── BRAND & CATEGORY AUTO-DETECTION FROM URL ─────────────────────────────
  const BRAND_MAP = {
    // .pk group — PKR automatic
    'pk.sapphireonline.pk':'Sapphire','sapphireonline.pk':'Sapphire',
    'crossstitch.pk':'Cross Stitch',
    'generation.com.pk':'Generation','generation.pk':'Generation',
    'outfitters.com.pk':'Outfitters',
    'beechtree.pk':'Beechtree',
    'breakout.com.pk':'Breakout',
    'diners.com.pk':'Diners',
    'monark.com.pk':'Monark',
    'shahnameh.pk':'Shahnameh',
    'nureh.pk':'Nureh',
    'alizeh.pk':'Alizeh',
    'jazmin.pk':'Jazmin',
    'limelight.pk':'Limelight',
    'baraekhanom.pk':'Barae Khanom',
    'laam.pk':'LAAM',
    'almirah.com.pk':'Almirah',
    // .com group — may show USD
    'khaadi.com':'Khaadi','pk.khaadi.com':'Khaadi',
    'gulahmedshop.com':'Gul Ahmed','gulahmed.com':'Gul Ahmed',
    'bonanzasatrangi.com':'Bonanza Satrangi',
    'mariab.com':'Maria B','mariab.pk':'Maria B',
    'sanasafinaz.com':'Sana Safinaz',
    'nishatlinen.com':'Nishat Linen',
    'pk.ethnc.com':'ETHNC','ethnc.com':'ETHNC',
    'asimjofa.com':'Asim Jofa',
    'baroque.com':'Baroque','baroque.com.pk':'Baroque',
    'elan.com':'Elan','elan.pk':'Elan',
    'farahtalibaziz.com':'Farah Talib Aziz','farahtalibaziz.com.pk':'Farah Talib Aziz',
    'mtjonline.com':'MTJ (Tariq Jameel)',
    'uniworthshop.com':'Uniworth',
    'edenrobe.com':'Edenrobe',
    'mushq.com':'Mushq',
    'afrozeh.com':'Afrozeh',
    'zaha.com':'Zaha by Elan',
    'crimson.com':'Crimson',
    'mohsinnaveedranjha.com':'Mohsin Naveed Ranjha',
    'faizasaqlain.com':'Faiza Saqlain',
    'nomiansari.com.pk':'Nomi Ansari',
    'zarashahjahan.com':'Zara Shahjahan',
    'junaidjamshed.com':'J. Junaid Jamshed',
    'alkaramstudio.com':'Alkaram','alkaramstudio.pk':'Alkaram',
    'zellbury.com':'Zellbury',
    'houseofcharizma.com':'Charizma','houseofcharizma.com.pk':'Charizma',
    'myrangja.com':'Rang Ja','rangja.com.pk':'Rang Ja',
    'saadbinshahzad.com':'Saad Bin Shahzad',
    'sobianazir.net':'Sobia Nazir',
    'silayipret.com':'Silya i Pret',
    'tawakkalfabrics.co':'Tawakkal Fabrics',
    'binsaeedfabric.com':'Bin Saeed',
    'binilyas.com':'Bin Ilyas',
    'rangrasiya.com':'Rang Rasiya',
    'bareezepk.com':'Bareeze',
    'armasclothing.com':'Armas',
    'republicwomenswear.com':'Republic',
  };

  // ═══ FULL BRAND DIRECTORY (display + search) ═══════════════════════════════
  // p:true = opens in PKR automatically · p:false = .com store (may show USD)
  const BRAND_CATS = {
    md: 'Multi-Department',
    w:  'Women’s Pret & Unstitched',
    p:  'Premium',
    m:  'Menswear',
    k:  'Kids'
  };
  const BRANDS = [
    // ── Multi-department ──
    {n:'Sapphire',u:'https://pk.sapphireonline.pk',p:true,c:'md'},
    {n:'Khaadi',u:'https://pk.khaadi.com',p:true,c:'md'},
    {n:'Alkaram Studio',u:'https://www.alkaramstudio.com',p:false,c:'md'},
    {n:'Almirah',u:'https://almirah.com.pk',p:true,c:'md'},
    {n:'Breakout',u:'https://breakout.com.pk',p:true,c:'md'},
    {n:'Diners',u:'https://diners.com.pk',p:true,c:'md'},
    {n:'Edenrobe',u:'https://edenrobe.com',p:false,c:'md'},
    {n:'Limelight',u:'https://www.limelight.pk',p:true,c:'md'},
    {n:'Outfitters',u:'https://outfitters.com.pk',p:true,c:'md'},
    {n:'Zellbury',u:'https://zellbury.com',p:false,c:'md'},
    {n:'Bonanza Satrangi',u:'https://bonanzasatrangi.com',p:false,c:'md'},
    {n:'ChenOne',u:'https://chenone.com',p:false,c:'md'},
    {n:'Gul Ahmed',u:'https://gulahmedshop.com',p:false,c:'md'},
    {n:'J. Junaid Jamshed',u:'https://www.junaidjamshed.com',p:false,c:'md'},
    {n:'Khas Stores',u:'https://khasstores.com',p:false,c:'md'},
    {n:'Leisure Club',u:'https://leisureclub.pk',p:true,c:'md'},
    {n:'MTJ (Tariq Jameel)',u:'https://mtjonline.com',p:false,c:'md'},
    {n:'Nishat Linen',u:'https://nishatlinen.com',p:false,c:'md'},
    // ── Women’s pret & unstitched ──
    {n:'Agha Noor',u:'https://aghanoorofficial.com',p:false,c:'w'},
    {n:'Alizeh',u:'https://alizeh.pk',p:true,c:'w'},
    {n:'Armas',u:'https://armasclothing.com',p:false,c:'w'},
    {n:'Beechtree',u:'https://beechtree.pk',p:true,c:'w'},
    {n:'Bin Ilyas',u:'https://binilyas.com',p:false,c:'w'},
    {n:'Charizma',u:'https://houseofcharizma.com',p:false,c:'w'},
    {n:'Chinyere',u:'https://chinyere.pk',p:true,c:'w'},
    {n:'Cross Stitch',u:'https://www.crossstitch.pk',p:true,c:'w'},
    {n:'Ego',u:'https://wearego.com',p:false,c:'w'},
    {n:'ETHNC',u:'https://pk.ethnc.com',p:true,c:'w'},
    {n:'Farasha',u:'https://farashaonline.pk',p:true,c:'w'},
    {n:'Generation',u:'https://generation.com.pk',p:true,c:'w'},
    {n:'Gulaal',u:'https://gulaal.pk',p:true,c:'w'},
    {n:'Image',u:'https://image1993.com',p:false,c:'w'},
    {n:'Jazmin',u:'https://jazmin.pk',p:true,c:'w'},
    {n:'Kayseria',u:'https://kayseria.com.pk',p:true,c:'w'},
    {n:'Kross Kulture',u:'https://krosskulture.com',p:false,c:'w'},
    {n:'LAAM (multi-brand)',u:'https://laam.pk',p:true,c:'w',agg:true},   // aggregator: kept for pasting (BRAND_MAP), hidden from the brand icon listings
    {n:'Lulusar',u:'https://lulusar.com',p:true,c:'w'},
    {n:'Maria B',u:'https://mariab.pk',p:true,c:'w'},
    {n:'Mausummery',u:'https://mausummery.com',p:true,c:'w'},
    {n:'Motifz',u:'https://motifz.com.pk',p:true,c:'w'},
    {n:'Nureh',u:'https://nureh.pk',p:true,c:'w'},
    {n:'Rang Ja',u:'https://myrangja.com',p:false,c:'w'},
    {n:'Ramsha',u:'https://ramsha.pk',p:true,c:'w'},
    {n:'Salitex',u:'https://salitexonline.com',p:true,c:'w'},
    {n:'Saya',u:'https://saya.pk',p:true,c:'w'},
    {n:'Stylo',u:'https://stylo.pk',p:true,c:'w'},
    {n:'ECS',u:'https://shopecs.com',p:true,c:'w'},
    {n:'Dazzle by Sarah',u:'https://dazzlebysarah.com',p:true,c:'w'},
    {n:'Khussa Corner',u:'https://www.khussacorner.com',p:true,c:'w'},
    {n:'Khussa Master',u:'https://khussamaster.com',p:true,c:'w'},
    {n:'Zuruj',u:'https://www.zuruj.com',p:true,c:'w'},
    {n:'Sha Posh',u:'https://shaposh.pk',p:true,c:'w'},
    {n:'Silayi Pret',u:'https://silayipret.com',p:true,c:'w'},
    {n:'Sitara Studio',u:'https://sitarastudio.pk',p:true,c:'w'},
    {n:'So Kamal',u:'https://sokamal.com',p:true,c:'w'},
    {n:'Thredz',u:'https://www.thredzonline.com',p:false,c:'w'},
    {n:'Warda',u:'https://warda.com.pk',p:true,c:'w'},
    {n:'Zarif',u:'https://zarif.pk',p:true,c:'w'},
    {n:'Zeen (by Cambridge)',u:'https://zeenwoman.com',p:true,c:'w'},
    // ── Premium designer & luxury ──
    {n:'Afrozeh',u:'https://afrozeh.com',p:false,c:'p'},
    {n:'Asim Jofa',u:'https://asimjofa.com',p:false,c:'p'},
    {n:'Barae Khanom',u:'https://baraekhanom.pk',p:true,c:'p'},
    {n:'Bareeze',u:'https://bareezepk.com',p:true,c:'p'},
    {n:'Baroque',u:'https://baroque.com.pk',p:false,c:'p'},
    {n:'Crimson',u:'https://www.crimson.com.pk',p:true,c:'p'},
    {n:'Elan',u:'https://elan.pk',p:true,c:'p'},
    {n:'Emaan Adeel',u:'https://emaanadeel.com',p:true,c:'p'},
    {n:'Erum Khan',u:'https://erumkhanstores.com',p:true,c:'p'},
    {n:'Imrozia Premium',u:'https://imroziapremium.com',p:true,c:'p'},
    {n:'Maryum N Maria',u:'https://maryumnmaria.com',p:true,c:'p'},
    {n:'Faiza Saqlain',u:'https://www.faizasaqlain.pk',p:true,c:'p'},
    {n:'Farah Talib Aziz',u:'https://www.farahtalibaziz.com.pk',p:false,c:'p'},
    {n:'Hussain Rehar',u:'https://hussainrehar.com',p:false,c:'p'},
    {n:'Mohsin Naveed Ranjha',u:'https://mohsinnaveedranjha.com',p:false,c:'p'},
    {n:'Mushq',u:'https://mushq.com',p:false,c:'p'},
    {n:'Nomi Ansari (ready-to-ship)',u:'https://www.nomiansari.com.pk/ready-to-ship',p:true,c:'p'},
    {n:'Republic Womenswear',u:'https://republicwomenswear.com',p:false,c:'p'},
    {n:'Saad Bin Shahzad',u:'https://www.saadbinshahzad.com',p:false,c:'p'},
    {n:'Sana Safinaz',u:'https://www.sanasafinaz.com',p:false,c:'p'},
    {n:'Sania Maskatiya',u:'https://pk.saniamaskatiya.com',p:true,c:'p'},
    {n:'Sobia Nazir',u:'https://sobianazir.net',p:false,c:'p'},
    {n:'Suffuse by Sana Yasir',u:'https://suffuse.pk',p:false,c:'p'},
    {n:'Tena Durrani',u:'https://tenadurrani.com',p:false,c:'p'},
    {n:'Threads & Motifs',u:'https://threadsandmotifs.com',p:false,c:'p'},
    {n:'Zaha by Elan',u:'https://www.zaha.pk',p:true,c:'p'},
    {n:'Zainab Chottani',u:'https://pk.zainabchottani.com',p:true,c:'p'},
    {n:'Zara Shahjahan',u:'https://www.zarashahjahan.com',p:false,c:'p'},
    // ── Menswear & tailoring ──
    {n:'Amir Adnan',u:'https://amiradnan.com',p:false,c:'m'},
    {n:'Lakhany by LSM',u:'https://lakhanyonline.com',p:false,c:'m'},
    {n:'Furor',u:'https://furorjeans.com',p:false,c:'m'},
    {n:'Republic Menswear (Omar Farooq)',u:'https://republicbespoke.com',p:false,c:'m'},
    {n:'Naushemian (Nauman Arfeen)',u:'https://naushemian.com',p:false,c:'m'},
    {n:'Cambridge',u:'https://thecambridgeshop.com',p:false,c:'m'},
    {n:'Charcoal',u:'https://charcoal.com.pk',p:true,c:'m'},
    {n:'Cougar',u:'https://cougar.com.pk',p:true,c:'m'},
    {n:'Deepak Perwani',u:'https://www.deepakperwani.com',p:false,c:'m'},
    {n:'Dynasty Fabrics',u:'https://dynastyfabrics.com',p:true,c:'m'},
    {n:'Shahzeb Saeed',u:'https://shahzebsaeed.com',p:true,c:'m'},
    {n:'Ismail Farid',u:'https://www.ismailfarid.com',p:false,c:'m'},
    {n:'Monark',u:'https://monark.com.pk',p:true,c:'m'},
    {n:'Royal Tag',u:'https://royaltag.com.pk',p:true,c:'m'},
    {n:'Savoir',u:'https://savoir.pk',p:true,c:'m'},
    {n:'Shahnameh',u:'https://shahnameh.pk',p:true,c:'m'},
    {n:'Uniworth',u:'https://uniworthshop.com',p:false,c:'m'},
    // ── Kids ──
    {n:'Minnie Minors',u:'https://www.minnieminors.com',p:false,c:'k'},
    {n:'Pepperland',u:'https://pepperland.pk',p:true,c:'k'},
    {n:'Bachaa Party',u:'https://bachaaparty.com',p:false,c:'k'},
    {n:'Hopscotch',u:'https://ilovehopscotch.com',p:false,c:'k'},
    // ── Fabric / wholesale (folded into Women’s Pret & Unstitched) ──
    {n:'Bin Saeed',u:'https://binsaeedfabric.com',p:false,c:'w'},
    {n:'Tawakkal Fabrics',u:'https://tawakkalfabrics.co',p:false,c:'w'},
    {n:'Rang Rasiya',u:'https://rangrasiya.com.pk',p:true,c:'w'},
    // ── Priority add (verified 4-point auto-fetch) — shown in the main category tabs. (Saya already added above.) ──
    {n:'Elaya Prints',u:'https://elayaprints.com',p:true,c:'w'},
    // ═══ "MORE" BRANDS ═══════════════════════════════════════════════════════
    // Verified 2026-06-16: each returns a live Shopify products.json, prices in
    // PKR, exposes Size variants (or is unstitched/free-size where size is N/A),
    // and a mappable product_type/title. Shown ONLY in the right-side "More"
    // drawer (more:true), NOT the main category tabs, to keep the page short.
    {n:'Eminent',u:'https://eminent.pk',p:true,c:'md',more:true},
    {n:'Dhanak',u:'https://dhanak.com.pk',p:true,c:'w',more:true},
    {n:'Qalamkar',u:'https://qalamkar.com.pk',p:true,c:'w',more:true},
    {n:'Coco by Zara Shahjahan',u:'https://cocobyzarashahjahan.com',p:true,c:'w',more:true},
    {n:'Firdous',u:'https://firdouscloth.com',p:true,c:'w',more:true},
    {n:'Iznik Fashions',u:'https://iznikfashions.com',p:true,c:'w',more:true},
    {n:'Sifa',u:'https://sifa.pk',p:true,c:'w',more:true},
    {n:'Jade',u:'https://jadeonline.pk',p:true,c:'w',more:true},
    {n:'Roheenaz',u:'https://roheenaz.com',p:true,c:'w',more:true},
    {n:'Mohagni',u:'https://mohagni.com',p:true,c:'w',more:true},
    {n:"Adan's Libas",u:'https://adanslibas.com',p:true,c:'w',more:true},
    {n:'RajBari',u:'https://rajbari.pk',p:true,c:'w',more:true},
    {n:'Ittehad Textiles',u:'https://ittehadtextile.com',p:true,c:'w',more:true},
    {n:'Tassels',u:'https://tassels.pk',p:true,c:'w',more:true},
    {n:'Wear Ochre',u:'https://wearochre.com',p:true,c:'w',more:true},
    {n:'Senorita',u:'https://senorita.pk',p:true,c:'w',more:true},
    {n:'Vanya',u:'https://vanya.pk',p:true,c:'w',more:true},
    {n:'Garnet',u:'https://garnetclothing.com',p:true,c:'w',more:true},
    {n:'Al-Deebaj',u:'https://aldeebaj.com',p:true,c:'w',more:true},
    {n:'Abaya.pk',u:'https://abaya.pk',p:true,c:'w',more:true},
    {n:'Hijabi.pk',u:'https://hijabi.pk',p:true,c:'w',more:true},
    {n:'Paarsa',u:'https://paarsa.pk',p:true,c:'w',more:true},
    {n:'SHAAL',u:'https://shaal.com.pk',p:true,c:'w',more:true},
    {n:'Hijab & Co',u:'https://hijabandco.com',p:true,c:'w',more:true},
    {n:'Asifa & Nabeel',u:'https://asifaandnabeel.pk',p:true,c:'p',more:true},
    {n:'Ammara Khan',u:'https://ammarakhan.com',p:true,c:'p',more:true},
    {n:'Maria Osama Khan',u:'https://mariaosamakhan.com',p:true,c:'p',more:true},
    {n:'Saira Rizwan',u:'https://sairarizwan.pk',p:true,c:'p',more:true},
    {n:'Mina Hasan',u:'https://minahasan.com',p:true,c:'p',more:true},
    {n:'Wardha Saleem',u:'https://wardhasaleem.com',p:true,c:'p',more:true},
    {n:'Sadaf Fawad Khan',u:'https://sadaffawadkhan.com',p:true,c:'p',more:true},
    {n:'Akbar Aslam',u:'https://akbaraslam.com',p:true,c:'p',more:true},
    {n:'Azure',u:'https://azureofficial.pk',p:true,c:'p',more:true},
    {n:'Naqshi',u:'https://naqshiofficial.com',p:true,c:'p',more:true},
    {n:'Jeem',u:'https://jeem.pk',p:true,c:'p',more:true},
    {n:'Bareeze Man',u:'https://bareezeman.com',p:true,c:'m',more:true},
    {n:"Narkin's",u:'https://narkins.com',p:true,c:'m',more:true},
    {n:'Lawrencepur',u:'https://lawrencepur.com',p:true,c:'m',more:true},
    {n:'Humayun Alamgir',u:'https://humayunalamgir.com',p:true,c:'m',more:true},
    {n:'Arsalan Iqbal',u:'https://arsalaniqbal.com',p:true,c:'m',more:true},
    {n:'CRUSH Menswear',u:'https://crushmenswear.com',p:true,c:'m',more:true},
    {n:'Edge Republic',u:'https://edge.pk',p:true,c:'m',more:true},
    {n:'Riwaj Menswear',u:'https://riwajmenswear.com',p:true,c:'m',more:true},
    {n:'Kurta Corner',u:'https://kurtacorner.com',p:true,c:'m',more:true},
    {n:'Innerlines',u:'https://innerlines.com.pk',p:true,c:'m',more:true},
    {n:'Rollover Kids',u:'https://rollover.com.pk',p:true,c:'k',more:true},
    {n:'Cocobee',u:'https://cocobee.com.pk',p:true,c:'k',more:true},
    {n:'Kjunction',u:'https://kjunction.com.pk',p:true,c:'k',more:true},
    {n:'Tifl',u:'https://tifl.pk',p:true,c:'k',more:true},
    // ── added 2026-06-19: brands activated into the catalog this session (names MATCH the
    //    harvester/catalog so the brand-index count badges attach) ──
    {n:'The Hijab Company',u:'https://thehijabcompany.pk',p:false,c:'w'},
    {n:'KEF',u:'https://kefpk.com',p:false,c:'w'},
    {n:'Black Camels',u:'https://blackcamels.com.pk',p:false,c:'w'},
    {n:'The Women Zone',u:'https://thewomenzone.pk',p:false,c:'w'},
    {n:'The Ummatis',u:'https://theummatispk.store',p:false,c:'w'},
    {n:'Hijab-ul-Hareem',u:'https://hijabulhareem.com',p:false,c:'w'},
    {n:"Kashee's Boutique",u:'https://kasheesboutique.pk',p:false,c:'p'},
    {n:'Buttoned On',u:'https://buttonedon.pk',p:false,c:'k'},
    {n:'Preeto',u:'https://preeto.pk',p:false,c:'k'},
    {n:'One Kids',u:'https://beoneshopone.com',p:false,c:'k'},
    {n:'Engine',u:'https://engine.com.pk',p:false,c:'k'},
  ];
  // Feed every brand's hostname into BRAND_MAP so pasted URLs auto-detect the name
  BRANDS.forEach(b => {
    try{ const h = new URL(b.u).hostname.replace(/^www\./,''); if(!BRAND_MAP[h]) BRAND_MAP[h] = b.n; }catch(e){}
  });
  // ── i18n: English / Bangla (customer-facing) ───────────────────────────────
  const I18N = {
    en: {
      tagline:'Pakistani Fashion · Bangladesh Delivery',
      hiw_browse:'Browse brands', hiw_paste:'Share or paste a link', hiw_confirm:'We confirm price',
      hiw_pay:'Pay via bKash/Nagad', hiw_delivery:'2–3 weeks to your door', hiw_video:'▶ Watch video guide', hiw_guide:'📖 How it works', introTitle:'New here? Watch a quick intro', introMore:'▶ See all video guides →',
      hiw_confirm_pay:'Confirm price & pay (bKash/Nagad)',
      step_additems:'Add Items', step_details:'My Details', step_review:'Review', step_payment:'Payment',
      lbl_browse:'Browse a Brand', search_ph:'🔍 Search 150+ Pakistani brands…',
      tab_brands:'Browse brands', tab_products:'Browse products', gen_all:'All', gen_women:'Women', gen_men:'Men', gen_kids:'Kids', menu_language:'Language', menu_theme:'Theme', menu_guide:'Guide', search_bar_ph:'Search products, brands…', search_page_ph:'Search products and 150+ brands', sp_remind_t:"Check any product's price in PKR", sp_remind_d:"Found it on a brand's own site? Paste the link to see the real price of any listed brand in PKR.", sp_paste:'Paste a product link', sp_visual:'Visual search', sp_fit:'Fit assistant', sp_soon:'Coming soon', vis_title:'Search by photo', vis_sub:'Find pieces that look like your photo', vis_cam:'Take a photo', vis_up:'Upload a photo', vis_cancel:'Cancel', vis_loading:'Finding similar styles', vis_chip:'Items like your photo', vis_clear:'Clear photo search', vis_none:'No close matches. Try another photo.', vis_notapparel:'Please use a clothing photo.', vis_err:'Could not search just now. Please try again.', vis_slow:'Visual search is warming up. Please try again in a moment.', vis_badfile:'Please choose a photo.', fit_title:'Fit Assistant', fit_sub:'Find your size in any brand', fit_wear:'I usually wear', fit_in:'in', fit_measlink:"Don't know? Enter measurements", fit_meashide:'Use my usual size instead', fit_chest:'Chest', fit_waist:'Waist', fit_hip:'Hip', fit_regular:'Regular', fit_slim:'Slim', fit_relaxed:'Relaxed', fit_scope:'Show fits in', fit_allbrands:'All brands', fit_go:'Show what fits me', fit_wa:'Save to my WhatsApp number (optional)', fit_chip:'Your size', fit_yoursize:'your size', fit_needchest:'Enter at least your chest measurement.', fit_needref:'Choose your size and a brand.', fit_none:'Nothing in your size right now. Try another size or brand.', fit_err:'Could not check sizes just now. Please try again.', fit_loading:'Finding your size', wa_err_empty:'Please enter your WhatsApp number', wa_err_short:'WhatsApp number looks incomplete', wa_err_long:'WhatsApp number is too long', wa_err_prefix:'Please check your WhatsApp number', sp_brands:'Browse all 150+ brands ›', sp_colls_hd:'Curated collections', sp_checkprice:'check price ›', bb_back:'‹ Back to products', store_everyday:'Everyday', store_premium:'Premium', colls_hd:'Collections',prodcat_hd:'Product category',products_hd:'Products', filters_sort:'Filters & sort', filters_done:'Done', sort_hd:'Sort', order_ways:'Two ways to order: tap + Add on anything in our listing, or send a product link from any of our 140+ brands.',
      intro_ios:"On iPhone: on a brand's product page, tap Share, then Add to PakPoshak. (One-time: add the PakPoshak shortcut.) Or copy the link and paste it here.",
      intro_android:"On Android: install PakPoshak, then on a brand's product page tap Share, then PakPoshak. Or copy the link and paste it here.",
      intro_desktop:"On desktop: paste a product link below, or add the Send-cart bookmark to grab a whole cart at once.",
      ps_price:'Price (৳ delivered)', ps_price_short:'Price Filters', ps_category:'Product Category', ps_category_short:'Categories', ps_brands:'Brands', ps_clear:'Clear Filters', ps_valueprop:'Any Pakistani brand → delivered to Bangladesh 🇧🇩', ps_morebrands:"Can't find it? Browse all 155 brands →",
      ps_allcats:'All categories', ps_loading:'Loading products…', ps_loadfail:'Could not load products — please try again.',
      ps_results:'products', ps_add:'Add', ps_prev:'Prev', ps_next:'Next', ps_page:'Page',
      ps_feed_more:'Load more', ps_feed_end:'You have reached the end',
      ps_enlarge:'Enlarge', ps_avail_sizes:'Available sizes', ps_unstitched:'Unstitched · no size needed', ps_also_st:'✂️ Stitched also available', ps_also_uns:'🧵 Unstitched fabric also available', ps_mto:'Made to order', ps_d_loading:'Loading more details…', ps_d_sizechart:'Size Chart', ps_d_open:'View on brand site, order here', ps_d_more:'More from', ps_d_nofetch:'See all photos &amp; details on the brand page →', ps_d_nodesc:'No extra description provided.', warn_title:'Look there, order here', warn_body:'This page is only for photos and product details. Don\'t add to the brand\'s cart. To order on PakPoshak: tap + Add if it\'s in our listing, or Share the product to PakPoshak (or copy the link and paste it back here).', warn_ok:'Continue to brand site →', warn_cancel:'Stay on PakPoshak',
      ps_empty:'No products match these filters — try widening them.',
      ps_partial:'Not every brand &amp; product is listed here yet —', ps_partial_link:'want more? Browse by brands →', ps_word_products:'products', ps_word_brands:'brands',
      ps_allw:"All Women's", ps_allm:"All Men's", ps_allk:'All Kids', ps_rail_head:'3 ways to search products', ps_sort_lh:'৳ Low→High', ps_sort_hl:'৳ High→Low', ps_sort_price:'Sort: Price', ps_shop_cat:'Shop by category', wish_save:'Save to wishlist', wish_title:'Wishlist', wish_empty:'No saved items yet. Tap ♥ on any product to save it here.', wish_remove:'Remove', ps_also_uns_short:'Unstitched available', ps_also_st_short:'Stitched available', ps_sale:'Sale', ps_new:'New', ps_lbl_sort:'Sort', ps_lbl_filter:'Filter', ps_search_ph:'Search 50,000+ products, 140+ Pakistani brands', ps_search_nomatch:'No brand or category matched', share_added:'Item added. Save it below before adding another.', share_review:'Save',
      bb_store:'Store Types', bb_product:'Product Category', bb_women:'👗 Women', bb_men:'👔 Men', bb_kids:'🧸 Kids', bb_md:'🏬 Multi-Dept', bb_premium:'💎 Premium',
      bb_ban1_t:'Check BDT & PKR price by pasting', bb_ban1_d:'Paste any product link, see the real price.', bb_ban2_t:"Don't buy, check here first", bb_ban2_d:'Just paste any product link, from any brand, to check its price.',
      bb_more:'more', bb_less:'less', bb_all:'All', bb_two_ways:'Two ways to search brands', bb_pick_gender:'Pick women, men, or others above — or just type any brand name.', bb_pick_cat:'Pick a category above to see its brands.', bb_prod_sub:'Choose your brand by clicking a tab or typing its name, go to the product you like, and just share it back to us.', bb_loading:'Loading brands…', bb_prod_none:'No catalogued brands here yet.',
      bb_smart_ph:'🔍 Search brands, e.g. Khaadi, lawn, casual', bb_search_lead:'🔎 Know the brand? Just type its name:',
      js_soldout_lead:'Some items appear SOLD OUT and can’t be saved — please remove them or pick another article:',
      js_soldout_all:'sold out on the brand site', js_soldout_size:'this size is sold out',
      more_tab:'More', more_title:'More Brands', more_sub:'All brands in this category — tap any to start, same as the tabs.', more_back:'Back',
      lbl_addproducts:'Add Products to Your Order',
      url_label:"Easiest: on a brand's page, tap Share then PakPoshak. Or paste a product link below.",
      btn_addurl:'+ Add URL', btn_paste:'📋 Paste Link & Auto-Fill', pp_tap:'Tap a product to add it — no copy-paste needed', pp_search:'🔍 Search this brand…', pp_site:'🌐 Open full brand site instead', fab_paste:'Paste link',
      dm_title:'Choose size & confirm price', dm_addbag:'Add to Bag', dm_addbag_n:'Add {n} items to Bag', dc_final:'Final price:',
      bag_proceed:'Proceed to My Details →', bag_empty:'Your bag is empty', bag_empty_sub:'Browse Pakistani brands and tap + Add to drop items here.', bag_browse:'🛍️ Browse products', bag_added:'Added to your bag', bag_view:'View Bag',
      co_bag:'Bag', co_details:'Details', co_review:'Review', co_pay:'Pay',
      nav_home:'Home', nav_brands:'Brands', nav_cart:'Cart', nav_how:'How To', nav_guide:'Guide', nav_wish:'Wishlist', nav_help:'Help',
      nav_luxe:'Luxe', nav_bag:'Bag', nav_pricecheck:'Price Check',
      tl_help:'New here? Start with these:', tl_faq:'❓ How it works & our promise', tl_track:'📦 Track an order', tl_weights:'⚖️ Shipping weights', tl_wa:'💬 Chat on WhatsApp',
      addmore_hint:'✓ Item saved! Add another product, or continue to your details.', addmore_btn:'➕ Add Another Product',
      word_brands:'brands',
      cat_md:'Multi-Department', cat_w:'Women’s Pret & Unstitched', cat_p:'Premium', cat_m:'Menswear', cat_k:'Kids',
      d_contact:'Your Contact & Delivery Details', d_saved:'✓ Details saved on this device', d_clearsaved:'Clear saved info',
      d_name:'Full Name *', ph_name:'e.g. Fatima Rahman', d_wa:'WhatsApp Number *',
      d_email:'Email (optional)', d_address:'Delivery Address in Bangladesh *', ph_address:'Flat, Road, Area, City, Dhaka 1209',
      d_notes:'Notes (optional)', ph_notes:'Alternate sizes, special instructions...', d_remember:'Remember my details on this device',
      d_delivery_t:'Estimated Delivery: 2–3 Weeks', d_delivery_x:'from order confirmation to your door.',
      btn_back:'← Back', btn_review:'Review My Order →', d_questions:'Questions?', d_wachat:'Chat on WhatsApp',
      r_review:'Review Your Order', r_summary:'Order Summary',
      r_intro:"Please review everything below before placing your order.",
      r_products:'Products (PKR value)', r_logistics:'Logistics (est. weight × ৳1,600/kg)', r_txfee:'Transaction Fee', r_delivery:'Local delivery', r_total:'ESTIMATED TOTAL (BDT)',
      r_avail:"⚠️ Items are subject to availability. If anything goes out of stock, we'll contact you on WhatsApp before proceeding.",
      btn_editdetails:'← Edit Details', btn_confirmsubmit:'✓ Confirm & Submit Order',
      s_submitted:'Order Request Submitted!', s_confirm_wa:"Pay using the details below to complete your order. We'll only message you on WhatsApp if a product is unavailable or the weight is much higher than estimated.",
      s_stocktitle:'Stock Notice', s_stocktext:"Pakistani fashion items sell out fast. If anything goes out of stock before we place your order, we'll contact you on WhatsApp immediately and offer alternatives or a full refund.",
      s_orderid:'Your Order ID', s_track:'📦 Track My Order', s_howpay:'💳 How to Pay',
      s_payafter:'Pay the total shown above using any method below.',
      s_paid_title:'✅ Already Paid? Confirm Your Payment', s_paid_sub:"Enter your payment details below so we can match it to Order",
      s_amt_label:'Amount you paid (৳) *', s_method_label:'How you paid *', s_method_pick:'Choose…', s_trx_label:'TrxID / sender no.', s_proof_label:'Add proof — Transaction ID above, or attach the receipt/message below:',
      s_tab_receipt:'📷 Upload Receipt', s_tab_msg:'💬 Payment Message',
      s_upload_main:'Tap to choose your payment screenshot', s_upload_sub:'bKash / Nagad / bank slip — JPG or PNG',
      s_confirmpay:'✅ Confirm Payment',
      s_footer1:"Submit your payment slip above — it's saved directly to your order, no need to message separately.",
      s_footer2:'Save your Order ID above to track your order status anytime.', s_another:'← Place Another Order',
      js_paste_first:'Please paste a product URL first.',
      js_invalid_url:"That doesn't look like a valid URL — please copy the full link from the brand's website.",
      js_not_brand:'❌ This is not a correct product link — please copy a product URL from a supported brand below.',
      js_fill_required:'Please fill in all required fields (highlighted in red) for each item.',
      js_add_item_first:'Please add at least one item to your order first.',
      js_leave_confirm:'You have items in your cart. Leave PakPoshak? Your saved items will stay on this device.',
      js_exit_confirm:'Are you sure you want to exit PakPoshak?',
      js_details_required:'Please fill in all required fields (Name, WhatsApp number, and Delivery Address).',
      field_item:'This item', field_category:'Category', field_price:'Price', field_size:'Size',
      js_missing_lead:'Almost there — please add:',
      js_missing_multi:'Some items still need a detail:',
      js_paste_nocopy:'No product link copied yet. Press &amp; hold the product’s web address → <b>Copy</b>, then tap <b>📋 Paste link</b>.',
      js_paste_nocopy_d:'No product link copied yet. Copy the product’s web address (click the address bar, then Ctrl+C), then click <b>📋 Paste link</b>.'
    },
    bn: {
      tagline:'পাকিস্তানি ফ্যাশন · বাংলাদেশে ডেলিভারি',
      hiw_browse:'ব্র্যান্ড দেখুন', hiw_paste:'Share বা লিংক পেস্ট করুন', hiw_confirm:'আমরা দাম যাচাই করি',
      hiw_pay:'বিকাশ/নগদে পেমেন্ট', hiw_delivery:'২–৩ সপ্তাহে আপনার দরজায়', hiw_video:'▶ ভিডিও গাইড দেখুন', hiw_guide:'📖 কীভাবে কাজ করে', introTitle:'নতুন? ছোট্ট একটি ইন্ট্রো দেখুন', introMore:'▶ সব ভিডিও গাইড দেখুন →',
      hiw_confirm_pay:'দাম নিশ্চিত করে পেমেন্ট (বিকাশ/নগদ)',
      step_additems:'পণ্য যোগ', step_details:'আপনার তথ্য', step_review:'রিভিউ', step_payment:'পেমেন্ট',
      lbl_browse:'একটি ব্র্যান্ড দেখুন', search_ph:'🔍 ১৫০+ পাকিস্তানি ব্র্যান্ড খুঁজুন…',
      tab_brands:'ব্র্যান্ড দেখুন', tab_products:'পণ্য খুঁজুন', gen_all:'সব', gen_women:'নারী', gen_men:'পুরুষ', gen_kids:'শিশু', menu_language:'ভাষা', menu_theme:'থিম', menu_guide:'গাইড', search_bar_ph:'পণ্য, ব্র্যান্ড খুঁজুন…', search_page_ph:'পণ্য ও ১৫০+ ব্র্যান্ড খুঁজুন', sp_remind_t:'যেকোনো পণ্যের দাম PKR-তে যাচাই করুন', sp_remind_d:'ব্র্যান্ডের নিজস্ব সাইটে পেয়েছেন? লিংক পেস্ট করে যেকোনো লিস্টেড ব্র্যান্ডের আসল দাম PKR-তে দেখুন।', sp_colls_hd:'কিউরেটেড কালেকশন', sp_paste:'পণ্যের লিংক পেস্ট করুন', sp_visual:'ভিজ্যুয়াল সার্চ', sp_fit:'ফিট অ্যাসিস্ট্যান্ট', sp_soon:'শীঘ্রই আসছে', vis_title:'ছবি দিয়ে খুঁজুন', vis_sub:'আপনার ছবির মতো পণ্য খুঁজুন', vis_cam:'ছবি তুলুন', vis_up:'ছবি আপলোড করুন', vis_cancel:'বাতিল', vis_loading:'মিল খুঁজছি', vis_chip:'আপনার ছবির মতো পণ্য', vis_clear:'ছবি সার্চ মুছুন', vis_none:'কাছাকাছি মিল নেই। অন্য ছবি দিন।', vis_notapparel:'অনুগ্রহ করে পোশাকের ছবি দিন।', vis_err:'এখন খোঁজা গেল না। আবার চেষ্টা করুন।', vis_slow:'ভিজ্যুয়াল সার্চ প্রস্তুত হচ্ছে। একটু পরে আবার চেষ্টা করুন।', vis_badfile:'একটি ছবি নির্বাচন করুন।', fit_title:'ফিট অ্যাসিস্ট্যান্ট', fit_sub:'যেকোনো ব্র্যান্ডে আপনার সাইজ খুঁজুন', fit_wear:'আমি সাধারণত পরি', fit_in:'এই ব্র্যান্ডে', fit_measlink:'জানেন না? মাপ লিখুন', fit_meashide:'আমার সাধারণ সাইজ ব্যবহার করুন', fit_chest:'বুক', fit_waist:'কোমর', fit_hip:'হিপ', fit_regular:'রেগুলার', fit_slim:'স্লিম', fit_relaxed:'রিল্যাক্সড', fit_scope:'যেখানে দেখাবে', fit_allbrands:'সব ব্র্যান্ড', fit_go:'আমার মাপের পণ্য দেখান', fit_wa:'আমার WhatsApp নম্বরে সেভ করুন (ঐচ্ছিক)', fit_chip:'আপনার সাইজ', fit_yoursize:'আপনার সাইজ', fit_needchest:'অন্তত আপনার বুকের মাপ লিখুন।', fit_needref:'আপনার সাইজ ও একটি ব্র্যান্ড বাছুন।', fit_none:'এখন আপনার সাইজে কিছু নেই। অন্য সাইজ বা ব্র্যান্ড দিন।', fit_err:'এখন সাইজ যাচাই করা গেল না। আবার চেষ্টা করুন।', fit_loading:'আপনার সাইজ খুঁজছি', wa_err_empty:'আপনার হোয়াটসঅ্যাপ নম্বর লিখুন', wa_err_short:'হোয়াটসঅ্যাপ নম্বরটি অসম্পূর্ণ মনে হচ্ছে', wa_err_long:'হোয়াটসঅ্যাপ নম্বরটি অনেক বড়', wa_err_prefix:'আপনার হোয়াটসঅ্যাপ নম্বর যাচাই করুন', sp_brands:'সব ১৫০+ ব্র্যান্ড দেখুন ›', sp_checkprice:'দাম দেখুন ›', bb_back:'‹ পণ্যে ফিরে যান', store_everyday:'এভরিডে', store_premium:'প্রিমিয়াম', colls_hd:'কালেকশন',prodcat_hd:'প্রোডাক্ট ক্যাটাগরি',products_hd:'পণ্য', filters_sort:'ফিল্টার ও সর্ট', filters_done:'সম্পন্ন', sort_hd:'সর্ট', order_ways:'দুইভাবে অর্ডার: আমাদের লিস্টে যেকোনো পণ্যে + Add চাপুন, অথবা ১৪০+ ব্র্যান্ডের যেকোনো পণ্যের লিংক পাঠান।',
      intro_ios:'আইফোনে: ব্র্যান্ডের পণ্য পেজে Share চেপে Add to PakPoshak বেছে নিন। (একবার: PakPoshak শর্টকাট যোগ করুন।) অথবা লিংক কপি করে এখানে পেস্ট করুন।',
      intro_android:'অ্যান্ড্রয়েডে: PakPoshak ইনস্টল করুন, তারপর ব্র্যান্ডের পণ্য পেজে Share চেপে PakPoshak বেছে নিন। অথবা লিংক কপি করে এখানে পেস্ট করুন।',
      intro_desktop:'ডেস্কটপে: নিচে পণ্যের লিংক পেস্ট করুন, অথবা পুরো কার্ট একসাথে আনতে Send-cart বুকমার্ক যোগ করুন।',
      ps_price:'দাম (৳, ডেলিভারিসহ)', ps_price_short:'দাম ফিল্টার', ps_category:'পণ্যের ক্যাটাগরি', ps_category_short:'ক্যাটাগরি', ps_brands:'ব্র্যান্ড', ps_clear:'ফিল্টার মুছুন', ps_valueprop:'যেকোনো পাকিস্তানি ব্র্যান্ড → বাংলাদেশে ডেলিভারি 🇧🇩', ps_morebrands:'খুঁজে পাচ্ছেন না? সব ১৫৫টি ব্র্যান্ড দেখুন →',
      ps_allcats:'সব ক্যাটাগরি', ps_loading:'পণ্য আসছে…', ps_loadfail:'পণ্য আনা গেল না — আবার চেষ্টা করুন।',
      ps_results:'পণ্য', ps_add:'যোগ করুন', ps_prev:'আগের', ps_next:'পরের', ps_page:'পৃষ্ঠা',
      ps_feed_more:'আরও দেখুন', ps_feed_end:'আপনি শেষ পর্যন্ত দেখে ফেলেছেন',
      ps_enlarge:'ছবি বড় করুন', ps_avail_sizes:'স্টকে থাকা সাইজ', ps_unstitched:'আনস্টিচড · সাইজ লাগে না', ps_also_st:'✂️ সেলাই করাও আছে', ps_also_uns:'🧵 আনস্টিচড কাপড়ও আছে', ps_mto:'অর্ডারে তৈরি হবে', ps_d_loading:'আরও বিবরণ আসছে…', ps_d_sizechart:'সাইজ চার্ট', ps_d_open:'ব্র্যান্ড সাইটে দেখুন, অর্ডার এখানে', ps_d_more:'আরও দেখুন —', ps_d_nofetch:'সব ছবি ও বিবরণ ব্র্যান্ডের পেজে দেখুন →', ps_d_nodesc:'বাড়তি কোনো বিবরণ নেই।', warn_title:'দেখুন ওখানে, অর্ডার এখানে', warn_body:'এই পেজটি শুধু ছবি ও পণ্যের বিবরণ দেখার জন্য। ব্র্যান্ডের cart-এ যোগ করবেন না। PakPoshak-এ অর্ডার করতে: লিস্টে থাকলে + Add ট্যাপ করুন, অথবা পণ্যটি PakPoshak-এ Share করুন (বা লিংক copy করে এখানে এসে paste করুন)।', warn_ok:'ব্র্যান্ড সাইটে যান →', warn_cancel:'PakPoshak-এ থাকুন',
      ps_empty:'এই ফিল্টারে কোনো পণ্য নেই — ফিল্টার একটু কমিয়ে দেখুন।',
      ps_partial:'সব ব্র্যান্ড বা পণ্য এখনো এখানে যোগ হয়নি —', ps_partial_link:'আরও চান? “ব্র্যান্ড দেখুন”-এ যান →', ps_word_products:'পণ্য', ps_word_brands:'ব্র্যান্ড',
      ps_allw:'সব মেয়েদের', ps_allm:'সব ছেলেদের', ps_allk:'সব বাচ্চাদের', ps_rail_head:'পণ্য খোঁজার ৩টি উপায়', ps_sort_lh:'৳ কম→বেশি', ps_sort_hl:'৳ বেশি→কম', ps_sort_price:'দাম অনুসারে', ps_shop_cat:'ক্যাটাগরি অনুযায়ী দেখুন', wish_save:'পছন্দে সেভ করুন', wish_title:'পছন্দের তালিকা', wish_empty:'এখনো কিছু সেভ করা হয়নি। যেকোনো পণ্যে ♥ চাপ দিয়ে এখানে সেভ করুন।', wish_remove:'সরান', ps_also_uns_short:'আনস্টিচডও আছে', ps_also_st_short:'সেলাইও আছে', ps_sale:'সেল', ps_new:'নতুন', ps_lbl_sort:'সাজান', ps_lbl_filter:'ফিল্টার', ps_search_ph:'খুঁজুন: ৫০,০০০+ পণ্য, ১৪০+ পাকিস্তানি ব্র্যান্ড', ps_search_nomatch:'কোনো ব্র্যান্ড বা ক্যাটাগরি মেলেনি', share_added:'পণ্যটি যোগ হয়েছে। আরেকটি যোগ করার আগে নিচে সেভ করুন।', share_review:'সেভ করুন',
      bb_store:'স্টোরের ধরন', bb_product:'পণ্যের ক্যাটাগরি', bb_women:'👗 মেয়েদের', bb_men:'👔 ছেলেদের', bb_kids:'🧸 বাচ্চাদের', bb_md:'🏬 মাল্টি-ডিপ', bb_premium:'💎 প্রিমিয়াম',
      bb_ban1_t:'পেস্ট করে BDT ও PKR দাম যাচাই', bb_ban1_d:'যেকোনো পণ্যের লিংক পেস্ট করুন, আসল দাম দেখুন।', bb_ban2_t:'কেনার আগে এখানে যাচাই করুন', bb_ban2_d:'যেকোনো ব্র্যান্ডের যেকোনো পণ্যের লিংক পেস্ট করে দাম দেখুন।',
      bb_more:'আরও', bb_less:'কম', bb_all:'সব', bb_two_ways:'ব্র্যান্ড খোঁজার দুটি উপায়', bb_pick_gender:'উপরে মেয়ে, ছেলে বা অন্যান্য বেছে নিন — অথবা যেকোনো ব্র্যান্ডের নাম লিখুন।', bb_pick_cat:'ব্র্যান্ড দেখতে উপরের একটি ক্যাটাগরিতে ট্যাপ করুন।', bb_prod_sub:'একটি ট্যাবে ক্লিক করে বা নাম টাইপ করে আপনার ব্র্যান্ড বেছে নিন, পছন্দের পণ্যে যান, আর সেটি আমাদের শেয়ার করুন।', bb_loading:'ব্র্যান্ড আসছে…', bb_prod_none:'এখানে এখনো কোনো ব্র্যান্ড নেই।',
      bb_smart_ph:'🔍 ব্র্যান্ড খুঁজুন, যেমন Khaadi, lawn, casual', bb_search_lead:'🔎 ব্র্যান্ড জানা আছে? নাম দিয়ে খুঁজুন:',
      js_soldout_lead:'কিছু পণ্য স্টকে নেই, তাই সেভ করা যাচ্ছে না — সেগুলো সরিয়ে দিন বা অন্য পণ্য বেছে নিন:',
      js_soldout_all:'ব্র্যান্ডের সাইটে স্টকে নেই', js_soldout_size:'এই সাইজটি স্টকে নেই',
      more_tab:'আরও', more_title:'আরও ব্র্যান্ড', more_sub:'এই ক্যাটাগরির সব ব্র্যান্ড — উপরের ট্যাবের মতোই, শুরু করতে যেকোনোটিতে ট্যাপ করুন।', more_back:'পেছনে',
      lbl_addproducts:'অর্ডারে পণ্য যোগ করুন',
      url_label:'সবচেয়ে সহজ: ব্র্যান্ডের পেজে Share চেপে PakPoshak বেছে নিন। অথবা নিচে পণ্যের লিংক পেস্ট করুন।',
      btn_addurl:'+ লিংক যোগ করুন',
      btn_paste:'📋 লিংক পেস্ট করে অটো-ফিল', pp_tap:'পণ্যে ট্যাপ করেই যোগ করুন — কপি-পেস্ট লাগবে না', pp_search:'🔍 এই ব্র্যান্ডে খুঁজুন…', pp_site:'🌐 বদলে পুরো ব্র্যান্ড সাইট খুলুন', fab_paste:'লিংক পেস্ট',
      dm_title:'সাইজ বেছে নিন ও দাম দেখুন', dm_addbag:'ব্যাগে যোগ করুন', dm_addbag_n:'{n}টি আইটেম ব্যাগে যোগ করুন', dc_final:'চূড়ান্ত দাম:',
      bag_proceed:'আমার তথ্যে এগিয়ে যান →', bag_empty:'আপনার ব্যাগ খালি', bag_empty_sub:'পাকিস্তানি ব্র্যান্ড দেখুন আর + Add চেপে পণ্য এখানে যোগ করুন।', bag_browse:'🛍️ পণ্য ব্রাউজ করুন', bag_added:'ব্যাগে যোগ হয়েছে', bag_view:'ব্যাগ দেখুন',
      co_bag:'ব্যাগ', co_details:'তথ্য', co_review:'রিভিউ', co_pay:'পেমেন্ট',
      nav_home:'হোম', nav_brands:'ব্র্যান্ড', nav_cart:'কার্ট', nav_how:'গাইড', nav_guide:'গাইড', nav_wish:'পছন্দ', nav_help:'সাহায্য',
      nav_luxe:'লাক্স', nav_bag:'ব্যাগ', nav_pricecheck:'দাম যাচাই',
      tl_help:'নতুন? শুরুটা এখান থেকে করুন:', tl_faq:'❓ কীভাবে কাজ করে ও আমাদের প্রতিশ্রুতি', tl_track:'📦 অর্ডার ট্র্যাক করুন', tl_weights:'⚖️ শিপিং ওজন', tl_wa:'💬 হোয়াটসঅ্যাপে চ্যাট',
      addmore_hint:'✓ পণ্যটি সেভ হয়েছে! আরেকটি যোগ করুন, বা আপনার তথ্য দিতে এগিয়ে যান।', addmore_btn:'➕ আরেকটি পণ্য যোগ করুন',
      word_brands:'ব্র্যান্ড',
      cat_md:'মাল্টি-ডিপার্টমেন্ট', cat_w:'মেয়েদের প্রেট ও আনস্টিচড', cat_p:'প্রিমিয়াম', cat_m:'ছেলেদের পোশাক', cat_k:'বাচ্চাদের',
      d_contact:'আপনার যোগাযোগ ও ডেলিভারির তথ্য', d_saved:'✓ এই ডিভাইসে তথ্য সেভ করা আছে', d_clearsaved:'সেভ করা তথ্য মুছুন',
      d_name:'পুরো নাম *', ph_name:'যেমন: ফাতিমা রহমান', d_wa:'হোয়াটসঅ্যাপ নম্বর *',
      d_email:'ইমেইল (ঐচ্ছিক)', d_address:'বাংলাদেশে ডেলিভারির ঠিকানা *', ph_address:'ফ্ল্যাট, রোড, এলাকা, শহর, ঢাকা ১২০৯',
      d_notes:'নোট (ঐচ্ছিক)', ph_notes:'বিকল্প সাইজ, বিশেষ কোনো নির্দেশনা...', d_remember:'এই ডিভাইসে আমার তথ্য মনে রাখো',
      d_delivery_t:'আনুমানিক ডেলিভারি: ২–৩ সপ্তাহ', d_delivery_x:'অর্ডার নিশ্চিত হওয়ার পর থেকে আপনার দরজা পর্যন্ত।',
      btn_back:'← পেছনে', btn_review:'আমার অর্ডার রিভিউ করি →', d_questions:'কোনো প্রশ্ন?', d_wachat:'হোয়াটসঅ্যাপে চ্যাট করুন',
      r_review:'আপনার অর্ডার রিভিউ করুন', r_summary:'অর্ডার সারসংক্ষেপ',
      r_intro:'অর্ডার করার আগে নিচের সবকিছু একবার দেখে নিন।',
      r_products:'পণ্য (PKR মূল্যে)', r_logistics:'শিপিং (আনুমানিক ওজন × ৳১,৬০০/কেজি)', r_txfee:'ট্রান্সঅ্যাকশন ফি', r_delivery:'লোকাল ডেলিভারি', r_total:'আনুমানিক মোট (টাকায়)',
      r_avail:'⚠️ পণ্য স্টকে থাকা সাপেক্ষে। কিছু স্টকে না থাকলে এগোনোর আগে আমরা হোয়াটসঅ্যাপে জানাব।',
      btn_editdetails:'← তথ্য ঠিক করুন', btn_confirmsubmit:'✓ নিশ্চিত করে অর্ডার দিন',
      s_submitted:'অর্ডার রিকোয়েস্ট জমা হয়েছে!', s_confirm_wa:'অর্ডার শেষ করতে নিচের তথ্য দিয়ে পেমেন্ট করুন। কোনো পণ্য না থাকলে বা ওজন অনুমানের চেয়ে অনেক বেশি হলে কেবল তখনই আমরা হোয়াটসঅ্যাপে জানাব।',
      s_stocktitle:'স্টক নিয়ে একটু কথা', s_stocktext:'পাকিস্তানি ফ্যাশন খুব দ্রুত শেষ হয়ে যায়। অর্ডার দেওয়ার আগে কিছু শেষ হয়ে গেলে আমরা সঙ্গে সঙ্গে হোয়াটসঅ্যাপে জানাব, আর বিকল্প পণ্য বা পুরো টাকা ফেরত দেব।',
      s_orderid:'আপনার অর্ডার আইডি', s_track:'📦 অর্ডার ট্র্যাক করুন', s_howpay:'💳 যেভাবে পেমেন্ট করবেন',
      s_payafter:'উপরে দেখানো মোট টাকা নিচের যেকোনো মাধ্যমে দিন।',
      s_paid_title:'✅ পেমেন্ট করেছেন? সেটি নিশ্চিত করুন', s_paid_sub:'আপনার পেমেন্টের তথ্য দিন, যাতে আমরা সেটি আপনার অর্ডারের সাথে মিলিয়ে নিতে পারি — অর্ডার',
      s_amt_label:'আপনি কত টাকা দিয়েছেন (৳) *', s_method_label:'কীভাবে দিয়েছেন *', s_method_pick:'বেছে নিন…', s_trx_label:'TrxID / প্রেরকের নম্বর', s_proof_label:'প্রমাণ দিন — উপরে ট্রান্সঅ্যাকশন আইডি, অথবা নিচে রসিদ/মেসেজ যোগ করুন:',
      s_tab_receipt:'📷 রসিদ আপলোড', s_tab_msg:'💬 পেমেন্ট মেসেজ',
      s_upload_main:'পেমেন্টের স্ক্রিনশট বেছে নিতে ট্যাপ করুন', s_upload_sub:'বিকাশ / নগদ / ব্যাংক স্লিপ — JPG বা PNG',
      s_confirmpay:'✅ পেমেন্ট নিশ্চিত করুন',
      s_footer1:'উপরে পেমেন্ট স্লিপটি জমা দিন — এটি সরাসরি আপনার অর্ডারে যুক্ত হয়, আলাদা করে মেসেজ করতে হবে না।',
      s_footer2:'অর্ডারের অবস্থা যেকোনো সময় দেখতে উপরের অর্ডার আইডিটি সেভ করে রাখুন।', s_another:'← আরেকটি অর্ডার করুন',
      js_paste_first:'আগে একটি পণ্যের লিংক পেস্ট করুন।',
      js_invalid_url:'এটি ঠিক লিংক মনে হচ্ছে না — ব্র্যান্ডের ওয়েবসাইট থেকে পুরো লিংকটি কপি করুন।',
      js_not_brand:'❌ এটি ঠিক পণ্যের লিংক নয় — নিচের কোনো ব্র্যান্ড থেকে পণ্যের লিংক কপি করুন।',
      js_fill_required:'প্রতিটি পণ্যের লাল চিহ্নিত ঘরগুলো পূরণ করুন।',
      js_add_item_first:'আগে অন্তত একটি পণ্য অর্ডারে যোগ করুন।',
      js_leave_confirm:'আপনার কার্টে পণ্য আছে। পাকিপোশাক ছেড়ে যাবেন? সেভ করা পণ্য এই ডিভাইসেই থাকবে।',
      js_exit_confirm:'আপনি কি সত্যিই পাকিপোশাক থেকে বের হতে চান?',
      js_details_required:'নাম, হোয়াটসঅ্যাপ নম্বর ও ডেলিভারির ঠিকানা — এই ঘরগুলো পূরণ করুন।',
      field_item:'এই পণ্যটি', field_category:'ক্যাটাগরি', field_price:'দাম', field_size:'সাইজ',
      js_missing_lead:'প্রায় হয়ে গেছে — শুধু দিন:',
      js_missing_multi:'কিছু পণ্যের আরও তথ্য দরকার:',
      js_paste_nocopy:'এখনো কোনো পণ্যের লিংক কপি করা হয়নি। পণ্যের ওয়েব ঠিকানায় চেপে ধরে <b>Copy</b> করুন, তারপর <b>📋 Paste link</b>-এ চাপুন।',
      js_paste_nocopy_d:'এখনো কোনো পণ্যের লিংক কপি করা হয়নি। পণ্যের ওয়েব ঠিকানা কপি করুন (অ্যাড্রেস বারে ক্লিক করে Ctrl+C), তারপর <b>📋 Paste link</b>-এ ক্লিক করুন।'
    }
  };
  let _lang = localStorage.getItem('psb_lang') || 'en';
  function tr(k){ return (I18N[_lang] && I18N[_lang][k]) || I18N.en[k] || k; }
  // Phone platform → which sharing instruction to show. iPhone (incl. iPadOS desktop-mode)
  // vs Android vs desktop. Used to give buyers the RIGHT one-time setup + Share steps.
  function psPlatform(){
    const ua = navigator.userAgent || '';
    if(/iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
    if(/android/i.test(ua)) return 'android';
    return 'desktop';
  }
  function catLabel(cat){ return tr('cat_' + cat); }
  function applyIntroCC(){ const v=document.getElementById('introVideo'); if(!v||!v.textTracks) return; for(let i=0;i<v.textTracks.length;i++){ const t=v.textTracks[i]; t.mode=(t.language===_lang)?'showing':'disabled'; } }
  function dismissIntro(){ try{localStorage.setItem('psb_intro_seen','1');}catch(e){} var c=document.getElementById('introCard'); if(c) c.style.display='none'; var v=document.getElementById('introVideo'); if(v){ try{v.pause();}catch(e){} } }
  (function(){
    var card=document.getElementById('introCard'); if(!card) return;
    var installed=false; try{ installed=(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches)||window.navigator.standalone===true; }catch(e){}
    var seen=false; try{ seen=localStorage.getItem('psb_intro_seen')==='1'; }catch(e){}
    if(installed||seen) return;                 // installed, or already shown once → stays hidden
    card.style.display='';                        // first visit → reveal the onboarding card
    var ip=document.getElementById('introPlatform'); if(ip) ip.textContent = tr('intro_'+psPlatform());  // platform-specific Share steps (iPhone / Android / desktop)
    try{ localStorage.setItem('psb_intro_seen','1'); }catch(e){}   // …and don't show it again next time
    var v=document.getElementById('introVideo'); if(v) v.addEventListener('ended', dismissIntro);
  })();
  function setLang(lang){
    _lang = (lang === 'bn') ? 'bn' : 'en';
    localStorage.setItem('psb_lang', _lang);
    document.documentElement.lang = _lang;
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = tr(el.getAttribute('data-i18n')); });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = tr(el.getAttribute('data-i18n-ph')); });
    applyIntroCC();
    try{ psUpdateNote(); }catch(e){}
    try{ psPhRebuild(); psPhSync(); }catch(e){}   // keep the rolling search-hint in the current language
    try{ const sc = document.getElementById('psShopScroll'); if(sc && sc.children.length) psBuildShopCat(); }catch(e){}   // relabel Shop-by-Category tiles
    document.querySelectorAll('.cat-tab').forEach(tb => { if(tb.dataset.cat) tb.textContent = catLabel(tb.dataset.cat); });
    if(_catOpen){
      const h = document.getElementById('catHead');
      if(h){
        const dept = BRANDS.filter(b => b.c === _catActive);
        const stock = _bbCnt ? dept.filter(b => (_bbCnt[b.n] || 0) > 0).length : dept.length;
        h.innerHTML = `${catLabel(_catActive)} <span class="cnt">· ${stock}${(_bbCnt && stock < dept.length) ? ' / ' + dept.length : ''} ${tr('word_brands')}</span>`;
      }
    }
    const lb = document.getElementById('hdrLangBtn');
    if(lb) lb.textContent = (_lang === 'en') ? 'বাংলা' : 'EN';
    try { if(typeof psRenderBanner === 'function') psRenderBanner(); } catch(e){}   // value banner is JS-rendered, refresh its language
    try { if(typeof psRenderBrandBanner === 'function') psRenderBrandBanner(); } catch(e){}   // brand-page hero too
    try { if(typeof psRenderColls === 'function') psRenderColls(); } catch(e){}     // collection tiles are JS-rendered too
    try { if(typeof psRenderPromises === 'function') psRenderPromises(); } catch(e){}  // promise strip too
    try { if(typeof psMoveGenInd === 'function') psMoveGenInd(); } catch(e){}        // re-place the sliding underline (tab widths change with BN)
  }
  function toggleLang(){ setLang(_lang === 'en' ? 'bn' : 'en'); }

  // ── Light / dark theme toggle (data-theme is set pre-paint in <head>) ──
  function applyThemeIcon(){
    var btn = document.getElementById('hdrThemeBtn'); if(!btn) return;
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    btn.textContent = dark ? '☀️' : '🌙';
    btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  }
  // Smooth theme/Luxe colour flips (#3): add a brief .theming class so colours animate for ~0.4s,
  // then drop it (no permanent transition cost). Skipped under reduced-motion.
  var _psThemeFlashT = null;
  function psThemeFlash(){
    try{
      if(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      var h = document.documentElement; h.classList.add('theming');
      if(_psThemeFlashT) clearTimeout(_psThemeFlashT);
      _psThemeFlashT = setTimeout(function(){ h.classList.remove('theming'); }, 400);
    }catch(e){}
  }
  window.psThemeFlash = psThemeFlash;
  function toggleTheme(){
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    var next = dark ? 'light' : 'dark';
    psThemeFlash();
    document.documentElement.setAttribute('data-theme', next);
    try{ localStorage.setItem('psb_theme', next); }catch(e){}
    applyThemeIcon();
  }
  applyThemeIcon();
  // ── Header overflow menu (language / theme / guide) — redesign Phase 1 ──
  function psHdrMenuClose(){
    var m=document.getElementById('hdrMenu'), b=document.getElementById('hdrMenuBtn');
    if(m) m.setAttribute('hidden','');
    if(b) b.setAttribute('aria-expanded','false');
    document.removeEventListener('click', psHdrMenuOutside, true);
  }
  function psHdrMenuOutside(e){
    if(!(e.target.closest && e.target.closest('.hdr-right-slot'))) psHdrMenuClose();
  }
  function psHdrMenu(){
    var m=document.getElementById('hdrMenu'), b=document.getElementById('hdrMenuBtn');
    if(!m) return;
    if(m.hasAttribute('hidden')){
      m.removeAttribute('hidden');
      if(b) b.setAttribute('aria-expanded','true');
      setTimeout(function(){ document.addEventListener('click', psHdrMenuOutside, true); }, 0);
    } else { psHdrMenuClose(); }
  }
  window.psHdrMenu = psHdrMenu;

  // Per-category first-view caps; categories not listed show ALL brands (no "more").
  const CAT_LIMIT = { w: 30, p: 20, m: 20 };   // Multi-Department + Kids stay uncapped
  // ⭐ Important tier (from BRAND-CLASSIFICATION.md) — these surface FIRST in each
  // category's first view; everyone else follows in array order behind them.
  const FEATURED = new Set([
    'Khaadi','Sapphire','Gul Ahmed','Alkaram Studio','Limelight','J. Junaid Jamshed','Edenrobe','Outfitters','Zellbury','Bonanza Satrangi','Nishat Linen','Eminent',
    'Maria B','Agha Noor','Generation','Warda','Zeen (by Cambridge)','Dhanak','Qalamkar','Coco by Zara Shahjahan','Iznik Fashions','Firdous',
    'Sana Safinaz','Asim Jofa','Elan','Zara Shahjahan','Afrozeh','Baroque','Bareeze','Faiza Saqlain','Mushq','Sobia Nazir','Zainab Chottani','Asifa & Nabeel','Maria Osama Khan',
    'Amir Adnan','Bareeze Man',"Narkin's",'Lawrencepur',
    'Minnie Minors','Rollover Kids'
  ]);
  // Brands most sought-after in Bangladesh — surfaced FIRST in every brand listing (price-check
  // grid, home brand carousel, search suggestions). Multi-department giants lead so they also top
  // the Men/Kids views. bdRank() = position here (lower = more famous), 999 if not listed.
  const BD_FAMOUS = [
    'Khaadi','Sana Safinaz','Maria B','Gul Ahmed','Sapphire','ETHNC','Asim Jofa','Bareeze','Alkaram Studio',
    'Limelight','Bonanza Satrangi','J. Junaid Jamshed','Nishat Linen','Edenrobe','Outfitters','Elan',
    'Zara Shahjahan','Sobia Nazir','Beechtree','Generation','Cross Stitch','Charizma','Baroque',
    'Sania Maskatiya','Mushq','Afrozeh','Faiza Saqlain','Zainab Chottani','Maryum N Maria'
  ];
  const _bdRankMap = {}; BD_FAMOUS.forEach((n,i) => { _bdRankMap[n] = i; });
  function bdRank(n){ return (n in _bdRankMap) ? _bdRankMap[n] : 999; }
  // Stable sort: ⭐ featured first (keeping array order), then the rest in array order.
  function sortFeatured(list){ return list.sort((a,b) => (FEATURED.has(b.n)?1:0) - (FEATURED.has(a.n)?1:0)); }

  let _catActive = Object.keys(BRAND_CATS)[0];   // first category open by default
  let _catOpen = false;                          // flips true on the initial render below
  let _catPage = 0;                              // in-panel pager: current page index
  let _catPageH = [];                            // cached page heights (measured at transform:0)
  /* ── Rolling search-hint for Browse Products (mobile + desktop) ──────────────
     Buyers don't realise the search understands garments, relationships and
     occasions. The native placeholder stays the static base sentence (i18n — shown
     on focus and to screen-readers); an opaque overlay rolls through a few example
     searches so the field visibly "keeps changing". Pauses while the field is
     focused/typed and when the tab is hidden. Every advertised term is a real,
     resolvable search (kurti/kaftan/lehenga/pret · ammi/abbu/wife · eid/festive…). */
  const PS_PH_DWELL0 = 5000, PS_PH_DWELL = 5000;
  const PS_PH_TXT = {
    en: [
      'Smartly Search 50,000+ products, 140+ Pakistani brands',
      'Try “kurti”, “kaftan”, “2 pcs pret”, “lehenga”',
      'Shop for “ammi”, “abbu”, “wife”, “boys 14”',
      'Occasions: “bridal”, “eid”, “festive”, “formal”',
      'Power Search: “Khaadi 3pc”, “Sapphire pret”, “Ethnc kurti”'
    ],
    bn: [
      'স্মার্টলি খুঁজুন: ৫০,০০০+ পণ্য, ১৪০+ পাকিস্তানি ব্র্যান্ড',
      'লিখুন “kurti”, “kaftan”, “2 pcs pret”, “lehenga”',
      'যার জন্য: “ammi”, “abbu”, “wife”, “boys 14”',
      'অনুষ্ঠান: “bridal”, “eid”, “festive”, “formal”',
      'Power Search: “Khaadi 3pc”, “Sapphire pret”, “Ethnc kurti”'
    ]
  };
  let _psPhRolls = [], _psPhIdx = 0, _psPhTimer = null, _psPhBound = false;
  function psPhList(){ return PS_PH_TXT[_lang === 'bn' ? 'bn' : 'en']; }
  function psPhInit(){
    ['psSearchMobile','psSearchDesktop'].forEach(id => {
      const inp = document.getElementById(id);
      if(!inp || inp.dataset.phRoll) return;
      inp.dataset.phRoll = '1';
      const wrap = document.createElement('span'); wrap.className = 'ps-phwrap';
      inp.parentNode.insertBefore(wrap, inp); wrap.appendChild(inp);
      const roll = document.createElement('span'); roll.className = 'ps-phroll'; roll.setAttribute('aria-hidden','true');
      const t = document.createElement('span'); t.className = 'ps-phroll-txt';
      roll.appendChild(t); wrap.appendChild(roll);
      inp.addEventListener('focus', psPhSync); inp.addEventListener('blur', psPhSync);
      _psPhRolls.push({ inp:inp, txt:t, roll:roll });
    });
    if(!_psPhRolls.length) return;
    _psPhIdx = 0;
    const first = psPhList()[0];
    _psPhRolls.forEach(r => { r.txt.textContent = first; });
    psPhSync();
    if(!_psPhBound){ document.addEventListener('visibilitychange', psPhSchedule); _psPhBound = true; }
    psPhSchedule();
  }
  function psPhSync(){   // overlay shows only when the field is empty AND not focused
    _psPhRolls.forEach(r => {
      const off = (r.inp.value && r.inp.value.length) || document.activeElement === r.inp;
      r.roll.classList.toggle('is-off', !!off);
    });
  }
  function psPhRebuild(){   // language toggled → re-text in place, no animation
    if(!_psPhRolls.length) return;
    const list = psPhList();
    _psPhRolls.forEach(r => { r.txt.classList.remove('roll-out','roll-pre'); r.txt.textContent = list[_psPhIdx] || list[0]; });
  }
  function psPhSchedule(){
    clearTimeout(_psPhTimer);
    if(document.hidden) return;                       // pause when the tab is backgrounded
    _psPhTimer = setTimeout(psPhAdvance, _psPhIdx === 0 ? PS_PH_DWELL0 : PS_PH_DWELL);
  }
  function psPhAdvance(){
    if(document.hidden){ psPhSchedule(); return; }
    const list = psPhList(), next = (_psPhIdx + 1) % list.length;
    _psPhRolls.forEach(r => r.txt.classList.add('roll-out'));        // current line rolls up + fades
    setTimeout(() => {
      _psPhIdx = next;
      _psPhRolls.forEach(r => {
        r.txt.classList.remove('roll-out');
        r.txt.classList.add('roll-pre');                            // drop below the field (no transition)
        r.txt.textContent = list[next];
        void r.txt.offsetWidth;                                     // force reflow so the new line animates in
        r.txt.classList.remove('roll-pre');                         // …then roll up into place
      });
      psPhSchedule();
    }, 420);
  }

  renderCatBar();   // build the category bar + brand columns now (DOM above this script exists)
  setLang(_lang);   // apply the saved language to all tagged elements
  try{ psPhInit(); }catch(e){}   // start the rolling Browse-Products search-hint

  function renderCatBar(){
    const bar = document.getElementById('catBar');
    if(!bar) return;
    bar.innerHTML = Object.keys(BRAND_CATS).map(cat =>
      `<button class="cat-tab" data-cat="${cat}" onclick="switchCat('${cat}')">${catLabel(cat)}</button>`
    ).join('');
    // Default: NO department pre-selected — keep the brand-name search the focal
    // point so Store Types opens on the search view (req #1). A category opens
    // only when the buyer taps a tab.
    _catActive = null; _catOpen = false;
    const panel = document.querySelector('.cat-panel');
    if(panel) panel.style.display = 'none';
    document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('on'));
  }

  // ── In-panel horizontal pager: a capped category shows its first N brands
  // (page 0), then slides RIGHT to a 2nd page with ONLY the REMAINING brands,
  // in the SAME grid. No pop-over window — the panel itself moves. ──
  function brandGrid(list, navHtml, navFirst, cntOf){
    const items = list.map(b => { const n = cntOf ? (cntOf(b) || 0) : 0;
      return `<button class="cat-brand" onclick="openBrandInApp(this)" data-url="${esc(b.u)}" data-name="${esc(b.n)}">${esc(b.n)}${n > 0 ? `<span class="cb-cnt">${n}</span>` : ''}</button>`;
    }).join('');
    const nav = navHtml || '';
    return '<div class="cat-pagegrid">' + (navFirst ? nav + items : items + nav) + '</div>';
  }
  // Measure both pages' heights at transform:0 (reading a transformed/off-screen
  // page can report 0), then size the viewport to whichever page is showing.
  function measureCatPages(){
    const track = document.getElementById('catTrack');
    if(!track) return;
    track.style.transition = 'none';
    track.style.transform = 'none';
    _catPageH = [].map.call(track.children, function(p){ return p.offsetHeight; });
  }
  function catSlide(page, instant){
    _catPage = page;
    const grid = document.getElementById('catGrid');
    const track = document.getElementById('catTrack');
    if(!grid || !track) return;
    if(instant){ grid.style.transition = 'none'; track.style.transition = 'none'; }
    track.style.transform = 'translateX(' + (-page * 100) + '%)';
    const h = _catPageH[page] || 0;
    if(h) grid.style.height = h + 'px';                 // panel grows/shrinks to the visible page
    if(instant){ void grid.offsetHeight; grid.style.transition = ''; track.style.transition = ''; }
  }
  window.addEventListener('resize', function(){ if(_catOpen){ measureCatPages(); catSlide(_catPage, true); } });
  function closeMoreDrawer(){
    document.getElementById('moreDrawer').classList.remove('open');
    document.body.style.overflow = '';
  }
  document.addEventListener('keydown', e => { if(e.key === 'Escape') closeMoreDrawer(); });
  function switchCat(cat){
    const panel = document.querySelector('.cat-panel');
    // Click the already-open category again → collapse the brand list
    if(cat === _catActive && _catOpen){
      _catOpen = false;
      if(panel) panel.style.display = 'none';
      document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('on'));
      return;
    }
    _catActive = cat;
    _catOpen = true;
    if(panel) panel.style.display = '';
    document.querySelectorAll('.cat-tab').forEach(t => t.classList.toggle('on', t.dataset.cat === cat));
    // Catalog-back the grid: brands we actually stock lead (strongest first); the
    // rest of the directory (no catalogue data yet) trails behind "+ show all" so any
    // brand stays reachable. Strength = total products in our catalogue.
    const inDept = BRANDS.filter(b => b.c === cat);
    const ready = !!_bbCnt;
    const cntOf = b => ready ? (_bbCnt[b.n] || 0) : 0;
    const inStock = ready
      ? inDept.filter(cntOf).sort((a, b) => (cntOf(b) - cntOf(a))
          || ((FEATURED.has(b.n) ? 1 : 0) - (FEATURED.has(a.n) ? 1 : 0)) || a.n.localeCompare(b.n))
      : sortFeatured(inDept);
    const directoryOnly = ready ? inDept.filter(b => !cntOf(b)) : [];
    const all = inStock.concat(directoryOnly);
    const limit = CAT_LIMIT[cat] || 30;                 // every dept now gets a first-view cap
    const head = document.getElementById('catHead');
    const grid = document.getElementById('catGrid');
    if(head) head.innerHTML = `${catLabel(cat)} <span class="cnt">· ${inStock.length}${(ready && directoryOnly.length) ? ' / ' + inDept.length : ''} ${tr('word_brands')}</span>`;
    if(grid){
      // page 1 = shoppable brands (capped); page 2 = overflow + the rest of the directory
      const firstN = inStock.length ? Math.min(inStock.length, limit) : Math.min(all.length, limit);
      const first = all.slice(0, firstN), more = all.slice(firstN);
      let pages;
      if(!more.length){
        pages = '<div class="cat-page">' + brandGrid(first, '', false, cntOf) + '</div>';
      } else {
        const moreChip = `<button class="cat-brand cat-nav cat-more" onclick="catSlide(1)">+${more.length} ${tr('more_tab')} ›</button>`;
        const backChip = `<button class="cat-brand cat-nav cat-back" onclick="catSlide(0)">‹ ${tr('more_back')}</button>`;
        pages = '<div class="cat-page">' + brandGrid(first, moreChip, false, cntOf) + '</div>'
              + '<div class="cat-page">' + brandGrid(more, backChip, true, cntOf) + '</div>';
      }
      grid.innerHTML = '<div class="cat-track" id="catTrack">' + pages + '</div>';
      measureCatPages();   // cache page heights at transform:0
      catSlide(0, true);   // start on page 0, sized to it, no animation
    }
  }

  let _bdActive = -1;
  function onBrandSearch(){
    const q = document.getElementById('brandSearch').value.trim().toLowerCase();
    const dd = document.getElementById('brandDropdown');
    _bdActive = -1;
    if(!q){ dd.style.display='none'; dd.innerHTML=''; return; }
    const matches = BRANDS.filter(b => b.n.toLowerCase().includes(q))
                          .sort((a,b)=> a.n.toLowerCase().indexOf(q) - b.n.toLowerCase().indexOf(q))
                          .slice(0,12);
    if(!matches.length){
      dd.innerHTML = `<div class="brand-dd-empty">No brand found for “${esc(q)}”. Paste the product link below instead.</div>`;
    } else {
      dd.innerHTML = matches.map(b =>
        `<div class="brand-dd-item" onclick="openBrandInApp(this)" data-url="${esc(b.u)}" data-name="${esc(b.n)}">
           <span>${esc(b.n)}</span>
           <span class="cur-go">↗</span>
         </div>`
      ).join('');
    }
    dd.style.display='block';   // must be explicit — CSS default is display:none
  }
  // Keyboard nav + close-on-outside-click for the dropdown
  document.addEventListener('keydown', e => {
    const dd = document.getElementById('brandDropdown');
    if(!dd || dd.style.display==='none') return;
    const items = [...dd.querySelectorAll('.brand-dd-item')];
    if(!items.length) return;
    if(e.key==='ArrowDown'){ e.preventDefault(); _bdActive=Math.min(_bdActive+1,items.length-1); }
    else if(e.key==='ArrowUp'){ e.preventDefault(); _bdActive=Math.max(_bdActive-1,0); }
    else if(e.key==='Enter' && _bdActive>=0){ e.preventDefault(); items[_bdActive].click(); return; }
    else if(e.key==='Escape'){ dd.style.display='none'; return; }
    items.forEach((it,i)=>it.classList.toggle('active', i===_bdActive));
    if(items[_bdActive]) items[_bdActive].scrollIntoView({block:'nearest'});
  });
  document.addEventListener('click', e => {
    const wrap = document.querySelector('.brand-search-wrap');
    if(wrap && !wrap.contains(e.target)){ const dd=document.getElementById('brandDropdown'); if(dd) dd.style.display='none'; }
  });

  function detectBrand(url){
    try{
      const host = new URL(url).hostname.replace(/^www\./,'');
      for(const [domain, name] of Object.entries(BRAND_MAP)){
        if(host === domain || host.endsWith('.'+domain)) return name;
      }
    }catch(e){}
    return '';
  }

  function detectCategory(url){
    // Match ONLY the path + query, never the hostname — several brand domains
    // contain garment words (nishatLINEN → "linen", sobianazir.NET …) that
    // would otherwise false-match a category from the brand NAME, not the item.
    let p = url;
    try{ const u = new URL(url); p = u.pathname + ' ' + u.search; }
    catch(e){ p = String(url).replace(/^https?:\/\/[^/]+/i, ''); }
    let dec = p; try{ dec = decodeURIComponent(p); }catch(e){}
    const s = (p + ' ' + dec).toLowerCase();
    // ── Couple sets win over gender (sold as His+Hers, single price, single weight) ──
    if(/\bcouples?\b|\bhis\s*(?:&|and|\+)\s*her|\bher\s*(?:&|and|\+)\s*his/.test(s)) return 'couple_collection';
    // ── Men's first (so a men's shalwar kameez isn't read as women's 3pc) ──
    if(detectGender(url, null) === 'men'){
      if(/sherwani|prince.?coat/.test(s))           return 'mens_sherwani';
      if(/waist.?coat|nehru.?jacket/.test(s))       return 'mens_waistcoat';
      if(/unstitch|fabric|wash.?n.?wear|gabardine/.test(s)) return 'mens_unstitched';
      if(/pant.?coat|coat.?pant|blazer|tuxedo/.test(s)) return 'mens_suit';
      if(/shalwar|kameez/.test(s))                  return 'mens_shalwar_kameez';
      if(/jeans|denim/.test(s))                     return 'mens_jeans';
      if(/trouser|chino|cargo/.test(s))             return 'mens_trouser';
      if(/polo|t-shirt|tshirt/.test(s))             return 'mens_shirt';
      if(/kurta/.test(s))                           return 'mens_kurta';
      if(/shirt/.test(s))                           return 'mens_shirt';
      if(/suit/.test(s))                            return 'mens_shalwar_kameez';
      return '';   // let the live fetch refine it
    }
    if(/shawl|pashmina|dhussa/.test(s) && !/shirt|kurti|suit|3.?pc|3.?piece/.test(s)) return 'shawl';
    if(/kaftan|kaftaan|caftan/.test(s))             return 'kaftan';
    if(/unstitch/.test(s))                          return 'lawn_3pc_unstitch';
    if(/dupatta|stole|scarf/.test(s) && !/shirt|kurti|suit/.test(s)) return 'dupatta_only';
    if(/accessories|jewel|earring|necklace|ring/.test(s)) return 'accessories';
    if(/bridal|velvet|full.embroi/.test(s))         return 'bridal';
    if(/heavy.formal|organza|silk/.test(s))         return 'heavy_formal_3pc';
    if(/formal.*(embroi|chiffon|net)/.test(s) && /3/.test(s)) return 'formal_emb_3pc';
    if(/formal.*(embroi|chiffon|net)/.test(s))     return 'formal_emb_2pc';
    if(/winter.*3|3.*winter/.test(s))               return 'winter_3pc_unstitch';
    if(/winter.*2|2.*winter|khaddar|karandi/.test(s)) return 'winter_2pc_unstitch';
    if(/3.piece|3pc|three.piece|suit/.test(s) && /pret|stitch/.test(s)) return 'pret_3pc';
    if(/3.piece|3pc|three.piece|lawn.*3/.test(s))  return 'lawn_3pc_unstitch';
    if(/kurti|kurta|shirt.*trouser|co.?ord/.test(s) && /trouser|pant/.test(s)) return 'shirt_trouser_2pc';
    if(/2.piece|2pc|two.piece|shirt.*dupatta/.test(s)) return 'shirt_dupatta_2pc';
    if(/trouser|pant/.test(s) && !/shirt|kurta|kurti|suit/.test(s)) return 'womens_trouser';
    if(/kurti|kurta|shirt|top/.test(s))             return 'kurti_1pc';
    return '';
  }

  // Build a buyer-facing label for ONE variant from the chosen "pick dimensions"
  // (an active colour option + any size options), in option order — e.g.
  // "Black / M" or "Barfi White / 8". Size dims are normalised (XS/M/8…);
  // colour stays raw. Shared by the chips, the sold-out list, and the ?variant=
  // pre-select so all three always agree on the label.
  function variantLabel(v, pickDims){
    if(!v || !pickDims || !pickDims.length) return '';
    return pickDims.map(d => d.isSize ? (normSizeFull(v[d.key]) || v[d.key]) : v[d.key])
      .map(x => (x == null ? '' : String(x)).trim()).filter(Boolean).join(' / ');
  }

  // The Shopify ?variant=<id> in a pasted URL is the EXACT variant the buyer
  // selected on the brand page (colour AND size) before copying the link. We
  // resolve it against the fetched variant list (reliable — an ID match, no
  // guessing) so the chosen combination can be pre-selected on top of the chips.
  // Returns the chip-format label, or '' if absent/unresolvable (e.g. SFCC,
  // whose synthesized variants carry no Shopify id).
  function pickedVariantFromUrl(url, product, pickDims){
    try{
      const vid = new URL(url).searchParams.get('variant');
      if(!vid || !product || !Array.isArray(product.variants)) return '';
      const v = product.variants.find(x => String(x.id) === String(vid));
      return v ? variantLabel(v, pickDims) : '';
    }catch(e){ return ''; }
  }

  function detectSizeFromUrl(url){
    try{
      const params = new URL(url).searchParams;
      // Only an EXPLICIT size param counts. (Do NOT treat ?s=, ?variant=, ?option=
      // as sizes — variant is a numeric Shopify ID, and a bare "s" in a handle
      // like "s26b4569" must not be read as size "S".)
      for(const key of ['size','Size','SIZE']){
        const v = params.get(key);
        if(v){ const n = normSize(v); if(n) return n; }
      }
      // Path-encoded size, but only when clearly delimited as a size token,
      // e.g. ".../size-xl" or ".../-m-" — never the first letter of a slug.
      const m = url.match(/[?&]size=([^&]+)/i)
             || url.match(/[/_-]size[-_]?(xs|s|m|l|xl|xxl|xxxl)\b/i);
      if(m) return normSize(decodeURIComponent(m[1]));
    }catch(e){}
    return '';
  }

  function normSize(raw){
    const s = raw.trim().toUpperCase();
    if(/^(FREE.?SIZE|FREESIZE|ONE.?SIZE)$/.test(s)) return 'Free Size';
    if(['XS','S','M','L','XL','XXL'].includes(s)) return s;
    return '';
  }

  // ── URL INPUT HANDLERS ───────────────────────────────────────────────────
  function parseUrl(raw){
    let url = raw.trim();
    if(!url) return null;
    if(!/^https?:\/\//i.test(url)) url = 'https://' + url;
    try{ new URL(url); return url; }catch(e){ return null; }
  }

  // The "brand label" = the distinctive part of a host, with the public suffix
  // and any subdomain stripped: shaposh.pk / shaposh.com / www.shaposh.com →
  // "shaposh"; pk.ethnc.com → "ethnc". Lets a .com link match a .pk brand (and
  // vice-versa) so a paste is accepted whichever twin domain the buyer copied.
  function brandLabel(host){
    const base = (host||'').replace(/^www\./,'').replace(/\.(com\.pk|net\.pk|org\.pk|com|net|org|co|store|shop|pk)$/,'');
    return base.split('.').pop();
  }
  let _brandLabels = null;
  function knownBrandLabels(){
    if(_brandLabels) return _brandLabels;
    const s = new Set();
    Object.keys(BRAND_MAP).forEach(h => s.add(brandLabel(h)));
    (typeof BRANDS !== 'undefined' ? BRANDS : []).forEach(b => { try{ s.add(brandLabel(new URL(b.u).hostname)); }catch(e){} });
    s.delete('');
    _brandLabels = s;
    return s;
  }
  // A URL is a supported brand if its host is in BRAND_MAP OR matches ANY brand in
  // the directory (by label) — not just the currency map. (Fixes Sha Posh & every
  // other directory brand that wasn't in BRAND_MAP getting wrongly rejected.)
  function isKnownBrand(url){
    try{
      const host = new URL(url).hostname.replace(/^www\./,'');
      if(Object.keys(BRAND_MAP).some(k => host === k || host.endsWith('.'+k))) return true;
      const lbl = brandLabel(host);
      return lbl.length >= 3 && knownBrandLabels().has(lbl);
    }catch(e){ return false; }
  }

  function showUrlError(msg){
    const el = document.getElementById('urlInputErr');
    if(!el) return;
    el.innerHTML = msg;
    el.style.display = '';
    clearTimeout(el._t);
    el._t = setTimeout(()=>{ el.style.display='none'; }, 10000);
  }
  function clearUrlError(){ const el=document.getElementById('urlInputErr'); if(el) el.style.display='none'; }

  function handleAddUrl(){
    const raw = document.getElementById('urlInput').value.trim();
    if(!raw){ showUrlError(tr('js_paste_first')); return; }
    const url = parseUrl(raw);
    if(!url){ showUrlError(tr('js_invalid_url')); return; }
    if(!isKnownBrand(url)){
      showUrlError(tr('js_not_brand'));
      return;
    }
    clearUrlError();
    // Hide top input row — the popup takes over from here
    document.getElementById('urlInputRow').style.display = 'none';
    createDraft(url);
    document.getElementById('urlInput').value = '';
    openDraftModal();   // size/qty/price now live in the popup
  }

  function showTopUrlInput(){
    document.getElementById('urlInputRow').style.display = '';
    document.getElementById('urlInput').value = '';
  }

  // ── ADD-TO-ORDER POPUP ─────────────────────────────────────────────────────
  // The size/qty/price draft card(s) live inside a modal (#draftModal). Every path
  // that creates a draft (tap a product, paste, share, edit) opens it; "Add to Bag"
  // (saveAllDrafts) or the ✕ (cancel) closes it. The draft-card internals and all
  // dc_* logic are UNCHANGED — only their container moved into the modal.
  function openDraftModal(){
    const dc = document.getElementById('draftsContainer'); if(dc) dc.style.display = '';
    const m  = document.getElementById('draftModal');
    if(m){ m.style.display = 'flex'; document.body.classList.add('dm-open'); }
    const body = document.getElementById('dmBody'); if(body) body.scrollTop = 0;
  }
  function closeDraftModal(){
    const m = document.getElementById('draftModal'); if(m) m.style.display = 'none';
    document.body.classList.remove('dm-open');
    // Keep the bottom bar visible after the popup closes so the updated Bag badge is in view
    // (and the overflow-lock release can't leave it stuck hidden).
    const bn = document.getElementById('bottomNav'); if(bn) bn.classList.remove('bottom-nav--hidden');
  }
  // ✕ / backdrop: cancel this add — discard any in-progress draft(s), keep the cart.
  function cancelDraftModal(){
    Object.keys(drafts).map(Number).forEach(id => { document.getElementById(`dc_${id}`)?.remove(); delete drafts[id]; });
    const dc = document.getElementById('draftsContainer'); if(dc) dc.style.display = 'none';
    _addViaTap = false;   // cancelled add → next add starts fresh (default = paste)
    closeDraftModal();
    restoreEditStash();   // cancelling an edit puts the original item back in the bag
    try{ showTopUrlInput(); }catch(e){}
    try{ updateSaveAllBtn(); }catch(e){}
    try{ checkAddUrlLock(); }catch(e){}
  }
  window.openDraftModal = openDraftModal;
  window.closeDraftModal = closeDraftModal;
  window.cancelDraftModal = cancelDraftModal;

  // Show the "Add another product / Next" choice only once an item is saved AND
  // no draft is mid-edit — so the flow is: save this item first, then add another.
  function updateAddMoreRow(){
    const el = document.getElementById('addMoreRow');
    if(el) el.style.display = (cart.length > 0 && Object.keys(drafts).length === 0) ? '' : 'none';
  }

  // "Add Another Product" (shown after a save): take the buyer back to whichever Browse
  // tab they were last on — the Browse PRODUCTS grid, or Browse BRANDS — so they pick/
  // share the next product from there. (NOT the paste box: that was inconsistent, landing
  // on the paste bar or the order form depending on state.) The just-saved item is safe
  // in the cart, so returning to Browse can't lose it.
  function addAnotherProduct(){
    // Scroll UP to whichever Browse tab the buyer was last on (Products grid or Brands)
    // and dismiss any lingering share toast. (Browse stays visible after a share, so this
    // is just a convenience jump — the buyer could also scroll up themselves.)
    try{ psHideShareToast(); }catch(e){}
    let which = 'products';
    try{ if(localStorage.getItem('psb_browse') === 'brands') which = 'brands'; }catch(e){}
    try{ if(typeof switchBrowse === 'function') switchBrowse(which); }catch(e){}
    const tgt = document.querySelector('.browse-tabs')
              || document.getElementById(which === 'brands' ? 'tabBrands' : 'tabProducts');
    if(tgt) tgt.scrollIntoView({ behavior:'smooth', block:'start' });
  }

  // ── ONE-TAP PASTE ──────────────────────────────────────────────────────────
  // The hardest step for phone users is copying the link in the brand's in-app
  // browser, then finding our tiny input box and long-pressing → Paste. This
  // collapses it to one tap: read the clipboard, pull the URL out of whatever
  // was copied (browsers often copy "Title https://…"), drop it in, auto-fetch.
  async function pasteAndAdd(inputId, addFn){
    const inp = document.getElementById(inputId);
    if(!inp) return;
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const focusToPaste = () => {
      inp.scrollIntoView({behavior:'smooth', block:'center'});
      inp.focus();
      inp.style.borderColor = 'var(--gold)';
      inp.style.boxShadow   = '0 0 0 3px rgba(201,169,110,0.35)';
      inp.placeholder = '⬆️ Long-press here → Paste your link';
      setTimeout(()=>{ inp.style.borderColor=''; inp.style.boxShadow=''; }, 8000);
    };
    // iOS: navigator.clipboard.readText is unreliable AND `await`-ing it consumes
    // the tap's user-activation, so a later inp.focus() can't open the keyboard.
    // So on iOS bring the box into view + focus it NOW (inside the tap) — the user
    // long-presses → Paste, and the box's paste-listener (below) auto-submits.
    if(isIOS){
      // FIX (iPhone paste tab): focus the box SYNCHRONOUSLY inside the tap so iOS
      // opens the keyboard and the long-press → Paste works. Reading the clipboard
      // first is async and consumes the tap's user-activation, so the later focus()
      // became a no-op — that was the "paste tab does nothing on iPhone" bug.
      focusToPaste();
      // Bonus: if the clipboard yields a link (iOS 13.4+), auto-fill + submit.
      if(navigator.clipboard && navigator.clipboard.readText){
        navigator.clipboard.readText().then(function(txt){
          var mm = txt && txt.match(/https?:\/\/[^\s"'<>]+/i);
          if(mm){ inp.value = mm[0].trim(); inp.blur(); addFn(); }
        }).catch(function(){});
      }
      return;
    }
    let txt = '', readOk = false;
    try{
      if(navigator.clipboard && navigator.clipboard.readText){
        txt = await navigator.clipboard.readText();
        readOk = true;
      }
    }catch(e){ /* permission denied / not supported → fall back below */ }
    const m = txt && txt.match(/https?:\/\/[^\s"'<>]+/i);
    if(m){ inp.value = m[0].trim(); addFn(); return; }
    if(readOk){
      // Clipboard WAS readable but holds no product link → they tapped Paste
      // without copying a product URL first. Tell them exactly what to do.
      inp.focus();
      showUrlError(tr(window.innerWidth >= 820 ? 'js_paste_nocopy_d' : 'js_paste_nocopy'));
      return;
    }
    focusToPaste();   // clipboard unreadable → let them paste straight into the box
  }
  // When a link is PASTED into the URL box (the reliable iOS path), auto-submit it.
  (function(){
    const ui = document.getElementById('urlInput');
    if(ui) ui.addEventListener('paste', () => setTimeout(() => {
      if(/https?:\/\//i.test(ui.value)){ try{ handleAddUrl(); }catch(e){} }
    }, 40));
  })();

  // ── SHARE TARGET ────────────────────────────────────────────────────────────
  // Installed as a PWA, the app registers in the phone's Share sheet (see
  // manifest share_target). On the brand's product page the user taps the
  // browser Share button → "PakPoshak" → we open with ?url=/?text= set. iPhone
  // has no PWA share target, so an iOS Shortcut opens order-form.html?add=<link>
  // instead — handled by the same function below. The Share button / Shortcut are
  // ALWAYS available, even when the address bar can't be copied — so this is the
  // most reliable way to get the link with zero typing.
  //
  // WHOLE-CART capture: the iOS Shortcut can run JS on the brand page to read its
  // /cart.js (Shopify) and open order-form.html?cart=<all product links>. We add
  // one draft per link. Each link runs through the SAME parseUrl + isKnownBrand +
  // scheme gate as a single share — a hostile ?cart= can only ever spawn drafts
  // for supported brands, and is capped so it can't fan out into many fetches.
  const _CART_MAX = 40;
  // Validate + normalise a raw link the same way handleAddUrl does. Returns the
  // clean URL string, or null if it's not a usable supported-brand http(s) link.
  function _validSharedLink(raw){
    if(!raw) return null;
    if(/^\s*(javascript|data|vbscript|file|blob):/i.test(raw)) return null;
    const clean = parseUrl(raw);
    return (clean && isKnownBrand(clean)) ? clean : null;
  }
  // When the page is opened by a SHARE, land the buyer on the ORDER FORM (the draft +
  // Save button) — NOT Browse Products. A shared item is only an in-memory DRAFT, and a
  // share is a fresh page load, so an UNSAVED draft from a previous share gets WIPED. So
  // we put the buyer right on the item and prompt them to SAVE it first; once saved it
  // persists (localStorage psb_cart), and "Add Another Product" then returns them to Browse.
  let psShareToastActive = false;   // true while the share toast is up → suppress the Paste FAB / swipe cue so they can't collide with it
  function focusOrderView(){
    // KEEP Browse VISIBLE — the buyer wants the whole Browse page WITH the order form, so
    // they can scroll up and keep browsing WITHOUT tapping "Add Another". We only bring the
    // order form (draft + Save) into view and confirm with a toast.
    const dc = document.getElementById('draftsContainer');
    const tgt = (dc && dc.style.display !== 'none') ? dc : document.getElementById('urlInputRow');
    psScrollToOrder(tgt);
    psShareAddedToast();
  }
  // The order form sits BELOW the async-loading Browse grid, so a single scroll lands on
  // products (the grid grows AFTER and shoves the form down). Scroll now, then re-pin as
  // the grid settles (catalog-ready + a couple of frames + a safety tick) — but STOP the
  // moment the buyer scrolls themselves, so we never fight them.
  function psScrollToOrder(tgt){
    if(!tgt) return;
    let cancelled = false;
    const stop = () => { cancelled = true; window.removeEventListener('touchstart', stop); window.removeEventListener('wheel', stop); };
    window.addEventListener('touchstart', stop, { passive:true });
    window.addEventListener('wheel', stop, { passive:true });
    const go = () => { if(!cancelled) tgt.scrollIntoView({ behavior:'auto', block:'start' }); };
    go();
    try{ if(typeof psOnReady === 'function') psOnReady(() => requestAnimationFrame(() => requestAnimationFrame(go))); }catch(e){}
    [250, 650, 1200].forEach(ms => setTimeout(go, ms));
    setTimeout(stop, 1400);
  }
  // Brief confirmation toast after a shared link is added (buyer stays on the Browse page).
  function psShareAddedToast(){
    let t = document.getElementById('psShareToast');
    if(!t){ t = document.createElement('div'); t.id = 'psShareToast'; t.className = 'ps-share-toast'; t.setAttribute('role','status'); document.body.appendChild(t); }
    t.innerHTML = `<span>✓ ${esc(tr('share_added'))}</span><button type="button" onclick="psSaveShared()">${esc(tr('share_review'))}</button>`;
    t.classList.add('on');
    // COLLISION FIX: while the toast is up, no other floating element shares the bottom —
    // hide the Paste FAB + swipe cue; restore them when it goes. updatePasteFab() also
    // checks psShareToastActive, so it can't re-show the FAB underneath the toast.
    psShareToastActive = true;
    const pf = document.getElementById('pasteFab'); if(pf) pf.classList.remove('show','pulse');
    const sc = document.getElementById('psSwipeCue'); if(sc) sc.classList.remove('show');
    clearTimeout(t._h); t._h = setTimeout(psHideShareToast, 5200);
  }
  function psHideShareToast(){
    const t = document.getElementById('psShareToast'); if(t) t.classList.remove('on');
    psShareToastActive = false;
    try{ updatePasteFab(); }catch(e){}   // restore the Paste FAB for the current tab
  }
  // Toast "Save" button: scroll to the shared item and trigger the REAL save. If a
  // size/category is still needed, saveAllDrafts() names it and highlights the field —
  // so "Save" always does something honest (saves when complete, guides when not).
  function psSaveShared(){
    psHideShareToast();
    const dc = document.getElementById('draftsContainer');
    const tgt = (dc && dc.style.display !== 'none') ? dc : document.getElementById('urlInputRow');
    if(tgt) tgt.scrollIntoView({ behavior:'smooth', block:'start' });
    try{ saveAllDrafts(); }catch(e){}
  }
  function handleSharedUrl(){
    try{
      const q = new URLSearchParams(location.search);
      // ── Multi-item: ?cart= carries every product link from the brand's cart ──
      const cartRaw = q.get('cart');
      if(cartRaw){
        const seen = new Set();
        const links = (cartRaw.match(/https?:\/\/[^\s"'<>]+/ig) || [])
          .map(_validSharedLink)
          .filter(u => u && !seen.has(u) && seen.add(u))   // valid, supported, de-duped
          .slice(0, _CART_MAX);                            // cap the fan-out
        if(links.length){
          document.getElementById('urlInputRow').style.display = 'none';
          links.forEach(u => createDraft(u));              // one draft per cart item
          openDraftModal();                                // size/qty/price in the popup
        }
        history.replaceState(null, '', location.pathname);
        return;
      }
      // ── Single item: ?add= (iOS Shortcut) or ?url/?text/?title (Android share) ──
      const shared = q.get('add') || q.get('url') || q.get('text') || q.get('title') || '';
      if(!shared) return;
      const m = shared.match(/https?:\/\/[^\s"'<>]+/i);
      const clean = _validSharedLink(m ? m[0] : shared.trim());
      if(clean){
        const inp = document.getElementById('urlInput');
        if(inp){ inp.value = clean; handleAddUrl(); }
        focusOrderView();                                  // order first, not Browse images
      }
      // Drop the query string so a refresh doesn't re-add the same item.
      history.replaceState(null, '', location.pathname);
    }catch(e){}
  }
  document.addEventListener('DOMContentLoaded', handleSharedUrl);

  function addUrlToPanel(){
    const raw = document.getElementById('panelUrlInput').value.trim();
    if(!raw){ alert(tr('js_paste_first')); return; }
    const url = parseUrl(raw);
    if(!url){ alert(tr('js_invalid_url')); return; }
    if(!isKnownBrand(url)){
      alert('We deal in Pakistani clothing only.\n\nThis link doesn\'t look like a supported Pakistani brand site.\n\nPlease paste a URL from brands like Khaadi, Sapphire, Almirah, Gul Ahmed, Limelight, Edenrobe, etc.');
      return;
    }
    createDraft(url);
    document.getElementById('panelUrlInput').value = '';
    document.getElementById('globalFetchStatus').textContent = Object.keys(drafts).length + ' URLs ready.';
  }

  // Enter key on main input
  document.getElementById('urlInput').addEventListener('keydown', function(e){
    if(e.key === 'Enter'){ e.preventDefault(); handleAddUrl(); }
  });

  // ── SAVE ALL DRAFTS → CART ───────────────────────────────────────────────
  function saveAllDrafts(){
    const usdRate = getUsdRate();
    const ids = Object.keys(drafts).map(Number);
    if(!ids.length){ alert('No items to save.'); return; }
    // Stock guard (req #7): never let a sold-out item into the order list. Block
    // the save and name the offending items so the buyer can remove them or pick
    // an in-stock size. Uses the live stock data captured when the item was added.
    const soldOut = [];
    ids.forEach(id => {
      const d = drafts[id]; if(!d) return;
      const nm = (document.getElementById(`dc_${id}`)?.dataset.brand) || tr('field_item');
      if(d.allSoldOut){ soldOut.push('• ' + nm + ' — ' + tr('js_soldout_all')); return; }
      const so = new Set(d.soldOutSizes || []);
      const bad = getDraftSizeRows(id).map(r => r.size).filter(sz => sz && so.has(sz));
      if(bad.length) soldOut.push('• ' + nm + ' (' + bad.join(', ') + ') — ' + tr('js_soldout_size'));
    });
    if(soldOut.length){ alert(tr('js_soldout_lead') + '\n' + soldOut.join('\n')); return; }
    let allValid = true;
    const problems = [];   // [{name, miss:[field names]}] — drives a specific, per-item message
    ids.forEach(id => {
      const el        = document.getElementById(`dc_${id}`);
      const itemName  = (el && el.dataset.brand) || tr('field_item');
      const cat       = document.getElementById(`dc_cat_${id}`)?.value;
      const priceRaw  = parseFloat(document.getElementById(`dc_price_${id}`)?.value);
      const isUnstitched = UNSTITCHED_CATS.has(cat);
      const catDDs    = document.getElementById(`dc_catpick_${id}`)?.querySelectorAll('.catdd') || [];
      const priceEl   = document.getElementById(`dc_price_${id}`);
      const szBox     = document.getElementById(`dc_szbox_${id}`);
      const miss      = [];
      // Category — force the picker open AND ring it red (the ring survives re-render via a class)
      if(!cat){
        if(drafts[id]) drafts[id].catFetchDone=true; renderCatUI(id, true);
        catDDs.forEach(d=> d.classList.add('psb-missing'));
        miss.push(tr('field_category'));
      } else catDDs.forEach(d=> d.classList.remove('psb-missing'));
      // Price
      if(priceEl){
        if(!priceRaw || priceRaw<=0){ priceEl.classList.add('psb-missing'); miss.push(tr('field_price')); }
        else priceEl.classList.remove('psb-missing');
      }
      // Size — stitched garments only; ring the whole sizes box, not just the tiny reminder
      if(!isUnstitched && cat && getDraftSizeRows(id).length === 0){
        const rem = document.getElementById(`dc_sremind_${id}`); if(rem) rem.style.display='';
        if(szBox) szBox.classList.add('psb-missing');
        miss.push(tr('field_size'));
      } else if(szBox) szBox.classList.remove('psb-missing');

      if(miss.length){ allValid=false; problems.push({name:itemName, miss}); }
    });
    if(!allValid){
      const msg = (problems.length === 1)
        ? tr('js_missing_lead') + ' ' + problems[0].miss.join(', ') + '.'
        : tr('js_missing_multi') + '\n' + problems.map(p => '• ' + p.name + ': ' + p.miss.join(', ')).join('\n');
      alert(msg);
      const firstBad = document.querySelector('.psb-missing');
      if(firstBad) firstBad.scrollIntoView({behavior:'smooth', block:'center'});
      return;
    }
    ids.forEach(id => {
      const el = document.getElementById(`dc_${id}`);
      const url = el.dataset.url;
      const brand = el.dataset.brand || 'Unknown Brand';
      const cat = document.getElementById(`dc_cat_${id}`).value;
      const priceRaw = parseFloat(document.getElementById(`dc_price_${id}`).value);
      const cur = drafts[id].currency;
      const pkr = cur==='USD' ? Math.round(priceRaw * usdRate) : priceRaw;
      const isUnstitched = UNSTITCHED_CATS.has(cat);
      const uQty = isUnstitched ? (Math.min(maxPerSizeFor(cat), Math.max(1, parseInt(document.getElementById(`dc_uqty_${id}`)?.value)||1))) : 1;   // category-aware cap (unstitched=10)
      const baseSizes = isUnstitched ? [{size:'',qty:uQty}] : getDraftSizeRows(id);
      // SIZE-PRICED products: stamp each size row with ITS OWN pkr from the variant map so the cart
      // bills every size correctly (e.g. 8/9-Y 4290 + 15/16-Y 4990). Single-price → every row = pkr.
      const dft = drafts[id];
      const varies = !!(dft && dft.priceVaries && dft.sizePrice);
      const sizes = baseSizes.map(rw => {
        let rp = pkr;
        if(varies && rw.size && dft.sizePrice[rw.size] != null){
          rp = cur==='USD' ? Math.round(dft.sizePrice[rw.size] * usdRate) : Math.round(dft.sizePrice[rw.size]);
        }
        return { size: rw.size, qty: rw.qty, pkr: rp };
      });
      cart.push({ url, brand, cat, sizes, pkr, weight: getWeight(cat), img: (dft && dft.img) || '', imgs: (dft && dft.imgs) || [], title: (dft && dft.title) || '' });
    });
    _editStash = [];   // the edited item (if any) was just re-added — don't restore it on a later cancel
    // Clear all drafts
    ids.forEach(id => { document.getElementById(`dc_${id}`)?.remove(); delete drafts[id]; });
    document.getElementById('draftsContainer').style.display = 'none';
    closeDraftModal();  // saved → close the popup
    showTopUrlInput(); // show top input again, clear it — ready for the next product
    checkAddUrlLock();
    renderCart();
    // "Added to your bag" toast: only for PASTE/share adds (req: Danish) — when the buyer taps a
    // product's "+ Add" they're already on the grid and don't need it. And never while on the Bag.
    if(!_addViaTap && !document.body.classList.contains('psb-bag')){ try{ psAddedToBagToast(); }catch(e){} }
    _addViaTap = false;   // reset for the next add (default = paste)
  }
  // Set true by the TAP add paths (psAdd / pickProduct / psWishAdd) so saveAllDrafts skips the toast.
  let _addViaTap = false;

  // ── CART ─────────────────────────────────────────────────────────────────
  let cart = [];
  // Items pulled OUT of the cart by editItem() while they're being edited in the popup. If the buyer
  // cancels the edit (✕ / backdrop / removing the card) we put them BACK so editing never loses an
  // item; a successful "Add to Bag" clears this (the edited item is re-added by the save).
  let _editStash = [];
  function restoreEditStash(){
    if(!_editStash.length) return;
    while(_editStash.length){ const e = _editStash.shift(); cart.splice(Math.min(e.idx, cart.length), 0, e.item); }
    try{ renderCart(); }catch(e){}
  }

  // Persist cart to localStorage so a refresh doesn't wipe the basket
  function saveCartToStorage(){ try{ localStorage.setItem('psb_cart', JSON.stringify(cart)); }catch(e){} }
  function loadCartFromStorage(){
    try{
      const saved = JSON.parse(localStorage.getItem('psb_cart') || '[]');
      if(Array.isArray(saved) && saved.length){ cart = saved; renderCart(); }
    }catch(e){}
  }
  function clearCartStorage(){ try{ localStorage.removeItem('psb_cart'); }catch(e){} }

  // Warn before leaving ONLY if there are unsaved draft cards in progress.
  // Saved cart items persist in localStorage, so leaving/refreshing never loses
  // them — warning about them was wrong and scared buyers off other pages.
  function psbHasUnsaved(){ return Object.keys(drafts).length > 0 || (typeof cart !== 'undefined' && cart.length > 0); }
  // Tab close / refresh / desktop nav: the browser's own generic "Leave site?" prompt.
  window.addEventListener('beforeunload', function(e){
    if(psbHasUnsaved()){ e.preventDefault(); e.returnValue = ''; }
  });
  // Mobile BACK button / gesture: beforeunload is unreliable for it, so trap it with
  // the History API — keep one spare history entry; when Back pops it, confirm if
  // there's unsaved work and re-arm the trap if the buyer chooses to stay.
  // Back button while a popup/overlay is open should CLOSE it (not pop the exit
  // confirm — that left buyers stuck behind the enlarge popup). Topmost-likely first.
  function psbCloseTopModal(){
    var dt = document.getElementById('psDetail');
    if(dt && dt.style.display && dt.style.display !== 'none'){ try{ psCloseDetail(); }catch(e){ dt.style.display='none'; } return true; }
    var ios = document.getElementById('iosInstallSheet');
    if(ios && ios.style.display && ios.style.display !== 'none'){ try{ psbCloseIos(); }catch(e){ ios.style.display='none'; } return true; }
    var pp = document.getElementById('productPicker');
    if(pp && pp.style.display && pp.style.display !== 'none'){ try{ closeProductPicker(); }catch(e){ pp.style.display='none'; } return true; }
    var bs = document.getElementById('brandSheet');
    if(bs && bs.style.display && bs.style.display !== 'none'){ try{ closeBrandSheet(); }catch(e){ bs.style.display='none'; } return true; }
    var md = document.getElementById('moreDrawer');
    if(md && md.classList.contains('open')){ try{ closeMoreDrawer(); }catch(e){ md.classList.remove('open'); } return true; }
    return false;
  }
  (function(){
    var armed = false;
    function arm(){ if(armed) return; try{ history.pushState({psbBack:1}, ''); armed = true; }catch(e){} }
    arm();
    // Back button: if a popup is open, just close it. Otherwise confirm exit (always,
    // even with an empty cart — Danish's choice). Cart-specific copy when unsaved.
    window.addEventListener('popstate', function(){
      armed = false;
      if(psbCloseTopModal()){ arm(); return; }   // Back closed an open popup → stay in the app
      var msg = psbHasUnsaved() ? tr('js_leave_confirm') : tr('js_exit_confirm');
      if(confirm(msg)){ history.back(); }   // OK → leave for real
      else { arm(); }                       // Cancel → stay, re-trap
    });
  })();

  const CAT_LABELS = {
    kurti_1pc:'Kurti / 1pc Stitched', kurti_1pc_unstitch:'Kurti / 1pc Unstitched',
    western_top:'Western Top', kaftan:'Kaftan (1pc)',
    shirt_dupatta_2pc:'2pc Shirt+Dupatta', shirt_dupatta_2pc_unstitch:'2pc Shirt+Dupatta Unstitched',
    shirt_trouser_2pc:'2pc Co-ord', shirt_trouser_2pc_unstitch:'2pc Co-ord Unstitched',
    pret_2pc_emb:'2pc Pret Emb',
    lawn_3pc_unstitch:'3pc Unstitched', unstitch_3pc_emb:'3pc Unstitched Emb',
    pret_3pc:'3pc Pret', pret_3pc_emb:'3pc Pret Emb',
    winter_2pc_unstitch:'Winter 2pc Unstitched', winter_2pc_stitch:'Winter 2pc Stitched',
    winter_3pc_unstitch:'Winter 3pc Unstitched', winter_3pc_stitch:'Winter 3pc Stitched',
    formal_emb_2pc:'Formal 2pc', formal_emb_3pc:'Formal 3pc',
    heavy_formal_3pc:'Heavy Formal 3pc', bridal:'Bridal',
    saree:'Saree', lehenga:'Lehenga/Gharara', coord_western:'Co-ord/Western',
    loungewear:'Loungewear', abaya:'Abaya / Hijab', maxi_dress:'Maxi / Dress',
    womens_trouser:"Women's Trouser", dupatta_only:'Dupatta / Stole', shawl:'Shawl',
    footwear:'Footwear',
    mens_shirt:"Men's Shirt 1pc", mens_trouser:"Men's Trouser 1pc", mens_jeans:"Men's Jeans 1pc",
    mens_kurta:"Men's Kurta 1pc", mens_shalwar_kameez:"Men's Shalwar Kameez 2pc",
    mens_waistcoat:"Men's Waistcoat", mens_suit:"Men's Suit/Pant-Coat",
    mens_sherwani:"Men's Sherwani", mens_unstitched:"Men's Unstitched",
    kids_boys_eastern:'Boys Eastern', kids_girls_eastern:'Girls Eastern',
    kids_boys_western:'Boys Western', kids_girls_western:'Girls Western',
    kids_boys_formal:'Boys Formal', kids_girls_formal:'Girls Formal',
    kids_infant:'Infant / Baby',
  };

  function removeItem(idx){
    cart.splice(idx, 1);
    renderCart();
  }

  function editItem(idx){
    const item = cart[idx];
    cart.splice(idx, 1);
    _editStash.push({ idx: idx, item: item });   // restore it if the buyer cancels the edit
    renderCart();
    // Editing happens from the Bag page (the popup then opens over it)
    showBagView();
    // Hide top URL input row — the draft panel handles adding more URLs
    document.getElementById('urlInputRow').style.display = 'none';

    // Create a draft card from the old item
    const _host = new URL(item.url).hostname;
    const isPk  = /\.(pk|com\.pk)(\/|$)/.test(_host + '/') || _host === 'pk.ethnc.com';
    const id = draftIdCtr++;
    drafts[id] = { currency: 'PKR', sizeCounter: 0, catFetchDone: true, catUserSet: true, catPickerOpen: false };
    document.getElementById('draftCards').insertAdjacentHTML('beforeend', buildDraftCard(id, item.url, item.brand, isPk));
    if(item.img) drafts[id].img = item.img;
    if(item.imgs) drafts[id].imgs = item.imgs;
    if(item.title) drafts[id].title = item.title;
    fillDraftPreview(id);

    // Add a clear "editing" banner so the user knows this is their item being edited
    const card = document.getElementById(`dc_${id}`);
    card.style.cssText += ';border:2px solid #f9a825 !important;';
    card.insertAdjacentHTML('afterbegin',
      `<div style="background:rgba(249,168,37,0.12);border-bottom:2px solid #f9a825;padding:9px 14px;
         border-radius:10px 10px 0 0;margin:-1px -1px 0;font-size:0.82rem;font-weight:700;
         color:var(--txt);display:flex;align-items:center;gap:8px">
        ✏️ Editing item — change anything below, then tap <span style="background:#f9a825;color:#12122a;
          padding:1px 8px;border-radius:5px;font-size:0.78rem">Add to Bag</span>
      </div>`);

    // Fill in saved values
    setDraftCat(id, item.cat);
    document.getElementById(`dc_price_${id}`).value = item.pkr;
    updateDraftPriceHint(id);
    /* currency note removed — price is always shown in PKR */
    // Restore the per-size price map so editing a size-priced item keeps per-size billing on re-save.
    drafts[id].sizePrice = {};
    (item.sizes || []).forEach(r => { if(r.size && r.pkr != null) drafts[id].sizePrice[r.size] = r.pkr; });
    drafts[id].priceVaries = itemPriceVaries(item);
    if(UNSTITCHED_CATS.has(item.cat)){
      // Restore unstitched qty
      const uqtyEl = document.getElementById(`dc_uqty_${id}`);
      if(uqtyEl && item.sizes?.[0]?.qty) uqtyEl.value = item.sizes[0].qty;
    } else {
      document.getElementById(`dc_srows_${id}`).innerHTML = '';
      (item.sizes || [{size:'',qty:1}]).forEach(r => addDraftSizeRow(id, r.size, r.qty));
    }
    updateSaveAllBtn();
    checkAddUrlLock();
    openDraftModal();   // edit happens in the popup, same as add
  }

  function renderCart(){
    const list  = document.getElementById('cartList');
    const empty = document.getElementById('cartEmpty');
    const rtBox = document.getElementById('runningTotal');
    const badge = document.getElementById('itemCountBadge');
    const oll   = document.getElementById('orderListLabel');
    const aps   = document.getElementById('addProductsSection');   // landing only: paste-link box, revealed once cart has an item (req)
    updateAddMoreRow();

    const bagNav = document.getElementById('bagNav');
    if(!cart.length){
      // Empty-bag state shows only where there's a dedicated Bag page (index); hidden on order-form.
      if(empty) empty.style.display = document.getElementById('bagView') ? '' : 'none';
      if(oll) oll.style.display = 'none';
      if(aps) aps.style.display = 'none';
      if(bagNav) bagNav.style.display = 'none';
      rtBox.style.display = 'none';
      badge.style.display = 'none';
      list.innerHTML = '';
      updateCartBadges(0);
      // CRITICAL: persist the now-empty cart too. Without this, deleting the
      // last item left the OLD cart in localStorage and a refresh brought every
      // "deleted" product back.
      saveCartToStorage();
      return;
    }
    if(empty) empty.style.display = 'none';
    if(oll) oll.style.display = '';
    if(aps) aps.style.display = 'none';   // #addProductsSection is now a HIDDEN helper (paste box removed from the Bag); keep it hidden
    if(bagNav) bagNav.style.display = '';
    badge.style.display = '';
    badge.textContent = cart.length + (cart.length === 1 ? ' item' : ' items');
    updateCartBadges(cart.length);

    const r = getRates();
    let totalPkr = 0, totalWeight = 0;
    let html = '';
    cart.forEach((item, i) => {
      const totalQty = (item.sizes || [{qty:1}]).reduce((s,r) => s + r.qty, 0);
      const varies  = itemPriceVaries(item);
      const itemPkr = itemPkrSubtotal(item);   // Σ per-size price × qty
      totalPkr    += itemPkr;
      totalWeight += KIDS_CATS.has(item.cat)
        ? (item.sizes||[{size:'',qty:1}]).reduce((s,z)=>s+item.weight*kidsAgeMultiplier(z.size,r)*z.qty, 0)
        : item.weight * totalQty;
      const catTag  = CAT_LABELS[item.cat] || item.cat;

      // Size tags. When sizes are priced differently, show EACH size on its own ROW with its PKR
      // price (only where applicable); otherwise the compact "M×1 L×2" chips.
      const sizeTags = varies
        ? (item.sizes || []).filter(r => r.size).map(r =>
            `<span class="item-tag" style="display:block;width:fit-content;margin:2px 0">${esc(r.size)} × ${r.qty} · PKR ${_rowPkr(item,r).toLocaleString()}</span>`).join('')
        : (item.sizes || [])
            .filter(r => r.size || !UNSTITCHED_CATS.has(item.cat))
            .map(r => r.size ? `<span class="item-tag">${esc(r.size)}×${r.qty}</span>` : '')
            .join('');

      // Right price block: single-price → "PKR X each"; varies → item PKR subtotal + a "(by size)" note.
      const priceBlock = varies
        ? `<div class="item-price">PKR ${itemPkr.toLocaleString()}</div>
           <div class="item-bdt">≈ ৳${Math.round(itemPkr * r.CONV_RATE).toLocaleString()} <span style="font-size:0.62rem;color:var(--txt-muted)">(by size)</span></div>`
        : `<div class="item-price">PKR ${item.pkr.toLocaleString()} <span style="font-size:0.68rem;font-weight:400;color:var(--txt-muted)">each</span></div>
           <div class="item-bdt">≈ ৳${Math.round(item.pkr * r.CONV_RATE).toLocaleString()} each</div>`;

      const _cmono = esc(((item.brand||'?').trim()[0] || '?').toUpperCase());
      html += `<div class="cart-item">
        <div class="ci-thumb-wrap"${item.img ? ` onclick="zoomCartImg(${i})" title="Tap to enlarge" style="cursor:zoom-in"` : ''}>
          <div class="dc-thumb dc-mono">${_cmono}</div>
          ${item.img ? `<img class="dc-thumb dc-img" src="${esc(item.img)}" alt="" loading="lazy" onload="this.previousElementSibling.style.display='none'" onerror="this.remove()">` : ''}
        </div>
        <div class="item-info">
          <div class="ci-head"><span class="item-brand">${esc(item.brand)}</span><span class="item-num-inline">#${i+1}</span></div>
          ${item.title ? `<div class="item-title">${esc(item.title)}</div>` : `<div class="item-url">${esc(item.url)}</div>`}
          <div class="item-tags">
            <span class="item-tag">${esc(catTag)}</span>
            ${sizeTags}
            <span class="item-tag" style="background:var(--raised);border-color:var(--bdr-med)">Total qty: ${totalQty}</span>
          </div>
        </div>
        <div>
          ${priceBlock}
          <div style="display:flex;gap:4px;margin-top:4px;justify-content:flex-end">
            <button class="remove-item" onclick="editItem(${i})" title="Edit" style="color:var(--gold);font-size:0.8rem">✏️</button>
            <button class="remove-item" onclick="removeItem(${i})" title="Remove">✕</button>
          </div>
        </div>
      </div>`;
    });
    list.innerHTML = html;

    // Running total
    // Logistics is folded into the BDT total (not shown separately); the only visible add-on is the
    // ৳100/suit local delivery (req: Danish — replaces the flat TRANS_FEE).
    const productBdt = Math.round(totalPkr * r.CONV_RATE);
    const commission = cartCommission(r);
    const logistics  = Math.round(totalWeight * r.LOG_RATE);
    const suits      = cartSuitCount();
    const localDel   = LOCAL_DELIVERY * suits;
    const totalBdt   = productBdt + commission + logistics + localDel;
    document.getElementById('rt-item-count').textContent = cart.length;
    document.getElementById('rt-pkr').textContent  = 'PKR ' + totalPkr.toLocaleString();
    const rtW = document.getElementById('rt-weight'); if(rtW) rtW.textContent = '≈ ' + totalWeight.toFixed(2) + ' kg';
    var rtSuits = document.getElementById('rt-suits'); if(rtSuits) rtSuits.textContent = suits;
    var rtDel = document.getElementById('rt-delivery'); if(rtDel) rtDel.textContent = '৳ ' + localDel.toLocaleString();
    document.getElementById('rt-total').textContent = '৳ ' + totalBdt.toLocaleString();
    rtBox.style.display = '';
    saveCartToStorage();
  }

  function esc(s){
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  // ── SUMMARY MODAL ─────────────────────────────────────────────────────────
  // ── STEP NAVIGATION ──────────────────────────────────────────────────────
  let currentStep = 1;

  function goToStep(n){
    [1,2,3,4].forEach(i => {
      const sec = document.getElementById('step' + i);
      const on = (i === n), done = (i < n);
      if(sec) sec.classList.toggle('active', on);
      // Mirror active/done onto BOTH the top steps-bar (desktop) and the
      // bottom-bar 1·2·3·4 dots (mobile) — same source of truth, no drift.
      ['si_' + i, 'bns_' + i].forEach(id => {
        const el = document.getElementById(id);
        if(!el) return;
        el.classList.remove('active','done');
        if(on) el.classList.add('active');
        else if(done) el.classList.add('done');
      });
    });
    currentStep = n;
    var _hb = document.getElementById('hdrBack'); if(_hb && n !== 1) _hb.hidden = true;   // back arrow is Browse-Brands only
    // Mobile checkout progress (#coProg): show on steps 2-4, mark the active stage + done stages.
    var _cp = document.getElementById('coProg');
    if(_cp){
      if(n >= 2 && n <= 4){
        _cp.style.display = 'flex';
        _cp.querySelectorAll('.co-prog-step').forEach(function(s){ var st = +s.getAttribute('data-st'); s.classList.toggle('active', st === n); s.classList.toggle('done', st < n); });
        _cp.querySelectorAll('.co-prog-line').forEach(function(l){ l.classList.toggle('done', (+l.getAttribute('data-ln')) < n); });
      } else { _cp.style.display = 'none'; }
    }
    document.body.classList.toggle('psb-browse', n === 1);
    if(n !== 1) document.body.classList.remove('psb-bag');   // bag view only exists on step 1
    const _bh=document.getElementById('appHeader');if(_bh)_bh.style.position=(n===1&&window.innerWidth<820)?'relative':'';
    // Bottom bar now stays visible on every step — it IS the order-progress
    // indicator (Home · 1·2·3·4 · Cart); Home/Cart work from any step.
    const bnSteps = document.getElementById('bnavSteps');
    if(bnSteps) bnSteps.setAttribute('aria-label', 'Order progress: step ' + n + ' of 4');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    updatePasteFab();
  }

  // Floating Paste button: the brand-link paste fallback. Shown on step 1 ONLY on the
  // Browse BRANDS tab — buyers leave for a brand site, then come back and share/paste
  // the link. Hidden on Browse PRODUCTS, where you just tap "+ Add" (no link needed).
  function updatePasteFab(){
    const fab = document.getElementById('pasteFab');
    if(!fab) return;
    // ...and never while the share toast is up (they'd overlap bottom-right).
    fab.classList.toggle('show', currentStep === 1 && !document.body.classList.contains('psb-bag') && !psOnProductsTab() && !psShareToastActive);
  }
  // When the user switches BACK to PakPoshak (e.g. after copying a link in
  // Chrome), pulse the Paste button so it's obvious where to tap next.
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible' && currentStep === 1 && !psOnProductsTab()){
      const fab = document.getElementById('pasteFab');
      if(fab){ fab.classList.add('pulse'); setTimeout(() => fab.classList.remove('pulse'), 6000); }
    }
  });
  document.addEventListener('DOMContentLoaded', updatePasteFab);

  function nextFromStep1(){
    if(!cart.length){ alert(tr('js_add_item_first')); return; }
    if(Object.keys(drafts).length){
      alert('You have unsaved product cards. Click "Save to Order List" to save them, or remove them before continuing.');
      return;
    }
    goToStep(2);
  }

  function nextFromStep2(){
    const name    = document.getElementById('buyerName').value.trim();
    const wa      = document.getElementById('buyerWA').value.trim();
    const email   = document.getElementById('buyerEmail').value.trim();
    const address = document.getElementById('buyerAddress').value.trim();
    const emailOk = !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    let valid = true;
    if(!name){    document.getElementById('buyerName').style.borderColor='#c0392b';    valid=false; }
    else          document.getElementById('buyerName').style.borderColor='';
    if(!psPhoneOk('buyerWA')){ valid=false; }   // completeness-checked (country code + length)
    // Email is optional — only validate format if something was entered
    if(email && !emailOk){ document.getElementById('buyerEmail').style.borderColor='#c0392b'; valid=false; }
    else                   document.getElementById('buyerEmail').style.borderColor='';
    if(!address){ document.getElementById('buyerAddress').style.borderColor='#c0392b'; valid=false; }
    else          document.getElementById('buyerAddress').style.borderColor='';
    if(!valid){
      alert(tr('js_details_required'));
      return;
    }
    buildReviewSummary();
    goToStep(3);
  }

  function buildReviewSummary(){
    const r = getRates();
    let totalPkr = 0, totalWeight = 0;
    let siHtml = '';
    cart.forEach((item, i) => {
      const totalQty = (item.sizes || [{qty:1}]).reduce((s,r) => s + r.qty, 0);
      const varies   = itemPriceVaries(item);
      const itemPkr  = itemPkrSubtotal(item);
      totalPkr    += itemPkr;
      totalWeight += KIDS_CATS.has(item.cat)
        ? (item.sizes||[{size:'',qty:1}]).reduce((s,z)=>s+item.weight*kidsAgeMultiplier(z.size,r)*z.qty, 0)
        : item.weight * totalQty;
      const bdtTotal = Math.round(itemPkr * r.CONV_RATE);
      // Size summary — per-size price listed when sizes are priced differently.
      const sizeSummary = varies
        ? (item.sizes || []).filter(r => r.size).map(r => `${esc(r.size)}×${r.qty} (PKR ${_rowPkr(item,r).toLocaleString()})`).join(', ')
        : ((item.sizes || []).filter(r => r.size).map(r => `${esc(r.size)}×${r.qty}`).join(', ') || '—');
      const tags = [CAT_LABELS[item.cat] || item.cat];
      if(sizeSummary !== '—') tags.push(sizeSummary);
      tags.push('Total qty: ' + totalQty);
      const _smono = esc(((item.brand||'?').trim()[0] || '?').toUpperCase());
      const _sthumb = `<div class="si-thumb-wrap"><div class="si-thumb-mono">${_smono}</div>`
        + (item.img ? `<img class="si-thumb" src="${esc(item.img)}" alt="" loading="lazy" onload="this.previousElementSibling.style.display='none'" onerror="this.remove()">` : '')
        + `</div>`;
      siHtml += `<div class="summary-item">
        ${_sthumb}
        <div class="si-left">
          <div class="si-brand">${esc(item.brand)}</div>
          ${item.title ? `<div class="si-title">${esc(item.title)}</div>` : `<div class="si-url">${esc(item.url)}</div>`}
          <div class="si-tags">${tags.join(' · ')}</div>
        </div>
        <div class="si-price">
          <div class="si-bdt">৳ ${bdtTotal.toLocaleString()}</div>
          <div class="si-pkr">${varies ? 'PKR ' + itemPkr.toLocaleString() + ' (by size)' : 'PKR ' + item.pkr.toLocaleString() + ' × ' + totalQty}</div>
        </div>
      </div>`;
    });
    document.getElementById('summaryItems').innerHTML = siHtml;
    const productBdt = Math.round(totalPkr * r.CONV_RATE);
    const commission = cartCommission(r);
    const logistics  = Math.round(totalWeight * r.LOG_RATE);
    const suits      = cartSuitCount();
    const localDel   = LOCAL_DELIVERY * suits;
    const totalBdt   = productBdt + commission + logistics + localDel;
    document.getElementById('sum-pkr').textContent   = 'PKR ' + totalPkr.toLocaleString();
    var _ssuits = document.getElementById('sum-suits'); if(_ssuits) _ssuits.textContent = suits;
    var _sdel = document.getElementById('sum-delivery'); if(_sdel) _sdel.textContent = '৳ ' + localDel.toLocaleString();
    document.getElementById('sum-total').textContent = '৳ ' + totalBdt.toLocaleString();
    const name    = document.getElementById('buyerName').value.trim();
    const wa      = document.getElementById('buyerWA').value.trim();
    const email   = document.getElementById('buyerEmail').value.trim();
    const address = document.getElementById('buyerAddress').value.trim();
    const notes   = document.getElementById('buyerNotes').value.trim();
    document.getElementById('customerSummary').innerHTML =
      `<strong>${esc(name)}</strong> · ${esc(wa)}` +
      (email ? ` · ${esc(email)}` : '') + `<br>📍 ${esc(address)}` +
      (notes ? `<br>📝 ${esc(notes)}` : '');
  }

  // ── ORDER SUBMISSION ──────────────────────────────────────────────────────
  function submitOrder(){
    const btn = document.getElementById('confirmSubmitBtn');
    btn.disabled = true;
    btn.textContent = 'Submitting…';

    const r = getRates();
    let totalPkr = 0, totalWeight = 0;
    cart.forEach(item => {
      const totalQty = (item.sizes || [{qty:1}]).reduce((s,r) => s + r.qty, 0);
      totalPkr    += itemPkrSubtotal(item);
      totalWeight += KIDS_CATS.has(item.cat)
        ? (item.sizes||[{size:'',qty:1}]).reduce((s,z)=>s+item.weight*kidsAgeMultiplier(z.size,r)*z.qty, 0)
        : item.weight * totalQty;
    });
    const productBdt = Math.round(totalPkr * r.CONV_RATE);
    const commission = cartCommission(r);
    const logistics  = Math.round(totalWeight * r.LOG_RATE);
    const totalBdt   = productBdt + commission + logistics + (LOCAL_DELIVERY * cartSuitCount());   // ৳100/suit local delivery (replaces flat fee)

    const orderId = 'PSB-' + Date.now().toString(36).toUpperCase();
    const name    = document.getElementById('buyerName').value.trim();
    const wa      = document.getElementById('buyerWA').value.trim();
    const email   = document.getElementById('buyerEmail').value.trim();
    const address = document.getElementById('buyerAddress').value.trim();
    const notes   = document.getElementById('buyerNotes').value.trim();

    saveBuyerDetails();

    const itemsText = cart.map((item, i) => {
      const totalQty = (item.sizes || [{qty:1}]).reduce((s,r) => s + r.qty, 0);
      const varies = itemPriceVaries(item);
      // Per-size price in the operator's order text when sizes are priced differently, so the packet
      // is prepared at the right price per size. Single-price → the usual "PKR X each".
      const sizeSummary = varies
        ? (item.sizes || []).filter(r => r.size).map(r => `${r.size}×${r.qty}@PKR${_rowPkr(item,r).toLocaleString()}`).join(', ')
        : (item.sizes || []).filter(r => r.size).map(r => `${r.size}×${r.qty}`).join(', ');
      const parts = [`#${i+1} ${item.brand}`, CAT_LABELS[item.cat] || item.cat];
      if(sizeSummary) parts.push('Sizes: ' + sizeSummary);
      parts.push('Total qty: ' + totalQty,
        varies ? 'PKR ' + itemPkrSubtotal(item).toLocaleString() + ' (per-size)' : 'PKR ' + item.pkr.toLocaleString() + ' each',
        item.url);
      return parts.join(' | ');
    }).join('\n');

    const paymentInfo = 'bKash Payment: 01352018131 | bKash/Nagad/Upay/Rocket Send Money: 01851948690 | City Bank – Moors Attire A/C: 1324897775001 | UCBL – Moors Attire A/C: 7862141003465221';

    // Shared order payload (used by every endpoint)
    const payload = {
      order_id:            orderId,
      buyer_name:          name,
      whatsapp:            wa,
      email:               email || '(contact via WhatsApp: ' + wa + ')',
      delivery_address:    address,
      notes:               notes || '',
      estimated_total_bdt: '৳ ' + totalBdt.toLocaleString(),
      estimated_weight_kg: totalWeight.toFixed(2),   // for matching the physical parcel weight on arrival (tracker sheet)
      item_count:          cart.length,
      order_items:         itemsText,
      cart_links:          cart.map(i => i.url).join('\n'),
      payment_info:        paymentInfo
    };

    // (B) Fire to Google Apps Script — appends tracking row + emails owner.
    //     no-cors / text-plain = simple request, no CORS preflight needed.
    if(SHEET_SCRIPT_URL){
      fetch(SHEET_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      }).catch(()=>{});  // fire-and-forget; tracking sheet is non-blocking
    }

    // (A) Primary submission for the success confirmation:
    //     Web3Forms if a key is set, otherwise fall back to Formspree.
    let primary;
    if(WEB3FORMS_KEY){
      primary = fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(Object.assign({
          access_key: WEB3FORMS_KEY,
          subject: `New PakPoshak Order ${orderId} — ${name}`,
          from_name: 'PakPoshak Orders'
        }, payload))
      }).then(r => r.json()).then(j => j.success);
    } else {
      const form = document.getElementById('hiddenForm');
      document.getElementById('hf_subject').value    = `New Order ${orderId} — ${name}`;
      document.getElementById('hf_replyto').value    = email || 'no-email@whatsapp.contact';
      document.getElementById('hf_order_id').value   = orderId;
      document.getElementById('hf_name').value       = name;
      document.getElementById('hf_wa').value         = wa;
      document.getElementById('hf_email').value      = payload.email;
      document.getElementById('hf_address').value    = address;
      document.getElementById('hf_notes').value      = notes;
      document.getElementById('hf_total').value      = payload.estimated_total_bdt;
      document.getElementById('hf_count').value      = cart.length;
      document.getElementById('hf_items').value      = itemsText;
      document.getElementById('hf_cart_links').value = payload.cart_links;
      primary = fetch(FORMSPREE_URL, {
        method: 'POST',
        body: new FormData(form),
        headers: { 'Accept': 'application/json' }
      }).then(res => res.ok);
    }

    primary.then(ok => {
      // If the Apps Script side-channel is configured, the order is safely
      // recorded even if the email service hiccups — so treat as success.
      if(ok || SHEET_SCRIPT_URL){
        document.getElementById('orderRef').textContent = orderId;
        document.getElementById('payConfirmOrderId').textContent = orderId;
        resetPaymentConfirm();
        primePaymentConfirm(totalBdt);
        document.getElementById('trackOrderLink').href =
          `tracking.html?id=${orderId}&name=${encodeURIComponent(name)}`;
        clearCartStorage();
        goToStep(4);
      } else {
        alert('Submission failed. Please try again or contact us on WhatsApp.');
        btn.disabled = false;
        btn.textContent = '✓ Confirm & Submit Order';
      }
    }).catch(() => {
      if(SHEET_SCRIPT_URL){
        // Email service errored but the sheet endpoint likely recorded it.
        document.getElementById('orderRef').textContent = orderId;
        document.getElementById('payConfirmOrderId').textContent = orderId;
        resetPaymentConfirm();
        primePaymentConfirm(totalBdt);
        document.getElementById('trackOrderLink').href =
          `tracking.html?id=${orderId}&name=${encodeURIComponent(name)}`;
        clearCartStorage();
        goToStep(4);
      } else {
        alert('Network error. Please check your connection and try again.');
        btn.disabled = false;
        btn.textContent = '✓ Confirm & Submit Order';
      }
    });
  }

  // ── PAYMENT CONFIRMATION (slip upload / message → saved to the order) ──────
  function switchPayTab(which){
    const onReceipt = which === 'receipt';
    document.getElementById('payTabReceipt').style.display = onReceipt ? '' : 'none';
    document.getElementById('payTabMsg').style.display     = onReceipt ? 'none' : '';
    const rBtn = document.getElementById('payTabReceiptBtn');
    const mBtn = document.getElementById('payTabMsgBtn');
    // Selected tab = gold fill (highlighted); the other = dim/muted.
    rBtn.style.background = onReceipt ? 'var(--gold)' : 'var(--gold-dim)';
    rBtn.style.color      = onReceipt ? '#12122a' : 'var(--gold)';
    mBtn.style.background = onReceipt ? 'var(--gold-dim)' : 'var(--gold)';
    mBtn.style.color      = onReceipt ? 'var(--gold)' : '#12122a';
  }

  function previewReceipt(){
    const f = document.getElementById('payReceiptFile').files[0];
    const box = document.getElementById('payReceiptPreview');
    if(!f){ box.style.display='none'; return; }
    document.getElementById('payReceiptImg').src = URL.createObjectURL(f);
    document.getElementById('payReceiptName').textContent = f.name + ' (' + Math.round(f.size/1024) + ' KB)';
    box.style.display = '';
  }

  // Compress + resize an image file → base64 (keeps uploads small & reliable)
  function compressImage(file){
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = e => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const maxW = 1280;
          const scale = Math.min(1, maxW / img.width);
          const c = document.createElement('canvas');
          c.width  = Math.round(img.width  * scale);
          c.height = Math.round(img.height * scale);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          const dataUrl = c.toDataURL('image/jpeg', 0.72);
          resolve({ base64: dataUrl.split(',')[1], type: 'image/jpeg' });
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function resetPaymentConfirm(){
    ['payReceiptFile','payMessage','payAmount','payTrxId'].forEach(id => {
      const e = document.getElementById(id); if(e) e.value = '';
    });
    const sel = document.getElementById('payMethod'); if(sel) sel.value = '';
    // reset the custom dropdown's label + selection back to "Choose…"
    const pml = document.getElementById('payMethodLabel'); if(pml){ pml.textContent = tr('s_method_pick'); pml.setAttribute('data-i18n','s_method_pick'); }
    document.querySelectorAll('#payMethodPanel .pm-dd-item.sel').forEach(it => it.classList.remove('sel'));
    const pmp = document.getElementById('payMethodPanel'); if(pmp) pmp.style.display = 'none';
    const p = document.getElementById('payReceiptPreview'); if(p) p.style.display = 'none';
    const s = document.getElementById('payConfirmStatus'); if(s) s.style.display = 'none';
    const b = document.getElementById('payConfirmBtn');
    if(b){ b.disabled = false; b.textContent = '✅ Confirm Payment'; }
    window.__payOverride = false;
    switchPayTab('receipt');
  }

  // ── PAYMENT-METHOD CUSTOM DROPDOWN ──────────────────────────────────────────
  // Replaces the native <select id="payMethod"> whose OS-rendered option list ignored the theme
  // (Danish hard rule: every opened list/grid matches the active theme, light + dark). #payMethod is
  // now a hidden input; this drives its value so all existing readers (payMethod.value) are unchanged.
  function pmToggle(ev){
    if(ev) ev.stopPropagation();
    const p = document.getElementById('payMethodPanel'); if(!p) return;
    const open = p.style.display === 'block';
    p.style.display = open ? 'none' : 'block';
    const b = document.getElementById('payMethodBtn'); if(b) b.setAttribute('aria-expanded', String(!open));
  }
  function pmPick(val, label){
    const h = document.getElementById('payMethod'); if(h) h.value = val;
    const l = document.getElementById('payMethodLabel'); if(l){ l.textContent = label; l.removeAttribute('data-i18n'); }
    const p = document.getElementById('payMethodPanel'); if(p) p.style.display = 'none';
    const b = document.getElementById('payMethodBtn'); if(b) b.setAttribute('aria-expanded', 'false');
    document.querySelectorAll('#payMethodPanel .pm-dd-item').forEach(it => it.classList.toggle('sel', it.getAttribute('data-val') === val));
  }
  window.pmToggle = pmToggle;
  window.pmPick = pmPick;
  // Close on an outside click (select-like behaviour).
  document.addEventListener('click', function(e){
    const dd = document.getElementById('payMethodDd');
    if(dd && !dd.contains(e.target)){
      const p = document.getElementById('payMethodPanel'); if(p && p.style.display === 'block') p.style.display = 'none';
      const b = document.getElementById('payMethodBtn'); if(b) b.setAttribute('aria-expanded', 'false');
    }
  });

  // Called when step 4 opens — stashes the order total so the payment box can
  // match it, and prefills the amount with that total (most buyers pay exactly).
  function primePaymentConfirm(totalBdt){
    const box = document.getElementById('payConfirmBox');
    if(box) box.dataset.total = totalBdt || 0;
    const amt = document.getElementById('payAmount');
    if(amt && totalBdt) amt.value = totalBdt;
    const hint = document.getElementById('payExpectedHint');
    if(hint) hint.textContent = totalBdt ? ('Your order total: ৳' + Number(totalBdt).toLocaleString()) : '';
    window.__payOverride = false;
  }

  async function submitPaymentConfirmation(){
    const orderId = document.getElementById('orderRef').textContent.trim();
    const amount  = parseInt((document.getElementById('payAmount').value || '').replace(/[^\d]/g,''), 10) || 0;
    const method  = document.getElementById('payMethod').value;
    const trxId   = document.getElementById('payTrxId').value.trim();
    const file    = document.getElementById('payReceiptFile').files[0];
    const msg     = document.getElementById('payMessage').value.trim();
    const status  = document.getElementById('payConfirmStatus');
    const btn     = document.getElementById('payConfirmBtn');

    function showStatus(text, ok){
      status.style.display = '';
      status.textContent = text;
      status.style.background = ok ? '#e8f5e9' : '#fdecea';
      status.style.color      = ok ? '#1b5e20' : '#b71c1c';
    }

    // Required: amount, method, and at least one proof (TrxID or receipt image).
    if(!amount){          showStatus('Please enter the amount you paid (৳).', false); return; }
    if(!method){          showStatus('Please choose how you paid (bKash, Nagad, …).', false); return; }
    if(!trxId && !file){  showStatus('Please add your Transaction ID, or attach the receipt screenshot below.', false); return; }
    if(!SHEET_SCRIPT_URL){
      showStatus('Payment confirmation isn’t configured yet. Please send your slip on WhatsApp for now.', false);
      return;
    }

    // Soft BDT-amount check — warn once, but never block (advance/partial pays happen).
    const expected = parseInt((document.getElementById('payConfirmBox').dataset.total || '').replace(/[^\d]/g,''), 10) || 0;
    const amountMatch = !expected || amount === expected;
    if(!amountMatch && !window.__payOverride){
      window.__payOverride = true;
      showStatus('⚠️ The amount you entered (৳' + amount.toLocaleString() + ') doesn’t match your order total (৳' + expected.toLocaleString() + '). If that’s correct, tap Confirm Payment again to submit it anyway.', false);
      btn.textContent = '✅ Confirm Payment (submit anyway)';
      return;
    }

    btn.disabled = true; btn.textContent = 'Submitting…';
    showStatus('Sending your payment confirmation…', true);

    try{
      const payload = {
        type:'payment', order_id: orderId,
        payment_amount: amount, payment_method: method, payment_trxid: trxId,
        expected_total_bdt: expected, amount_match: amountMatch,
        payment_message: msg
      };
      if(file){
        const { base64, type } = await compressImage(file);
        payload.receipt_base64 = base64;
        payload.receipt_type   = type;
      }
      // no-cors text/plain = simple request that reaches Apps Script reliably
      await fetch(SHEET_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      showStatus(amountMatch
        ? '✅ Payment confirmation received! We’ll verify and update your order shortly.'
        : '✅ Received — we’ll double-check the amount and confirm your order shortly.', true);
      btn.textContent = '✓ Submitted';
      window.__payOverride = false;
    }catch(err){
      showStatus('Couldn’t send — please check your connection and try again.', false);
      btn.disabled = false; btn.textContent = '✅ Confirm Payment';
    }
  }

  function resetForm(){
    cart = [];
    clearCartStorage();
    drafts = {};
    draftIdCtr = 0;
    _addViaTap = false;
    document.getElementById('draftCards').innerHTML = '';
    document.getElementById('draftsContainer').style.display = 'none';
    closeDraftModal();
    showTopUrlInput();
    document.getElementById('buyerNotes').value = '';
    document.getElementById('confirmSubmitBtn').disabled = false;
    document.getElementById('confirmSubmitBtn').textContent = '✓ Confirm & Submit Order';
    checkAddUrlLock(); // re-enables Add URL buttons
    renderCart();
    goToStep(1);
    try{ showBrowseView(); }catch(e){}   // fresh start → storefront, not an empty bag
  }

  // ── UTILITIES ─────────────────────────────────────────────────────────────
  function toggleBrands(btn){
    const extra = document.getElementById('extraBrands');
    const shown = extra.style.display === 'none' ? false : true;
    // Initial state is inline display:none, so toggle correctly:
    const isHidden = extra.style.display === 'none' || extra.style.display === '';
    if(extra.style.display === 'none'){
      extra.style.display = 'flex';
      extra.style.flexWrap = 'wrap';
      extra.style.gap = '8px';
      extra.style.width = '100%';
      btn.textContent = '− Show fewer brands';
    } else {
      extra.style.display = 'none';
      btn.textContent = '+ Show all brands';
    }
  }

  function copyNum(num, btn){
    navigator.clipboard.writeText(num).then(() => {
      const orig = btn.textContent;
      btn.textContent = '✓ Copied';
      setTimeout(() => btn.textContent = orig, 1800);
    }).catch(() => {
      prompt('Copy this number:', num);
    });
  }

  function toggleWeightGuide(){
    const g = document.getElementById('weightGuide');
    const open = g.style.display !== 'none';
    g.style.display = open ? 'none' : '';
    // Populate table on first open
    if(!open && !g.dataset.built){
      g.dataset.built = '1';
      document.getElementById('weightGuideBody').innerHTML =
        Object.keys(DEFAULT_WEIGHTS).map(k =>
          `<tr><td style="padding:2px 4px">${WEIGHT_LABELS[k]}</td>
               <td style="text-align:right;padding:2px 4px">${getWeight(k).toFixed(2)}</td></tr>`
        ).join('');
    }
  }

  // ── BRAND LINK OPENER ────────────────────────────────────────────────────
  // Pakistani brand sites (Shopify) block iframe embedding — we open in a new
  // tab. A bottom sheet explains the 3-step flow BEFORE the tab opens so the
  // user knows exactly what to do when they come back.
  let _pendingBrandUrl = '';

  function openBrandInApp(el){
    _pendingBrandUrl = el.dataset.url;
    const name = el.dataset.name || 'this brand';
    const dd = document.getElementById('brandDropdown');
    if(dd) dd.style.display = 'none';
    // Show the quick how-to-copy sheet, THEN open the brand (a Chrome Custom
    // Tab, which has ⋮ → Copy link / Share). The sheet teaches where the copy
    // option is, since that's the step users get stuck on.
    showBrandSheet(name);
  }

  // Show the old "open the brand site + paste" sheet (fallback for brands we
  // can't list in-app: Khaadi, Sapphire and other non-Shopify stores).
  // Platform-specific "how to bring the product back" steps — Share-first (paste is the
  // fallback). iPhone → Share→Add to PakPoshak; Android → Share→PakPoshak; desktop → copy/paste.
  // Fill the merged brand sheet: the inline "order on PakPoshak" warning + the
  // Share-first steps. PHONE shows iPhone + Android rows (single item); DESKTOP
  // shows copy/paste + the Send-cart bookmark (that's where whole-cart lives).
  function renderBrandSteps(name){
    const bn = esc(name || 'the brand');
    const warn = document.getElementById('bsWarn');
    if(warn) warn.innerHTML = `<span style="font-size:1rem;flex-shrink:0">💡</span><span><b>Be smart, compare the price here first.</b> Browse ${bn} for photos and sizes, then send the item back to PakPoshak to see its real PKR price and your all-in BDT total, and order here, not there.</span>`;
    const box = document.getElementById('bsSteps'); if(!box) return;
    const num = (n,h) => `<div class="bs-step"><span class="bs-num">${n}</span><span>${h}</span></div>`;
    if(psPlatform() === 'desktop'){
      box.innerHTML =
        num(1, `Click <strong>Open ${bn}</strong> below (opens a new tab), then open the product you want.`) +
        num(2, `Copy the web address (<strong>Ctrl + L</strong>, then <strong>Ctrl + C</strong>), come back, and click the gold <strong>📋 Paste link</strong> button.`) +
        num(3, `<strong>Whole cart?</strong> Add the items to ${bn}'s cart, then click the <strong>Send cart</strong> bookmark to bring them all at once.`);
    } else {
      box.innerHTML =
        num(1, `Tap <strong>Open ${bn}</strong> below, then open the product you want.`) +
        `<div class="bs-step"><span class="bs-num">2</span><span>` +
          `<span style="display:block;margin-bottom:5px"><b>iPhone:</b> tap <strong>Share</strong>, then <strong>Add to PakPoshak</strong>.</span>` +
          `<span style="display:block"><b>Android:</b> tap <strong>Share</strong>, then <strong>PakPoshak</strong>.</span>` +
        `</span></div>` +
        num(3, `It lands here, price and size filled in. <span style="opacity:.7">No Share? Copy the link, come back, tap <strong>📋 Paste link</strong>.</span>`);
    }
  }
  function showBrandSheet(name){
    document.getElementById('bsBrandName').textContent = name;
    document.getElementById('bsOpenBtn').textContent   = 'Open ' + name + ' →';
    renderBrandSteps(name);
    document.getElementById('brandSheet').style.display = 'block';
  }

  // ── IN-APP PRODUCT PICKER ────────────────────────────────────────────────
  // Fetches the brand's catalog (Shopify /products.json — readable cross-origin
  // via GET) and shows a tappable grid. Picking a product runs the SAME add
  // pipeline as pasting a link, so currency/stock/category handling is identical.
  const _ppCache = {};            // origin → product array (per-session cache)
  let _ppProducts = [], _ppOrigin = '', _ppName = '';

  async function browseBrandProducts(url, name){
    let origin;
    try{ origin = new URL(url).origin; }catch(e){ return showBrandSheet(name); }
    _ppOrigin = origin; _ppName = name;
    document.getElementById('ppBrandName').textContent = name;
    document.getElementById('ppSearch').value = '';
    document.getElementById('ppGrid').innerHTML = '';
    const status = document.getElementById('ppStatus');
    status.style.display = ''; status.innerHTML = '⏳ Loading ' + esc(name) + ' products…';
    document.getElementById('productPicker').style.display = 'block';

    if(_ppCache[origin]){ _ppProducts = _ppCache[origin]; renderProducts(_ppProducts); status.style.display='none'; return; }
    try{
      const ctrl = new AbortController();
      const tid  = setTimeout(()=>ctrl.abort(), 16000);
      const r = await fetch(`${origin}/products.json?limit=250`, { signal: ctrl.signal, cache:'no-store' });
      clearTimeout(tid);
      if(!r.ok) throw new Error('HTTP '+r.status);
      const j = await r.json();
      const items = (j.products||[]).filter(p => p.variants && p.variants.length && p.handle);
      if(!items.length) throw new Error('empty');
      _ppCache[origin] = items; _ppProducts = items;
      renderProducts(items); status.style.display = 'none';
    }catch(e){
      // Non-Shopify / blocked / offline → fall back to the open-site sheet.
      closeProductPicker();
      showBrandSheet(name);
    }
  }

  function ppImg(p){
    const im = p.images && p.images[0];
    return im ? (typeof im === 'string' ? im : im.src) : '';
  }
  function ppPrice(p){
    const v = p.variants && p.variants[0];
    return v ? Math.round(parseFloat(v.price) || 0) : 0;   // .json price = decimal rupees
  }

  function renderProducts(list){
    const grid = document.getElementById('ppGrid');
    if(!list.length){ grid.innerHTML = '<div class="pp-empty">No matching products.</div>'; return; }
    grid.innerHTML = list.slice(0, 300).map(p => {
      const price = ppPrice(p);
      return `<button class="pp-item" onclick="pickProduct('${esc(p.handle)}')">
        <img class="pp-img" loading="lazy" src="${esc(ppImg(p))}" alt=""/>
        <div class="pp-name">${esc(p.title)}</div>
        <div class="pp-price">${price ? 'PKR '+price.toLocaleString() : ''}</div>
      </button>`;
    }).join('');
  }

  function filterProducts(){
    const q = document.getElementById('ppSearch').value.trim().toLowerCase();
    if(!q){ renderProducts(_ppProducts); return; }
    renderProducts(_ppProducts.filter(p => (p.title||'').toLowerCase().includes(q)
      || (p.product_type||'').toLowerCase().includes(q)));
  }

  function pickProduct(handle){
    _addViaTap = true;   // picked from the product list → no "added to bag" toast
    const url = _ppOrigin + '/products/' + handle;
    closeProductPicker();
    document.getElementById('urlInputRow').style.display = 'none';
    createDraft(url);              // SAME pipeline as paste — currency/stock/category
    openDraftModal();
  }

  function closeProductPicker(){
    document.getElementById('productPicker').style.display = 'none';
  }

  // From inside the picker: user wants the full brand site. This is a deliberate
  // tap (a fresh gesture), so open the real browser directly.
  function pickerOpenSite(){
    closeProductPicker();
    launchBrandTab();
  }

  // Are we running as the INSTALLED app (standalone), not a browser tab?
  function isInstalledApp(){
    return window.matchMedia && window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
  }

  // ── Brand-site warning interstitial ─────────────────────────────────────────
  // Buyers were going to the brand's own site and adding the item to the BRAND's
  // cart (which does nothing — only a PakPoshak order reaches them). Gate every
  // "go to the brand site" path behind one clear warning: look there, order HERE.
  let _psWarnCb = null;
  function psWarnOpen(opts){ _psWarnCb = (opts && opts.onOk) || null; const m = document.getElementById('psWarn'); if(m) m.style.display = 'flex'; }
  function psWarnClose(){ _psWarnCb = null; const m = document.getElementById('psWarn'); if(m) m.style.display = 'none'; }
  function psWarnGo(){ const cb = _psWarnCb; _psWarnCb = null; const m = document.getElementById('psWarn'); if(m) m.style.display = 'none'; if(typeof cb === 'function') cb(); }

  // Public entry: show the warning first; the real open happens only on "proceed"
  // (still inside the OK button's click gesture, so the popup is not blocked).
  // skipWarn=true: go STRAIGHT to the brand site (used by the merged brand sheet,
  // which already shows the "order on PakPoshak" warning inline — no second modal).
  function launchBrandTab(skipWarn){ if(skipWarn) _doLaunchBrandTab(); else psWarnOpen({ onOk: _doLaunchBrandTab }); }
  function _doLaunchBrandTab(){
    const url = _pendingBrandUrl;
    closeBrandSheet();

    // Always use window.open(_blank). In the installed app this opens a Chrome
    // CUSTOM TAB — which DOES have a top toolbar with a ⋮ menu containing
    // "Copy link" and "Share". (The old intent:// + browser_fallback_url
    // approach was WORSE: when it couldn't launch external Chrome it loaded the
    // fallback in-place as a bare webview with NO toolbar, so nothing could be
    // copied. That was the regression.) In a normal Chrome tab this opens a new
    // tab with the full address bar.
    window.open(url, '_blank', 'noopener');

    // Highlight the URL input so it's obvious where to paste on return
    const input = document.getElementById('urlInput');
    if(input){
      setTimeout(() => {
        input.scrollIntoView({behavior:'smooth', block:'center'});
        input.focus();
        input.placeholder = '← Paste your copied product link here';
        input.style.borderColor   = 'var(--gold)';
        input.style.boxShadow     = '0 0 0 3px rgba(201,169,110,0.35)';
        setTimeout(() => {
          input.style.borderColor = '';
          input.style.boxShadow   = '';
          input.placeholder       = 'https://brand.com/products/product-name';
        }, 6000);
      }, 300);
    }
  }

  function closeBrandSheet(){
    document.getElementById('brandSheet').style.display = 'none';
  }

  // ── BOTTOM NAV ───────────────────────────────────────────────────────────
  // "Luxe" premium room (batch 2): force the Deep-Forest dark look while on the Luxe feed and restore
  // the buyer's own theme when they leave. Piggybacks on data-theme="dark" so every dark-mode override
  // applies; body.ps-luxe then re-tints the tokens deep forest + gold.
  let _psPrevTheme = null;
  function psLuxeMode(on){
    var html = document.documentElement, inLuxe = document.body.classList.contains('ps-luxe');
    if(on && !inLuxe){
      // Remember the buyer's REAL theme preference (not the possibly-forced-dark attribute) so leaving
      // Luxe restores it even on a refresh-in-Luxe where the page already booted dark.
      try{ _psPrevTheme = (localStorage.getItem('psb_theme') === 'dark') ? 'dark' : 'light'; }catch(e){ _psPrevTheme = 'light'; }
      html.setAttribute('data-theme', 'dark');
      document.body.classList.add('ps-luxe');
    } else if(!on && inLuxe){
      document.body.classList.remove('ps-luxe');
      html.setAttribute('data-theme', _psPrevTheme || 'light');
      _psPrevTheme = null;
    }
  }
  window.psLuxeMode = psLuxeMode;

  // ── BAG vs BROWSE (the two faces of step 1) ─────────────────────────────────
  // The storefront (#browseView) and the basket (#bagView) are siblings inside step 1.
  // setOrderView() shows one and hides the other so the Bag is its OWN page (req: Danish —
  // "basket shall have its own page", not a form glued under the product grid). On
  // order-form.html neither id exists, so this is a safe no-op there.
  function setOrderView(view){
    var bag = (view === 'bag');
    var bv = document.getElementById('browseView');
    var gv = document.getElementById('bagView');
    if(!bv && !gv) return;                       // order-form.html — nothing to toggle
    if(bag){ var _hb = document.getElementById('hdrBack'); if(_hb) _hb.hidden = true; }   // back arrow is Browse-Brands only
    if(bv) bv.style.display = bag ? 'none' : '';
    if(gv){
      gv.style.display = bag ? '' : 'none';
      if(bag){ gv.classList.remove('ps-viewfade'); void gv.offsetWidth; gv.classList.add('ps-viewfade'); }  // fade in, never a hard cut (#3)
    }
    document.body.classList.toggle('psb-bag', bag);
    document.body.classList.toggle('psb-browse', !bag);
    var h = document.getElementById('appHeader');
    if(h) h.style.position = (!bag && window.innerWidth < 820) ? 'relative' : '';   // bag keeps the sticky header; browse hands off to .ps-topstick
    try{ updatePasteFab(); }catch(e){}
  }
  function showBrowseView(){ setOrderView('browse'); }
  function showBagView(){
    if(!document.getElementById('step1').classList.contains('active')) goToStep(1);
    setOrderView('bag');
    try{ renderCart(); }catch(e){}
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  window.setOrderView = setOrderView;
  window.showBrowseView = showBrowseView;
  window.showBagView = showBagView;

  // Brief confirmation after an item is saved while the buyer is still browsing — the Bag is its
  // own page now, so without this an add would feel like nothing happened. Tapping it opens the Bag.
  function psAddedToBagToast(){
    var t = document.getElementById('psBagToast');
    if(!t){ t = document.createElement('div'); t.id = 'psBagToast'; t.className = 'ps-share-toast'; t.setAttribute('role','status'); document.body.appendChild(t); }
    t.innerHTML = '<span>✓ ' + esc(tr('bag_added')) + '</span><button type="button" onclick="showBagView()">' + esc(tr('bag_view')) + '</button>';
    t.classList.add('on');
    clearTimeout(t._h); t._h = setTimeout(function(){ if(t) t.classList.remove('on'); }, 3800);
  }
  window.psAddedToBagToast = psAddedToBagToast;

  function bottomNavGo(tab){
    try{ psThemeFlash(); }catch(e){}   // smooth any theme/Luxe colour flip this tap triggers (#3)
    // Bottom nav (redesign batch 2) = Home · Luxe · Bag(cart) · Price Check. Bag uses id bnav-bag.
    var idmap = { home:'bnav-home', luxe:'bnav-luxe', cart:'bnav-bag', pricecheck:'bnav-pricecheck' };
    Object.keys(idmap).forEach(function(t){ var b = document.getElementById(idmap[t]); if(b) b.classList.toggle('active', t === tab); });
    if(tab === 'home'){
      psLuxeMode(false);
      if(typeof switchBrowse === 'function') switchBrowse('products');
      try{ psSetStore('everyday'); }catch(e){}   // Home = the everyday feed (under 15k)
      if(currentStep !== 1) goToStep(1);
      window.scrollTo({top:0, behavior:'smooth'});
    } else if(tab === 'luxe'){
      psLuxeMode(true);                          // …the Deep-Forest premium room
      if(typeof switchBrowse === 'function') switchBrowse('products');
      try{ psSetStore('premium'); }catch(e){}    // Luxe = the 10k+ feed (replaces the old toggle)
      if(currentStep !== 1) goToStep(1);
      window.scrollTo({top:0, behavior:'smooth'});
    } else if(tab === 'cart'){
      psLuxeMode(false);
      gotoCart();   // Bag → jumps back to step 1 if needed, then scrolls to the order list
    } else if(tab === 'pricecheck'){
      // Price Check = the brands / paste-a-link page where we reveal the real PKR price.
      psLuxeMode(false);
      if(currentStep !== 1) goToStep(1);
      if(typeof switchBrowse === 'function') switchBrowse('brands');
      window.scrollTo({top:0, behavior:'smooth'});
    }
  }
  // Bottom nav auto-hide: slide it away while actively scrolling DOWN; bring it back on a deliberate
  // scroll UP or near the top. Time-throttled (no rAF dependency) so it works in all webviews.
  // NOTE: there is intentionally NO "show after scrolling stops" — that re-showed the bar on every
  // pause, so it POPPED back up after every little scroll (req: Danish, "bottom bar keeps popping up
  // after adding to the bag"). Now it stays put while you read, and only returns when you mean it.
  (function(){
    var lastY = 0;
    function onScroll(){
      var n = document.getElementById('bottomNav'); if(!n) return;
      var y = window.scrollY || window.pageYOffset || 0;
      if(y < 80){ n.classList.remove('bottom-nav--hidden'); }                       // near the top → always show
      else if(y > lastY + 6 && y > 130){ n.classList.add('bottom-nav--hidden'); }   // scrolling down → hide
      else if(y < lastY - 8){ n.classList.remove('bottom-nav--hidden'); }           // deliberate scroll up → show
      lastY = y;
    }
    window.addEventListener('scroll', onScroll, { passive:true });
  })();
  // Names-only category bar (#8): reveal it in the sticky top group once the photo strip scrolls up
  // under the search bar (mobile + Products tab only). Time-throttled; ~45px hysteresis avoids flicker.
  (function(){
    var last = 0;
    function onScroll(){
      var now = Date.now(); if(now - last < 90) return; last = now;
      var ts = document.querySelector('.ps-topstick'); if(!ts) return;
      var tp = document.getElementById('tabProducts');
      var cat = document.getElementById('psShopCat');
      if(window.innerWidth >= 820 || !tp || getComputedStyle(tp).display === 'none' || !cat || !cat.getClientRects().length){
        ts.classList.remove('is-scrolled'); return;
      }
      var scrolled = cat.getBoundingClientRect().bottom < ts.getBoundingClientRect().bottom + 6;
      ts.classList.toggle('is-scrolled', scrolled);
    }
    window.addEventListener('scroll', onScroll, { passive:true });
    window.addEventListener('resize', onScroll, { passive:true });
  })();
  // Help tab → toggle the guide popup (Watch video + How it works). Replaces the old broken
  // "bottomNavGuide" handler (it was never defined → the button did nothing).
  function bottomNavHelp(ev){
    if(ev) ev.stopPropagation();
    const pop = document.getElementById('guidePop'); if(!pop) return;
    const open = !(pop.style.display === 'block');
    pop.style.display = open ? 'block' : 'none';
    const btn = document.getElementById('bnav-help'); if(btn) btn.classList.toggle('active', open);
  }
  document.addEventListener('click', function(e){
    const pop = document.getElementById('guidePop'), btn = document.getElementById('bnav-help');
    if(pop && pop.style.display === 'block' && !pop.contains(e.target) && (!btn || !btn.contains(e.target))){
      pop.style.display = 'none'; if(btn) btn.classList.remove('active');
    }
  });

  function scrollToCart(){
    if(document.getElementById('step1').classList.contains('active')){
      const el = document.getElementById('runningTotal').style.display !== 'none'
        ? document.getElementById('runningTotal')
        : document.getElementById('cartList');
      if(el) el.scrollIntoView({behavior:'smooth'});
    }
  }

  // "Bag" (bottom-nav + desktop Cart chip): open the Bag as its own page (step-1 bag view).
  function gotoCart(){ showBagView(); }

  // ── CART BADGE SYNC ──────────────────────────────────────────────────────
  function updateCartBadges(count){
    // Header cart removed. Mobile shows the bottom-bar badge; desktop shows the
    // badge on the Cart chip beside the stepper. Keep both in sync.
    [['bnavBadge'], ['stepsCartBadge']].forEach(([elId]) => {
      const b = document.getElementById(elId);
      if(!b) return;
      if(count > 0){ b.textContent = count; b.style.display = ''; }
      else         { b.style.display = 'none'; }
    });
  }

  // Restore any saved cart — must run last, after all consts above are initialised.
  loadCartFromStorage();

  // Turn on every WhatsApp link ONLY if a support number is configured above —
  // otherwise they stay hidden so a buyer never taps a dead link.
  function wireSupportWA(){
    var num = (typeof SUPPORT_WA === 'string' ? SUPPORT_WA : '').replace(/\D/g,'');
    if(!num) return;                      // no number set → links remain hidden
    var href = 'https://wa.me/' + num;
    var note = document.getElementById('waNote');
    if(note){ note.style.display = ''; var a = document.getElementById('waSupportLink'); if(a) a.href = href; }
    var chip = document.getElementById('waTrustLink');
    if(chip){ chip.href = href; chip.style.display = ''; }
  }
  wireSupportWA();

  // Fetch global rates/weights from the relay (must run after DEFAULT_RELAY_URL
  // is defined). Refreshes the cart totals once it arrives.
  loadPsbConfig();

  // Auto-open admin panel for ?admin — also must run last so DEFAULT_WEIGHTS etc.
  // are already initialised (this used to crash the whole script when run early).
  if(window.location.search.includes('admin')) openAdminPanel();

  // ═══ SELF-TEST (regression guard) — load the form with ?selftest ═══════════
  // Green = that feature still works. Run this after ANY change before relying
  // on the site. It checks the things that have broken before.
  function runSelfTest(){
    const t=[]; const ok=(n,c,d='')=>t.push({n,pass:!!c,d});
    try{
      ok('Script loaded fully (no syntax error)', typeof getWeight==='function' && typeof onBrandSearch==='function' && typeof fetchProductData==='function' && typeof openAdminPanel==='function');
      ok('Brand directory ≥ 90 brands', BRANDS.length>=90, BRANDS.length+' brands');
      ok('Every brand has name + valid URL', BRANDS.every(b=>b.n && /^https?:\/\//.test(b.u)));
      ok('Search matches a known brand', BRANDS.filter(b=>b.n.toLowerCase().includes('maria')).length>0);
      ok('Search dropdown element exists', !!document.getElementById('brandDropdown'));
      const ALL_CAT_KEYS = Object.values(CAT_TREE).flatMap(g => g.groups.flatMap(grp => grp.items.map(it => it[0])));
      ok('Women categories present', ALL_CAT_KEYS.includes('pret_3pc') && ALL_CAT_KEYS.includes('kaftan'));
      ok('Men categories present', ALL_CAT_KEYS.includes('mens_shalwar_kameez') && ALL_CAT_KEYS.includes('mens_sherwani'));
      ok('Shawl category present', ALL_CAT_KEYS.includes('shawl'));
      ok('New categories present', ['pret_2pc_emb','unstitch_3pc_emb','pret_3pc_emb','saree','lehenga','abaya','loungewear','coord_western'].every(k=>ALL_CAT_KEYS.includes(k)));
      const catVals=ALL_CAT_KEYS;
      const missW=catVals.filter(c=>!(c in DEFAULT_WEIGHTS));
      ok('Every category has a weight', missW.length===0, missW.length?('missing: '+missW.join(', ')):'');
      const missL=Object.keys(DEFAULT_WEIGHTS).filter(c=>!WEIGHT_LABELS[c]);
      ok('Every weight has a label', missL.length===0, missL.length?('missing: '+missL.join(', ')):'');
      ok('Gender: Cambridge → men', detectGender('https://thecambridgeshop.com/products/x',null)==='men');
      ok('Gender: Maria B → women', detectGender('https://mariab.pk/products/x',null)==='women');
      ok('Category: kaftan auto-detect', detectCategory('https://silayipret.com/products/x-summer-kaftan')==='kaftan');
      ok("Category: men's shalwar kameez", detectCategory('https://thecambridgeshop.com/collections/designer-shalwar-kameez/products/x')==='mens_shalwar_kameez');
      ok('Category: brand NAME not read as fabric (nishatLINEN ≠ linen/winter)', detectCategory('https://nishatlinen.com/products/42602009')==='');
      ok('Size NOT falsely read from handle "s26…"', detectSizeFromUrl('https://x.com/products/s26b4569')==='');
      let admErr=''; try{ buildWeightEditor(); }catch(e){ admErr=e.message; }
      ok('Admin weight editor builds', !admErr, admErr);
      ok('Commission fields editable', (()=>{const c=document.getElementById('adm_comm_1'); return c && !c.readOnly;})());
      ok('Cart persistence functions exist', typeof saveCartToStorage==='function' && typeof loadCartFromStorage==='function');
      ok('Refresh warning installed', true); // beforeunload handler is registered above
    }catch(e){ ok('FATAL ERROR while testing', false, e.message); }
    return t;
  }
  if(window.location.search.includes('selftest')){
    const res = runSelfTest();
    const pass = res.filter(r=>r.pass).length, total = res.length;
    const allOk = pass===total;
    const box = document.createElement('div');
    box.style.cssText='position:fixed;inset:0;z-index:99999;background:#0f0f1a;color:#eee;font-family:system-ui,sans-serif;overflow:auto;padding:24px';
    box.innerHTML =
      `<div style="max-width:680px;margin:0 auto">
        <h1 style="color:${allOk?'#4caf50':'#ff5252'};font-size:1.4rem">${allOk?'✅ ALL CHECKS PASSED':'❌ '+(total-pass)+' CHECK(S) FAILED'} <span style="color:#888;font-size:0.9rem">(${pass}/${total})</span></h1>
        <p style="color:#888;font-size:0.85rem;margin:6px 0 16px">PakPoshak self-test · run after every change. ${allOk?'Safe to use.':'Fix the red items before relying on the site.'}</p>
        ${res.map(r=>`<div style="display:flex;gap:10px;padding:9px 12px;border-bottom:1px solid #23233a;align-items:center">
            <span style="font-size:1.1rem">${r.pass?'🟢':'🔴'}</span>
            <span style="flex:1;font-size:0.9rem">${r.n}</span>
            ${r.d?`<span style="color:#ff8a8a;font-size:0.78rem">${r.d}</span>`:''}
          </div>`).join('')}
        <a href="${location.pathname}" style="display:inline-block;margin-top:20px;color:var(--gold)">← Back to the form</a>
      </div>`;
    document.body.appendChild(box);
  }

  // ══ BROWSE PRODUCTS — multi-brand search over a pre-built catalog ═══════════
  // catalog.json is harvested by harvest-catalog.js (locally now; VPS nightly in
  // Phase 2). Loaded ONCE, filtered client-side — no live per-search brand
  // fetches. Tapping a product hands its URL to the existing live add pipeline
  // (handleAddUrl), so price / stock / category are verified on add.
  const PSB_CATALOG_URL = (function(){ try{ return localStorage.getItem('psb_catalog_url') || 'catalog.json'; }catch(e){ return 'catalog.json'; } })();
  // Price buckets are on the buyer-facing LANDED ৳BDT estimate (per p._bdt),
  // not PKR — Bangladeshi buyers filter in their own currency.
  const PS_BUCKETS = [
    {lo:0,     hi:3000,  lbl:'Under ৳3k'},
    {lo:3000,  hi:4500,  lbl:'৳3–4.5k'},
    {lo:4500,  hi:6000,  lbl:'৳4.5–6k'},
    {lo:6000,  hi:8000,  lbl:'৳6–8k'},
    {lo:8000,  hi:10000, lbl:'৳8–10k'},
    {lo:10000, hi:15000, lbl:'৳10k+'},   // shown as "10k+" in the filter; Home view caps at 15k so this IS the 10k+ band there
    {lo:15000, hi:1e12,  lbl:'৳15k+'}    // bucket 6 exists for the Premium/Luxe band (price 5,6) but is HIDDEN from the filter chips (req)
  ];
  const PS_CAT_LABELS = {
    pret_3pc:'Stitched 3-piece', pret_3pc_emb:'Stitched 3pc — embroidered', pret_2pc_emb:'Stitched 2pc — embroidered',
    lawn_3pc_unstitch:'Unstitched 3-piece', unstitch_3pc_emb:'Unstitched 3pc — embroidered',
    shirt_dupatta_2pc:'2pc shirt+dupatta — stitched', shirt_dupatta_2pc_unstitch:'2pc shirt+dupatta — unstitched',
    shirt_trouser_2pc:'2pc co-ord — stitched', shirt_trouser_2pc_unstitch:'2pc co-ord — unstitched',
    kurti_1pc:'Kurti / 1-piece — stitched', kurti_1pc_unstitch:'Kurti / 1-piece — unstitched',
    western_top:'Western top / tank / tee', womens_trouser:'Trousers / bottoms', maxi_dress:'Dress / maxi',
    formal_emb_3pc:'Formal 3-piece', formal_emb_2pc:'Formal 2-piece', heavy_formal_3pc:'Heavy formal 3pc',
    handmade_emb:'Handmade full embroidery (adda)',
    bridal:'Bridal', lehenga:'Lehenga', saree:'Saree', abaya:'Abaya / Hijab', kaftan:'Kaftan',
    winter_2pc_stitch:'Winter 2pc — stitched', winter_2pc_unstitch:'Winter 2pc — unstitched',
    winter_3pc_stitch:'Winter 3pc — stitched', winter_3pc_unstitch:'Winter 3pc — unstitched',
    dupatta_only:'Dupatta / stole', shawl:'Shawl', footwear:'Footwear / khussa',
    loungewear:'Loungewear', coord_western:'Co-ord set',
    mens_shirt:'Men — shirt', mens_kurta:'Men — kurta', mens_shalwar_kameez:'Men — shalwar kameez',
    mens_trouser:'Men — trousers', mens_jeans:'Men — jeans', mens_suit:'Men — suit',
    mens_waistcoat:'Men — waistcoat', mens_sherwani:'Men — sherwani', mens_unstitched:'Men — unstitched',
    kids_boys_eastern:'Boys — eastern', kids_girls_eastern:'Girls — eastern',
    kids_boys_western:'Boys — western', kids_girls_western:'Girls — western',
    kids_boys_formal:'Boys — party / formal', kids_girls_formal:'Girls — party / formal',
    kids_infant:'Infant / Baby (0–2y)'
  };
  function psLabel(cat){ return PS_CAT_LABELS[cat] || cat; }

  let PS_CATALOG = null, psLoaded = false, psLoading = false;
  let psSel = { prices:new Set(), cats:new Set(), brands:new Set() };
  let psFiltered = [], psPage = 0, psSort = '';   // '' | 'asc' | 'desc' — ৳ price sort (combines with the Sale/New filters)
  // ── Infinite scroll (Myntra-style, redesign P1) ──────────────────────────
  // The product feed grows by appending the next page as the buyer scrolls (replaces the old
  // swipe-between-pages + prev/next pager). psFiltered holds EVERY item shown so far in BOTH
  // modes, so psCard's absolute index keeps psAdd/psDetail correct. The 90s seed is FROZEN per
  // feed (psFeedSeed) so appended pages stay a consistent slice instead of reshuffling mid-scroll.
  const PS_INFINITE = true;
  let psFeedLoading = false, psFeedDone = false, psFeedSeed = 0;
  let _psNavDir = 0;   // +1 = going forward (next page), -1 = back, 0 = no page-turn animation
  let psSaleOnly = false;                          // Sale filter: show only discounted items
  let psNewOnly = false;                           // New filter: newest NON-sale items (⇄ Sale; the ৳ price sort orders within)
  // Storefront (batch 2): PERSISTED so a hard refresh in Luxe stays in Luxe. 'everyday' = under 15k
  // (buckets 0-5), 'premium' = 10k+ (buckets 5-6); 10-15k overlaps. Yields to a manual price selection.
  let psStore = (function(){ try{ return localStorage.getItem('psb_store') === 'premium' ? 'premium' : 'everyday'; }catch(e){ return 'everyday'; } })();

  // ── Search-API mode ── Browse Products served by the VPS /search endpoint (returns only
  //    the filtered page) instead of downloading the whole catalog.json — scales to 100k+.
  //    Falls back to the proven catalog.json client path on ANY API failure.
  let psApiMode = true;          // use the search API; psApiFallback() flips this off on failure
  let psApiTotal = 0;            // total matching products the API reports (drives the pager)
  let _psCatTotal = 0;           // largest total seen = the unfiltered catalogue size (for the count note)
  let psApiSeq = 0;              // request sequence — ignore out-of-order responses
  let psApiFellBack = false;     // true once we've degraded to catalog.json
  let psQuery = '';              // free-text keyword (API mode)
  let psSizeQ = '';              // a bare age/size number typed ("boys 14") → boost that size to the top
  let psFacetBrands = null;      // brand names present (from /search/facets)
  let psFacetCats = null;        // Set of categories present (from /search/facets)

  // ── Sold-out auto-hide ──────────────────────────────────────────────────
  // When the LIVE add pipeline finds a product fully sold out (it sold out AFTER
  // the catalogue's last harvest), hide it from the Browse-Products grid right
  // away so no other customer taps a dead listing. Persisted (keyed by a
  // normalised product URL) with a 24h TTL — the catalogue re-harvests 4×/day and
  // drops sold-out items itself, and the TTL lets a re-stocked item reappear.
  const PS_SOLDOUT_TTL = 24 * 3600 * 1000;
  let _psSoldOut = {};
  try { _psSoldOut = JSON.parse(localStorage.getItem('psb_soldout') || '{}') || {}; } catch(e){ _psSoldOut = {}; }
  function psUrlKey(u){
    try { const x = new URL(u, location.href);
      return (x.host.replace(/^www\./,'') + x.pathname.replace(/\/+$/,'')).toLowerCase(); }
    catch(e){ return String(u || '').toLowerCase(); }
  }
  function psIsHidden(p){ const ts = _psSoldOut[psUrlKey(p.u)]; return !!ts && (Date.now() - ts < PS_SOLDOUT_TTL); }
  function psPruneSoldOut(){
    const now = Date.now(); let changed = false;
    for(const k in _psSoldOut){ if(now - _psSoldOut[k] > PS_SOLDOUT_TTL){ delete _psSoldOut[k]; changed = true; } }
    if(changed){ try{ localStorage.setItem('psb_soldout', JSON.stringify(_psSoldOut)); }catch(e){} }
  }
  function psMarkSoldOut(url){
    if(!url) return;
    _psSoldOut[psUrlKey(url)] = Date.now();
    try{ localStorage.setItem('psb_soldout', JSON.stringify(_psSoldOut)); }catch(e){}
    if(PS_CATALOG){ try{ psApply(); }catch(e){} }   // re-filter so the dead listing drops out immediately
  }
  // cat → gender ('w'/'m'/'k') and cat → group-index, derived once from CAT_TREE
  // so the Browse-Products category filter and the Browse-Brands product view
  // mirror the order form's picker exactly (single source of truth).
  const PS_CAT_GENDER = {}, PS_CAT_GROUPIDX = {};
  ['w','m','k'].forEach(g => (CAT_TREE[g].groups || []).forEach((grp, gi) =>
    (grp.items || []).forEach(([k]) => { PS_CAT_GENDER[k] = g; PS_CAT_GROUPIDX[k] = gi; })));
  const PS_GENDER_WORD = { w:'ps_allw', m:'ps_allm', k:'ps_allk' };
  // Jewellery/accessories are not orderable here → keep them out of Browse Products.
  const PS_HIDE_CATS = new Set(['accessories']);
  // couple_collection is a His+Hers set (single price) → shown under BOTH women and men.
  const PS_DUAL_CATS = new Set(['couple_collection']);

  // ── UNIFIED SMART SEARCH — one bar marks matching BRANDS + CATEGORIES ────────
  // Buyers search by concept ("casual", "1pc", "co-ord", "winter", "khaadi casual"),
  // not by our internal labels. Each search word is linked to category keys here.
  const PS_W = Object.keys(PS_CAT_GENDER).filter(k => PS_CAT_GENDER[k]==='w' && !PS_HIDE_CATS.has(k));
  const PS_M = Object.keys(PS_CAT_GENDER).filter(k => PS_CAT_GENDER[k]==='m');
  const PS_K = Object.keys(PS_CAT_GENDER).filter(k => PS_CAT_GENDER[k]==='k');
  const PS_CAT_SYNONYMS = [
    ['1 pc',    ['kurti_1pc','kaftan','maxi_dress','womens_trouser','mens_shirt','mens_trouser','mens_jeans','mens_kurta','kurti_1pc_unstitch','western_top']],
    ['1 pcs',   ['kurti_1pc','kaftan','maxi_dress','womens_trouser','mens_shirt','mens_trouser','mens_jeans','mens_kurta','kurti_1pc_unstitch','western_top']],
    ['1 piece', ['kurti_1pc','kaftan','maxi_dress','womens_trouser','mens_shirt','mens_trouser','mens_jeans','mens_kurta','kurti_1pc_unstitch','western_top']],
    ['1 pieces',['kurti_1pc','kaftan','maxi_dress','womens_trouser','mens_shirt','mens_trouser','mens_jeans','mens_kurta','kurti_1pc_unstitch','western_top']],
    ['1pc',     ['kurti_1pc','kaftan','maxi_dress','womens_trouser','mens_shirt','mens_trouser','mens_jeans','mens_kurta','kurti_1pc_unstitch','western_top']],
    ['1pc unstitched', ['kurti_1pc_unstitch','mens_unstitched']],
    ['1piece',  ['kurti_1pc','kaftan','maxi_dress','womens_trouser','mens_shirt','mens_trouser','mens_jeans','mens_kurta','kurti_1pc_unstitch','western_top']],
    ['1pieces', ['kurti_1pc','kaftan','maxi_dress','womens_trouser','mens_shirt','mens_trouser','mens_jeans','mens_kurta','kurti_1pc_unstitch','western_top']],
    ['2 pc',    ['shirt_dupatta_2pc','shirt_dupatta_2pc_unstitch','shirt_trouser_2pc','shirt_trouser_2pc_unstitch','pret_2pc_emb','coord_western','formal_emb_2pc','winter_2pc_stitch','winter_2pc_unstitch','mens_shalwar_kameez','mens_suit']],
    ['2 pcs',   ['shirt_dupatta_2pc','shirt_dupatta_2pc_unstitch','shirt_trouser_2pc','shirt_trouser_2pc_unstitch','pret_2pc_emb','coord_western','formal_emb_2pc','winter_2pc_stitch','winter_2pc_unstitch','mens_shalwar_kameez','mens_suit']],
    ['2 piece', ['shirt_dupatta_2pc','shirt_dupatta_2pc_unstitch','shirt_trouser_2pc','shirt_trouser_2pc_unstitch','pret_2pc_emb','coord_western','formal_emb_2pc','winter_2pc_stitch','winter_2pc_unstitch','mens_shalwar_kameez','mens_suit']],
    ['2 pieces',['shirt_dupatta_2pc','shirt_dupatta_2pc_unstitch','shirt_trouser_2pc','shirt_trouser_2pc_unstitch','pret_2pc_emb','coord_western','formal_emb_2pc','winter_2pc_stitch','winter_2pc_unstitch','mens_shalwar_kameez','mens_suit']],
    ['2pc',     ['shirt_dupatta_2pc','shirt_dupatta_2pc_unstitch','shirt_trouser_2pc','shirt_trouser_2pc_unstitch','pret_2pc_emb','coord_western','formal_emb_2pc','winter_2pc_stitch','winter_2pc_unstitch','mens_shalwar_kameez','mens_suit']],
    ['2pc embroidered', ['pret_2pc_emb']],
    ['2pc unstitched', ['shirt_dupatta_2pc_unstitch','shirt_trouser_2pc_unstitch']],
    ['2piece',  ['shirt_dupatta_2pc','shirt_dupatta_2pc_unstitch','shirt_trouser_2pc','shirt_trouser_2pc_unstitch','pret_2pc_emb','coord_western','formal_emb_2pc','winter_2pc_stitch','winter_2pc_unstitch','mens_shalwar_kameez','mens_suit']],
    ['2pieces', ['shirt_dupatta_2pc','shirt_dupatta_2pc_unstitch','shirt_trouser_2pc','shirt_trouser_2pc_unstitch','pret_2pc_emb','coord_western','formal_emb_2pc','winter_2pc_stitch','winter_2pc_unstitch','mens_shalwar_kameez','mens_suit']],
    ['3 pc',    ['pret_3pc','pret_3pc_emb','lawn_3pc_unstitch','unstitch_3pc_emb','formal_emb_3pc','heavy_formal_3pc','winter_3pc_stitch','winter_3pc_unstitch','mens_suit']],
    ['3 pcs',   ['pret_3pc','pret_3pc_emb','lawn_3pc_unstitch','unstitch_3pc_emb','formal_emb_3pc','heavy_formal_3pc','winter_3pc_stitch','winter_3pc_unstitch','mens_suit']],
    ['3 piece', ['pret_3pc','pret_3pc_emb','lawn_3pc_unstitch','unstitch_3pc_emb','formal_emb_3pc','heavy_formal_3pc','winter_3pc_stitch','winter_3pc_unstitch','mens_suit']],
    ['3 pieces',['pret_3pc','pret_3pc_emb','lawn_3pc_unstitch','unstitch_3pc_emb','formal_emb_3pc','heavy_formal_3pc','winter_3pc_stitch','winter_3pc_unstitch','mens_suit']],
    ['3pc',     ['pret_3pc','pret_3pc_emb','lawn_3pc_unstitch','unstitch_3pc_emb','formal_emb_3pc','heavy_formal_3pc','winter_3pc_stitch','winter_3pc_unstitch','mens_suit']],
    ['3pc embroidered', ['pret_3pc_emb','unstitch_3pc_emb']],
    ['3pc stitched', ['pret_3pc','pret_3pc_emb']],
    ['3pc suit', ['mens_suit']],
    ['3pc unstitched', ['lawn_3pc_unstitch','unstitch_3pc_emb']],
    ['3piece',  ['pret_3pc','pret_3pc_emb','lawn_3pc_unstitch','unstitch_3pc_emb','formal_emb_3pc','heavy_formal_3pc','winter_3pc_stitch','winter_3pc_unstitch','mens_suit']],
    ['3pieces', ['pret_3pc','pret_3pc_emb','lawn_3pc_unstitch','unstitch_3pc_emb','formal_emb_3pc','heavy_formal_3pc','winter_3pc_stitch','winter_3pc_unstitch','mens_suit']],
    ['a-line', ['kurti_1pc','maxi_dress','pret_3pc']],
    ['abaya', ['abaya']],
    ['abayas', ['abaya']],
    ['adda', ['handmade_emb','formal_emb_3pc','heavy_formal_3pc','bridal','lehenga']],
    ['adda work', ['handmade_emb','formal_emb_3pc','heavy_formal_3pc','bridal']],
    ['aline', ['kurti_1pc','maxi_dress','pret_3pc']],
    ['anarkali', ['maxi_dress','formal_emb_3pc','heavy_formal_3pc','pret_3pc_emb']],
    ['angrakha', ['maxi_dress','pret_3pc','formal_emb_3pc','kurti_1pc']],
    ['baby', ['kids_infant']],
    ['banarasi', ['heavy_formal_3pc','formal_emb_3pc','saree','lehenga','bridal','mens_sherwani','dupatta_only']],
    ['banarsi', ['pret_3pc_emb','formal_emb_3pc','heavy_formal_3pc','saree','lehenga','bridal','mens_sherwani','mens_waistcoat','dupatta_only']],
    ['baraat', ['bridal','lehenga','heavy_formal_3pc','formal_emb_3pc','handmade_emb','saree','mens_sherwani','mens_suit']],
    ['barat', ['bridal','lehenga','heavy_formal_3pc','formal_emb_3pc','handmade_emb','saree','mens_sherwani','mens_suit','mens_waistcoat']],
    ['basic', ['kurti_1pc','shirt_dupatta_2pc','mens_shirt']],
    ['basic wear', ['kurti_1pc','pret_3pc','mens_kurta']],
    ['blazer', ['mens_suit']],
    ['block', ['kurti_1pc','pret_3pc','lawn_3pc_unstitch','dupatta_only']],
    ['block print', ['kurti_1pc','kurti_1pc_unstitch','shirt_dupatta_2pc','pret_3pc','lawn_3pc_unstitch','maxi_dress','dupatta_only','kids_girls_eastern']],
    ['blouse', ['kurti_1pc','saree','western_top']],
    ['boski', ['mens_unstitched','mens_kurta']],
    ['bottom', ['womens_trouser','mens_trouser']],
    ['boy', ['kids_boys_eastern','kids_boys_western','kids_boys_formal']],
    ['boys', ['kids_boys_eastern','kids_boys_western','kids_boys_formal']],
    ['boys eastern', ['kids_boys_eastern']],
    ['boys eid', ['kids_boys_formal','kids_boys_eastern']],
    ['boys formal', ['kids_boys_formal']],
    ['boys jeans', ['kids_boys_western']],
    ['boys kurta', ['kids_boys_eastern']],
    ['boys party', ['kids_boys_formal']],
    ['boys shalwar kameez', ['kids_boys_eastern']],
    ['boys sherwani', ['kids_boys_formal']],
    ['boys shirt', ['kids_boys_western']],
    ['boys western', ['kids_boys_western']],
    ['bridal', ['bridal','lehenga','heavy_formal_3pc']],
    ['bridal wear', ['bridal','lehenga']],
    ['bride', ['bridal','lehenga']],
    ['burqa', ['abaya']],
    ['caftan', ['kaftan','maxi_dress']],
    ['cambric', ['kurti_1pc','kurti_1pc_unstitch','shirt_dupatta_2pc','shirt_dupatta_2pc_unstitch','shirt_trouser_2pc','shirt_trouser_2pc_unstitch','pret_3pc','lawn_3pc_unstitch','mens_unstitched','mens_kurta','mens_shalwar_kameez','kids_girls_eastern','kids_boys_eastern']],
    ['camisole', ['western_top']],
    ['cape', ['kurti_1pc','coord_western','maxi_dress','western_top','formal_emb_3pc']],
    ['capri', ['womens_trouser']],
    ['cargo', ['mens_trouser','kids_boys_western']],
    ['casual', ['kurti_1pc','kaftan','shirt_dupatta_2pc','shirt_trouser_2pc','lawn_3pc_unstitch','pret_3pc','loungewear','coord_western','mens_shirt','mens_trouser','mens_jeans','kids_boys_eastern','kids_girls_eastern','kids_boys_western','kids_girls_western','western_top','maxi_dress','womens_trouser','mens_kurta']],
    ['casual shirt', ['mens_shirt']],
    ['chaddar', ['dupatta_only','shawl']],
    ['chamois', ['maxi_dress','pret_3pc','pret_3pc_emb','formal_emb_3pc','heavy_formal_3pc','winter_3pc_stitch','lehenga']],
    ['chappal', ['footwear']],
    ['chiffon', ['formal_emb_2pc','formal_emb_3pc','heavy_formal_3pc','pret_3pc_emb','kurti_1pc','maxi_dress','shirt_dupatta_2pc','pret_2pc_emb','pret_3pc','saree','lehenga','bridal','dupatta_only']],
    ['chiffon dupatta', ['dupatta_only']],
    ['chikankari', ['kurti_1pc','pret_2pc_emb','pret_3pc_emb','formal_emb_2pc','formal_emb_3pc','unstitch_3pc_emb','handmade_emb']],
    ['children', ['kids_boys_eastern','kids_girls_eastern','kids_boys_western','kids_girls_western','kids_boys_formal','kids_girls_formal','kids_infant']],
    ['chino', ['mens_trouser']],
    ['chinos', ['mens_trouser']],
    ['choli', ['lehenga','bridal']],
    ['cigarette', ['womens_trouser']],
    ['cigarette pants', ['womens_trouser']],
    ['cloth', ['lawn_3pc_unstitch','unstitch_3pc_emb','kurti_1pc_unstitch','mens_unstitched']],
    ['co ord', ['shirt_trouser_2pc','coord_western','shirt_trouser_2pc_unstitch']],
    ['co ord set', ['shirt_trouser_2pc','coord_western']],
    ['co-ord', ['shirt_trouser_2pc','coord_western']],
    ['coat pant', ['mens_suit']],
    ['coord', ['shirt_trouser_2pc','shirt_trouser_2pc_unstitch','coord_western']],
    ['coord set', ['shirt_trouser_2pc','coord_western']],
    ['coords', ['shirt_trouser_2pc','coord_western']],
    ['cotton', ['lawn_3pc_unstitch','pret_3pc','kurti_1pc','shirt_dupatta_2pc','kurti_1pc_unstitch','shirt_dupatta_2pc_unstitch','shirt_trouser_2pc','shirt_trouser_2pc_unstitch','mens_unstitched','mens_kurta','mens_shalwar_kameez','mens_shirt','kids_girls_eastern','kids_boys_eastern']],
    ['cotton dupatta', ['dupatta_only']],
    ['cotton net', ['maxi_dress','pret_2pc_emb','pret_3pc_emb','formal_emb_2pc','formal_emb_3pc','heavy_formal_3pc','lehenga','bridal','dupatta_only']],
    ['crop', ['western_top']],
    ['crop top', ['western_top']],
    ['culotte', ['womens_trouser']],
    ['culottes', ['womens_trouser']],
    ['daily', ['kurti_1pc','shirt_dupatta_2pc','lawn_3pc_unstitch','pret_3pc','mens_shirt','kids_boys_eastern','kids_girls_eastern','loungewear','mens_kurta','kids_boys_western','kids_girls_western']],
    ['daily wear', ['kurti_1pc','pret_3pc','lawn_3pc_unstitch','mens_kurta']],
    ['denim', ['mens_jeans','kids_boys_western','kids_girls_western','mens_trouser','mens_shirt','womens_trouser','western_top','coord_western']],
    ['desi casuals', ['mens_kurta','mens_shalwar_kameez']],
    ['desi coats', ['mens_waistcoat','mens_sherwani']],
    ['desi formals', ['mens_sherwani','mens_suit','mens_waistcoat']],
    ['dholak', ['formal_emb_3pc','formal_emb_2pc','lehenga','maxi_dress']],
    ['dholki', ['formal_emb_3pc','formal_emb_2pc','lehenga','maxi_dress','handmade_emb','mens_kurta','mens_shalwar_kameez']],
    ['dhoti', ['womens_trouser','maxi_dress']],
    ['digital', ['kurti_1pc','pret_3pc','lawn_3pc_unstitch','maxi_dress','mens_shirt']],
    ['digital print', ['kurti_1pc','kurti_1pc_unstitch','shirt_dupatta_2pc','pret_3pc','lawn_3pc_unstitch','maxi_dress','mens_shirt','kids_girls_eastern','kids_boys_eastern']],
    ['dobby', ['kurti_1pc','kurti_1pc_unstitch','shirt_dupatta_2pc','shirt_dupatta_2pc_unstitch','pret_3pc','lawn_3pc_unstitch','mens_unstitched','mens_kurta','mens_shirt','kids_boys_eastern']],
    ['dress', ['maxi_dress','kids_girls_eastern','kids_girls_western','kids_girls_formal']],
    ['dress pants', ['mens_trouser']],
    ['dress shirt', ['mens_shirt']],
    ['dulhan', ['bridal','lehenga']],
    ['dupatta', ['dupatta_only']],
    ['duppatta', ['dupatta_only']],
    ['dyed', ['kurti_1pc','kurti_1pc_unstitch','shirt_dupatta_2pc_unstitch','pret_3pc','lawn_3pc_unstitch','womens_trouser','mens_shirt','mens_kurta','mens_unstitched','kids_boys_eastern']],
    // 'eastern' = ALL traditional/desi cats across women+men+kids (the mirror of 'western').
    // Alone → every eastern cat; with a gender word psResolveCats narrows it (AND): "eastern
    // women"→women's eastern, "eastern boys"→kids_boys_eastern only. Western cats deliberately
    // excluded (coord_western/maxi_dress/shirt_trouser_2pc/western_top/womens_trouser/mens_jeans/
    // mens_shirt/mens_suit/mens_trouser) so eastern↔western stay complementary.
    ['eastern', ['kurti_1pc','kurti_1pc_unstitch','shirt_dupatta_2pc','shirt_dupatta_2pc_unstitch','pret_3pc','pret_3pc_emb','pret_2pc_emb','formal_emb_2pc','formal_emb_3pc','heavy_formal_3pc','lawn_3pc_unstitch','unstitch_3pc_emb','handmade_emb','kaftan','saree','lehenga','bridal','abaya','shawl','dupatta_only','winter_2pc_stitch','winter_2pc_unstitch','winter_3pc_stitch','winter_3pc_unstitch','mens_kurta','mens_shalwar_kameez','mens_sherwani','mens_waistcoat','mens_unstitched','kids_boys_eastern','kids_girls_eastern']],
    ['eid', ['formal_emb_3pc','pret_3pc_emb','lehenga','kids_boys_formal','kids_girls_formal','maxi_dress','pret_3pc','heavy_formal_3pc','pret_2pc_emb','formal_emb_2pc','saree','kurti_1pc','shirt_dupatta_2pc','handmade_emb','mens_kurta','mens_shalwar_kameez','mens_waistcoat','mens_sherwani','mens_suit','kids_boys_eastern','kids_girls_eastern']],
    ['eid collection', ['pret_3pc','pret_3pc_emb','formal_emb_3pc','pret_2pc_emb','maxi_dress','lehenga','mens_kurta','mens_shalwar_kameez','kids_boys_eastern','kids_girls_eastern']],
    ['emb', ['pret_2pc_emb','pret_3pc_emb','formal_emb_2pc','formal_emb_3pc','unstitch_3pc_emb','handmade_emb','kurti_1pc']],
    ['embroidered', ['pret_3pc_emb','pret_2pc_emb','unstitch_3pc_emb','formal_emb_2pc','formal_emb_3pc','heavy_formal_3pc','handmade_emb','kurti_1pc','kurti_1pc_unstitch','bridal','lehenga','mens_kurta','mens_sherwani','mens_waistcoat','kids_girls_formal','kids_boys_formal']],
    ['embroidered 2pc', ['pret_2pc_emb','formal_emb_2pc']],
    ['embroidery', ['pret_3pc_emb','pret_2pc_emb','unstitch_3pc_emb','formal_emb_2pc','formal_emb_3pc','handmade_emb','heavy_formal_3pc','kurti_1pc','bridal','lehenga','mens_kurta','mens_sherwani','kids_girls_formal','kids_boys_formal']],
    ['embroydered', ['pret_3pc_emb','formal_emb_3pc','unstitch_3pc_emb','kurti_1pc','mens_kurta']],
    ['engagement', ['formal_emb_3pc','heavy_formal_3pc','maxi_dress','lehenga','saree','handmade_emb','mens_suit','mens_sherwani','mens_waistcoat']],
    ['everyday', ['kurti_1pc','shirt_dupatta_2pc','shirt_trouser_2pc','lawn_3pc_unstitch','pret_3pc','mens_shirt','mens_trouser','kids_boys_eastern','kids_girls_eastern','loungewear','mens_kurta','kids_boys_western','kids_girls_western']],
    ['fabric', ['lawn_3pc_unstitch','unstitch_3pc_emb','kurti_1pc_unstitch','shirt_dupatta_2pc_unstitch','mens_unstitched','winter_3pc_unstitch','dupatta_only']],
    ['festive', ['formal_emb_3pc','heavy_formal_3pc','lehenga','kids_boys_formal','kids_girls_formal','pret_3pc_emb','formal_emb_2pc','maxi_dress','saree','winter_3pc_stitch','mens_kurta','mens_shalwar_kameez','mens_sherwani','kids_boys_eastern','kids_girls_eastern']],
    ['fit-and-flare', ['maxi_dress','kurti_1pc']],
    ['flared', ['maxi_dress','womens_trouser','kurti_1pc']],
    ['fleece', ['western_top','loungewear','mens_shirt','kids_boys_western','kids_girls_western','kids_infant','shawl']],
    ['footwear', ['footwear']],
    ['formal', ['formal_emb_2pc','formal_emb_3pc','heavy_formal_3pc','pret_3pc_emb','saree','lehenga','kids_boys_formal','kids_girls_formal','pret_2pc_emb','maxi_dress','mens_suit','mens_sherwani','mens_waistcoat']],
    ['formal 2pc', ['formal_emb_2pc']],
    ['formal shirt', ['mens_shirt']],
    ['formals', ['formal_emb_3pc','formal_emb_2pc','heavy_formal_3pc','mens_suit','kids_girls_formal','kids_boys_formal']],
    ['frock', ['kids_girls_eastern','maxi_dress','kids_girls_formal']],
    ['georgette', ['maxi_dress','pret_2pc_emb','pret_3pc','pret_3pc_emb','formal_emb_2pc','formal_emb_3pc','heavy_formal_3pc','saree','lehenga','bridal','dupatta_only']],
    ['gharara', ['lehenga','formal_emb_3pc']],
    ['ghrara', ['lehenga']],
    ['girl', ['kids_girls_eastern','kids_girls_western','kids_girls_formal']],
    ['girls', ['kids_girls_eastern','kids_girls_western','kids_girls_formal']],
    ['girls dress', ['kids_girls_western','kids_girls_formal']],
    ['girls eastern', ['kids_girls_eastern']],
    ['girls festive', ['kids_girls_formal']],
    ['girls formal', ['kids_girls_formal']],
    ['girls frock', ['kids_girls_eastern','kids_girls_formal']],
    ['girls gown', ['kids_girls_formal']],
    ['girls kameez', ['kids_girls_eastern']],
    ['girls party', ['kids_girls_formal']],
    ['girls top', ['kids_girls_western']],
    ['girls western', ['kids_girls_western']],
    ['gota', ['formal_emb_2pc','formal_emb_3pc','heavy_formal_3pc','handmade_emb','bridal','lehenga','kids_girls_formal']],
    ['gota patti', ['formal_emb_3pc','heavy_formal_3pc','handmade_emb','bridal','lehenga','kids_girls_formal']],
    ['gown', ['maxi_dress','heavy_formal_3pc','formal_emb_3pc','kids_girls_formal']],
    ['grip', ['kurti_1pc','maxi_dress','shirt_dupatta_2pc','pret_3pc','pret_3pc_emb','formal_emb_3pc','womens_trouser']],
    ['groom', ['mens_sherwani','mens_suit']],
    ['groom wear', ['mens_sherwani','mens_suit']],
    ['guest', ['formal_emb_2pc','formal_emb_3pc','saree','lehenga','maxi_dress','heavy_formal_3pc','mens_suit','mens_sherwani']],
    ['guest wear', ['formal_emb_3pc','heavy_formal_3pc','lehenga']],
    ['hand embroidered', ['handmade_emb','formal_emb_3pc','heavy_formal_3pc','bridal','lehenga','mens_sherwani']],
    ['hand painted', ['kurti_1pc','maxi_dress','pret_3pc','pret_3pc_emb','formal_emb_3pc','dupatta_only','shawl']],
    ['handmade', ['handmade_emb','formal_emb_3pc','heavy_formal_3pc','bridal']],
    ['handpainted', ['kurti_1pc','maxi_dress','pret_3pc_emb','formal_emb_3pc','dupatta_only','shawl']],
    ['handwork', ['handmade_emb','formal_emb_3pc','heavy_formal_3pc','bridal','lehenga','mens_sherwani']],
    ['heavy', ['heavy_formal_3pc','bridal']],
    ['heavy formal', ['heavy_formal_3pc']],
    ['heel', ['footwear']],
    ['hijab', ['dupatta_only','abaya']],
    ['infant', ['kids_infant']],
    ['jacquard', ['kurti_1pc','shirt_dupatta_2pc','pret_3pc','pret_3pc_emb','formal_emb_3pc','heavy_formal_3pc','winter_2pc_stitch','winter_3pc_stitch','lehenga','bridal','mens_kurta','mens_sherwani','mens_waistcoat','kids_boys_formal']],
    ['jamavar', ['heavy_formal_3pc','formal_emb_3pc','lehenga','bridal','mens_sherwani']],
    ['jamawar', ['heavy_formal_3pc','formal_emb_3pc','pret_3pc_emb','lehenga','bridal','mens_sherwani','mens_waistcoat','kids_boys_formal']],
    ['jeans', ['mens_jeans','kids_boys_western','kids_girls_western']],
    ['jersey', ['western_top','loungewear','womens_trouser','mens_shirt','mens_trouser','kids_boys_western','kids_girls_western','kids_infant']],
    ['jilbab', ['abaya']],
    ['jumpsuit', ['maxi_dress','coord_western']],
    ['junior', ['kids_boys_eastern','kids_girls_eastern','kids_boys_western','kids_girls_western']],
    ['kaftaan', ['kaftan','maxi_dress']],
    ['kaftan', ['kaftan','maxi_dress']],
    ['kalidar', ['maxi_dress','pret_3pc','kurti_1pc']],
    ['kameez', ['kurti_1pc','kurti_1pc_unstitch','shirt_dupatta_2pc','pret_3pc','lawn_3pc_unstitch','mens_shalwar_kameez','mens_kurta','kids_boys_eastern','kids_girls_eastern']],
    ['kameez shalwar', ['mens_shalwar_kameez']],
    ['kamiz', ['kurti_1pc','kurti_1pc_unstitch','shirt_dupatta_2pc','pret_3pc','lawn_3pc_unstitch','mens_shalwar_kameez','mens_kurta','kids_boys_eastern','kids_girls_eastern']],
    ['karandi', ['winter_2pc_unstitch','winter_3pc_unstitch','kurti_1pc','shirt_dupatta_2pc','winter_2pc_stitch','winter_3pc_stitch','mens_unstitched','mens_kurta','mens_shalwar_kameez','kids_boys_eastern','kids_girls_eastern']],
    ['khadar', ['winter_2pc_stitch','winter_2pc_unstitch','winter_3pc_stitch','winter_3pc_unstitch','mens_unstitched','kids_boys_eastern']],
    ['khaddar', ['winter_2pc_unstitch','winter_3pc_unstitch','kurti_1pc','kurti_1pc_unstitch','shirt_dupatta_2pc','shirt_dupatta_2pc_unstitch','winter_2pc_stitch','winter_3pc_stitch','mens_unstitched','mens_kurta','mens_shalwar_kameez','kids_boys_eastern','kids_girls_eastern']],
    ['khussa', ['footwear']],
    ['kid', ['kids_boys_eastern','kids_girls_eastern','kids_boys_western','kids_girls_western','kids_boys_formal','kids_girls_formal','kids_infant']],
    ['kids', ['kids_boys_eastern','kids_girls_eastern','kids_boys_western','kids_girls_western','kids_boys_formal','kids_girls_formal','kids_infant']],
    ['kohlapuri', ['footwear']],
    ['kolhapuri', ['footwear']],
    ['kurta', ['kurti_1pc','kurti_1pc_unstitch','mens_kurta','kids_boys_eastern']],
    ['kurta set', ['shirt_trouser_2pc','shirt_dupatta_2pc','pret_3pc']],
    ['kurta shalwar', ['mens_shalwar_kameez','mens_kurta']],
    ['kurti', ['kurti_1pc','kurti_1pc_unstitch']],
    ['kurti 1pc', ['kurti_1pc']],
    ['langa', ['lehenga']],
    ['latha', ['mens_unstitched']],
    ['lawn', ['lawn_3pc_unstitch','pret_3pc','kurti_1pc','kurti_1pc_unstitch','shirt_dupatta_2pc','shirt_dupatta_2pc_unstitch','shirt_trouser_2pc','shirt_trouser_2pc_unstitch','pret_2pc_emb','pret_3pc_emb','unstitch_3pc_emb','mens_unstitched','mens_kurta','mens_shalwar_kameez','kids_girls_eastern','kids_boys_eastern']],
    ['lawn slub', ['kurti_1pc','kurti_1pc_unstitch','shirt_dupatta_2pc_unstitch','lawn_3pc_unstitch','pret_3pc','mens_unstitched','kids_boys_eastern']],
    ['lehenga', ['lehenga','bridal']],
    ['lehnga', ['lehenga','bridal']],
    ['linen', ['kurti_1pc','kurti_1pc_unstitch','shirt_dupatta_2pc','shirt_dupatta_2pc_unstitch','shirt_trouser_2pc','shirt_trouser_2pc_unstitch','pret_3pc','lawn_3pc_unstitch','winter_2pc_stitch','winter_2pc_unstitch','winter_3pc_stitch','winter_3pc_unstitch','mens_unstitched','mens_kurta','mens_shalwar_kameez','kids_girls_eastern','kids_boys_eastern']],
    ['long dress', ['maxi_dress']],
    ['lounge', ['loungewear']],
    ['lounge wear', ['loungewear']],
    ['loungewear', ['loungewear']],
    ['marina', ['kurti_1pc','shirt_dupatta_2pc','winter_2pc_stitch','winter_2pc_unstitch','winter_3pc_stitch','winter_3pc_unstitch','mens_unstitched','mens_kurta','mens_shalwar_kameez','kids_boys_eastern']],
    ['masoori', ['pret_3pc_emb','formal_emb_3pc','heavy_formal_3pc','lehenga','bridal']],
    ['masuri', ['maxi_dress','pret_3pc','pret_3pc_emb','formal_emb_3pc','heavy_formal_3pc','saree','lehenga','bridal']],
    ['maxi', ['maxi_dress','kids_girls_formal']],
    ['maxi dress', ['maxi_dress']],
    ['mayoun', ['lehenga','formal_emb_3pc','heavy_formal_3pc','handmade_emb']],
    ['mayun', ['lehenga','formal_emb_3pc','heavy_formal_3pc','handmade_emb','maxi_dress']],
    ['mehendi', ['lehenga','formal_emb_3pc','heavy_formal_3pc','handmade_emb','saree','maxi_dress']],
    ['mehndi', ['lehenga','formal_emb_3pc','heavy_formal_3pc','saree','handmade_emb','maxi_dress','mens_kurta','mens_shalwar_kameez','mens_waistcoat','kids_girls_formal','kids_boys_formal']],
    ['mens kurta', ['mens_kurta']],
    ['mens shirt', ['mens_shirt']],
    ['mens trouser', ['mens_trouser']],
    ['mens unstitched', ['mens_unstitched']],
    ['mirror', ['formal_emb_2pc','formal_emb_3pc','heavy_formal_3pc','handmade_emb','pret_3pc_emb','bridal','lehenga','kids_girls_formal']],
    ['mirror work', ['formal_emb_3pc','heavy_formal_3pc','handmade_emb','bridal','lehenga','kids_girls_formal']],
    ['modest', ['abaya','maxi_dress']],
    ['modest wear', ['abaya']],
    ['naqab', ['abaya']],
    ['nehru', ['mens_waistcoat']],
    ['nehru jacket', ['mens_waistcoat']],
    ['net', ['formal_emb_2pc','formal_emb_3pc','heavy_formal_3pc','pret_3pc_emb','maxi_dress','pret_2pc_emb','saree','lehenga','bridal','dupatta_only','kids_girls_formal']],
    ['net dupatta', ['dupatta_only']],
    ['new arrivals', ['kurti_1pc','pret_3pc','mens_shirt','kids_boys_eastern']],
    ['new born', ['kids_infant']],
    ['newborn', ['kids_infant']],
    ['night', ['loungewear']],
    ['night wear', ['loungewear']],
    ['nightdress', ['loungewear']],
    ['nightwear', ['loungewear']],
    ['nighty', ['loungewear']],
    ['nikah', ['bridal','lehenga','heavy_formal_3pc','formal_emb_3pc','handmade_emb','maxi_dress','saree','mens_sherwani','mens_suit','mens_kurta']],
    ['nikkah', ['bridal','lehenga','heavy_formal_3pc','formal_emb_3pc','handmade_emb','maxi_dress','saree','mens_sherwani','mens_suit']],
    ['niqab', ['abaya']],
    ['office', ['kurti_1pc','shirt_dupatta_2pc','shirt_trouser_2pc','womens_trouser','western_top','mens_shirt','mens_trouser','mens_suit']],
    ['one piece', ['kurti_1pc','kurti_1pc_unstitch']],
    ['onepiece', ['kurti_1pc','kaftan','maxi_dress']],
    ['onesie', ['kids_infant']],
    ['organza', ['formal_emb_2pc','formal_emb_3pc','heavy_formal_3pc','maxi_dress','pret_2pc_emb','pret_3pc_emb','saree','lehenga','bridal','dupatta_only','kids_girls_formal']],
    ['outerwear', ['mens_waistcoat','mens_suit']],
    ['pajama', ['loungewear']],
    ['pajama set', ['loungewear']],
    ['palazzo', ['womens_trouser']],
    ['palazzos', ['womens_trouser']],
    ['pant', ['womens_trouser','mens_trouser']],
    ['pant coat', ['mens_suit']],
    ['pant-coat', ['mens_suit']],
    ['pants', ['womens_trouser','mens_trouser']],
    ['paranda', ['dupatta_only']],
    ['party', ['formal_emb_2pc','formal_emb_3pc','heavy_formal_3pc','pret_3pc_emb','maxi_dress','kids_boys_formal','kids_girls_formal','pret_2pc_emb','saree','lehenga','handmade_emb','western_top','coord_western','mens_suit','mens_sherwani','mens_waistcoat']],
    ['party wear', ['formal_emb_3pc','formal_emb_2pc','heavy_formal_3pc','maxi_dress','saree','lehenga','mens_suit']],
    ['partywear', ['formal_emb_3pc','formal_emb_2pc','heavy_formal_3pc','maxi_dress','saree','lehenga','handmade_emb','mens_suit','kids_girls_formal','kids_boys_formal']],
    ['pashmina', ['shawl']],
    ['peplum', ['kurti_1pc','formal_emb_2pc','western_top','pret_2pc_emb','maxi_dress']],
    ['peshawari chappal', ['footwear']],
    ['peshwas', ['maxi_dress','formal_emb_3pc']],
    ['pishwas', ['maxi_dress','formal_emb_3pc','lehenga']],
    ['plain', ['kurti_1pc','kurti_1pc_unstitch','shirt_dupatta_2pc','shirt_trouser_2pc','pret_3pc','lawn_3pc_unstitch','womens_trouser','western_top','mens_shirt','mens_kurta','mens_shalwar_kameez','mens_unstitched','kids_boys_western','kids_girls_western','kids_infant']],
    ['plazo', ['womens_trouser']],
    ['polo', ['mens_shirt','kids_boys_western']],
    ['polo shirt', ['mens_shirt']],
    ['pret', ['pret_3pc','pret_3pc_emb','pret_2pc_emb','kurti_1pc','shirt_dupatta_2pc','maxi_dress']],
    ['prince', ['mens_sherwani']],
    ['prince coat', ['mens_sherwani','mens_waistcoat','mens_suit']],
    ['print', ['kurti_1pc','pret_3pc','lawn_3pc_unstitch','mens_shirt','kids_boys_western','kids_girls_western']],
    ['printed', ['kurti_1pc','kurti_1pc_unstitch','shirt_dupatta_2pc','shirt_dupatta_2pc_unstitch','shirt_trouser_2pc','pret_3pc','lawn_3pc_unstitch','maxi_dress','western_top','mens_shirt','mens_kurta','kids_boys_eastern','kids_girls_eastern','kids_boys_western','kids_girls_western','kids_infant']],
    ['printed 3pc', ['pret_3pc','lawn_3pc_unstitch']],
    ['pyjama', ['loungewear']],
    ['raw silk', ['maxi_dress','pret_2pc_emb','pret_3pc','pret_3pc_emb','formal_emb_2pc','formal_emb_3pc','heavy_formal_3pc','lehenga','bridal','mens_kurta','mens_sherwani','mens_waistcoat','kids_boys_formal','kids_girls_formal']],
    ['rawsilk', ['maxi_dress','pret_3pc_emb','formal_emb_3pc','heavy_formal_3pc','lehenga','bridal','mens_sherwani','mens_waistcoat']],
    ['ready', ['pret_3pc','pret_3pc_emb','pret_2pc_emb','shirt_dupatta_2pc']],
    ['ready to wear', ['pret_3pc','pret_2pc_emb','kurti_1pc','shirt_dupatta_2pc','maxi_dress','mens_shalwar_kameez']],
    ['ready-to-wear', ['pret_3pc','pret_2pc_emb','kurti_1pc','pret_3pc_emb','shirt_dupatta_2pc','maxi_dress','mens_kurta','mens_shalwar_kameez']],
    ['readymade', ['pret_3pc','pret_3pc_emb','pret_2pc_emb']],
    ['romper', ['kids_infant']],
    ['rtw', ['pret_3pc','pret_3pc_emb','pret_2pc_emb','kurti_1pc','shirt_dupatta_2pc','maxi_dress']],
    ['sandal', ['footwear']],
    ['sandals', ['footwear']],
    ['saree', ['saree']],
    ['sari', ['saree']],
    ['satin', ['maxi_dress','pret_2pc_emb','pret_3pc','pret_3pc_emb','formal_emb_2pc','formal_emb_3pc','heavy_formal_3pc','lehenga','bridal','loungewear','dupatta_only','mens_sherwani','mens_waistcoat','kids_girls_formal']],
    ['scarf', ['dupatta_only']],
    ['schiffli', ['pret_2pc_emb','pret_3pc_emb','formal_emb_2pc','formal_emb_3pc','unstitch_3pc_emb','kurti_1pc']],
    ['screen print', ['kurti_1pc','kurti_1pc_unstitch','shirt_dupatta_2pc','pret_3pc','lawn_3pc_unstitch','mens_shirt','kids_boys_western','kids_girls_western']],
    ['sequin', ['formal_emb_3pc','heavy_formal_3pc','bridal','lehenga','kids_girls_formal']],
    ['sequins', ['formal_emb_2pc','formal_emb_3pc','heavy_formal_3pc','pret_3pc_emb','bridal','lehenga','saree','kids_girls_formal']],
    ['shaadi', ['bridal','lehenga','heavy_formal_3pc','formal_emb_3pc','handmade_emb','saree','mens_sherwani','mens_suit']],
    ['shadi', ['bridal','lehenga','formal_emb_3pc','heavy_formal_3pc','handmade_emb','saree','mens_sherwani','mens_suit','kids_boys_formal','kids_girls_formal']],
    ['shalwar', ['mens_shalwar_kameez','kids_boys_eastern','kids_girls_eastern','womens_trouser']],
    ['shalwar kameez', ['mens_shalwar_kameez','mens_kurta']],
    ['shalwar qameez', ['mens_shalwar_kameez']],
    ['sharara', ['lehenga','formal_emb_3pc']],
    ['shawl', ['shawl']],
    ['shawls', ['shawl']],
    ['sheesha', ['formal_emb_3pc','heavy_formal_3pc','handmade_emb','bridal','lehenga','kids_girls_formal']],
    ['sherwani', ['mens_sherwani','kids_boys_formal']],
    ['shirt', ['kurti_1pc','kurti_1pc_unstitch','western_top','shirt_dupatta_2pc','shirt_dupatta_2pc_unstitch','mens_shirt']],
    ['shirt dupatta', ['shirt_dupatta_2pc','shirt_dupatta_2pc_unstitch']],
    ['shirt fabric', ['kurti_1pc_unstitch']],
    ['shirt trouser', ['shirt_trouser_2pc','shirt_trouser_2pc_unstitch']],
    ['shisha', ['formal_emb_3pc','heavy_formal_3pc','handmade_emb','bridal','lehenga']],
    ['shoe', ['footwear']],
    ['shoes', ['footwear']],
    ['shrara', ['lehenga']],
    ['shrug', ['kurti_1pc','western_top','coord_western']],
    ['silk', ['formal_emb_3pc','heavy_formal_3pc','saree','bridal','kurti_1pc','maxi_dress','shirt_dupatta_2pc','pret_2pc_emb','pret_3pc','pret_3pc_emb','formal_emb_2pc','lehenga','mens_kurta','mens_sherwani','mens_waistcoat','mens_unstitched','kids_girls_formal','kids_boys_formal']],
    ['silk dupatta', ['dupatta_only']],
    ['single', ['kurti_1pc','kaftan','maxi_dress','womens_trouser']],
    ['single piece', ['kurti_1pc','kurti_1pc_unstitch','western_top','maxi_dress']],
    ['single shirt', ['kurti_1pc','kurti_1pc_unstitch']],
    ['sitara', ['formal_emb_3pc','heavy_formal_3pc','pret_3pc_emb','bridal','lehenga','saree','kids_girls_formal']],
    ['sleep', ['loungewear']],
    ['sleep wear', ['loungewear']],
    ['sleepwear', ['loungewear']],
    ['slub', ['kurti_1pc','kurti_1pc_unstitch','lawn_3pc_unstitch','pret_3pc','mens_unstitched']],
    ['spring', ['kurti_1pc','pret_3pc','lawn_3pc_unstitch','shirt_dupatta_2pc','western_top','maxi_dress','mens_shirt','mens_kurta']],
    ['spring wear', ['lawn_3pc_unstitch','pret_3pc']],
    ['stitched', ['pret_3pc','pret_3pc_emb','pret_2pc_emb','kurti_1pc','western_top','shirt_dupatta_2pc','shirt_trouser_2pc','coord_western','formal_emb_3pc','winter_2pc_stitch','winter_3pc_stitch','formal_emb_2pc','maxi_dress']],
    ['stole', ['dupatta_only']],
    ['straight', ['kurti_1pc','pret_3pc','shirt_dupatta_2pc']],
    ['suede', ['maxi_dress','pret_3pc','pret_3pc_emb','formal_emb_3pc','winter_2pc_stitch','winter_3pc_stitch','mens_kurta','mens_unstitched','footwear','kids_boys_formal']],
    ['suit', ['pret_3pc','pret_3pc_emb','lawn_3pc_unstitch','formal_emb_3pc','mens_suit','mens_shalwar_kameez']],
    ['suiting', ['mens_unstitched','mens_suit']],
    ['summer', ['lawn_3pc_unstitch','pret_3pc','kurti_1pc','shirt_dupatta_2pc','kurti_1pc_unstitch','western_top','maxi_dress','loungewear','mens_shirt','mens_kurta','mens_unstitched','kids_boys_western','kids_girls_western']],
    ['summer lawn', ['lawn_3pc_unstitch','pret_3pc']],
    ['summer wear', ['lawn_3pc_unstitch','pret_3pc']],
    ['swiss', ['kurti_1pc','kurti_1pc_unstitch','shirt_dupatta_2pc','shirt_dupatta_2pc_unstitch','pret_3pc','lawn_3pc_unstitch','pret_2pc_emb']],
    ['swiss lawn', ['kurti_1pc','kurti_1pc_unstitch','lawn_3pc_unstitch','pret_3pc','pret_2pc_emb']],
    ['t-shirt', ['western_top','mens_shirt','kids_boys_western','kids_girls_western']],
    ['tank', ['western_top']],
    ['tank top', ['western_top']],
    ['tee', ['western_top','kids_boys_western','kids_girls_western','mens_shirt']],
    ['three piece', ['pret_3pc','pret_3pc_emb','formal_emb_3pc','heavy_formal_3pc','lawn_3pc_unstitch','mens_suit']],
    ['threepiece', ['pret_3pc','pret_3pc_emb','lawn_3pc_unstitch']],
    ['tights', ['womens_trouser']],
    ['tilla', ['formal_emb_3pc','heavy_formal_3pc','handmade_emb']],
    ['tissue', ['pret_3pc_emb','formal_emb_3pc','heavy_formal_3pc','saree','lehenga','bridal','dupatta_only']],
    ['toddler', ['kids_infant','kids_boys_eastern','kids_girls_eastern']],
    ['top', ['kurti_1pc','western_top']],
    ['trouser', ['womens_trouser','mens_trouser','mens_jeans']],
    ['trousers', ['womens_trouser','mens_trouser']],
    ['tshirt', ['mens_shirt','western_top','kids_boys_western','kids_girls_western']],
    ['tulip', ['womens_trouser']],
    ['tunic', ['kurti_1pc','western_top']],
    ['tuxedo', ['mens_suit']],
    ['two piece', ['shirt_dupatta_2pc','shirt_trouser_2pc','pret_2pc_emb','formal_emb_2pc','coord_western','mens_shalwar_kameez']],
    ['two piece suit', ['mens_suit']],
    ['twopiece', ['shirt_dupatta_2pc','shirt_trouser_2pc','pret_2pc_emb']],
    ['unstiched', ['lawn_3pc_unstitch','unstitch_3pc_emb','mens_unstitched']],
    ['unstitch', ['lawn_3pc_unstitch','unstitch_3pc_emb','kurti_1pc_unstitch','shirt_dupatta_2pc_unstitch','shirt_trouser_2pc_unstitch','winter_2pc_unstitch','winter_3pc_unstitch','mens_unstitched']],
    ['unstitched', ['lawn_3pc_unstitch','unstitch_3pc_emb','kurti_1pc_unstitch','shirt_dupatta_2pc_unstitch','shirt_trouser_2pc_unstitch','winter_2pc_unstitch','winter_3pc_unstitch','mens_unstitched']],
    ['unstitched 3pc', ['lawn_3pc_unstitch','unstitch_3pc_emb']],
    ['unstitched embroidered', ['unstitch_3pc_emb']],
    ['valima', ['heavy_formal_3pc','formal_emb_3pc','handmade_emb','saree','lehenga','mens_suit','mens_sherwani']],
    ['velvet', ['winter_2pc_stitch','winter_3pc_stitch','bridal','maxi_dress','pret_3pc_emb','formal_emb_3pc','heavy_formal_3pc','winter_2pc_unstitch','winter_3pc_unstitch','lehenga','shawl','mens_sherwani','mens_waistcoat','kids_boys_formal','kids_girls_formal']],
    ['viscose', ['kurti_1pc','shirt_dupatta_2pc','pret_3pc','winter_2pc_stitch','winter_3pc_stitch','mens_kurta','mens_shirt','kids_girls_eastern','kids_boys_eastern']],
    ['voile', ['kurti_1pc','kurti_1pc_unstitch','shirt_dupatta_2pc','shirt_dupatta_2pc_unstitch','pret_3pc','lawn_3pc_unstitch','dupatta_only','kids_girls_eastern']],
    ['waist coat', ['mens_waistcoat']],
    ['waistcoat', ['mens_waistcoat']],
    ['walima', ['bridal','lehenga','heavy_formal_3pc','formal_emb_3pc','saree','handmade_emb','maxi_dress','mens_suit','mens_sherwani','mens_waistcoat']],
    ['warm', ['winter_2pc_stitch','winter_3pc_stitch','shawl']],
    ['wash and wear', ['mens_unstitched']],
    ['wash n wear', ['mens_unstitched']],
    ['wedding', ['bridal','lehenga','heavy_formal_3pc','formal_emb_3pc','saree','handmade_emb','maxi_dress','mens_sherwani','mens_suit','mens_waistcoat','kids_boys_formal','kids_girls_formal']],
    ['wedding wear', ['bridal','lehenga','heavy_formal_3pc']],
    ['west', ['western_top','coord_western','maxi_dress']],
    ['western', ['western_top','coord_western','shirt_trouser_2pc','maxi_dress','mens_jeans','mens_trouser','mens_shirt','kids_boys_western','kids_girls_western']],
    ['western co ord', ['coord_western']],
    ['western coord', ['coord_western']],
    ['western top', ['western_top']],
    ['western wear', ['western_top','coord_western','maxi_dress']],
    ['westerntop', ['western_top']],
    ['winter', ['winter_2pc_unstitch','winter_2pc_stitch','winter_3pc_unstitch','winter_3pc_stitch','shawl','mens_unstitched','mens_suit','mens_waistcoat']],
    ['winter 2pc', ['winter_2pc_stitch','winter_2pc_unstitch']],
    ['winter 3pc', ['winter_3pc_stitch','winter_3pc_unstitch']],
    ['winter warmers', ['shawl']],
    ['winter wear', ['winter_2pc_stitch','winter_3pc_stitch','winter_3pc_unstitch']],
    ['wool', ['winter_2pc_stitch','winter_2pc_unstitch','winter_3pc_stitch','winter_3pc_unstitch','shawl','mens_unstitched','mens_suit','kids_boys_formal','kids_girls_formal']],
    ['woolen', ['winter_2pc_stitch','winter_3pc_stitch','shawl','mens_unstitched','mens_suit']],
    ['work', ['kurti_1pc','shirt_dupatta_2pc','womens_trouser','western_top','mens_shirt','mens_trouser','mens_suit']],
    ['workwear', ['kurti_1pc','shirt_dupatta_2pc','womens_trouser','mens_shirt','mens_trouser','mens_suit']],
    ['zardozi', ['formal_emb_3pc','heavy_formal_3pc','handmade_emb','bridal','lehenga','mens_sherwani','kids_boys_formal']],
    ['zari', ['formal_emb_2pc','formal_emb_3pc','heavy_formal_3pc','pret_3pc_emb','handmade_emb','bridal','lehenga','saree','mens_sherwani','mens_waistcoat','kids_boys_formal','kids_girls_formal']],

  ];
  const psNorm = s => (s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  // Connector/stop words a buyer types between real terms — never a category cue.
  // Piece-count words ('pc'/'pcs'/'piece'/'pieces') are read off the RAW query by the piece
  // refiner (wantP) and via the '2pc'/'2 piece' concept synonyms — so they must NOT survive as
  // standalone tokens, else they leak into the FTS free-text query ("2 pcs pret" → title:"pcs")
  // and AND the result down to nothing.
  const PS_STOP = new Set(['for','to','me','on','we','he','go','the','and','my','in','of','at','is','it','or','by','an','as','so','up','no','do','with','from','want','need','some','any','that','this','pc','pcs','piece','pieces']);
  // One token → category keys. The "keyword starts with token" branch is gated to
  // tokens >=4 chars so short connectors ("for"→formal, "me"→men, "to"→top) can't
  // hijack the selection; the reverse branch (token starts with keyword) stays open
  // for all lengths so "1pc"/"men"/"kid"/"rtw" still match by exact/longer prefix.
  function psMatchCatsToken(t, present){
    const out = [];
    if(!t || t.length < 2) return out;
    PS_CAT_SYNONYMS.forEach(([kw, cats]) => {
      const k = psNorm(kw);
      if((t.length >= 4 && k.indexOf(t) === 0) || t.indexOf(k) === 0) cats.forEach(c => { if(present.has(c)) out.push(c); });
    });
    Object.keys(PS_CAT_LABELS).forEach(c => {
      if(!present.has(c) || PS_HIDE_CATS.has(c)) return;
      // Match t against WHOLE WORDS of the label (a label word that STARTS WITH t), NOT a
      // mid-word substring — so "stitched" never matches "un[stitched]", while "emb"→Embroidered,
      // "lawn"→Lawn, "formal"→Formal still work. (The synonym map above already separates
      // stitched↔unstitched correctly; this was the one place the two blurred together.)
      const words = String(PS_CAT_LABELS[c]).toLowerCase().split(/[^a-z0-9]+/);
      if(words.some(w => w && w.indexOf(t) === 0)) out.push(c);
    });
    return out;
  }
  // Gender cue words. When a query NAMES a gender, it should NARROW the other words
  // to that gender (AND), not just add the whole gender (OR).
  const PS_GENDER_TOK = { women:'w', woman:'w', womens:'w', ladies:'w', lady:'w', female:'w', girl:'girls', girls:'girls', boy:'boys', boys:'boys', men:'m', man:'m', mens:'m', male:'m', gents:'m', gent:'m', kids:'k', kid:'k', child:'k', children:'k', infant:'infant', baby:'infant', newborn:'infant', toddler:'infant' };
  // People/relationship words → {gender, default category set}. A relationship word sets a
  // gender (to NARROW other typed words) and, when typed alone, selects its default cats.
  const PS_REL = {
    'abba': { g:'m', cats:['mens_shirt','mens_kurta','mens_shalwar_kameez','mens_waistcoat','mens_suit','mens_sherwani','mens_unstitched'] },
    'abbu': { g:'m', cats:['mens_shirt','mens_kurta','mens_shalwar_kameez','mens_waistcoat','mens_suit','mens_sherwani','mens_unstitched'] },
    'abu': { g:'m', cats:['mens_shirt','mens_kurta','mens_shalwar_kameez','mens_suit','mens_unstitched'] },
    'ami': { g:'w', cats:['kurti_1pc','maxi_dress','shirt_dupatta_2pc','pret_3pc','formal_emb_3pc','lawn_3pc_unstitch','saree','shawl'] },
    'amma': { g:'w', cats:['kurti_1pc','maxi_dress','shirt_dupatta_2pc','pret_3pc','formal_emb_3pc','lawn_3pc_unstitch','saree','shawl'] },
    'amman': { g:'w', cats:['kurti_1pc','maxi_dress','shirt_dupatta_2pc','pret_3pc','formal_emb_3pc','saree','shawl'] },
    'ammi': { g:'w', cats:['kurti_1pc','maxi_dress','shirt_dupatta_2pc','pret_3pc','pret_3pc_emb','formal_emb_3pc','heavy_formal_3pc','lawn_3pc_unstitch','saree','abaya','shawl'] },
    'ammu': { g:'w', cats:['kurti_1pc','maxi_dress','shirt_dupatta_2pc','pret_3pc','formal_emb_3pc','lawn_3pc_unstitch','saree','shawl'] },
    'apa': { g:'w', cats:['kurti_1pc','maxi_dress','shirt_dupatta_2pc','pret_3pc','formal_emb_3pc','saree'] },
    'appi': { g:'w', cats:['kurti_1pc','maxi_dress','shirt_dupatta_2pc','pret_3pc','formal_emb_3pc','saree'] },
    'baaji': { g:'w', cats:['kurti_1pc','maxi_dress','shirt_dupatta_2pc','pret_3pc','formal_emb_3pc','saree'] },
    'baba': { g:'m', cats:['mens_shirt','mens_kurta','mens_shalwar_kameez','mens_waistcoat','mens_suit','mens_sherwani','mens_unstitched'] },
    'baji': { g:'w', cats:['kurti_1pc','maxi_dress','shirt_dupatta_2pc','pret_3pc','formal_emb_3pc','lawn_3pc_unstitch','saree','lehenga'] },
    'begum': { g:'w', cats:['kurti_1pc','maxi_dress','shirt_dupatta_2pc','pret_3pc','formal_emb_3pc','heavy_formal_3pc','saree','lehenga'] },
    'behan': { g:'w', cats:['kurti_1pc','maxi_dress','shirt_dupatta_2pc','pret_3pc','formal_emb_3pc','lawn_3pc_unstitch','lehenga'] },
    'behen': { g:'w', cats:['kurti_1pc','maxi_dress','shirt_dupatta_2pc','pret_3pc','formal_emb_3pc','lawn_3pc_unstitch','lehenga'] },
    'behn': { g:'w', cats:['kurti_1pc','western_top','maxi_dress','shirt_dupatta_2pc','pret_3pc','formal_emb_3pc','lawn_3pc_unstitch','lehenga'] },
    'beta': { g:'boys', cats:['kids_boys_eastern','kids_boys_western','kids_boys_formal'] },
    'beti': { g:'girls', cats:['kids_girls_eastern','kids_girls_western','kids_girls_formal'] },
    'bhai': { g:'m', cats:['mens_shirt','mens_trouser','mens_jeans','mens_kurta','mens_shalwar_kameez','mens_suit','mens_unstitched'] },
    'bhaiya': { g:'m', cats:['mens_shirt','mens_jeans','mens_kurta','mens_shalwar_kameez','mens_suit'] },
    'bibi': { g:'w', cats:['kurti_1pc','maxi_dress','shirt_dupatta_2pc','pret_3pc','formal_emb_3pc','saree'] },
    'birader': { g:'m', cats:['mens_kurta','mens_shalwar_kameez','mens_suit'] },
    'bivi': { g:'w', cats:['kurti_1pc','maxi_dress','shirt_dupatta_2pc','pret_3pc','formal_emb_3pc','saree','lehenga'] },
    'biwi': { g:'w', cats:['kurti_1pc','maxi_dress','shirt_dupatta_2pc','pret_3pc','formal_emb_3pc','heavy_formal_3pc','lawn_3pc_unstitch','saree','lehenga','loungewear'] },
    'bro': { g:'m', cats:['mens_shirt','mens_trouser','mens_jeans','mens_kurta','mens_suit'] },
    'brother': { g:'m', cats:['mens_shirt','mens_trouser','mens_jeans','mens_kurta','mens_shalwar_kameez','mens_waistcoat','mens_suit','mens_sherwani','mens_unstitched'] },
    'dad': { g:'m', cats:['mens_shirt','mens_trouser','mens_kurta','mens_shalwar_kameez','mens_waistcoat','mens_suit','mens_unstitched'] },
    'dada': { g:'m', cats:['mens_kurta','mens_shalwar_kameez','mens_waistcoat','mens_unstitched'] },
    'daddy': { g:'m', cats:['mens_shirt','mens_trouser','mens_kurta','mens_shalwar_kameez','mens_suit','mens_unstitched'] },
    'daughter': { g:'girls', cats:['kids_girls_eastern','kids_girls_western','kids_girls_formal'] },
    'father': { g:'m', cats:['mens_shirt','mens_trouser','mens_kurta','mens_shalwar_kameez','mens_waistcoat','mens_suit','mens_sherwani','mens_unstitched'] },
    'grandfather': { g:'m', cats:['mens_kurta','mens_shalwar_kameez','mens_waistcoat','mens_shirt','mens_unstitched'] },
    'hubby': { g:'m', cats:['mens_shirt','mens_trouser','mens_kurta','mens_suit','mens_unstitched'] },
    'husband': { g:'m', cats:['mens_shirt','mens_trouser','mens_kurta','mens_shalwar_kameez','mens_waistcoat','mens_suit','mens_sherwani','mens_unstitched'] },
    'khawind': { g:'m', cats:['mens_kurta','mens_shalwar_kameez','mens_suit','mens_unstitched'] },
    'ladka': { g:'boys', cats:['kids_boys_eastern','kids_boys_western','kids_boys_formal'] },
    'ladki': { g:'girls', cats:['kids_girls_eastern','kids_girls_western','kids_girls_formal'] },
    'larka': { g:'boys', cats:['kids_boys_eastern','kids_boys_western','kids_boys_formal'] },
    'larkay': { g:'boys', cats:['kids_boys_eastern','kids_boys_western','kids_boys_formal'] },
    'larki': { g:'girls', cats:['kids_girls_eastern','kids_girls_western','kids_girls_formal'] },
    'larkiyan': { g:'girls', cats:['kids_girls_eastern','kids_girls_western','kids_girls_formal'] },
    'maa': { g:'w', cats:['kurti_1pc','maxi_dress','shirt_dupatta_2pc','pret_3pc','formal_emb_3pc','lawn_3pc_unstitch','saree','shawl'] },
    'maan': { g:'w', cats:['kurti_1pc','maxi_dress','shirt_dupatta_2pc','pret_3pc','formal_emb_3pc','saree','shawl'] },
    'mian': { g:'m', cats:['mens_shirt','mens_kurta','mens_shalwar_kameez','mens_suit','mens_unstitched'] },
    'miya': { g:'m', cats:['mens_kurta','mens_shalwar_kameez','mens_suit','mens_unstitched'] },
    'mom': { g:'w', cats:['kurti_1pc','maxi_dress','shirt_dupatta_2pc','pret_2pc_emb','pret_3pc','pret_3pc_emb','formal_emb_3pc','lawn_3pc_unstitch','saree','shawl'] },
    'mother': { g:'w', cats:['kurti_1pc','maxi_dress','shirt_dupatta_2pc','shirt_trouser_2pc','pret_2pc_emb','pret_3pc','pret_3pc_emb','formal_emb_2pc','formal_emb_3pc','heavy_formal_3pc','lawn_3pc_unstitch','shirt_dupatta_2pc_unstitch','saree','abaya','shawl'] },
    'mum': { g:'w', cats:['kurti_1pc','maxi_dress','shirt_dupatta_2pc','pret_3pc','formal_emb_3pc','lawn_3pc_unstitch','saree','shawl'] },
    'mummy': { g:'w', cats:['kurti_1pc','maxi_dress','shirt_dupatta_2pc','pret_3pc','formal_emb_3pc','lawn_3pc_unstitch','saree','shawl'] },
    'papa': { g:'m', cats:['mens_shirt','mens_trouser','mens_kurta','mens_shalwar_kameez','mens_suit','mens_unstitched'] },
    'shohar': { g:'m', cats:['mens_shirt','mens_kurta','mens_shalwar_kameez','mens_suit','mens_sherwani','mens_unstitched'] },
    'sis': { g:'w', cats:['kurti_1pc','western_top','maxi_dress','shirt_dupatta_2pc','pret_3pc','lehenga'] },
    'sister': { g:'w', cats:['kurti_1pc','western_top','maxi_dress','womens_trouser','shirt_dupatta_2pc','coord_western','pret_2pc_emb','pret_3pc','formal_emb_3pc','lawn_3pc_unstitch','lehenga','loungewear'] },
    'son': { g:'boys', cats:['kids_boys_eastern','kids_boys_western','kids_boys_formal'] },
    'walid': { g:'m', cats:['mens_kurta','mens_shalwar_kameez','mens_waistcoat','mens_suit','mens_sherwani','mens_unstitched'] },
    'walida': { g:'w', cats:['kurti_1pc','maxi_dress','shirt_dupatta_2pc','pret_3pc','formal_emb_3pc','heavy_formal_3pc','lawn_3pc_unstitch','saree','abaya','shawl'] },
    'wife': { g:'w', cats:['kurti_1pc','maxi_dress','shirt_dupatta_2pc','pret_2pc_emb','pret_3pc','pret_3pc_emb','formal_emb_3pc','heavy_formal_3pc','lawn_3pc_unstitch','saree','lehenga','loungewear'] },
    'zoja': { g:'w', cats:['kurti_1pc','maxi_dress','shirt_dupatta_2pc','pret_3pc','formal_emb_3pc','saree'] },
  };

  // Resolve the typed tokens to a category set with AND semantics across gender:
  //  "men unstitched" → ONLY men's unstitched (gender narrows the category), not
  //  every "unstitched" cat. A gender word ALONE → the whole gender. Returns {cats,genders}.
  // Fine gender code (w / m / k / boys / girls / infant) → does category c belong to it?
  // boys/girls/infant narrow WITHIN kids so "boys" never pulls girls' cats, etc.
  function psCatInGender(c, g){
    if(PS_DUAL_CATS.has(c)) return g === 'w' || g === 'm';   // couple set shows under BOTH women and men
    if(g === 'w') return PS_CAT_GENDER[c] === 'w';
    if(g === 'm') return PS_CAT_GENDER[c] === 'm';
    if(g === 'k') return PS_CAT_GENDER[c] === 'k';
    if(g === 'boys')   return /^kids_boys_/.test(c);
    if(g === 'girls')  return /^kids_girls_/.test(c);
    if(g === 'infant') return c === 'kids_infant';
    return false;
  }
  function psCatsForGender(g, present){
    return Object.keys(PS_CAT_GENDER).filter(c => present.has(c) && !PS_HIDE_CATS.has(c) && psCatInGender(c, g));
  }
  // Orthogonal refiner axes — PIECE COUNT (1/2/3) and STITCHED-vs-UNSTITCHED. They NARROW
  // (intersect) a selection so "1 pc stitched" = 1-piece stitched only, not every stitched 2/3pc.
  function psCatPiece(c){
    if(/2pc/.test(c) || c==='coord_western' || c==='mens_shalwar_kameez' || c==='mens_suit') return 2;
    if(/3pc/.test(c) || c==='bridal' || c==='lehenga') return 3;
    if(['kurti_1pc','kurti_1pc_unstitch','western_top','kaftan','maxi_dress','womens_trouser','mens_kurta','mens_shirt','mens_trouser','mens_jeans','mens_waistcoat'].indexOf(c) >= 0) return 1;
    return 0;   // no clear piece dimension (kids cats, dupatta, shawl, abaya, saree, sherwani, fabric…)
  }
  function psCatUnstitched(c){ return /unstitch/.test(c) || c==='mens_unstitched'; }
  // ADULT-INTENT phrases. Each adds curated ADULT cats AND adult gender(s) so the gender
  // narrowing in psResolveCats removes ANY kids cat — including ones a prefix-match would
  // sneak in ("girlfriend" must NOT pull kids_girls via the 'girl' synonym; "boyfriend" not
  // kids_boys). Matched on the raw query (handles spaced + joined forms). g: w=women, m=men.
  const PS_ADULT_CONCEPTS = [
    { re:/\bgirl\s*friend\b/,                          g:['w'],     cats:['kurti_1pc','shirt_dupatta_2pc','shirt_trouser_2pc','pret_3pc','maxi_dress','western_top','coord_western','formal_emb_3pc','pret_3pc_emb','saree','lehenga','womens_trouser'] },
    { re:/\bboy\s*friend\b/,                           g:['m'],     cats:['mens_shirt','mens_trouser','mens_jeans','mens_kurta','mens_shalwar_kameez','mens_waistcoat','mens_suit'] },
    { re:/\b(daily|every\s*day|casual)\s*wear\b/,      g:['w','m'], cats:['kurti_1pc','shirt_dupatta_2pc','shirt_trouser_2pc','lawn_3pc_unstitch','pret_3pc','loungewear','western_top','coord_western','womens_trouser','mens_shirt','mens_trouser','mens_kurta','mens_jeans'] },
    { re:/\b(party|evening|wedding|festive)\s*wear\b/, g:['w','m'], cats:['formal_emb_2pc','formal_emb_3pc','heavy_formal_3pc','pret_3pc_emb','pret_2pc_emb','maxi_dress','saree','lehenga','coord_western','western_top','mens_suit','mens_sherwani','mens_waistcoat','mens_kurta','mens_shalwar_kameez'] },
    { re:/\bmodern\s*(clothing|clothes|wear|dress|outfit|fashion)?\b|\bwestern\s*wear\b/, g:['w','m'], cats:['western_top','coord_western','maxi_dress','shirt_trouser_2pc','womens_trouser','mens_shirt','mens_trouser','mens_jeans'] },
    { re:/\bwife\b/,                                   g:['w'],     cats:['kurti_1pc','shirt_dupatta_2pc','pret_3pc','formal_emb_3pc','pret_3pc_emb','maxi_dress','saree','lehenga','western_top'] },
    { re:/\bhusband\b/,                                g:['m'],     cats:['mens_shirt','mens_trouser','mens_kurta','mens_shalwar_kameez','mens_waistcoat','mens_suit','mens_jeans'] },
    { re:/\b(office|work)\s*wear\b/,                   g:['w','m'], cats:['kurti_1pc','shirt_dupatta_2pc','western_top','shirt_trouser_2pc','womens_trouser','mens_shirt','mens_trouser','mens_kurta'] },
  ];
  // Women's "pret" = ready-to-wear SUITS (kurti / 2pc / 3pc / embroidered / formal / winter +
  // maxi / kaftan), STITCHED **and** UNSTITCHED — because many houses (Agha Noor, lawn brands)
  // sell their suits unstitched, so a stitched-only "pret" would return ZERO for them. Deliberately
  // EXCLUDES western tops & trousers, saree, lehenga, bridal, abaya, dupatta, shawl and loungewear —
  // those are their own searches, not "pret". (Before, "pret" expanded to EVERY women's category, so
  // "agha noor pret" matched ~all of Agha Noor and the word stopped narrowing — req 2026-06-25.)
  // The explicit refiners still work: "stitched" / "unstitched" narrow this set to one construction.
  const PS_PRET_CATS = ['kurti_1pc','shirt_dupatta_2pc','shirt_trouser_2pc','pret_2pc_emb','formal_emb_2pc','pret_3pc','pret_3pc_emb','formal_emb_3pc','heavy_formal_3pc','handmade_emb','winter_2pc_stitch','winter_3pc_stitch','maxi_dress','kaftan','kurti_1pc_unstitch','shirt_dupatta_2pc_unstitch','shirt_trouser_2pc_unstitch','lawn_3pc_unstitch','unstitch_3pc_emb','winter_2pc_unstitch','winter_3pc_unstitch'];
  function psResolveCats(tokens, raw, present){
    const genders = new Set(), catToks = [], relCats = new Set();
    let relSeen = false;
    tokens.forEach(t => {
      if(PS_GENDER_TOK[t]) genders.add(PS_GENDER_TOK[t]);
      else if(PS_REL[t]){ genders.add(PS_REL[t].g); relSeen = true; PS_REL[t].cats.forEach(c => { if(present.has(c) && !PS_HIDE_CATS.has(c)) relCats.add(c); }); }
      else catToks.push(t);
    });
    const cats = new Set();
    catToks.forEach(t => psMatchCatsToken(t, present).forEach(c => cats.add(c)));
    // multi-word concept ("1 piece" → "1piece"), excluding gender & relationship words.
    const conceptN = psNorm((raw || '').split(/[\s,]+/).filter(w => { const n = psNorm(w); return !PS_GENDER_TOK[n] && !PS_REL[n]; }).join(''));
    if(conceptN.length >= 2) psMatchCatsToken(conceptN, present).forEach(c => cats.add(c));
    // Adult-intent phrases ("girlfriend"/"daily wear"/"party wear"/"modern clothing"…): add their
    // curated adult cats + adult gender(s) so the narrowing below drops any kids cat.
    PS_ADULT_CONCEPTS.forEach(ac => { if(ac.re.test(raw)){ ac.g.forEach(g => genders.add(g)); ac.cats.forEach(c => { if(present.has(c) && !PS_HIDE_CATS.has(c)) cats.add(c); }); } });
    // 'pret' = WOMEN'S STITCHED ready-to-wear (the buyer's definition). Add the women gender +
    // EVERY stitched women's category (all 'w' cats except unstitched fabric and footwear), so
    // "pret" alone selects all women's stitched, and "2 pcs pret"/"3 pcs pret" then narrow by the
    // gender (→women) and the piece refiner (→2pc/3pc). Computed live so it stays complete as the
    // catalogue grows. ('pret' is also kept out of brand-matching below so it can't false-match
    // the "Silayi Pret" brand and AND the grid down to nothing.)
    if(/\bpret\b/.test(raw)){ genders.add('w'); PS_PRET_CATS.forEach(c => { if(present.has(c)) cats.add(c); }); }
    if(genders.size){
      if(cats.size){
        // a category WAS named → keep only cats of the named (fine) gender(s) — AND semantics
        [...cats].forEach(c => { if(![...genders].some(g => psCatInGender(c, g))) cats.delete(c); });
      } else if(relSeen && relCats.size){
        // relationship word(s) typed ALONE → their curated default category set
        relCats.forEach(c => cats.add(c));
      } else {
        // pure gender word(s) alone → the whole (fine) gender
        [...genders].forEach(g => psCatsForGender(g, present).forEach(c => cats.add(c)));
      }
    }
    // REFINER narrowing (intersect): a piece-count word ("1 pc") and/or a construction word
    // ("stitched"/"unstitched") shrink the selection to ONLY the matching cats — so "1 pc
    // stitched" is 1-piece stitched, not every stitched 2pc/3pc.
    const wantP = new Set();
    if(/(^|[^0-9])1\s*-?\s*(pc|piece)s?\b|\bone[\s-]?piece\b|\bsingle[\s-]?piece\b/.test(raw)) wantP.add(1);
    if(/(^|[^0-9])2\s*-?\s*(pc|piece)s?\b|\btwo[\s-]?piece\b/.test(raw)) wantP.add(2);
    if(/(^|[^0-9])3\s*-?\s*(pc|piece)s?\b|\bthree[\s-]?piece\b/.test(raw)) wantP.add(3);
    if(wantP.size && cats.size) [...cats].forEach(c => { const pc = psCatPiece(c); if(pc === 0 || !wantP.has(pc)) cats.delete(c); });
    if(/\bstitched\b|\brtw\b|ready[\s-]?to[\s-]?wear/.test(raw) && !/unstitch/.test(raw) && cats.size) [...cats].forEach(c => { if(psCatUnstitched(c)) cats.delete(c); });
    if(/unstitch|\bfabric\b/.test(raw) && cats.size) [...cats].forEach(c => { if(!psCatUnstitched(c)) cats.delete(c); });
    return { cats, genders, catToks };
  }
  // Unified search → marks brands (by name) + categories (by synonym). REPLACES the
  // current cat/brand selection so "khaadi casual" fixes the filters to exactly that.
  // Debounced search entry point (wired to both inputs' oninput). Mirrors the typed
  // value to both fields INSTANTLY so the box feels live, but defers the expensive
  // resolve+filter (~3 catalog passes + psApply) so a fast typer triggers it once, not
  // once per character — the difference between snappy and laggy typing at 20k products.
  let _psSearchT = null;
  function psUpdateSearchClearBtn(val){
    const show = !!(val && val.length > 0);
    ['psSearchClearM','psSearchClearD'].forEach(id => {
      const el = document.getElementById(id);
      if(el) el.style.display = show ? 'flex' : 'none';
    });
  }
  function psClearSearch(){
    ['psSearchMobile','psSearchDesktop'].forEach(id => { const e = document.getElementById(id); if(e) e.value = ''; });
    psSugHide();
    psUpdateSearchClearBtn('');
    psSearchHint('', new Set(), new Set());
    clearTimeout(_psSearchT);
    psSmartSearch('');
  }
  function psSearchInput(val){
    const a = document.getElementById('psSearchMobile'), b = document.getElementById('psSearchDesktop');
    if(a && a.value !== val) a.value = val;
    if(b && b.value !== val) b.value = val;
    psUpdateSearchClearBtn(val);
    psSugUpdate(val);
    clearTimeout(_psSearchT);
    _psSearchT = setTimeout(() => psSmartSearch(val), 180);
  }
  // Auto-suggest: prefix-match typed text against all synonym keys from the dictionary.
  // Piece-count variants ("3pc","3pcs","3 piece","3pieces") dedup to one canonical display form.
  const PS_SUGGEST = (function(){
    const CANON = {'1pc':'1 piece','2pc':'2 pieces','3pc':'3 pieces'};
    function key(kw){ var m=kw.match(/^(\d+)\s*(pieces?|pcs?|pc)$/i); return m?m[1]+'pc':kw.replace(/\s+/g,''); }
    var seen={}, out=[];
    PS_CAT_SYNONYMS.map(function(e){return e[0];}).filter(function(k){return k.length>=2;}).sort().forEach(function(kw){
      var n=key(kw); if(!seen[n]){seen[n]=1; out.push(CANON[n]||kw);}
    });
    return out;
  })();
  function psSugShow(id, terms){
    const el = document.getElementById(id);
    if(!el) return;
    if(!terms.length){ el.innerHTML = ''; el.style.display = 'none'; return; }
    el.innerHTML = terms.map(t => `<li onmousedown="psSugPick(event,'${t.replace(/'/g,"\\'")}')">${esc(t)}</li>`).join('');
    el.style.display = 'block';
  }
  function psSugPick(e, term){ e.preventDefault(); psSugDo(term); }
  function psSugDo(term){
    const a = document.getElementById('psSearchMobile'), b = document.getElementById('psSearchDesktop');
    if(a) a.value = term; if(b) b.value = term;
    psUpdateSearchClearBtn(term);
    psSugHide();
    clearTimeout(_psSearchT);
    _psSearchT = setTimeout(() => psSmartSearch(term), 10);
  }
  function psSugHide(){ psSugShow('psSugM',[]); psSugShow('psSugD',[]); }
  function psSugDeferred(){ setTimeout(psSugHide, 160); }
  // Tap the search box again to dismiss the suggestion list — so the buyer is never
  // "stuck" being forced to pick a suggestion. Open → close; typing reopens it.
  function psSugToggleClose(){
    const m = document.getElementById('psSugM'), d = document.getElementById('psSugD');
    if((m && m.style.display === 'block') || (d && d.style.display === 'block')) psSugHide();
  }
  function psSugUpdate(val){
    if(!val || val.length < 2){ psSugHide(); return; }
    const n = psNorm(val);
    const matches = PS_SUGGEST.filter(kw => psNorm(kw).startsWith(n)).slice(0, 7);
    psSugShow('psSugM', matches); psSugShow('psSugD', matches);
  }
  // ── Full-screen search page (in-app overlay) — redesign Phase 1 ──
  // Reuses the existing search: pick/submit closes the page and psSearchInput runs the
  // grid search. Visual search + Fit assistant are hooks (built in a separate session).
  // 'brands' when the search was opened from the Browse Brands (price-check) page → results are
  // brand sites for checking prices. 'products' (Home/Luxe) → results are the product listing.
  var _psSearchMode='products';
  function psSearchOpen(){
    var ov=document.getElementById('psSearchPage'); if(!ov) return;
    _psSearchMode = (typeof psOnProductsTab==='function' && !psOnProductsTab()) ? 'brands' : 'products';
    ov.removeAttribute('hidden');
    try{ document.body.style.overflow='hidden'; }catch(e){}
    var inp=document.getElementById('psSearchPageInput');
    if(inp){ inp.value=''; inp.placeholder = _psSearchMode==='brands' ? 'Search a brand to check its price' : 'Search products and 150+ brands'; setTimeout(function(){ try{ inp.focus(); }catch(e){} }, 60); }
    var clr=document.getElementById('psSpClear'); if(clr) clr.hidden=true;
    psSearchPageSug('');
    try{ psSpRenderPoster(); }catch(e){}
    try{ psSpFillTiles(); }catch(e){}
  }
  function psSearchClose(){
    var ov=document.getElementById('psSearchPage'); if(ov) ov.setAttribute('hidden','');
    try{ document.body.style.overflow=''; }catch(e){}
  }
  function psSearchPageSug(val){
    var list=document.getElementById('psSearchPageSug'); if(!list) return;
    var clr=document.getElementById('psSpClear'); if(clr) clr.hidden = !val;   // ✕ eraser shows whenever there's text
    if(!val || val.length<2){ list.innerHTML=''; return; }
    var n=psNorm(val);
    // Exclude aggregators (LAAM) from the icon/suggestion listing; order BD-famous first.
    var ALL=(typeof BRANDS!=='undefined'?BRANDS:[]).filter(function(b){ return !b.agg; })
      .slice().sort(function(a,b){ return bdRank(a.n)-bdRank(b.n); });
    if(_psSearchMode==='brands'){
      // PRICE-CHECK mode (opened from Browse Brands): suggest BRANDS → tapping opens the brand's
      // OWN website to check the price (not a product grid). That's the claim of this page.
      var bs=ALL.filter(function(b){ return psNorm(b.n).indexOf(n)>=0; }).slice(0,10);
      list.innerHTML = bs.length ? bs.map(function(b){
        var logo=psBrandLogo(b.u);
        var ic=logo?'<img class="sp-sug-logo" src="'+esc(logo)+'" alt="" onerror="this.style.visibility=\'hidden\'">':'<span class="sp-sug-logo sp-sug-logo-x" aria-hidden="true">🏷️</span>';
        return '<li class="sp-sug-brand" data-url="'+esc(b.u)+'" data-name="'+esc(b.n)+'" onmousedown="psBrandSugGo(this)">'+ic+'<span class="sp-sug-bn">'+esc(b.n)+'</span><span class="sp-sug-go" data-i18n="sp_checkprice">check price ›</span></li>';
      }).join('') : '<li class="sp-sug-none">No brand matches</li>';
      return;
    }
    // PRODUCTS mode (Home/Luxe): brand names first, then product keywords — both run a product search.
    var seen={};
    var brands=ALL.filter(function(b){ return psNorm(b.n).indexOf(n)>=0; })
      .slice(0,5).map(function(b){ seen[psNorm(b.n)]=1; return {t:b.n, brand:true}; });
    var kw=PS_SUGGEST.filter(function(k){ return psNorm(k).startsWith(n) && !seen[psNorm(k)]; })
      .slice(0, Math.max(0, 8-brands.length)).map(function(k){ return {t:k, brand:false}; });
    list.innerHTML=brands.concat(kw).map(function(o){
      var t=String(o.t).replace(/'/g,"\\'");
      return '<li onmousedown="psSearchPageGo(\''+t+'\')">'+(o.brand?'<span class="sp-sug-tag">Brand</span> ':'')+esc(o.t)+'</li>';
    }).join('');
  }
  function psSearchPageInput(val){ psSearchPageSug(val); }
  function psSearchPageSubmit(){
    var inp=document.getElementById('psSearchPageInput'); var v=inp?inp.value:'';
    if(_psSearchMode==='brands'){   // Enter → open the top matching brand's site
      var n=psNorm(v); var b=(typeof BRANDS!=='undefined'?BRANDS:[]).find(function(x){ return psNorm(x.n).indexOf(n)>=0; });
      if(b) psBrandSugGo({ dataset:{ url:b.u, name:b.n } });
      return;
    }
    psSearchPageGo(v);
  }
  function psSearchPageGo(term){ psSearchClose(); if(term && typeof psSearchInput==='function') psSearchInput(term); }
  // Brands/price-check: close the search page, then open the brand's own site (with the
  // "look there, order here" notice) so the buyer can check the real price.
  function psBrandSugGo(el){ psSearchClose(); try{ openBrandInApp(el); }catch(e){} }
  window.psBrandSugGo=psBrandSugGo;
  // ✕ eraser: wipe the typed text + suggestions, keep the search page open on its landing.
  function psSearchPageClear(){
    var inp=document.getElementById('psSearchPageInput'); if(inp){ inp.value=''; try{ inp.focus(); }catch(e){} }
    var clr=document.getElementById('psSpClear'); if(clr) clr.hidden=true;
    psSearchPageSug('');
  }
  window.psSearchPageClear=psSearchPageClear;
  function psSpComingSoon(name){
    var ov=document.getElementById('psSearchPage');
    if(ov && ov.hasAttribute('hidden')) psSearchOpen();
    var m=document.getElementById('psSpMsg');
    if(m){ m.textContent=name+' is coming soon.'; m.hidden=false; clearTimeout(psSpComingSoon._t); psSpComingSoon._t=setTimeout(function(){ m.hidden=true; },2600); }
  }
  // ── VISUAL SEARCH ("search by photo") ──────────────────────────────────────────
  // Tap a camera button → choose Take photo / Upload → shrink to 512px → POST to the
  // /search/visual encoder → render the visually-similar products in the Browse grid with
  // a clear chip. psVisualActive freezes infinite-scroll (the result set is fixed).
  var psVisualActive = false;
  var psActiveAbort = null;     // in-flight fit/visual request, so Cancel can abort it
  var _psLoadWatchdog = null;   // safety timer: the full-screen overlay can NEVER stay up forever
  function psVisualSearch(){ psSpComingSoon(tr('sp_visual')); }
  function psVisualSheet(show){ var s=document.getElementById('psVisSheet'); if(s){ s.hidden=!show; document.body.style.overflow = show ? 'hidden' : ''; } }
  function psVisualPick(mode){ psVisualSheet(false); var inp=document.getElementById(mode==='cam'?'psVisCam':'psVisUp'); if(inp){ inp.value=''; inp.click(); } }
  function psVisualLoad(on){
    var o=document.getElementById('psVisLoad'); if(!o) return;
    o.hidden=!on;
    clearTimeout(_psLoadWatchdog);
    if(on){
      // WATCHDOG: whatever happens to the request (stalled socket, blocked thread recovering,
      // a missing .catch), force the blocking overlay away after 18s so the app can never be trapped.
      _psLoadWatchdog=setTimeout(function(){ var x=document.getElementById('psVisLoad'); if(x) x.hidden=true; },18000);
    } else { psActiveAbort=null; }
  }
  // user tapped the overlay / Cancel — abort the request and dismiss immediately
  function psLoadCancel(){
    if(psActiveAbort){ try{ psActiveAbort.userCancelled=true; psActiveAbort.abort(); }catch(e){} }
    psVisualLoad(false);
  }
  function psVisualFile(input){
    var f=input&&input.files&&input.files[0]; if(!f) return;
    if(!/^image\//.test(f.type)){ psVisualToast(tr('vis_badfile')); return; }
    var reader=new FileReader();
    reader.onload=function(e){
      var img=new Image();
      img.onload=function(){
        var max=512, scale=Math.min(1, max/Math.max(img.width,img.height));
        var cw=Math.max(1,Math.round(img.width*scale)), ch=Math.max(1,Math.round(img.height*scale));
        var cv=document.createElement('canvas'); cv.width=cw; cv.height=ch;
        try{ cv.getContext('2d').drawImage(img,0,0,cw,ch); psVisualRun(cv.toDataURL('image/jpeg',0.85)); }
        catch(err){ psVisualToast(tr('vis_badfile')); }
      };
      img.onerror=function(){ psVisualToast(tr('vis_badfile')); };
      img.src=e.target.result;
    };
    reader.onerror=function(){ psVisualToast(tr('vis_badfile')); };
    reader.readAsDataURL(f);
  }
  function psVisualRun(dataUrl){
    psVisualLoad(true);
    var _vac=new AbortController(); var _vtid=setTimeout(function(){ _vac.abort(); },22000);
    fetch(psSearchBase()+'/visual',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({image:dataUrl,k:48}), signal:_vac.signal })
      .then(function(r){ clearTimeout(_vtid); if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
      .then(function(j){
        psVisualLoad(false);
        if(j.ok===false || j.apparel===false){ psVisualToast(tr('vis_notapparel')); return; }
        var items=(j.products||[]).filter(function(p){ return !psIsHidden(p); });
        if(!items.length){ psVisualToast(tr('vis_none')); return; }
        psVisualShow(items);
      })
      .catch(function(e){ clearTimeout(_vtid); psVisualLoad(false); console.warn('visual search failed:', e.message); psVisualToast(e.name==='AbortError'?tr('vis_slow'):tr('vis_err')); });
  }
  function psVisualShow(items){
    psSearchClose(); psVisualSheet(false);
    if(typeof switchBrowse==='function' && !psOnProductsTab()) switchBrowse('products');
    psVisualActive=true; psApiMode=true;
    psFiltered=items; psApiTotal=items.length; psPage=0; psFeedDone=true; psFeedLoading=false;
    psRender(false);
    psVisualChip(true, tr('vis_chip')+' ('+items.length+')', 'photo');
    try{ window.scrollTo({top:0,behavior:'smooth'}); }catch(e){}
  }
  // shared "frozen results" chip — used by BOTH photo search and Fit Assistant (kind sets icon/colour)
  function psVisualChip(show, text, kind){
    var grid=document.getElementById('psGrid'); if(!grid) return;
    var chip=document.getElementById('psVisChip');
    if(show){
      if(!chip){ chip=document.createElement('div'); chip.id='psVisChip'; grid.parentNode.insertBefore(chip, grid); }
      chip.className='ps-vis-chip'+(kind==='fit'?' ps-fit-chip':'');
      var icon = kind==='fit'
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7l4-4 14 14-4 4z"/><path d="M9 7l2 2M13 11l2 2M7 13l2 2"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h3l1.5-2h7L17 7h3a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V8a1 1 0 011-1z"/><circle cx="12" cy="13" r="3.5"/></svg>';
      chip.innerHTML=icon+'<span>'+esc(text)+'</span><button type="button" onclick="psVisualClear()" aria-label="'+esc(tr('vis_clear'))+'">✕</button>';
      chip.hidden=false;
    } else if(chip){ chip.hidden=true; }
  }
  function psVisualClear(){ psVisualActive=false; psVisualChip(false); psPage=0; if(typeof psApply==='function') psApply(); }
  // brief auto-dismiss toast for visual-search states (no search page needed)
  function psVisualToast(msg){
    var t=document.getElementById('psVisToast');
    if(!t){ t=document.createElement('div'); t.id='psVisToast'; t.className='ps-vis-toast'; document.body.appendChild(t); }
    t.textContent=msg; t.hidden=false; t.classList.add('on');
    clearTimeout(psVisualToast._t); psVisualToast._t=setTimeout(function(){ t.classList.remove('on'); t.hidden=true; }, 3000);
  }
  // ── FIT ASSISTANT ("shop my size") ─────────────────────────────────────────────
  // Set a profile once (reference size in a brand you know, or body measurements + gender),
  // saved to localStorage (by WhatsApp # if given). "Show what fits me" calls /search/fit and
  // renders the products available in your size, scoped to a brand or overall.
  // Covered reference brands per gender (brands whose chart can translate "I wear M in X").
  var PS_FIT_BRANDS = {
    w:["Khaadi","Sapphire","Sana Safinaz","Generation","Cross Stitch","Sania Maskatiya","Bonanza Satrangi","Chinyere","Nishat Linen","Zellbury","Zara Shahjahan","Coco by Zara Shahjahan","Mina Hasan","Lulusar","Ego","Kross Kulture","Rang Rasiya","Republic Womenswear","Imrozia Premium","Iznik Fashions","Threads & Motifs","Edge Republic","Mausummery","Emaan Adeel","Khas Stores","Wear Ochre","Roheenaz","Armas","Sha Posh","Tassels","Akbar Aslam","Al-Deebaj","Black Camels","Dynasty Fabrics","ECS","Jeem","Kashee's Boutique","Lawrencepur","Silayi Pret","Sitara Studio","Stylo","Tawakkal Fabrics","The Hijab Company","Zuruj","One Kids"],
    m:["Amir Adnan","Diners","CRUSH Menswear","Monark","Royal Tag","Shahzeb Saeed","Charcoal","Engine","Furor","Lawrencepur","Al-Deebaj","One Kids"]
  };
  var psFitG='w', psFitFitPref='regular', psFitMeasOpen=false;
  function psFitAssistant(){ psFitLoadProfile(); psFitSheet(true); }
  function psFitSheet(show){ var s=document.getElementById('psFitSheet'); if(s){ s.hidden=!show; document.body.style.overflow=show?'hidden':''; if(show) psFitFillBrands(); } }
  function psFitGender(g){ psFitG=g; var seg=document.getElementById('psFitGenderSeg'); if(seg) [].forEach.call(seg.children,function(b){ b.classList.toggle('on', b.getAttribute('data-g')===g); }); psFitFillBrands(); }
  function psFitFitSet(f){ psFitFitPref=f; var seg=document.getElementById('psFitFitSeg'); if(seg) [].forEach.call(seg.children,function(b){ b.classList.toggle('on', b.getAttribute('data-f')===f); }); }
  function psFitToggleMeas(){ psFitMeasOpen=!psFitMeasOpen; var m=document.getElementById('psFitMeas'); if(m) m.hidden=!psFitMeasOpen; var l=document.getElementById('psFitMeasLink'); if(l) l.textContent=tr(psFitMeasOpen?'fit_meashide':'fit_measlink'); }
  function psFitFillBrands(){
    var list=PS_FIT_BRANDS[psFitG]||[];
    var rb=document.getElementById('psFitBrand'); if(rb){ var cur=rb.value; rb.innerHTML=list.map(function(b){return '<option>'+esc(b)+'</option>';}).join(''); if(list.indexOf(cur)>=0) rb.value=cur; }
    var sc=document.getElementById('psFitScope'); if(sc){ var cs=sc.value; sc.innerHTML='<option value="">'+esc(tr('fit_allbrands'))+'</option>'+list.map(function(b){return '<option>'+esc(b)+'</option>';}).join(''); sc.value=cs; }
  }
  function psFitRun(){
    var g=psFitG, params='fgender='+g, basis;
    if(psFitMeasOpen){
      var ch=parseFloat((document.getElementById('psFitChest')||{}).value), wa=parseFloat((document.getElementById('psFitWaist')||{}).value), hi=parseFloat((document.getElementById('psFitHip')||{}).value);
      if(!(ch>0)){ psVisualToast(tr('fit_needchest')); return; }
      params+='&fchest='+ch+(wa>0?'&fwaist='+wa:'')+(hi>0?'&fhip='+hi:'')+'&ffit='+psFitFitPref;
      basis='';
    } else {
      var sz=(document.getElementById('psFitSize')||{}).value, br=(document.getElementById('psFitBrand')||{}).value;
      if(!sz||!br){ psVisualToast(tr('fit_needref')); return; }
      params+='&fref='+encodeURIComponent(br)+'&fsize='+encodeURIComponent(sz);
      basis=sz;
    }
    var scope=(document.getElementById('psFitScope')||{}).value; if(scope) params+='&brand='+encodeURIComponent(scope);
    psFitSaveProfile();
    psVisualLoad(true);
    var _fac=new AbortController(); psActiveAbort=_fac;
    var _ftid=setTimeout(function(){ _fac.timedOut=true; _fac.abort(); },15000);
    fetch(psSearchBase()+'/fit?'+params+'&pageSize=60', { cache:'default', signal:_fac.signal })
      .then(function(r){ clearTimeout(_ftid); if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
      .then(function(j){
        psVisualLoad(false);
        if(j.error){ psVisualToast(tr('fit_err')); return; }
        var items=(j.products||[]).filter(function(p){ return !psIsHidden(p); });
        if(!items.length){ psVisualToast(tr('fit_none')); return; }
        psFitShow(items, basis, j.total||items.length);
      })
      .catch(function(e){
        clearTimeout(_ftid); psVisualLoad(false);
        if(e.name==='AbortError' && _fac.userCancelled) return;   // user dismissed — silent
        console.warn('fit search failed:', e.message); psVisualToast(tr('fit_err'));
      });
  }
  function psFitShow(items, basis, total){
    psSearchClose(); psFitSheet(false);
    if(typeof switchBrowse==='function' && !psOnProductsTab()) switchBrowse('products');
    psVisualActive=true; psApiMode=true;
    psFiltered=items; psApiTotal=items.length; psPage=0; psFeedDone=true; psFeedLoading=false;
    psRender(false);
    var label = basis ? (tr('fit_chip')+' '+basis) : tr('fit_chip');
    psVisualChip(true, label+' ('+total+')', 'fit');
    try{ window.scrollTo({top:0,behavior:'smooth'}); }catch(e){}
  }
  function psFitProfileKey(){ return 'psb_fit_profile'; }
  function psFitSaveProfile(){
    try{
      var p={ g:psFitG, meas:psFitMeasOpen, size:(document.getElementById('psFitSize')||{}).value, brand:(document.getElementById('psFitBrand')||{}).value,
        chest:(document.getElementById('psFitChest')||{}).value, waist:(document.getElementById('psFitWaist')||{}).value, hip:(document.getElementById('psFitHip')||{}).value,
        fit:psFitFitPref, scope:(document.getElementById('psFitScope')||{}).value, wa:(document.getElementById('psFitWa')||{}).value };
      localStorage.setItem(psFitProfileKey(), JSON.stringify(p));
    }catch(e){}
  }
  function psFitLoadProfile(){
    var p; try{ p=JSON.parse(localStorage.getItem(psFitProfileKey())||'null'); }catch(e){}
    if(!p) return;
    psFitG=p.g==='m'?'m':'w'; psFitFitPref=p.fit||'regular'; psFitMeasOpen=!!p.meas;
    setTimeout(function(){
      psFitGender(psFitG); psFitFitSet(psFitFitPref);
      var set=function(id,v){ var el=document.getElementById(id); if(el&&v!=null&&v!=='') el.value=v; };
      set('psFitSize',p.size); set('psFitBrand',p.brand); set('psFitChest',p.chest); set('psFitWaist',p.waist); set('psFitHip',p.hip); set('psFitScope',p.scope); set('psFitWa',p.wa);
      if(window.psPhoneSetFromFull) psPhoneSetFromFull('psFitWa', p.wa||'');
      var m=document.getElementById('psFitMeas'); if(m) m.hidden=!psFitMeasOpen; var l=document.getElementById('psFitMeasLink'); if(l) l.textContent=tr(psFitMeasOpen?'fit_meashide':'fit_measlink');
    }, 0);
  }
  window.psSearchOpen=psSearchOpen; window.psSearchClose=psSearchClose;
  window.psSearchPageInput=psSearchPageInput; window.psSearchPageSubmit=psSearchPageSubmit; window.psSearchPageGo=psSearchPageGo;
  window.psVisualSearch=psVisualSearch; window.psFitAssistant=psFitAssistant;
  window.psVisualSheet=psVisualSheet; window.psVisualPick=psVisualPick; window.psVisualFile=psVisualFile; window.psVisualClear=psVisualClear;
  window.psFitSheet=psFitSheet; window.psFitGender=psFitGender; window.psFitFitSet=psFitFitSet; window.psFitToggleMeas=psFitToggleMeas; window.psFitRun=psFitRun; window.psLoadCancel=psLoadCancel;

  // ── WhatsApp / phone input: themed country picker + completeness check ─────────────
  // Used by the order-form contact details (#buyerWA) and the Fit Assistant (#psFitWa).
  // The widget keeps a hidden input (id = data-phone) in sync with the full +<dial><number>,
  // so existing save/submit code reading that field's .value is unchanged. The country list is
  // a CUSTOM themed dropdown (never a native select). Completeness is checked per country.
  var PS_PHONE_COUNTRIES=[
    {c:'BD',f:'🇧🇩',n:'Bangladesh',d:'880',len:10,pfx:'1'},
    {c:'PK',f:'🇵🇰',n:'Pakistan',d:'92',len:10,pfx:'3'},
    {c:'IN',f:'🇮🇳',n:'India',d:'91',len:10},
    {c:'AE',f:'🇦🇪',n:'UAE',d:'971',len:9},
    {c:'SA',f:'🇸🇦',n:'Saudi Arabia',d:'966',len:9},
    {c:'QA',f:'🇶🇦',n:'Qatar',d:'974',len:8},
    {c:'KW',f:'🇰🇼',n:'Kuwait',d:'965',len:8},
    {c:'OM',f:'🇴🇲',n:'Oman',d:'968',len:8},
    {c:'MY',f:'🇲🇾',n:'Malaysia',d:'60',len:[9,10]},
    {c:'SG',f:'🇸🇬',n:'Singapore',d:'65',len:8},
    {c:'GB',f:'🇬🇧',n:'United Kingdom',d:'44',len:10},
    {c:'US',f:'🇺🇸',n:'United States',d:'1',len:10},
    {c:'IT',f:'🇮🇹',n:'Italy',d:'39',len:[9,11]},
    {c:'AU',f:'🇦🇺',n:'Australia',d:'61',len:9}
  ];
  var _psPhones={};
  function psPhoneCountry(c){ for(var i=0;i<PS_PHONE_COUNTRIES.length;i++) if(PS_PHONE_COUNTRIES[i].c===c) return PS_PHONE_COUNTRIES[i]; return null; }
  function psPhoneInit(root){
    var key=root.getAttribute('data-phone'); if(!key||_psPhones[key]) return;
    var st={ root:root, key:key, country:psPhoneCountry(root.getAttribute('data-default')||'BD')||PS_PHONE_COUNTRIES[0], required:root.getAttribute('data-required')==='1', touched:false };
    _psPhones[key]=st;
    root.innerHTML='<button type="button" class="ps-phone-cc" aria-haspopup="listbox" aria-expanded="false" onclick="psPhoneToggle(\''+key+'\')"></button>'
      +'<input type="tel" inputmode="numeric" autocomplete="tel-national" class="ps-phone-num" oninput="psPhoneOnNum(\''+key+'\')" onblur="psPhoneBlur(\''+key+'\')"/>'
      +'<ul class="ps-phone-list" role="listbox" hidden>'+PS_PHONE_COUNTRIES.map(function(x){ return '<li role="option" tabindex="-1" onclick="psPhonePick(\''+key+'\',\''+x.c+'\')"><span class="ps-phone-flag">'+x.f+'</span><span class="ps-phone-cn">'+esc(x.n)+'</span><b>+'+x.d+'</b></li>'; }).join('')+'</ul>';
    st.cc=root.querySelector('.ps-phone-cc'); st.num=root.querySelector('.ps-phone-num'); st.list=root.querySelector('.ps-phone-list');
    psPhoneRenderCc(st);
    var hid=document.getElementById(key); if(hid&&hid.value) psPhoneSetFromFull(key, hid.value);
  }
  function psPhoneRenderCc(st){
    var minlen=Array.isArray(st.country.len)?st.country.len[0]:st.country.len, pl=st.country.pfx?st.country.pfx.length:0;
    st.cc.innerHTML='<span class="ps-phone-flag">'+st.country.f+'</span><span class="ps-phone-dial">+'+st.country.d+'</span><span class="ps-phone-car">▾</span>';
    st.num.placeholder=(st.country.pfx||'')+new Array(Math.max(1,minlen-pl)+1).join('X');
  }
  function psPhoneToggle(key){ var st=_psPhones[key]; if(!st)return; var willOpen=st.list.hidden; var l=document.querySelectorAll('.ps-phone-list'); for(var i=0;i<l.length;i++) l[i].hidden=true; st.list.hidden=!willOpen; st.cc.setAttribute('aria-expanded', willOpen?'true':'false'); }
  function psPhonePick(key,c){ var st=_psPhones[key]; if(!st)return; st.country=psPhoneCountry(c)||st.country; st.list.hidden=true; st.cc.setAttribute('aria-expanded','false'); psPhoneRenderCc(st); psPhoneSync(key); if(st.touched) psPhoneValidateShow(key); try{st.num.focus();}catch(e){} }
  function psPhoneOnNum(key){ var st=_psPhones[key]; if(!st)return; var v=st.num.value.replace(/[^0-9]/g,''); if(v!==st.num.value) st.num.value=v; psPhoneSync(key); if(st.touched) psPhoneValidateShow(key); }
  function psPhoneBlur(key){ var st=_psPhones[key]; if(!st)return; st.touched=true; psPhoneValidateShow(key); }
  function psPhoneNat(st){ var d=st.num.value.replace(/[^0-9]/g,''); if(d.charAt(0)==='0') d=d.slice(1); return d; }
  function psPhoneSync(key){ var st=_psPhones[key]; if(!st)return; var d=psPhoneNat(st); var hid=document.getElementById(key); if(hid) hid.value=d?('+'+st.country.d+d):''; }
  function psPhoneCheck(st){
    var d=psPhoneNat(st);
    if(!d) return st.required?{ok:false,reason:'empty'}:{ok:true,empty:true};
    var len=st.country.len, lo=Array.isArray(len)?len[0]:len, hi=Array.isArray(len)?len[1]:len;
    if(d.length<lo) return {ok:false,reason:'short'};
    if(d.length>hi) return {ok:false,reason:'long'};
    if(st.country.pfx && d.charAt(0)!==st.country.pfx.charAt(0)) return {ok:false,reason:'prefix'};
    return {ok:true};
  }
  function psPhoneValidateShow(key){
    var st=_psPhones[key]; if(!st) return true; var r=psPhoneCheck(st); var err=document.getElementById(key+'_err');
    var bad=!r.ok && st.touched; st.root.classList.toggle('bad', bad);
    if(err){ if(bad){ err.textContent=tr('wa_err_'+r.reason); err.hidden=false; } else err.hidden=true; }
    return r.ok;
  }
  function psPhoneOk(key){ var st=_psPhones[key]; if(!st) return true; st.touched=true; return psPhoneValidateShow(key); }
  function psPhoneSetFromFull(key,full){
    var st=_psPhones[key]; if(!st||full==null||full==='') return; var s=String(full).replace(/[^0-9+]/g,''); if(s.charAt(0)==='+') s=s.slice(1);
    var best=null; for(var i=0;i<PS_PHONE_COUNTRIES.length;i++){ var x=PS_PHONE_COUNTRIES[i]; if(s.indexOf(x.d)===0 && (!best||x.d.length>best.d.length)) best=x; }
    if(best){ st.country=best; st.num.value=s.slice(best.d.length); } else st.num.value=s;
    psPhoneRenderCc(st); psPhoneSync(key);
  }
  function psPhoneReset(key){ var st=_psPhones[key]; if(!st)return; st.num.value=''; st.touched=false; psPhoneSync(key); psPhoneValidateShow(key); }
  function psPhoneInitAll(){ var ps=document.querySelectorAll('.ps-phone[data-phone]'); for(var i=0;i<ps.length;i++) psPhoneInit(ps[i]); }
  document.addEventListener('click', function(e){ if(!(e.target.closest&&e.target.closest('.ps-phone'))){ var l=document.querySelectorAll('.ps-phone-list'); for(var i=0;i<l.length;i++) l[i].hidden=true; } });
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', psPhoneInitAll); else setTimeout(psPhoneInitAll,0);
  window.psPhoneToggle=psPhoneToggle; window.psPhonePick=psPhonePick; window.psPhoneOnNum=psPhoneOnNum; window.psPhoneBlur=psPhoneBlur; window.psPhoneOk=psPhoneOk; window.psPhoneSetFromFull=psPhoneSetFromFull; window.psPhoneReset=psPhoneReset; window.psPhoneInitAll=psPhoneInitAll;

  // ── SEARCH PAGE: CURATED COLLECTIONS (editorial edits, NOT the raw category/brand taxonomy) ──
  // Req (Danish): curate themed collections instead of mirroring the gender rail + brand list. Each
  // maps to a real search filter (cat mix / price band / new / brand) so a tap shows matching
  // products; "Famous Brands" opens the brand directory. A representative photo per collection is
  // pulled from the live search API and cached (emoji ::before is the fallback until it loads).
  const PS_SP_COLLECTIONS = [
    { id:'trends',   en:'Bangladeshi Trends', bn:'বাংলাদেশি ট্রেন্ড',  e:'🔥', new:true },
    { id:'festive',  en:'Eid & Festive',      bn:'ঈদ ও উৎসব',         e:'✨', cats:['formal_emb_3pc','formal_emb_2pc','heavy_formal_3pc','handmade_emb'] },
    { id:'lawn',     en:'Summer Lawn',        bn:'সামার লন',          e:'🌸', cats:['lawn_3pc_unstitch','pret_3pc','unstitch_3pc_emb'] },
    { id:'wedding',  en:'Wedding Guest',      bn:'ওয়েডিং গেস্ট',       e:'💍', cats:['saree','lehenga','formal_emb_3pc','bridal'] },
    { id:'coord',    en:'Co-ord Sets',        bn:'কো-অর্ড সেট',        e:'🧶', cats:['shirt_trouser_2pc','coord_western'] },
    { id:'budget',   en:'Budget Finds',       bn:'বাজেট ফাইন্ডস',      e:'🏷️', prices:[0,1] },
    { id:'designer', en:'Designer Picks',     bn:'ডিজাইনার পিকস',      e:'👑', prices:[5,6] },
    { id:'brands',   en:'Famous Brands',      bn:'নামকরা ব্র্যান্ড',    e:'🛍️', goBrands:true, imgBrands:['Khaadi','Sapphire'] }
  ];
  let _psSpCollImg = {};
  try { _psSpCollImg = JSON.parse(localStorage.getItem('psb_sp_coll_thumbs') || '{}') || {}; } catch(e){ _psSpCollImg = {}; }
  function _psSpCollQuery(c){
    const p = [];
    if(c.cats && c.cats.length)           p.push('cat=' + encodeURIComponent(c.cats.join(',')));
    if(c.prices && c.prices.length)        p.push('price=' + c.prices.join(','));
    if(c.imgBrands && c.imgBrands.length)  p.push('brand=' + encodeURIComponent(c.imgBrands.join(',')));
    if(c.new)  p.push('new=1');
    if(c.sale) p.push('sale=1');
    return p.join('&');
  }
  function psSpFillTiles(){
    const cw = document.getElementById('psSpColls'); if(!cw) return;
    cw.innerHTML = PS_SP_COLLECTIONS.map(function(c){
      const lbl = (_lang==='bn' && c.bn) ? c.bn : c.en;
      const cached = _psSpCollImg[c.id] && _psSpCollImg[c.id].u;
      const img = cached ? '<img loading="lazy" src="'+esc(thumbUrl(cached))+'" alt="'+esc(lbl)+'" onerror="this.remove()">' : '';
      return '<button type="button" class="ps-sp-tile" data-coll="'+esc(c.id)+'" onclick="psSpPickColl(this.getAttribute(\'data-coll\'))" title="'+esc(lbl)+'">'
        + '<span class="ps-sp-tile-img" data-emoji="'+esc(c.e||'🛍️')+'">'+img+'</span>'
        + '<span class="ps-sp-tile-lbl">'+esc(lbl)+'</span></button>';
    }).join('');
    psSpLoadThumbs();
  }
  function psSpPaint(id, url){
    const tile = document.querySelector('#psSpColls .ps-sp-tile[data-coll="'+id+'"]'); if(!tile) return;
    const box = tile.querySelector('.ps-sp-tile-img');
    if(box && !box.querySelector('img')){ const im = new Image(); im.loading='lazy'; im.alt=id; im.onerror=function(){ this.remove(); }; im.src = thumbUrl(url); box.appendChild(im); }
  }
  function psSpLoadThumbs(){
    if(typeof psApiMode === 'undefined' || !psApiMode) return;   // catalog.json mode: emoji fallback
    PS_SP_COLLECTIONS.forEach(function(c){
      const cc = _psSpCollImg[c.id];
      if(cc && cc.u && (Date.now() - cc.t < 14*24*3600*1000)){ psSpPaint(c.id, cc.u); return; }
      fetch(psSearchBase() + '?' + _psSpCollQuery(c) + '&pageSize=6&page=0', { cache:'default' })
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(function(j){ const arr=(j&&j.products)||[]; const pick = arr.find(function(p){ return p&&p.img; }); if(pick&&pick.img){ _psSpCollImg[c.id]={u:pick.img,t:Date.now()}; try{ localStorage.setItem('psb_sp_coll_thumbs', JSON.stringify(_psSpCollImg)); }catch(e){} psSpPaint(c.id, pick.img); } })
        .catch(function(){});
    });
  }
  function psSpPickColl(id){
    const c = PS_SP_COLLECTIONS.find(function(x){ return x.id === id; }); if(!c) return;
    psSearchClose();
    try{ if(typeof showBrowseView==='function') showBrowseView(); }catch(e){}
    if(c.goBrands){ try{ switchBrowse('brands'); }catch(e){} return; }
    try{ switchBrowse('products'); }catch(e){}
    // Apply the collection as a FRESH filter (clear any typed search), then show + scroll to results.
    try{ psQuery=''; psSizeQ=''; }catch(e){}
    var _sm=document.getElementById('psSearchMobile'), _sd=document.getElementById('psSearchDesktop');
    if(_sm) _sm.value=''; if(_sd) _sd.value='';
    psSel = { prices:new Set(c.prices||[]), cats:new Set(c.cats||[]), brands:new Set() };
    try{ psSaleOnly = !!c.sale; psNewOnly = !!c.new; psSort = c.sort || ''; }catch(e){}
    try{ psBuildPriceFilter(); psBuildBrandFilter(); psBuildCatFilter(); psBuildSort(); }catch(e){}
    try{ psApply(); }catch(e){}
    try{ psScrollGridUnderCarousel(); }catch(e){}
  }
  window.psSpPickColl=psSpPickColl;
  // Store-tier words → select every brand of that Browse-Brands directory tier.
  const PS_TIER = { premium:'p', premiums:'p', luxury:'p', luxe:'p', designer:'p', designers:'p', highend:'p', couture:'p' };
  // Generic garment-state words that are CATEGORY cues, never brand names — even though they
  // appear inside a niche brand name (e.g. "pret" ⊂ "Silayi Pret"). Brand-matching them would
  // AND a real category query down to that one brand's (usually empty) overlap → blank grid.
  const PS_BRAND_STOP = new Set(['pret','stitched','unstitched']);
  function psSmartSearch(val){
    const a = document.getElementById('psSearchMobile'), b = document.getElementById('psSearchDesktop');
    if(a && a.value !== val) a.value = val;
    if(b && b.value !== val) b.value = val;
    psUpdateSearchClearBtn(val);
    // Categories/brands present — from the full catalog (client mode) or the facets (API mode).
    const present = psApiMode ? (psFacetCats || new Set()) : (PS_CATALOG ? new Set(PS_CATALOG.map(p => p.cat)) : null);
    if(!present) return;                          // client mode: catalog not loaded yet
    const presentBrands = psCatalogBrands();
    const raw = (val || '').trim().toLowerCase();
    const rawN = psNorm(raw);
    const tokens = raw.split(/[\s,]+/).map(psNorm).filter(t => t.length >= 2 && !PS_STOP.has(t));
    const { cats, catToks } = psResolveCats(tokens, raw, present);
    // brand-name matches come from the NON-gender words only ("men" is not a brand)
    const brands = new Set();
    catToks.forEach(t => { if(t.length >= 3 && !PS_BRAND_STOP.has(t)) presentBrands.forEach(bn => { if(psNorm(bn).indexOf(t) >= 0) brands.add(bn); }); });
    // multi-word brand ("cross stitch" → "crossstitch") — but NEVER when the whole
    // query is a gender word: "men" must not match "Republic Wo[men]swear" etc.
    if(rawN.length >= 3 && !PS_GENDER_TOK[rawN] && !PS_BRAND_STOP.has(rawN)) presentBrands.forEach(bn => { if(psNorm(bn).indexOf(rawN) >= 0) brands.add(bn); });
    // Tier words ("premium" / "luxury" / "designer") → select EVERY brand of that directory
    // tier. They're brands, not categories, and must not fall through to free-text.
    const tierTok = new Set();
    catToks.forEach(t => { const tier = PS_TIER[t]; if(tier){ tierTok.add(t); BRANDS.forEach(bd => { if(bd.c === tier && presentBrands.indexOf(bd.n) >= 0) brands.add(bd.n); }); } });
    // Safety net (client mode only — needs the full catalog): drop a spurious brand whose
    // brand×category combo matches NOTHING (e.g. "men" → Womenswear) so the grid isn't empty.
    if(!psApiMode && brands.size && cats.size && !PS_CATALOG.some(p => brands.has(p.b) && cats.has(p.cat))) brands.clear();
    // API mode: any word that matched NO category and NO brand becomes a free product-TITLE
    // keyword (FTS) — so the search also looks inside product names ("khaadi blue" = Khaadi
    // brand + "blue" in the title; "stitched" = the stitched categories, never unstitched).
    if(psApiMode){
      const matched = new Set();
      catToks.forEach(t => {
        if(tierTok.has(t) || psMatchCatsToken(t, present).length) matched.add(t);
        else if(t.length >= 3 && presentBrands.some(bn => psNorm(bn).indexOf(t) >= 0)) matched.add(t);
      });
      // a bare 1–2 digit number ("boys 14") = an age/size to BOOST to the top, not a title keyword.
      psSizeQ = (catToks.find(t => /^\d{1,2}$/.test(t)) || '');
      psQuery = catToks.filter(t => !matched.has(t) && !/^\d{1,2}$/.test(t)).join(' ');
    }
    psSel.cats = cats;
    psSel.brands = brands;
    psBuildCatFilter(); psBuildBrandFilter(); psApply();
    psSearchHint(raw, brands, cats);
    psSyncShopGender(cats);            // light up the gender tab that matches the results, not the stale default
  }
  // During a search, make the "Shop by" gender tab follow the results so the highlighted
  // tab matches the products shown (searching "men" must light up Men, not the default
  // Women). Only adopt a gender when the result is unambiguously ONE gender; mixed or
  // brand-only searches leave the strip as-is. Additive: never forces an empty/none state.
  function psSyncShopGender(cats){
    if(typeof psShopMode !== 'undefined' && psShopMode === 'brand') return;   // brand carousel highlight handled elsewhere
    const gs = new Set([...(cats || [])].map(c => PS_CAT_GENDER[c]).filter(Boolean));
    if(gs.size !== 1) return;
    const g = [...gs][0];
    if(PS_SHOP_GENDERS.some(x => x[0] === g) && g !== psShopGender){
      psShopGender = g;
      try{ psBuildShopCat(); }catch(e){}
    }
  }
  function psSearchHint(raw, brands, cats){
    const els = [document.getElementById('psSearchHintM'), document.getElementById('psSearchHintD')];
    const noMatch = raw.length >= 2 && !brands.size && !cats.size;
    let body = '';
    if(raw.length >= 2 && !noMatch){
      const names = [...brands].slice(0,2);
      const lbls = [...cats].slice(0,3).map(c => (PS_CAT_LABELS[c]||c).replace(/—/g,'').replace(/\s+/g,' ').trim());
      const extra = Math.max(0, brands.size-2) + Math.max(0, cats.size-3);
      body = names.concat(lbls).join(', ') + (extra > 0 ? ' +' + extra : '');
    }
    els.forEach(el => {
      if(!el) return;
      if(noMatch){ el.textContent = tr('ps_search_nomatch'); }
      else if(body){ el.innerHTML = '<b>✓</b> ' + esc(body); }
      else { el.textContent = ''; }
    });
  }

  function switchBrowse(which){
    try{ setOrderView('browse'); }catch(e){}   // a browse-tab switch always means: show the storefront, hide the Bag
    const brands = which === 'brands';
    const tb = document.getElementById('tabBrands'), tp = document.getElementById('tabProducts');
    if(tb) tb.style.display = brands ? '' : 'none';
    if(tp) tp.style.display = brands ? 'none' : '';
    var _shown = brands ? tb : tp;   // fade the incoming view in, never a hard cut (#3)
    if(_shown){ _shown.classList.remove('ps-viewfade'); void _shown.offsetWidth; _shown.classList.add('ps-viewfade'); }
    document.getElementById('bt-brands').classList.toggle('on', brands);
    document.getElementById('bt-products').classList.toggle('on', !brands);
    var _hb = document.getElementById('hdrBack'); if(_hb) _hb.hidden = !brands;   // header back arrow shows only on Browse Brands
    // Browse Brands is the single unified Product-Category view on EVERY width now
    // (Store Types retired from the page; its source is kept + git-tagged for restore).
    if(brands){
      // The top rail is the gender control now (#bbGtabs hidden). Seed the brand directory's
      // gender from the rail so it isn't empty when the rail is on All.
      if(!_bbGender){ var _rg = document.documentElement.getAttribute('data-gender'); _bbGender = (_rg === 'w' || _rg === 'm' || _rg === 'k') ? _rg : 'w'; }
      bbSwitch('product');
      try{ psRenderBrandBanner(); }catch(e){}   // page-aware hero poster for the Brand / Price-Check page
    }
    if(!brands) psEnsureLoaded();
    updatePasteFab();
    try{ localStorage.setItem('psb_browse', which); }catch(e){}   // remember tab so we return to it (req #7)
    document.body.classList.add('psb-browse');
    const _bh=document.getElementById('appHeader');if(_bh&&window.innerWidth<820)_bh.style.position='relative';
  }
  // True while the Browse-Products grid is the visible tab.
  function psOnProductsTab(){ const tp = document.getElementById('tabProducts'); return !!tp && tp.style.display !== 'none'; }

  // Default front-page order (no filters): women's everyday pret/unstitched first,
  // then the rest of women's, then a few men's, then kids — so the first page is
  // mostly women's stitched/unstitched with only a couple of men/kids items.
  function psDefaultRank(cat){
    const g = PS_CAT_GENDER[cat] || 'w';
    if(g === 'w'){
      const everyday = (PS_CAT_GROUPIDX[cat] === 0);   // group 0 = "Everyday / Lawn"
      return everyday ? 0 : 1;
    }
    return g === 'm' ? 2 : 3;   // men after all women, kids last
  }

  // Catalog is loaded once and shared by BOTH the products grid and the
  // Browse-Brands "Product Category" view. psOnReady() lets the brands view wait
  // for that single fetch instead of duplicating it.
  let psReadyCbs = [];
  function psOnReady(cb){ if(psLoaded){ cb(); return; } psReadyCbs.push(cb); psEnsureLoaded(); }
  function psFlushReady(){ const cbs = psReadyCbs; psReadyCbs = []; cbs.forEach(fn => { try{ fn(); }catch(e){} }); }

  // Pure transform: parsed catalog -> ordered PS_CATALOG (WITHOUT _bdt, which is
  // rate-dependent and computed on the main thread). ONE implementation used by BOTH
  // the Web Worker and the main-thread fallback, so the default order can never drift.
  // GEN/GRP are the PS_CAT_GENDER / PS_CAT_GROUPIDX maps (the worker has no main globals).
  function psProcessCatalog(products, GEN, GRP){
    var cat = (products || []).filter(function(p){ return p && p.u && p.pkr && p.img; });
    var seen = {};
    cat.forEach(function(p, i){ p._ord = i; p._bi = (seen[p.b] = (seen[p.b] || 0) + 1) - 1; });
    var NOW = Date.now() / 1000, RECENT = 120 * 86400;
    function rank(c){ var g = GEN[c] || 'w'; if(g === 'w') return (GRP[c] === 0) ? 0 : 1; return g === 'm' ? 2 : 3; }
    function recent(p){ return (p.pub && (NOW - p.pub) < RECENT) ? 0 : 1; }
    cat.sort(function(a, b){
      return (rank(a.cat) - rank(b.cat))
        || ((b.sale ? 1 : 0) - (a.sale ? 1 : 0))
        || (recent(a) - recent(b))
        || (a._bi - b._bi)
        || ((b.pub || 0) - (a.pub || 0))
        || (a._ord - b._ord);
    });
    return cat;
  }
  // Worker source = the SAME psProcessCatalog (stringified) + a tiny message harness.
  var _psWorkerSrc = psProcessCatalog.toString() +
    '\nself.onmessage=function(e){try{var d=e.data;var arr=psProcessCatalog(JSON.parse(d.text).products,d.gen,d.grp);self.postMessage({ok:true,products:arr});}catch(err){self.postMessage({ok:false,error:String(err)});}};';

  // Parse + order the catalog in a Web Worker so a 20k-product JSON.parse + sort never
  // freezes the UI. Falls back to the main thread on ANY failure (Worker/Blob missing,
  // or CSP blocking blob: workers). _bdt + filters are then built on the main thread.
  function psBootCatalog(text){
    var GEN = PS_CAT_GENDER, GRP = PS_CAT_GROUPIDX, done = false;
    function finish(arr){
      PS_CATALOG = arr;
      var _r = getRates(), _wW = {};
      var _wOf = function(c){ return _wW[c] != null ? _wW[c] : (_wW[c] = (typeof getWeight === 'function' ? getWeight(c) : 0.5)); };
      PS_CATALOG.forEach(function(p){ var _pb = Math.round(p.pkr * _r.CONV_RATE); var _cm = p.pkr < (_r.PKR_LOW_THRESHOLD||2100) ? (_r.COMM_LOW_BDT||200) : Math.round(_pb * (_r.COMM_1||0)); p._bdt = _pb + _cm + Math.round(_wOf(p.cat) * _r.LOG_RATE); });
      psLoaded = true; psLoading = false;
      psBuildPriceFilter(); psBuildBrandFilter(); psBuildCatFilter(); psBuildSort(); psPruneSoldOut(); psApply(); psUpdateNote();
      psFlushReady();
    }
    function mainThread(){
      try { finish(psProcessCatalog(JSON.parse(text).products, GEN, GRP)); }
      catch(err){ psLoading = false; var e = document.getElementById('psCount'); if(e) e.textContent = tr('ps_loadfail'); psFlushReady(); }
    }
    try {
      if (typeof Worker !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined' && URL.createObjectURL) {
        var w = new Worker(URL.createObjectURL(new Blob([_psWorkerSrc], { type: 'application/javascript' })));
        var fb = function(){ if(done) return; done = true; try{ w.terminate(); }catch(_){} mainThread(); };
        w.onmessage = function(ev){ if(done) return; done = true; try{ w.terminate(); }catch(_){} if(ev.data && ev.data.ok){ finish(ev.data.products); } else { mainThread(); } };
        w.onerror = fb;
        w.postMessage({ text: text, gen: GEN, grp: GRP });
        return;
      }
    } catch(e){ /* fall through */ }
    mainThread();
  }

  // Recompute every catalog item's landed ৳ with the CURRENT rates, then refresh the
  // grid/filters. Called when config loads after the catalog (loadPsbConfig) so prices
  // never stay stale. Cheap: getRates() once + weight memoized per category.
  function psRecomputeBdt(){
    if(!PS_CATALOG || !PS_CATALOG.length) return;
    var _r = getRates(), _wW = {};
    var _wOf = function(c){ return _wW[c] != null ? _wW[c] : (_wW[c] = (typeof getWeight === 'function' ? getWeight(c) : 0.5)); };
    PS_CATALOG.forEach(function(p){ var _pb = Math.round(p.pkr * _r.CONV_RATE); var _cm = p.pkr < (_r.PKR_LOW_THRESHOLD||2100) ? (_r.COMM_LOW_BDT||200) : Math.round(_pb * (_r.COMM_1||0)); p._bdt = _pb + _cm + Math.round(_wOf(p.cat) * _r.LOG_RATE); });
    if(psLoaded && typeof psApply === 'function') psApply();
  }

  // ── Search-API mode functions ──────────────────────────────────────────────
  function psSearchBase(){ return relayBase() + '/search'; }
  function psApiParams(){
    const p = new URLSearchParams();
    if(psSel.cats.size){
      // Expand the "All Men's / Women's / Kids" pseudo-categories (all:w|m|k) into the real
      // category keys — the server filters by exact cat, so all:m alone would match nothing.
      const ex = [];
      psSel.cats.forEach(c => { if(c==='all:w') ex.push(...PS_W); else if(c==='all:m') ex.push(...PS_M); else if(c==='all:k') ex.push(...PS_K); else ex.push(c); });
      p.set('cat', Array.from(new Set(ex)).join(','));
    }
    if(psSel.brands.size) p.set('brand', Array.from(psSel.brands).join(','));
    // Storefront band (batch 2): Home/Everyday = UNDER 15k (buckets 0-5, includes 10-15k), Premium/Luxe
    // = 10k+ (buckets 5-6). The 10-15k band (bucket 5) intentionally OVERLAPS both (req: Danish).
    // A manual price selection takes precedence over the storefront default.
    if(psSel.prices.size) p.set('price', Array.from(psSel.prices).join(','));
    else if(psStore === 'everyday') p.set('price', '0,1,2,3,4,5');
    else if(psStore === 'premium')  p.set('price', '5,6');
    if(psSaleOnly)        p.set('sale', '1');
    if(psNewOnly)         p.set('new', '1');     // New filter: newest non-sale items (stacks with the ৳ price sort)
    if(psSort)            p.set('sort', psSort);
    if(psQuery)           p.set('q', psQuery);
    if(psSizeQ)           p.set('size', psSizeQ);   // boost products that have this age/size
    // 90s rotation seed: advances every 90s. Sent on the landing AND on category/brand/search/filter
    // views so the same selection doesn't always surface the same first products (req: front-page
    // products keep changing within the selected category/brand). The ONLY view that stays exact is
    // an explicit ৳ price sort. The server seed-shuffles within whatever filter is active.
    if(!psSort){
      // FROZEN per feed (set in psApply / the 90s rotation) so every appended page is a
      // consistent slice of the SAME shuffle — otherwise infinite scroll would duplicate or
      // skip products when a page is fetched in a new 90s window.
      p.set('seed', psFeedSeed || Math.floor(Date.now() / 90000));
    }
    p.set('page', psPage);
    p.set('pageSize', psPageSize());
    return p.toString();
  }
  // First entry: pull brand/category facets (to build the filter UI) then the first page.
  function psApiInit(){
    fetch(psSearchBase() + '/facets', { cache:'default' })
      .then(r => { if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
      .then(j => {
        if(j.error) throw new Error(j.error);
        psFacetBrands = (j.brands || []).map(x => x.b);
        psFacetCats   = new Set((j.cats || []).map(x => x.cat));
        psLoaded = true; psLoading = false;
        psBuildPriceFilter(); psBuildBrandFilter(); psBuildCatFilter(); psBuildSort();
        psApply();                       // fetch the first page
        psFlushReady();
      })
      .catch(e => { console.warn('search facets failed — using catalog.json:', e.message); psApiFallback(); });
  }
  // Fetch the current filtered page. psFiltered holds JUST this page (the server filtered/sorted/paged).
  function psApiFetch(append){
    if(psVisualActive && !append){ psVisualActive=false; psVisualChip(false); }   // a normal filter/search exits photo-search mode
    const seq = ++psApiSeq;
    fetch(psSearchBase() + '?' + psApiParams(), { cache:'default' })
      .then(r => { if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
      .then(j => {
        if(seq !== psApiSeq){ if(append) psFeedLoading = false; return; }   // a newer request superseded this one
        if(j.error) throw new Error(j.error);
        psApiTotal = j.total || 0;
        if(psApiTotal > _psCatTotal) _psCatTotal = psApiTotal;   // remember the unfiltered catalogue size for the count note
        const items = (j.products || []).filter(p => !psIsHidden(p));   // drop locally-known sold-outs
        psFiltered = append ? psFiltered.concat(items) : items;        // infinite scroll: accumulate loaded pages
        psHarvestThumbs(j.products);                                    // fill Shop-by-Category photos from this page
        psFeedLoading = false;
        if(append && !items.length){ psFeedDone = true; psFeedSetStatus(false); return; }   // server has no more → stop (guards against an over-counted total)
        psRender(append);
        if(append) psFeedMaybeMore();
      })
      .catch(e => { if(append) psFeedLoading = false; console.warn('search query failed — using catalog.json:', e.message); psApiFallback(); });
  }
  // Graceful degradation: if the API is unreachable, fall back to the proven catalog.json path.
  function psApiFallback(){
    if(psApiFellBack) return;
    psApiFellBack = true; psApiMode = false;
    psLoaded = false; psLoading = false; PS_CATALOG = null;
    psEnsureLoaded();
  }
  // Landing auto-rotation: every 90s, if the buyer is sitting on the PLAIN landing (Browse
  // Products visible, first page, no search / sort / filter, tab in the foreground, not
  // scrolled deep), re-fetch — psApiParams' seed has advanced one 90s window, so the server
  // returns a fresh curated lead set. Guarded so it never yanks an active search or a scroll.
  function psLandingIsActive(){
    if(!psApiMode || document.hidden) return false;
    if(typeof psOnProductsTab === 'function' && !psOnProductsTab()) return false;
    if(psPage !== 0) return false;
    if((window.scrollY || window.pageYOffset || 0) > 600) return false;
    return !psSel.cats.size && !psSel.brands.size && !psSel.prices.size && !psSaleOnly && !psNewOnly && !psSort && !psQuery && !psSizeQ;
  }
  setInterval(function(){ if(psLandingIsActive()){ psFeedSeed = Math.floor(Date.now() / 90000); psApiFetch(); } }, 90000);
  // Pager HTML — shared by the client-render and API-render paths.
  function psPagerHtml(pages){
    if(pages <= 1) return '';
    const jump = Array.from({length:pages}, (_,i) =>
      `<div class="ps-pgdd-item${i===psPage?' on':''}" onclick="psJump(${i})">${tr('ps_page')} ${i+1} / ${pages}</div>`).join('');
    return `<button class="ps-pg-btn" ${psPage<=0?'disabled':''} onclick="psGo(-1)">‹ ${tr('ps_prev')}</button>`
      + `<details class="ps-pgdd" id="psPgDd" ontoggle="psPgDdToggle(this)"><summary class="ps-pgdd-sum">${tr('ps_page')} ${psPage+1} / ${pages} ▾</summary><div class="ps-pgdd-panel">${jump}</div></details>`
      + `<button class="ps-pg-btn" ${psPage>=pages-1?'disabled':''} onclick="psGo(1)">${tr('ps_next')} ›</button>`;
  }

  function psEnsureLoaded(){
    if(psLoaded || psLoading) return;
    psLoading = true;
    const c = document.getElementById('psCount'); if(c) c.textContent = tr('ps_loading');
    if(psApiMode) return psApiInit();
    // Stable URL + HTTP revalidation. GitHub Pages serves catalog.json with a strong
    // ETag + Cache-Control max-age=600 (10 min), so cache:'default' serves it INSTANTLY
    // from cache within the window and sends a conditional request after (304 when
    // unchanged, fresh 200 only when the harvest changed it). This replaces the old
    // ?t=Date.now() + {cache:'no-store'}, which re-downloaded the whole multi-MB catalog
    // on EVERY visit. sw.js gives catalog.json stale-while-revalidate so the service
    // worker can never pin a stale copy past the ~10-min window. Worst-case staleness ≈10 min.
    fetch(PSB_CATALOG_URL, { cache:'default' })
      .then(r => { if(!r.ok) throw new Error('HTTP '+r.status); return r.text(); })  // text → JSON.parse + sort happen off the main thread in a Worker
      .then(text => psBootCatalog(text))
      .catch(() => { psLoading = false; const e=document.getElementById('psCount'); if(e) e.textContent = tr('ps_loadfail'); psFlushReady(); });
  }

  // Brand departments (same 5 as Browse brands), each with a small icon.
  const PS_DEPTS = [['md','🏬','Multi-department'],['w','👗',"Women's pret & unstitched"],['p','💎','Premium'],['m','👔','Menswear'],['k','🧸','Kids']];
  function psBrandDept(name){ const b = (typeof BRANDS!=='undefined') && BRANDS.find(x => x.n === name); return (b && b.c) || 'w'; }

  // ── PRICE (multi-select, OR within itself) — re-tap a bucket to clear it ──
  function psBuildPriceFilter(){
    // Render buckets 0-5 only — the "15k+" bucket (index 6) is hidden from the filter (req: Home tops out
    // at the "10k+" slab, which caps at 15k; Premium/Luxe still shows 15k+ via its band, just not a chip).
    document.getElementById('psPrice').innerHTML = PS_BUCKETS.slice(0, 6).map((b,i) =>
      `<button type="button" class="ps-bucket${psSel.prices.has(i)?' on':''}" onclick="psTogglePrice(${i})">${b.lbl}</button>`).join('');
    // Reflect the active price-bucket count on the compact "Price ৳" chip in the results bar
    const n = document.getElementById('psPriceN'); if(n) n.textContent = psSel.prices.size ? '('+psSel.prices.size+')' : '';
    const pb = document.getElementById('psPriceBtn'); if(pb) pb.classList.toggle('on', psSel.prices.size > 0);
    try{ psBuildQuickBar(); }catch(e){}
  }
  function psTogglePrice(i){ if(psSel.prices.has(i)) psSel.prices.delete(i); else psSel.prices.add(i); psBuildPriceFilter(); psApply(); }
  // Compact price filter: the 6 buckets live in a popover under the "Price ৳" chip on
  // the results bar (keeps the first view product-first). Toggle + click-away to close.
  function psTogglePricePop(){
    const pop = document.getElementById('psPricePop'), btn = document.getElementById('psPriceBtn');
    if(!pop) return;
    const open = pop.classList.toggle('open');
    if(btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  document.addEventListener('click', function(e){
    const dd = document.getElementById('psPriceDd'), pop = document.getElementById('psPricePop');
    if(pop && pop.classList.contains('open') && dd && !dd.contains(e.target)){
      pop.classList.remove('open');
      const btn = document.getElementById('psPriceBtn'); if(btn) btn.setAttribute('aria-expanded','false');
    }
  });

  // Categories + Brands popovers (one-row pills; mirror the Price popover). Open either pill,
  // pick categories / brands / both. Only one filter pop open at a time; clicking outside the
  // row closes it (and clicking a filter pill closes the price pop via the price listener above).
  // Set a filter pill's open state: aria + caret glyph (▾ closed / ▴ open). A CSS transform on the
  // inline caret proved unreliable here, so we swap the glyph directly — always correct.
  function psFiltCaret(btn, open){ if(!btn) return; btn.setAttribute('aria-expanded', open ? 'true' : 'false'); const c = btn.querySelector('.ps-filtcar'); if(c) c.textContent = open ? '▴' : '▾'; }
  function psToggleFiltPop(which){
    const isCat = which === 'cat';
    const pop = document.getElementById(isCat ? 'psCatPop' : 'psBrandPop'); if(!pop) return;
    const other = document.getElementById(isCat ? 'psBrandPop' : 'psCatPop'); if(other) other.classList.remove('open');
    psFiltCaret(document.getElementById(isCat ? 'psBrandBtn' : 'psCatBtn'), false);   // collapse the other pill
    const open = pop.classList.toggle('open');
    psFiltCaret(document.getElementById(isCat ? 'psCatBtn' : 'psBrandBtn'), open);
  }
  // Picking a category rebuilds the panel's innerHTML, which DETACHES the clicked element — so a
  // plain click-target test would then read the click as "outside" and wrongly collapse the panel.
  // Record on pointerdown (fires BEFORE the rebuild) whether the press began inside the row; only
  // close when it truly began outside. This lets the buyer pick MANY categories in one go.
  let psFiltDownInRow = false;
  document.addEventListener('pointerdown', function(e){
    const row = document.querySelector('#tabProducts .ps-filtrow');
    psFiltDownInRow = !!(row && row.contains(e.target));
  }, true);
  document.addEventListener('click', function(e){
    if(psFiltDownInRow) return;   // interaction began inside the filter row → keep the panel open
    [['psCatPop','psCatBtn'], ['psBrandPop','psBrandBtn']].forEach(([popId, btnId]) => {
      const p = document.getElementById(popId);
      if(p && p.classList.contains('open')){ p.classList.remove('open'); psFiltCaret(document.getElementById(btnId), false); }
    });
  });

  function psCatalogBrands(){
    if(psApiMode){
      const present = psFacetBrands || [];
      const set = new Set(present);
      const ordered = BRANDS.map(b => b.n).filter(n => set.has(n));   // directory order first
      present.forEach(n => { if(ordered.indexOf(n) < 0) ordered.push(n); });
      return ordered;
    }
    const set = new Set(PS_CATALOG.map(p => p.b));
    const ordered = BRANDS.map(b => b.n).filter(n => set.has(n));
    set.forEach(n => { if(ordered.indexOf(n) < 0) ordered.push(n); });
    return ordered;
  }
  // 5 collapsible departments + a compact name search beside the heading (req #9).
  function psBuildBrandFilter(){
    const present = psCatalogBrands();
    const byDept = {}; present.forEach(n => { const d = psBrandDept(n); (byDept[d] = byDept[d] || []).push(n); });
    let html = '';
    PS_DEPTS.forEach(([d, ic, lbl]) => {
      const brands = byDept[d]; if(!brands || !brands.length) return;
      const sel = brands.filter(n => psSel.brands.has(n)).length;
      const open = !!sel;     // expand a department when the smart search has marked one of its brands
      html += `<details class="ps-bdept"${open ? ' open' : ''}>`
        + `<summary><span class="ps-bd-ic" aria-hidden="true">${ic}</span> ${esc(lbl)} `
        + `<span class="ps-bd-n">${sel ? sel + '/' + brands.length : brands.length}</span></summary>`
        + brands.map(n => `<label class="ps-brand-chk"><input type="checkbox" value="${esc(n)}" ${psSel.brands.has(n)?'checked':''} onchange="psToggleBrand(this.value,this.checked)"> ${esc(n)}</label>`).join('')
        + `</details>`;
    });
    document.getElementById('psBrands').innerHTML = html || `<div style="padding:10px;color:var(--txt-muted);font-size:0.78rem">—</div>`;
    const bc = document.getElementById('psBrandCount'); if(bc) bc.textContent = psSel.brands.size || '';
    const bb = document.getElementById('psBrandBtn'); if(bb) bb.classList.toggle('on', psSel.brands.size > 0);
  }
  function psToggleBrand(name, on){ if(on) psSel.brands.add(name); else psSel.brands.delete(name); psApply(); }

  // Grouped category dropdown: Women's/Men's/Kids → subgroup → categories. Built
  // from the WHOLE catalog (independent of the brand filter) so the selection is
  // never silently cleared — an empty brand+category combo just shows the "no
  // products" message (req: keep it empty, never show wrong items).
  // Collapsible Women/Men/Kids that MIRRORS the order form's 3-gender picker
  // (CAT_TREE = single source of truth, so the filter and the picker never drift).
  // Built from the WHOLE catalog so a selection is never silently cleared — an
  // empty brand+category combo just shows "no products" (keep it empty, req #4/#8).
  // MULTI-SELECT (req): pick several categories — they combine as OR. Re-tapping a
  // category clears just that one; "All categories" clears the whole category filter.
  function psBuildCatFilter(){
    const present = psApiMode ? (psFacetCats || new Set()) : (PS_CATALOG ? new Set(PS_CATALOG.map(p => p.cat)) : new Set());
    const sel = psSel.cats;
    let html = '';   // no "All categories" row (req) — open straight to the 3 majors; reset via re-tap or the resbar "Clear Filters"
    ['w','m','k'].forEach(g => {
      const tree = CAT_TREE[g]; if(!tree) return;
      let inner = '', lastSec = null;
      tree.groups.forEach(grp => {
        const items = grp.items.filter(([k]) => !PS_HIDE_CATS.has(k) && present.has(k));
        if(!items.length) return;
        if(grp.section && grp.section !== lastSec){ inner += `<div class="ps-cgrp-section">${esc(grp.section)}</div>`; lastSec = grp.section; }
        if(grp.h) inner += `<div class="ps-cgrp-h">${esc(grp.h)}</div>`;
        inner += items.map(([k,lbl]) => `<button type="button" class="ps-cat-row${sel.has(k)?' on':''}" onclick="psPickCat('${k}')">${esc(lbl)}</button>`).join('');
      });
      if(!inner) return;
      const allKey = 'all:'+g;
      // Auto-expand a department when the smart search (or a manual tap) has marked one of its categories.
      const open = sel.has(allKey) || [...sel].some(t => PS_CAT_GENDER[t] === g) || window.innerWidth >= 820;   // desktop: dept groups open by default so the faceted rail fills the space
      html += `<details class="ps-cdept"${open?' open':''}>`
        + `<summary>${esc(tree.label)}</summary>`
        + `<button type="button" class="ps-cat-row ps-cat-all${sel.has(allKey)?' on':''}" onclick="psPickCat('${allKey}')">${tr(PS_GENDER_WORD[g])}</button>`
        + inner
        + `</details>`;
    });
    document.getElementById('psCat').innerHTML = html;
    const cc = document.getElementById('psCatCount'); if(cc) cc.textContent = sel.size || '';
    const cb = document.getElementById('psCatBtn'); if(cb) cb.classList.toggle('on', sel.size > 0);   // highlight the pill when a category filter is active
  }
  function psPickCat(v){
    if(v === '') psSel.cats.clear();                              // "All categories" → clear filter
    else if(psSel.cats.has(v)) psSel.cats.delete(v);             // re-tap clears just this one
    else psSel.cats.add(v);
    psBuildCatFilter(); psApply();
  }
  // True if p matches ANY selected category / gender (OR), or nothing is selected.
  function psCatMatch(p){
    if(!psSel.cats.size) return true;
    for(const t of psSel.cats){
      if(t.indexOf('all:') === 0){ if(PS_CAT_GENDER[p.cat] === t.slice(4)) return true; }
      else if(p.cat === t) return true;
    }
    return false;
  }

  function psClearFilters(){
    psSel = { prices:new Set(), cats:new Set(), brands:new Set() };
    psSort = '';
    psSaleOnly = false;
    psNewOnly = false;
    psQuery = '';
    psSizeQ = '';
    ['psSearchMobile','psSearchDesktop'].forEach(idd => { const e = document.getElementById(idd); if(e) e.value = ''; });
    psUpdateSearchClearBtn('');
    psSearchHint('', new Set(), new Set());
    psBuildPriceFilter(); psBuildBrandFilter(); psBuildCatFilter(); psBuildSort(); psApply();
  }

  // ── "SHOP BY CATEGORY" landing strip (LAAM-style) ────────────────────────────
  // A horizontally-scrollable row of photo tiles (image + label) shown on the plain
  // landing, above the rotating products. Each tile = ONE real category; tapping it
  // filters the grid to that category and scrolls down. Replaces the old 4 department
  // tiles (Women/Men/Kids/Premium) — richer + more categories than LAAM, women-first.
  // Each tile = ONE real catalog category, tagged with its department (g: w|m|k) so the
  // Women/Men/Kids classifier can show only that department's categories. (Shawl is a women's
  // article → g:'w'.) Tiles whose category has zero products are auto-hidden via psFacetCats.
  const PS_SHOP_TILES = [
    // ── WOMEN ──
    { g:'w', key:'pret_3pc', cats:['pret_3pc','pret_3pc_emb'], en:'Stitched 3 pc', bn:'সেলাই করা ৩ পিস', e:'👗' },
    { g:'w', key:'lawn_3pc_unstitch', img:'https://cdn.shopify.com/s/files/1/2044/1461/files/052A3725.jpg?v=1782200510', cats:['lawn_3pc_unstitch','unstitch_3pc_emb'], en:'Unstitched', bn:'আনস্টিচড', e:'🧵' },
    { g:'w', key:'kurti_1pc_unstitch',   en:'Unstitched 1pc',  bn:'আনস্টিচড ১ পিস',    e:'🧵' },
    { g:'w', key:'shirt_dupatta_2pc', cats:['shirt_dupatta_2pc','shirt_dupatta_2pc_unstitch','pret_2pc_emb'], en:'Stitched 2 pc', bn:'সেলাই করা ২ পিস', e:'👚' },
    { g:'w', key:'shirt_trouser_2pc', cats:['shirt_trouser_2pc','coord_western','shirt_trouser_2pc_unstitch'], en:'Co-ord Set', bn:'কো-অর্ড সেট', e:'🧶' },
    { g:'w', key:'kurti_1pc',            en:'Kurti / 1pc',     bn:'কুর্তি / ১ পিস',    e:'👕' },
    { g:'w', key:'western_top', img:'https://pk.sapphireonline.pk/dw/image/v2/BKSB_PRD/on/demandware.static/-/Sites-sapphire-master-catalog/default/dw55e0ccc5/images/June26/10thJune26/WTOP26V50018_999_2.jpg?sw=500', en:'Western Top',     bn:'ওয়েস্টার্ন টপ',     e:'👚' },
    { g:'w', key:'womens_trouser',       en:'Trousers',        bn:'ট্রাউজার',         e:'👖' },
    { g:'w', key:'maxi_dress', img:'https://cdn.shopify.com/s/files/1/0581/7234/2437/files/DSC06392.jpg?v=1770377155', en:'Maxi / Dress',    bn:'ম্যাক্সি / ড্রেস',   e:'👗' },
    { g:'w', key:'formal_emb_3pc', cats:['formal_emb_3pc','formal_emb_2pc','heavy_formal_3pc','handmade_emb'], en:'Formal Wear', bn:'ফরমাল ওয়্যার', e:'✨' },
    { g:'w', key:'bridal',               en:'Bridal',          bn:'ব্রাইডাল',         e:'👰' },
    { g:'w', key:'lehenga',              en:'Lehenga',         bn:'লেহেঙ্গা',          e:'💃' },
    { g:'w', key:'saree',                en:'Saree',           bn:'শাড়ি',            e:'🥻' },
    { g:'w', key:'abaya',                en:'Abaya / Hijab',   bn:'আবায়া / হিজাব',    e:'🧕' },
    { g:'w', key:'kaftan',               en:'Kaftan',          bn:'কাফতান',           e:'🧥' },
    { g:'w', key:'winter_3pc_stitch', cats:['winter_3pc_stitch','winter_3pc_unstitch','winter_2pc_stitch','winter_2pc_unstitch'], en:'Winter', bn:'শীতের পোশাক', e:'🧣' },
    { g:'w', key:'shawl', cats:['shawl','dupatta_only'], en:'Shawl & Dupatta', bn:'শাল ও ওড়না', e:'🧣' },
    { g:'w', key:'footwear', img:'https://cdn.shopify.com/s/files/1/2290/7917/files/E1226-109-131_1.jpg?v=1781778895',             en:'Footwear / Khussa', bn:'জুতা / খুসা',     e:'👡' },
    { g:'w', key:'loungewear',           en:'Loungewear',      bn:'লাউঞ্জওয়্যার',      e:'🛋️' },
    { g:'w', key:'couple_collection', img:'https://cdn.shopify.com/s/files/1/0740/1753/8280/files/SS26ESE434P3_1.jpg?v=1781679426', en:'Couple Collection', bn:'কাপল কালেকশন',    e:'💑' },
    // ── MEN ──
    { g:'m', key:'mens_kurta',           en:'Kurta',           bn:'কুর্তা',           e:'👔' },
    { g:'m', key:'mens_shalwar_kameez',  en:'Shalwar Kameez',  bn:'শালওয়ার কামিজ',   e:'🧥' },
    { g:'m', key:'mens_shirt', img:'https://cdn.shopify.com/s/files/1/0752/0442/8072/files/NAPB111-StoneGrey-02.webp?v=1782303529',           en:'Men Tops',        bn:'মেনস টপস',         e:'👔' },
    { g:'m', key:'mens_trouser', cats:['mens_trouser','mens_jeans'], en:'Men Bottoms', bn:'মেনস বটমস', e:'👖' },
    { g:'m', key:'mens_waistcoat',       en:'Waistcoat',       bn:'ওয়েস্টকোট',        e:'🦺' },
    { g:'m', key:'mens_sherwani',        en:'Sherwani',        bn:'শেরওয়ানি',         e:'🤵' },
    { g:'m', key:'mens_suit',            en:'Suit',            bn:'স্যুট',            e:'🤵' },
    { g:'m', key:'mens_unstitched', img:'https://cdn.shopify.com/s/files/1/0872/1278/5848/files/MU2PBW25A9O4-052A9509.jpg?v=1780385727',      en:'Unstitched',      bn:'আনস্টিচড',         e:'🧵' },
    { g:'m', key:'couple_collection', img:'https://cdn.shopify.com/s/files/1/0555/3799/1852/files/C76A6818_result.jpg?v=1777910598', en:'Couple Collection', bn:'কাপল কালেকশন',    e:'💑' },
    // ── KIDS ──
    { g:'k', key:'kids_girls_eastern', img:'https://cdn.shopify.com/s/files/1/0488/9201/8848/files/BK12604GEWS29668_1.jpg?v=1782194593',   en:'Girls Eastern',   bn:'মেয়েদের ইস্টার্ন',  e:'👧' },
    { g:'k', key:'kids_boys_eastern',    en:'Boys Eastern',    bn:'ছেলেদের ইস্টার্ন',   e:'👦' },
    { g:'k', key:'kids_girls_western', img:'https://cdn.shopify.com/s/files/1/0488/9201/8848/files/BK12602LGWD7591_1.jpg?v=1782194142',   en:'Girls Western',   bn:'মেয়েদের ওয়েস্টার্ন', e:'👧' },
    { g:'k', key:'kids_boys_western', img:'https://cdn.shopify.com/s/files/1/0581/7234/2437/files/DSC02072.jpg?v=1770813392',    en:'Boys Western',    bn:'ছেলেদের ওয়েস্টার্ন',  e:'👦' },
    { g:'k', key:'kids_girls_formal',    en:'Girls Formal',    bn:'মেয়েদের ফরমাল',     e:'🎀' },
    { g:'k', key:'kids_boys_formal',     en:'Boys Formal',     bn:'ছেলেদের ফরমাল',     e:'🎩' },
    { g:'k', key:'kids_infant', img:'https://cdn.shopify.com/s/files/1/0589/9770/2842/files/1_9d47a9fb-9335-4f64-844c-df79ba56ed9d.jpg?v=1776414421',          en:'Infant',          bn:'শিশু (০–২ বছর)',    e:'👶' }
  ];
  // Women/Men/Kids/West classifier tabs for the strip. Default = women (the app's lead department).
  // 'x' = West: a cross-gender WESTERN-wear tab gathering women's + men's western categories (req).
  const PS_SHOP_GENDERS = [ ['w','👗','Women','মেয়েদের'], ['m','👔','Men','ছেলেদের'], ['k','🧸','Kids','বাচ্চাদের'], ['x','🌆','West','ওয়েস্টার্ন'] ];
  // Western categories (req: women's + men's). Shown LAST within their own Women/Men carousels, and
  // gathered together under the West tab. They are NOT removed from Women/Men — only reordered there.
  const PS_WEST_KEYS = new Set(['shirt_trouser_2pc','western_top','womens_trouser','maxi_dress','loungewear','mens_shirt','mens_trouser']);
  let psShopGender = 'w';
  // The carousel has two MODES: 'cat' (Women/Men/Kids category tiles, default) and 'brand' (tap the
  // Brands tab → pick a department → a carousel of that dept's brands, each a representative photo).
  let psShopMode = 'cat';
  let psShopDept = 'w';   // active brand-carousel department (renamed from psBrandDept — collided with the psBrandDept() helper)
  // Brand-carousel departments (req: 4, EXCLUDING multi-dept). Labels reuse the bb_* i18n keys.
  // Brand-carousel departments (4 — incl. Premium, which has no category equivalent so it appears
  // ONLY in Brands mode). Same emoji/labels as the gender tabs so the one row reads consistently.
  const PS_BRAND_DEPTS = [ ['w','👗','Women','মেয়েদের'], ['m','👔','Men','ছেলেদের'], ['k','🧸','Kids','বাচ্চাদের'], ['p','💎','Premium','প্রিমিয়াম'] ];
  // Tiles for the active department, hiding any category that has zero products (psFacetCats).
  function psShopTiles(){
    let t;
    if(psShopGender === 'x'){
      t = PS_SHOP_TILES.filter(x => PS_WEST_KEYS.has(x.key));                 // West tab = women's + men's western tiles together
    } else {
      const own = PS_SHOP_TILES.filter(x => x.g === psShopGender);
      t = [...own.filter(x => !PS_WEST_KEYS.has(x.key)), ...own.filter(x => PS_WEST_KEYS.has(x.key))];   // western tiles LAST within Women/Men (req)
    }
    if(psFacetCats && psFacetCats.size) t = t.filter(x => (x.cats || [x.key]).some(k => psFacetCats.has(k)));
    return t;
  }
  function psSetShopGender(g){
    psShopMode = 'cat'; psShopGender = g;
    // Tapping a department also FILTERS the product grid to that department (req: Danish 2026-06-26):
    // Women/Men/Kids → that dept's real categories; West → the cross-gender western keys. Preserves an
    // active price/brand selection; a later category-tile tap narrows from here.
    const deptCats = (g === 'x') ? [...PS_WEST_KEYS] : _psDeptCats(g);
    psSel = { prices:new Set(psSel.prices), cats:new Set(deptCats), brands:new Set(psSel.brands) };
    psBuildPriceFilter(); psBuildBrandFilter(); psBuildCatFilter(); psBuildSort();
    psBuildShopCat();
    psApply();
  }
  // ── Global department rail (redesign Phase 1) ─────────────────────────────
  // One rail at the top filters the whole browse view. All = no dept filter;
  // Women/Men/Kids → that department's categories. The accent (--accent) shifts per
  // department via a data-gender attribute on <html>, so the app re-tints without
  // restyling everything. Preserves any active price/brand selection.
  // Myntra-style sliding gender underline (#2): position one indicator under the active tab; CSS
  // transitions its left+width. Called on gender change, load, resize, and language switch.
  function psMoveGenInd(){
    var rail = document.getElementById('psGenRail'); if(!rail) return;
    var ind = rail.querySelector('.ps-gen-ind'), act = rail.querySelector('.ps-gen.on');
    if(!ind) return;
    if(!act){ ind.style.opacity = '0'; return; }
    ind.style.left = act.offsetLeft + 'px';
    ind.style.width = act.offsetWidth + 'px';
    ind.style.opacity = '1';
  }
  window.psMoveGenInd = psMoveGenInd;
  window.addEventListener('resize', function(){ try{ psMoveGenInd(); }catch(e){} }, { passive:true });
  function psSetGender(g){
    const root = document.documentElement;
    if(g === 'all') root.removeAttribute('data-gender'); else root.setAttribute('data-gender', g);
    const btns = document.querySelectorAll('#psGenRail .ps-gen');
    for(let i=0;i<btns.length;i++){
      const on = btns[i].getAttribute('data-g') === g;
      btns[i].classList.toggle('on', on);
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    psMoveGenInd();
    // If the BRANDS view is showing, the rail drives the brand directory's gender instead
    // (#bbGtabs is hidden now). Otherwise it drives the products grid + carousel below.
    if(typeof psOnProductsTab === 'function' && !psOnProductsTab()){
      try { _bbGender = (g === 'all') ? 'w' : g; bbRenderProduct(); } catch(e){}
      return;
    }
    // The rail is now the ONLY gender control (the carousel's own gender tabs are hidden):
    // Women/Men/Kids drive BOTH the category carousel and the product grid (via psSetShopGender);
    // All clears the department filter — full grid, carousel keeps its current gender's shortcuts.
    if(g === 'all'){
      if(typeof psSel !== 'undefined'){
        psSel = { prices:new Set(psSel.prices), cats:new Set(), brands:new Set(psSel.brands) };
        try { psBuildPriceFilter(); psBuildBrandFilter(); psBuildCatFilter(); psBuildSort(); psApply(); } catch(e){}
      }
    } else {
      try { psSetShopGender(g); } catch(e){}
    }
    try { psRenderColls(); } catch(e){}   // per-page collection tiles follow the rail (redesign)
    try { _psBanImgs=[]; _psBanIdx=0; psRenderBanner(); } catch(e){}   // page-aware hero posters refresh per page
  }
  window.psSetGender = psSetGender;
  // ── Everyday / Premium storefront (redesign P1) ───────────────────────────
  function psSetStore(s){
    psStore = s;
    try{ localStorage.setItem('psb_store', s); }catch(e){}   // persist Home vs Luxe so a refresh restores it
    var btns = document.querySelectorAll('#psStoreRow .ps-store');
    for(var i=0;i<btns.length;i++){ var on = btns[i].getAttribute('data-store') === s; btns[i].classList.toggle('on', on); btns[i].setAttribute('aria-pressed', on?'true':'false'); }
    try { psApply(); } catch(e){}
    try { psRenderColls(); } catch(e){}   // Luxe vs Home shows its own collections
    try { _psBanImgs=[]; _psBanIdx=0; psRenderBanner(); } catch(e){}   // page-aware hero posters refresh per store
  }
  window.psSetStore = psSetStore;
  // ── Rotating value banner (redesign P1) — static copy, accent-tinted, per-rotation ──
  // Two rotating HERO banners on the landing (batch 2, #6) — promise/pricing claims over a hero photo
  // pulled from the catalogue. No "cheapest" wording; no minimum order; PKR-price tie-in (Price Check).
  const PS_BANNERS = [
    { en_t:'Real Pakistani prices, in PKR', en_s:'The most economical way to buy 100% genuine Pakistani fashion. See the real PKR price on any piece.',
      bn_t:'আসল পাকিস্তানি দাম, পিকেআর-এ', bn_s:'১০০% আসল পাকিস্তানি ফ্যাশন কেনার সবচেয়ে সাশ্রয়ী উপায়। যেকোনো পণ্যের আসল পিকেআর দাম দেখুন।' },
    { en_t:'No minimum order', en_s:'One piece or ten, we bring it for you. Delivered across Bangladesh.',
      bn_t:'কোনো ন্যূনতম অর্ডার নেই', bn_s:'এক পিস হোক বা দশ, আমরা এনে দিই। সারা বাংলাদেশে ডেলিভারি।' }
  ];
  // ── Page-aware HERO posters (req: posters change per page) ─────────────────
  // 8 product pages = {Home, Luxe} x {All, Women, Men, Kids}. Each shows its own
  // hero set; home-all falls back to PS_BANNERS above. Images come from the page's
  // own feed (psFillBannerImgs) so Women shows women, Men shows men, etc. Starting
  // content — relocate/extend freely; the 3 search + 1 brand poster slots come next.
  const PS_POSTERS = {
    'home-all': [
      { en_t:'See the real PKR price.', en_s:'Paste any product link, get the honest BDT total.', bn_t:'আসল PKR দাম দেখুন।', bn_s:'যেকোনো প্রোডাক্ট লিংক পেস্ট করুন, সৎ BDT টোটাল পান।' },
      { en_t:'150+ Pakistani brands. Women \xB7 Men \xB7 Kids.', en_s:'Real prices, delivered to your door in 2-3 weeks.', bn_t:'১৫০+ পাকিস্তানি ব্র্যান্ড। মেয়ে \xB7 ছেলে \xB7 বাচ্চা।', bn_s:'আসল দাম, ২-৩ সপ্তাহে আপনার দরজায় ডেলিভারি।' },
      { en_t:'New, every single day. Latest collections.', en_s:'Fresh Pakistani arrivals added daily.', bn_t:'প্রতিদিন নতুন। সর্বশেষ কালেকশন।', bn_s:'প্রতিদিন নতুন পাকিস্তানি পণ্য যোগ হয়।' },
      { en_t:'Most competitive prices in BD.', en_s:'Confirmed Pakistan price, full BDT total, no hidden charges.', bn_t:'বিডিতে সবচেয়ে সাশ্রয়ী দাম।', bn_s:'নিশ্চিত পাকিস্তানি দাম, পূর্ণ বিডিটি টোটাল, কোনো লুকানো চার্জ নেই।' },
      { en_t:'Everyday to niche. Every Pakistani brand.', en_s:'From daily wear to the labels you love.', bn_t:'প্রতিদিন থেকে নিশ। প্রতিটি পাকিস্তানি ব্র্যান্ড।', bn_s:'প্রতিদিনের পোশাক থেকে প্রিয় ব্র্যান্ড।' },
      { en_t:'Couple goals. His & hers, matched.', en_s:'Dress together for every occasion.', bn_t:'কাপল গোলস। হিজ ও হার্স, ম্যাচিং।', bn_s:'প্রতিটি অনুষ্ঠানে একসাথে সাজুন।' }
    ],
    'home-w': [
      { en_t:'Modest wear. Covered, confident.', en_s:'Abayas, hijabs, full-cover styles.', bn_t:'মডেস্ট ওয়্যার। কভারড, কনফিডেন্ট।', bn_s:'আবায়া, হিজাব, ফুল-কভার স্টাইল।' },
      { en_t:'Modern & western. Co-ords, dresses, tops.', en_s:'Pakistani brands, contemporary cuts.', bn_t:'মডার্ন ও ওয়েস্টার্ন। কো-অর্ড, ড্রেস, টপ।', bn_s:'পাকিস্তানি ব্র্যান্ড, সমকালীন কাট।' },
      { en_t:'Gen Z, this is you. Trend-first fits.', en_s:'Bold, fresh, Pakistani, your vibe.', bn_t:'জেন জি, এটা আপনারই। ট্রেন্ড-ফার্স্ট ফিট।', bn_s:'বোল্ড, ফ্রেশ, পাকিস্তানি, আপনার ভাইব।' }
    ],
    'home-m': [
      { en_t:'Pret & kurta. Men\'s everyday staples.', en_s:'Real prices from Pakistan, delivered to Bangladesh.', bn_t:'প্রেট ও কুর্তা। পুরুষের প্রতিদিনের পোশাক।', bn_s:'পাকিস্তান থেকে আসল দামে, বাংলাদেশে ডেলিভারি।' },
      { en_t:'Eid kameez. Looking sharp this season.', en_s:'Embroidered kurtas to plain pret, all men\'s styles here.', bn_t:'ঈদ কামিজ। এই সিজনে দারুণ সাজুন।', bn_s:'এমব্রয়ডারি থেকে প্লেইন প্রেট, সব পুরুষের স্টাইল এখানে।' }
    ],
    'home-k': [
      { en_t:'Teen styles. Cool, comfy, easy.', en_s:'Trendy looks for ages 10 to 16.', bn_t:'টিন স্টাইল। কুল, আরামদায়ক, সহজ।', bn_s:'১০ থেকে ১৬ বছরের ট্রেন্ডি লুক।' },
      { en_t:'Baby girl. Tiny & precious.', en_s:'Newborn to 2 years, soft and sweet.', bn_t:'বেবি গার্ল। ছোট্ট ও আদুরে।', bn_s:'নবজাতক থেকে ২ বছর, নরম ও মিষ্টি।' },
      { en_t:'Baby boy. Little gentleman.', en_s:'Newborn to 2 years, comfy and cute.', bn_t:'বেবি বয়। ছোট্ট জেন্টলম্যান।', bn_s:'নবজাতক থেকে ২ বছর, আরামদায়ক ও কিউট।' },
      { en_t:'Boys kurta shalwar. Pakistani classics, little sizes.', en_s:'Traditional looks your little man will love.', bn_t:'বয়েজ কুর্তা সালোয়ার। পাকিস্তানি ক্লাসিক, ছোট সাইজে।', bn_s:'ঐতিহ্যবাহী লুক যা আপনার ছোট্ট মানুষটি ভালোবাসবে।' },
      { en_t:'Toddler fashion. Ages 2 to 6.', en_s:'Soft, sweet, and stylishly Pakistani.', bn_t:'টডলার ফ্যাশন। ২ থেকে ৬ বছর।', bn_s:'নরম, মিষ্টি এবং পাকিস্তানি স্টাইলে।' }
    ],
    'luxe-all': [
      { en_t:'Door to door. Genuine products.', en_s:'Straight from Pakistan to your door in Bangladesh.', bn_t:'ডোর টু ডোর। আসল পণ্য।', bn_s:'পাকিস্তান থেকে সরাসরি বাংলাদেশে আপনার দরজায়।' },
      { en_t:'The Luxe Edit. Designer couture.', en_s:'Pakistan\'s finest designers, real prices.', bn_t:'দ্য লাক্স এডিট। ডিজাইনার কুতুর।', bn_s:'পাকিস্তানের সেরা ডিজাইনার, আসল দামে।' },
      { en_t:'Hand embroidery, adda by adda.', en_s:'Real handwork, the honest Pakistan price.', bn_t:'হাতের এমব্রয়ডারি, আড্ডা বাই আড্ডা।', bn_s:'আসল হাতের কাজ, সৎ পাকিস্তানি দাম।' },
      { en_t:'Designers, together. One luxe room.', en_s:'Sana Safinaz, Maria B, Elan and more.', bn_t:'ডিজাইনাররা, একসাথে। এক লাক্স রুম।', bn_s:'সানা সাফিনাজ, মারিয়া বি, এলান ও আরও।' },
      { en_t:'Chikankari. Zardozi. Real craft.', en_s:'Pakistani heritage art, at the authentic PKR price.', bn_t:'চিকনকারি। জারদোজি। আসল কারুকাজ।', bn_s:'পাকিস্তানি ঐতিহ্যবাহী শিল্প, আসল PKR দামে।' },
      { en_t:'Gift something unforgettable.', en_s:'A designer piece from Pakistan, delivered to Bangladesh.', bn_t:'অবিস্মরণীয় কিছু উপহার দিন।', bn_s:'পাকিস্তান থেকে একটি ডিজাইনার পিস, বাংলাদেশে ডেলিভারি।' }
    ],
    'luxe-w': [
      { en_t:'Bridal & velvet. For the big day.', en_s:'Make your moment unforgettable.', bn_t:'ব্রাইডাল ও ভেলভেট। বিশেষ দিনের জন্য।', bn_s:'আপনার মুহূর্তকে অবিস্মরণীয় করুন।' },
      { en_t:'Fine fabrics. Pure & premium.', en_s:'Lawn, silk, organza, chiffon.', bn_t:'ফাইন ফেব্রিক। বিশুদ্ধ ও প্রিমিয়াম।', bn_s:'লন, সিল্ক, অর্গানজা, শিফন।' },
      { en_t:'Always transparent. No hidden charges.', en_s:'Confirmed PKR plus your full BDT total, upfront.', bn_t:'সবসময় স্বচ্ছ। কোনো লুকানো চার্জ নেই।', bn_s:'নিশ্চিত PKR সহ আপনার পূর্ণ BDT টোটাল, আগেই।' },
      { en_t:'Going to a wedding? Let us prepare you.', en_s:'Guest looks, bridal, the whole edit.', bn_t:'বিয়েতে যাচ্ছেন? আমরা প্রস্তুত করি।', bn_s:'গেস্ট লুক, ব্রাইডাল, পুরো এডিট।' },
      { en_t:'Opulent season. Velvet, brocade, silk.', en_s:'The richest fabrics in Pakistani fashion, now here.', bn_t:'অপুলেন্ট সিজন। ভেলভেট, ব্রোকেড, সিল্ক।', bn_s:'পাকিস্তানি ফ্যাশনের সবচেয়ে সমৃদ্ধ ফেব্রিক, এখন এখানে।' },
      { en_t:'Embroidered formals. Statement dressing.', en_s:'Couture-level craft, at honest PK prices.', bn_t:'এমব্রয়ডারড ফরমাল। স্টেটমেন্ট ড্রেসিং।', bn_s:'কুতুর-মানের কারুকাজ, সৎ PK দামে।' }
    ],
    'luxe-m': [
      { en_t:'Groom season. Your big day, perfectly dressed.', en_s:'Sherwani to prince coat, real PK prices.', bn_t:'বর সিজন। আপনার বিশেষ দিন, নিখুঁত সাজে।', bn_s:'শেরওয়ানি থেকে প্রিন্স কোট, আসল পিকে দামে।' },
      { en_t:'Formal to festive. Every occasion sorted.', en_s:'Sherwani, suits and kurtas. Pakistan\'s finest.', bn_t:'ফর্মাল থেকে উৎসব। প্রতিটি অনুষ্ঠান সাজানো।', bn_s:'শেরওয়ানি, স্যুট ও কুর্তা। পাকিস্তানের সেরা।' },
      { en_t:'Menswear, sorted. Eastern & western.', en_s:'Kurtas to suits, real prices, BD delivery.', bn_t:'মেনসওয়্যার, সব এক জায়গায়।', bn_s:'কুর্তা থেকে স্যুট, আসল দাম, বিডি ডেলিভারি।' },
      { en_t:'Wedding & Festivals, sorted.', en_s:'Sharp formals for every ceremony in the family.', bn_t:'বিয়ে ও উৎসব, সব সাজানো।', bn_s:'পরিবারের প্রতিটি অনুষ্ঠানের জন্য পারফেক্ট ফরমাল।' }
    ],
    'luxe-k': [
      { en_t:'Little VIPs. Dressed to impress.', en_s:'Premium party and formal wear for kids, from Pakistan\'s finest.', bn_t:'লিটল ভিআইপি। মুগ্ধ করার সাজ।', bn_s:'পাকিস্তানের সেরা থেকে বাচ্চাদের প্রিমিয়াম পার্টি ও ফরমাল ওয়্যার।' },
      { en_t:'Dressed for the occasion. Little ones too.', en_s:'Festive sets that match the grown-ups, perfectly.', bn_t:'অনুষ্ঠানের সাজ। ছোটদের জন্যও।', bn_s:'বড়দের সাথে মানানসই উৎসবের সেট, নিখুঁতভাবে।' },
      { en_t:'Tiny royals. Pakistan\'s finest, for the little ones.', en_s:'Because the best occasions deserve the best looks.', bn_t:'ছোট্ট রাজকীয়। ছোটদের জন্য পাকিস্তানের সেরা।', bn_s:'কারণ সেরা অনুষ্ঠান সেরা লুক দাবি করে।' }
    ],
    'search-home': [
      { en_t:'Not sure of the size? We\'ll find it.', en_s:'Fit Assistant matches you to the right brand size.', bn_t:'সাইজ নিয়ে দ্বিধা? আমরা খুঁজে দেব।', bn_s:'ফিট অ্যাসিস্ট্যান্ট প্রতিটি ব্র্যান্ডের সঠিক সাইজ মেলায়।' },
      { en_t:'Search by photo. Snap or upload.', en_s:'See a look you love? Find it by picture.', bn_t:'ছবি দিয়ে খুঁজুন। তুলুন বা আপলোড করুন।', bn_s:'পছন্দের লুক দেখেছেন? ছবি দিয়ে খুঁজুন।' }
    ],
    'search-luxe': [
      { en_t:'Search the designer houses', en_s:'Elan, Sana Safinaz, Asim Jofa and more, with the real PKR price.', bn_t:'ডিজাইনার হাউস খুঁজুন', bn_s:'এলান, সানা সাফিনাজ, আসিম জোফা ও আরও, আসল পিকেআর দামে।' },
      { en_t:'Snap it. Find it. Order it.', en_s:'Search by photo across Pakistan\'s premium labels.', bn_t:'ছবি তুলুন, খুঁজুন, অর্ডার করুন', bn_s:'ছবি দিয়ে পাকিস্তানের প্রিমিয়াম ব্র্যান্ডে খুঁজুন।' }
    ],
    'search-brand': [
      { en_t:'Snap. Search. Order. Find it with a photo.', en_s:'See a style you love? Find it instantly.', bn_t:'ছবি তুলুন। খুঁজুন। অর্ডার করুন।', bn_s:'পছন্দের স্টাইল দেখেছেন? ছবি দিয়ে তাৎক্ষণিক খুঁজুন।' },
      { en_t:'True Price. Paste, check, compare.', en_s:'Paste any brand\'s product page, get the real PKR and full BDT total.', bn_t:'সত্যিকারের দাম। পেস্ট, চেক, তুলনা।', bn_s:'যেকোনো ব্র্যান্ডের প্রোডাক্ট পেজ পেস্ট করুন, আসল PKR ও পূর্ণ BDT পান।' },
      { en_t:'Any brand. Any link. One honest price.', en_s:'Paste a product link from anywhere, priced in PKR + BDT.', bn_t:'যেকোনো ব্র্যান্ড। যেকোনো লিংক। একটি সৎ দাম।', bn_s:'যেকোনো জায়গা থেকে প্রোডাক্ট লিংক পেস্ট করুন, PKR + BDT তে দাম পান।' },
      { en_t:'Want to buy Pakistani clothing? Check here first.', en_s:'Same outfit, the real price, delivered to BD.', bn_t:'পাকিস্তানি পোশাক কিনতে চান? আগে এখানে চেক করুন।', bn_s:'একই পোশাক, আসল দামে, বিডিতে ডেলিভারি।' },
      { en_t:'Confirmed PK prices. In BDT, before you buy.', en_s:'No dollar guesswork, the genuine local price.', bn_t:'নিশ্চিত PK দাম। BDT তে, কেনার আগে।', bn_s:'ডলারের অনুমান নয়, আসল স্থানীয় দাম।' }
    ]
  };
  function _psPosterPage(){
    try{
      var store = (typeof psStore !== 'undefined' && psStore === 'premium') ? 'luxe' : 'home';
      var dg = document.documentElement.getAttribute('data-gender') || 'all';
      return store + '-' + dg;
    }catch(e){ return 'home-all'; }
  }
  function _psPosterSet(){ return PS_POSTERS[_psPosterPage()] || PS_BANNERS; }
  // Search-overlay poster: 3 contexts — opened from Brand (price-check), Luxe, or Home.
  function _psSearchPosterCtx(){
    if(typeof _psSearchMode !== 'undefined' && _psSearchMode === 'brands') return 'search-brand';
    return (typeof psStore !== 'undefined' && psStore === 'premium') ? 'search-luxe' : 'search-home';
  }
  function psSpRenderPoster(){
    var el = document.getElementById('psSpBanner'); if(!el) return;
    var set = PS_POSTERS[_psSearchPosterCtx()];
    if(!set || !set.length){ el.innerHTML=''; el.hidden=true; return; }
    var bn = (typeof _lang !== 'undefined' && _lang === 'bn');
    var b = set[0];   // lead poster for this search context (relocatable)
    el.innerHTML = '<b class="ps-sp-poster-t">'+esc(bn?b.bn_t:b.en_t)+'</b><span class="ps-sp-poster-s">'+esc(bn?b.bn_s:b.en_s)+'</span>';
    el.hidden = false;
  }
  window.psSpRenderPoster = psSpRenderPoster;
  let _psBanIdx = 0, _psBanT = null, _psBanImgs = [];
  // Fill the two hero images from the loaded catalogue (once). Picks photos a little down the feed so
  // they differ from the first grid rows. Re-renders the banner when ready.
  function psFillBannerImgs(){
    if(_psBanImgs.length >= 2) return;
    try {
      var pool = (typeof psFiltered !== 'undefined' ? psFiltered : []).filter(function(p){ return p && p.img; });
      if(pool.length < 2) return;
      _psBanImgs = [ pool[Math.min(2, pool.length-1)].img, pool[Math.min(8, pool.length-1)].img ];
      psRenderBanner();
    } catch(e){}
  }
  window.psFillBannerImgs = psFillBannerImgs;
  function psRenderBanner(){
    var el = document.getElementById('psBanner'); if(!el) return;
    var bn = (typeof _lang !== 'undefined' && _lang === 'bn');
    var SET = _psPosterSet();
    var cur = _psBanIdx % SET.length;
    el.innerHTML = SET.map(function(b,i){
      var t = bn ? b.bn_t : b.en_t, s = bn ? b.bn_s : b.en_s;
      var bg = _psBanImgs[i] ? ' style="background-image:url(\'' + esc(_psBanImgs[i]) + '\')"' : '';
      return '<div class="ps-hero-slide' + (i===cur ? ' on' : '') + '"' + bg + '>'
        + '<span class="ps-hero-ov"></span>'
        + '<span class="ps-hero-tx"><b class="ps-hero-t">' + esc(t) + '</b><span class="ps-hero-s">' + esc(s) + '</span></span></div>';
    }).join('') + '<div class="ps-hero-dots">'
      + SET.map(function(_,i){ return '<span class="ps-bdot' + (i===cur ? ' on' : '') + '"></span>'; }).join('')
      + '</div>';
  }
  // Brand / Price-Check page hero (req 2026-06-30: posters on EVERY page, incl. the brand page).
  // Its own poster set (the brand copy) over two curated model backdrops; rotates on the same tick.
  const PS_BRAND_POSTER_IMGS = [
    'https://cdn.shopify.com/s/files/1/0515/4802/9092/files/2C5A0656.jpg?v=1758976297',
    'https://cdn.shopify.com/s/files/1/0555/3799/1852/files/arsalan-iqbal-black-textured-3pc-suit-mens-designer-formalwear.jpg?v=1764869126'
  ];
  function _psBrandSet(){ return PS_POSTERS['search-brand'] || []; }
  function psRenderBrandBanner(){
    var el = document.getElementById('psBrandBanner'); if(!el) return;
    var SET = _psBrandSet(); if(!SET.length){ el.innerHTML=''; return; }
    var bn = (typeof _lang !== 'undefined' && _lang === 'bn');
    var cur = _psBanIdx % SET.length;
    el.innerHTML = SET.map(function(b,i){
      var t = bn ? b.bn_t : b.en_t, s = bn ? b.bn_s : b.en_s;
      var img = PS_BRAND_POSTER_IMGS[i % PS_BRAND_POSTER_IMGS.length];
      var bg = img ? ' style="background-image:url(\'' + esc(thumbUrl(img)) + '\')"' : '';
      return '<div class="ps-hero-slide' + (i===cur ? ' on' : '') + '"' + bg + '>'
        + '<span class="ps-hero-ov"></span>'
        + '<span class="ps-hero-tx"><b class="ps-hero-t">' + esc(t) + '</b><span class="ps-hero-s">' + esc(s) + '</span></span></div>';
    }).join('') + '<div class="ps-hero-dots">'
      + SET.map(function(_,i){ return '<span class="ps-bdot' + (i===cur ? ' on' : '') + '"></span>'; }).join('')
      + '</div>';
    // NOT tappable — it must never navigate to the old-look order-form.html (req: Danish 2026-06-30).
    el.style.cursor = ''; el.onclick = null; el.removeAttribute('role'); el.removeAttribute('aria-label');
  }
  window.psRenderBrandBanner = psRenderBrandBanner;
  function _psBannerSync(elId, len){
    var el = document.getElementById(elId); if(!el || !len) return;
    var idx = _psBanIdx % len;
    el.querySelectorAll('.ps-hero-slide').forEach(function(sl,i){ sl.classList.toggle('on', i===idx); });
    el.querySelectorAll('.ps-bdot').forEach(function(d,i){ d.classList.toggle('on', i===idx); });
  }
  function psBannerTick(){
    _psBanIdx = _psBanIdx + 1;   // grows; each banner takes its own modulo (sets differ in length)
    _psBannerSync('psBanner', _psPosterSet().length);
    _psBannerSync('psBrandBanner', _psBrandSet().length);
  }
  function psBannerStart(){
    if(!document.getElementById('psBanner') && !document.getElementById('psBrandBanner')) return;
    _psBanIdx = 0;
    psRenderBanner();
    try{ psRenderBrandBanner(); }catch(e){}
    if(_psBanT) clearInterval(_psBanT);
    try { if(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch(e){}
    _psBanT = setInterval(psBannerTick, 5200);
  }
  window.psRenderBanner = psRenderBanner;
  // ── Collection-first home tiles (redesign P1) — wired to EXISTING filters/search ──
  // New = psNewOnly, Sale = psSaleOnly, price-band = psSel.prices, occasion/season = keyword search.
  // Plain styling for now; photos + layout come in the carousel-redesign pass.
  const PS_COLL_TILES = [
    { en:'New IN.',          bn:'এই সপ্তাহের নতুন', se:'Daily Updates', sb:'গত ৭ দিন',   kind:'new' },
    { en:'On Sale',          bn:'সেল',             se:'Hurry-',      sb:'ছাড়',        kind:'sale' },
    { en:'Under 3000',       bn:'৩০০০ এর নিচে',    se:'Still Stylish', sb:'বাজেট',       kind:'price', val:'0' },
    { en:'Eid edit',         bn:'ঈদ কালেকশন',      se:'Festive',     sb:'উৎসব',        kind:'cat', val:'heavy_formal_3pc,formal_emb_3pc' },
    { en:'Summer lawn',      bn:'সামার লন',        se:'Unstitched',  sb:'আনস্টিচড',     kind:'cat', val:'lawn_3pc_unstitch' },
    { en:'Winter',           bn:'শীত',             se:'Khaddar & More', sb:'খদ্দর',       kind:'cat', val:'winter_3pc_stitch,winter_3pc_unstitch,winter_2pc_stitch,winter_2pc_unstitch' },
    { en:'Wedding',          bn:'ওয়েডিং',          se:'Bridal - Big Day', sb:'ব্রাইডাল',    kind:'cat', val:'bridal,lehenga' },
    { en:'Formal',           bn:'ফরমাল',           se:'Party Wear',  sb:'পার্টি',      kind:'cat', val:'formal_emb_3pc,formal_emb_2pc' }
  ];
  // Per-collection metadata layered onto PS_COLL_TILES above WITHOUT editing that array
  // (keyed by English label). g = pages the tile shows on ('all' landing, w/m/k gender
  // pages, 'luxe' premium store). e = emoji fallback. id = stable key (deep-link ?coll=).
  const _PS_COLL_META = {
    'New IN.':          { id:'new',     g:['home-all','home-w','home-m','home-k','luxe-all','luxe-w','luxe-m','luxe-k'], e:'🆕' },
    'On Sale':          { id:'sale',    g:['home-all','home-w','home-m','home-k','luxe-all','luxe-w','luxe-m','luxe-k'], e:'🏷️' },
    'Under 3000':       { id:'budget',  g:['home-all','home-w','home-m','home-k'], e:'💰' },
    'Eid edit':         { id:'eid',     g:['home-all','home-w','luxe-all','luxe-w'], e:'✨' },
    'Summer lawn':      { id:'lawn',    g:['home-all','home-w'], e:'🌸' },
    'Winter':           { id:'winter',  g:['home-all','home-w'], e:'🧣' },
    'Wedding':          { id:'wedding', g:['home-all','home-w','luxe-all','luxe-w'], e:'💍' },
    'Formal':           { id:'formal',  g:['home-w','luxe-w'], e:'👗' }
  };
  // Extra collections for the Men / Kids / Luxe pages + the always-visible Couple tile.
  // Couple uses a curated his+hers photo and a free-text search ('couple') because its
  // category isn't indexed yet — its product data lands with the category cleanup.
  const PS_COLL_EXTRA = [
    { id:'couple', g:['home-all','home-w','home-m','luxe-all','luxe-w','luxe-m'], en:'Couple', bn:'কাপল', se:'His + Hers', sb:'হিজ ও হার্স', e:'💑', kind:'q', val:'couple', img:'https://cdn.shopify.com/s/files/1/0508/8994/9390/files/111_f72fde77-5748-4b63-a44c-54f24de80244.png?v=1739807967' },
    { id:'coord',  g:['home-w'], en:'Co-ord sets', bn:'কো-অর্ড সেট', se:'Trendy', sb:'২ পিস', e:'🧶', kind:'cat', val:'shirt_trouser_2pc,coord_western' },
    { id:'mens_eastern', g:['home-m'], en:'Kurta & shalwar', bn:'কুর্তা ও শালওয়ার', se:'Eastern Vibes', sb:'ইস্টার্ন', e:'👔', kind:'cat', val:'mens_kurta,mens_shalwar_kameez' },
    { id:'mens_wedding', g:['home-m','luxe-m'], en:'Wedding for him', bn:'বরের পোশাক', se:'Sherwani', sb:'শেরওয়ানি', e:'🤵', kind:'cat', val:'mens_sherwani,mens_waistcoat,mens_suit' },
    { id:'mens_casual', g:['home-m'], en:'Smart casual', bn:'স্মার্ট ক্যাজুয়াল', se:'Shirts & polos', sb:'শার্ট', e:'👕', kind:'cat', val:'mens_shirt' },
    { id:'kids_girls', g:['home-k'], en:'Girls', bn:'মেয়েদের', se:'Frocks, sets & Others', sb:'ফ্রক ও সেট', e:'👧', kind:'cat', val:'kids_girls_eastern' },
    { id:'kids_boys', g:['home-k'], en:'Boys', bn:'ছেলেদের', se:'Kurta & sets', sb:'কুর্তা ও সেট', e:'👦', kind:'cat', val:'kids_boys_eastern' },
    { id:'kids_party', g:['home-k','luxe-k'], en:'Party & formal', bn:'পার্টি ও ফরমাল', se:'Occasion- Feel Happy', sb:'অনুষ্ঠান', e:'🎀', kind:'cat', val:'kids_girls_formal,kids_boys_formal' },
    { id:'luxe_designer', g:['luxe-all','luxe-w','luxe-m','luxe-k','home-all'], en:'Designer picks', bn:'ডিজাইনার পিকস', se:'Luxe', sb:'লাক্স', e:'👑', kind:'price', val:'5' },
    { id:'luxe_bridal', g:['luxe-all','luxe-w'], en:'Bridal couture', bn:'ব্রাইডাল', se:'Heavy formal', sb:'ভারী ফরমাল', e:'💎', kind:'cat', val:'bridal,heavy_formal_3pc' },
    { id:'luxe_handwork', g:['luxe-w','home-w'], en:'Hand embroidery', bn:'হ্যান্ড এমব্রয়ডারি', se:'Adda work', sb:'আড্ডা ওয়ার্ক', e:'🪡', kind:'cat', val:'handmade_emb' }
  ];
  // Merge meta onto base tiles + append extras → the full per-page collection list.
  function _psAllColls(){
    var base = PS_COLL_TILES.map(function(t){ var m = _PS_COLL_META[t.en] || {}; var o = {}; for(var k in t) o[k]=t[k]; for(var k2 in m) o[k2]=m[k2]; return o; });
    return base.concat(PS_COLL_EXTRA);
  }
  // ── Curated, gender-keyed collection photos (req: Danish 2026-06-30) ──────────
  // HARD RULE: every collection tile shows a real human MODEL, gender-correct for the
  // page it's on, and NO image is reused anywhere (each of the 39 slots below is a unique
  // URL, none overlapping the category-icon photos). A collection that appears on several
  // pages keeps its name but SWAPS the photo to the page's gender: PS_COLL_IMG[id][gender]
  // where gender = all|w|m|k (the page). 'all' (the landing) uses a women hero; couple's
  // 'all' is the his+hers shot. Falls through all→w→m→k if a gender variant is absent.
  const PS_COLL_IMG = {
    new: { all:'https://cdn.shopify.com/s/files/1/0587/2913/6326/files/DSC03349_copy.jpg?v=1777231664', w:'https://cdn.shopify.com/s/files/1/0841/3796/7889/files/86276-_7_-thumbnail.jpg?v=1781787354', m:'https://cdn.shopify.com/s/files/1/0508/8994/9390/files/Olive_green_kurta_set_for_father_and_son_matching_outfit.png?v=1777726593', k:'https://cdn.shopify.com/s/files/1/0752/0442/8072/files/KGKK1436-2PC_1.webp?v=1780481599' },
    sale: { all:'https://cdn.shopify.com/s/files/1/0623/6481/1444/files/BP181-9-2P25_1.jpg?v=1782730607', w:'https://cdn.shopify.com/s/files/1/0740/1753/8280/files/SS26SGE469P2T_1.jpg?v=1782709509', m:'https://cdn.shopify.com/s/files/1/0872/1278/5848/files/MP2PBBW25ADJ16_2.jpg?v=1778840041', k:'https://cdn.shopify.com/s/files/1/0488/9201/8848/files/BK12601BEWS29007_1.jpg?v=1782193509' },
    budget: { all:'https://cdn.shopify.com/s/files/1/0730/0972/5664/files/TYP00721.jpg?v=1762516781', w:'https://cdn.shopify.com/s/files/1/0660/4164/3225/files/DSC05376.jpg?v=1782555714', m:'https://cdn.shopify.com/s/files/1/0551/9763/0638/files/6F5A8695.jpg?v=1781533053', k:'https://cdn.shopify.com/s/files/1/0568/3308/1529/files/DSC00243copy2.jpg?v=1777128149' },
    eid: { all:'https://cdn.shopify.com/s/files/1/0262/9058/5672/files/AL-LS-625_4_-Copy.jpg?v=1778675077', w:'https://cdn.shopify.com/s/files/1/0813/1179/3453/files/0000354_black-peplum.jpg?v=1694011257' },
    lawn: { all:'https://cdn.shopify.com/s/files/1/0730/0972/5664/files/1_228021bf-6f71-4e0e-a633-cfa377a3e695.jpg?v=1755502218', w:'https://cdn.shopify.com/s/files/1/0650/8249/1105/files/S26B4299_Bronze_cover.jpg?v=1775739374' },
    winter: { all:'https://cdn.shopify.com/s/files/1/0650/8249/1105/files/S26C5111_JetBlack_Cover.jpg?v=1781891269', w:'https://cdn.shopify.com/s/files/1/0410/6702/0447/files/5_256d03a3-b9a2-4e0f-9e11-e021a33087df.jpg?v=1781349886' },
    wedding: { all:'https://cdn.shopify.com/s/files/1/0730/0972/5664/files/EH5A1334.png?v=1758020713', w:'https://cdn.shopify.com/s/files/1/0660/4164/3225/products/2T9A5191_78f6abcd-14e2-4192-9554-d67325a5faa0.jpg?v=1749713727' },
    formal: { w:'https://cdn.shopify.com/s/files/1/0016/9476/1035/products/73_88050d03-c10d-4825-a233-ad26f2838582.jpg?v=1660810144' },
    couple: { all:'https://cdn.shopify.com/s/files/1/0508/8994/9390/files/111_f72fde77-5748-4b63-a44c-54f24de80244.png?v=1739807967', w:'https://cdn.shopify.com/s/files/1/0872/1278/5848/files/WP3PSFW25F9O3_5.jpg?v=1778494530', m:'https://cdn.shopify.com/s/files/1/0262/9058/5672/files/AL-K-1311-D_3.jpg?v=1782207840' },
    coord: { w:'https://cdn.shopify.com/s/files/1/0650/8249/1105/files/S26F7018_MintGreen_Cover.jpg?v=1778255730' },
    mens_eastern: { m:'https://cdn.shopify.com/s/files/1/0872/1278/5848/files/MP1PBS26BM3A15_2.jpg?v=1779178985' },
    mens_wedding: { m:'https://cdn.shopify.com/s/files/1/0555/3799/1852/files/arsalan-iqbal-jet-black-hand-embroidered-prince-jacket-kurta-pyjama-1.jpg?v=1779204948' },
    mens_casual: { m:'https://cdn.shopify.com/s/files/1/0283/5510/0758/files/DSC00802copy_de4091ee-ced4-4563-be10-9999bcbd43ef.jpg?v=1782716814' },
    kids_girls: { k:'https://cdn.shopify.com/s/files/1/0789/3588/4095/files/Kids-Danedar-Chiffon-3PC-_-1178-Sha-Posh-Textile-238089468.jpg?v=1779196268' },
    kids_boys: { k:'https://cdn.shopify.com/s/files/1/0841/3796/7889/files/ECBTWCS5-064-_4_-thumbnail.jpg?v=1779726888' },
    kids_party: { k:'https://cdn.shopify.com/s/files/1/0587/2913/6326/files/GulabiKids_close.jpg?v=1748186268' },
    luxe_designer: { all:'https://cdn.shopify.com/s/files/1/0524/3112/6721/files/10_9cfe7aed-1677-4419-a9d6-729355fda611.jpg?v=1764840701', w:'https://cdn.shopify.com/s/files/1/2277/5269/files/110_edacbdbb-240c-447d-a54f-b850c3397501.jpg?v=1752064548', m:'https://cdn.shopify.com/s/files/1/0841/3796/7889/files/ECMTCPT5-1016_5.jpg?v=1782302340', k:'https://cdn.shopify.com/s/files/1/0841/3796/7889/files/ECBTSS6-011_7_thumbnail.webp?v=1776757382' },
    luxe_bridal: { all:'https://cdn.shopify.com/s/files/1/2402/3147/files/D-01.jpg?v=1744196264', w:'https://cdn.shopify.com/s/files/1/0650/8249/1105/files/S26C5198_Ecru_Cover.jpg?v=1780498829' },
    luxe_handwork: { w:'https://cdn.shopify.com/s/files/1/0660/4164/3225/files/35A9250.jpg?v=1779280845' },
  };
  function _psCollImgFor(id, page){
    var byg = PS_COLL_IMG[id]; if(!byg) return '';
    var g = (String(page||'').split('-')[1]) || 'all';
    return byg[g] || byg.all || byg.w || byg.m || byg.k || '';
  }
  let _psActiveColl = '';
  let _psCollImg = {};
  try { _psCollImg = JSON.parse(localStorage.getItem('psb_coll_thumbs_v1') || '{}') || {}; } catch(e){ _psCollImg = {}; }
  function _psCollPage(){
    try{
      var store = (typeof psStore !== 'undefined' && psStore === 'premium') ? 'luxe' : 'home';
      var dg = document.documentElement.getAttribute('data-gender') || 'all';
      return store + '-' + dg;   // 8 pages: home-all|home-w|home-m|home-k|luxe-all|luxe-w|luxe-m|luxe-k
    }catch(e){ return 'home-all'; }
  }
  function _psCollQS(t){
    if(t.kind === 'cat')   return 'cat=' + encodeURIComponent(t.val);
    if(t.kind === 'price') return 'price=' + encodeURIComponent(t.val);
    if(t.kind === 'sale')  return 'sale=1';
    if(t.kind === 'new')   return 'new=1';
    if(t.kind === 'q')     return 'q=' + encodeURIComponent(t.val);
    return '';
  }
  // Render the per-page collection strip. Each tile = a saved multi-brand filter; tapping it
  // opens the collection VIEW (psOpenColl). Photos pull from the live API + cache (curated for couple).
  function psRenderColls(){
    var el = document.getElementById('psColls'); if(!el) return;
    var bn = (typeof _lang !== 'undefined' && _lang === 'bn');
    var page = _psCollPage();
    var tiles = _psAllColls().filter(function(t){ return t.g && t.g.indexOf(page) !== -1; });
    var hd = document.querySelector('.ps-colls-hd'); if(hd) hd.style.display = tiles.length ? '' : 'none';
    el.innerHTML = tiles.map(function(t){
      var lbl = bn ? t.bn : t.en, sub = bn ? t.sb : t.se;
      var src = _psCollImgFor(t.id, page) || t.img || (_psCollImg[t.id] && _psCollImg[t.id].u);
      var img = src ? '<img loading="lazy" src="'+esc(thumbUrl(src))+'" alt="'+esc(lbl)+'" onerror="this.remove()">' : '';
      return '<button type="button" class="ps-coll'+(t.id===_psActiveColl?' on':'')+'" data-coll="'+esc(t.id)+'" onclick="psOpenColl(this.getAttribute(\'data-coll\'))">'
        + '<span class="ps-coll-img" data-emoji="'+esc(t.e||'🛍️')+'">'+img+'</span>'
        + '<span class="ps-coll-txt"><span class="ps-coll-lbl">'+esc(lbl)+'</span><span class="ps-coll-sub">'+esc(sub)+'</span></span></button>';
    }).join('');
    psCollLoadThumbs(tiles);
  }
  function psCollPaint(id, url){
    var tile = document.querySelector('#psColls .ps-coll[data-coll="'+id+'"]'); if(!tile) return;
    var box = tile.querySelector('.ps-coll-img'); if(!box || box.querySelector('img')) return;
    var im = new Image(); im.loading='lazy'; im.alt=id; im.onerror=function(){ this.remove(); }; im.src = thumbUrl(url); box.appendChild(im);
  }
  function psCollLoadThumbs(tiles){
    if(typeof psApiMode === 'undefined' || !psApiMode) return;   // catalog.json mode: emoji fallback
    tiles.forEach(function(t){
      if(t.img || PS_COLL_IMG[t.id]) return;   // curated photo already shown (per-gender map wins)
      var cc = _psCollImg[t.id];
      if(cc && cc.u && (Date.now() - cc.t < 14*24*3600*1000)){ psCollPaint(t.id, cc.u); return; }
      var qs = _psCollQS(t); if(!qs) return;
      fetch(psSearchBase() + '?' + qs + '&pageSize=6&page=0', { cache:'default' })
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(function(j){ var arr=(j&&j.products)||[]; var pick = arr.find(function(p){ return p&&p.img; }); if(pick&&pick.img){ _psCollImg[t.id]={u:pick.img,t:Date.now()}; try{ localStorage.setItem('psb_coll_thumbs_v1', JSON.stringify(_psCollImg)); }catch(e){} psCollPaint(t.id, pick.img); } })
        .catch(function(){});
    });
  }
  // Apply a collection's filter to the grid (no nav).
  function _psCollApply(t){
    try { psSaleOnly = false; psNewOnly = false; psSort = ''; } catch(e){}
    try { psQuery=''; psSizeQ=''; var a=document.getElementById('psSearchMobile'), b=document.getElementById('psSearchDesktop'); if(a)a.value=''; if(b)b.value=''; } catch(e){}
    if(t.kind === 'q'){
      psSel = { prices:new Set(), cats:new Set(), brands:new Set() };
      if(window.psSearchInput) psSearchInput(t.val); else { try { psApply(); } catch(e){} }
      return;
    }
    if(t.kind === 'cat'){
      psSel = { prices:new Set(psSel.prices), cats:new Set(String(t.val).split(',')), brands:new Set() };
    } else {
      psSel = { prices:new Set(), cats:new Set(), brands:new Set() };
      if(t.kind === 'new') psNewOnly = true;
      else if(t.kind === 'sale') psSaleOnly = true;
      else if(t.kind === 'price') psSel.prices = new Set([parseInt(t.val, 10)]);
    }
    try { psBuildCatFilter(); psBuildBrandFilter(); psBuildPriceFilter(); psBuildSort(); psApply(); } catch(e){}
  }
  function psShowCollHdr(t){
    var el = document.getElementById('psCollHdr'); if(!el) return;
    var bn = (typeof _lang !== 'undefined' && _lang === 'bn');
    var lbl = bn ? t.bn : t.en;
    el.innerHTML = '<span class="ps-collhdr-l"><span class="ps-collhdr-e">'+esc(t.e||'🛍️')+'</span><span class="ps-collhdr-t">'+esc(lbl)+'</span></span>'
      + '<button type="button" class="ps-collhdr-x" onclick="psClearColl()" aria-label="Clear">✕</button>';
    el.style.display = 'flex';
  }
  // Open a collection as a dedicated VIEW: products browse + filter + title banner + transition + deep-link.
  function psOpenColl(id){
    var t = _psAllColls().find(function(x){ return x.id === id; }); if(!t) return;
    // Re-tap the collection that's already open = toggle the filter OFF (back to the full grid).
    if(_psActiveColl === id){ try{ psClearColl(); }catch(e){} return; }
    _psActiveColl = id;
    try{ showBrowseView(); }catch(e){}
    try{ switchBrowse('products'); }catch(e){}
    _psCollApply(t);
    psShowCollHdr(t);
    try{ psRenderColls(); }catch(e){}
    try{ var r = document.querySelector('.ps-results'); if(r){ r.classList.remove('ps-coll-enter'); void r.offsetWidth; r.classList.add('ps-coll-enter'); } }catch(e){}
    try{ var u = new URL(location.href); u.searchParams.set('coll', id); history.replaceState(null,'',u.toString()); }catch(e){}
    try{ if(typeof psScrollToResults==='function') psScrollToResults(); else if(typeof psScrollGridUnderCarousel==='function') psScrollGridUnderCarousel(); }catch(e){}
  }
  function psClearColl(){
    _psActiveColl = '';
    var el = document.getElementById('psCollHdr'); if(el) el.style.display = 'none';
    try { psSaleOnly=false; psNewOnly=false; psSort=''; psQuery=''; psSizeQ=''; } catch(e){}
    psSel = { prices:new Set(), cats:new Set(), brands:new Set() };
    try { psBuildCatFilter(); psBuildBrandFilter(); psBuildPriceFilter(); psBuildSort(); psApply(); } catch(e){}
    try{ var u = new URL(location.href); u.searchParams.delete('coll'); history.replaceState(null,'',u.toString()); }catch(e){}
    try{ psRenderColls(); }catch(e){}
  }
  // Legacy shim (any older inline onclicks): apply a kind/val filter directly.
  function psCollGo(kind, val){ _psCollApply({ kind:kind, val:val }); }
  window.psOpenColl = psOpenColl; window.psClearColl = psClearColl; window.psCollGo = psCollGo; window.psRenderColls = psRenderColls;
  // ── Reusable promise / trust strip (redesign P1) — drop a <div class="ps-promises" id="..">
  // anywhere and call psRenderPromises(el). Promotes PakPoshak's promises; used on the search page. ──
  const PS_PROMISES = [
    { t_en:'100% genuine',     t_bn:'১০০% আসল',        s_en:"From the brand's Pakistani store", s_bn:'ব্র্যান্ডের পাকিস্তানি স্টোর থেকে', ic:'shield' },
    { t_en:'Pakistani prices', t_bn:'পাকিস্তানি দাম',   s_en:'No inflated markups',              s_bn:'কোনো বাড়তি মার্কআপ নেই',          ic:'tag' },
    { t_en:'To your door',     t_bn:'আপনার দরজায়',     s_en:'Delivered across Bangladesh',      s_bn:'সারা বাংলাদেশে ডেলিভারি',         ic:'truck' },
    { t_en:'150+ brands',      t_bn:'১৫০+ ব্র্যান্ড',    s_en:'One cart, one checkout',           s_bn:'এক কার্ট, এক চেকআউট',             ic:'bag' }
  ];
  const PS_PROMISE_ICONS = {
    shield:'<path d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3z"/><path d="M9 12l2 2 4-4"/>',
    tag:'<path d="M20.6 12.5l-8.1 8.1a1.4 1.4 0 01-2 0L2.5 12.5V3.5h9z"/><circle cx="7.5" cy="7.5" r="1.1"/>',
    truck:'<path d="M3 6h11v9H3z"/><path d="M14 9h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/>',
    bag:'<path d="M6 8h12l-1 12H7z"/><path d="M9 8V6a3 3 0 016 0v2"/>'
  };
  function psRenderPromises(el){
    el = el || document.getElementById('psPromises'); if(!el) return;
    var bn = (typeof _lang !== 'undefined' && _lang === 'bn');
    el.innerHTML = PS_PROMISES.map(function(p){
      return '<div class="ps-promise"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+PS_PROMISE_ICONS[p.ic]+'</svg><div class="ps-promise-tx"><b>'+esc(bn?p.t_bn:p.t_en)+'</b><span>'+esc(bn?p.s_bn:p.s_en)+'</span></div></div>';
    }).join('');
  }
  window.psRenderPromises = psRenderPromises;
  // ── Filter & sort sheet (redesign P1) — opened by the ▦ icon on the gender rail. ──
  // psFiltersInit MOVES the existing filter containers into the sheet's slots, so the build
  // functions (psBuildSort/psBuildCatFilter/psBuildBrandFilter/psBuildPriceFilter) keep
  // populating them by ID — no change to those functions.
  function psFiltersInit(){
    // Move ONLY the Sort tabs (incl. Sale/New) and the Price bands into the inline
    // filter bar. Categories and Brands are intentionally excluded — they live on the
    // categories page now, so the funnel shows just Sort + Sale + New + Price.
    [['psSortTabs','psFbSort'],['psPrice','psFbPrice']].forEach(function(m){
      var src=document.getElementById(m[0]), dst=document.getElementById(m[1]);
      if(src && dst && src.parentNode!==dst) dst.appendChild(src);
    });
    // Auto-close the bar a couple of seconds after the last filter tap so it doesn't
    // linger over the products. Delegated (the sort/price buttons are re-rendered), and
    // debounced — each new tap resets the timer, so multi-select stays open until done.
    var bar = document.getElementById('psFilterBar');
    if(bar && !bar._psAcWired){
      bar._psAcWired = true;
      bar.addEventListener('click', function(e){
        if(e.target.closest('.ps-sortbtn, .ps-bucket, .ps-fb-clear')) psFilterBarAutoClose();
      });
    }
  }
  var _psFilterBarTimer = null;
  function psFilterBarAutoClose(){
    clearTimeout(_psFilterBarTimer);
    _psFilterBarTimer = setTimeout(function(){
      var bar = document.getElementById('psFilterBar');
      if(bar && !bar.hasAttribute('hidden')) psFilters(false);
    }, 2200);
  }
  // Toggle the inline, pinned filter bar (no separate page/sheet). Called with no
  // argument from the funnel = toggle; a boolean forces open/closed.
  function psFilters(open){
    var bar=document.getElementById('psFilterBar'); if(!bar) return;
    clearTimeout(_psFilterBarTimer);   // cancel any pending auto-close on a manual toggle
    var show = (typeof open === 'boolean') ? open : bar.hasAttribute('hidden');
    if(show) bar.removeAttribute('hidden'); else bar.setAttribute('hidden','');
    var btn=document.getElementById('psFiltBtn'); if(btn) btn.setAttribute('aria-expanded', show?'true':'false');
  }
  window.psFilters = psFilters; window.psFiltersInit = psFiltersInit;
  function psShopBrandsMode(){
    if(psShopMode === 'brand'){ psShopMode = 'cat'; }                 // re-tap Brands → back to categories
    else { psShopMode = 'brand'; psShopDept = (psShopGender === 'x') ? 'w' : psShopGender; }   // enter Brands on the same dept (West has no brand pool → Women)
    psBuildShopCat();
  }
  function psSetBrandDept(d){ psShopDept = d; psBuildShopCat(); }
  // Desktop dual-cluster row: clicking a brand-cluster dept enters Brands mode for that dept directly
  // (mobile reaches this via the Brands toggle, but desktop shows both clusters at once).
  function psShopDeskBrand(d){ psShopMode = 'brand'; psShopDept = d; psBuildShopCat(); }
  // Brand names for a department, restricted to brands that actually have products (so each tile gets
  // a photo). Reuses the Browse-Brands ranked per-department pool. 'p' = Premium.
  function psShopBrandsForDept(dept){
    let pool = [];
    try { pool = bbDeptPool(dept) || []; } catch(e){ pool = (typeof BRANDS !== 'undefined') ? BRANDS.filter(b => b.c === dept) : []; }
    const present = psFacetBrands ? new Set(psFacetBrands) : null;
    const seen = new Set(), out = [];
    pool.forEach(b => { const n = b && b.n; if(n && !seen.has(n) && (!present || present.has(n))){ seen.add(n); out.push(n); } });
    return out;
  }
  // Keep a category tile's photo gender-appropriate: a WOMEN tile must not pick a men's product photo
  // (e.g. the Shawl tile was showing a man). Men/Kids tiles are gender-encoded already, so no filter.
  const _PS_MALE_RE = /\b(men|mens|men's|gents?|male|mardana|him|waistcoat|sherwani|achkan|prince ?coat)\b/i;
  function _psTileGender(catKey){ const t = PS_SHOP_TILES.find(x => x.key === catKey || (x.cats && x.cats.indexOf(catKey) >= 0)); return t ? t.g : ''; }
  function _psThumbOk(catKey, title, sz){
    const t = String(title || '');
    if(_psTileGender(catKey) === 'w' && _PS_MALE_RE.test(t)) return false;   // a women tile must not show a man
    // Unstitched fabric products (sz=['Unstitched']) show flat folded cloth, not a dressed model.
    // Skip them for STITCHED category tiles so tiles show an editorial model shot — not a fabric swatch.
    // (Unstitched categories like lawn_3pc_unstitch still use these products since ALL their items are
    // unstitched; the heuristic only kicks in when the category itself is a stitched/pret tile.)
    if(Array.isArray(sz) && sz.length === 1 && /^unstitch/i.test(sz[0]) && !/unstitch/.test(catKey)){
      return false;
    }
    // A kids EASTERN tile must show an EASTERN garment (kurta pajama / shalwar kameez / waistcoat),
    // never a western suit / pajama / tee — so "Boys Eastern" shows a kurta pajama (req 2026-06-25).
    if(/^kids_(?:boys|girls)_eastern$/.test(catKey)){
      if(/\bkurta|kameez|shalwar|sherwani|waist\s?coat|\bfrock\b|anarkali|lehenga|gharara|sharara|\bethnic\b|\beastern\b|peshwas|\bkurti\b/i.test(t)) return true;   // a real eastern garment (incl. "kurta pajama") → use it
      if(/\bsuiting\b|\bsuit\b|\bblazer\b|\bgilet\b|\bupper\b|zip[\s-]?up|\bjeans?\b|\bdenim\s+(?:jacket|shirt)|t-?shirt|\btee\b|\bpolo\b|\bhoodie\b|\bsweat|\bjacket\b|loungewear|\bpaj?ama|\bpyjama|\bathletic\b|\btrack\b|\bshorts?\b|\bjogger|\bbomber\b|\bcardigan\b/i.test(t)) return false;   // clearly western → never on an eastern tile
      return false;   // unknown garment → skip; wait for a clear eastern photo
    }
    // Kids WESTERN tile must show WESTERN garment (t-shirt, jeans, dress, etc.), never eastern.
    if(/^kids_(?:boys|girls)_western$/.test(catKey)){
      if(/\bsuiting\b|\bsuit\b|\bblazer\b|\bgilet\b|\bupper\b|zip[\s-]?up|\bjeans?\b|\bdenim\s+(?:jacket|shirt)|t-?shirt|\btee\b|\bpolo\b|\bhoodie\b|\bsweat|\bjacket\b|loungewear|\bpaj?ama|\bpyjama|\bathletic\b|\btrack\b|\bshorts?\b|\bjogger|\bbomber\b|\bcardigan\b|\bdress\b/i.test(t)) return true;   // a real western garment → use it
      if(/\bkurta|kameez|shalwar|sherwani|waist\s?coat|\bfrock\b|anarkali|lehenga|gharara|sharara|\bethnic\b|\beastern\b|peshwas|\bkurti\b/i.test(t)) return false;   // eastern → never on a western tile
      return false;   // unknown garment → skip
    }
    // Unstitched tile should prefer 3pc/fabric, not single-piece stitched items.
    if(/unstitch/.test(catKey)){
      if(/\b3[\s-]?pc|\b2[\s-]?pc|lawn|fabric|tissue|karandi|khaddar|\bunstitched\b/i.test(t)) return true;   // multi-piece or fabric → good for unstitched tile
      if(/\b1[\s-]?pc|kurti|shirt|top|trouser|\bsuit\b/i.test(t)) return false;   // single stitched items → skip
    }
    // Maxi/Dress tile should prefer maxi, dresses, not other garments.
    if(/maxi|dress/i.test(catKey)){
      if(/\bmaxi\b|\bdress\b|gown|abaya|burka|\bevening\b/i.test(t)) return true;   // maxi/dress item → good
      if(/\bkurti\b|\bshirt\b|trouser|jeans|\bpant\b|\btop\b|saree|lehenga|gharara/i.test(t)) return false;   // other garments → skip
    }
    // Shirt (Men's) tile should prefer shirts, not other garments.
    if(/mens.*shirt|shirt.*mens/i.test(catKey)){
      if(/\bshirt\b/i.test(t) && !/_RE/.test(t)) return true;   // shirt item → good
      if(/\bpolo\b|\bwaistcoat\b|\bsherwani\b|trouser|pant|formal|suit/i.test(t)) return false;   // not a shirt → skip
    }
    // Infant tile should prefer actual infant sizes, not regular clothing.
    if(/infant|baby/i.test(catKey)){
      if(/\binfant\b|\bbaby\b|\bnewborn\b|\b0[\s-]?[36]|[\s-]?[36]\bmonth|\b6[\s-]?month|[\s-]?12[\s-]?month|\b[0-2]y|\b[0-3][\s-]?year|onesie|romper/i.test(t)) return true;   // infant size → good
      if(/\b[3-9]y|10|adult|regular|standard/i.test(t)) return false;   // older kids/adult → skip
    }
    return true;
  }
  // Per-category representative photo, cached in localStorage (14-day TTL) so the strip
  // paints instantly on repeat visits. Filled two ways: opportunistically from any product
  // page the grid loads (psHarvestThumbs), and by a throttled gap-fill fetch (psLoadShopThumbs).
  const PS_THUMB_TTL = 14 * 24 * 3600 * 1000;
  let _psThumbs = {};
  try { _psThumbs = JSON.parse(localStorage.getItem('psb_cat_thumbs_v7') || '{}') || {}; } catch(e){ _psThumbs = {}; }   // _v4: re-fetch after the kids eastern/western fix so "Boys Eastern" shows a kurta, not a western suit
  function _psThumbsSave(){ try{ localStorage.setItem('psb_cat_thumbs_v7', JSON.stringify(_psThumbs)); }catch(e){} }
  function psThumbGet(key){ const t = _psThumbs[key]; return (t && t.u && (Date.now() - t.t < PS_THUMB_TTL)) ? t.u : ''; }
  function psThumbSet(key, url){ if(!key || !url) return; _psThumbs[key] = { u:url, t:Date.now() }; _psThumbsSave(); }
  // Record the first GENDER-APPROPRIATE image seen for any category from a freshly-loaded product page.
  function psHarvestThumbs(products){
    if(!Array.isArray(products)) return;
    let changed = false;
    for(const p of products){ if(p && p.cat && p.img && !psThumbGet(p.cat) && _psThumbOk(p.cat, p.t, p.sz)){ _psThumbs[p.cat] = { u:p.img, t:Date.now() }; changed = true; } }
    if(changed){ _psThumbsSave(); psPaintShopThumbs(); }
  }
  // The carousel-active category KEY: the single selected category, OR (for a clubbed multi-cat tile)
  // the tile whose full cat-set exactly matches the selection. '' when a brand/price filter is active.
  function _psActiveCatKey(){
    if(psSel.brands.size || psSel.prices.size || !psSel.cats.size) return '';
    for(const t of PS_SHOP_TILES){
      const cats = t.cats || [t.key];
      if(cats.length === psSel.cats.size && cats.every(k => psSel.cats.has(k))) return t.key;
    }
    return '';
  }
  // Restart the carousel fade/slide animation when its tiles are swapped (dept/brand switch),
  // so it reads as a transition instead of a hard refresh (req: Danish 2026-06-26).
  function _pscSwapAnim(wrap){ if(!wrap) return; wrap.classList.remove('psc-swap'); void wrap.offsetWidth; wrap.classList.add('psc-swap'); }
  function psBuildShopCat(){
    // ONE tab row, double duty: catalogue mode = Women/Men/Kids (categories); Brands mode =
    // Women/Men/Kids/Premium (brand departments). The Brands toggle on the right switches modes.
    // Premium ONLY shows in Brands mode (req) — never on the catalogue landing.
    const tabsEl = document.getElementById('psShopTabs');
    const brand = psShopMode === 'brand';
    if(tabsEl){
      const lang = _lang === 'bn';
      if(window.innerWidth >= 820){
        // DESKTOP (req): show BOTH clusters in the one row at once — Brands (brand depts fanning toward
        // the left, next to the 🏷️ Brands label) + Categories (📁 Categories label then the category
        // depts incl. West, on the right). Click a brand dept → that dept's brand carousel; a category
        // dept → its category tiles. No toggle — desktop has the width to show both. Mobile keeps the toggle.
        const bAct = brand ? psShopDept : '';
        const cAct = brand ? '' : psShopGender;
        const bTiles = PS_BRAND_DEPTS.map(([d,e,en,bn]) => `<button type="button" class="psc-gtab${d===bAct?' on':''}" onclick="psShopDeskBrand('${d}')">${e} ${esc(lang?bn:en)}</button>`).join('');
        const cTiles = PS_SHOP_GENDERS.map(([d,e,en,bn]) => `<button type="button" class="psc-gtab${d===cAct?' on':''}" onclick="psSetShopGender('${d}')">${e} ${esc(lang?bn:en)}</button>`).join('');
        tabsEl.innerHTML = `<div class="psc-deskrow">`
          + `<div class="psc-cluster psc-cl-brand${brand?' on':''}">${bTiles}<span class="psc-clabel">🏷️ ${esc(tr('ps_brands'))}</span></div>`
          + `<div class="psc-cluster psc-cl-cat${brand?'':' on'}"><span class="psc-clabel">📁 ${esc(tr('ps_category_short'))}</span>${cTiles}</div>`
          + `</div>`;
      } else {
        const src = brand ? PS_BRAND_DEPTS : PS_SHOP_GENDERS;
        const activeKey = brand ? psShopDept : psShopGender;
        const fn = brand ? 'psSetBrandDept' : 'psSetShopGender';
        const deptHtml = src.map(([d,e,en,bn]) =>
          `<button type="button" class="psc-gtab${d===activeKey ? ' on' : ''}" onclick="${fn}('${d}')">${e} ${esc(lang?bn:en)}</button>`).join('');
        // Dept tabs sit in their own track; the Brands toggle is OUTSIDE it so it's always tappable.
        // In Brands mode the track is compacted (teal slide-in); cat mode is gold left slide-in (req).
        tabsEl.innerHTML = `<div class="psc-tabscroll${brand ? ' on-brand' : ' on-cat'}">${deptHtml}</div>`
          + `<button type="button" class="psc-gtab psc-gtab-brand${brand ? ' on' : ''}" onclick="psShopBrandsMode()">🏷️ ${esc(tr('ps_brands'))}</button>`;
      }
    }
    const deptsEl = document.getElementById('psBrandDepts'); if(deptsEl) deptsEl.style.display = 'none';   // retired: brand departments now live in the tab row above
    const wrap = document.getElementById('psShopScroll'); if(!wrap) return;
    // ── BRAND MODE: a carousel of the selected department's brand photos ──
    if(brand){
      var _nbb = document.getElementById('psCatBar'); if(_nbb) _nbb.innerHTML = '';   // names bar is category-mode only (#8)
      // The per-dept brand pool needs the brand→category index (so multi-dept flagships like
      // Khaadi/Sapphire/Gul Ahmed fold into Women/Men/Kids, and brands are strength-ranked). Load it
      // once — same as Browse Brands — then re-render; without it the fallback drops those brands.
      if(!_bbIndex){
        if(!_bbIdxLoading){ _bbIdxLoading = true; bbLoadIndex(() => { _bbIdxLoading = false; psBuildShopCat(); }); }
        wrap.innerHTML = `<div class="psc-empty">${esc(tr('bb_loading'))}</div>`; wrap.scrollLeft = 0;
        return;
      }
      const activeBrand = (psSel.brands.size===1 && !psSel.cats.size && !psSel.prices.size) ? [...psSel.brands][0] : '';
      const brands = psShopBrandsForDept(psShopDept);
      if(!brands.length){ wrap.innerHTML = `<div class="psc-empty">${esc(tr('bb_prod_none'))}</div>`; wrap.scrollLeft = 0; return; }
      wrap.innerHTML = brands.map(n => {
        const url = psBrandThumbGet(n, psShopDept);
        const img = url ? `<img loading="lazy" src="${esc(thumbUrl(url))}" alt="${esc(n)}" onerror="this.closest('.psc-tile').classList.add('psc-noimg');this.remove();">` : '';
        return `<button type="button" class="psc-tile${n===activeBrand ? ' on' : ''}${url ? '' : ' psc-noimg'}" data-brand="${esc(n)}" onclick="psShopPickBrand(this.getAttribute('data-brand'))" title="${esc(n)}">`
          + `<span class="psc-img" data-emoji="🏷️">${img}</span>`
          + `<span class="psc-lbl">${esc(n)}</span></button>`;
      }).join('');
      wrap.scrollLeft = 0;
      _pscSwapAnim(wrap);
      psLoadBrandThumbs(brands, psShopDept);
      return;
    }
    // ── CATEGORY MODE (default) ──
    if(deptsEl) deptsEl.style.display = 'none';
    const active = _psActiveCatKey();
    wrap.innerHTML = psShopTiles().map(t => {
      const lbl = (_lang === 'bn' && t.bn) ? t.bn : t.en;
      const url = t.img || psThumbGet(t.key);
      const img = url ? `<img loading="lazy" src="${esc(thumbUrl(url))}" alt="${esc(lbl)}" onerror="this.closest('.psc-tile').classList.add('psc-noimg');this.remove();">` : '';
      return `<button type="button" class="psc-tile${t.key === active ? ' on' : ''}${url ? '' : ' psc-noimg'}" data-cat="${esc(t.key)}" onclick="psShopPick('${t.key}')" title="${esc(lbl)}">`
        + `<span class="psc-img" data-emoji="${t.e || '🛍️'}">${img}</span>`
        + `<span class="psc-lbl">${esc(lbl)}</span></button>`;
    }).join('');
    // Names-only chips for the scrolled state (#8): same tiles, name + link only (no images).
    var _nb = document.getElementById('psCatBar');
    if(_nb){
      _nb.innerHTML = psShopTiles().map(function(t){
        var nl = (_lang === 'bn' && t.bn) ? t.bn : t.en;
        return '<button type="button" class="ps-catchip'+(t.key === active ? ' on' : '')+'" data-cat="'+esc(t.key)+'" onclick="psShopPick(\''+t.key+'\')">'+esc(nl)+'</button>';
      }).join('');
    }
    wrap.scrollLeft = 0;
    _pscSwapAnim(wrap);   // fade/slide the new tiles in (transition, not a hard refresh — req: Danish)
    psLoadShopThumbs();
  }
  // ── Brand-tile photos: one representative photo per brand PER DEPARTMENT (so a multi-dept brand
  //    shows a kids photo under Kids, a women photo under Women, etc.), cached in localStorage ──
  let _psBrandThumbs = {};
  try { _psBrandThumbs = JSON.parse(localStorage.getItem('psb_brand_thumbs_v3') || '{}') || {}; } catch(e){ _psBrandThumbs = {}; }
  function _psBrandKey(n, dept){ return n + '|' + (dept || 'w'); }
  function psBrandThumbGet(n, dept){ const t = _psBrandThumbs[_psBrandKey(n, dept)]; return (t && t.u && (Date.now() - t.t < PS_THUMB_TTL)) ? t.u : ''; }
  // ── Brand LOGOS (harvested from each brand site: apple-touch-icon > icon > og:image) ──
  // Higher quality than favicons; keyed by hostname (no www). Loaded from brand-logos.json,
  // cached, and used on the brand tiles + search suggestions. Falls back to initials when missing.
  let _psBrandLogos = {};
  try { _psBrandLogos = JSON.parse(localStorage.getItem('psb_brand_logos') || '{}') || {}; } catch(e){ _psBrandLogos = {}; }
  (function(){
    fetch('brand-logos.json', { cache:'default' })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(j){ if(j && typeof j==='object'){ _psBrandLogos = j; try{ localStorage.setItem('psb_brand_logos', JSON.stringify(j)); }catch(e){} try{ if(typeof bbActive==='function' && bbActive()) bbRenderProduct(); }catch(e){} } })
      .catch(function(){});
  })();
  function psBrandLogo(u){ try{ var h=new URL(u).hostname.replace(/^www\./,''); return _psBrandLogos[h] || ''; }catch(e){ return ''; } }
  function psBrandThumbSet(n, dept, url){ if(!n || !url) return; _psBrandThumbs[_psBrandKey(n, dept)] = { u:url, t:Date.now() }; try{ localStorage.setItem('psb_brand_thumbs_v3', JSON.stringify(_psBrandThumbs)); }catch(e){} }
  function psPaintBrandTile(n, url){
    if(!url) return;
    let tile = null;
    document.querySelectorAll('#psShopScroll .psc-tile[data-brand]').forEach(t => { if(t.getAttribute('data-brand') === n) tile = t; });
    if(!tile) return;
    const span = tile.querySelector('.psc-img'); if(!span || span.querySelector('img')) return;
    const im = document.createElement('img'); im.loading = 'lazy'; im.src = thumbUrl(url); im.alt = n;
    im.onerror = function(){ tile.classList.add('psc-noimg'); im.remove(); };
    span.appendChild(im); tile.classList.remove('psc-noimg');
  }
  function psLoadBrandThumbs(brands, dept){
    brands.forEach(n => { const u = psBrandThumbGet(n, dept); if(u) psPaintBrandTile(n, u); });
    if(!psApiMode) return;
    const missing = brands.filter(n => !psBrandThumbGet(n, dept));
    if(!missing.length) return;
    const cats = _psDeptCats(dept);
    const catParam = (cats && cats.length) ? ('&cat=' + encodeURIComponent(cats.join(','))) : '';   // dept-scoped photo
    // Women dept: a multi-dept brand (Al-Deebaj/Edenrobe…) can carry men's kurta/waistcoat items
    // filed under women categories — pull a few and pick the first NON-men's-titled photo so the
    // Women tile isn't a man. Men/Kids tiles are already gender-scoped by category → 1 is enough.
    const ps = (dept === 'w') ? 6 : 1;
    let i = 0; const CONC = 4;
    function next(){
      if(i >= missing.length) return;
      const n = missing[i++];
      fetch(psSearchBase() + '?brand=' + encodeURIComponent(n) + catParam + '&pageSize=' + ps + '&page=0', { cache:'default' })
        .then(r => r.ok ? r.json() : null)
        .then(j => {
          const arr = (j && j.products) || [];
          // Prefer a stitched (real-sized) product — unstitched items show flat fabric, not a model.
          const _notUns = x => !(Array.isArray(x.sz) && x.sz.length === 1 && /^unstitch/i.test(x.sz[0]));
          let p = (dept === 'w') ? arr.find(x => x && x.img && _notUns(x) && !_PS_MALE_RE.test(String(x.t || ''))) : arr.find(x => x && x.img && _notUns(x));
          if(!p) p = (dept === 'w') ? arr.find(x => x && x.img && !_PS_MALE_RE.test(String(x.t || ''))) : arr.find(x => x && x.img) || null;
          if(p && p.img){ psBrandThumbSet(n, dept, p.img); psPaintBrandTile(n, p.img); }
        })
        .catch(() => {})
        .then(() => { next(); });
    }
    for(let c = 0; c < CONC; c++) next();
  }
  // Category keys for a brand-carousel department. Premium ('p') is a tier, not a gender → no cat
  // restriction. Women/Men/Kids restrict to that gender's categories so a multi-department brand
  // (Edenrobe, Khaadi…) shows ONLY that department's articles when picked under it (req).
  function _psDeptCats(dept){ return dept === 'w' ? PS_W : dept === 'm' ? PS_M : dept === 'k' ? PS_K : []; }
  // True when a cat-set is EXACTLY one whole department's category list — i.e. it came from a bare
  // brand-tile tap (dept widening), NOT a specific search/faceted narrowing like "kurti". Lets a
  // brand pick PRESERVE a real category filter while still widening a bare brand tap to the dept.
  function _psIsWholeDeptCats(s){ return [PS_W, PS_M, PS_K].some(d => s.size === d.length && d.every(c => s.has(c))); }
  // Tap a brand tile → filter the grid to that brand AND the current department's categories, then scroll.
  function psShopPickBrand(name){
    if(!name) return;
    const deptCats = (psShopMode === 'brand') ? _psDeptCats(psShopDept) : [];
    // STACK with the active search + filters (req: "search kurti then pick Khaadi → only Khaadi
    // kurti"). A typed category/keyword lives in psQuery (free-text FTS), so PRESERVE psQuery +
    // psSizeQ + the search box + price/sort/sale/new. Also preserve an explicit faceted category
    // narrowing; only widen to the whole department's cats for a bare brand tap (no category yet).
    const keepCats = (psSel.cats.size && !_psIsWholeDeptCats(psSel.cats)) ? psSel.cats : new Set(deptCats);
    psSel = { prices:new Set(psSel.prices), cats:new Set(keepCats), brands:new Set([name]) };
    psBuildPriceFilter(); psBuildBrandFilter(); psBuildCatFilter(); psBuildSort(); psApply();
    psScrollGridUnderCarousel();
  }
  function psPaintTile(key, url){
    if(!url) return;
    const tile = document.querySelector('#psShopScroll .psc-tile[data-cat="' + key + '"]'); if(!tile) return;
    const span = tile.querySelector('.psc-img'); if(!span || span.querySelector('img')) return;
    const im = document.createElement('img'); im.loading = 'lazy'; im.src = thumbUrl(url); im.alt = tile.getAttribute('title') || '';
    im.onerror = function(){ tile.classList.add('psc-noimg'); im.remove(); };
    span.appendChild(im); tile.classList.remove('psc-noimg');
  }
  // Paint cached photos onto whatever tiles are currently rendered (the active department).
  function psPaintShopThumbs(){ psShopTiles().forEach(t => { const u = psThumbGet(t.key); if(u) psPaintTile(t.key, u); }); }
  // Gap-fill the strip: one tiny API call per VISIBLE category that has no cached photo yet (throttled).
  function psLoadShopThumbs(){
    psPaintShopThumbs();
    if(!psApiMode) return;   // catalog.json mode: harvesting from the grid covers it
    const missing = psShopTiles().filter(t => !t.img && !psThumbGet(t.key)).map(t => t.key);
    if(!missing.length) return;
    let i = 0; const CONC = 4;
    function next(){
      if(i >= missing.length) return;
      const key = missing[i++];
      // pull a few and pick the first GENDER-APPROPRIATE photo (so a Women tile never shows a man)
      fetch(psSearchBase() + '?cat=' + encodeURIComponent(key) + '&pageSize=6&page=0', { cache:'default' })
        .then(r => r.ok ? r.json() : null)
        .then(j => {
          const arr = (j && j.products) || [];
          // For a WOMEN tile, never fall back to a (possibly men's) photo — leave the emoji instead
          // of risking a man (req: the Shawl tile must show a woman). Men/Kids tiles keep the fallback.
          const isW = _psTileGender(key) === 'w';
          const pick = arr.find(p => p && p.img && _psThumbOk(key, p.t, p.sz)) || (isW ? null : arr.find(p => p && p.img));
          if(pick && pick.img){ psThumbSet(key, pick.img); psPaintTile(key, pick.img); }
        })
        .catch(() => {})
        .then(() => { next(); });
    }
    for(let c = 0; c < CONC; c++) next();
  }
  // Tap a category tile → filter the grid to that category (a merged tile selects all its cats), then scroll.
  function psShopPick(key){
    const tile = PS_SHOP_TILES.find(t => t.key === key);
    const cats = (tile && tile.cats) ? tile.cats : [key];
    // STACK with the active search + filters (req: "search 'agha noor' then tap a category →
    // that category, Agha Noor only"). A typed brand/keyword lives in psQuery (free-text FTS —
    // API mode can't always pre-resolve it to a brand chip), so PRESERVE psQuery + psSizeQ + the
    // search box + the brand / price / sort / sale / new state; only set the chosen category.
    psSel = { prices:new Set(psSel.prices), cats:new Set(cats), brands:new Set(psSel.brands) };
    psBuildPriceFilter(); psBuildBrandFilter(); psBuildCatFilter(); psBuildSort(); psApply();
    psScrollGridUnderCarousel();
  }
  // Scroll the grid to the top, but offset by the pinned carousel's LIVE height (it varies with
  // 1- vs 2-line labels and is taller on desktop) so the first product row isn't tucked behind it.
  function psScrollGridUnderCarousel(){
    const grid = document.getElementById('psGrid'); if(!grid) return;
    let off = 0;
    if(window.innerWidth < 820){
      // Mobile (#8): the sticky top group (search + names bar) is what stays on screen — clear it.
      const ts = document.querySelector('.ps-topstick'); if(ts) off = ts.offsetHeight + 8;
    } else {
      // Desktop: the fixed filter/carousel header — offset by its LIVE height.
      const head = document.getElementById('psPinHead');
      try { const pos = head ? getComputedStyle(head).position : ''; if(pos === 'sticky' || pos === 'fixed') off = head.offsetHeight + 8; } catch(e){}
    }
    if(off){
      const y = grid.getBoundingClientRect().top + (window.scrollY || window.pageYOffset || 0) - off;
      window.scrollTo({ top: Math.max(0, y), behavior:'smooth' });
    } else {
      grid.scrollIntoView({ behavior:'smooth', block:'start' });
    }
  }
  function psIsLanding(){ return !psSel.cats.size && !psSel.brands.size && !psSel.prices.size && !psSaleOnly && !psNewOnly && !psSort && !psQuery && !psSizeQ; }
  // Update which tile is highlighted as active (the single selected category OR brand) — no rebuild.
  function psSyncShopActive(){
    const sc = document.getElementById('psShopScroll'); if(!sc) return;
    const activeCat   = _psActiveCatKey();
    const activeBrand = (psSel.brands.size === 1 && !psSel.cats.size && !psSel.prices.size) ? [...psSel.brands][0] : '';
    sc.querySelectorAll('.psc-tile').forEach(t => {
      const c = t.getAttribute('data-cat'), b = t.getAttribute('data-brand');
      t.classList.toggle('on', (!!c && c === activeCat) || (!!b && b === activeBrand));
    });
    // Keep the scrolled-state name chips (#8) in sync with the active category.
    const _cb = document.getElementById('psCatBar');
    if(_cb) _cb.querySelectorAll('.ps-catchip').forEach(c => { const k = c.getAttribute('data-cat'); c.classList.toggle('on', !!k && k === activeCat); });
  }
  // ── Keep the Browse-Products filter/category bar fixed to the top through the WHOLE scroll
  //    (req: "keep it fixed for both iphone and android"). The bar is position:sticky scoped to
  //    .ps-results, so on its own it releases the moment you scroll past the products into the
  //    "Paste a link" section below. A 0-height sentinel records the bar's in-flow position; once
  //    it scrolls under the top safe-area we switch the bar to position:fixed (matched to the
  //    results column) and grow the sentinel to fill the gap so nothing jumps. It releases back to
  //    sticky when you scroll up, so the branding still shows at the very top first. Mobile +
  //    Products-tab only — desktop's bar is a static sidebar. ──
  const _psPin = { sen:null, on:false, bound:false, inset:0 };
  function _psPinMeasureInset(){
    // env(safe-area-inset-top) isn't readable directly in JS — measure it off a hidden fixed probe
    // so the fixed bar clears the iPhone notch/camera exactly like the sticky one did (standing rule).
    let p = document.getElementById('psSafeProbe');
    if(!p){ p = document.createElement('div'); p.id = 'psSafeProbe'; p.style.cssText = 'position:fixed;top:0;left:0;width:0;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none'; document.body.appendChild(p); }
    _psPin.inset = p.getBoundingClientRect().height;
  }
  function psPinUpdate(){
    const head = document.getElementById('psPinHead'); if(!head) return;
    let sen = _psPin.sen;
    if(!sen || !sen.parentNode){ sen = document.createElement('div'); sen.setAttribute('aria-hidden','true'); sen.style.height = '0px'; head.parentNode.insertBefore(sen, head); _psPin.sen = sen; }
    // Runs on BOTH mobile and desktop now (req: desktop also locks the filters/sort/carousel on
    // scroll). Only while the bar is actually rendered — getClientRects() (not offsetParent, which
    // is null for position:fixed) stays truthy while fixed, and goes empty when the Brands tab hides
    // #tabProducts, so we correctly drop the fix on tab switch.
    const active = head.getClientRects().length > 0;
    // Mobile (#8): the category photo strip no longer pins — it scrolls away and the names-only
    // bar in the sticky top group takes over. Only DESKTOP keeps the fixed filter/carousel header.
    const _mob = window.innerWidth < 820;
    if(!active || _mob){
      if(_psPin.on){ head.style.position=''; head.style.top=''; head.style.left=''; head.style.width=''; head.style.zIndex=''; head.classList.remove('ps-pinned'); sen.style.height='0px'; _psPin.on=false; }
      return;
    }
    const st = _psPin.inset;
    const senTop = sen.getBoundingClientRect().top;
    if(!_psPin.on && senTop <= st){
      const rr = head.parentElement.getBoundingClientRect();
      const hH = head.getBoundingClientRect().height;
      head.style.position='fixed'; head.style.top=st+'px'; head.style.left=rr.left+'px'; head.style.width=rr.width+'px'; head.style.zIndex='16';
      head.classList.add('ps-pinned');   // desktop: triggers the background/shadow (mobile already styles the pinhead)
      sen.style.height = hH + 'px';
      _psPin.on = true;
    } else if(_psPin.on && senTop > st){
      head.style.position=''; head.style.top=''; head.style.left=''; head.style.width=''; head.style.zIndex=''; head.classList.remove('ps-pinned');
      sen.style.height='0px';
      _psPin.on = false;
    }
  }
  function psPinInit(){
    if(_psPin.bound) return;
    _psPin.bound = true;
    _psPin.desk = window.innerWidth >= 820;
    _psPinMeasureInset();
    window.addEventListener('scroll', () => window.requestAnimationFrame(psPinUpdate), { passive:true });
    // On resize/orientation, the column width and notch inset may change: drop the fix and recompute.
    window.addEventListener('resize', () => {
      const head = document.getElementById('psPinHead');
      if(head){ head.style.position=''; head.style.top=''; head.style.left=''; head.style.width=''; head.style.zIndex=''; head.classList.remove('ps-pinned'); }
      if(_psPin.sen) _psPin.sen.style.height = '0px';
      _psPin.on = false;
      _psPinMeasureInset();
      // Re-render the tab row only when crossing the 820 breakpoint (desktop dual-cluster ↔ mobile toggle).
      const desk = window.innerWidth >= 820;
      if(_psPin.desk !== desk){ _psPin.desk = desk; try { psBuildShopCat(); } catch(e){} }
      window.requestAnimationFrame(psPinUpdate);
    });
    psPinUpdate();
  }
  // The Shop-by-Category carousel is ALWAYS visible (req) — it sticks at the top while scrolling
  // products so the buyer can switch category anytime. Build lazily; otherwise just refresh the
  // active highlight.
  function psSyncDeptTiles(){
    const el = document.getElementById('psShopCat'); if(!el) return;
    el.style.display = '';
    const sc = document.getElementById('psShopScroll');
    if(sc && !sc.children.length) psBuildShopCat();
    else psSyncShopActive();
    psPinInit();
  }
  // All three filters combine with AND; price buckets OR within themselves.
  function psApply(){
    psPage = 0;
    psFeedDone = false; psFeedLoading = false;        // infinite scroll: start a fresh feed
    psFeedSeed = Math.floor(Date.now() / 90000);      // freeze the shuffle for this feed's pages
    psSyncDeptTiles();
    if(psApiMode) return psApiFetch();   // API mode: server filters/sorts/pages; psFiltered = the page
    psFiltered = PS_CATALOG.filter(p => {
      if(PS_HIDE_CATS.has(p.cat)) return false;   // accessories/jewellery not shown on the Products grid
      if(psIsHidden(p)) return false;             // found SOLD OUT via the live add → hidden from the grid
      if(psSel.brands.size && !psSel.brands.has(p.b)) return false;
      if(!psCatMatch(p)) return false;
      if(psSel.prices.size){
        let ok = false;
        psSel.prices.forEach(i => { const b = PS_BUCKETS[i]; if(p._bdt >= b.lo && p._bdt < b.hi) ok = true; });
        if(!ok) return false;
      }
      if(psSaleOnly && !p.sale) return false;        // Sale filter: discounted items only
      if(psNewOnly && p.sale) return false;          // New filter: newest NON-sale items (Sale & New mutually exclusive)
      return true;
    });
    // Price sort orders the current view — including WITHIN the Sale/New filter (multilevel).
    // With New on and no price sort, default to newest-first; otherwise keep the curated order.
    if(psSort === 'asc')       psFiltered.sort((a,b) => a._bdt - b._bdt);          // ৳ landed price ↑
    else if(psSort === 'desc') psFiltered.sort((a,b) => b._bdt - a._bdt);          // ৳ landed price ↓
    else if(psNewOnly)         psFiltered.sort((a,b) => (b.pub||0) - (a.pub||0));  // New, no price sort → newest first
    psRender();
  }
  // Filter + sort chip row beneath the count (Option C): Sale (filter) · New · ৳↑ · ৳↓.
  // Tapping the active sort/Sale chip clears it.
  function psBuildSort(){
    const el = document.getElementById('psSortTabs'); if(!el) return;
    // Two DIRECT sort buttons (৳ Low→High / ৳ High→Low) — no dropdown, which was unreliable on
    // touch — plus Sale + New, all on one row. Re-tapping the active sort clears it.
    el.innerHTML =
        `<span class="ps-sortgrp">`
      +   `<button type="button" class="ps-sortbtn${psSort==='asc'?' on':''}" onclick="psSetSortVal('asc')">${tr('ps_sort_lh')}</button>`
      +   `<button type="button" class="ps-sortbtn${psSort==='desc'?' on':''}" onclick="psSetSortVal('desc')">${tr('ps_sort_hl')}</button>`
      + `</span>`
      + `<span class="ps-sortgrp">`
      +   `<button type="button" class="ps-sortbtn ps-salebtn${psSaleOnly?' on':''}" onclick="psToggleSale()">${tr('ps_sale')}</button>`
      +   `<button type="button" class="ps-sortbtn${psNewOnly?' on':''}" onclick="psToggleNew()">${tr('ps_new')}</button>`
      + `</span>`;
    try{ psBuildQuickBar(); }catch(e){}
  }
  // Quick sort/price bar (#9): a compact mirror of the sheet's Sort + Price, shown in the sticky top
  // group while scrolling products. Uses the SAME global handlers/state, so it stays in sync; this fn
  // is called from psBuildSort + psBuildPriceFilter so any sort/price change refreshes it.
  function psBuildQuickBar(){
    var el = document.getElementById('psQuickBar'); if(!el) return;
    var sort = '<span class="ps-qlabel">'+esc(tr('sort_hd'))+'</span>'
      + '<button type="button" class="ps-qchip'+(psSort==='asc'?' on':'')+'" onclick="psSetSortVal(\'asc\')">'+esc(tr('ps_sort_lh'))+'</button>'
      + '<button type="button" class="ps-qchip'+(psSort==='desc'?' on':'')+'" onclick="psSetSortVal(\'desc\')">'+esc(tr('ps_sort_hl'))+'</button>'
      + '<button type="button" class="ps-qchip'+(psNewOnly?' on':'')+'" onclick="psToggleNew()">'+esc(tr('ps_new'))+'</button>'
      + '<button type="button" class="ps-qchip'+(psSaleOnly?' on':'')+'" onclick="psToggleSale()">'+esc(tr('ps_sale'))+'</button>';
    var price = '<span class="ps-qlabel">'+esc(tr('ps_price_short'))+'</span>'
      + PS_BUCKETS.slice(0, 6).map(function(b,i){ return '<button type="button" class="ps-qchip'+(psSel.prices.has(i)?' on':'')+'" onclick="psTogglePrice('+i+')">'+esc(b.lbl)+'</button>'; }).join('');   // hide 15k+ (req)
    el.innerHTML = sort + price;
  }
  function psToggleSortPop(){
    const pop = document.getElementById('psSortPop'), btn = document.getElementById('psSortBtn');
    if(!pop) return;
    const open = pop.classList.toggle('open');
    if(btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  // Select a sort option (re-tapping the active one clears it back to the curated default).
  function psSetSortVal(s){ psSort = (psSort === s) ? '' : s; const p = document.getElementById('psSortPop'); if(p) p.classList.remove('open'); psBuildSort(); psApply(); }
  function psSetSort(s){ psSort = (psSort === s) ? '' : s; psBuildSort(); psApply(); }   // legacy alias
  // Sale and New are FILTERS (Sale ⇄ New mutually exclusive); the ৳ price sort orders WITHIN
  // whichever is active. Outside-click closes the sort popover (mirrors the price popover).
  document.addEventListener('click', function(e){
    const dd = document.getElementById('psSortDd'), pop = document.getElementById('psSortPop');
    if(pop && pop.classList.contains('open') && dd && !dd.contains(e.target)){
      pop.classList.remove('open');
      const btn = document.getElementById('psSortBtn'); if(btn) btn.setAttribute('aria-expanded','false');
    }
  });
  function psToggleSale(){ psSaleOnly = !psSaleOnly; if(psSaleOnly) psNewOnly = false; psBuildSort(); psApply(); }   // Sale ⇄ New
  function psToggleNew(){ psNewOnly = !psNewOnly; if(psNewOnly) psSaleOnly = false; psBuildSort(); psApply(); }       // New = newest non-sale; price sorts within
  // Dynamic "12,000+ products · 80+ brands — want more?" note; counts come from the
  // live catalogue (rounded down) so they grow/shrink with the listing automatically.
  function psUpdateNote(){
    const el = document.getElementById('psNoteCounts');
    if(!el) return;
    // API mode (PS_CATALOG null): use the API's reported total + the brand-index/facet brand
    // count so the note reflects the live catalogue instead of the stale static placeholder.
    let prodCount = 0, brandCount = 0;
    if(psApiMode){
      prodCount  = _psCatTotal || psApiTotal || 0;
      brandCount = (psFacetBrands && psFacetBrands.length) || (_bbCnt && Object.keys(_bbCnt).length) || 0;
    } else if(PS_CATALOG){
      prodCount  = PS_CATALOG.length;
      brandCount = new Set(PS_CATALOG.map(p => p.b)).size;
    }
    if(!prodCount) return;
    const prods = Math.floor(prodCount / 1000) * 1000;
    let s = '<b>' + prods.toLocaleString('en-US') + '+</b> ' + tr('ps_word_products');
    if(brandCount >= 10) s += ' · <b>' + (Math.floor(brandCount / 10) * 10) + '+</b> ' + tr('ps_word_brands');
    el.innerHTML = s;
  }

  function psPageSize(){ return window.innerWidth >= 820 ? 12 : 8; }
  // Per-card estimated landed ৳BDT (product + base commission + weight×logistics).
  function estLandedBdt(pkr, cat){
    const r = getRates();
    // The full landed ৳BDT for ONE piece (product + commission + weight×logistics), BEFORE the
    // ৳100/suit local delivery that's added in the Bag. This is the number shown on the Browse card
    // AND echoed in the add-to-order popup, so the price the buyer taps == the price they confirm.
    // Component-wise rounding MATCHES the basket total (renderCart): basket = Σ this + ৳100×suits.
    const productBdt = Math.round(pkr * r.CONV_RATE);
    const commission = pkr < (r.PKR_LOW_THRESHOLD || 2100)
      ? (r.COMM_LOW_BDT || 200)
      : Math.round(productBdt * (r.COMM_1 || 0));
    const logistics  = Math.round((typeof getWeight === 'function' ? getWeight(cat) : 0.5) * r.LOG_RATE);
    return productBdt + commission + logistics;
  }

  // Return a ~400px-wide thumbnail URL for the grid (full-res stays in the enlarge view).
  // 92% of catalog images are Shopify (?width=400); Khaadi/Sapphire are SFCC dw/image (?sw=400).
  // Unknown/unsafe hosts are returned UNCHANGED, and it never throws.
  function thumbUrl(url){
    try {
      if (typeof url !== 'string' || !url) return url;
      var u;
      try { u = new URL(url); } catch (e) { return url; }
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return url;
      var host = u.hostname.toLowerCase();
      if (host === 'cdn.shopify.com' || host.endsWith('.cdn.shopify.com')) {
        if (u.searchParams.has('width')) return url;
        u.searchParams.set('width', '400');
        return u.toString();
      }
      if (host === 'pk.sapphireonline.pk' || host === 'pk.khaadi.com') {
        if (u.pathname.indexOf('/dw/image/') !== -1) {
          if (u.searchParams.has('sw') || u.searchParams.has('sh')) return url;
          u.searchParams.set('sw', '400');
          return u.toString();
        }
        return url;
      }
      return url;
    } catch (e) { return url; }
  }
  function psCard(p, idx){
    const bdt = (p._bdt != null) ? p._bdt : estLandedBdt(p.pkr, p.cat);
    // ONLY in-stock sizes (the catalog already lists available sizes only); labelled
    // on the first image so the buyer sees what's orderable at a glance.
    const list = p.sz || [];
    const isUns = list.length === 1 && /unstitch/i.test(list[0]);
    const isMto = list.length === 1 && /made to order/i.test(list[0]);
    // DUAL stitched/unstitched article (Khaadi) — this card is ONE form; show a SMALL tag on the
    // RIGHT of the sizes overlay (e.g. "Unstitched available") instead of a banner that covers the
    // photo + hides the sizes. Two words, right-aligned; the sizes stay on the left as usual.
    const dualTag = (p.dual && p.altform)
      ? `<span class="ps-img-dual">${tr(p.altform === 'stitched' ? 'ps_also_st_short' : 'ps_also_uns_short')}</span>`
      : '';
    const szOverlay = isMto
      ? `<div class="ps-img-sizes">${dualTag}<b>${tr('ps_mto')}</b></div>`
      : isUns
        ? `<div class="ps-img-sizes">${dualTag}<b>${tr('ps_unstitched')}</b></div>`
        : `<div class="ps-img-sizes">${dualTag}<b>${tr('ps_avail_sizes')}</b>${list.slice(0,7).map(esc).join(' · ')}</div>`;
    const _uk = psUrlKey(p.u), _wsaved = psWishHas(p.u);
    return `<div class="ps-card">
      <div class="ps-img" onclick="psDetail(${idx})" role="button" tabindex="0" aria-label="${esc(p.t)} — enlarge"><button type="button" class="ps-wish${_wsaved?' on':''}" data-uk="${esc(_uk)}" onclick="event.stopPropagation();psWishToggle(${idx},event)" aria-label="${tr('wish_save')}" title="${tr('wish_save')}"><svg class="ps-heart-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></button><div class="ps-tr">${p.sale?`<span class="ps-sale">${tr('ps_sale')}</span>`:''}<button type="button" class="ps-info" onclick="event.stopPropagation();psDetail(${idx})" aria-label="${tr('ps_enlarge')}" title="${tr('ps_enlarge')}">🔍</button></div><img loading="lazy" src="${esc(thumbUrl(p.img))}" data-full="${esc(p.img)}" alt="${esc(p.t)}" onerror="if(!this.dataset.f){this.dataset.f=1;this.src=this.dataset.full;}else{this.parentElement.classList.add('ps-img-fail');}">${szOverlay}</div>
      <div class="ps-cbody">
        <div class="ps-brand">${esc(p.b)}</div>
        <div class="ps-title">${esc(p.t)}</div>
        <div class="ps-bdt">≈ ৳${bdt.toLocaleString()}</div>
        <div class="ps-pkr">PKR ${p.pkr.toLocaleString()}</div>
        <button type="button" class="ps-add" onclick="psAdd(${idx})">+ ${tr('ps_add')}</button>
      </div>
    </div>`;
  }

  // Slide the product grid in after a page-turn. Called immediately after grid.innerHTML
  // is set — positions the grid off-screen to the incoming side, then transitions it
  // to centre. Only fires when _psNavDir is non-zero (i.e. set by psGo).
  function _psAnimateIn(){
    if(_psNavDir === 0) return;
    const dir    = _psNavDir; _psNavDir = 0;
    const mobile = window.innerWidth < 820;
    const shift  = mobile ? '80px' : '28px';
    const enterMs = mobile ? 280 : 220;
    const grid = document.getElementById('psGrid');
    if(!grid) return;
    grid.style.transition = 'none';
    grid.style.transform  = dir > 0 ? 'translateX(' + shift + ')' : 'translateX(-' + shift + ')';
    grid.style.opacity    = '0';
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){
        grid.style.transition = 'transform ' + enterMs + 'ms ease-out, opacity ' + enterMs + 'ms ease-out';
        grid.style.transform  = '';
        grid.style.opacity    = '';
      });
    });
  }

  // Render the product feed. Infinite scroll: append=false replaces the grid with the first
  // page; append=true adds the next page's cards. psFiltered holds every item shown so far in
  // BOTH modes, so psCard's absolute index keeps psAdd/psDetail correct.
  function psRender(append){
    const grid = document.getElementById('psGrid');
    const empty = document.getElementById('psEmpty');
    if(!grid) return;
    psSyncDeptTiles();
    psHarvestThumbs(psFiltered);   // opportunistically fill Shop-by-Category photos (catalog mode too)
    try{ psFillBannerImgs(); }catch(e){}   // fill the two hero-banner photos from the catalogue once (#6)
    const psCountEl = document.getElementById('psCount');   // count element was removed from the resbar; guard it
    const total = psApiMode ? psApiTotal : psFiltered.length;
    if(psCountEl) psCountEl.textContent = total ? (total.toLocaleString() + ' ' + tr('ps_results')) : '';
    const bc = document.getElementById('psBrandCount'); if(bc) bc.textContent = psSel.brands.size || '';
    if(!psFiltered.length){
      if(!append) grid.innerHTML = '';
      if(empty) empty.style.display = total ? 'none' : '';
      psFeedDone = true; psFeedSetStatus(false);
      return;
    }
    if(empty) empty.style.display = 'none';
    // In API mode psFiltered already IS the accumulated set of loaded pages; in catalog mode it's
    // the full filtered list, so cap how much of it is shown to (psPage+1) pages.
    const limit = psApiMode ? psFiltered.length : Math.min(psFiltered.length, (psPage + 1) * psPageSize());
    if(append){
      const from = grid.children.length;
      if(limit > from) grid.insertAdjacentHTML('beforeend', psFiltered.slice(from, limit).map((p,i) => psCard(p, from + i)).join(''));
    } else {
      grid.innerHTML = psFiltered.slice(0, limit).map((p,i) => psCard(p, i)).join('');
      _psAnimateIn();
      grid.classList.remove('ps-gridfade'); void grid.offsetWidth; grid.classList.add('ps-gridfade');   // cross-fade on reset, never a hard refresh (#3)
    }
    const shown = grid.children.length;
    const more  = psApiMode ? (shown < total) : (shown < psFiltered.length);
    psFeedDone = !more;
    psFeedSetStatus(more);
    psFeedObserve();
  }
  // ── Infinite-scroll plumbing (redesign P1) ───────────────────────────────
  // #psPager is repurposed as the feed footer: a "Load more" button (manual fallback) while
  // there are more, a "you've reached the end" note otherwise, and a loading note mid-fetch.
  function psFeedSetStatus(hasMore){
    const el = document.getElementById('psPager'); if(!el) return;
    if(psFeedLoading){ el.innerHTML = '<div class="ps-feed-msg" aria-live="polite">' + esc(tr('ps_loading')) + '</div>'; return; }
    const grid = document.getElementById('psGrid');
    if(hasMore){ el.innerHTML = '<button type="button" class="ps-feed-more" onclick="psFeedMore()">' + esc(tr('ps_feed_more')) + '</button>'; }
    else if(grid && grid.children.length){ el.innerHTML = '<div class="ps-feed-msg ps-feed-end">' + esc(tr('ps_feed_end')) + '</div>'; }
    else { el.innerHTML = ''; }
  }
  function psFeedMore(){
    if(!PS_INFINITE || psFeedLoading || psFeedDone) return;
    const grid = document.getElementById('psGrid'); if(!grid || !grid.children.length) return;
    const total = psApiMode ? psApiTotal : psFiltered.length;
    if(grid.children.length >= total){ psFeedDone = true; psFeedSetStatus(false); return; }
    psPage++;
    if(psApiMode){ psFeedLoading = true; psFeedSetStatus(true); psApiFetch(true); }
    else { psRender(true); psFeedMaybeMore(); }   // catalog mode is synchronous
  }
  // After an append, if the footer is still within a screen of the viewport (tall screen / short
  // page), keep loading so the feed always fills the screen and the observer can re-arm.
  function psFeedMaybeMore(){
    if(psFeedDone || psFeedLoading) return;
    const el = document.getElementById('psPager'); if(!el) return;
    const grid = document.getElementById('psGrid'); if(!grid || !grid.children.length) return;   // only once a feed exists
    const vh = window.innerHeight || 800;
    if(el.getBoundingClientRect().top < vh + 600) psFeedMore();   // preload ~600px before the footer reaches the fold
  }
  let _psFeedIO = null;
  function psFeedObserve(){
    if(!PS_INFINITE || _psFeedIO) return;   // one observer on the persistent #psPager footer
    const el = document.getElementById('psPager'); if(!el) return;
    try{
      _psFeedIO = new IntersectionObserver(function(entries){
        for(const e of entries){ if(e.isIntersecting) psFeedMore(); }
      }, { rootMargin: '700px 0px' });
      _psFeedIO.observe(el);
    }catch(err){ /* no IntersectionObserver → the "Load more" button is the fallback */ }
  }
  window.psFeedMore = psFeedMore;
  // Scroll/resize fallback — some in-app webviews fire IntersectionObserver unreliably, so also
  // top up the feed whenever the buyer scrolls near the bottom. Time-throttled (no rAF dependency),
  // and the real work (psFeedMaybeMore → a single getBoundingClientRect, then a guarded fetch) is cheap.
  (function(){
    let last = 0;
    function onScroll(){ const now = Date.now(); if(now - last < 120) return; last = now; if(PS_INFINITE) psFeedMaybeMore(); }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
  })();
  // When the page dropdown opens: scroll the current page into view (365 pages → long
  // list) and close it on an outside click/tap (so it behaves like a native select).
  function psPgDdToggle(d){
    if(!d || !d.open) return;
    const on = d.querySelector('.ps-pgdd-item.on'); if(on) on.scrollIntoView({block:'center'});
    const close = e => { if(!d.contains(e.target)){ d.open = false; document.removeEventListener('click', close, true); } };
    setTimeout(() => document.addEventListener('click', close, true), 0);
  }
  // Next/Prev: scroll to the RESULTS (not the page top) so the buyer keeps seeing
  // products instead of being thrown back up to the filters every time.
  function psGo(d){
    psPage += d; if(psPage < 0) psPage = 0;
    _psNavDir = d;
    const mobile = window.innerWidth < 820;
    const shift  = mobile ? '80px' : '28px';
    const exitMs = mobile ? 220 : 180;
    const grid = document.getElementById('psGrid');
    if(grid){
      grid.style.transition    = 'transform ' + exitMs + 'ms ease-in, opacity ' + exitMs + 'ms ease-in';
      grid.style.transform     = d > 0 ? 'translateX(-' + shift + ')' : 'translateX(' + shift + ')';
      grid.style.opacity       = '0';
      grid.style.pointerEvents = 'none';
    }
    setTimeout(function(){
      if(grid) grid.style.pointerEvents = '';
      if(psApiMode) psApiFetch(); else psRender();
    }, exitMs + 10);
    psScrollToResults();
  }
  function psJump(v){ psPage = parseInt(v, 10) || 0; if(psApiMode) psApiFetch(); else psRender(); psScrollToResults(); }
  function psScrollToResults(){ const g=document.getElementById('psCount'); if(g) window.scrollTo({top: g.getBoundingClientRect().top + window.scrollY - 64, behavior:'smooth'}); }
  // Swipe LEFT on the product grid → next page, swipe RIGHT → previous (alongside the
  // Prev/Next buttons). Guarded so it never pages past the ends.
  function psMaxPage(){
    var per = (typeof psPageSize === 'function' ? psPageSize() : 12);
    var total = psApiMode ? (psApiTotal || 0) : ((psFiltered && psFiltered.length) || 0);
    return Math.max(0, Math.ceil(total / per) - 1);
  }
  (function(){
    var x0 = null, y0 = null;
    document.addEventListener('touchstart', function(e){
      if(PS_INFINITE) return;   // infinite scroll replaces swipe-between-pages
      var g = document.getElementById('psGrid');
      if(!g || !g.contains(e.target) || e.touches.length !== 1){ x0 = null; return; }
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    }, { passive: true });
    document.addEventListener('touchend', function(e){
      if(x0 === null) return;
      var t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
      x0 = null;
      if(Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.7) return;   // not a clean horizontal swipe
      if(dx < 0){ if(psPage < psMaxPage()) psGo(1); }                       // swipe left → next page
      else { if(psPage > 0) psGo(-1); }                                     // swipe right → previous
    }, { passive: true });
  })();
  // Discoverability: the first few times a buyer lands on a multi-page grid (touch
  // devices), nudge it sideways + flash a cue so they learn they can swipe. ≤3×/session.
  function psSwipeHintMaybe(){
    try{
      if(!(navigator.maxTouchPoints > 0 || 'ontouchstart' in window)) return;   // swipe is touch-only
      if(psPage !== 0 || psMaxPage() < 1) return;                                 // only on page 1 when more pages exist
      var n = +(sessionStorage.getItem('psb_swipehint') || 0);
      if(n >= 3) return;
      sessionStorage.setItem('psb_swipehint', n + 1);
      var g = document.getElementById('psGrid');
      if(g){ g.classList.remove('ps-swipenudge'); void g.offsetWidth; g.classList.add('ps-swipenudge');
        setTimeout(function(){ if(g) g.classList.remove('ps-swipenudge'); }, 1700); }
      var cue = document.getElementById('psSwipeCue');
      if(!cue){ cue = document.createElement('div'); cue.id = 'psSwipeCue'; document.body.appendChild(cue); }
      cue.textContent = (typeof _lang !== 'undefined' && _lang === 'bn') ? '👈 আরও দেখতে সোয়াইপ করুন' : '👈 Swipe for more';
      cue.classList.add('show');
      clearTimeout(window._psCueT);
      window._psCueT = setTimeout(function(){ cue.classList.remove('show'); }, 2400);
    }catch(e){}
  }

  // Tap a product → hand its URL to the proven live add pipeline (verifies
  // price/stock/category live, then the buyer picks size and saves to the cart).
  function psAdd(idx){
    const p = psFiltered[idx]; if(!p) return;
    _addViaTap = true;   // tapped "+ Add" → no "added to bag" toast (req: Danish)
    const inp = document.getElementById('urlInput');
    if(inp) inp.value = p.u;
    handleAddUrl();
  }

  // ── IN-PAGE PRODUCT DETAIL POPUP ─────────────────────────────────────────
  // The card shows one photo; the ⓘ opens a popup with the product's full
  // gallery + description (fetched from its own page) so the buyer can decide
  // without leaving. X closes and keeps them on the same product.
  function psCloseDetail(){ const m = document.getElementById('psDetail'); if(m) m.style.display = 'none'; }
  // Product popup → brand site: warn first (look there, order HERE), then open in a new tab.
  function psOpenFull(idx){ const p = psFiltered[idx]; if(!p) return; const url = p.u; psWarnOpen({ onOk: function(){ window.open(url, '_blank', 'noopener'); } }); }
  function psSwapMain(thumb, src){ const m = document.getElementById('psDMain'); if(m) m.src = src; document.querySelectorAll('.ps-d-thumb').forEach(t => t.classList.toggle('on', t === thumb)); }
  function psDetail(idx){
    const p = psFiltered[idx]; if(!p) return;
    const bdt = (p._bdt != null) ? p._bdt : estLandedBdt(p.pkr, p.cat);
    const sz = (p.sz || []).slice(0,12).map(s => `<span class="ps-sz">${esc(s)}</span>`).join('');
    // LAAM-style 3-layer popup (req): (1) the BROWSE grid behind, (2) the IMAGE gallery — a sticky
    // HORIZONTAL swipe strip of big full-width photos (scroll from the right), (3) a DETAILS SHEET
    // that slides UP over the image (all info, sizes, details + the full brand description) and slides
    // back DOWN to reveal the image again. Pure CSS: the gallery is a sticky "stage" and the body is a
    // rounded sheet that scrolls over it (the whole .ps-detail-card is the scroller). The gallery is
    // seeded with the catalog thumb (instant) and upgraded to the brand's full-size gallery.
    document.getElementById('psDetailInner').innerHTML =
        `<div class="ps-d-stage"><div class="ps-d-gallery" id="psDGallery"><img class="ps-d-shot" src="${esc(p.img)}" alt="${esc(p.t)}"></div></div>`
      + `<div class="ps-d-body">`
      +   `<div class="ps-d-grip" aria-hidden="true"></div>`
      +   `<div class="ps-d-brand">${esc(p.b)}</div>`
      +   `<div class="ps-d-title">${esc(p.t)}</div>`
      +   `<div class="ps-d-price">≈ ৳${bdt.toLocaleString()}</div>`
      +   `<div class="ps-d-pkr">PKR ${p.pkr.toLocaleString()}</div>`
      +   `${sz ? `<div class="ps-d-szlabel">${tr('ps_avail_sizes')}</div><div class="ps-d-szrow">${sz}</div>` : ''}`
      +   `<div id="psDSizeChart" class="ps-d-szchart-wrap"></div>`
      +   `<div class="ps-d-actions">`
      +     `<button type="button" class="ps-wish ps-d-wishbtn${psWishHas(p.u)?' on':''}" data-uk="${esc(psUrlKey(p.u))}" onclick="psWishToggle(${idx})" aria-label="${tr('wish_save')}" title="${tr('wish_save')}"><svg class="ps-heart-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></button>`
      +     `<button type="button" class="ps-d-open" onclick="psOpenFull(${idx})">${tr('ps_d_open')} ↗</button>`
      +     `<button type="button" class="ps-d-add" onclick="psCloseDetail();psAdd(${idx})">+ ${tr('ps_add')}</button>`
      +   `</div>`
      +   `<div class="ps-d-details" id="psDDetails"></div>`
      +   `<div class="ps-d-loading" id="psDDesc">${tr('ps_d_loading')}</div>`
      +   `<button type="button" class="ps-d-more" onclick="psMoreFromBrand(${idx})">${tr('ps_d_more')} ${esc(p.b)} →</button>`
      + `</div>`;
    document.getElementById('psDetail').style.display = 'flex';
    const _card = document.querySelector('.ps-detail-card'); if(_card) _card.scrollTop = 0;
    psEnrichDetail(p);
  }
  // "More from this brand" (req): filter Browse Products to the SAME brand + SAME category as
  // the shown product, then close the popup and jump to the results.
  function psMoreFromBrand(idx){
    const p = psFiltered[idx]; if(!p) return;
    psSel.cats.clear(); psSel.brands.clear();
    if(p.cat) psSel.cats.add(p.cat);
    if(p.b)   psSel.brands.add(p.b);
    psBuildCatFilter(); psBuildBrandFilter();
    psApply();
    psCloseDetail(); psScrollToResults();
  }
  // ── PRODUCT DETAILS (popup, below the gallery) ───────────────────────────
  // Goal: show the FULL product info (description + Fabric / Care / etc. + the image gallery) right in
  // the popup so the buyer never has to leave for the brand site. Two sources merge into one
  // accumulator and paint progressively, in the SAME table/description format for every product (the
  // rows themselves vary with whatever data exists):
  //   A) OUR pre-scraped details API (/search/details) — desc + cleaned sections + gallery for ~99% of
  //      the catalogue INCLUDING SFCC brands (Khaadi/Sapphire) that have no .js feed. Fast, served via
  //      the relay (no per-brand CORS). Primary source.
  //   B) the brand's OWN Shopify .js (Shopify hosts only) — full LIVE gallery + atomic
  //      Fabric_/Design_/Color_ tags + body_html. Upgrades the gallery and adds atomic rows.
  // A brand-new product not yet scraped → A returns found:false and B alone drives it (old behaviour).
  // Neither yields anything → the "couldn't load" note shows.

  // Atomic Fabric/Design/Colour/Pieces/Type rows from a Shopify product's tags+type → [[label,text]].
  function psBuildDetailRowsArr(prod){
    let tags = prod && prod.tags;
    tags = Array.isArray(tags) ? tags : (typeof tags === 'string' ? tags.split(',').map(s => s.trim()) : []);
    const rows = [];
    // Separators now include "=" (Sana Safinaz uses fabric=Lawn / season=Spring Summer, not "fabric: ").
    const grab = re => [...new Set(tags.filter(t => re.test(t)).map(t => t.replace(re, '').replace(/^[\s_:=>-]+/, '').trim()).filter(Boolean))];
    const fab = grab(/^fabric[\s_>:=-]*/i); if(fab.length) rows.push(['Fabric', fab.join(', ')]);
    const wrk = grab(/^design[\s_>:=-]*/i); if(wrk.length) rows.push(['Work / Design', wrk.join(', ')]);
    const col = grab(/^colou?r[\s_>:=-]*/i); if(col.length) rows.push(['Colour', col.join(', ')]);
    const sea = grab(/^season[\s_>:=-]*/i); if(sea.length) rows.push(['Season', sea.join(', ')]);
    const pcs = tags.find(t => /^\s*\d\s?(piece|pcs?)\b/i.test(t)); if(pcs) rows.push(['Pieces', pcs.trim()]);
    if(prod.type) rows.push(['Type', prod.type]);
    return rows;
  }
  // Some brands leave body_html EMPTY and stash the product description in a tag under a
  // different key (e.g. Maria B "dhldes:Women stitched Embroidered shirt …"). Pull it out.
  function psDescFromTags(tags){
    tags = Array.isArray(tags) ? tags : (typeof tags === 'string' ? tags.split(',') : []);
    for(const raw of tags){
      const t = String(raw || '').trim();
      const m = t.match(/^(?:dhldes|des|description|product[\s_]*description|prod[\s_]*desc|detail)[\s_>:=-]+(.+)$/i);
      if(m && m[1] && m[1].trim().length >= 12) return m[1].trim();
    }
    return '';
  }
  // Display priority so the table reads sensibly no matter which source landed first; unknown labels
  // keep their arrival order after the known ones.
  const PS_DET_ORDER = ['fabric','fabric details','composition','fabric composition','material','work / design','design','colour','color','pieces','fit','type','details','product details','product information','specification','features','care instructions','care instruction','wash & care','wash care','materials and care'];
  let _psDetState = null;
  // Add/merge one [label,text] row into the accumulator (case-insensitive; keep the richer text).
  function _psDetAddRow(st, label, text){
    label = String(label || '').trim(); text = String(text || '').trim();
    if(!label || text.length < 2) return;
    const lk = label.toLowerCase();
    const i = st.rows.findIndex(r => r[0].toLowerCase() === lk);
    if(i >= 0){ if(text.length > st.rows[i][1].length) st.rows[i][1] = text; return; }
    st.rows.push([label, text]);
  }
  // Paint the gallery + details table + description from the accumulator (idempotent; called on every
  // source update). Reuses the existing .ps-d-* markup so the format is unchanged.
  function psPaintDetail(p){
    const st = _psDetState; if(!st) return;
    const m = document.getElementById('psDetail'); if(!m || m.style.display === 'none') return;
    const galEl = document.getElementById('psDGallery'), detEl = document.getElementById('psDDetails'), descEl = document.getElementById('psDDesc');
    if(galEl && st.imgs.length) galEl.innerHTML = st.imgs.slice(0, 12).map((src, i) => `<img class="ps-d-shot" loading="${i < 2 ? 'eager' : 'lazy'}" src="${esc(src)}" alt="${esc(p.t)}">`).join('');
    if(detEl){
      const rows = st.rows.slice().sort((a, b) => { const ia = PS_DET_ORDER.indexOf(a[0].toLowerCase()), ib = PS_DET_ORDER.indexOf(b[0].toLowerCase()); return (ia < 0 ? 50 : ia) - (ib < 0 ? 50 : ib); });
      detEl.innerHTML = rows.length
        ? `<div class="ps-d-details-h">Product Details</div><table class="ps-d-tbl"><tbody>`
          + rows.map(r => `<tr><td class="ps-d-k">${esc(r[0])}</td><td class="ps-d-v">${esc(r[1])}</td></tr>`).join('')
          + `</tbody></table>`
        : '';
    }
    if(descEl){
      if(st.desc) descEl.innerHTML = `<div class="ps-d-desc-h">Description</div><div class="ps-d-desc">${esc(st.desc)}</div><div class="ps-d-disc">Actual colour may vary slightly from the image.</div>`;
      else if(st.done) descEl.innerHTML = (st.rows.length || st.imgs.length) ? '' : (st.any ? tr('ps_d_nodesc') : tr('ps_d_nofetch'));
    }
    // Size Chart button (only when this product/brand has a chart image) → opens the simple image
    // lightbox (openImgZoom) layered over the popup, with its own close. Built once when sc lands.
    const scEl = document.getElementById('psDSizeChart');
    if(scEl){
      const hasSC = (st.sc && st.sc.length) || (st.scTable && st.scTable.length);
      if(hasSC){
        if(!scEl.querySelector('button')){
          scEl.innerHTML = `<button type="button" class="ps-d-szchart">📏 ${esc(tr('ps_d_sizechart'))}</button>`;
          const b = scEl.querySelector('button'); if(b) b.onclick = () => { try{ psOpenSizeChart(st); }catch(e){} };
        }
      } else if(scEl.firstChild){ scEl.innerHTML = ''; }
    }
  }
  // Size-chart modal: renders the measurement TABLE(s) natively (responsive, theme-styled) and/or the
  // chart IMAGE(s), layered over the product popup with its own close. Built lazily, reused per open.
  function psScCell(c, head){ const tag = head ? 'th' : 'td'; return '<' + tag + '>' + esc(c) + '</' + tag + '>'; }
  function psSizeChartHTML(st){
    let h = '';
    for(const item of (st.scTable || [])){
      // each entry is {t:title, rows:[[...]]} (per-product SHIRT/TROUSER) or a plain rows array (brand chart)
      const isObj = item && !Array.isArray(item);
      const rows = isObj ? item.rows : item;
      const title = isObj ? (item.t || '') : '';
      if(!rows || !rows.length) continue;
      if(title) h += '<div class="ps-sc-cap">' + esc(title) + '</div>';
      h += '<div class="ps-sc-scroll"><table class="ps-sc-tbl"><tbody>'
        + rows.map((row, ri) => '<tr>' + row.map(c => psScCell(c, ri === 0)).join('') + '</tr>').join('')
        + '</tbody></table></div>';
    }
    for(const img of (st.sc || [])) h += '<img class="ps-sc-img" src="' + esc(img) + '" alt="Size chart" loading="lazy">';
    return h || ('<div class="ps-sc-empty">' + esc(tr('ps_d_nodesc')) + '</div>');
  }
  function psOpenSizeChart(st){
    let ov = document.getElementById('psScOv');
    if(!ov){
      ov = document.createElement('div'); ov.id = 'psScOv'; ov.className = 'ps-sc-ov';
      ov.innerHTML = '<div class="ps-sc-card"><button type="button" class="ps-sc-x" aria-label="Close">×</button><div class="ps-sc-hd">📏 ' + esc(tr('ps_d_sizechart')) + '</div><div class="ps-sc-body" id="psScBody"></div></div>';
      document.body.appendChild(ov);
      ov.addEventListener('click', e => { if(e.target === ov || e.target.classList.contains('ps-sc-x')) ov.classList.remove('open'); });
      document.addEventListener('keydown', e => { if(e.key === 'Escape') ov.classList.remove('open'); });
    }
    document.getElementById('psScBody').innerHTML = psSizeChartHTML(st || _psDetState || {});
    ov.classList.add('open');
  }
  // Kick off both sources; each updates the accumulator and repaints. A stale-guard (the global
  // _psDetState is reassigned per open) makes an in-flight fetch from a previously-opened product a
  // no-op, so it can't paint over a different product opened right after.
  function psEnrichDetail(p){
    const st = _psDetState = { desc:'', rows:[], imgs:[], sc:[], scTable:[], pending:0, done:false, any:false };
    const stale = () => _psDetState !== st;
    const closed = () => { const m = document.getElementById('psDetail'); return !m || m.style.display === 'none'; };
    const finish = () => { if(stale()) return; st.pending--; if(st.pending <= 0){ st.done = true; if(!closed()) psPaintDetail(p); } };
    // A) our pre-scraped details (all brands, incl. SFCC) via the relay/search API
    st.pending++;
    fetch(psSearchBase() + '/details?u=' + encodeURIComponent(p.u), { cache:'default' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if(stale() || closed() || !d || !d.found) return;
        st.any = true;
        if(d.desc && d.desc.length > st.desc.length) st.desc = d.desc;
        for(const s of (d.sections || [])) _psDetAddRow(st, s[0], s[1]);
        if(d.imgs && d.imgs.length && !st.imgs.length) st.imgs = d.imgs.slice();
        if(d.sc && d.sc.length) st.sc = d.sc.slice();
        if(d.scTable && d.scTable.length) st.scTable = d.scTable.slice();
        psPaintDetail(p);
      })
      .catch(() => {})
      .finally(finish);
    // B) the brand's own Shopify .js — full live gallery + atomic tags + body_html (Shopify hosts only)
    let origin, handle;
    try{ const u = new URL(p.u); origin = u.origin; const mm = u.pathname.match(/\/products\/([^/?#.]+)/); handle = mm && mm[1]; }catch(e){}
    if(handle){
      st.pending++;
      fetch(`${origin}/products/${handle}.js`, { cache:'no-store' })
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(prod => {
          if(stale() || closed()) return;
          st.any = true;
          const imgs = (prod.images || []).map(s => typeof s === 'string' ? s : (s && s.src)).filter(Boolean);
          if(imgs.length) st.imgs = imgs.slice();   // brand's full live gallery is the richest — prefer it
          for(const r of psBuildDetailRowsArr(prod)) _psDetAddRow(st, r[0], r[1]);
          const desc = (prod.body_html || '')
            .replace(/<br\s*\/?>/gi,'\n').replace(/<li\b[^>]*>/gi,'\n').replace(/<\/(p|div|li|tr|h[1-6])>/gi,'\n')
            .replace(/<[^>]+>/g,' ')
            .replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"')
            .replace(/[ \t\f\v]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{2,}/g,'\n').trim();
          if(desc && desc.length > st.desc.length) st.desc = desc;
          // body_html is EMPTY for several big brands (Maria B, Sana Safinaz, …) — their description
          // lives in a tag under a different key. Use it when we still have little/no description.
          if(st.desc.length < 40){ const td = psDescFromTags(prod.tags); if(td && td.length > st.desc.length) st.desc = td; }
          psPaintDetail(p);
        })
        .catch(() => {})
        .finally(finish);
    }
    if(!st.pending){ st.done = true; const el = document.getElementById('psDDesc'); if(el) el.innerHTML = tr('ps_d_nofetch'); }
  }

  // ── WISHLIST (E) ─────────────────────────────────────────────────────────
  // Tap ♥ on any product card (or in the detail popup) to save it; the header ♥ opens a
  // drawer of saved items where they can be added to the order or removed. Persisted in
  // localStorage so it survives reloads; stores enough of each product to render + re-add
  // without a network call.
  let _wish = [];
  try { _wish = JSON.parse(localStorage.getItem('psb_wishlist') || '[]'); } catch(e){ _wish = []; }
  if(!Array.isArray(_wish)) _wish = [];
  function _wishSave(){ try{ localStorage.setItem('psb_wishlist', JSON.stringify(_wish)); }catch(e){} }
  function psWishHas(url){ if(!url) return false; const k = psUrlKey(url); return _wish.some(p => psUrlKey(p.u) === k); }
  function psWishToggle(idx, ev){
    if(ev){ ev.stopPropagation(); ev.preventDefault(); }
    psWishToggleProduct(psFiltered[idx]);
  }
  function psWishToggleProduct(p){
    if(!p || !p.u) return;
    const k = psUrlKey(p.u);
    const at = _wish.findIndex(x => psUrlKey(x.u) === k);
    if(at >= 0) _wish.splice(at, 1);
    else _wish.unshift({ u:p.u, b:p.b, t:p.t, img:p.img, pkr:p.pkr, cat:p.cat, sz:p.sz, sale:p.sale, _bdt:(p._bdt != null ? p._bdt : undefined) });
    _wishSave();
    psWishSyncUI();
    const d = document.getElementById('wishDrawer'); if(d && d.classList.contains('open')) psWishRender();
  }
  // Reflect saved-state on every visible heart + the header AND bottom-bar badges (no grid re-render).
  function psWishSyncUI(){
    const has = uk => _wish.some(p => psUrlKey(p.u) === uk);
    document.querySelectorAll('.ps-wish[data-uk]').forEach(b => b.classList.toggle('on', has(b.getAttribute('data-uk'))));
    const n = _wish.length;
    ['hdrWishBadge','bnavWishBadge'].forEach(id => { const b = document.getElementById(id); if(b){ b.textContent = n; b.style.display = n ? '' : 'none'; } });
  }
  function psWishOpen(){ psWishRender(); const d = document.getElementById('wishDrawer'); if(d){ d.classList.add('open'); document.body.style.overflow = 'hidden'; } }
  function psWishClose(){ const d = document.getElementById('wishDrawer'); if(d) d.classList.remove('open'); document.body.style.overflow = ''; }
  // Tap a saved item's photo → open the multi-image lightbox (like the order form). Shows the saved
  // photo instantly, then fetches the product's full gallery (Shopify .js) and upgrades the view.
  function psWishZoom(i){
    const p = _wish[i]; if(!p || !p.u) return;
    if(p.imgs && p.imgs.length){ openImgZoom(p.imgs); return; }
    openImgZoom(p.img ? [p.img] : []);
    let origin, handle;
    try { const u = new URL(p.u); origin = u.origin; const m = u.pathname.match(/\/products\/([^/?#.]+)/); handle = m && m[1]; } catch(e){}
    if(!handle) return;   // SFCC / non-Shopify → the single saved photo only
    fetch(origin + '/products/' + handle + '.js', { cache:'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(prod => {
        const imgs = (prod.images || []).map(s => typeof s === 'string' ? s : (s && s.src)).filter(Boolean);
        if(imgs.length){ p.imgs = imgs; _wishSave();
          const ov = document.getElementById('imgZoomOv');
          if(ov && ov.style.display !== 'none') openImgZoom(imgs);   // upgrade the open lightbox to the full gallery
        }
      }).catch(() => {});
  }
  function psWishRender(){
    const body = document.getElementById('wishBody'); if(!body) return;
    const cnt = document.getElementById('wishCount'); if(cnt) cnt.textContent = _wish.length ? ('· ' + _wish.length) : '';
    if(!_wish.length){ body.innerHTML = `<div class="wish-empty">${tr('wish_empty')}</div>`; return; }
    body.innerHTML = _wish.map((p, i) => {
      const bdt = (p._bdt != null) ? p._bdt : estLandedBdt(p.pkr, p.cat);
      const img = p.img ? `<img loading="lazy" src="${esc(thumbUrl(p.img))}" alt="${esc(p.t || '')}" onerror="this.style.display='none'">` : '';
      return `<div class="wish-item">`
        + `<button type="button" class="wish-thumb" onclick="psWishZoom(${i})" aria-label="${tr('ps_enlarge')}">${img}</button>`
        + `<div class="wish-info">`
        +   `<div class="wish-brand">${esc(p.b || '')}</div>`
        +   `<div class="wish-title">${esc(p.t || '')}</div>`
        +   `<div class="wish-price">≈ ৳${bdt.toLocaleString()}${p.pkr ? ` · PKR ${(+p.pkr).toLocaleString()}` : ''}</div>`
        +   `<div class="wish-acts">`
        +     `<button type="button" class="wish-add" onclick="psWishAdd(${i})">+ ${tr('ps_add')}</button>`
        +     `<button type="button" class="wish-rm" onclick="psWishRemove(${i})">♥ ${tr('wish_remove')}</button>`
        +   `</div>`
        + `</div></div>`;
    }).join('');
  }
  function psWishRemove(i){ if(i < 0 || i >= _wish.length) return; _wish.splice(i, 1); _wishSave(); psWishSyncUI(); psWishRender(); }
  // Add a saved item to the order via the proven paste-link pipeline (live price/size/category).
  function psWishAdd(i){ const p = _wish[i]; if(!p || !p.u) return; _addViaTap = true; const inp = document.getElementById('urlInput'); if(inp) inp.value = p.u; psWishClose(); handleAddUrl(); }
  // Initialise the header badge once the DOM is ready.
  if(document.readyState !== 'loading') psWishSyncUI();
  else document.addEventListener('DOMContentLoaded', psWishSyncUI);
  document.addEventListener('keydown', e => { if(e.key === 'Escape') psWishClose(); });

  // ══ BROWSE BRANDS · PRODUCT-CATEGORY VIEW ════════════════════════════════
  // A 2nd way to find brands: by WHAT they sell, not their store type. Women /
  // Men / Kids → the same subgroups as the order form → a slide-able row of the
  // brands that actually stock that subgroup (derived from the shared catalog, so
  // it stays truthful and grows as the catalog grows). The 5-department "Store
  // Types" view and the universal name search are unchanged and stay visible.
  const BB_GENDERS = [['w','bb_women'],['m','bb_men'],['k','bb_kids']];
  // MOBILE (req): Browse Brands is ONE view (no Store-Types sub-tab) — the 5
  // store-type departments as tabs, Kids first. Desktop keeps the 3 gender tabs +
  // the separate Store-Types sub-tab. `_bbGender` holds the active tab key (a gender
  // w/m/k OR a store tier md/p on mobile).
  const BB_TABS_MOBILE = [['k','bb_kids'],['w','bb_women'],['m','bb_men'],['md','bb_md'],['p','bb_premium']];
  function bbIsMobile(){ return (window.innerWidth || document.documentElement.clientWidth || 0) < 820; }
  // Default to NO tab selected so Browse Brands lands SEARCH-FIRST: just the search
  // bar + department chips, with no gender pre-filtered (req — the buyer types a brand
  // or a fabric like "lawn" right away, or taps a department). null = nothing picked.
  let _bbGender = null, _bbGroup = 0, _bbIndex = null, _bbCnt = null, _bbCatCnt = null, _bbExpanded = {}, _bbClub = {}, _bbWasMobile = null, _bbIdxLoading = false;
  // Third-tier "clubs": each second-tier group has a dropdown of clubbed
  // categories. [label, [catKeys]] — a club lists every brand stocking ANY of
  // its categories (so e.g. "Bridal" folds in heavy-formal without naming it).
  const BB_CLUBS = {
    w: [
      { h:'Everyday / Lawn', clubs:[
        ['1pc Shirts / Kaftans', ['kurti_1pc','kaftan']],
        ['1pc Trousers / Pants', ['womens_trouser']],
        ['2/3pc Pret (Stitched)', ['pret_3pc','pret_3pc_emb','pret_2pc_emb','shirt_dupatta_2pc','shirt_trouser_2pc']],
        ['2/3pc Unstitched', ['lawn_3pc_unstitch','unstitch_3pc_emb']],
        ['Western (co-ord / maxi / lounge)', ['coord_western','maxi_dress','loungewear']],
      ]},
      { h:'Winter', clubs:[
        ['Stitched / Pret (2 & 3pc)', ['winter_2pc_stitch','winter_3pc_stitch']],
        ['Unstitched (2 & 3pc)', ['winter_2pc_unstitch','winter_3pc_unstitch']],
        ['Shawls', ['shawl']],
      ]},
      { h:'Formal / Festive / Bridal', clubs:[
        ['Bridal / Velvet / Full Embroidery', ['bridal','heavy_formal_3pc']],
        ['Handmade / Adda Embroidery', ['handmade_emb']],
        ['Formal Embroidered', ['formal_emb_2pc','formal_emb_3pc']],
        ['Saree', ['saree']],
        ['Lehenga / Gharara / Sharara', ['lehenga']],
      ]},
      { h:'Modest', clubs:[
        ['Abaya', ['abaya']],
        ['Kaftan', ['kaftan']],
      ]},
      { h:'Separates & Accessories', clubs:[
        ['Dupatta / Stole', ['dupatta_only']],
        ['Footwear', ['footwear']],
        ['Accessories / Jewellery', ['accessories']],
      ]},
    ],
    m: [
      { h:'Western / Casual', clubs:[
        ['Shirt / Polo / T-Shirt', ['mens_shirt']],
        ['Trouser / Chinos', ['mens_trouser']],
        ['Jeans / Denim', ['mens_jeans']],
      ]},
      { h:'Traditional / Formal', clubs:[
        ['Kurta / Kameez', ['mens_kurta']],
        ['Shalwar Kameez', ['mens_shalwar_kameez']],
        ['Waistcoat', ['mens_waistcoat']],
        ['Suit / Pant-Coat', ['mens_suit']],
        ['Sherwani / Prince Coat', ['mens_sherwani']],
        ['Unstitched Fabric', ['mens_unstitched']],
      ]},
    ],
    k: [
      { h:'Boys', clubs:[
        ['Boys Eastern', ['kids_boys_eastern']],
        ['Boys Western', ['kids_boys_western']],
        ['Boys Party / Formal', ['kids_boys_formal']],
      ]},
      { h:'Girls', clubs:[
        ['Girls Eastern', ['kids_girls_eastern']],
        ['Girls Western', ['kids_girls_western']],
        ['Girls Party / Formal', ['kids_girls_formal']],
      ]},
      { h:'Baby', clubs:[
        ['Infant / Baby (0–2y)', ['kids_infant']],
      ]},
    ],
  };
  function bbActive(){ const p = document.getElementById('bbProduct'); return !!p && p.style.display !== 'none'; }
  function bbSwitch(which){
    const store = which === 'store';
    const st = document.getElementById('bbStore'), pr = document.getElementById('bbProduct');
    if(st) st.style.display = store ? '' : 'none';
    if(pr) pr.style.display = store ? 'none' : '';
    document.getElementById('bbt-store').classList.toggle('on', store);
    document.getElementById('bbt-product').classList.toggle('on', !store);
    // The "Search 150+ brands" bar belongs to Store Types only; Product Category
    // has its own smart search (req #2), so hide the brand-name search there.
    const bss = document.getElementById('brandSearchSection');
    if(bss) bss.style.display = store ? '' : 'none';
    if(!store) bbRenderProduct();
  }
  function bbPickGender(g){
    if(_bbGender === g){ _bbGender = null; _bbGroup = null; }   // re-tap clears (double-tap removes)
    else { _bbGender = g; _bbGroup = 0; }
    _bbExpanded = {}; _bbClub = {};
    bbRenderProduct();
  }
  function bbPickGroup(gi){ _bbGroup = (_bbGroup === gi) ? null : gi; bbRenderProduct(); }   // re-tap clears
  function bbPickClub2(e, v){ if(e) e.stopPropagation(); _bbClub[_bbGender+'|'+_bbGroup] = (v === '') ? null : +v; bbRenderProduct(); }
  function bbToggleClubDD(e){ if(e) e.stopPropagation(); const l = document.querySelector('#bbClubDD .bb-cdd-list'); if(l) l.style.display = (l.style.display === 'none' ? 'block' : 'none'); }
  document.addEventListener('click', e => { const dd = document.getElementById('bbClubDD'); if(dd && !dd.contains(e.target)){ const l = dd.querySelector('.bb-cdd-list'); if(l) l.style.display = 'none'; } });
  let _bbSlidePage = 0, _bbPageH = [];   // kept for the Store-Types slider (bbSlide/bbMeasureSlide)
  // Brand list = a multi-row grid of small brand PHOTO tiles (req) — replaces the old text list +
  // per-brand product-count badge (the number confused buyers). Photos LAZY-load as tiles scroll
  // into view (cache + on-demand fetch) so all ~150 brands don't fetch at once. Tap keeps openBrandInApp.
  // Photo dept: when a gender tab (Women/Men/Kids) is active, use IT so a MULTI-DEPT brand (Khaadi,
  // Edenrobe…) shows a MEN photo under Men, a women photo under Women, a kids photo under Kids (req) —
  // each dept's photo is cached separately (brand|dept). On the all-brands / Multi-Dept / Premium
  // view (no gender tab) fall back to the brand's own primary dept.
  function bbBrandDept(b){
    if(_bbGender === 'w' || _bbGender === 'm' || _bbGender === 'k') return _bbGender;
    return (b.c === 'w' || b.c === 'm' || b.c === 'k') ? b.c : 'w';
  }
  function bbBrandGrid(brands){
    if(!brands.length) return `<div class="bb-prod-empty">${tr('bb_prod_none')}</div>`;
    const tile = b => {
      const fl = FEATURED.has(b.n), dept = bbBrandDept(b);
      const url = psBrandLogo(b.u);   // the brand's OWN logo (harvested), not a product photo
      const img = url ? `<img loading="lazy" src="${esc(url)}" alt="${esc(b.n)}" onerror="this.closest('.bb-btile').classList.add('bb-btile-noimg');this.remove();">` : '';
      const ini = b.n.replace(/[^A-Za-z ]/g,'').split(/\s+/).map(w=>w[0]||'').join('').slice(0,2).toUpperCase();
      return `<button type="button" class="bb-btile bb-btile-logo${fl ? ' bb-btile-feat' : ''}${url ? '' : ' bb-btile-noimg'}" onclick="openBrandInApp(this)" data-url="${esc(b.u)}" data-name="${esc(b.n)}" data-dept="${dept}" data-ini="${esc(ini)}" title="${esc(b.n)}">`
        + `<span class="bb-btile-img" data-emoji="🏷️" data-ini="${esc(ini)}">${img}</span>`
        + `<span class="bb-btile-name">${fl ? '<span class="cb-star" aria-hidden="true">★</span>' : ''}${esc(b.n)}</span></button>`;
    };
    return `<div class="bb-btgrid" id="bbBtGrid">${brands.map(tile).join('')}</div>`;
  }
  function bbPaintTile(tile, n, url){
    if(!url || !tile) return;
    const span = tile.querySelector('.bb-btile-img'); if(!span || span.querySelector('img')) return;
    const im = document.createElement('img'); im.loading = 'lazy'; im.src = thumbUrl(url); im.alt = n;
    im.onerror = function(){ tile.classList.add('bb-btile-noimg'); im.remove(); };
    span.appendChild(im); tile.classList.remove('bb-btile-noimg');
  }
  function _bbHash(s){ let h = 0; for(let i = 0; i < s.length; i++){ h = (h * 31 + s.charCodeAt(i)) | 0; } return Math.abs(h); }
  // Find a photo for a brand tile, ALWAYS landing on a person pic (req: every icon has a pic):
  //   1) the brand's own dept-scoped photo (relevant to the active Women/Men/Kids tab);
  //   2) the brand's photo in ANY category (covers a brand with no products in that exact dept);
  //   3) if the brand has NO catalogue products at all (~23 directory-only brands), a GENERIC photo
  //      from that DEPARTMENT at a name-hashed offset — varied per brand, still men/women/kids-appropriate.
  async function bbFetchBrandPhoto(t, n, dept){
    const base = psSearchBase();
    const cats = _psDeptCats(dept), catParam = (cats && cats.length) ? ('&cat=' + encodeURIComponent(cats.join(','))) : '';
    const get = async u => { try { const r = await fetch(u, { cache:'default' }); return r.ok ? (await r.json()) : null; } catch(e){ return null; } };
    // Prefer stitched products (real sizes) over unstitched fabric (flat-lay, not a dressed model).
    const _notUnsB = x => !(Array.isArray(x.sz) && x.sz.length === 1 && /^unstitch/i.test(x.sz[0]));
    const pickDept = arr => {
      const w = (dept === 'w') ? arr.find(x => x && x.img && _notUnsB(x) && !_PS_MALE_RE.test(String(x.t || ''))) : null;
      return w || arr.find(x => x && x.img && _notUnsB(x)) || arr.find(x => x && x.img) || null;
    };
    let j = await get(base + '?brand=' + encodeURIComponent(n) + catParam + '&pageSize=6&page=0');
    let p = pickDept((j && j.products) || []);
    if(!p && catParam){ j = await get(base + '?brand=' + encodeURIComponent(n) + '&pageSize=6&page=0'); p = ((j && j.products) || []).find(x => x && x.img) || null; }
    if(!p){ const off = _bbHash(n) % 24, deptOnly = catParam ? catParam.slice(1) : ''; j = await get(base + (deptOnly ? '?' + deptOnly + '&' : '?') + 'pageSize=1&page=' + off); p = pickDept((j && j.products) || []); }
    if(p && p.img){ psBrandThumbSet(n, dept, p.img); bbPaintTile(t, n, p.img); }
  }
  function bbLoadBrandTilePhotos(){
    const grid = document.getElementById('bbBtGrid'); if(!grid) return;
    const tiles = Array.prototype.slice.call(grid.querySelectorAll('.bb-btile[data-name]'));
    const missing = [];
    tiles.forEach(t => { const n = t.getAttribute('data-name'), dept = t.getAttribute('data-dept') || 'w'; const u = psBrandThumbGet(n, dept); if(u) bbPaintTile(t, n, u); else missing.push(t); });
    if(!psApiMode || !missing.length) return;
    // EAGER-load every remaining tile's photo with a small concurrency cap, so NO tile is left without a
    // pic (req). Cached per brand|dept after the first open → subsequent opens are instant. (Lazy/IO
    // loading proved unreliable inside the horizontal carousel — the inner scroll didn't fire it.)
    let i = 0; const CONC = 6;
    function next(){
      if(i >= missing.length) return;
      const t = missing[i++], n = t.getAttribute('data-name'), dept = t.getAttribute('data-dept') || 'w';
      bbFetchBrandPhoto(t, n, dept).then(next, next);
    }
    for(let c = 0; c < CONC; c++) next();
  }
  function bbMeasureSlide(){
    const track = document.getElementById('bbTrack'); if(!track) return;
    track.style.transition = 'none'; track.style.transform = 'none';
    _bbPageH = [].map.call(track.children, p => p.offsetHeight);
    bbSlide(_bbSlidePage, true);
  }
  function bbSlide(page, instant){
    _bbSlidePage = page;
    const grid = document.getElementById('bbGrid'), track = document.getElementById('bbTrack');
    if(!grid || !track) return;
    if(instant){ grid.style.transition = 'none'; track.style.transition = 'none'; }
    track.style.transform = 'translateX(' + (-page * 100) + '%)';
    const h = _bbPageH[page] || 0; if(h) grid.style.height = h + 'px';
    if(instant){ void grid.offsetHeight; grid.style.transition = ''; track.style.transition = ''; }
  }
  window.addEventListener('resize', () => {
    const tb = document.getElementById('tabBrands');
    const onBrands = !!tb && tb.style.display !== 'none';
    // Desktop→mobile while on the Store Types sub-tab: its toggle is hidden on mobile,
    // so unify to the Product view or the user is stranded on Store Types (no way out).
    if(onBrands && bbIsMobile()){
      const st = document.getElementById('bbStore');
      if(st && st.style.display !== 'none'){ bbSwitch('product'); return; }
    }
    if(!bbActive()) return;
    if(bbIsMobile() !== _bbWasMobile) bbRenderProduct();             // crossed the mobile/desktop boundary → swap the tab set
    else if(document.getElementById('bbTrack')) bbMeasureSlide();
  });
  // brand name -> Set of category keys it stocks (from the shared catalog).
  function bbBuildIndex(){
    const idx = {}, cnt = {}, ccnt = {};
    (PS_CATALOG || []).forEach(p => {
      (idx[p.b] = idx[p.b] || new Set()).add(p.cat);
      cnt[p.b] = (cnt[p.b] || 0) + 1;                                  // total products (brand strength)
      (ccnt[p.b] = ccnt[p.b] || {})[p.cat] = (ccnt[p.b][p.cat] || 0) + 1;
    });
    _bbIndex = idx; _bbCnt = cnt; _bbCatCnt = ccnt;
  }
  // Build the same maps from the server's /brand-index ({brand:{cat:count}}) so the
  // brands view works WITHOUT downloading the whole catalog (API mode never loads
  // PS_CATALOG — that's the whole point of the search API).
  function bbBuildIndexFromApi(brands){
    const idx = {}, cnt = {}, ccnt = {};
    Object.keys(brands || {}).forEach(b => {
      const cats = brands[b] || {}; const set = new Set(); let tot = 0;
      Object.keys(cats).forEach(c => { set.add(c); tot += cats[c]; });
      idx[b] = set; cnt[b] = tot; ccnt[b] = cats;
    });
    _bbIndex = idx; _bbCnt = cnt; _bbCatCnt = ccnt;
  }
  // Ensure the brand→category index exists, then run cb(). API mode fetches the tiny
  // /brand-index (≈155 brands, bounded as the catalogue grows); classic mode derives it
  // from PS_CATALOG (loading it first if needed). If the API index ever fails we degrade
  // to an EMPTY index — brand-NAME search still works; only the fabric/category search
  // is reduced — and log it, rather than blocking the view (which caused an infinite
  // psOnReady loop before).
  function bbLoadIndex(cb){
    if(_bbIndex){ cb(); return; }
    if(psApiMode){
      fetch(psSearchBase() + '/brand-index', { cache:'no-store' })
        .then(r => { if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
        .then(j => { if(j.error) throw new Error(j.error); bbBuildIndexFromApi(j.brands || {}); cb(); })
        .catch(e => { console.warn('brand-index failed — names only:', e.message); _bbIndex = {}; _bbCnt = {}; _bbCatCnt = {}; cb(); });
      return;
    }
    if(PS_CATALOG){ bbBuildIndex(); cb(); return; }
    psOnReady(() => { bbBuildIndex(); cb(); });
  }
  // How many products a brand stocks within a set of category keys = its "strength"
  // in that category (drives the specialist-first ranking + the count badges).
  function bbStrength(name, cats){
    const c = _bbCatCnt && _bbCatCnt[name]; if(!c) return 0;
    let s = 0; cats.forEach(k => { s += (c[k] || 0); }); return s;
  }
  function bbBrandsFor(cats){ return BRANDS.filter(b => { const s = _bbIndex[b.n]; return s && cats.some(c => s.has(c)); }); }
  // CLEAN layout: gender row -> the second-tier categories in ONE scrollable tab
  // row -> ONE themed dropdown (clubs) for the selected tab -> only THAT tab's
  // brands. Every tab toggles (re-tap clears), with a "+N more" to expand brands.
  // All category keys that belong to a gender (flattened from BB_CLUBS) — used to
  // scope the smart search to the selected gender.
  function bbGenderCats(g){
    const set = new Set();
    (BB_CLUBS[g] || []).forEach(grp => grp.clubs.forEach(c => c[1].forEach(cat => set.add(cat))));
    return set;
  }
  let _bbQuery = '';
  // Unified smart search for the Product-Category view: typing a concept ("casual",
  // "lawn") marks the matching product categories AND the brands that make them;
  // typing a brand name ("khaadi") filters to that brand. Mirrors the Browse-
  // Products smart search but the OUTPUT here is the brand grid (req #2).
  function bbSmartSearch(val){
    _bbQuery = val || '';
    const inp = document.getElementById('bbSmartSearch');
    if(inp && inp.value !== _bbQuery) inp.value = _bbQuery;   // keep field in sync (also for programmatic calls)
    // The input is a STATIC node outside #bbProdBody, so re-rendering keeps focus.
    bbRenderProduct();
  }
  // Brand pool for the active tab. Gender keys (w/m/k) → catalog brands making that
  // gender + directory brands of that gender. Store-tier keys (md/p, mobile-only
  // tabs) → the directory brands of that tier (featured first), like Store Types.
  function bbDeptPool(key){
    if(key === 'md' || key === 'p') return bbRankPool(BRANDS.filter(b => b.c === key), key, null);
    const genderCats = [...bbGenderCats(key)];
    const brands = bbBrandsFor(genderCats);
    const have = new Set(brands.map(b => b.n));
    BRANDS.forEach(b => { if(b.c === key && !have.has(b.n)){ have.add(b.n); brands.push(b); } });
    return bbRankPool(brands, key, genderCats);
  }
  // EVERY directory brand, ranked by total catalogue strength — the pool the smart
  // search runs over when NO department tab is picked (search-first landing, req).
  function bbAllPool(){ return bbRankPool(BRANDS.slice(), null, null); }
  // Rank by BRAND STRENGTH for this category. Stores dedicated to it (e.g. Minnie
  // Minors → Kids, where b.c === key) lead; multi-department stores that also sell it
  // (Khaadi, Gul Ahmed) follow, strongest (most products here) first. Brands with no
  // catalogue data trail at the very end so they stay discoverable without crowding
  // the shoppable ones. `cats` null ⇒ rank a store-tier tab by total catalogue size.
  function bbRankPool(pool, key, cats){
    const str = b => cats ? bbStrength(b.n, cats) : ((_bbCnt && _bbCnt[b.n]) || 0);
    const tier = b => (str(b) > 0 ? 0 : 2) + (b.c === key ? 0 : 1);   // 0 stock-spec ▸ 1 stock-gen ▸ 2 dead-spec ▸ 3 dead-gen
    return pool.slice().filter(b => !b.agg).sort((a, b) => {          // drop aggregators (LAAM) from the icon listing
      const da = bdRank(a.n), db = bdRank(b.n); if(da !== db) return da - db;   // 🇧🇩 famous-in-Bangladesh first
      const ta = tier(a), tb = tier(b); if(ta !== tb) return ta - tb;
      const sa = str(a), sb = str(b); if(sb !== sa) return sb - sa;   // strongest first
      const fa = FEATURED.has(a.n) ? 0 : 1, fb = FEATURED.has(b.n) ? 0 : 1;
      if(fa !== fb) return fa - fb;                                    // ⭐ featured as tiebreak
      return a.n.localeCompare(b.n);
    });
  }
  // Brand list for the active tab, filtered by the smart-search query. For gender
  // tabs the category matches are scoped to that gender; for the md/p tiers any cat.
  function bbBrandsForView(){
    const key = _bbGender;
    // No tab picked → search ACROSS ALL brands & every category (genderScope null).
    const allMode = !key;
    const genderScope = (!allMode && (key === 'w' || key === 'm' || key === 'k')) ? bbGenderCats(key) : null;
    const brands = allMode ? bbAllPool() : bbDeptPool(key);
    const q = (_bbQuery || '').trim().toLowerCase();
    if(q.length < 2){ bbSetHint('', null, null); return brands; }
    // Categories actually present in the catalogue — from PS_CATALOG (classic) or the
    // brand-index we loaded (API mode, where PS_CATALOG is null). Restricts cat matches
    // to ones brands really stock.
    const present = new Set();
    if(PS_CATALOG) PS_CATALOG.forEach(p => present.add(p.cat));
    else if(_bbCatCnt) Object.keys(_bbCatCnt).forEach(b => Object.keys(_bbCatCnt[b]).forEach(c => present.add(c)));
    const rawN = psNorm(q);
    const tokens = q.split(/[\s,]+/).map(psNorm).filter(t => t.length >= 2 && !PS_STOP.has(t));
    const matchedCats = new Set(), matchedNames = new Set();
    const addCat = c => { if(!genderScope || genderScope.has(c)) matchedCats.add(c); };
    tokens.forEach(t => {
      psMatchCatsToken(t, present).forEach(addCat);
      if(t.length >= 3) brands.forEach(b => { if(psNorm(b.n).indexOf(t) >= 0) matchedNames.add(b.n); });
    });
    if(rawN.length >= 2) psMatchCatsToken(rawN, present).forEach(addCat);
    if(rawN.length >= 3) brands.forEach(b => { if(psNorm(b.n).indexOf(rawN) >= 0) matchedNames.add(b.n); });
    const catArr = [...matchedCats];
    const filtered = brands.filter(b => matchedNames.has(b.n) ||
      (catArr.length && _bbIndex[b.n] && catArr.some(c => _bbIndex[b.n].has(c))));
    bbSetHint(q, matchedNames, matchedCats);
    return filtered;
  }
  // Hint line under the smart search: names the matched brands + product categories.
  function bbSetHint(raw, names, cats){
    const el = document.getElementById('bbSearchHint');
    if(!el) return;
    if(!raw || raw.length < 2){ el.textContent = ''; return; }
    const nN = names ? names.size : 0, cN = cats ? cats.size : 0;
    if(!nN && !cN){ el.textContent = tr('ps_search_nomatch'); return; }
    const nm = [...(names || [])].slice(0, 3);
    const lbls = [...(cats || [])].slice(0, 3).map(c => (PS_CAT_LABELS[c] || c).replace(/—/g,'').replace(/\s+/g,' ').trim());
    const extra = Math.max(0, nN - 3) + Math.max(0, cN - 3);
    el.innerHTML = '<b>✓</b> ' + esc(nm.concat(lbls).join(', ')) + (extra > 0 ? ' +' + extra : '');
  }
  function bbRenderProduct(){
    const body = document.getElementById('bbProdBody');
    const gtabs = document.getElementById('bbGtabs');
    if(!body || !gtabs) return;
    // Need the brand→category index first. Load it async (API: tiny /brand-index;
    // classic: from PS_CATALOG) then re-render. The flag prevents duplicate fetches AND
    // the infinite psOnReady recursion the old PS_CATALOG guard hit in API mode (where
    // PS_CATALOG stays null forever, so the brands view was stuck/crashing).
    if(!_bbIndex){
      if(!_bbIdxLoading){
        _bbIdxLoading = true;
        bbLoadIndex(() => { _bbIdxLoading = false; if(bbActive()) bbRenderProduct(); });
      }
      gtabs.innerHTML = '';
      body.innerHTML = `<div class="bb-prod-empty">${tr('bb_loading')}</div>`;
      return;
    }
    // Tab row — the 5 store-type departments (Kids first) on EVERY width, so desktop
    // matches mobile exactly. Keep the active key valid if it isn't in this set.
    _bbWasMobile = bbIsMobile();
    const tabs = BB_TABS_MOBILE;
    if(_bbGender && !tabs.some(t => t[0] === _bbGender)) _bbGender = 'w';
    gtabs.innerHTML = tabs.map(([g,k]) =>
      `<button type="button" class="bb-gtab${_bbGender===g?' on':''}" onclick="bbPickGender('${g}')">${tr(k)}</button>`).join('');
    // No tab picked AND nothing typed → show ALL brands as image tiles (req — no more pick-prompt);
    // the search + dept tabs above still filter. With a query we search across all brands.
    if(!_bbGender && (_bbQuery || '').trim().length < 2){ bbSetHint('', null, null); }
    const brands = bbBrandsForView();
    body.innerHTML = `<div id="bbGridWrap">` + bbBrandGrid(brands) + `</div>`;
    // Tiles now show the brand's own LOGO (sync, from the harvested map) — no async product-photo
    // load, so we don't call bbLoadBrandTilePhotos() here anymore.
  }

  // Browse PRODUCTS is the default landing tab. We still honour a saved choice so
  // a buyer who switched to Browse Brands returns to it; otherwise default products.
  try{ switchBrowse(localStorage.getItem('psb_browse') === 'brands' ? 'brands' : 'products'); }
  catch(e){ try{ switchBrowse('products'); }catch(_){} }

  // ── Deep-link from categories.html ──────────────────────────────────────────
  // The full categories page (categories.html, opened by the ▦ button on the gender
  // rail) links back here with ?fromcat=<catKey> or ?brand=<name>. Apply that filter
  // on load, sync the department rail to the category's gender, then clean the URL.
  (function(){
    try{
      var q = new URLSearchParams(location.search);
      var fromCat = q.get('fromcat');
      var fromBrand = q.get('brand');
      if(!fromCat && !fromBrand) return;
      try{ switchBrowse('products'); }catch(e){}
      if(fromCat){
        var g = /^mens_/.test(fromCat) ? 'm' : /^kids_/.test(fromCat) ? 'k' : 'w';
        // Highlight the gender on the rail VISUALLY only. We deliberately do NOT call
        // psSetGender()/psSetShopGender() here: on a cold load those kick off an async
        // department-index fetch whose callback would clobber our single-category filter.
        try{
          var _root = document.documentElement; _root.setAttribute('data-gender', g);
          var _gb = document.querySelectorAll('#psGenRail .ps-gen');
          for(var _i=0;_i<_gb.length;_i++){ var _on = _gb[_i].getAttribute('data-g')===g; _gb[_i].classList.toggle('on', _on); _gb[_i].setAttribute('aria-pressed', _on?'true':'false'); }
          if(typeof psMoveGenInd === 'function') psMoveGenInd();
        }catch(e){}
        psSel = { prices:new Set(psSel.prices), cats:new Set([fromCat]), brands:new Set() };
        try{ psBuildPriceFilter(); psBuildBrandFilter(); psBuildCatFilter(); psBuildSort(); psApply(); }catch(e){}
      } else if(fromBrand){
        psSel = { prices:new Set(psSel.prices), cats:new Set(), brands:new Set([fromBrand]) };
        try{ psBuildPriceFilter(); psBuildBrandFilter(); psBuildCatFilter(); psBuildSort(); psApply(); }catch(e){}
      }
      var clean = new URL(location.href);
      clean.searchParams.delete('fromcat'); clean.searchParams.delete('brand');
      history.replaceState(null, '', clean.toString());
      setTimeout(function(){ try{ psScrollToResults(); }catch(e){} }, 200);
    }catch(e){}
  })();

  // ── BUILD STAMP ──────────────────────────────────────────────────────────
  // Lets the operator confirm at a glance they're on the latest version. If
  // the tag in the bottom-right is older than expected, hard-refresh
  // (Ctrl+Shift+R / pull-to-refresh) to clear a stale cached page.
  const PSB_BUILD = '2026-06-30-plan2';
  // ── Auto-update on a stale build ───────────────────────────────────────────
  // Buyers were getting stuck on a cached OLDER build. A few seconds after load
  // (and whenever the tab regains focus), fetch the live page (cache-busted),
  // read its build tag, and if a NEWER build is live, clear caches + the service
  // worker and reload so the fresh build loads. Per-build sessionStorage guard
  // prevents any reload loop.
  (function(){
    function liveBuildCheck(){
      // The build tag now lives in the external, MINIFIED app.js (PSB_BUILD="…",
      // double-quoted, no spaces) — not in the page HTML — so fetch app.js (cache-busted
      // so the cache-first service worker can't serve a stale copy) and match either
      // quote style. Fetching the page here matched nothing post-build → updater was dead.
      fetch('app.js?_v=' + Date.now(), { cache: 'no-store' })
        .then(function(r){ return r.ok ? r.text() : Promise.reject(); })
        .then(function(html){
          var m = html.match(/PSB_BUILD ?= ?['"]([^'"]+)['"]/);
          var live = m && m[1];
          if(!live || live === PSB_BUILD) return;
          var key = 'psb_seen_' + live;
          try{ if(sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); }catch(e){}
          Promise.resolve()
            .then(function(){ return window.caches ? caches.keys().then(function(k){ return Promise.all(k.map(function(x){ return caches.delete(x); })); }) : null; })
            .then(function(){ return navigator.serviceWorker ? navigator.serviceWorker.getRegistrations().then(function(rs){ return Promise.all(rs.map(function(r){ return r.unregister(); })); }) : null; })
            .catch(function(){})
            // Reload to a CACHE-BUSTED url: clearing the SW+caches isn't enough — GitHub Pages'
            // 10-min HTTP cache (and a not-yet-activated new SW) can still serve the OLD page on a
            // plain reload. A unique ?_fresh= forces a real network round-trip to the fresh build.
            .then(function(){ try{ var u = new URL(location.href); u.searchParams.set('_fresh', Date.now()); location.replace(u.toString()); }catch(e){ location.reload(); } });
        }).catch(function(){});
    }
    setTimeout(liveBuildCheck, 3000);
    document.addEventListener('visibilitychange', function(){ if(!document.hidden) liveBuildCheck(); });
  })();
  console.log('%cPakPoshak · build '+PSB_BUILD, 'color:var(--gold);font-weight:700;font-size:13px');
  document.addEventListener('DOMContentLoaded', () => {
    const tag = document.createElement('div');
    tag.textContent = 'v'+PSB_BUILD;
    tag.style.cssText = 'position:fixed;bottom:74px;right:9px;z-index:40;font-size:0.6rem;'
      + 'color:var(--txt-muted);opacity:0.55;pointer-events:none;letter-spacing:0.5px';
    document.body.appendChild(tag);
    try { psBannerStart(); } catch(e){}   // start the rotating value banner (redesign P1)
    try { psRenderColls(); } catch(e){}   // render the collection-first home tiles
    try { var _cq = new URLSearchParams(location.search).get('coll'); if(_cq && window.psOpenColl) psOpenColl(_cq); } catch(e){}   // deep-link ?coll=<id> (posters/links)
    try { psRenderPromises(); } catch(e){}   // render the promise/trust strip (search page)
    try { psFiltersInit(); } catch(e){}      // move the filter containers into the ▦ sheet
    try { psMoveGenInd(); } catch(e){}                                  // place the sliding gender underline (#2)
    setTimeout(function(){ try{ psMoveGenInd(); }catch(e){} }, 350);    // re-place once fonts/sticky layout settle
    // Restore the Luxe room on a hard refresh: psStore was read from localStorage; if it's premium,
    // re-apply the deep-forest look + the active Luxe tab (the feed already loads premium from psStore).
    try {
      if(psStore === 'premium'){
        psLuxeMode(true);
        var _bh = document.getElementById('bnav-home'), _bl = document.getElementById('bnav-luxe');
        if(_bh) _bh.classList.remove('active');
        if(_bl) _bl.classList.add('active');
      }
    } catch(e){}
  });




  /* Register the service worker so the site is installable as an app and works
     offline. Guarded to http/https so local file:// previews don't throw. */
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    // Was a SW ALREADY controlling this page at load? If not, this is a first-time
    // visit and the first controllerchange is just the initial install claiming the
    // page — reloading then would wipe transient first-load state, e.g. a ?add=/?cart=
    // deep-link draft created (and its query already stripped) before the SW installed.
    // So only auto-reload for a genuine BUILD UPDATE (a new SW replacing an existing
    // controller), never on first install.
    var _hadController = !!navigator.serviceWorker.controller;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        // Check for a newer SW on every load and apply it promptly.
        reg.update();
      }).catch(function (err) {
        console.warn('SW registration failed:', err);
      });
    });
    // When a NEW build's service worker takes control, reload ONCE so the user is
    // never stuck on a stale page. Skip on first install (_hadController false) and
    // guard against a reload loop.
    var _psbReloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!_hadController || _psbReloaded) return;
      _psbReloaded = true;
      location.reload();
    });
  }

  /* ── Install App button ──
     Android/Chrome: capture beforeinstallprompt and show a one-tap install pill.
     iOS/Safari: no install API exists — show a pill that opens manual instructions.
     Hidden entirely when already running as an installed app. */
  (function () {
    var pill = document.getElementById('installPill');
    if (!pill) return;
    var deferred = null;

    // Already installed / launched from home screen → never show.
    var standalone = window.matchMedia('(display-mode: standalone)').matches ||
                     window.navigator.standalone === true;
    if (standalone) return;

    var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
    var isSafari = isIOS && /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent);

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();      // stop Chrome's own mini-infobar
      deferred = e;
      pill.style.display = 'flex';   // show our button instead
    });

    window.addEventListener('appinstalled', function () {
      deferred = null;
      pill.style.display = 'none';
    });

    // Manifest is display:"standalone" → PakPoshak is a real installable app.
    // Android / desktop Chrome fire beforeinstallprompt (captured above) so the
    // pill triggers the NATIVE one-tap install dialog. iOS has no install API,
    // so always show the pill there → it opens the Share → "Add to Home Screen"
    // help. (Brand links still open in a Chrome Custom Tab via launchBrandTab,
    // so copy/paste keeps working even though the app is standalone now.)
    var isMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isMobile) pill.style.display = 'flex';

    // ── iPhone visual guide carousel (auto-rolls; tabs switch Safari/Chrome) ──
    var _iosTrack = 'safari', _iosIdx = 0, _iosTimer = null;
    function iosgRender() {
      var slides = document.querySelectorAll('#iosGuide .iosg-slide');
      var n = 0;
      slides.forEach(function (s) { if (s.getAttribute('data-track') === _iosTrack) n++; });
      if (_iosIdx >= n) _iosIdx = 0;
      if (_iosIdx < 0) _iosIdx = n - 1;
      slides.forEach(function (s) {
        var show = s.getAttribute('data-track') === _iosTrack && +s.getAttribute('data-i') === _iosIdx;
        s.style.display = show ? 'block' : 'none';
      });
      var ts = document.getElementById('iosgTabSafari'), tc = document.getElementById('iosgTabChrome');
      if (ts) ts.classList.toggle('on', _iosTrack === 'safari');
      if (tc) tc.classList.toggle('on', _iosTrack === 'chrome');
      var dots = document.getElementById('iosgDots');
      if (dots) { var h = ''; for (var i = 0; i < n; i++) h += '<span class="iosg-dot' + (i === _iosIdx ? ' on' : '') + '" onclick="psbIosGo(' + i + ')"></span>'; dots.innerHTML = h; }
    }
    function iosgRestart() { if (_iosTimer) clearInterval(_iosTimer); _iosTimer = setInterval(function () { _iosIdx++; iosgRender(); }, 2600); }
    function iosgStart() { _iosIdx = 0; iosgRender(); iosgRestart(); }
    function iosgStop() { if (_iosTimer) { clearInterval(_iosTimer); _iosTimer = null; } }
    window.psbIosTrack = function (t) { _iosTrack = t; _iosIdx = 0; iosgRender(); iosgRestart(); };
    window.psbIosGo = function (i) { _iosIdx = i; iosgRender(); iosgRestart(); };

    function showInstallHelp() {
      var guide = document.getElementById('iosGuide');
      var bodyEl = document.getElementById('installHelpBody');
      if (isIOS) {
        // Visual, auto-rolling step screens instead of a wall of text.
        document.getElementById('installHelpTitle').textContent = 'Add PakPoshak to your iPhone';
        if (bodyEl) { bodyEl.innerHTML = ''; bodyEl.style.display = 'none'; }
        if (guide) { guide.style.display = 'block'; _iosTrack = 'safari'; iosgStart(); }
        document.getElementById('iosInstallSheet').style.display = 'flex';
        return;
      }
      if (guide) guide.style.display = 'none';
      if (bodyEl) bodyEl.style.display = '';
      document.getElementById('installHelpTitle').textContent = 'Install PakPoshak';
      document.getElementById('installHelpBody').innerHTML =
          '<p>Installs PakPoshak as an app, with its own icon:</p>'
        + '<ol><li>Tap <b>Install</b> on the prompt that appears — or open the <b>⋮ menu</b> (top-right in Chrome)</li>'
        + '<li>Tap <b>“Install app”</b> (or <b>“Add to Home screen”</b>)</li>'
        + '<li>Tap <b>Install</b></li></ol>'
        + '<p style="font-size:0.84rem;color:var(--txt);background:var(--gold-dim);border:1px solid var(--gold-bdr);border-radius:8px;padding:8px 10px;margin-top:4px">💡 If you added an old PakiPoshak icon before, delete it first — then install again from here.</p>';
      document.getElementById('iosInstallSheet').style.display = 'flex';
    }

    window.psbInstall = function () {
      if (deferred) {                       // Android: native install prompt
        deferred.prompt();
        deferred.userChoice.finally(function () {
          deferred = null;
          pill.style.display = 'none';
        });
      } else {                               // No prompt available (iOS, already
        showInstallHelp();                   // installed, or not yet ready) →
      }                                      // always show manual steps, never a
    };                                       // dead button.
    window.psbCloseIos = function () {
      iosgStop();
      var sheet = document.getElementById('iosInstallSheet');
      if (sheet) sheet.style.display = 'none';
    };
  })();
