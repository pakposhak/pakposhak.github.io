# PakiPoshak — VPS deployment (PKR price relay)

The relay lets Bangladesh buyers get **real PKR prices + live stock** from Shopify
brands that geo-serve USD outside Pakistan. It runs on a Pakistan-IP VPS, so Shopify
serves it the Pakistan market (PKR). See `../relay-server.js` for the app.

## Box
- **VPS:** `103.83.91.34` (CloudVPS.pk, Lahore), Ubuntu 24.04 LTS, user `admin130626`
- **Access:** `ssh -i ~/.ssh/pakiposhak_vps admin130626@103.83.91.34` (key-only; passwordless sudo)
- **Firewall (ufw):** 22 (SSH), 80 (ACME challenge), 443 (HTTPS)

## Components
| Layer | What | Where |
|---|---|---|
| App | Node 20 relay, binds `127.0.0.1:8787` | `/opt/psb-relay/relay-server.js`, run by user `psbrelay` |
| Service | `systemd` unit, `Restart=always`, hardened | `/etc/systemd/system/psb-relay.service` (= `psb-relay.service` here) |
| HTTPS | Caddy reverse-proxy + auto Let's Encrypt cert | `/etc/caddy/Caddyfile` (= `Caddyfile` here) |
| DNS | `103.83.91.34.sslip.io` → `103.83.91.34` (sslip.io free wildcard DNS, no account) | — |

**Public endpoint:** `https://103.83.91.34.sslip.io` → `/health`, `/price?url=<product URL>`
**Form integration:** `DEFAULT_RELAY_URL` in `order-form.html` (admin field `psb_relay_url` overrides it).

## Common ops
```bash
# health
curl https://103.83.91.34.sslip.io/health           # -> {"ok":true}

# update the relay after editing relay-server.js
scp -i ~/.ssh/pakiposhak_vps relay-server.js admin130626@103.83.91.34:/tmp/
ssh -i ~/.ssh/pakiposhak_vps admin130626@103.83.91.34 \
  'sudo mv /tmp/relay-server.js /opt/psb-relay/relay-server.js && \
   sudo chown psbrelay:psbrelay /opt/psb-relay/relay-server.js && \
   sudo systemctl restart psb-relay'

# logs / status
ssh ... 'systemctl status psb-relay --no-pager; sudo journalctl -u psb-relay -n 50 --no-pager'
ssh ... 'sudo journalctl -u caddy -n 50 --no-pager'   # cert / TLS issues

# after editing the Caddyfile
scp -i ~/.ssh/pakiposhak_vps deploy/Caddyfile admin130626@103.83.91.34:/tmp/ && \
ssh ... 'sudo mv /tmp/Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy'
```

## Notes
- The relay refuses any host not in `ALLOWED_HOSTS` (in `relay-server.js`) — keep that list
  in sync with the brand domains in `order-form.html` when adding brands.
- sslip.io is third-party DNS; if it ever goes away, swap the Caddyfile hostname for a
  DuckDNS subdomain (or a cheap real domain) pointing at `103.83.91.34` and update
  `DEFAULT_RELAY_URL`. The relay/Caddy setup is otherwise unchanged.
- G4 (Khaadi/Sapphire, Salesforce — no Shopify API) is **not** handled by this relay yet;
  it needs a JSON-LD scrape endpoint. See `../BRAND-GROUPS.md`.
