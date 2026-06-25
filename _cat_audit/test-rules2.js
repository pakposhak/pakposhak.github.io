/* Unit tests for the screenshot-driven rules added 2026-06-25. */
'use strict';
const { cleanupProducts } = require('../catalog-cleanup');
let pass=0, fail=0;
function t(label, prod, expect){
  const r = cleanupProducts([Object.assign({ b:'X', t:'', u:'https://x.com/products/p', pkr:5000, sz:['M'], cat:'pret_3pc' }, prod)]);
  const got = r.products[0] ? r.products[0].cat : '(deleted)';
  const ok = got === expect;
  console.log((ok?'PASS ':'FAIL ')+label+'  → '+got+(ok?'':'  (expected '+expect+')'));
  ok?pass++:fail++;
}
// A) Sandal/Sandali footwear → apparel
t('Maria Osama Khan "Sandal" footwear+unstitched → apparel', {b:'Maria Osama Khan',t:'Sandal',cat:'footwear',sz:['Unstitched']}, 'lawn_3pc_unstitch');
t('Zara Shahjahan "SANDALI" footwear+unstitched → apparel',  {b:'Zara Shahjahan',t:'SANDALI',cat:'footwear',sz:['Unstitched']}, 'lawn_3pc_unstitch');
t('ETHNC "SANDAL" with shoe sizes 36-41 STAYS footwear',     {b:'ETHNC',t:'SANDAL(E1239)',cat:'footwear',sz:['36','37','38','39']}, 'footwear');
t('Khussa Master "Zafira" (real khussa, no sandal word) STAYS footwear', {b:'Khussa Master',t:'Zafira',cat:'footwear',sz:['Unstitched']}, 'footwear');
// B) Under-vest innerwear → deleted
t('Minnie "Under Vests (Pack Of 2)" → deleted', {b:'Minnie Minors',t:'Under Vests (Pack Of 2) (MSBVU-04)',cat:'kids_boys_eastern',sz:['9/12-M']}, '(deleted)');
// C) kids gender-swap + Kurta Corner
t('Almirah "Boys Kameez Shalwar" in girls → boys', {b:'Almirah',t:'White Cotton Boys Kameez Shalwar',cat:'kids_girls_eastern',sz:['3-4 Y']}, 'kids_boys_eastern');
t('Engine "Boys Suit" eastern → WESTERN (western-only brand)', {b:'Engine',t:'Boys Suit',cat:'kids_boys_eastern',sz:['2 Y']}, 'kids_boys_western');
t('Kurta Corner "Kids Embroidered Suit" in girls → boys', {b:'Kurta Corner',t:'Kids Embroidered Suit 13',cat:'kids_girls_eastern',sz:['22','24']}, 'kids_boys_eastern');
// D) Cougar sleeveless western → girls western
t('Cougar "Sleeveless Embroidered Top" → girls western', {b:'Cougar',t:'Sleeveless Embroidered Top',cat:'kids_girls_eastern',sz:['2-3 Y']}, 'kids_girls_western');
t('Beechtree "2 Piece Sleeveless Ethnic Suit" STAYS girls eastern', {b:'Beechtree',t:'2 PIECE SLEEVELESS ETHNIC EMBROIDERED SUIT',cat:'kids_girls_eastern',sz:['1-2Y']}, 'kids_girls_eastern');
// E) loungewear
t('Black Camels "CO-ORD SET" loungewear → coord_western', {b:'Black Camels',t:'CO-ORD SET - DEEP GREEN',cat:'loungewear',sz:['XS','S','M']}, 'coord_western');
t('Afrozeh "Nightlure" unstitched loungewear → apparel',  {b:'Afrozeh',t:'Nightlure',cat:'loungewear',sz:['Unstitched']}, 'lawn_3pc_unstitch');
t('Azure "Nightingale" loungewear → pret',                {b:'Azure',t:'Nightingale',cat:'loungewear',sz:['XS','S','M']}, 'pret_3pc');
t('Diners "Night Suit" STAYS loungewear',                 {b:'Diners',t:"Offwhite Diner's Night Suit",cat:'loungewear',sz:['S','M','L']}, 'loungewear');
t('Generation "Loungewear Set" STAYS loungewear',         {b:'Generation',t:'Blush Loungewear 3-Piece Set',cat:'loungewear',sz:['8','10']}, 'loungewear');
console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail);
