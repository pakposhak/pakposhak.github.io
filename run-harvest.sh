#!/usr/bin/env bash
# PakiPoshak — VPS catalog harvest runner (called by cron 4x/day: 0 5,7,12,16).
# Harvests from the PK IP (not bot-blocked), APPLIES catalog-cleanup (gender/category corrector,
# inside harvest-catalog.js), sanity-gates, commits + pushes catalog.json to main.
#
# Robustness (added 2026-06-21): always start from a clean, up-to-date main — recovers from any
# detached-HEAD state and picks up the latest cleanup RULES — and rebase-retry the push so a manual
# rule push landing mid-harvest can't reject us. catalog.json is regenerated every run, so we never
# hand-edit it on main; that keeps the rebase conflict-free.
set -euo pipefail
REPO_DIR="/opt/pakiposhak"
cd "$REPO_DIR"
echo "==== $(date -u) : harvest start ===="

# 1) Clean sync to origin/main (discards local catalog.json — regenerated below — and any detached HEAD).
git fetch origin --quiet || true
git checkout -f -B main origin/main >/dev/null 2>&1 || git checkout -f main || true
git reset --hard origin/main >/dev/null 2>&1 || true

# 2) Harvest. harvest-catalog.js runs cleanupProducts() before writing catalog.json (gender rules).
node harvest-catalog.js

# 3) Sanity gate: never let a throttled/partial run shrink the live catalog.
node -e '
  const fs=require("fs"), cp=require("child_process");
  const cur=JSON.parse(fs.readFileSync("catalog.json","utf8"));
  const has=(j,b)=>j.products.some(p=>p.b===b);
  let prev=null; try{ prev=JSON.parse(cp.execSync("git show HEAD:catalog.json").toString()); }catch(e){}
  const bad=[];
  if((cur.count||0)<800) bad.push("count "+cur.count+" < 800");
  if(prev){
    for(const b of ["Khaadi","Sapphire"]) if(has(prev,b)&&!has(cur,b)) bad.push("lost "+b);
    if((prev.count||0)>=800 && (cur.count||0) < prev.count*0.85) bad.push("dropped >15% ("+cur.count+" vs "+prev.count+")");
  }
  if(bad.length){ console.log("Bad harvest ("+bad.join(", ")+") — keeping previous catalog."); cp.execSync("git checkout -- catalog.json"); process.exit(0); }
  console.log("OK: "+cur.count+" products from "+cur.brands+" brands");
'

# 4) Commit + push (rebase-retry so a rule push landing mid-harvest does not reject us).
git add catalog.json
if git diff --cached --quiet; then echo "no catalog change"; exit 0; fi
COUNT=$(node -e "console.log(require('./catalog.json').count||0)")
git commit -m "Auto-refresh catalog (VPS): ${COUNT} products [skip ci]"
for attempt in 1 2 3; do
  if git push origin main; then echo "==== pushed ${COUNT} products ===="; exit 0; fi
  echo "push rejected (attempt ${attempt}) — rebasing onto latest main"
  git pull --rebase --autostash origin main || { git rebase --abort >/dev/null 2>&1 || true; }
done
echo "PUSH FAILED after retries" >&2
exit 1
