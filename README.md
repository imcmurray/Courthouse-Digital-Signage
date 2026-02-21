# Courthouse Digital Signage System

A digital signage system for the Frank E. Moss U.S. Courthouse (District of Utah) that displays daily court hearing calendars, announcements, and real-time weather on HDMI-connected displays positioned outside courtrooms.

The system **automatically imports hearing calendars** by scraping PDF files published by the U.S. Bankruptcy Court for the District of Utah, parsing them into structured docket entries, and pushing updates to all connected displays in real time.

## How It Works

### Automated Calendar Import

1. The backend scrapes the court's [aggregated calendar page](https://www.utb.uscourts.gov/anticipated-pdf/all) on a configurable schedule
2. Individual judge PDF calendars are downloaded from `/sites/utb/files/anticipated_calendars/`
3. Each PDF is parsed to extract hearing entries: case number, parties, chapter, time, courtroom, judge, Zoom info, and status
4. Entries are upserted into the database (new entries created, existing entries updated)
5. Stale entries that no longer appear in the current PDFs are automatically removed
6. All connected displays receive a real-time WebSocket notification to refresh

### Display Pipeline

```
  Court Website (PDFs)
        |
        v
  Backend: Scrape + Parse
        |
        v
  SQLite Database (docket_entries)
        |
        v
  WebSocket: docket:update
        |
        v
  Display Clients (HTML5 kiosk)
```

Each display client is independently configured with judge/courtroom filters, column layout, orientation (landscape/portrait), theme, and weather location. Displays fetch only the docket entries relevant to their assigned courtroom.

## Components

| Component | Stack | Purpose |
|-----------|-------|---------|
| **Backend API** | Node.js, Express, Prisma (SQLite), Socket.IO | REST API, PDF import, WebSocket hub |
| **Admin Portal** | React 18, TypeScript, Tailwind, TanStack Query | Content management, display configuration |
| **Display Client** | HTML5, CSS3, Vanilla JS | Kiosk-mode courtroom display |

## Project Structure

```
moss-dig-sig-2026/
├── backend/
│   ├── src/
│   │   ├── index.ts              # Express app, all routes
│   │   └── services/
│   │       ├── calendarImportService.ts  # PDF scraping & import orchestration
│   │       └── pdfParser.ts              # PDF text extraction & parsing
│   └── prisma/
│       └── schema.prisma         # Database schema
├── admin/
│   └── src/
│       ├── pages/                # Settings, Displays, Docket, etc.
│       ├── components/           # Shared UI components
│       └── api/                  # API client modules
├── display/
│   ├── index.html                # Display layout
│   ├── css/display.css           # Display styles (1920x1080 optimized)
│   ├── js/display.js             # Data fetching, rendering, WebSocket
│   └── assets/                   # Court seal, weather icons
└── uploads/                      # User-uploaded logos
```

## Getting Started

### Prerequisites

- Node.js 20+
- npm

### Quick Start

The `init.sh` script checks prerequisites, installs dependencies, sets up the database, seeds initial data, and starts all three services:

```bash
./init.sh
```

Press `Ctrl+C` to stop all services.

### Manual Setup

```bash
# Install dependencies
cd backend && npm install && cd ..
cd admin && npm install && cd ..

# Initialize database
cd backend
npx prisma generate
npx prisma migrate deploy
npx prisma db seed    # Creates default admin user
cd ..
```

Then start each component in a separate terminal:

```bash
# Terminal 1: Backend API (port 3000)
cd backend && npm run dev

# Terminal 2: Admin Portal (port 5173)
cd admin && npm run dev

# Terminal 3: Display Client (port 8080)
cd display && npx serve -l 8080 .
```

### Default Credentials

| Field | Value |
|-------|-------|
| Email | `admin@courthouse.gov` |
| Password | `admin123` |

## Features

### Calendar Import
- Automatic PDF scraping from utb.uscourts.gov on a configurable interval
- Manual import trigger from the admin portal
- Per-judge import logging with entry counts (created, updated, skipped, removed)
- Stale entry cleanup: removes hearings no longer in current PDFs
- Supports all six judges: Hunt, Thurman, Anderson, Parker, Thomson, Marker

### Display Management
- Multiple independent displays with per-display configuration
- Configurable filters: judge, courtroom, chapter
- Column layout customization
- Portrait and landscape orientation
- Theme selection (Navy & Gold, Dark, Light)
- Live admin preview with ephemeral tokens (5-minute TTL)
- Online/offline status tracking via heartbeat

### Docket Management
- Full CRUD with optimistic concurrency control
- Advanced filtering: date, judge, courtroom, status, chapter, text search
- Bulk CSV import with downloadable template
- Status tracking: scheduled, stricken, continued, completed, cancelled
- Zoom meeting info display (Meeting ID, Passcode, Phone)

### Announcements
- Priority-ordered scrolling ticker on displays
- Optional expiration dates
- Drag-to-reorder priority
- Enable/disable toggle

### Idle Content Cards
- Slideshow content displayed on idle screens between docket views
- System cards: upcoming hearings, court statistics (auto-generated)
- Custom info cards with icons, expiration dates, and display targeting
- Drag-to-reorder with per-display assignment
- Configurable rotation interval

### News
- Automated scraping of court news articles
- Manual scrape trigger from admin portal
- Cached articles with pagination
- Displays news on idle content slideshow

### Display Templates
- Configurable layout templates for different display types (courtroom, lobby, wayfinding, IT status)
- Built-in templates with factory reset capability
- Custom template creation with validated component types
- Component types: hearing table, hearing pills, idle cards, direction cards, camera grid, system status

### Real-Time Updates
- Socket.IO WebSocket connections between backend and all displays
- Docket changes, announcement updates, and settings changes push instantly
- Display heartbeat monitoring

### Weather
- NWS (National Weather Service) API integration
- SVG weather icons with day/night variants
- Per-display weather location override
- 15-minute refresh interval with offline caching

### Administration
- Role-based access: Admin, Editor, Viewer
- JWT authentication (30-min access, 7-day refresh tokens)
- Comprehensive audit logging of all mutations
- Data export/import (JSON) and selective clear
- Court branding: name, subtitle, courthouse name, officials, logo upload

## API Overview

Interactive API documentation (Swagger UI) is available at `/api-docs` — e.g. `http://localhost:3000/api-docs` in development or `http://<host>/api-docs` in Docker.

### Public (No Auth)
- `GET /api/settings/public` - Court branding
- `GET /api/health` - Health check

### Display Client (API Key)
- `GET /api/displays/:id/config` - Display configuration + global settings
- `GET /api/displays/:id/docket` - Filtered docket entries for display
- `GET /api/displays/:id/idle-content` - Aggregated idle content modules
- `GET /api/displays/:id/system-status` - System health, display statuses, calendar sync
- `POST /api/displays/:id/heartbeat` - Heartbeat

### Admin Portal (JWT)
- `/api/auth/*` - Login, logout, refresh, current user
- `/api/docket/*` - Docket CRUD, bulk import, helpers
- `/api/displays/*` - Display CRUD, key management, preview tokens
- `/api/announcements/*` - Announcement CRUD, reorder
- `/api/settings/*` - Settings CRUD, logo upload
- `/api/calendar-import/*` - Import trigger, config, history
- `/api/users/*` - User management
- `/api/idle-content-cards/*` - Idle content card CRUD, reorder
- `/api/news/*` - News article listing, scrape trigger
- `/api/display-templates/*` - Display template CRUD, reset
- `/api/audit-logs` - Audit log queries
- `/api/stats` - Dashboard statistics
- `/api/export`, `/api/import`, `/api/clear` - Data management

## User Roles

| Role | Permissions |
|------|-------------|
| **Admin** | Full access: users, settings, displays, imports, data management |
| **Editor** | Manage docket entries and announcements |
| **Viewer** | Read-only dashboard access |

## Deployment

### Docker (Production)

The recommended production deployment uses Docker Compose with two containers: an nginx reverse proxy serving the admin SPA and display client as static files, and the backend API server.

```
  Browser
    |
    v
  nginx (:80)
    ├── /           → Admin SPA (static)
    ├── /display/   → Display client (static)
    ├── /uploads/   → Uploaded logos (shared volume)
    ├── /api/*      → Proxy to backend
    └── /socket.io/ → WebSocket proxy to backend

  backend (:3000, internal only)
    ├── Express API + Socket.IO
    ├── Prisma + SQLite
    └── PDF import service
```

**Quick start:**

```bash
# 1. Create .env from template
cp .env.example .env

# 2. Set a secure JWT secret
#    Edit .env and change JWT_SECRET to a random string
#    e.g.: openssl rand -base64 32

# 3. Build and start
docker compose up --build -d
```

The admin portal is at `http://<host>` and the display client at `http://<host>/display/`.

**Environment variables** (set in `.env`):

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | Yes | — | Secret key for signing JWT tokens |
| `JWT_EXPIRES_IN` | No | `30m` | Access token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | No | `7d` | Refresh token lifetime |
| `CORS_ORIGIN` | No | — | Allowed CORS origins (comma-separated) |
| `NWS_USER_AGENT` | No | — | User-Agent for NWS weather API requests |
| `HOST_PORT` | No | `80` | Host port mapped to nginx |

**Data persistence:** Two named Docker volumes store data across restarts:
- `db-data` — SQLite database
- `uploads-data` — Uploaded court logos

**First run:** The backend automatically applies the database schema and seeds default users (admin/editor/viewer) if no users exist. See [Default Credentials](#default-credentials) above.

**Useful commands:**

```bash
# View logs
docker compose logs -f

# Restart after config change
docker compose restart

# Rebuild after code changes
docker compose up --build -d

# Stop and remove containers (data volumes preserved)
docker compose down

# Stop and remove everything including data
docker compose down -v
```

### Display Kiosk Setup

Display clients are designed to run in Chromium kiosk mode on Raspberry Pi devices connected to courtroom monitors via HDMI. The display URL accepts query parameters:

```
http://<host>/display/?displayId=<id>&apiKey=<key>
```

For development or non-Docker setups where the backend runs on a different origin, add `&apiBase=http://<backend>:3000`.

## License

Internal use only - U.S. Courts
