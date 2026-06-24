# PakPoshak — Catalog Category Guidelines (per category · per brand)

**Canonical, current reference for how every product is categorised.** Last reconciled 2026-06-23.

## The system (3 files keep each other honest)
| File | Role |
|---|---|
| **`catalog-cleanup.js`** | The **executable rules** — the source of truth. Runs at every `search.db` rebuild on the VPS, so it decides the LIVE category of every product. |
| **`audit-categories.js`** | The **re-check tool**. `node audit-categories.js` (every category, low→high, first 3 pages; `--deep` for last+random) flags titles that contradict their category, with false-positives excluded. Exit code = #suspects (0 = clean). |
| **this file** | The **human-readable guideline** — what each category means + every brand's known quirk/decision. When you confirm a new finding: add a rule to `catalog-cleanup.js` AND a line here. |
| `BRAND-CATEGORY-AUDIT.md` | A live per-brand category-**count** snapshot (regenerate from catalog.json). Data, not rules. |
| `BRAND-AUDIT-FINDINGS.md` | The **original** 274-finding proposal list (historical). Most "move/delete" items are now resolved in code; its "Confusions" section still holds open questions. |

**Method (the repeatable audit):** Stage 1 = run `audit-categories.js` (explicit text). Stage 2 = for the not-100%-clear residue, **look at the product photo** (download + view; image filenames often reveal it). Stage 3 = write the rule here + in `catalog-cleanup.js`, unit-test, deploy, re-run until clean. (See memory `catalog-visual-audit.md`.)

---

## Category definitions (what belongs in each)

**Women — stitched**
- `kurti_1pc` = **EASTERN 1-piece shirts/kurtis ONLY.** A western top (tee/tank/polo/blouse/button-down/camisole/jacket/blazer/shrug) → `western_top`, NOT here.
- `western_top` = western 1-piece tops/blouses/tees/polos/jackets. No bottoms, no dresses, no eastern kurtas.
- `kaftan` = loose kaftan/kimono/robe-style gown. `maxi_dress` = long maxi dress/gown (often western/jumpsuit-adjacent).
- `womens_trouser` = ANY standalone women's bottom (trouser/palazzo/culotte/legging/capri/**skirt**). No tops, no full suits.
- 2-piece: `shirt_dupatta_2pc` (shirt+dupatta) · `shirt_trouser_2pc` (shirt+trouser/culotte, no dupatta) · `pret_2pc_emb` / `formal_emb_2pc` (embroidered 2pc) · `coord_western` (western top+bottom set).
- 3-piece: `pret_3pc` · `pret_3pc_emb` · `formal_emb_3pc` · `heavy_formal_3pc` · `handmade_emb` (heavy hand-embroidered).
- Winter stitched: `winter_2pc_stitch` · `winter_3pc_stitch`.

**Women — unstitched FABRIC** (a dressed-model photo can STILL be unstitched if it says "Unstitched 2/3 pcs")
- `kurti_1pc_unstitch` = 1-piece SHIRT fabric (a standalone bottom fabric → `womens_trouser`).
- `shirt_dupatta_2pc_unstitch` · `shirt_trouser_2pc_unstitch` · `lawn_3pc_unstitch` · `unstitch_3pc_emb` · `winter_2pc_unstitch` · `winter_3pc_unstitch`.

**Women — other:** `abaya` (abaya/hijab/niqab/makhna — the **modest-wear umbrella**) · `dupatta_only` (standalone dupatta/scarf/stole) · `shawl` (shawl/pashmina/wrap) · `saree` · `lehenga` (lehenga/gharara/sharara/choli set) · `loungewear` (real nightwear/pajama/lounge sets only — design-named **"Midnight/Night/Nights"** suits *without* an explicit sleepwear word are auto-rescued to their real suit cat).

**Men:** `mens_shirt` · `mens_trouser` · `mens_jeans` · `mens_kurta` · `mens_shalwar_kameez` (kurta+shalwar/trouser 2pc) · `mens_waistcoat` · `mens_suit` (western 2-3pc suit/tuxedo) · `mens_sherwani` (sherwani/prince-coat) · `mens_unstitched` (suiting FABRIC).

**Kids:** `kids_boys_{eastern,western,formal}` · `kids_girls_{eastern,western,formal}` · `kids_infant`. **There is NO kids-trouser category — a boys/girls trouser correctly lives in its gender/style kids cat.**

**Footwear:** `footwear` = women's footwear only (khussa/kolhapuri/chappal/pumps/heels/**sling-backs/peep-toes/court-shoes/mules**). **Men's & kids' footwear is DELETED; peshawari is DELETED (any gender).**

---

## FALSE POSITIVES — never move/flag these (learned the hard way)
- **Colour names:** "Baby Pink/Blue/Peach" etc. (a colour, not an infant).
- **Collection/style names:** "Soft Girl Era", "Desi Girl", **"Tap Shoe"** (= Amir Adnan JACKET/suit line, NOT footwear), "Midnight/Night …" (a design name, not nightwear), "Girl Power".
- **Women's waistcoats** are a legit women's garment (leave in their pret cat).
- **"Denim Pants/Trousers"** = jeans (correct in `mens_jeans`).
- **Kids' bottoms** (no kids-trouser cat).
- **"One Kids"** sells ADULT menswear despite the name (slug-gated — see below).
- **"Prince Coat … with same Pant"** = a sherwani set (correct in `mens_sherwani`).

---

## Per-brand guidelines
*(Only brands with a special rule/quirk are listed; every other brand follows the category rules above. All rules below are live in `catalog-cleanup.js`.)*

### Multi-department brands — gender/age is encoded in the SLUG or SKU (trust it, don't guess per-image)
- **One Kids** — FAMILY brand. Slug first letter: `g`=girl, `b`=boy, `m`=MEN, `w`=women. m→men (polos/tees on adult males, vision-confirmed), g/b swap within kids, w→women. (Also: its `MT…` polos/tees mis-filed as men's shalwar-kameez → `mens_shirt`.)
- **Bonanza Satrangi** — slug first letter = gender (m/w/k). Fix any item whose slug contradicts its cat.
- **Zellbury** — SKU first code letter `g` = girls (harvester defaults code-named kids to boys) → `kids_girls_*`.
- **Maria B** — slug `mbm` = Maria B Man → men; `mbk` = kids; `MBM-3PW` wool 3pc (waistcoat+kurta+shalwar) mis-filed as men's shirt → `mens_shalwar_kameez`.
- **Cougar** — multi-dept. Men's polos/shirts/tees = slugs `ps/ss/se/ts` (keep men's). Women's = `ft/wt/ww/tlf/ltt/lcs/wws/wsk/wsh` (code at slug start **or** as a trailing hyphen-segment, e.g. `scoop-neck-tank-top-ltt609`) → women's, routed by garment (trouser→bottoms, dress→maxi, else→`western_top`).
- **Hopscotch** — kids gender in SKU `h026-[g/b]`. Swap to matching kids gender, keep eastern/western/formal suffix.
- **Diners** — prefix `w*`=women, `kb*`=boys, `kg*`=girls, else men. (+ "Autograph" = formal menswear shirts → `mens_shirt`.)
- **Senorita** — `K[A-Z]{2}-xxxxx` SKU = girls' kids (sizes 16-32 = ages 2-10y). Casual/summer → girls eastern; formal/party → girls formal.
- **Sha Posh** — kids brand sized 20→40 (36-40 = OLDER KIDS, not adult). "Kids"-titled → `kids_girls_*` (photos disprove the old size≥36=adult heuristic).
- **Dynasty Fabrics** — men's suiting house, no kids line → any kids-misclassified item → `mens_unstitched`.

### Western brands — tops are WESTERN (→ `western_top`/`maxi_dress`/bottoms, not eastern kurti)
- **Lulusar** — WESTERN. Button-downs/jackets/shrugs/shackets/capes/blazers/vests/bustiers/corsets/skirts in eastern cats → `western_top`; jumpsuits → bottoms. It makes **no eastern 3-piece suits**, so ANY Lulusar left in a 3pc cat is rerouted by garment (long/maxi/dress/gown → `maxi_dress`, else → `western_top`).
- **Outfitters** — women's blouse/dress mis-gendered into men's cats → `western_top`/`maxi_dress`.
- **ETHNC** — `western-…` slug tops → `western_top`; standalone "SKIRT" → `womens_trouser`; eastern kids handled by the girls-kids list.
- **ChenOne** — `LDS-####` ladies western tops/shirts dumped in winter/pret → `western_top`.
- **Breakout** — WESTERN high-street brand; its "Top" items mis-shelved in eastern kurti → `western_top` (grouped with Lulusar/Outfitters).
- **Edenrobe** — multi-dept; its "Printed Lawn Co-Ord Set" is **EASTERN** (kameez+trouser) → `shirt_trouser_2pc`, NOT a western co-ord.
- *(Beechtree polos/button-downs & standalone skirts are caught by the general kurti=eastern and skirt→bottom rules.)*

### Men's brands & quirks
- **Monark** — western menswear. "TWO/THREE-PIECE SUIT" mis-filed as shalwar-kameez → `mens_suit`.
- **Uniworth / Edge Republic** — western suits & tuxedos mis-filed as shalwar-kameez → `mens_suit`.
- **Any western tailored suit** — "slim-fit suit" / "poly-viscose" / "two/three-piece suit" / blazer / tuxedo / double-breasted / pant-coat, with **no** shalwar/kameez/kurta/sherwani/pajama word, mis-filed as shalwar-kameez → `mens_suit` (general rule beyond the named brands above; catches **Amir Adnan** "PV … Slim Fit Suit". Eastern "Shalwar Suit" — Bonanza, Innerlines "Kurta With Pants" — is guarded out).
- **Amir Adnan** — waistcoat-and-shawl sets in `shawl` → `mens_waistcoat`; "Tap Shoe" = a JACKET/suit line (NOT footwear); open-front sherwanis in `mens_unstitched` → `mens_sherwani`. Its avant-garde RUNWAY collection (titled "X Jacket/Coat/Waistcoat and Pants", `sz:["Unstitched"]`) lands in `mens_unstitched`/`mens_trouser` but is finished STITCHED couture — **mixed gender, so slug-keyed from image checks** (Amir Adnan menswear → `mens_suit`/`mens_sherwani`/`mens_waistcoat`/`mens_shalwar_kameez`; `*-by-house-of-parishae` womenswear + `black-velvet-jacket-and-pants` → `coord_western`). A sherwani GROOM SET that merely includes a shawl (Edge Republic "Sherwani With Turban Shawl And Kurta Pajam") → `mens_sherwani`, not `shawl`.
- **Humayun Alamgir** — feminine bridal/formal (3pc/lehenga/gharara/choli/pishwas) mis-tagged `mens_kurta` → `pret_3pc`/`lehenga`.
- **Al-Deebaj** — men's "Kurta Pajama" (KP/ADKP) in women's loungewear → men's eastern; men's "Kurta Shalwar" (KS) co-ords → `mens_shalwar_kameez`; men's waistcoats in women's formal → `mens_waistcoat`; "Printed Cotton Co-Ord Set" = women's EASTERN 2pc.
- **Nishat Linen** — "Naqsh" = its MENSWEAR line (kurta+shalwar on male models).
- **Asim Jofa** — `AJMRW` = Men's Ready-to-Wear; `AJUBM` = Unstitched Bundle for Men → `mens_unstitched`.
- **Sadaf Fawad Khan** — standalone "X Kurta" (not kurti/suit) = its MEN's kurta line.
- **Royal Tag** — `LP/GT/FT/DOT` SKUs = lapel pins / ties / grooming sets → DELETE (accessories).
- **Charcoal** — menswear scarves/ties in unstitched → DELETE.
- **Azure** — women-first brand with a MEN's line (`MENS_2PC_BRANDS`): its "Kameez / Kurta Shalwar / Kurta with Trouser" 2pc + "Kurta Pajama" mistagged into women's cats → `mens_shalwar_kameez`.

### Modest-wear / hijab brands → `abaya` (the modest-wear umbrella)
- **The Hijab Company · Abaya.pk · The Ummatis · Hijab-ul-Hareem · Hijabi.pk · Hijab & Co** — items sitting in apparel suit cats → `abaya` (they sell hijabs/scarves, not 3pc lawn suits). ⚠️ **OPEN: Danish to confirm `abaya` vs a dedicated hijab cat vs `dupatta_only`.**

### Kids brands
- **Minnie Minors** — pure kids brand; lehenga/choli/top sets in `dupatta_only` → `kids_girls_eastern`.
- **Engine** — WESTERN kids brand; jersey Top/Tee/Crew/Vest/Jegging in kids eastern → kids western.
- **Alizeh** — festive EASTERN girls' brand; its kids-western items are embroidered eastern → kids eastern.
- **Kross Kulture** — "MOM" adult-sized lawn suits in a kids cat → women's eastern. (NB: its "2PC Girl" embroidered line IS genuine kids — child models — leave it.)

### Other notable single-brand calls
- **Zainab Chottani** — "Capri" = a velvet KAFTAN line (not a capri bottom) → `kaftan`.
- **Ammara Khan** — `D-…` slugged designer gowns mis-filed as 1pc kurti → `heavy_formal_3pc`.
- **SHAAL** — luxury shawl brand; men's shawls → `mens_unstitched` (no mens_shawl cat), women's/unisex → `shawl`.
- **Akbar Aslam** — women's festive **EASTERN** brand; its "named" (Marigold/Ivoire/Tesa/Aven…) kameez+shalwar(+dupatta) sets mis-filed as western co-ords → `shirt_trouser_2pc` (eastern 2pc; image-confirmed desi sets, not western co-ords).
- **Khaadi (SFCC dual-form)** — sells the SAME design in TWO forms under TWO urls: `/fabrics-*/CODE` = **UNSTITCHED fabric** (cheaper) and `/…-tailored-*/T-CODE` = **STITCHED**. The harvest mislabels the fabric form as stitched (pret_3pc, fake XS-XL); the `/fabrics-*` (no "tailored") rows are routed to their unstitched sibling (`pret_3pc`→`lawn_3pc_unstitch`, `shirt_dupatta_2pc`→`shirt_dupatta_2pc_unstitch`, …) with size `Unstitched`, so **each form shows in its own facet**. Tailored (`T-`) rows stay stitched. The order-form paste offers BOTH forms via a Stitched|Unstitched toggle (see [[dual-stitched-unstitched]]).

---

### Screenshot-driven corrections (2026-06-25)
- **"Sandal" / "Sandali" / "Sandalwood" are COLLECTION/colour names, not shoes.** Maria Osama Khan "Sandal",
  Zara Shahjahan / Zarif "Sandali", Gulaal "Sandalwood Bloom" are unstitched/stitched SUITS that the shoe-word
  filter grabbed into `footwear`. A real sandal carries numeric shoe sizes (36-43); these carry
  **Unstitched / S-M-L apparel sizes** → routed to the apparel cat. ETHNC "SANDAL" (sz 36-41) stays footwear.
  (The general FOOT→footwear mover is also guarded so it can't pull them back — was oscillating.)
- **Kids gender by explicit title (boys ↔ girls WITHIN kids).** The explicit-gender corrector only fixes
  cross-DEPARTMENT (k/w/m), so an explicit "Boys …"/"Girls …" item could sit in the wrong kids gender. A
  `\bboys\b`-titled item in `kids_girls_*` → `kids_boys_*` (and vice versa), keeping the eastern/western/formal
  suffix (Almirah "Boys Kameez Shalwar", Engine "Boys Suit" — ~149 items moved). Titles with BOTH words are left.
- **Kurta Corner** is a men's/boys kurta brand (no girls line) — its genderless "Kids … Suit" defaulted to
  `kids_girls_eastern`; image-confirmed BOYS in kurta-shalwar → `kids_boys_eastern`.
- **Cougar sleeveless tops/dresses/peplums** in `kids_girls_eastern` = WESTERN girls → `kids_girls_western`
  (guard a Beechtree "Sleeveless ETHNIC Embroidered SUIT", which stays eastern).
- **Eastern boys = kurta/shalwar.** Verified via product image that Saya "Wash N Wear 2 Piece (Shirt/Trouser)
  For Boys" is a boy in **kameez + shalwar** (eastern) — those stay in `kids_boys_eastern`, NOT moved. Only the
  Minnie Minors "**Under Vest(s) (Pack Of 2)**" (innerwear) is dropped (we don't list undergarments).
- **Loungewear MUST carry a sleepwear qualifier** (`\bnight\b` as a word / `\bsleep\b` / lounge / pyjama /
  nighty / robe). Collection names with "night" as a SUBSTRING (Afrozeh "Nightlure"/"Candlenight"/"Serenight",
  Azure "Nightingale", Sadaf Fawad Khan "Nightfall") and a mistagged Black Camels "CO-ORD SET" are re-derived
  (fabric→unstitched, co-ord→`coord_western`, else pret). KEPT: Diners "Night Suit", Generation/Zeen
  "Loungewear", Lakhany "Sleep Wear". Loungewear 20 → 13 (real sleepwear only).

### New brand/rule corrections (2026-06-24 classifier pass)
- **Amir Adnan** — `jamawar/raw-silk "Jacket"` → `mens_waistcoat` (Rule 2.4). Its FINISHED couture is listed
  `sz:["Unstitched"]`, so it is exempt from the unstitched→fabric demotion and from `fwdCat` (its slug-rules
  place the runway pieces). "Talpuri Waistcoat … with Shawl" → `mens_waistcoat`; "Sherwani … paired with
  Shawl" → `mens_sherwani`.
- **CRUSH Menswear** — "Prince Coat with Same Pant" / "… Sherwani for Groom" sized Unstitched are finished
  couture → stay `mens_sherwani` (not demoted to fabric).
- **Arsalan Iqbal** — "Rawsilk/Velvet Sherwani with Shawl" mis-filed in `shawl` → `mens_sherwani` (it's a set).
- **Furor** — "Tracksuit Trousers" / "Co-ord Set Pants" mis-filed as `mens_shirt` → `mens_trouser`
  (a tracksuit TOP stays a shirt).
- **Maria B** — "3 Piece Markhor (Polo) Wool Suit": "(Polo)" is a style name, not a polo shirt → stays
  `mens_shalwar_kameez`.
- **Salitex** — "1PC Stitched … (Khaddar Dress/Suit)" is a 1-piece shirt → pinned `kurti_1pc`.
- **Kross Kulture** — "2PC/3PC Girl …" pinned to `kids_girls_*` (casual→eastern, formal→formal) to stop a
  flip. ⚠️ This is the still-OPEN kids-vs-women call (Open-Decision B) — flip the target in code if it's women's.
- **Edge Republic** — a kids "Prince Coat" is eastern formalwear → `kids_boys_eastern` (the word "coat" must
  not read western).
- **Men's standalone shawls** (SHAAL/Edge/Diners "Men's Shawl/Odhni") → `mens_unstitched` uniformly (no
  `mens_shawl` cat); **hijabs/niqabs/cashmere "Hijab Scarf" → `abaya`** (modest-wear umbrella, NOT `shawl`).

## Classification decision framework — the conflict-resolution overrides (2026-06-24)

*Distilled from Danish's expert-classifier prompt. This is the reasoning the code follows when the
title/URL/tags/sizes disagree. Our DB keys are RICHER than the prompt's (we split `shirt_dupatta_2pc`
vs `shirt_trouser_2pc`, have 7 kids categories, winter 2pc/3pc, etc.) so the prompt's keys map onto
ours, not the reverse. **All of these are live in `catalog-cleanup.js` + `harvest-catalog.js`.**

1. **Unstitched override** — `sz:["Unstitched"]` OR a title/tag of `unstitch / un-stitch / RTS /
   ready-to-stitch / raw fabric / greige` BEATS any "ready-to-wear / pret / stitched" hint. A stitched-cat
   item carrying that signal is forwarded to its unstitched sibling (`fwdCat`), piece-count preserved.
   *We do NOT treat the bare word "fabric" as unstitched* — too many brand names ("Dynasty Fabrics") and
   stitched descriptions contain it; the `sz` field is the reliable authority. (0 residue in the live catalog.)
2. **Gender disambiguation** — an item is pulled out of women's cats when it carries a MEN-specific
   signal (`men's/gents/mardana`, a male designer line, a men slug-code, or a men-only garment like
   kurta-pajama/sherwani/prince-coat/pathani). Slug-gender (Zellbury/Diners/Bonanza/One Kids/Maria-B-`mbm`)
   and explicit-title gender win whole-brand, not per-image. *The prompt's "4–4.5 m single fabric block →
   men's unstitched" heuristic is NOT coded — the live catalog has **no** meter-lengths in titles (3 total,
   all already-correct shawls), so there is nothing to act on; revisit only if a brand starts listing metres.*
3. **Western vs eastern men's "Suit"** — `pant-coat / blazer / tuxedo / 2-3-piece suit / slim-fit /
   poly-viscose / double-breasted` with NO shalwar/kameez/kurta/sherwani/pajama word → `mens_suit`
   (Monark, Uniworth, Edge Republic, Amir Adnan "PV Slim Fit Suit", Charcoal). Otherwise an eastern
   designer's "Suit" = a kameez-shalwar set → `mens_shalwar_kameez`. Eastern "Shalwar Suit"/"Kurta With
   Pants" is guarded IN (stays shalwar-kameez).
4. **Jacket vs waistcoat (RULE 2.4, new 2026-06-24)** — a MEN'S "Jacket" in a luxury eastern weave
   (`jamawar / raw-silk / banarasi / katan`) = a sleeveless band-collar VEST → **`mens_waistcoat`**. This
   resolves the long-open "Amir Adnan Jamawar 'Jacket' = waistcoat or kurta?" question → waistcoat (a kurta
   is a long tunic; this outerwear isn't one). Scoped to men's cats (women's bridal/winter "Raw Silk Jacket"
   sets are untouched); excludes western `bomber/blazer` (→ stays/`mens_suit`), `sherwani/prince` coats, and
   jacket+pant SETS. ~23 Amir Adnan items moved kurta→waistcoat.
5. **Kids vs women's pret** — a `kids/toddler/teen/infant` token (anchored — leading token or explicit
   `(kids)`/"for kids"), age sizes (`2-3Y`, `9/12-M`), or a kids slug/SKU routes to the right `kids_*`
   category even inside an adult feed. Adult letter-sizes (XS–XXL) on a "2 Pc Suit" sitting in a kids cat
   send it back to women. (Sha Posh sizes 36–40 are OLDER KIDS, not adults — see below.)

### Brand-terminology translation (Level 3)
- **Khaadi / Sapphire:** "Ready to Wear" → `pret_*`; "Unstitched" → `lawn_3pc_unstitch` / `unstitch_3pc_emb`.
  Khaadi sells the SAME design as `/fabrics-*` (unstitched) AND `/…tailored/T-*` (stitched) → split per form.
- **Silayi Pret / Lulusar / Ammara Khan / Mina Hasan / Saira Rizwan:** "Kaftan" collection → `kaftan` (forced).
- **Ethnic by Outfitters (ETHNC):** `western-…` slug tops → `western_top`; standalone "Skirt" → `womens_trouser`.
- **J. Junaid Jamshed:** "Kurta" → check section — men's collection → `mens_kurta`; a women's kurti → `kurti_1pc`.

## Idempotency / convergence — cleanup MUST reach a fixed point (2026-06-24, big fix)

`catalog-cleanup.js` runs at **every** harvest and every VPS `search.db` rebuild (~3h). It must be a
**fixed-point function**: `cleanup(cleanup(X)) == cleanup(X)`. It was not — **503 products oscillated
between two categories on every pass** (e.g. a SHAAL hijab flipped `abaya ⇄ shawl`, an Amir Adnan
open-front sherwani flipped `mens_sherwani ⇄ mens_unstitched`), so ~500 items' live categories changed
every few hours by parity. **This was the single biggest cause of "wrong category products."**

Root cause: pairs of rules that undo each other across passes (rule A: X→Y with `continue`; next pass
rule B: Y→X). Fixed by making each pair converge on the **documented intent**, almost always by adding a
guard to the rule that grabbed a SET as if it were a standalone piece:
- A standalone shawl/stole/pashmina/**odhni** now routes through ONE canonical rule (men's → `mens_unstitched`
  per the no-`mens_shawl`-cat precedent; women's → `shawl`; hijabs are NOT shawls → fall to `abaya`).
- A "Sherwani/Waistcoat **… with/paired with** Shawl" is a SET → its sherwani/waistcoat cat, not `shawl`.
- **Amir Adnan lists FINISHED made-to-measure couture as `sz:["Unstitched"]`** — so `sz=Unstitched` is NOT
  a fabric signal for it; its stitched-cat items are never demoted to `mens_unstitched`/forwarded by `fwdCat`.
- A finished sherwani / prince-coat / open-front / "…for Groom" (sz=Unstitched) stays in its sherwani cat.
- The Sha-Posh "size ≥ 36 = adult" rule was DELETED — it contradicted the photo-verified "36–40 = older kids".
- Guard fixes: `[23] ?pc` → `[23][\s-]?pc` (matched "3-pc" hyphen); tights/leggings/culottes are bottoms;
  bare "denim" is a colour not a bottom; "(Polo)" inside a "3-Piece … Suit" is a style name not a polo shirt.

**Result: 503 → 0 true oscillations; the pipeline reaches a stable fixed point in 2 passes.** As a belt-and-
suspenders guarantee, the harvester now re-runs cleanup until a pass changes nothing before writing
`catalog.json`. **Always run the idempotency check (`_cat_audit/`) after adding any rule** — a new rule that
moves X→Y must not be undone by an existing rule.

## Open / held decisions (need Danish)
*(Grouped from the historical 61 "Confusions". Many are now RESOLVED in code — see the note at the end — these are the ones still genuinely open. Per-brand specifics: `BRAND-AUDIT-FINDINGS.md`.)*

**A. Hijab / modest-wear routing** — should hijabs/scarves sit in `abaya` (current, ~581 items), a dedicated hijab cat, or `dupatta_only`? Affects The Hijab Company, The Ummatis, The Women Zone, Hijabi.pk, Abaya.pk, KEF, Paarsa, Hijab-ul-Hareem. Also: "Kids Namaz Chadar" (The Ummatis) → kids or abaya?

**B. Genderless "Suit" cells — kids vs women** (title has no age/gender marker):
- **Sapphire** ~237 "Cotton/Dobby/Pima Suit" in men's cats — men's or women's mistagged?
- **Wear Ochre** 478 "Lawn 2/3 Pc Suit" in kids_girls_eastern — kids or women's?
- **Limelight** "2 Piece … Suit (Pret)" split kids/women — its own pret line or kids?
- **Maria B** plain "Kurta"/"2 Piece Blended Suit" — M-Kids line or women's?
- **Asim Jofa** `AJKL` "Stitched 2 Pcs/1 Pc" — kids or women's 2pc?
- **Saya** "For Kids" lawn 2pc with no boy/girl marker — default to girls or boys?
- **Kross Kulture** unprefixed "2PC/3PC Embroidered Suit" — women's pret or kids? *(Provisionally PINNED to
  `kids_girls_*` 2026-06-24 to stop an oscillation — "Girl" in title + documented "child models" note. Flip
  the pin in code if it's women's.)*
- **Tassels** "Mother & Daughter" sets — women's pret, kids, or split?

**C. Stitched-vs-unstitched** (title says only "Suit/Fabric/Kameez Shalwar") — fabric or finished?: **Shahzeb Saeed** (SF- two-piece suits), **Arsalan Iqbal** (IronEz kurta sets), **Almirah** (KS/KT kameez-shalwar), **Diners** (Wash&Wear Shalwar Kameez), **Ismail Farid** (crush-fabric kurta pajama), **Cambridge** (Basic Shalwar Kameez Suit), **Sania Maskatiya** (coded Cala/Lulu), **Iznik** (UE-/IP-/CC- codes).

**D. Missing taxonomy keys** (currently bucketed pragmatically — confirm or add a key):
- **4-piece** suits (Roheenaz "Four Piece", Sitara "4PC", Sha Posh "4PC").
- **Men's outerwear / jacket** (CRUSH waterproof puffer). *(RESOLVED 2026-06-24: Amir Adnan jamawar/raw-silk
  "Jacket" → `mens_waistcoat` per Rule 2.4 — see the framework section.)*
- **Western coats / kimono** (KEF "Jamawar Coat", "Kimono"; Jeem "Jacket").
- **Unstitched kaftan / blouse-skirt** (Threads & Motifs).
- **Jubba / Thobe** (J. Junaid Jamshed) — keep `mens_kurta` or separate?
- **3-piece men's eastern set** (Kurta Corner "Designer Set (3 Piece)", Royal Tag "Three-Piece Suit" — `mens_shalwar_kameez` vs `mens_suit`).
- **Men's activewear / tracksuit** (ChenOne "Jogging Suit", Furor tracksuits) — currently `mens_shirt`.

**E. Add-on / component variants** — **Sadaf Fawad Khan** "[+Rs …]" Pants/Sleeves/Dupatta/Potli: catalogue as standalone products, or hide as order add-ons? (The bracketed `[+Rs` ones are already deleted by NONAPPAREL.)

**F. Eastern-vs-western "Suit"** (Amir Adnan "Embroidered Suit" — eastern kameez-shalwar vs western pant-coat; Royal Tag "Three-Piece Suit").

> **Resolved since the first audit** (no longer open): hijab-brand suits → `abaya`; Salitex/Lakhany unstitched bottoms → `womens_trouser`; Sha Posh kids → `kids_girls_*`; Sana Safinaz/Alkaram "Shirt + Culotte" → `shirt_trouser_2pc`; Al-Deebaj/Azure men's lines → men's; Monark/Uniworth/Edge western suits → `mens_suit`; cosmetics/jewelry/men's-shoes → deleted.
