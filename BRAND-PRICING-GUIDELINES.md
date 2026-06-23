# PakPoshak — Per-Brand PRICING Guidelines

> Generated from `_variant_pricing_audit.js` across all live brands. This is the price-integrity
> counterpart to BRAND-CATEGORY-GUIDELINES.md. **Rule of the "first promise": the price shown in
> the order form (and on the Browse card) must equal the brand-page price of the COMPLETE article —
> never a cheap sub-piece — and per-size prices appear on chips ONLY when price truly varies.**

## How the app decides (structural, NOT by brand name)

Option dimensions are messy across brands ("Type","Item","Stitching"/"Stitchng","Add on","ADD-ON'S",
"WAISTCOAT WITH KURTA PAJAMA", even "Delivery"). So detection is STRUCTURAL, in `detectOtherDims()`:

- A product is **COMPONENT-priced** if it has an option (other than size/colour) whose values carry
  different prices (spread > 1.02×). e.g. Item: Shirt / Pants / Dupatta / **Full Set**.
- The app renders that dimension as a **themed dropdown**, DEFAULTED to the complete article:
  - component-set (Item / "Full Set" / waistcoat combo) → the **MAX-priced** value (= Full Set)
  - stitching/type (Unstitched/Stitched) → matches the product CATEGORY (unstitched cat → Unstitched)
  - add-on ("None"/"Without ...") → the **base** value (no paid upsell)
  - service ("Delivery"/"WhatsApp for customisation") → cheapest, no dropdown shown
- Size chips + per-size prices are then computed WITHIN the chosen value (no cross-component collapse).
- **UNIFORM** products (one price) show NO per-size price on chips. **SIZE_VARIES** (one price per size,
  e.g. kids age-pricing) show the correct per-size price on each chip.

## Catalog snapshot (147 brands · 59596 products scanned)

| Class | Count | Share | Handling |
|---|---|---|---|
| UNIFORM | 51190 | 85.9% | one price, no per-size chips |
| SIZE_VARIES | 4202 | 7.1% | per-size price shown on chips |
| COMPONENT | 4204 | 7.1% | dropdown, default = complete article |

## GROUP A — COMPONENT-priced brands (dropdown, default to full article)

These brands sell separable pieces / stitching options / add-ons. The card+form must show the
COMPLETE article price. Verify the default picks the full set after any harvest.

| Brand | #COMP | scanned | option dimension(s) | max spread | example |
|---|---|---|---|---|---|
| Ramsha | 440 | 500 | Type, CHOOSE, Choose, Add on | 1.79× | G-501 |
| Sania Maskatiya | 333 | 500 | Item, Fabric | 3.56× | Yashal |
| Emaan Adeel | 292 | 372 | Type, STITCHED, Style | 1.45× | CYRA |
| Mina Hasan | 279 | 326 | Item, Choose Option | 13.32× | Mughal Chinoiserie |
| Zarif | 261 | 411 | Style, Type, Stitched | 1.91× | Anaabi |
| Afrozeh | 252 | 439 | Type | 1.89× | Chalk |
| Iznik Fashions | 235 | 303 | Type | 2.07× | UE-469 Printed Lawn |
| Alizeh | 198 | 282 | Type, Add On | 3.12× | AF-CH-2025-Surkh |
| Farasha | 193 | 220 | Type, TYPE | 1.65× | Velvet Sage |
| Arsalan Iqbal | 166 | 492 | Style, style, Sherwani, Shawl | 1.46× | Sooch'2026 - ChikenKari |
| Wardha Saleem | 160 | 316 | Item, Fabric | 8.35× | Shanza |
| Zainab Chottani | 138 | 499 | Item | 5.53× | Reya |
| Jazmin | 134 | 428 | Type, TYPE | 2.17× | EMBROIDERED CHIFFON UC-3134 |
| Khas Stores | 124 | 498 | Style, STYLE | 1.61× | 2PC Printed Lawn Shirt & Dupatta | KSD-4049 |
| Gulaal | 108 | 407 | Type, Outfit Option, Title | 1.74× | Alma |
| Humayun Alamgir | 100 | 438 | WAISTCOAT WITH KURTA PAJAMA, SELECT YOUR TYPE, Options, WAISTCOAT WITH KURTA/PAJAMA | 9.65× | Teal Green Floral Embroidered Prince Coat |
| Threads & Motifs | 97 | 498 | Delivery, Deliver, Delivery  | 1.1× | The Ivory Regalia |
| Imrozia Premium | 78 | 500 | Type, Add on, Add on Lining, Style | 2.62× | I-190 Rumman |
| Erum Khan | 68 | 210 | Addon:, Addons:, Addons, Stitchng Option | 2.12× | AYLIN |
| Faiza Saqlain | 62 | 482 | Sleeve Style, Accessories, Style, Sleeves Style | 1.86× | Sabina |
| Lawrencepur | 57 | 500 | Length, Style, style | 4.5× | Maroon Plain , Wool Blend, Tropical Exclusive Suit |
| Asifa & Nabeel | 47 | 380 | Stitching | 3.93× | Gardenia Grace ECU25-09 |
| Riwaj Menswear | 47 | 178 | Option, Article | 1.41× | MODREN LIBAS ML-2077- Semi Stitch |
| Hussain Rehar | 42 | 499 | Option, Inner Choice | 3× | Akash - Mix & Match |
| Black Camels | 41 | 249 | HIJAB | 1.32× | SAPPHIRE SERENITY |
| Saad Bin Shahzad | 29 | 79 | Type, Fabric, Style | 1.73× | RUHAB |
| Edge Republic | 28 | 336 | Select, Father, Son, Choose Your Bottom | 2.08× | ER 3025 Off White Prince Coat |
| Zuruj | 26 | 500 | Piece, Khussa Size, Kids Size, Sole Height | 1.57× | Peacock Garden Stitched X Khussa ( COMBO SET ) |
| Sitara Studio | 18 | 497 | Style | 1.85× | DIAMOND BEDSHEET SET MAIN VERSION - 41 |
| Kross Kulture | 17 | 497 | Option | 2.83× | Embroidered Yarn Dyed Shirt |
| Tifl | 15 | 499 | Mom Butter Yellow Stripe Printed Loungewear (Mom Size), Mini Butter Yellow Stripe Printed Loungewear (Mini Size), Mom Beige Checks Printed Loungewear (Mom Size), Mini Beige Checks Printed Loungewear (Mini Size) | 1.11× | Dad Mom Mini Butter Yellow Stripe Printed Loungewe |
| ChenOne | 14 | 499 | PIECE, Filling, Piece | 6.43× | SABLE |
| Jeem | 14 | 150 | REQUIRED , Style, ADD ON , ADD ON | 10× | SILVI GREY |
| Mohagni | 13 | 494 | STYLE, SZIE, Style | 1.49× | PLS-151 3PC STITCHED I UNSTITCHED |
| Ammara Khan | 10 | 102 | Item, Fabric, Fabrci, Dupatta | 1.21× | Golden Noir (D-08) |
| Saira Rizwan | 10 | 348 | Type, Title, Product Type | 1.24× | KOYAL SRIK24-02 |
| RajBari | 8 | 240 | Type | 1.28× | Silah Silk Edit - 10 |
| Abaya.pk | 7 | 441 | Title | 20.29× | LAWN HIJAB BUNDLE (BUY ANY 6 & GET 300 OFF) |
| Kurta Corner | 6 | 402 | Shoes Size , Waist Coat, With Suit | 1.59× | Adem 2 |
| Saya | 6 | 500 | Type, Type , 2 Piece (S+T) | 2.19× | Stitched Cotton Jacquard Suit –(2PC Or Shirt) |
| Crimson | 3 | 257 | Unstitched, Stitching Style, Type | 1.25× | test b |
| Elan | 3 | 368 | Options, Options  | 1.31× | SCINTILLANT OLIVE  (EP-20995) |
| Outfitters | 3 | 495 | Season | 1.45× | Relaxed Fit Pants |
| ECS | 2 | 500 | (ambiguous size) | 1.27× | Bloom Flip |
| Furor | 2 | 500 | (ambiguous size) | 1.4× | Textured Co-ord Set Trousers |
| Hijab-ul-Hareem | 2 | 297 | Kids, Koofi | 1.06× | Chocolate Brown Front Open Nida Abaya |
| Sana Safinaz | 2 | 500 | Item | 5.73× | P-524 |
| Sobia Nazir | 2 | 377 | Sleeves Options, Shawl | 1.31× | Design 4 - Winter Pret 25 Shirt & Trouser |
| Azure | 1 | 214 | Select | 1.53× | Starry Bliss |
| Barae Khanom | 1 | 221 | Item | 5.2× | Melo |
| KEF | 1 | 486 | Material | 2× | Double Sided Hijab Tape - |
| Ismail Farid | 1 | 413 | Title | 1.22× | Add On (Pants) |
| Limelight | 1 | 470 | Style | 2× | Tweed Coat |
| Maria B | 1 | 500 | Type | 2.55× | Custom Size Product |
| Maria Osama Khan | 1 | 297 | Material | 1.24× | Emerald |
| Nureh | 1 | 500 | Style, Type, DESIGN, Option | 1.53× | NEL-59 |
| Preeto | 1 | 138 | Style, Dress style | 1.32× | Girls Elsa Princess Dress Frozen Children Rainbow  |
| Senorita | 1 | 500 | sze | 1.1× | Kids Eid Dress | Multicolor | Casual 2 Piece Suit  |
| Sifa | 1 | 144 | Shawl | 1.36× | Garnet |
| Zaha by Elan | 1 | 480 | Option | 1.39× | COOL LEAF (ZRW-21286) |

### Highest-risk (largest spread — cheapest piece is a tiny fraction of the article)

- **Abaya.pk** — up to 20.29× (e.g. LAWN HIJAB BUNDLE (BUY ANY 6 & GET 300 OFF): 4140 → 7840 PKR)
- **Mina Hasan** — up to 13.32× (e.g. Mughal Chinoiserie: 9000 → 76000 PKR)
- **Jeem** — up to 10× (e.g. SILVI GREY: 59500 → 71500 PKR)
- **Humayun Alamgir** — up to 9.65× (e.g. Teal Green Floral Embroidered Prince Coat: 28500 → 208500 PKR)
- **Wardha Saleem** — up to 8.35× (e.g. Shanza: 26000 → 93500 PKR)
- **ChenOne** — up to 6.43× (e.g. SABLE: 67499 → 359999 PKR)
- **Sana Safinaz** — up to 5.73× (e.g. P-524: 39999 → 171999 PKR)
- **Zainab Chottani** — up to 5.53× (e.g. Reya: 16000 → 75000 PKR)
- **Barae Khanom** — up to 5.2× (e.g. Melo: 4990 → 25970 PKR)
- **Lawrencepur** — up to 4.5× (e.g. Maroon Plain , Wool Blend, Tropical Exclusive Suit: 8000 → 36000 PKR)

## GROUP B — SIZE_VARIES brands (per-size prices are CORRECT — show them)

Genuine per-size pricing (mostly kids age-sizing). Chips MUST show each size's price; the picked
size drives the total. These are NOT a bug — do not suppress their per-size chips.

| Brand | #SIZE_VARIES | scanned |
|---|---|---|
| Hopscotch | 438 | 499 |
| Minnie Minors | 399 | 500 |
| Wear Ochre | 300 | 492 |
| Rang Rasiya | 241 | 500 |
| Sadaf Fawad Khan | 209 | 475 |
| Tassels | 174 | 377 |
| Mushq | 154 | 412 |
| Breakout | 134 | 500 |
| Qalamkar | 127 | 250 |
| One Kids | 126 | 499 |
| Sha Posh | 108 | 500 |
| Beechtree | 79 | 500 |
| Baroque | 68 | 500 |
| MTJ (Tariq Jameel) | 48 | 495 |
| Cougar | 46 | 464 |
| Roheenaz | 42 | 268 |
| Diners | 40 | 492 |
| ETHNC | 34 | 494 |
| Coco by Zara Shahjahan | 33 | 465 |
| The Women Zone | 33 | 493 |
| J. Junaid Jamshed | 30 | 500 |
| Edenrobe | 29 | 497 |
| Khussa Master | 26 | 477 |
| Cambridge | 23 | 500 |
| Dhanak | 22 | 500 |
| Eminent | 17 | 474 |
| Alkaram Studio | 15 | 500 |
| Innerlines | 13 | 255 |
| Salitex | 13 | 500 |
| Al-Deebaj | 11 | 454 |
| Gul Ahmed | 9 | 488 |
| CRUSH Menswear | 7 | 500 |
| Akbar Aslam | 6 | 436 |
| Dazzle by Sarah | 6 | 367 |
| Zara Shahjahan | 6 | 490 |
| Agha Noor | 5 | 430 |
| Republic Womenswear | 3 | 481 |
| Shahzeb Saeed | 3 | 500 |
| The Hijab Company | 3 | 413 |
| Bareeze Man | 1 | 216 |
| Kashee's Boutique | 1 | 500 |
| Maryum N Maria | 1 | 462 |

## GROUP C — UNIFORM (everything else)

~85.9% of the catalog. One price for all sizes/variants → show plain size chips, no per-size price.

## Not Shopify (relay/SFCC path — handled by the dual-form toggle, not this dropdown)

Armas, Khaadi, Sapphire

---
_Regenerate: `node _variant_audit_runner.js 300` then `node _gen_pricing_guidelines.js`._
