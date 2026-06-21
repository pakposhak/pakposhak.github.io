# PakPoshak — App Stages (milestone record)

A human-readable index of stable milestones. Each stage is also a **git tag** you can
restore to. To see a tag's notes: `git tag -n20 <tag>`. To restore a stage into a fresh
folder without disturbing current work:

```bash
git worktree add ../PakPoshak-<stage> <tag>      # opens that stage in a new folder
# or, to inspect only:  git checkout <tag>        (then: git checkout main to return)
```

Naming scheme going forward: `<short-name>-stable-YYYYMMDD` (tag) + a "Stage N" label here.

---

## Stage 8 — Price-Parity Stable  ·  tag `price-parity-stable-20260621`  ·  2026-06-21
**The card price == the basket price, everywhere, using only in-stock prices.**
- Browse-card price now = **cheapest in-stock variant** (was `variants[0]`, often a sold-out
  smallest size that showed an unbuyable price). Harvest `6529c39`.
- Basket default price = cheapest in-stock too → card == basket by construction (`af945eb`).
- **Per-size billing**: cart bills each picked size at its own price, shown as separate rows
  (`order-form.html` mirrored to `index.html`).
- Authoritative category-by-URL (`/search/by-url`) so basket weight == card weight.
- Cougar harvest host fixed (`cougar.com.pk` 404 → `www.cougar.com.pk`, ~376 products).
- **Audited 54 brands**: parity confirmed clean; verified that `available:false` ≠ unbuyable
  (PK brands oversell/make-to-order) so sold-out-looking products are NOT dropped.
- Live HTML build stamp at this stage: `2026-06-21i`.
- ⚠️ The card-price change is in the harvest code; it goes live on the next VPS catalog
  re-harvest (regenerates `catalog.json` + search index).

### Prior checkpoints (existing tags — older stages)
- `store-types-model-20260621` — Browse "Store Types" model snapshot (before retirement).
- `pre-ux-collapse-live` — before the collapsed-filters UX work.
- `stable-landing-pre-view4-20260619` — landing rotation, pre view-4.
- `stable-brands-20260616` — Browse Brands directory stable.
- `core-stable-20260615` — core order-form stable.
- `v1-order-form-stable` — first stable order form.

---

## How to start a NEW stage (when a milestone is reached)
1. Make sure `main` is clean and pushed.
2. Tag it:  `git tag -a <name>-stable-YYYYMMDD -m "what this stage contains"`
3. Push the tag:  `git push origin <name>-stable-YYYYMMDD`
4. Add a section at the top of this file, then commit.
5. Run a backup (see `PakPoshak-Backups/make-backup.ps1`) and upload to Drive.
