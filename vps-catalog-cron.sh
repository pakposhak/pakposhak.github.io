#!/usr/bin/env bash
# ============================================================================
# PakiPoshak — VPS catalog harvest cron setup  (run ONCE on the PK VPS)
# ----------------------------------------------------------------------------
# WHY: the GitHub Actions runner IP is bot-limited by Khaadi/Sapphire (SFCC) and
# rate-limited on the deep Shopify pagination, so it only harvests ~7.5k products
# instead of ~12.6k. The VPS has a Pakistan IP that is NOT bot-blocked, so it
# runs the FULL harvest and pushes catalog.json to the GitHub Pages repo.
#
# WHAT THIS DOES: installs Node (if missing), clones the repo, drops a harvest
# runner with the same sanity gate as the Actions workflow, and adds a cron job
# 4x/day. The app keeps loading catalog.json from GitHub Pages exactly as today —
# only WHERE the harvest runs changes.
#
# ---------------------------------------------------------------------------
# ONE-TIME PREP YOU (Danish) DO FIRST — needs a GitHub credential I can't enter:
#
#   A) Make the VPS able to PUSH to the repo. Easiest = an SSH deploy key:
#        ssh-keygen -t ed25519 -C "pakiposhak-vps" -f ~/.ssh/pakiposhak_deploy -N ""
#        cat ~/.ssh/pakiposhak_deploy.pub
#      → GitHub repo  Settings ▸ Deploy keys ▸ Add deploy key
#        paste the .pub, tick "Allow write access", Save.
#      → tell git/ssh to use it for github.com:
#        printf 'Host github.com\n  IdentityFile ~/.ssh/pakiposhak_deploy\n  IdentitiesOnly yes\n' >> ~/.ssh/config
#
#      (Alternative = HTTPS + a fine-grained PAT with Contents:write on the repo;
#       then set REPO_URL below to the https form and run
#       `git config --global credential.helper store` once, pushing manually once
#       to cache it. Deploy key is cleaner — no expiry.)
#
#   B) Then run THIS script on the VPS:
#        curl -fsSL https://raw.githubusercontent.com/pakposhak/pakposhak.github.io/main/vps-catalog-cron.sh -o /tmp/setup.sh
#        bash /tmp/setup.sh
# ============================================================================
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/pakiposhak}"
REPO_URL="${REPO_URL:-git@github.com:pakposhak/pakposhak.github.io.git}"   # SSH (deploy key). For PAT use: https://github.com/pakposhak/pakposhak.github.io.git
RUNNER="/usr/local/bin/pakiposhak-harvest.sh"
LOG="/var/log/pakiposhak-harvest.log"

echo "▸ VPS timezone:"; timedatectl 2>/dev/null | grep -i "time zone" || date
echo "  (cron below uses LOCAL VPS time — if the VPS is UTC not PKT, adjust the hours: PKT = UTC+5.)"

# 1) Node present? (the relay is Node, so it usually is) ----------------------
if ! command -v node >/dev/null 2>&1; then
  echo "▸ Installing Node 20…"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo "▸ Node: $(node -v)"

# 2) Clone or update the repo -------------------------------------------------
if [ ! -d "$REPO_DIR/.git" ]; then
  echo "▸ Cloning $REPO_URL → $REPO_DIR"
  git clone "$REPO_URL" "$REPO_DIR"
fi
cd "$REPO_DIR"
git config user.name  "pakiposhak-vps"
git config user.email "vps@pakiposhak.local"
git pull --rebase --autostash origin main || true

# 3) Drop a THIN wrapper that execs the repo's run-harvest.sh — the harvest logic (sanity
#    gate, stock-promise/delisting enforcement, rebase-retry push) lives in ONE place,
#    version-controlled in the repo, instead of being duplicated here where a heredoc'd
#    copy would silently drift from the tracked source (this is exactly what happened
#    before: this file's inline gate didn't know about catalog-sanity.js at all). ---
cat > "$RUNNER" <<RUN
#!/usr/bin/env bash
set -euo pipefail
exec bash "$REPO_DIR/run-harvest.sh"
RUN
chmod +x "$RUNNER"
echo "▸ Installed runner: $RUNNER (wraps $REPO_DIR/run-harvest.sh)"

# 4) Cron 4x/day at 10:00 / 12:00 / 17:00 / 21:00 (VPS LOCAL time) -------------
CRON_LINE="0 10,12,17,21 * * * REPO_DIR=$REPO_DIR $RUNNER >> $LOG 2>&1"
( crontab -l 2>/dev/null | grep -v 'pakiposhak-harvest' ; echo "$CRON_LINE" ) | crontab -
echo "▸ Cron installed:"; crontab -l | grep pakiposhak-harvest

echo
echo "✅ Setup done. Test it NOW (should push ~12.6k products):"
echo "     REPO_DIR=$REPO_DIR $RUNNER 2>&1 | tail -20"
echo
echo "Then in GitHub: edit .github/workflows/refresh-catalog.yml and comment out the"
echo "'schedule:' block (keep workflow_dispatch) so the bot-limited Actions runs stop"
echo "— the VPS is now the source of truth. (Optional; the gate already protects it.)"
