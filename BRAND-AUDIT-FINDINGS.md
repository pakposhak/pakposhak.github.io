# Brand Audit — Findings

> ⚠️ **HISTORICAL (first-pass proposals).** Most "move/delete" rows below are now **resolved and live in `catalog-cleanup.js`**. For the CURRENT per-brand · per-category rules, read **`BRAND-CATEGORY-GUIDELINES.md`**. The still-useful part of this file is the **"Confusions"** section (open owner-decision questions).

274 findings, 61 confusions.

## Moves & deletes

| Brand | From | Action | To | Kind | Conf | Example |
|---|---|---|---|---|---|---|
| Sapphire | mens_shalwar_kameez | ask |  | wrong-gender | med | Premium Cotton Dobby Suit |
| Sapphire | mens_unstitched | ask |  | wrong-gender | med | Premium Ghiza Cotton Suit |
| Sapphire | winter_3pc_stitch | move | kurti_1pc | wrong-piece | med | Printed Light Khaddar Shirt |
| Sapphire | heavy_formal_3pc | move | pret_2pc_emb | wrong-piece | med | 2 Piece - Embroidered Organza Suit |
| ETHNC | pret_3pc | move | womens_trouser | wrong-piece | high | SHALWAR (E8332/102/902) |
| ETHNC | winter_3pc_stitch | delete |  | innerwear | high | BASIC BRIEFS (E0212/111/998) |
| ETHNC | kids_boys_eastern | ask |  | wrong-piece | low | WAISTCOAT (E1472/401/005) |
| Bonanza Satrangi | mens_trouser | move | mens_shalwar_kameez | wrong-piece | high | O-White-Blended-Kurta Trouser (MP2PSBS26 |
| Bonanza Satrangi | mens_shirt | move | winter_3pc_stitch | wrong-gender | high | N-Blue-Jacquard-3 Piece (WP3PSBW25B1J22) |
| Bonanza Satrangi | loungewear | move | lawn_3pc_unstitch | wrong-type | med | Night Garden - 3 Pc (WU3PPBS26LI2M124) |
| Khas Stores | mens_unstitched | delete |  | accessory | high | Polo-Themed Ceramic Jar — Blue |
| Khas Stores | kids_girls_eastern | ask |  | wrong-gender | low | Kid 2-Piece Stitched Printed Lawn Shirt  |
| Breakout | pret_3pc | move | mens_jeans | wrong-gender | high | STRAIGHT FIT DENIM |
| Breakout | mens_kurta | move | mens_shirt | wrong-type | high | TEXTURED HENLEY |
| Breakout | formal_emb_3pc | move | mens_suit | wrong-gender | high | PINSTRIPED FORMAL VEST |
| Breakout | kids_girls_eastern | move | kids_girls_western | wrong-type | high | GIRLS JACQUARD STRIPED LOOSE TROUSERS |
| Wear Ochre | kids_girls_western | move | maxi_dress | wrong-gender | high | Women's Georgette Printed Dress |
| Wear Ochre | kids_girls_eastern | ask |  | wrong-gender | low | Cotton Lawn Digital Printed 2 Pc Suit |
| Shahzeb Saeed | mens_kurta | move | mens_shirt | wrong-type | high | Men's Cotton Vest-015 |
| Shahzeb Saeed | mens_unstitched | ask |  | stitched-vs-unstitched | low | Black Two Piece Suit (SF-162) |
| Arsalan Iqbal | mens_trouser | move | mens_shalwar_kameez | wrong-piece | med | Off-White Kurta and Drawstring Trousers  |
| Arsalan Iqbal | mens_unstitched | ask |  | stitched-vs-unstitched | low | Basic Ivory IronEz Fabric White Kurta an |
| Dynasty Fabrics | mens_trouser | move | mens_shalwar_kameez | wrong-piece | high | Embroidered Kurta Trouser |
| Dynasty Fabrics | mens_unstitched | delete |  | accessory | med | Alpine & Oud Monarque Gift Box |
| Dynasty Fabrics | kids_infant | ask |  | wrong-type | low | Egyptian Delight EDDY-3 |
| Paarsa | dupatta_only | move | abaya | headwear | med | Niqab Hijab Set – Mint II |
| Hijab-ul-Hareem | dupatta_only | delete |  | accessory | high | Hijab Crown Grip Rubber |
| Hijab-ul-Hareem | lawn_3pc_unstitch | delete |  | accessory | high | Mini Zamzam Cooler / 2L |
| Hijab-ul-Hareem | abaya | ask |  | headwear | low | Two Layer Face Cover (Naqab) |
| Hijab-ul-Hareem | kids_girls_eastern | move | abaya | wrong-type | med | Chocolate Brown Front Open Nida Abaya |
| Hijab-ul-Hareem | unstitch_3pc_emb | ask |  | wrong-gender | med | Men’s Ahram / Premium Tissue |
| Dhanak | lawn_3pc_unstitch | ask |  | wrong-piece | low | DU-3066 BLACK KHADDI-NET 4PCS |
| Edenrobe | unstitch_3pc_emb | move | lawn_3pc_unstitch | wrong-type | med | Printed Zari Lawn Suit - EWU6M6-097-3P |
| Edenrobe | winter_2pc_unstitch | ask |  | wrong-piece | med | Printed Khaddar Shirt Dupatta - EWU24A3- |
| Edenrobe | coord_western | ask |  | wrong-type | low | Embroidered Cambric Co-Ord Set - EWTKED6 |
| Edenrobe | kids_girls_western | ask |  | wrong-gender | low | Graphic Tee - EGTK24-011 |
| Edenrobe | mens_kurta | move | mens_trouser | wrong-type | high | Formal Pants - EMBPC6-15330 |
| Edenrobe | mens_suit | move | mens_shirt | wrong-piece | med | Front Pleated Tuxedo Shirt - ECMTST6-100 |
| Edenrobe | mens_unstitched | delete |  | wrong-type | high | Bow Tie - EAMBT6-007 |
| Edenrobe | shawl | keep |  | wrong-type | high | Pashmina Jacquard Zari Shawl - EAWS5-006 |
| Maria B | unstitch_3pc_emb | move | kurti_1pc_unstitch | wrong-piece | high | Embroidered Net Fabric (1Pc) |
| Maria B | kids_girls_eastern | ask |  | wrong-gender | low | 2 Piece Blended Suit |
| Maria B | kids_boys_eastern | ask |  | wrong-gender | low | Embroidered Blended Kurta |
| Maria B | kurti_1pc | ask |  | wrong-type | low | Embroidered Blended Kurta |
| Asim Jofa | lawn_3pc_unstitch | move | unstitch_3pc_emb | wrong-type | low | AJCN-05 UNSTITCHED Signature Embroidered |
| Asim Jofa | pret_2pc_emb | move | pret_3pc | wrong-type | high | AJPB-292 Printed Lawn Stitched 2pcs |
| Asim Jofa | kids_girls_eastern | ask |  | wrong-gender | low | AJKL-11 Lurex Jacquard Stitched 2 Pcs |
| Asim Jofa | shirt_dupatta_2pc | ask |  | ok | low | AJMRW-28 Premium Blended Stitched 2PC |
| Asim Jofa | pret_3pc | move | kurti_1pc | wrong-piece | med | AJMRW-34 Premium Blended Stitched 1PC |
| MTJ (Tariq Jameel) | mens_unstitched | delete |  | wrong-type | high | MUSK BEARD OIL |
| MTJ (Tariq Jameel) | mens_waistcoat | move | mens_shalwar_kameez | wrong-piece | med | OFF-WHITE KURTA PAJAMA WITH EMBROIDERED  |
| MTJ (Tariq Jameel) | winter_3pc_stitch | move | kurti_1pc | wrong-piece | high | PRINTED CAMBIRC KURTI 1 PIECE |
| MTJ (Tariq Jameel) | kids_girls_eastern | move | mens_trouser | wrong-type | med | WHITE 100%COTTON PAJAMA |
| MTJ (Tariq Jameel) | mens_kurta | keep |  | keep | high | NAVY 100% COTTON EMBROIDERED KURTA |
| Edge Republic | mens_unstitched | move | mens_shalwar_kameez | wrong-type | high | FS 20 Black Kameez Shalwar For Father &  |
| Edge Republic | mens_sherwani | move | mens_shalwar_kameez | wrong-type | med | KAMEEZ SHALWAR |
| Edge Republic | mens_trouser | move | mens_shalwar_kameez | wrong-piece | med | MR 78 White And Green Chanderi Kurta Wit |
| Almirah | mens_unstitched | move | mens_shalwar_kameez | wrong-type | med | White Cotton Kameez Shalwar - ALBQ-KS-00 |
| Almirah | kids_girls_eastern | ask |  | wrong-gender | low | Yellow Swill Foil Formal 3Pc Stitched -  |
| Almirah | footwear | keep |  | footwear | high | Black Kolhapuri Chappal - AL-MFW-KC-169 |
| Almirah | womens_trouser | keep |  | keep | high | Black Cambric Casual Trousers - AL-T-806 |
| Almirah | lawn_3pc_unstitch | move | shirt_dupatta_2pc | wrong-piece | low | ALP-2PS-LKS-1582 |
| CRUSH Menswear | mens_unstitched | move | mens_suit | wrong-type | med | Men In Black Edition – 2pc Bespoke Tuxed |
| CRUSH Menswear | mens_unstitched | move | shawl | wrong-type | med | Woolen Shawl |
| CRUSH Menswear | mens_sherwani | move | mens_shalwar_kameez | wrong-type | med | KAMEEZ SHALWAR |
| CRUSH Menswear | mens_kurta | delete |  | wrong-type | med | Men’s Premium Waterproof Puffer Jacket G |
| CRUSH Menswear | mens_trouser | move | mens_shalwar_kameez | wrong-piece | med | Loop Button Patti Design Kurta Trouser |
| The Hijab Company | lawn_3pc_unstitch | move | dupatta_only | wrong-type | high | Luxe Jersey Hijabs - Mud Brown |
| The Hijab Company | abaya | keep |  | keep | high | Hive Pearl Abaya - Black |
| The Hijab Company | winter_3pc_unstitch | move | shawl | wrong-type | high | Plain Cashmere Scarves - Ash Grey |
| The Hijab Company | loungewear | move | dupatta_only | wrong-type | high | Starry Night Hijabs - Olive |
| The Hijab Company | formal_emb_3pc | move | womens_trouser | wrong-type | med | Formal Pant with Belt - Denim |
| Zaha by Elan | kurti_1pc_unstitch | keep |  | keep | med | ROSY CHEEKS (ZLF-21492)-SHIRT |
| Vanya | kids_girls_eastern | ask |  | wrong-gender | low | ME-34 |
| Vanya | coord_western | ask |  | ask | low | CO-34R |
| Innerlines | mens_kurta | move | mens_trouser | wrong-type | high | Linen Pants - GCP-006 |
| Innerlines | mens_shalwar_kameez | keep |  | keep | high | Men's Kurta Shalwar - 1913 |
| Innerlines | mens_waistcoat | move | mens_shalwar_kameez | wrong-piece | med | Men's Kurta Shalwar with Waistcoat - 191 |
| Gulaal | footwear | ask |  | wrong-type | low | Sandalwood Bloom |
| Gulaal | loungewear | ask |  | ask | low | Midnight Fern |
| Barae Khanom | womens_trouser | keep |  | keep | high | Afra Matching Printed Pants |
| Ammara Khan | kurti_1pc | ask |  | wrong-piece | low | Lacy Peach Kurta Set (D-16) |
| Ammara Khan | womens_trouser | ask |  | wrong-piece | low | Sweet Pea Kalidar Crushed Pants Set (D-0 |
| Roheenaz | lawn_3pc_unstitch | ask |  | wrong-piece | med | Sawariya - 10 / Four Piece Unstitch |
| Diners | mens_jeans | ask |  | wrong-type | med | Dark Blue Jeans |
| Diners | mens_unstitched | ask |  | wrong-piece | med | OffWhite Wash Wear Shalwar Kameez |
| Diners | formal_emb_3pc | move | mens_shirt | wrong-gender | high | Formal Autograph Shirt |
| Diners | mens_kurta | delete |  | headwear | med | White Caps For Men |
| Diners | winter_3pc_stitch | move | womens_trouser | wrong-piece | med | Blue Trouser |
| Diners | shirt_trouser_2pc | move | mens_shalwar_kameez | wrong-gender | med | White Cotton Shalwar Kameez |
| Khaadi | pret_3pc | ask | womens_trouser | wrong-piece | high | Solid Yellow Shalwar |
| Khaadi | shirt_trouser_2pc | ask | coord_western | wrong-type | low | 2 Piece Co Ords Set |
| Zellbury | kids_boys_eastern | ask |  | wrong-gender | low | Kurta - 1777 |
| Zellbury | shirt_trouser_2pc | ask |  | wrong-gender | low | Kurta Trouser - 2344 |
| Zellbury | mens_kurta | delete |  | innerwear | high | Pack of 3 Boxer - E008 |
| Zellbury | formal_emb_3pc | move | mens_shirt | wrong-gender | med | Formal Shirt - 5128 |
| Zellbury | shawl | move | pret_3pc_emb | wrong-piece | high | Embroidered Kurta Shawl Trouser - 2532 |
| Zellbury | kids_boys_western | ask |  | wrong-gender | low | Denim - 4001 |
| Beechtree | kids_boys_eastern | ask | kids_girls_eastern | wrong-gender | low | BASIC SHALWAR |
| Beechtree | pret_3pc | ask | womens_trouser | wrong-piece | high | EMBROIDERED SHALWAR |
| Beechtree | kids_boys_western | ask |  | wrong-gender | low | BASIC TROUSER |
| Beechtree | kids_girls_formal | ask | kids_girls_eastern | wrong-type | low | 2 PIECE BUTTON DOWN EMBROIDERED SUIT |
| Beechtree | winter_3pc_stitch | move | winter_2pc_stitch | wrong-piece | low | EMBROIDERED KHADDAR SHIRT (LUXURY PRET) |
| Beechtree | heavy_formal_3pc | move | formal_emb_2pc | wrong-piece | low | 2 PIECE EMBROIDERED TISSUE SUIT (LUXURY  |
| KEF | dupatta_only | ask | abaya | headwear | med | Soft Crumpled Lawn Hijab - Lavender |
| KEF | pret_3pc | move | kaftan | wrong-type | med | Dusky Bloom Kimono |
| KEF | heavy_formal_3pc | ask |  | wrong-type | low | Pure Atlas Jamawar Coat |
| KEF | unstitch_3pc_emb | ask | maxi_dress | wrong-type | low | Ivory Pure Soft Satin Lama Tissue Dress |
| KEF | kurti_1pc_unstitch | ask | coord_western | wrong-type | low | FOND VERT TOP WITH SKIRT |
| KEF | lehenga | ask |  | wrong-piece | low | FOND JUANE DRESS WITH CHIFFON LEHENGA |
| Gul Ahmed | lawn_3pc_unstitch | ask |  | wrong-type | high | Blossom Glow Table Runner |
| Gul Ahmed | winter_3pc_unstitch | ask | kurti_1pc_unstitch | wrong-type | high | AW23-Splash Blue Placemat and Runner Set |
| Gul Ahmed | pret_3pc | move | mens_jeans | wrong-type | high | Denim |
| Gul Ahmed | maxi_dress | move | mens_shirt | wrong-gender | high | Modern Fit Dress Shirts |
| Gul Ahmed | womens_trouser | ask | mens_trouser | wrong-gender | med | Dark Olive Khaki Pant MNTRCSS24022A |
| Gul Ahmed | kurti_1pc_unstitch | ask |  | wrong-piece | med | 1 Piece Unstitched Printed Lawn Shirt |
| Gul Ahmed | formal_emb_3pc | move | mens_shirt | wrong-gender | med | Ocean Yarn Dyed Formal Shirt |
| Gul Ahmed | winter_3pc_stitch | move | mens_jeans | wrong-type | high | Blue Basic Jeans |
| Mohagni | heavy_formal_3pc | move | kurti_1pc | wrong-piece | med | LEB-22-19 EMBOSS ORGANZA EMBROIDERED KUR |
| Nishat Linen | western_top | ask |  | innerwear | med | Beige Camisole-440490118 |
| Nishat Linen | pret_3pc | move | womens_trouser | wrong-piece | high | Basic Waistcoat - NQ26-029 |
| Black Camels | kids_girls_eastern | ask | abaya | wrong-type | med | KIDS ABAYA - ICE BLUE (KIDS) |
| Black Camels | pret_3pc | move | coord_western | wrong-type | med | ACTIVE SET - GREY |
| Black Camels | loungewear | ask | coord_western | wrong-type | low | CO-ORD SET - MIDNIGHT BLUE |
| Black Camels | lawn_3pc_unstitch | delete |  | accessory | high | GIFT BOX |
| Zeen (by Cambridge) | winter_3pc_stitch | ask |  | wrong-type | high | PRINTED JACKET |
| Agha Noor | lawn_3pc_unstitch | ask |  | accessory | med | Diamante By Soeurs Blue And Brown Leave  |
| Agha Noor | kurti_1pc_unstitch | move | dupatta_only | wrong-type | high | PURE PIMA LAWN DIGITAL PRINTED DUPATTA D |
| Agha Noor | winter_3pc_unstitch | move | dupatta_only | wrong-type | high | PURE MARINA DUPATTA D000202 |
| Eminent | lawn_3pc_unstitch | delete |  | accessory | high | Argan Oil Conditioner 300ml |
| Eminent | mens_shalwar_kameez | delete |  | innerwear | high | Men's Seamless Boxers 2pc |
| Eminent | mens_kurta | move | mens_trouser | wrong-type | med | Men's Co-Ords Short |
| Eminent | formal_emb_3pc | move | womens_trouser | wrong-piece | high | Women's Formal Pants |
| Eminent | pret_3pc | move | pret_2pc_emb | wrong-piece | high | Women's Embroidered 02 Pcs Shalwar Suits |
| Eminent | pret_3pc_emb | move | pret_2pc_emb | wrong-piece | high | Women's Embroidered 02 Pcs Suit |
| Eminent | kurti_1pc_unstitch | move | womens_trouser | wrong-type | high | Women's Culottes |
| Eminent | winter_3pc_unstitch | delete |  | accessory | high | Velvet Glow Lip & Cheek Tint |
| Eminent | shirt_trouser_2pc | ask |  | wrong-piece | low | Women's Printed Crepe 2 Pcs Suit |
| Eminent | shirt_dupatta_2pc | ask |  | wrong-piece | low | Women's Printed Arabic Lawn 2 Pcs Suit |
| Eminent | kids_boys_eastern | ask |  | wrong-type | low | Boys' Plain Waist Coat |
| Eminent | mens_kurta | delete |  | innerwear | high | Men's Vest |
| Uniworth | mens_unstitched | move | mens_suit | wrong-type | high | Navy Plain Smart Fit Coat |
| Uniworth | mens_kurta | move | mens_trouser | wrong-type | med | Khaki Texture Gym Shorts |
| Sania Maskatiya | lawn_3pc_unstitch | ask |  | stitched-vs-unstitched | low | Cala (B) |
| SHAAL | lawn_3pc_unstitch | move | shawl | wrong-type | high | Teal Rosegold Stars Cutwork Fancy Self E |
| SHAAL | loungewear | move | shawl | wrong-type | high | Midnight Blue Squares Border Korean Shaa |
| SHAAL | bridal | move | shawl | wrong-type | med | Salmon Pink Gold Floral Sequence Bridal  |
| Generation | winter_3pc_stitch | ask |  | wrong-piece | low | Hand-Crafted Top |
| Iznik Fashions | pret_3pc | ask |  | stitched-vs-unstitched | low | UE-529 Printed Lawn |
| Humayun Alamgir | mens_kurta | move | mens_shalwar_kameez | wrong-type | med | WHITE LINEN CORD SET |
| Humayun Alamgir | mens_kurta | delete |  | accessory | med | Premium black crocodile-embossed leather |
| Humayun Alamgir | mens_unstitched | move | mens_shalwar_kameez | wrong-type | high | MINT GREEN WASH N WEAR KURTA FARSHI PAJA |
| Humayun Alamgir | mens_unstitched | move | shawl | wrong-type | high | Traditional Embroidered Shawl |
| Humayun Alamgir | mens_sherwani | ask |  | wrong-type | low | Emerald Green Embroidered Prince Suit |
| Naqshi | handmade_emb | ask |  | wrong-gender | low | Maahid |
| Naqshi | lawn_3pc_unstitch | ask |  | stitched-vs-unstitched | low | EPIC GREEN |
| Jeem | lawn_3pc_unstitch | delete |  | wrong-type | high | JEEM GIFT CARD -35 |
| Jeem | maxi_dress | ask |  | wrong-type | low | FUSCHIA ANAYA LEHNGA CHOLI |
| Alkaram Studio | mens_shalwar_kameez | ask |  | wrong-gender | med | RTW / KURTA & SHALWAR |
| Alkaram Studio | mens_kurta | move | western_top | wrong-type | med | RTW / JACKET |
| Alkaram Studio | pret_3pc | move | womens_trouser | wrong-piece | med | RTW / SHALWAR |
| Alkaram Studio | mens_trouser | ask |  | wrong-piece | low | RTW / KURTA & TROUSER |
| Alkaram Studio | shawl | ask |  | wrong-type | med | RTW / ABAYA & STOLE |
| Alkaram Studio | mens_shirt | move | western_top | wrong-type | low | RTW / SWEATSHIRT |
| Alkaram Studio | maxi_dress | move | kurti_1pc | wrong-type | low | RTW / DRESS SHIRT |
| Alkaram Studio | winter_3pc_stitch | ask |  | wrong-piece | low | RTW / SHIRT & CULOTTE |
| Sitara Studio | lawn_3pc_unstitch | delete |  | wrong-type | high | DIAMOND COMFORTER SET - 41 |
| Sadaf Fawad Khan | kurti_1pc_unstitch | ask |  | wrong-type | low | Korean Rawsilk Pants [+Rs. 15,340] |
| Sadaf Fawad Khan | kids_girls_eastern | ask |  | wrong-gender | low | Lyra |
| Sadaf Fawad Khan | lawn_3pc_unstitch | ask |  | wrong-type | med | Potli [+Rs 10,000] |
| Charizma | shawl | ask |  | wrong-piece | med | 3-PC Embroidered Staple Shirt with Stapl |
| Charizma | winter_3pc_stitch | ask |  | wrong-piece | low | 1-PC Printed Raw-Silk Shirt CPM-3-275 |
| Limelight | kids_girls_eastern | ask |  | wrong-gender | med | 2 Piece Lawn Slub Suit- Embroidered (Pre |
| Limelight | kids_girls_formal | ask |  | wrong-gender | med | 2 Piece Raw Silk Suit- Embroidered (Pret |
| Limelight | lawn_3pc_unstitch | delete |  | accessory | high | Hair Catcher |
| Limelight | kurti_1pc_unstitch | move | womens_trouser | wrong-type | med | Jersey Tights (Pret) |
| Limelight | pret_3pc | move | footwear | footwear | high | Denim Slip-Ons |
| Limelight | winter_3pc_stitch | move | womens_trouser | wrong-type | med | Grip Pants |
| Cross Stitch | womens_trouser | ask |  | wrong-type | low | FLORET 1 |
| Cross Stitch | shirt_dupatta_2pc | move | shirt_trouser_2pc | wrong-type | med | MISTY FLARE -2PC (SHIRT & TROUSER) |
| Cross Stitch | lawn_3pc_unstitch | ask |  | wrong-type | high | GET IT STITCHED |
| Ismail Farid | mens_kurta | move | mens_trouser | wrong-type | high | OFF-WHITE LINEN PANT |
| Ismail Farid | mens_unstitched | ask |  | stitched-vs-unstitched | med | WHITE CRUSH FABRIC CLASSIC KURTA PAJAMA |
| Ismail Farid | mens_jeans | move | mens_shirt | wrong-type | high | DENIM BLUE LINEN SHIRT |
| Engine | kids_girls_eastern | ask |  | wrong-type | low | Girls Check Top |
| Engine | kids_boys_eastern | ask |  | wrong-type | med | Boys Stars Printed Button Down |
| Engine | kids_infant | ask |  | wrong-type | low | Boys Short |
| Tifl | kids_girls_eastern | ask |  | wrong-type | low | Mini Blue Stripes Printed Loungewear |
| One Kids | kids_boys_eastern | ask |  | wrong-type | med | Gym Tank Top Black |
| One Kids | kids_girls_formal | ask |  | wrong-type | low | Party Tee |
| Minnie Minors | kids_girls_eastern | ask |  | wrong-type | med | Night suit (GNW-134) |
| Minnie Minors | kids_boys_eastern | ask |  | wrong-type | med | Athletic Pajamas (SW-PJ-073) |
| Royal Tag | mens_kurta | delete |  | accessory | high | Essential Pocket Square |
| Royal Tag | mens_unstitched | delete |  | accessory | high | Tie With Pocket Square TPS-160 |
| Royal Tag | mens_shalwar_kameez | ask |  | wrong-piece | med | Dark Brown Three-Piece Suit |
| Lakhany by LSM | kurti_1pc_unstitch | move | shirt_trouser_2pc_unstitch | wrong-piece | high | 02 Piece Unstitched Embroidered Lawn Shi |
| Lakhany by LSM | pret_3pc_emb | ask |  | wrong-piece | med | 02 Piece Stitched Embroidered Lawn |
| The Women Zone | dupatta_only | ask | abaya | headwear | med | Korean Chiffon Hijab - Real Maroon |
| Al-Deebaj | dupatta_only | move | abaya | wrong-type | med | Green Basic Abaya |
| Al-Deebaj | pret_3pc | delete |  | headwear | high | Classic Cairo Koofi |
| Al-Deebaj | loungewear | move | mens_shalwar_kameez | wrong-type | high | Black Plain Kurta Pajama / KP-039 |
| Al-Deebaj | shirt_trouser_2pc | move | mens_shalwar_kameez | wrong-gender | high | Skin Des Kurta Shalwar / KS-243 |
| Al-Deebaj | lawn_3pc_unstitch | delete |  | accessory | high | Aswad beard Oil |
| Al-Deebaj | coord_western | ask |  | wrong-gender | low | Printed Cotton Co-Ord Set / CS-001 |
| Al-Deebaj | pret_2pc_emb | move | mens_shalwar_kameez | wrong-gender | high | Brown Emb Kurta Shalwar / KS-201 |
| Al-Deebaj | kurti_1pc | move | mens_kurta | wrong-gender | med | Sage Grey Kurta / ADKR-026 |
| Al-Deebaj | formal_emb_3pc | move | mens_waistcoat | wrong-piece | high | Navy Formal Waist-Coat / P109 |
| Al-Deebaj | shirt_trouser_2pc_unstitch | move | mens_unstitched | wrong-gender | med | Dark Brown Blended Kameez Shalwar / ADKS |
| Senorita | winter_3pc_stitch | ask |  | wrong-gender | low | LAD-03078 / Peach & Multicolor / Casual  |
| Senorita | formal_emb_3pc | move | kids_girls_formal | wrong-gender | med | Kids formal clothes / Maroon & Gold / Fo |
| Senorita | pret_3pc_emb | move | kids_girls_eastern | wrong-gender | med | Kids Casual Dress / T.Green & Multicolor |
| Senorita | maxi_dress | ask |  | wrong-gender | low | Women Eid Dress / Red & Multicolor / Cas |
| Senorita | kurti_1pc | move | kids_girls_eastern | wrong-gender | med | Kids Casual Top / S.Pink & Multicolor /  |
| Senorita | handmade_emb | move | kids_girls_formal | wrong-gender | med | Kids formal clothes / Navy Blue & Gold / |
| Senorita | shirt_dupatta_2pc_unstitch | ask |  | wrong-gender | low | Kids Eid Dress / Multicolor / Casual 2 P |
| Kross Kulture | kids_girls_eastern | ask |  | wrong-gender | low | 2PC - Embroidered Viscose Suit With Fars |
| Kross Kulture | kids_girls_western | ask | kids_girls_eastern | wrong-type | low | Girl - Embroidered Crush Silk Shirt |
| Kross Kulture | maxi_dress | ask |  | wrong-type | low | Printed Lawn Frock |
| Wardha Saleem | maxi_dress | ask |  | wrong-type | low | Vogue Jumpsuit Drape (1Pc) |
| Nureh | winter_3pc_unstitch | ask |  | wrong-piece | low | NE-134 |
| Tassels | lawn_3pc_unstitch | delete |  | accessory | high | Solara Lampshade - Tassels Home |
| Tassels | kids_girls_eastern | ask |  | wrong-gender | low | Embroidered 3pc. Zafira - Mother and Dau |
| Azure | loungewear | ask |  | wrong-type | low | Teal Green Embroidered Kurta Pajama |
| Cambridge | mens_kurta | move | mens_trouser | wrong-piece | med | EXPANDABLE DRESS PANT (E-FACTORY OUTLET) |
| Cambridge | mens_unstitched | move | mens_shalwar_kameez | stitched-vs-unstitched | med | BASIC SHALWAR KAMEEZ SUIT |
| Sana Safinaz | kurti_1pc | move | shirt_trouser_2pc | wrong-piece | med | Stitched Printed Dobby Shirt+ Culotte |
| Sana Safinaz | winter_3pc_stitch | ask |  | wrong-piece | low | Stitched Linen Shirt |
| Sana Safinaz | kids_boys_western | ask |  | wrong-gender | low | Stitched Kids Bottom |
| Sana Safinaz | loungewear | ask |  | wrong-type | low | B-430 (Mangolia Nights) |
| Hijabi.pk | lawn_3pc_unstitch | move | shawl | wrong-type | high | Irani Chadar with Sleeves |
| Saya | kids_girls_eastern | ask |  | wrong-gender | low | Printed Premium Lawn Stitched 2 Piece (S |
| Saya | kids_boys_western | ask |  | wrong-type | low | Printed Silk Touch Stitched Shirt/trouse |
| Saya | kurti_1pc_unstitch | move | womens_trouser | wrong-type | low | Unstitched Dyed Silk Touch Trouser Fabri |
| ChenOne | lawn_3pc_unstitch | delete |  | wrong-type | high | EMPIRE BRASS TABLE SET BLACK |
| ChenOne | winter_3pc_stitch | ask |  | wrong-piece | low | PULL ON TROUSER BROWN LT-1132 |
| ChenOne | mens_kurta | move | mens_shirt | wrong-type | med | PULL OVER HOODIE GTS-B4278 |
| ChenOne | mens_shalwar_kameez | move | mens_shirt | wrong-type | med | JOGGING SUIT GTS-B4300 |
| ChenOne | kids_girls_eastern | move | kids_girls_western | wrong-type | med | KDS-G-13087 JEGGING BLACK |
| ChenOne | shirt_dupatta_2pc | ask |  | wrong-piece | low | 2 PCS SUIT (Shirt+Trouser) - LDS-6637 |
| Alizeh | kids_boys_western | ask |  | wrong-gender | low | AFK-BCH-1013-Hyan |
| Threads & Motifs | kurti_1pc_unstitch | ask |  | wrong-type | low | Unstitched Celestial Shimmer Kaftan |
| J. Junaid Jamshed | mens_kurta | ask |  | wrong-piece | low | NAVY BLUE SEMI-FORMAL JUBBA |
| Outfitters | kids_infant | move | kids_boys_western | wrong-type | med | Denim Shorts |
| Outfitters | kids_girls_eastern | move | kids_girls_western | wrong-type | high | Linen Blouse |
| Outfitters | pret_3pc | move | womens_trouser | wrong-type | high | Poplin Midi Skirt |
| Outfitters | kids_boys_eastern | move | kids_boys_western | wrong-type | high | Jacquard Shirt |
| Outfitters | winter_3pc_stitch | move | womens_trouser | wrong-type | high | Wide Leg Jeans |
| Outfitters | mens_kurta | move | mens_shirt | wrong-type | low | Wool Blend Jacket |
| Outfitters | mens_shirt | ask |  | wrong-gender | low | Cropped Slogan Print T-Shirt |
| Furor | mens_kurta | delete |  | footwear | high | Cloud lux Slides - FAMSD6-016 |
| Furor | mens_shalwar_kameez | move | mens_shirt | wrong-type | med | Interlock Tracksuit Hoodie - FMTTKS5-006 |
| Furor | mens_unstitched | delete |  | accessory | high | Marina Blue Knitted Muffler - FAMM23-032 |
| Salitex | kurti_1pc_unstitch | move | womens_trouser | wrong-piece | med | 1pc - Unstitched Trouser |
| Salitex | pret_3pc | ask |  | wrong-piece | low | 1Pc Stitched Casual Pret |
| Salitex | winter_3pc_stitch | ask |  | wrong-piece | low | 1PC Stitched Printed Khaddar Dress (AL13 |
| Salitex | shirt_dupatta_2pc_unstitch | ask |  | wrong-piece | low | 1PC Stitched Cambric Printed Dress (SPL2 |
| The Ummatis | lawn_3pc_unstitch | move | abaya | headwear | high | Printed Hijabs - Paint Strokes |
| The Ummatis | dupatta_only | ask |  | wrong-type | low | Instant Magnet Hijab - Dark Purple |
| The Ummatis | kids_girls_eastern | ask |  | wrong-type | low | Kids Namaz Chadar - Summer Pastels Blue |
| The Ummatis | winter_3pc_unstitch | move | shawl | wrong-type | high | Cashmere Wool Shawls |
| Amir Adnan | mens_unstitched | delete |  | headwear | high | Grey Turban |
| Amir Adnan | mens_unstitched | delete |  | accessory | med | Basic Woolen Antique Bronze Traditional  |
| Amir Adnan | mens_kurta | ask |  | wrong-type | low | Premium Viscose Jamawar Off White Jacket |
| Amir Adnan | mens_shalwar_kameez | ask |  | wrong-type | low | Poly Viscose Navy Blue Classic Fit Embro |
| Kurta Corner | mens_shalwar_kameez | ask |  | wrong-piece | low | Shendi Designer Set (3 Piece) |
| Kurta Corner | kids_girls_eastern | ask |  | wrong-gender | low | Kids Embroidered Suit 13 |
| Kurta Corner | mens_kurta | ask |  | wrong-piece | low | Terracotta Luxe Co-ord Set |
| Kurta Corner | mens_unstitched | ask |  | wrong-type | low | Embroidered Mustard Sherwani Set |
| Kurta Corner | kids_boys_western | ask |  | wrong-type | low | Kids Trouser |
| Sha Posh | pret_3pc | move | kids_girls_eastern | wrong-gender | med | Kids Dull Raw Silk 4PC / 9792 |
| Sha Posh | winter_2pc_stitch | move | kids_girls_eastern | wrong-gender | med | Kids Lawn 2 Piece / 2295 |
| Zuruj | footwear | ask |  | wrong-type | low | ckp-16 |
| Zuruj | lawn_3pc_unstitch | ask |  | wrong-type | low | Botanic Bliss |
| Bareeze Man | mens_unstitched | ask |  | wrong-type | low | RK OPAL-Egg Plant |

## Confusions (need owner decision)

1. **Sapphire** — The 125 items in mens_shalwar_kameez and 112 in mens_unstitched are titled only 'Cotton/Dobby/Pima Suit' with no shalwar/kurta marker, and identical titles appear in Sapphire's women's suit cells. Are these genuinely MEN's items, or women's stitched/unstitched suits mis-tagged to men? ~237 SKUs.
   - products: Premium Cotton Dobby Suit ; Luxury Wash & Wear Suit ; Premium Ghiza Cotton Suit
   - options: men (keep mens_shalwar_kameez / mens_unstitched) | women stitched (pret_2pc_emb / pret_3pc) | women unstitched (lawn_3pc_unstitch / unstitch_3pc_emb)
2. **Wear Ochre** — The 478-item kids_girls_eastern cell is all generic 'Cotton/Poly Lawn ... 2/3 Pc Suit' with no kids or gender marker, while the brand also lists women's items. Are these truly kids-girls eastern suits, or women's suits? Largest single cell in the file.
   - products: Cotton Lawn Digital Printed 2 Pc Suit ; Cotton Embroidered 3 Pc Suit ; Poly Lawn Digital Printed 3 Pc Suit
   - options: kids_girls_eastern | women pret_3pc / shirt_dupatta_2pc | split between the two
3. **Shahzeb Saeed** — Are the 152 'Two Piece Suit (SF-xxx)' items unstitched suiting FABRIC (mens_unstitched) or finished western 2pc suits (mens_suit)? And are the 'Men's Cotton Vest' items innerwear (delete) or wearable waistcoat-style vests?
   - products: Black Two Piece Suit (SF-162) ; Navy Blue Two Piece Suit (SF-159) ; Men's Cotton Vest-015
   - options: mens_unstitched (fabric) | mens_suit (finished western suit) | delete (cotton vest = innerwear)
4. **Arsalan Iqbal** — In mens_unstitched, 'IronEz Fabric Kurta & Drawstring Trousers' read as finished 2pc kurta sets while 'suitings 120s wool' read as true unstitched fabric. Should the kurta-set items move to mens_shalwar_kameez and only the wool suitings stay as mens_unstitched?
   - products: Basic Ivory IronEz Fabric White Kurta and Drawstring Trousers ; Saakhi 2.0 - handcrafted suitings 120's wool ; Jamaal - handcrafted suitings 120's woollen
   - options: keep all mens_unstitched | split: kurta sets -> mens_shalwar_kameez, fabric -> mens_unstitched
5. **Hijab-ul-Hareem** — How should 'Men's Ahram' (Ihram pilgrimage cloth, unstitched tissue) and standalone Naqab/face covers be bucketed - apparel or accessory?
   - products: Men’s Ahram | Premium Tissue ; Saudi Face Cover (Naqab) ; Two Layer Face Cover (Naqab)
   - options: mens_unstitched (Ahram) / abaya (naqab) | delete as accessory/headwear | keep as-is
6. **Dynasty Fabrics** — The 10 'Egyptian Delight' items are in kids_infant but Dynasty is a men's fabric house with no other kids line and the titles give no age/garment signal. Are these actually infant apparel, or a fabric/gift line that should be removed from kids?
   - products: Egyptian Delight EDDY-3 ; Egyptian Delight 1818 ; Egyptian Delight DYL 15
   - options: keep kids_infant | move to mens_unstitched (fabric) | delete (non-apparel gift line)
7. **Akbar Aslam** — The coord_western (44) and bridal (37) cells use one-word color/style names ('Marigold','Slate','Queen Bee') with no garment description, making it impossible to verify they're western co-ords vs eastern bridal 3pc. Should these be spot-checked against actual product pages?
   - products: Marigold ; Slate ; Queen Bee
   - options: trust current tags | spot-check western-coord vs bridal vs pret_3pc
8. **Maria B** — Are the plain 'Kurta' / '2 Piece Blended Suit' / '2 Piece Blemded Khaddar Suit' items the Maria B M-Kids line (boys/girls eastern) or women's kurti / 2pc? The same 'Embroidered Lawn Kurta' titles appear under kurti_1pc, kids_boys_eastern AND kids_girls_eastern.
   - products: Embroidered Lawn Kurta ; 2 Piece Blended Suit ; 2 Piece Blemded Khaddar Suit
   - options: kurti_1pc | kids_boys_eastern | kids_girls_eastern | shirt_dupatta_2pc
9. **Asim Jofa** — Is the AJKL ('Kids Lawn'?) line genuinely kids-girls eastern, or women's stitched 2pc? Titles are just 'Stitched 2 Pcs / 1 Pc' with no age marker.
   - products: AJKL-11 Lurex Jacquard Stitched 2 Pcs ; AJKL-10 Organza Blue Lines Stitched 2 Pcs ; AJKL-06 Zari Lines Yarn Dyed Stitched 1 Pc
   - options: kids_girls_eastern | shirt_dupatta_2pc | kurti_1pc
10. **CRUSH Menswear** — Where should men's 'Premium Waterproof Puffer Jacket' go? It is real apparel (outerwear) but there is no jacket/outerwear key in the taxonomy and it is not a kurta or accessory.
   - products: Men's Premium Waterproof Puffer Jacket Grey ; Men's Premium Waterproof Puffer Jacket Black
   - options: mens_shirt | delete | ask
11. **Almirah** — Are the 'Kameez Shalwar' / 'Kurta Trousers' (ALxx-KS / ALxx-KT) items in the men cell sold UNSTITCHED (fabric) or as ready stitched suits? Title alone cannot tell; it decides mens_unstitched vs mens_shalwar_kameez.
   - products: White Cotton Kameez Shalwar - ALBQ-KS-003 ; White Kurta Trousers - ALET-KT-3001 ; Midnight Blue Plain Kameez Shalwar - ALET-KS-3013
   - options: mens_unstitched | mens_shalwar_kameez
12. **Almirah** — Are the 'Formal 3Pc Stitched' (ALT-3PS-LS) items kids-girls eastern or women's formal 3pc (formal_emb_3pc)? No age/kid marker in titles.
   - products: Yellow Swill Foil Formal 3Pc Stitched - ALT-3PS-LS-1169 ; Blue Formal 3Pc Stitched - ALT-3PS-LS-1167 ; White Poly Net 3 Piece Stitched - ALT-3PS-LS-1156
   - options: kids_girls_eastern | formal_emb_3pc | pret_3pc
13. **Roheenaz** — Taxonomy has no 4-piece key. Where should 'Four Piece Unstitch' suits be bucketed - keep in lawn_3pc_unstitch, or a winter/4pc variant?
   - products: Sawariya - 10 | Four Piece Unstitch ; Sawariya - 08 | Four Piece Unstitch
   - options: lawn_3pc_unstitch | winter_3pc_unstitch | unstitch_3pc_emb
14. **Ammara Khan** — Many items labelled 'Set' (e.g. 'Lacy Peach Kurta Set', 'Boxy Tunic and Tulip Shalwar Set') sit under kurti_1pc. Are these single-piece kurtis or 2pc kurta+shalwar sets that should move to a 2pc category?
   - products: Lacy Peach Kurta Set (D-16) ; Boxy Tunic and Tulip Shalwar Set (D-08) ; Pink Blossom Set (D-5)
   - options: kurti_1pc | shirt_trouser_2pc | coord_western
15. **Edenrobe** — The 'Co-Ord Set' lawn/cambric items are under coord_western but are eastern shirt+trouser co-ords. Should they be coord_western, shirt_trouser_2pc, or a stitched 2pc bucket?
   - products: Embroidered Cambric Co-Ord Set - EWTKED6-86125ST ; Printed Lawn Co-Ord Set - EWTKP6-86044ST
   - options: coord_western | shirt_trouser_2pc | pret_2pc_emb
16. **Khaadi** — The 418-count 'pret_3pc' cell is entirely standalone 'Shalwar' items. A standalone Shalwar is a 1pc bottom = womens_trouser, NOT a 3pc suit. Should this whole large cell be re-mapped to womens_trouser, or are these actually full suits mislabeled by the scraper (title shows only the bottom)?
   - products: Solid Yellow Shalwar ; Floral Cambric Shalwar ; Pink Viscose Shalwar
   - options: womens_trouser | pret_3pc (keep) | re-check product pages
17. **KEF** — 341 'Hijab' items are in dupatta_only. Taxonomy lists hijab under 'abaya (/hijab/jilbab)'. A plain lawn hijab scarf behaves like a scarf/dupatta. Where should hijabs live - dupatta_only (current) or abaya?
   - products: Turkish Lawn XL Hijab - Forest Green ; Soft Crumpled Lawn Hijab - Lavender
   - options: dupatta_only | abaya
18. **KEF** — 'Kimono' items (Ivory Kimono, Chikankari Kimono) are a 1pc open robe. No 'kimono' key exists. Map to kaftan (robe-like), western_top, or kurti_1pc?
   - products: Dusky Bloom Kimono ; Periwinkle Chikankari Kimono
   - options: kaftan | western_top | kurti_1pc
19. **KEF** — 'Pure Atlas Jamawar Coat' / 'Lama Tissue Coat' sit in heavy_formal_3pc but are 1pc coats. There is no outerwear/coat key. Treat as heavy formal (keep), kaftan, or a new outerwear bucket?
   - products: Pure Atlas Jamawar Coat ; Pure Indian Lama Tissue Coat
   - options: heavy_formal_3pc (keep) | kaftan | outerwear/jacket
20. **Black Camels** — Kids ABAYA items (KIDS ABAYA - ICE BLUE, KHIMAR ABAYA SET (KIDS)) sit in kids_girls_eastern. There is no kids_abaya key. Keep under kids_girls_eastern, or route to the women 'abaya' bucket?
   - products: KIDS ABAYA - ICE BLUE (KIDS) ; KHIMAR ABAYA SET - DEEP GREEN (KIDS)
   - options: kids_girls_eastern | abaya
21. **Nishat Linen** — 18 'Camisole' items are in western_top. Camisoles can be innerwear (delete per rules: vests/undergarments) or a legitimate western layering top. Which?
   - products: Beige Camisole ; Black Camisole
   - options: western_top (keep) | delete (innerwear)
22. **Zellbury** — Many cells (kids_boys_eastern 'Kurta - 1777', kids_boys_western 'Denim - 4001', shirt_trouser_2pc 'Kurta Trouser - 2344') have NO gender/age marker in the title, so adult-vs-kids and men-vs-women cannot be told from the title alone. Trust the source category or re-check product pages?
   - products: Kurta - 1777 ; Kurta Trouser - 2344 ; Denim - 4001
   - options: trust source category | re-check product pages
23. **Diners** — 'Wash & Wear Shalwar Kameez' appears in mens_unstitched alongside 'Wash & Wear Fabric'. The 'Fabric' items are clearly unstitched, but 'Shalwar Kameez' reads as a stitched 2pc (mens_shalwar_kameez). Are these sold as unstitched fabric kits or ready-stitched suits?
   - products: OffWhite Wash Wear Shalwar Kameez ; Beige Wash & Wear Fabric
   - options: mens_unstitched (keep) | mens_shalwar_kameez
24. **Eminent** — Several women's items are labelled only as 'Printed Crepe 2 Pcs Suit' / 'Arabic Lawn 2 Pcs Suit' - is the 2nd piece a dupatta (shirt_dupatta_2pc) or a trouser (shirt_trouser_2pc)?
   - products: Women's Printed Crepe 2 Pcs Suit ; Women's Printed Arabic Lawn 2 Pcs Suit
   - options: shirt_dupatta_2pc | shirt_trouser_2pc
25. **Eminent** — Boys' Plain Waist Coat sits in kids_boys_eastern - keep it as an eastern piece worn over kameez, or move to kids_boys_formal?
   - products: Boys' Plain Waist Coat
   - options: kids_boys_eastern | kids_boys_formal | delete
26. **Sania Maskatiya** — The lawn_3pc_unstitch cell holds only coded names (Cala, Lulu, Seya) with (A)/(B) variants - are these genuinely UNSTITCHED fabric, or stitched pret like the rest of the catalogue?
   - products: Cala (A) ; Cala (B) ; Lulu (A)
   - options: lawn_3pc_unstitch | pret_3pc | winter_3pc_stitch
27. **SHAAL** — Bridal embroidered 'Shaal' pieces - treat as a wedding shawl (shawl) or a bridal dupatta (dupatta_only)?
   - products: Maroon Gold Floral Sequence Bridal Embroidered Shaal ; Black Gold Floral Sequence Bridal Embroidered Shaal
   - options: shawl | dupatta_only
28. **Iznik Fashions** — UE-/IP-/CC- coded items appear in BOTH the unstitched cells and the pret_3pc cell with identical 'Printed/Embroidered Lawn' descriptions - which of these codes are stitched pret vs unstitched fabric?
   - products: UE-529 Printed Lawn ; IP-353 Textured Lawn ; CC-60 Embroidered Net
   - options: pret_3pc | lawn_3pc_unstitch | unstitch_3pc_emb
29. **Generation** — winter_3pc_stitch mixes single 'Top/Shirt' titles with 'Set/Duo-Set' titles - which are 1-piece winter shirts vs 2-3pc winter suits, and are they all actually winter?
   - products: Hand-Crafted Top ; Motia Crafted Shirt ; Marigold Mist Duo-Set
   - options: kurti_1pc | winter_2pc_stitch | winter_3pc_stitch
30. **Humayun Alamgir** — 'LINEN CORD SET' / 'BALLOON CORD SET' (2pc co-ord) currently sit under mens_kurta - are these kameez+pajama style (mens_shalwar_kameez) or a western co-ord?
   - products: WHITE LINEN CORD SET ; OFF WHITE BALLOON CORD SET ; PISTACHIO LINEN CORD SET
   - options: mens_shalwar_kameez | mens_kurta
31. **Humayun Alamgir** — 'Prince Suit' and 'Prince Coat' are in mens_sherwani - confirm prince coat/prince suit should map to sherwani rather than mens_suit.
   - products: Emerald Green Embroidered Prince Suit ; Royal Blue Embroidered Prince Coat
   - options: mens_sherwani | mens_suit
32. **Naqshi** — handmade_emb cell uses male-sounding coded names (Maahid, Huzaim, Shazim) under a women's brand - is this a menswear line or still women's handmade embroidery?
   - products: Maahid ; Huzaim ; Shazim
   - options: handmade_emb | mens_kurta | ask
33. **Jeem** — maxi_dress cell contains a 'Lehnga Choli' and a 'Jacket' alongside Kalidar/maxi dresses - move Lehnga Choli to lehenga, and where does the standalone Jacket go?
   - products: FUSCHIA ANAYA LEHNGA CHOLI ; ZAREEN JACKET
   - options: lehenga | maxi_dress | western_top
34. **Alkaram Studio** — Alkaram's 'RTW | KURTA & SHALWAR' (72 items) and 'KURTA & TROUSER' are classified under MEN (mens_shalwar_kameez / mens_trouser), but Alkaram is predominantly a women's RTW brand. Are these men's eastern wear, or women's 2pc kurta sets that should move to shirt_trouser_2pc / pret? Gender determines the whole routing.
   - products: RTW | KURTA & SHALWAR ; RTW | KURTA & TROUSER ; RTW | KURTA
   - options: men: keep mens_shalwar_kameez | women: move to shirt_trouser_2pc | women: move to pret_2pc_emb
35. **Alkaram Studio** — 'RTW | SHIRT & CULOTTE' and 'SHIRT & BOOTCUT PANTS' appear in winter_3pc_stitch but are 2pc co-ords. Are they winter-fabric 2pc (winter_2pc_stitch) or regular 2pc co-ords (shirt_trouser_2pc / coord_western)?
   - products: RTW | SHIRT & CULOTTE ; RTW | SHIRT & BOOTCUT PANTS ; RTW | KURTI
   - options: winter_2pc_stitch | shirt_trouser_2pc | coord_western
36. **Sadaf Fawad Khan** — Many SKUs are pure add-on upcharges ('Korean Rawsilk Pants [+Rs.15,340]', 'Silk Sleeves [+Rs 4,000]', 'Potli [+Rs 10,000]', various 'Dupatta [+Rs...]'). Should these component/add-on variants be catalogued as standalone products at all, or hidden as order add-ons?
   - products: Korean Rawsilk Pants [+Rs. 15,340] ; Worked Sleeves [+Rs 25,000] ; Potli [+Rs 10,000]
   - options: keep as standalone products | exclude add-on variants from catalog | keep only full suits
37. **Limelight** — Limelight's '2 Piece ... Suit (Pret)' items are split between kids_girls_eastern and kids_girls_formal, but Limelight markets these as WOMEN's pret 2pc suits. Are these genuinely the kids line, or women's 2pc that should move to shirt_dupatta_2pc / pret_2pc_emb / formal_emb_2pc?
   - products: 2 Piece Lawn Suit- Embroidered (Pret) ; 2 Piece Raw Silk Suit- Embroidered (Pret) ; 2 Piece Dobby Suit- Embroidered (Pret)
   - options: kids (keep) | women: pret_2pc_emb | women: formal_emb_2pc
38. **Ismail Farid** — Ismail Farid 'mens_unstitched' cell mixes fabric-named pieces: 'KURTA PAJAMA', 'CRINKLE FABRIC SHIRT', 'EMBROIDERED SHAWL'. Per rules fabric words don't equal unstitched for men. Are these truly unstitched fabric, or stitched garments (-> mens_shalwar_kameez / mens_shirt / shawl)?
   - products: WHITE CRUSH FABRIC CLASSIC KURTA PAJAMA ; GREEN CRINKLE FABRIC SHIRT ; BLACK EMBROIDERED SHAWL
   - options: genuinely unstitched fabric | stitched: route by garment type | mixed - split individually
39. **Engine** — Engine 'kids_infant' cell holds non-romper items ('Boys Short','Boys T Shirt','Boys Basic Straight Trouser'). Are these 0-2y infant sizes or older-kid sizes that belong in kids_boys_western? Depends on the size run.
   - products: Boys Short ; Boys T Shirt ; Boys Basic Straight Trouser
   - options: infant 0-2y (keep) | older kid: kids_boys_western
40. **Cross Stitch** — Cross Stitch womens_trouser cell holds cryptic codes ('FLORET 1','ASTRID PEARL 3') with no garment word - the '1'/'3' suffix may denote piece-position rather than trouser. Are these actually trousers or components mis-binned?
   - products: FLORET 1 ; ASTRID PEARL 1 ; ASHEN BUD 3
   - options: genuinely trousers | components of suits - re-bin | needs per-SKU check
41. **Royal Tag** — The mens_shalwar_kameez cell mixes 'Everyday Shalwar Kameez' (clearly mens_shalwar_kameez) with 'Three-Piece Suit' and 'Timeless Suit' entries. Are the 'Three-Piece Suit' items western pant-coat suits (mens_suit) or 3-piece eastern shalwar-kameez sets?
   - products: Dark Brown Three-Piece Suit ; Black Three-Piece Suit ; Sky Blue Timeless Suit
   - options: mens_suit (western 3pc) | mens_shalwar_kameez (eastern 3pc)
42. **The Women Zone** — The dupatta_only cell is entirely hijabs. Taxonomy maps hijab to abaya, but these are scarf-style chiffon/embroidered hijabs that function like dupatta/stole. Which bucket do you want hijabs in?
   - products: Korean Chiffon Hijab - Real Maroon ; Moondust Embroidered Hijab - Sapphire Green ; Moondust Embroidered Hijab - Navy Blue
   - options: abaya | dupatta_only | shawl
43. **Senorita** — Senorita appears to be primarily a KIDS brand (many titles say 'Kids formal clothes' / 'Kids Casual Dress'), yet large cells are filed under WOMEN categories (winter_3pc_stitch=289, pret_3pc=101). Are the code-only coded suits (LAD-/KAD-/KBD-) women's or kids' garments?
   - products: LAD-03078 | Casual 3 Piece Suit ; KBD-02027 | Casual Plus 3 Piece Suit ; KDD-02105 | Formal 3 Piece Suit
   - options: women (pret_3pc / winter_3pc_stitch) | kids_girls_eastern / kids_girls_formal
44. **Kross Kulture** — The kids_girls_eastern cell holds generic '2PC/3PC Embroidered Suit' titles with no kids marker, while truly-kids items are prefixed 'Boy'/'Girl'. Are the unprefixed embroidered suits women's pret or kids?
   - products: 2PC - Embroidered Viscose Suit With Farshi Shalwaar ; 3PC - Embroidered Silk Lawn Suit ; 2PC - Embroidered Cambric Suit
   - options: kids_girls_eastern | pret_2pc_emb / pret_3pc_emb (women)
45. **Al-Deebaj** — Al-Deebaj sells men's kurta-shalwar AND women's abayas. Several women's cells (shirt_trouser_2pc, pret_2pc_emb, kurti_1pc) actually contain men's Kurta Shalwar/Kurta items. Confirm the brand's gender split so KS/ADKR/CS coded items route to men's buckets.
   - products: Skin Des Kurta Shalwar | KS-243 ; Sage Grey Kurta | ADKR-026 ; Printed Cotton Co-Ord Set | CS-001
   - options: mens_shalwar_kameez / mens_kurta (men) | keep in women's cells
46. **Tassels** — The kids_girls_eastern cell mixes pure 'Kids' suits with 'Mother and Daughter' sets. Should mother-daughter sets be filed under women's pret_3pc_emb, kids, or a combined bucket?
   - products: Embroidered 3pc. Zafira - Mother and Daughter ; Embroidered 3pc. Ziyana - Mother and Daughter ; Embroidered Stitched 3pc. Ziyana Kids
   - options: kids_girls_eastern | pret_3pc_emb (women) | split each set into both
47. **Cambridge** — The 'mens_kurta' cell mixes a real Chikankari Kurta with dress pants, straight bottoms, and a hoodie (all tagged E-FACTORY OUTLET). Should the bottoms go to mens_trouser and the hoodie to mens_shirt, splitting this cell?
   - products: CHIKANKARI KURTA ; EXPANDABLE DRESS PANT (E-FACTORY OUTLET) ; STRAIGHT SOLID BOTTOM(E-FACTORY OUTLET)
   - options: Split: bottoms->mens_trouser, hoodie->mens_shirt, kurta stays | Keep all as mens_kurta | Move whole cell to mens_trouser
48. **Cambridge** — 'BASIC SHALWAR KAMEEZ SUIT' under mens_unstitched — are these actually unstitched fabric (sz=Unstitched/RTS) or ready stitched suits that were misfiled?
   - products: BASIC SHALWAR KAMEEZ SUIT ; Basic Fancy Band Collar Shalwar Suit - Burgundy
   - options: Stitched -> move to mens_shalwar_kameez | Genuinely unstitched -> keep in mens_unstitched
49. **Sana Safinaz** — Shirt+Culotte sets are filed as kurti_1pc but a culotte is a second bottom piece (=2pc). Should these move to shirt_trouser_2pc, and do pure 'Shirt' items stay as kurti_1pc?
   - products: Stitched Printed Dobby Shirt+ Culotte ; Stitched Printed Viscose Shirt ; Stitched Embroidered Raw Silk Shirt+ Culotte
   - options: Shirt+Culotte -> shirt_trouser_2pc; pure Shirt stays kurti_1pc | Keep all as kurti_1pc
50. **ChenOne** — 'JOGGING SUIT' items are western tracksuits, not eastern shalwar kameez. Where should tracksuits go (and note one is a ladies LDS code)?
   - products: JOGGING SUIT GTS-B4300 ; JOGGING SUIT PINK LDS-A1805
   - options: mens_shirt/casual | Treat as activewear (no current bucket) | Split men vs ladies
51. **J. Junaid Jamshed** — 'JUBBA' items sit in mens_kurta. A Jubba/Thobe is a full-length robe — keep under mens_kurta or does it need its own routing?
   - products: NAVY BLUE SEMI-FORMAL JUBBA ; BLUE SEMI-FORMAL JUBBA
   - options: Keep as mens_kurta | Route Jubba/Thobe separately | Move to mens_shalwar_kameez
52. **Threads & Motifs** — Unstitched Kaftans and an 'Unstitched Blouse With Printed Skirt' are in kurti_1pc_unstitch. There is no unstitched-kaftan or unstitched-lehenga key — which bucket should hold unstitched ready-cut kaftans/blouse-skirt sets?
   - products: Unstitched Celestial Shimmer Kaftan ; Unstitched Embroidered Blouse With Printed Skirt
   - options: lawn_3pc_unstitch / unstitch family | Map to stitched kaftan/lehenga | New unstitched-kaftan handling
53. **Saya** — Large blocks of 'For Kids' lawn 2pc suits carry no boy/girl marker yet are routed across kids_girls_eastern (374) and kids_boys_eastern (93). How should genderless 'For Kids' items be split?
   - products: Printed Premium Lawn Stitched 2 Piece (Shirt/Trouser) For Kids ; Solid Wash N Wear Stitched 2 Piece (Shirt/Trouser) For Boy
   - options: Default genderless -> girls | Default genderless -> boys | Need per-product gender from source
54. **Kurta Corner** — 'Shendi Designer Set (3 Piece)' is currently in mens_shalwar_kameez, but mens_shalwar_kameez is defined as 2pc (kameez+shalwar / kurta+pajama). These are 3-piece men's sets (likely kurta+pajama+waistcoat). Should 3pc men's eastern sets stay in mens_shalwar_kameez or get a different home?
   - products: Shendi Designer Set (3 Piece) ; Shendi Designer Kurta Pajama18
   - options: mens_shalwar_kameez (keep 3pc here) | mens_sherwani | ask owner for a 3pc-men key
55. **Kurta Corner** — Men's 'Co-ord Set' items sit in mens_kurta (which is 1pc TOP only). A co-ord set is 2 pieces. Move to mens_shalwar_kameez?
   - products: Terracotta Luxe Co-ord Set ; Men's Azure Blue Printed Co-ord Set ; Midnight Black Co-ord Set
   - options: mens_shalwar_kameez | keep in mens_kurta | mens_suit (if western co-ord)
56. **The Ummatis** — This is a hijab/niqab brand. Hijabs are currently split across dupatta_only and lawn_3pc_unstitch. Should all hijabs route to abaya (the hijab/jilbab key) or to dupatta_only (scarf/stole)?
   - products: Instant Magnet Hijab - Olive ; Printed Hijabs - Cheetah Print ; Turkish Lawn Large - Dark Teal
   - options: abaya (hijab key) | dupatta_only | split: instant/worn hijab->abaya, lawn scarves->dupatta_only
57. **The Ummatis** — 'Kids Namaz Chadar' (children's prayer covering) is in kids_girls_eastern. Is a namaz chadar a kids garment, or should it route to the abaya/hijab religious-wear bucket?
   - products: Kids Namaz Chadar - Summer Pastels Blue ; Kids Namaz Chadar - Summer Pastels Mint
   - options: kids_girls_eastern | abaya | dupatta_only/shawl
58. **Amir Adnan** — 'Poly Viscose ... Classic/Slim Fit Embroidered Suit' in mens_shalwar_kameez - is 'Suit' here the eastern kameez-shalwar suit (correct) or a western pant-coat that should be mens_suit?
   - products: Slim Fit Shirt Collar Plain Suit ; Classic Fit EMB Band Collar Suit ; Poly Viscose Navy Blue Classic Fit Embroidered Suit
   - options: mens_shalwar_kameez (eastern suit) | mens_suit (western)
59. **Amir Adnan** — 'Premium Viscose Jamawar ... Jacket' in mens_kurta - is this a Nehru/waistcoat-style jacket (mens_waistcoat) or an actual kurta?
   - products: Premium Viscose Jamawar Off White Jacket ; Premium Viscose Jamawar Black Jacket
   - options: mens_waistcoat | mens_kurta | mens_suit
60. **Salitex** — Unstitched TROUSER fabric pieces sit in kurti_1pc_unstitch (defined as 1pc shirt fabric). There is no unstitched-trouser taxonomy key. Where should unstitched women's trousers go?
   - products: 1pc - Unstitched Trouser ; 1Pc Unstitched Cambric Trouser (TU-000122)
   - options: womens_trouser | kurti_1pc_unstitch (keep) | ask owner to add unstitched-trouser key
61. **Sha Posh** — Several 'Kids ... 4PC/2PC' items are mixed into women's pret_3pc and winter_2pc_stitch. Confirm these kids suits should move to kids_girls_eastern (the brand already has a large kids_girls_eastern cell).
   - products: Kids Dull Raw Silk 4PC | 9792 ; Kids Lawn 2 Piece | 2295
   - options: kids_girls_eastern | keep in women's pret | kids_boys_eastern
