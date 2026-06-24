/* Unit tests for the 5 rules added 2026-06-24 (Danish's classifier-prompt pass). */
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
// Rule A: Lulusar skirt → womens_trouser (was leaking into western_top)
t('Lulusar "Drasan Skirt" western_top→bottom', {b:'Lulusar',t:'Drasan Skirt',cat:'western_top',sz:['XS','S','M']}, 'womens_trouser');
t('Lulusar skirt in pret_3pc→bottom',          {b:'Lulusar',t:'Lilac Box Pleat Skirt',cat:'pret_3pc',sz:['S']}, 'womens_trouser');
t('Lulusar "Street Rocker" jacket stays western', {b:'Lulusar',t:'Street Rocker Jacket',cat:'pret_3pc',sz:['M']}, 'western_top');   // not a skirt → western fallback
// Rule B: Furor tracksuit trousers → mens_trouser (menType no longer promotes to shirt)
t('Furor "Tracksuit Trousers" →trouser', {b:'Furor',t:'Interlock Tracksuit Trousers',cat:'mens_trouser',sz:['M']}, 'mens_trouser');
t('Furor "Co-ord Set Pants" →trouser',   {b:'Furor',t:'Canvas Co-ord Set Pants',cat:'mens_shirt',sz:['L']}, 'mens_trouser');
t('Furor "Tracksuit" TOP stays shirt',   {b:'Furor',t:'Fleece Tracksuit Top',cat:'mens_shirt',sz:['M']}, 'mens_shirt');   // a tracksuit top is still a shirt
// Rule C: sherwani-with-shawl set in shawl → mens_sherwani
t('Amir Adnan "Sherwani Paired with … Shawl"→sherwani', {b:'Amir Adnan',t:'Premium Jamawar Sherwani Paired with chiffon Embroidered Shawl',cat:'shawl',sz:['Unstitched']}, 'mens_sherwani');
t('Arsalan Iqbal "Sherwani with Velvet Shawl"→sherwani', {b:'Arsalan Iqbal',t:'Emerald Green Sherwani with Velvet Shawl',cat:'shawl',sz:['XL']}, 'mens_sherwani');
t('plain women "Velvet Shawl" stays shawl', {b:'Sapphire',t:'Embroidered Velvet Shawl',cat:'shawl',sz:['Unstitched']}, 'shawl');
// Rule D: prince coat sized Unstitched stays mens_sherwani (not demoted to fabric)
t('CRUSH "Prince Coat with Same Pant" stays sherwani', {b:'CRUSH Menswear',t:'Black Prince Coat with Same Pant',cat:'mens_sherwani',sz:['Unstitched']}, 'mens_sherwani');
// Rule 2.4: jamawar/raw-silk men's jacket → mens_waistcoat
t('Amir Adnan "Jamawar Jacket" kurta→waistcoat', {b:'Amir Adnan',t:'Premium Viscose Jamawar Off White Jacket',cat:'mens_kurta',sz:['M']}, 'mens_waistcoat');
t('Amir Adnan "Jamawar Bomber Jacket" stays (western)', {b:'Amir Adnan',t:'Aqua Blue Crush Jamawar Bomber Jacket',cat:'mens_unstitched',sz:['Unstitched']}, 'mens_unstitched');
t('Amir Adnan "Jamawar Navy Blazer Jacket"→suit', {b:'Amir Adnan',t:'Jamawar Navy Blazer Plain Jacket',cat:'mens_suit',sz:['M']}, 'mens_suit');
t('Womens "Raw Silk Jacket Set" (winter) untouched', {b:'Maria B',t:'Embroidered Pk Raw Silk Jacket Set',cat:'winter_3pc_stitch',sz:['M']}, 'winter_3pc_stitch');
t('Sania "Jamawar Jacket" bridal(women) untouched', {b:'Sania Maskatiya',t:'Midnight Blue Jamawar Jacket',cat:'bridal',sz:['M']}, 'bridal');
console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail);
