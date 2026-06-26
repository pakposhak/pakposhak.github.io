# Classify a Pakistani fashion product photo into ONE PakPoshak category

You are looking at ONE product photo and must pick the single best category KEY below.
Catalogue is mostly women's Pakistani wear. Use the photo as the deciding signal.

## How to tell the big ones apart
- **Unstitched** = fabric shown as flat folded cloth / loose pieces, NOT worn on a model. Lawn/cotton 3-piece fabric → `lawn_3pc_unstitch`; if heavily embroidered fabric → `unstitch_3pc_emb`.
- **Stitched suit** = a finished outfit (worn on a model or shown as a sewn 3-piece). Plain/printed → `pret_3pc`; everyday embroidered → `pret_3pc_emb`; party/heavy embroidery, chiffon/net/organza, festive → `formal_emb_3pc`; very heavy bridal-adjacent (tissue/jamawar/velvet, wedding-guest, mehndi/barat) → `heavy_formal_3pc`.
- **2-piece** (shirt+dupatta only, no trouser) → `shirt_dupatta_2pc` (stitched) / `shirt_dupatta_2pc_unstitch`.
- **Co-ord / shirt+trouser 2pc** → `shirt_trouser_2pc` (stitched) / `shirt_trouser_2pc_unstitch`.
- **Single kurti / shirt / top** (one piece, stitched) → `kurti_1pc`; unstitched single → `kurti_1pc_unstitch`.
- **Winter** fabric/suit (khaddar, karandi, velvet, wool, marina) → `winter_3pc_stitch` / `winter_3pc_unstitch` / `winter_2pc_stitch` / `winter_2pc_unstitch`.

## Full category keys
KIDS: kids_infant (baby 0-2y), kids_boys_eastern, kids_boys_western, kids_boys_formal, kids_girls_eastern, kids_girls_western, kids_girls_formal
WOMEN: abaya (abaya/hijab/niqab), bridal (bridal/dulhan), heavy_formal_3pc, formal_emb_3pc, formal_emb_2pc, handmade_emb, pret_3pc_emb, pret_3pc, pret_2pc_emb, shirt_dupatta_2pc, shirt_trouser_2pc, kurti_1pc, western_top (tee/tank/blouse/hoodie), maxi_dress (western dress/maxi/gown/jumpsuit), kaftan, lehenga (lehenga/gharara/sharara), saree, coord_western, loungewear (nightwear/pajama), lawn_3pc_unstitch, unstitch_3pc_emb, shirt_dupatta_2pc_unstitch, shirt_trouser_2pc_unstitch, kurti_1pc_unstitch, winter_3pc_stitch, winter_3pc_unstitch, winter_2pc_stitch, winter_2pc_unstitch, dupatta_only (dupatta/stole/scarf), shawl (shawl/pashmina/chadar), womens_trouser (trousers/pants/jeans/skirt/bottoms), footwear (khussa/shoes)
MEN: mens_kurta, mens_shalwar_kameez, mens_sherwani (sherwani/prince coat), mens_waistcoat, mens_suit (suit/blazer/coat-pant), mens_shirt (shirt/t-shirt/polo/hoodie = any men top), mens_trouser (trousers/jeans/pants/pyjama = any men bottom), mens_jeans, mens_unstitched

## If unsure
If the photo won't load or you genuinely cannot tell, put that entry's category as `"UNSURE"`.
Default a plain stitched women's 3-piece to `pret_3pc` only when you can see it's stitched but nothing else stands out.
