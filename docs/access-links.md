# Access Links — Courthouse Digital Signage (demo stack)

Quick reference for the deployed **`mossdigsig2026-demo`** stack. Two ways in:

- **LAN** (`192.168.1.215`) — direct, no login, on the courthouse network.
- **Public** (`dsdemo.themcmurrays.us`) — via the Cloudflare tunnel; **Cloudflare Access sign-in required** (a raw `curl` returns `302` → the Access login page; that's expected).

## Gallery

The public, no-param browser of every display:

- LAN: <http://192.168.1.215/display/gallery.html>
- Public: <https://dsdemo.themcmurrays.us/display/gallery.html>

## All endpoints

| What | LAN | Public (Cloudflare Access) |
|------|-----|----------------------------|
| **Public gallery** | http://192.168.1.215/display/gallery.html | https://dsdemo.themcmurrays.us/display/gallery.html |
| Kiosk display | http://192.168.1.215/display/ | https://dsdemo.themcmurrays.us/display/ |
| Admin portal | http://192.168.1.215/admin | https://dsdemo.themcmurrays.us/admin |
| API docs (Swagger) | http://192.168.1.215/api-docs | https://dsdemo.themcmurrays.us/api-docs |
| Health check | http://192.168.1.215/api/health | — |

> The **kiosk display** takes a per-screen `?displayId=<id>` param (e.g. `/display/?displayId=display-321-main`). The **gallery** takes no params — it lists/browses all displays.

## Management & source

| What | Link |
|------|------|
| **Dockge** (manage/redeploy the stack) | http://192.168.1.215:5001/compose/mossdigsig2026-demo |
| GitHub repo | https://github.com/imcmurray/Courthouse-Digital-Signage |
| GitLab mirror | http://192.168.1.228/ianm/moss-dig-sig-2026 |

## Ops quick reference

Host: `dockge1` (`192.168.1.215`), SSH alias **`dockge215`** (user `ianm`).

```bash
# Backend logs
ssh dockge215 'docker logs --tail 80 mossdigsig2026-demo-backend-1'

# Redeploy after a new image is published (CI builds on push to main)
ssh dockge215 'cd /opt/stacks/mossdigsig2026-demo && docker compose pull && docker compose up -d'

# DB backups on the host
ls /home/ianm/dockge-backups/          # e.g. prod.db.YYYYMMDD-HHMMSS
```

- Images: `ghcr.io/imcmurray/courthouse-digital-signage-{backend,nginx}:latest` — built by GitHub Actions on push to `main`; Dockge pulls `:latest`. The admin SPA and display client live inside the **nginx** image; the API is the **backend** image.
- Stack files: `/opt/stacks/mossdigsig2026-demo/compose.yaml`; SQLite DB in the `mossdigsig2026-demo_db-data` volume (`prod.db`).
