'use strict';
/*
 * catalog-sanity.js — the harvest sanity gate (used by run-harvest.sh after harvest-catalog.js
 * writes catalog.json). Rejects a run that would damage the live catalogue:
 *   - too few products (partial/throttled harvest)
 *   - lost an SFCC anchor brand (Khaadi / Sapphire)
 *   - shrank the catalogue > drop threshold
 *   - CATEGORY CHURN: too many products that exist in BOTH versions changed category in one run
 *     (defends against a bad/stale collection-membership.jsonl or a buggy rule mass-mis-filing —
 *      added 2026-06-28 alongside the collection-authority refile). The refile is conservative
 *      (~1-2% at full coverage) and idempotent, so steady-state churn is ~0; a catastrophe is large.
 *
 * Pure function so it is unit-testable (_cat_audit/test-sanity.js). run-harvest.sh requires it and
 * performs the git revert on failure (behaviour identical to the previous inline gate + churn).
 */
function checkSanity(cur, prev, opts) {
  opts = opts || {};
  const MIN = opts.min != null ? opts.min : 800;
  const DROP = opts.dropFrac != null ? opts.dropFrac : 0.85;        // reject if cur.count < prev.count * DROP
  const CHURN_MAX = opts.churnMax != null ? opts.churnMax : 0.08;   // reject if > 8% of common products changed cat
  const KEEP = opts.keepBrands || ['Khaadi', 'Sapphire'];
  const reasons = [];
  const has = (j, b) => !!(j && j.products && j.products.some(p => p.b === b));

  if ((cur.count || 0) < MIN) reasons.push('count ' + (cur.count || 0) + ' < ' + MIN);

  let churn = null;
  if (prev) {
    for (const b of KEEP) if (has(prev, b) && !has(cur, b)) reasons.push('lost ' + b);
    if ((prev.count || 0) >= MIN && (cur.count || 0) < (prev.count || 0) * DROP)
      reasons.push('dropped >' + Math.round((1 - DROP) * 100) + '% (' + (cur.count || 0) + ' vs ' + (prev.count || 0) + ')');

    // category churn over products present in BOTH versions (keyed by url) — isolates cat CHANGES
    // from inventory add/remove.
    const pm = Object.create(null);
    for (const p of (prev.products || [])) pm[p.u] = p.cat;
    let common = 0, moved = 0;
    for (const p of (cur.products || [])) { const pc = pm[p.u]; if (pc !== undefined) { common++; if (pc !== p.cat) moved++; } }
    const frac = common ? moved / common : 0;
    churn = { common, moved, frac };
    if (common >= MIN && frac > CHURN_MAX)
      reasons.push('category churn ' + (100 * frac).toFixed(1) + '% > ' + (100 * CHURN_MAX).toFixed(0) + '% (' + moved + '/' + common + ' changed cat)');
  }
  return { ok: reasons.length === 0, reasons, churn };
}

module.exports = { checkSanity };
