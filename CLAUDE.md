# Courthouse Digital Signage

Digital signage system for the Frank E. Moss U.S. Courthouse (District of Utah —
U.S. District Court + U.S. Bankruptcy Court). Drives unattended kiosk displays
showing the daily docket, announcements, weather, and emergency notices, managed
through an admin portal. Production-touching court IT — prioritize correctness,
data safety, and reviewer-friendly diffs.

## Layout

Monorepo with three independent packages plus deployment config:

- `backend/` — Express.js + Prisma (SQLite) REST API + socket.io. The API lives in
  a single large `backend/src/index.ts`; services are in `backend/src/services/`
  (calendar import, news scraper, PDF parser). Auth is JWT (30 min access /
  7 day refresh; refresh token in an HttpOnly cookie).
- `admin/` — React 18 + Vite + TanStack Query + Tailwind admin portal. API clients
  in `admin/src/api/` (one file per domain over a shared axios `client.ts`); pages
  in `admin/src/pages/`, shared UI in `admin/src/components/`.
- `display/` — static HTML/CSS/JS kiosk client (no build step), optimized for
  1920×1080 and designed to run 24/7 unattended. `index.html` is the kiosk;
  `gallery.html` is a public no-auth preview gallery.
- `nginx/`, `Dockerfile.nginx`, `backend/Dockerfile`, `docker-compose*.yml` —
  containerized deploy. nginx serves the built SPA + display client and proxies
  `/api` to the backend.

## Commands (run from repo root)

- `npm run dev:backend` / `npm run dev:admin` — dev servers.
- `npm run build` — build backend then admin.
- `npm run typecheck` — **run before every push.** Type-checks both packages
  (`tsc --noEmit`); the root script fails fast if either fails.
- `npm --prefix admin run lint` — ESLint for the admin frontend.
- Backend DB: `npm --prefix backend run db:migrate` (apply migrations),
  `db:seed`, `db:studio`.

There is no automated test suite yet; verify changes by running the affected flow.

## Conventions

- `JWT_SECRET` is **required** — the server refuses to boot without it. Never commit
  secrets; `.env` is git-ignored (`.env.example` documents the vars).
- Backend endpoints follow: try → validate → Prisma → audit log → `io.emit` →
  respond. Mutations should write an audit-log entry.
- SQLite has no `createMany`+`skipDuplicates`; import/export uses upsert loops and
  respects FK ordering.
- Deploy model: containers sit behind nginx and a Cloudflare tunnel that terminates
  TLS. The app must never be exposed directly without the Cloudflare front. `app`
  sets `trust proxy` so `req.ip` reflects the real client.

## Environment

Configured via env vars (see `.env.example`): `JWT_SECRET` (required),
`CORS_ORIGIN` (comma-separated allowed origins; empty = same-origin),
`DATABASE_URL`, `UPLOADS_DIR`, `NWS_USER_AGENT` (National Weather Service API),
`HOST_PORT`, `VITE_API_URL`.
