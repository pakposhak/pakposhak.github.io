/* Unit tests for the KIDS single-gender brand rules (2026-06-25, website-verified).
 * GIRLS_KIDS_BRANDS: genderless kids_boys_* -> kids_girls_* ; BOYS_KIDS_BRANDS: the reverse.
 * Both GUARDED so an explicit opposite-gender title is never flipped (idempotency). */
'use strict';
const { cleanupProducts } = require('../catalog-cleanup');
let pass = 0, fail = 0;
function t(label, prod, expect){
  const base = { b:'X', t:'', u:'https://x.com/products/p', pkr:5000, sz:['3-4 Y'], cat:'kids_girls_eastern' };
  const r = cleanupProducts([Object.assign(base, prod)]);
  const got = r.products[0] ? r.products[0].cat : '(deleted)';
  const ok = got === expect;
  console.log((ok?'PASS ':'FAIL ')+label+'  → '+got+(ok?'':'  (expected '+expect+')'));
  ok?pass++:fail++;
}
// ── GIRLS-only brands: genderless boys-default → girls (suffix kept) ──
t('Sana Safinaz genderless "Kids Dobby Shirt" boys→girls', {b:'Sana Safinaz',t:'Stitched Kids Dobby Shirt',cat:'kids_boys_western',sz:['7','8','10']}, 'kids_girls_western');
t('Senorita "Kids formal 3 Piece Suit" boys→girls',        {b:'Senorita',t:'Kids formal clothes Formal 3 Piece Suit',cat:'kids_boys_formal',sz:['16','18']}, 'kids_girls_formal');
t('The Women Zone "Kids Scarf" boys→girls',                 {b:'The Women Zone',t:'Kids Scarf - #97',cat:'kids_boys_western',sz:['Free Size']}, 'kids_girls_western');
t('Hijabi.pk "Kids Abaya" boys→girls',                      {b:'Hijabi.pk',t:'Cream Embroidery Kids Abaya',cat:'kids_boys_western',sz:['M']}, 'kids_girls_western');
t('Vanya genderless "Mini Kameez" boys→girls',              {b:'Vanya',t:'ME-35 Mini Kameez',cat:'kids_boys_eastern',sz:['5-6 Y']}, 'kids_girls_eastern');
// GUARD: an explicit "Boys" title at a girls-only brand is NOT flipped (stays boys)
t('GUARD Sana Safinaz explicit "Boys" stays boys',          {b:'Sana Safinaz',t:'Boys Kameez Shalwar',cat:'kids_boys_eastern',sz:['7','8']}, 'kids_boys_eastern');
// ── BOYS-only brands: genderless girls-default → boys ──
t('Innerlines genderless "Kids Suit" girls→boys',           {b:'Innerlines',t:'Kids Embroidered Suit 13',cat:'kids_girls_eastern',sz:['5-6 Y']}, 'kids_boys_eastern');
t('Cambridge genderless "Junior Pajama Suit" girls→boys',   {b:'Cambridge',t:'Junior Pajama Suit',cat:'kids_girls_eastern',sz:['8-9 Y']}, 'kids_boys_eastern');
// GUARD: an explicit "Girls" title at a boys-only brand is NOT flipped (stays girls)
t('GUARD Cambridge explicit "Girls" stays girls',           {b:'Cambridge',t:'Girls Embroidered Frock',cat:'kids_girls_eastern',sz:['5-6 Y']}, 'kids_girls_eastern');
// Kurta Corner keeps its own (pre-existing, unconditional) boys rule — verified boys-only
t('Kurta Corner "Kids Suit" girls→boys (own rule)',         {b:'Kurta Corner',t:'Kids Embroidered Suit 13',cat:'kids_girls_eastern',sz:['5-6 Y']}, 'kids_boys_eastern');
// ── NEGATIVE: a BOTH brand (not listed) is left alone ──
t('Maria B (BOTH) genderless kids stays put',               {b:'Maria B',t:'3 Piece Embroidered Lawn Suit',cat:'kids_girls_eastern',sz:['5-6 Y']}, 'kids_girls_eastern');
t('Unlisted brand genderless kids_boys stays boys',         {b:'ZZ Test',t:'Kids Printed Shirt',cat:'kids_boys_western',sz:['5-6 Y']}, 'kids_boys_western');
// ── MODEST kids wear is EASTERN, never western ──
t('Hijabi.pk "Kids Makhna" western→eastern',                {b:'Hijabi.pk',t:'Kids Makhna Pearls - Yellow',cat:'kids_girls_western',sz:['S']}, 'kids_girls_eastern');
t('The Women Zone "Kids Scarf" western→eastern (brand)',    {b:'The Women Zone',t:'Kids Scarf - #97',cat:'kids_girls_western',sz:['Free Size']}, 'kids_girls_eastern');
t('brand-agnostic "Kids Abaya" western→eastern (keyword)',  {b:'ZZ Test',t:'Kids Abaya Embroidered',cat:'kids_girls_western',sz:['5-6 Y']}, 'kids_girls_eastern');
t('NEGATIVE non-modest kids western stays western',         {b:'ZZ Test',t:'Kids Sweatshirt',cat:'kids_girls_western',sz:['5-6 Y']}, 'kids_girls_western');
// ── JEWELLERY drop (Agha Noor JWL / Diamante, Zara Shahjahan Jhoomar) — title/slug, guarded ──
t('Agha Noor "JWL0190" jewellery dropped',                  {b:'Agha Noor',t:'JWL0190',u:'https://x.com/products/jwl0190',cat:'lawn_3pc_unstitch',sz:['Unstitched']}, '(deleted)');
t('"Diamante By Soeurs Pearl Hoops" dropped',               {b:'Agha Noor',t:'Diamante By Soeurs Pearl Hoops',cat:'lawn_3pc_unstitch',sz:['Unstitched']}, '(deleted)');
t('Zara Shahjahan "Phool Jhoomar" dropped',                 {b:'Zara Shahjahan',t:'Phool Jhoomar',cat:'lawn_3pc_unstitch',sz:['Unstitched']}, '(deleted)');
t('GUARD jewellery-named SUIT survives ("Kundan Coral" 3pc)',{b:'Maryum N Maria',t:'Kundan Coral Embroidered 3pc Suit',cat:'pret_3pc',sz:['M']}, 'pret_3pc');
t('GUARD "Jewel by the Beach" lawn suit survives',          {b:'Crimson',t:'Jewel by the Beach 3B Mahogany',cat:'lawn_3pc_unstitch',sz:['Unstitched']}, 'lawn_3pc_unstitch');
console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail);
