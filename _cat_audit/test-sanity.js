/* Unit tests for catalog-sanity.checkSanity (the harvest gate + category-churn guard, 2026-06-28). */
'use strict';
const { checkSanity } = require('../catalog-sanity');
let pass = 0, fail = 0;
function t(label, cond) { console.log((cond ? 'PASS ' : 'FAIL ') + label); cond ? pass++ : fail++; }

// build a catalog of n products (Khaadi at [0], Sapphire at [1], all cat pret_3pc)
function mk(n) {
  const ps = [];
  for (let i = 0; i < n; i++) ps.push({ u: 'u' + i, b: i === 0 ? 'Khaadi' : i === 1 ? 'Sapphire' : 'X', cat: 'pret_3pc' });
  return { count: n, brands: 3, products: ps };
}
function churned(n, k) { const c = mk(n); for (let i = 0; i < k; i++) c.products[i].cat = 'kurti_1pc'; return c; }

const prev = mk(1000);

t('identical → ok', checkSanity(prev, prev).ok === true);
t('count < 800 → fail', checkSanity(mk(700), prev).ok === false);
{ const cur = mk(1000); cur.products[0].b = 'X'; t('lost Khaadi → fail', checkSanity(cur, prev).reasons.some(r => /lost Khaadi/.test(r))); }
t('>15% drop (820 vs 1000) → fail', checkSanity(mk(820), prev).reasons.some(r => /dropped/.test(r)));
t('5% category churn → ok (under 8%)', checkSanity(churned(1000, 50), prev).ok === true);
t('15% category churn → fail', checkSanity(churned(1000, 150), prev).reasons.some(r => /churn/.test(r)));
t('5% churn fails at churnMax 0.03', checkSanity(churned(1000, 50), prev, { churnMax: 0.03 }).reasons.some(r => /churn/.test(r)));
t('no prev (first run) + count ok → ok', checkSanity(mk(1000), null).ok === true);
t('churn ignores added/removed products (only common counted)', (() => {
  const cur = mk(1200); // 200 new products u1000..u1199, none in prev → not churn
  return checkSanity(cur, prev).ok === true && checkSanity(cur, prev).churn.common === 1000;
})());

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail);
