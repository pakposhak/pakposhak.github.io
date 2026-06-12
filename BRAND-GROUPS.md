# PakStyle BD — Brand Auto-Fetch Groups & Solutions

**Goal:** every brand auto-fetches **Category · PKR Price · In-stock Sizes** for a buyer in Bangladesh.
(Qty is always the buyer's manual choice — no website can supply it.)

**Survey basis:** every brand domain probed from a Pakistani IP (Karachi) on 2026-06-12/13 — the same
vantage point the VPS relay will have. Checked: Shopify product API (`/products.json`, `/products/{handle}.js`),
session currency (`/cart.js`), product-page structured data (`priceCurrency`), and redirect/twin domains.

**Directory total: 105 brands** (88 + Baroque + Suffuse + 15 non-Shopify = 105; the 7 Shopify twins are
counted inside Group 1 via their PK stores; Khaadi & Sapphire are counted in Group 4).

**Status legend:** ✅ done · 🔧 needs build · ⏳ needs VPS · ✋ manual fallback

---

## Summary

| Group | What it is | Brands | Auto today? | Auto after VPS? | Status |
|---|---|---:|---|---|---|
| **1** | Shopify, native PKR | 88 | ✅ from PK only | ✅ guaranteed for BD | relay wired |
| **2** | Twin sites (intl + PK store) | 10 | ✅ either URL now works | ✅ via twin-map + relay | 🔧→✅ twin-map shipped |
| **3** | USD-native brand (no PKR exists for anyone) | 1 | ✅ auto in USD | ✅ (relay not needed) | ✅ USD_ONLY_BRANDS shipped |
| **4** | Non-Shopify, no product API | 15 | ❌ | partial (Khaadi/Sapphire scrape) | ⏳ needs VPS |
| **5** | Dead / wrong directory links | 0 | — | — | ✅ all fixed |

> Note: Khaadi & Sapphire are counted in **both** Group 2 (twin sites) and Group 4 (non-Shopify),
> because they are twin-store *and* have no Shopify API. They are the priority special-cases.

**Shipped 2026-06-12 (this session):**
- ✅ **Group 5 directory fixes** — Barae Khanom→baraekhanom.pk (now Group 1), Bareeze→bareezepk.com
  (now Group 1), Baroque→baroque.com.pk, Farah Talib Aziz→farahtalibaziz.com.pk (Group 4),
  Suffuse→suffuse.pk (Group 3). No more dead links.
- ✅ **Group 2 twin-map** (`TWIN_MAP` in order-form.html) — pasting an international URL now transparently
  refetches from the PK twin store. Confirmed working end-to-end on Generation (intl generation.pk →
  PK generation.com.pk, HTTP 200, PKR). 404-on-PK-store → "not available in Pakistan" warning.
  Khaadi/Sapphire excluded from that warning (`TWIN_NO_API`) since their 404 means "no API", not "not sold".

---

## GROUP 1 — ✅ Full auto (Shopify, native PKR) — 88 brands

Category, PKR price, in-stock sizes all auto-fill **today** from a Pakistani IP. From **Bangladesh**, some
geo-switch to USD; the `cart.js` currency check (shipped) detects it per-product and the **relay** silently
refetches the PKR version. This is the group the VPS makes bulletproof.

**Probable solution:** VPS relay (already wired). No per-brand work — just confirm each from a BD IP after VPS is live.

Afrozeh, Agha Noor, Alizeh, Alkaram Studio, Almirah, Amir Adnan, Armas, Asim Jofa, Bachaa Party,
Barae Khanom*, Bareeze* (bareezepk.com), Beechtree, Bin Ilyas, Bin Saeed, Bonanza Satrangi, Breakout,
Cambridge, Charcoal, Charizma, ChenOne, Chinyere, Crimson, Cross Stitch, Diners, Dynasty Fabrics, Edenrobe,
Ego, Elan, Emaan Adeel, ETHNC* (pk.ethnc.com), Faiza Saqlain, Farasha, Furor, Generation* (generation.com.pk),
Gulaal, Gul Ahmed, Hopscotch, Hussain Rehar, Imrozia Premium, Ismail Farid, J. Junaid Jamshed, Jazmin,
Kayseria, Khas Stores, Kross Kulture, Lakhany by LSM, Leisure Club, Limelight, Lulusar, Maria B* (mariab.pk),
Maryum N Maria, Mausummery, Minnie Minors, Monark, Motifz, MTJ (Tariq Jameel), Mushq, Nishat Linen, Nureh,
Outfitters, Pepperland, Ramsha, Rang Ja, Rang Rasiya, Republic Menswear, Republic Womenswear, Royal Tag,
Saad Bin Shahzad, Salitex* (salitexonline.com), Sana Safinaz, Sania Maskatiya* (pk.saniamaskatiya.com),
Shahnameh, Shahzeb Saeed, Sha Posh, Silayi Pret, Sitara Studio, Sobia Nazir, So Kamal, Tawakkal Fabrics,
Tena Durrani, Threads & Motifs, Uniworth, Zainab Chottani* (pk.zainabchottani.com), Zaha by Elan,
Zara Shahjahan, Zarif, Zeen (zeenwoman.com), Zellbury

> *Starred brands work **only via the correct PK domain** — the Group 2 twin-map redirects their
> international URLs automatically.

**Added 2026-06-13 (all surveyed: Shopify + PKR + stock):** Zeen, Lulusar, So Kamal, Mausummery,
Sitara Studio, Maryum N Maria, Imrozia Premium, Emaan Adeel (PKR verified in browser), Dynasty Fabrics,
Shahzeb Saeed, Leisure Club, Pepperland.

**Searched but NOT added (no working online store found):** Firdous (3 domains dead/blocked), Qalamkar,
Asifa & Nabeel, Brumano, Orient Textiles (orienttextiles.com is for sale; orient.com.pk is Orient
*Electronics* — different company). Revisit if buyers ask.

---

## GROUP 2 — 👯 Twin websites: separate international + Pakistani stores — 10 brands  ✅ twin-map shipped

Two real stores per brand. **Risk (now mitigated):** buyer pastes the *international* URL → would get USD
price, or a product not carried on the PK store. `TWIN_MAP` now redirects the fetch to the PK twin.

| Brand | International site | Pakistani site | PK store currency | Twin-map result |
|---|---|---|---|---|
| ETHNC | ethnc.com (USD) | pk.ethnc.com | ✅ PKR (Shopify) | ✅ auto PKR |
| Generation | generation.pk (USD!) | generation.com.pk | ✅ PKR (Shopify) | ✅ auto PKR (verified) |
| Bareeze | bareeze.com (custom/no API) | bareezepk.com | ✅ PKR (Shopify) | ✅ auto PKR |
| Maria B | mariab.com (bot-walled) | mariab.pk | ✅ PKR (Shopify) | ✅ auto PKR |
| Baroque | baroque.com (domain for sale) | baroque.com.pk | ❌ USD even to PK | redirects, but still USD → manual |
| Sania Maskatiya | saniamaskatiya.com (USD) | pk.saniamaskatiya.com | ✅ PKR (Shopify) | ✅ auto PKR (verified) |
| Zainab Chottani | zainabchottani.com (USD) | pk.zainabchottani.com | ✅ PKR (Shopify) | ✅ auto PKR (verified) |
| Salitex | salitex.com (USD) | salitexonline.com | ✅ PKR (Shopify) | ✅ auto PKR (verified) |
| **Khaadi** | khaadi.com (USD) | pk.khaadi.com | — (Salesforce, no API) | redirect only; needs G4 scraper |
| **Sapphire** | geo-redirect | pk.sapphireonline.pk | — (Salesforce, no API) | redirect only; needs G4 scraper |

**Solution (shipped):** `TWIN_MAP` (intl host → PK host) in `order-form.html`. On a pasted international URL,
the form refetches `/products/{handle}.js` from the PK twin. Found → PKR price + PK stock. 404 → red
"not available on the Pakistani store" warning. Khaadi/Sapphire are in `TWIN_NO_API` so their (expected) 404
does NOT trigger that warning — they fall through to manual + the future scraper. **Works without VPS** for
the 4 Shopify twins; Baroque still needs manual USD (no PKR exists); Khaadi/Sapphire await the Group-4 scraper.

---

## GROUP 3 — 💵 USD-native brand (no PKR exists for anyone) — 1 brand  ✅ solution shipped

Confirmed USD checkout; on-screen "Rs" is a converter widget (e.g. Saliha shows Rs.43,959**.41** =
$155.65 × FX rate — the paisa fraction is the giveaway), **not** a brand-set price.

| Brand | Site | Evidence |
|---|---|---|
| Suffuse by Sana Yasir | suffuse.pk | Shopify base USD, market=US, checkout USD — even for Pakistani visitors. No separate PK store exists (pk.suffuse.pk, suffuse.com.pk etc. all dead). |

**Solution (shipped):** `USD_ONLY_BRANDS` set in order-form.html. Key insight: Suffuse's USD price hides no
cheaper PKR price — it's the true cost for everyone, so auto-filling it is correct, not a compromise.
Category/sizes/stock auto-fetch (Shopify works); price auto-fills on the USD toggle; converts at the admin
USD→PKR rate (set it ~2–3% above mid-market to cover card FX fees); calm amber "this brand sells in USD only"
note instead of the red alarm; relay skipped (pointless). Effectively full-auto, just USD-denominated.

> **Correction (2026-06-12):** Salitex, Sania Maskatiya, Zainab Chottani were WRONGLY placed here earlier —
> I had tested their international domains (salitex.com / saniamaskatiya.com / zainabchottani.com). Their real
> PK stores — **salitexonline.com**, **pk.saniamaskatiya.com**, **pk.zainabchottani.com** — are genuine PKR
> Shopify stores (cart.js=PKR, checkout in PKR, live stock). All three moved to Group 1 + twin-map. Lesson:
> always test the actual PK domain, not the international twin.

**Probable solution:** No automated PKR possible. Manual USD entry (form handles loudly), **or** source the
same article via a PK multi-brand retailer (e.g. LAAM) when available. Candidate for removal if low demand.

---

## GROUP 4 — ✋ Non-Shopify, no product API — 15 brands

No `/products.json`. Auto-fetch impossible by the normal path; the red "stock could NOT be verified" warning
shows correctly today.

| Brand | Platform | Priority |
|---|---|---|
| **Khaadi** | Salesforce Commerce Cloud | HIGH — flagship |
| **Sapphire** | Salesforce Commerce Cloud | HIGH — flagship |
| Image | Magento | low |
| Naushemian | Magento | low |
| Thredz | Magento | low |
| Cougar | custom (Next.js) | low |
| Deepak Perwani | custom | low |
| Erum Khan | bot-blocked (retest from VPS) | low |
| Ittehad | custom | low |
| LAAM (multi-brand) | custom/Shopify-hybrid | MED — big catalog |
| Mohsin Naveed Ranjha | custom | low |
| Nomi Ansari | bot-blocked (retest from VPS) | low |
| Savoir | unreachable (retest from VPS) | low |
| Warda | bot-blocked (retest from VPS) | low |
| Farah Talib Aziz | custom (farahtalibaziz.com.pk, non-Shopify) | low |

**Probable solution:** **Relay HTML-scrape from the PK IP** — fetch the product page server-side and parse the
embedded JSON-LD (`priceCurrency`/`price`/`offers`) that these sites emit for Google Shopping. Per-brand
parser work; do **Khaadi + Sapphire first** (must come from a PK IP → needs VPS). Bot-blocked ones may simply
work once requested from the VPS with a real browser UA — retest before writing parsers.

---

## GROUP 5 — ✅ Dead / wrong directory links — ALL FIXED

| Brand | Old URL | Problem | Fix applied | New group |
|---|---|---|---|---|
| Barae Khanom | embellishedkurtas.com | **Indian INR store** | → **baraekhanom.pk** (Shopify PKR) | **Group 1** |
| Bareeze | bareeze.com | intl, no API | → **bareezepk.com** (Shopify PKR) | **Group 1** |
| Baroque | baroque.com | domain for sale | → **baroque.com.pk** (USD) | Group 2 (manual price) |
| Farah Talib Aziz | farahtalibaziz.com | parked lander | → **farahtalibaziz.com.pk** (live, non-Shopify) | Group 4 |
| Suffuse | suffuse.com | offline | → **suffuse.pk** (live Shopify, USD) | Group 3 |

Done in `order-form.html` `BRANDS`. Barae Khanom & Bareeze gained full auto-fetch as a result.

---

## Category mapping (2026-06-13)

Harvested **1,057 real product_type strings from all 86 reachable Shopify brands** (in-browser fetch;
curl was bot-challenged after earlier survey bursts). Results:

- Direct type→category mapping improved **45% → 61%** with new PT_CAT rules (kids, footwear, bottoms,
  western tops, dresses→maxi_dress, saree→bridal, bare fabric names→unstitched, abaya→kaftan,
  reversed "Kameez Shalwar", lounge sets, standalone "Shalwar"→bottoms).
- Remaining 39% are garment-info-free labels ("Clothing", "Summer 2026", "Made To Order", "Payment
  Link") → handled by NEW title fallback: women's path now retries mapPtToCat(product.title), same as
  the men's path always did.
- **Unstitched override fix (the Zellbury bug):** brand's product_type saying "Unstitch" now OVERRIDES
  a wrong stitched URL-guess, so unstitched items never ask for sizes. The reverse (sizes found ⇒
  stitched) already existed; together they're self-correcting.
- **4 new categories** (user decisions): `maxi_dress` 0.50kg, `kids_eastern` 0.25kg, `kids_western`
  0.30kg, `footwear` 1.10kg. Saree/lehenga/gharara → bridal. All editable in admin weight chart.
- NOTE: category mapping is form-side logic — the VPS/relay does NOT affect it (relay fixes currency
  + stock only).

## Build backlog (per group)

- [x] **G5** Fix directory URLs (Barae Khanom, Bareeze, Baroque, FTA, Suffuse) — *done 2026-06-12*
- [x] **G2** Twin-map: intl→PK handle refetch + "not in PK store" warning — *done 2026-06-12*
- [ ] **VPS** Provision CloudVPS.pk, verify PK geolocation, deploy relay + HTTPS — *blocks G1-BD & G4*
- [ ] **G1** After VPS: confirm each brand from a Dhaka IP; relay handles USD-switchers
- [ ] **G4** Khaadi + Sapphire JSON-LD scraper on relay (PK IP); retest bot-blocked brands
- [x] **G3** Suffuse handled as USD-native brand (`USD_ONLY_BRANDS`) — auto-fetch in USD, admin-rate conversion — *done 2026-06-13*

_Last surveyed: 2026-06-12 from Karachi PK IP. Re-run survey from Dhaka after VPS to validate Group 1 USD-switchers._
