# Calendar Import

Automatically imports docket entries from the U.S. Bankruptcy Court for the District of Utah (utb.uscourts.gov) anticipated hearing calendars.

## Architecture

```
┌─────────────────────────────────────┐
│  utb.uscourts.gov                   │
│                                     │
│  /content/public-calendar-judge-*   │
│    └─ HTML page with PDF link       │
│       └─ /sites/utb/files/          │
│          anticipated_calendars/     │
│          {CODE}-{ID}-{DATES}.pdf    │
└──────────────┬──────────────────────┘
               │  1. Scrape HTML for PDF links
               │  2. Download PDF files
               ▼
┌─────────────────────────────────────┐
│  Backend (calendarImportService)    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ PDF Parser (pdf-parse v2)   │    │
│  │  - Extract text from PDF    │    │
│  │  - Regex state machine      │    │
│  │  - Parse dates, times,      │    │
│  │    case numbers, parties    │    │
│  └──────────┬──────────────────┘    │
│             │                       │
│  ┌──────────▼──────────────────┐    │
│  │ Upsert to Database          │    │
│  │  - Key: (caseNumber,        │    │
│  │    hearingDate, hearingTime) │    │
│  │  - Create or update entries  │    │
│  └──────────┬──────────────────┘    │
│             │                       │
│  ┌──────────▼──────────────────┐    │
│  │ Socket.io: docket:update    │    │
│  │  - Notify connected displays│    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

## Judge Pages

The importer scrapes 6 judge calendar pages. Each page contains a link to a PDF with anticipated hearings.

| Judge Code | Judge Name | Page Path |
|------------|-----------|-----------|
| `PH`  | Judge Peggy Hunt | `/content/public-calendar-judge-peggy-hunt` |
| `WTT` | Judge William T. Thurman | `/content/public-calendar-judge-william-t-thurman` |
| `KRA` | Judge Kevin R. Anderson | `/content/public-calendar-judge-kevin-r-anderson` |
| `CDP` | Judge Cathleen D Parker | `/content/public-calendar-judge-cathleen-d-parker` |
| `MFT` | Judge Michael F Thomson | `/content/public-calendar-judge-michael-f-thomson` |
| `JTM` | Judge Joel T. Marker | `/content/public-calendar-judge-joel-t-marker` |

### PDF Filename Format

```
{JUDGE_CODE}-{ID}-{START_DATE}-{END_DATE}-{TIMESTAMP}.pdf

Example: PH-906136-20260205-20260320-175839497.pdf
```

The judge code is extracted from the filename prefix (everything before the first numeric segment).

## PDF Parsing

Each PDF contains hearing entries spanning multiple days. The parser uses a regex-based state machine to extract structured data from the raw text.

### What Gets Extracted

| Field | Source | Example |
|-------|--------|---------|
| Hearing date | Day header line | `Thursday, February 05, 2026` |
| Hearing time | Entry start line | `10:30 AM` |
| Case number | Entry start line | `20-06543` |
| Case title | Lines after case number | `Smith, John David` |
| Chapter | `Ch` marker | `7`, `11`, `13` |
| Adversary number | `†Ch` prefix entries | `20-06543-AP` |
| Hearing matter | Description lines | `Motion to Dismiss` |
| Parties | `Moving:`, `Opposing:`, `Trustee:` | Party names |
| Zoom info | Meeting ID / Passcode lines | ID, passcode, phone |
| Status | `STRICKEN`, `CONTINUED` flags | Sets entry status |
| Courtroom | Zoom header or courtroom line | Room identifier |

### Upsert Logic

Entries are matched by a composite unique key:

```
(caseNumber, hearingDate, hearingTime)
```

- **New entry**: Created with all parsed fields
- **Existing entry**: Updated with latest data (title, parties, zoom info, status)
- **Constraint violation** (race condition): Counted as "skipped"

This means re-running import is safe — it updates existing entries rather than creating duplicates.

## API Endpoints

All endpoints require admin authentication (`Authorization: Bearer <token>`).

### GET `/api/calendar-import/status`

Returns current import state.

```json
{
  "isRunning": false,
  "lastRunAt": "2026-02-06T14:30:00.000Z",
  "lastRunStatus": "success",
  "autoImportEnabled": true,
  "autoImportInterval": 30
}
```

### POST `/api/calendar-import/run`

Triggers a manual import. The import runs asynchronously in the background.

```json
// Success
{ "message": "Import started" }

// Already running (409)
{ "error": "Import is already running" }
```

### GET `/api/calendar-import/history`

Paginated list of import logs.

| Parameter | Default | Description |
|-----------|---------|-------------|
| `page`    | 1       | Page number |
| `limit`   | 10      | Items per page (max 100) |

```json
{
  "logs": [
    {
      "id": "uuid",
      "source": "pdf-auto",
      "judgeName": "Judge Peggy Hunt",
      "judgeCode": "PH",
      "sourceUrl": "https://www.utb.uscourts.gov/sites/utb/files/...",
      "filename": "PH-906136-20260205-20260320-175839497.pdf",
      "entriesFound": 42,
      "entriesCreated": 42,
      "entriesUpdated": 0,
      "entriesSkipped": 0,
      "status": "success",
      "errorMessage": null,
      "durationMs": 2340,
      "createdAt": "2026-02-06T14:30:00.000Z"
    }
  ],
  "total": 6,
  "page": 1,
  "limit": 10
}
```

### GET `/api/calendar-import/history/:id`

Returns a single import log by ID.

### GET `/api/calendar-import/config`

Returns auto-import configuration.

```json
{
  "enabled": false,
  "intervalMinutes": 30,
  "sourceUrl": "https://www.utb.uscourts.gov"
}
```

### PUT `/api/calendar-import/config`

Updates auto-import configuration. All fields are optional.

```json
{
  "enabled": true,
  "intervalMinutes": 30,
  "sourceUrl": "https://www.utb.uscourts.gov"
}
```

When `enabled` changes or `intervalMinutes` changes, the polling timer is immediately restarted (or stopped).

## Admin UI

The Calendar Import page is accessible from the sidebar (admin users only).

### Status Section

- **Running indicator**: Shows "Running" with spinner during import, "Idle" otherwise
- **Last run**: Timestamp and status badge (success / partial / failed)
- **Auto-import**: Shows whether auto-import is enabled and the interval
- **Import Now**: Button to trigger a manual import (disabled while running)

The status polls every 5 seconds while the page is open.

### Import History Table

| Column | Description |
|--------|-------------|
| Time | When the import ran |
| Judge | Judge name from PDF |
| Found | Total entries parsed from PDF |
| Created | New entries added to database |
| Updated | Existing entries refreshed |
| Status | success / partial / failed / running |
| Duration | Time taken (ms or seconds) |

Paginated with Previous/Next controls.

### Configuration Section

| Setting | Description | Options |
|---------|-------------|---------|
| Auto-import | Enable/disable automatic imports | Toggle on/off |
| Interval | How often to run (when enabled) | 15, 20, 30, 60, 120 minutes |
| Source URL | Base URL of the court website | Default: `https://www.utb.uscourts.gov` |

Changes take effect immediately — saving restarts the polling timer with the new interval.

## Manual Import

To run an import manually:

1. Log in to the admin portal
2. Navigate to **Calendar Import** in the sidebar
3. Click **Import Now**
4. Watch the status update from "Running" to the result
5. Check the history table for per-judge results

Or via API:

```bash
# Get auth token
TOKEN=$(curl -s http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@courthouse.gov","password":"admin123"}' | jq -r .accessToken)

# Trigger import
curl -s -X POST http://localhost:3000/api/calendar-import/run \
  -H "Authorization: Bearer $TOKEN"

# Check status
curl -s http://localhost:3000/api/calendar-import/status \
  -H "Authorization: Bearer $TOKEN" | jq .
```

## Auto-Import

When enabled, the backend runs imports on a configurable interval (default: 30 minutes).

### How It Works

1. On server startup, `syncPollingTimer()` reads config from the database
2. If enabled, starts a `setInterval` timer at the configured interval
3. Each tick calls `runImport()` — same as a manual trigger
4. Connected displays receive real-time updates via Socket.io `docket:update` events

### Enable via API

```bash
curl -s -X PUT http://localhost:3000/api/calendar-import/config \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "intervalMinutes": 30}'
```

### Disable via API

```bash
curl -s -X PUT http://localhost:3000/api/calendar-import/config \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Import status stays "Running" | Import crashed mid-run | Restart the backend server |
| 0 entries found for a judge | Court website changed format or PDF link moved | Check the judge's page manually; verify PDF URL pattern |
| 409 on POST `/run` | Import already in progress | Wait for current import to finish |
| "Failed" status with error | Network timeout or PDF parse error | Check `errorMessage` in the import log for details |
| Entries not appearing on display | Display filters don't match imported judge/courtroom | Check display configuration in admin |
| Duplicate entries after import | Should not happen — upsert prevents this | Check composite unique constraint on DocketEntry |
| Auto-import not running | Config disabled or server restarted without enabling | Check config endpoint; re-enable if needed |

### Checking Import Logs

```bash
# Last 6 import logs (one per judge)
curl -s http://localhost:3000/api/calendar-import/history?limit=6 \
  -H "Authorization: Bearer $TOKEN" | \
  jq '.logs[] | {judgeName, entriesFound, entriesCreated, entriesUpdated, status}'

# Check for failed imports
curl -s http://localhost:3000/api/calendar-import/history?limit=20 \
  -H "Authorization: Bearer $TOKEN" | \
  jq '.logs[] | select(.status == "failed") | {judgeName, errorMessage}'
```

### Server Logs

The backend logs import activity with the `[Calendar Import]` prefix:

```
[Calendar Import] Starting import from https://www.utb.uscourts.gov
[Calendar Import] Judge Peggy Hunt: 42 entries found, 42 created, 0 updated
[Calendar Import] Import complete in 12.3s
```

Check server stdout/stderr for these messages when debugging issues.
