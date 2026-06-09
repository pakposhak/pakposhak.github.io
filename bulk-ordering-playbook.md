# Bulk Ordering Playbook — Moors Attire / PakStyle BD

How to turn many small customer orders into a few efficient bulk purchases per brand.
Pairs with: **order-aggregator.html** (groups orders by brand) and **wholesale-outreach.md** (registration emails).

---

## A. The repeatable workflow (every bulk run)

1. **Orders arrive** via the form → auto-logged to your Google Sheet, now **including item details** (Apps Script v3).
2. **Payment confirmed** → customer uploads slip on the success page → status flips to `payment_received` automatically.
3. **Aggregate**: open **[order-aggregator.html](https://pakstyles2bd.github.io/Pakstyle-BD/order-aggregator.html)** → click **"Load paid orders from sheet"**. It groups every paid order **by brand** and **clubs duplicate products** (sums sizes/qty).
4. **Export** each brand's sheet (Copy → paste into WhatsApp/Excel, or Download CSV).
5. **Place the bulk order** through that brand's best channel (table below).
6. **Pay → ship to Bangladesh** (consolidate freight from Karachi/Lahore).

> Result: e.g. "30 customer orders" → "4 clean brand order sheets" in one click.

---

## B. Per-brand sourcing channels (verified June 2026)

| Channel | Covers | How it works | Best for |
|---|---|---|---|
| **Askani Group — reseller** ⭐ | Sapphire, Cross Stitch, Gul Ahmed, Asim Jofa, Qalamkar, Khas, Saya + more | **Free** online application → they review & contact you. Ships **intl 10–15 days** (unstitched), ~1 wk (stitched). [askanigroup.com/reseller](https://askanigroup.com/reseller/) | **Start here** — one signup, many brands |
| **Gul Ahmed — direct wholesale** | Gul Ahmed | Contact wholesale/marketing dept via [gulahmed.com/contact-us](https://gulahmed.com/contact-us/) (email draft ready) | Best price on Gul Ahmed |
| **Bonanza Satrangi — wholesale** | Bonanza Satrangi | **Contact direct** (self-serve page is empty): `info@bonanzasatrangi.com` · `+92 21 111-244-266` | Bonanza bulk |
| **Konjae / PakDropshipping** | Many brands | Alt multi-brand wholesale platforms | Backup sourcing |
| **Brand-direct email** | Maria B, Sana Safinaz, Asim Jofa, Elan, Crimson, Zara Shahjahan… | Email each for reseller terms (template in wholesale-outreach.md) | Premium designers |
| **Supervised cart-fill** (our automation) | Any Shopify retail site (silayipret, etc.) | I add items+sizes to the cart slowly; you review & pay | Brands with **no** wholesale yet / small volume |

---

## C. Handling the two blockers

**1. Bot protection (Cloudflare "Just a moment…")** — hit on silayipret.
- Cause: too many fast automated requests.
- Fix: **supervised slow cart-fill** (one item every few seconds, you clear the occasional check), OR **buy via a wholesaler** instead (no bot wall). For high volume, wholesale wins.

**2. Quantity / amount limits per order** — common on retail sites.
- Wholesale/reseller accounts **remove** these limits.
- Workarounds for retail: split across sessions, or order during restocks.
- **Best fix:** become a registered buyer (Askani / brand-direct).

---

## D. Your action checklist
- [ ] **Apply to Askani Group reseller** (free, 5 min) → unlocks the most brands fastest — [askanigroup.com/reseller](https://askanigroup.com/reseller/)
- [ ] **Email Gul Ahmed** wholesale (draft in wholesale-outreach.md §1)
- [ ] **Email/Call Bonanza** wholesale — info@bonanzasatrangi.com / +92 21 111-244-266
- [ ] **Email premium designers** for reseller accounts (draft §3)
- [ ] For brands without wholesale → keep using **supervised cart-fill** + the aggregator sheets

> Margins note: brand-direct/Askani wholesale = best margin. Third-party WhatsApp resellers = convenient but carry a markup — verify before paying.
