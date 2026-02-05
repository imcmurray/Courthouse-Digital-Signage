# Courthouse Digital Signage System
## Product Specification for the Frank E. Moss U.S. Courthouse
### U.S. Bankruptcy Court for the District of Utah

**Version:** 1.0
**Date:** February 3, 2026
**Author:** IT Department

---

## About This Document

This specification was collaboratively developed through a conversation with Claude AI. The original discussion that produced this document can be viewed here:

**Initial Claude Conversation:** [https://claude.ai/share/293bda45-ac1c-4525-9828-efbfa2c98d3c](https://claude.ai/share/293bda45-ac1c-4525-9828-efbfa2c98d3c)

### How This Spec Was Used

This specification document was fed into [AutoForge](https://github.com/AutoForgeAI/autoforge) (formerly known as AutoCoder), an autonomous AI coding agent. AutoForge used this detailed spec to automatically generate the complete codebase for the courthouse digital signage system, including:

- The Node.js/Express backend API with Prisma ORM
- The React-based admin portal for content management
- The HTML5 display client for courtroom signage
- Database schema, authentication, and real-time WebSocket updates

The combination of a comprehensive spec document and autonomous code generation enabled rapid development of a fully functional application.

---

## 1. Executive Summary

This specification defines the requirements for a digital signage system to display daily court docket information, announcements, and real-time information on HDMI-connected displays positioned outside courtrooms in the Frank E. Moss U.S. Courthouse. The system will consist of a web-based display application and an administrative interface for content management.

---

## 2. System Overview

### 2.1 Components

| Component | Description |
|-----------|-------------|
| **Display Client** | Full-screen HTML5 application rendered on HDMI displays |
| **Admin Portal** | Web-based interface for managing docket and announcements |
| **Backend API** | RESTful service for data management and real-time updates |
| **Database** | Persistent storage for docket entries, settings, and announcements |

### 2.2 Deployment Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Admin Portal   │────▶│   Backend API   │◀────│ Display Clients │
│  (Web Browser)  │     │   (Node/Python) │     │ (Kiosk Browser) │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                        ┌────────▼────────┐
                        │    Database     │
                        │ (PostgreSQL/    │
                        │  SQLite)        │
                        └─────────────────┘
```

---

## 3. Display Client Specification

### 3.1 Visual Layout

Based on the reference design and actual court data structure, the display shall be organized into the following zones:

```
┌────────────────────────────────────────────────────────────────┐
│ ┌──────────────────────────┐  ┌─────────────────────────────┐  │
│ │      U.S. COURTS SEAL    │  │  Salt Lake City  | ☀️ 72°F  │  │
│ │   U.S. Bankruptcy Court  │  │  High: 75° Low: 58°         │  │
│ │   District of Utah       │  │  10:32 AM  Tuesday          │  │
│ └──────────────────────────┘  └─────────────────────────────┘  │
├────────────────────────────────────────────────────────────────┤
│                 TODAY'S HEARING CALENDAR                       │
│              Chief Judge Peggy Hunt - Room 321                 │
├────────────────────────────────────────────────────────────────┤
│  NAME              │ CH │   TIME    │  CASE #   │   MATTER    │
├────────────────────────────────────────────────────────────────┤
│  DeVine, Jacqueline│ 13 │ 10:30 AM  │ 25-27186  │ Confirmation│
│  Thompson, Michael │  7 │ 11:00 AM  │ 25-27190  │ 341 Meeting │
│  Garcia, Robert    │ 13 │ 11:30 AM  │ 25-27205  │ Confirmation│
│  Williams, Sarah   │ 11 │  1:00 PM  │ 25-27210  │ Status Conf │
│  ... (scrolling if needed) ...                                 │
├────────────────────────────────────────────────────────────────┤
│  🚫📱  Please turn your phones OFF in the Courthouse          │
├────────────────────────────────────────────────────────────────┤
│  ▶▶ TICKER: Room 245 closed for maintenance today...          │
└────────────────────────────────────────────────────────────────┘
```

### 3.2 Design Elements

#### 3.2.1 Header Section
- **Court Seal**: Official U.S. Courts seal (PNG/SVG, positioned left)
- **Court Name**: "U.S. Bankruptcy Court" / "District of Utah"
- **Background**: Yellow (#FFD700) or configurable brand color

#### 3.2.2 Info Widget (Top Right)
- **Location**: "Salt Lake City" (configurable)
- **Weather**: Current conditions icon + temperature (via NWS API)
- **High/Low**: Daily forecast temps
- **Date/Time**: Real-time clock, format: "10:32 AM Tuesday"
- **Background**: Light blue (#87CEEB) or configurable

#### 3.2.3 Docket Table
- **Title Bar**: "TODAY'S HEARING CALENDAR" + optional judge/room filter indicator
- **Header Row**: Dark navy (#1a2744) with white text
- **Configurable Columns** (select per display):

| Column | Field | Width | Notes |
|--------|-------|-------|-------|
| NAME | `case_title` | 30% | Formatted as "Last, First" |
| CH | `case_chapter` | 8% | Chapter number (7, 11, 13) |
| TIME | `hearing_datetime` | 15% | Formatted as "10:30 AM" |
| CASE # | `case_number` | 17% | e.g., "25-27186" |
| MATTER | `hearing_matter` | 20% | Abbreviated (see below) |
| ROOM | `courtroom` | 10% | Optional, if multi-room display |

- **Matter Abbreviations**:
  - "Confirmation Hearing" → "Confirmation"
  - "341 Meeting of Creditors" → "341 Meeting"
  - "Status Conference" → "Status Conf"
  - "Relief from Stay" → "Relief Stay"
  - "Motion Hearing" → "Motion"

- **Data Rows**: Alternating gradient blues for readability
- **Row Height**: 60-80px for visibility at 15-20 feet
- **Current Hearing**: Highlighted row for in-progress hearing
- **Auto-scroll**: Smooth scroll if entries exceed visible area
- **Font Size**: 28-32px for readability at distance

#### 3.2.4 Notice Banner
- **Content**: "Please turn your phones OFF in the Courthouse"
- **Icon**: No-phone symbol
- **Background**: Yellow (#FFD700)
- **Position**: Below docket table

#### 3.2.5 News/Announcement Ticker
- **Position**: Bottom of screen
- **Behavior**: Horizontal scroll, left-to-right
- **Content**: Configurable announcements (building notices, weather alerts, etc.)
- **Background**: Yellow (#FFD700)
- **Speed**: Configurable (default: 50px/second)

### 3.3 Technical Requirements

| Requirement | Specification |
|-------------|---------------|
| **Resolution** | 1920x1080 (Full HD) primary, 4K support optional |
| **Aspect Ratio** | 16:9 |
| **Browser Target** | Chromium-based kiosk mode |
| **Refresh Rate** | Data refresh every 30-60 seconds |
| **Clock Update** | Every second |
| **Offline Mode** | Display cached data with "Last Updated" indicator |
| **Auto-Recovery** | Reconnect automatically on network restoration |

### 3.4 Color Scheme

| Element | Color Code | Usage |
|---------|------------|-------|
| Primary Yellow | `#FFD700` | Header, notices, ticker |
| Info Blue | `#87CEEB` | Weather widget |
| Navy Dark | `#1a2744` | Table header, borders |
| Row Gradient Start | `#3a5a8a` | Odd rows |
| Row Gradient End | `#2a4a6a` | Even rows |
| White | `#FFFFFF` | Text on dark backgrounds |
| Black | `#000000` | Text on light backgrounds |

---

## 4. Admin Portal Specification

### 4.1 Authentication
- Integration with court's existing authentication (Active Directory/ADFS)
- Role-based access: Admin (full), Editor (docket only), Viewer (read-only)
- Session timeout: 30 minutes of inactivity

### 4.2 Dashboard
- Overview of all active displays and their status
- Quick stats: Total cases today, current active hearings
- System health indicators

### 4.3 Docket Management

#### 4.3.1 Manual Entry
| Field | Type | Validation |
|-------|------|------------|
| Case Number | Text | Format: YY-NNNNN (e.g., 26-20001) |
| Debtor Name | Text | Last, First format |
| Hearing Time | Time | 12-hour format with AM/PM |
| Courtroom | Dropdown | Pre-configured room list |
| Judge | Dropdown | Optional, for internal reference |
| Hearing Type | Dropdown | 341 Meeting, Motion, Trial, etc. |

#### 4.3.2 Bulk Import
- CSV upload with template download
- CM/ECF integration (if available)
- Validation report before import

#### 4.3.3 Auto-Clear Options
- Clear all entries at end of day (configurable time)
- Archive completed hearings
- Manual clear with confirmation

### 4.4 Display Configuration

#### 4.4.1 Per-Display Settings
| Setting | Options |
|---------|---------|
| Display Name | Free text identifier |
| Assigned Courtroom | Dropdown or "All" |
| Theme | Default, High Contrast, Custom |
| Show Weather | Yes/No |
| Weather Location | City/ZIP code |
| Notice Text | Customizable banner message |
| Ticker Enabled | Yes/No |
| Ticker Speed | Slow/Medium/Fast |

#### 4.4.2 Global Settings
- Court name and branding
- Default timezone (America/Denver)
- Business hours (for auto-dimming if supported)
- Logo upload

### 4.5 Announcements/Ticker Management
- Add/Edit/Delete announcements
- Set priority (affects display order)
- Set expiration date/time
- Enable/Disable without deleting

### 4.6 Audit Logging
- All changes logged with timestamp and user
- Exportable audit trail
- Retention: 90 days minimum

---

## 5. Backend API Specification

### 5.1 Base URL
```
Production:  https://signage.utb.uscourts.gov/api/v1
Development: http://localhost:3000/api/v1
```

### 5.2 Authentication

All endpoints except `/health` and `/displays/:id/public` require authentication.

| Header | Value | Used By |
|--------|-------|---------|
| `Authorization` | `Bearer <jwt_token>` | Admin Portal (user sessions) |
| `X-API-Key` | `sk_live_...` or `sk_test_...` | Scripts, Display Clients |

### 5.3 Docket Endpoints

#### List Docket Entries
```http
GET /docket
```

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `date` | string | Filter by date (YYYY-MM-DD), defaults to today |
| `courtroom` | string | Filter by courtroom |
| `status` | string | Filter by status: scheduled, in_progress, completed, cancelled |
| `limit` | number | Max results (default: 100) |
| `offset` | number | Pagination offset |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "case_number": "26-20001",
      "debtor_name": "Smith, Jane",
      "hearing_time": "09:00",
      "hearing_date": "2026-02-03",
      "courtroom": "321",
      "hearing_type": "341_meeting",
      "judge_name": "Hon. William T. Thurman",
      "status": "scheduled",
      "display_ids": ["display-321-main"],
      "created_at": "2026-02-03T06:00:00Z",
      "updated_at": "2026-02-03T06:00:00Z"
    }
  ],
  "pagination": {
    "total": 45,
    "limit": 100,
    "offset": 0
  }
}
```

#### Create Docket Entry
```http
POST /docket
Content-Type: application/json
```

**Request Body:**
```json
{
  "case_number": "26-20045",
  "debtor_name": "Johnson, Robert",
  "hearing_time": "09:30",
  "hearing_date": "2026-02-03",
  "courtroom": "321",
  "hearing_type": "341_meeting",
  "judge_name": "Hon. William T. Thurman",
  "display_ids": ["display-321-main"]
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "case_number": "26-20045",
    ...
  }
}
```

#### Bulk Create Docket Entries
```http
POST /docket/bulk
Content-Type: application/json
```

**Request Body:**
```json
{
  "entries": [
    {
      "case_number": "26-20045",
      "debtor_name": "Johnson, Robert",
      "hearing_time": "09:30",
      "hearing_date": "2026-02-03",
      "courtroom": "321",
      "hearing_type": "341_meeting"
    },
    {
      "case_number": "26-20046",
      "debtor_name": "Williams, Maria",
      "hearing_time": "10:00",
      "hearing_date": "2026-02-03",
      "courtroom": "321",
      "hearing_type": "motion"
    }
  ],
  "options": {
    "skip_duplicates": true,
    "clear_existing_date": false
  }
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "data": {
    "created": 2,
    "skipped": 0,
    "errors": []
  }
}
```

#### Update Docket Entry
```http
PUT /docket/:id
Content-Type: application/json
```

**Request Body:** (partial updates allowed)
```json
{
  "status": "in_progress",
  "courtroom": "210"
}
```

#### Delete Docket Entry
```http
DELETE /docket/:id
```

#### Clear Docket by Date
```http
DELETE /docket/clear
Content-Type: application/json
```

**Request Body:**
```json
{
  "date": "2026-02-03",
  "courtroom": "321",
  "archive": true
}
```

### 5.4 Display Endpoints

#### List Displays
```http
GET /displays
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "display-321-main",
      "name": "Courtroom 321 Entrance",
      "courtroom_filter": "321",
      "location": "3rd Floor, East Wing",
      "theme": "default",
      "show_weather": true,
      "weather_location": "Salt Lake City, UT",
      "notice_text": "Please turn your phones OFF in the Courthouse",
      "ticker_enabled": true,
      "ticker_speed": "medium",
      "status": "online",
      "last_heartbeat": "2026-02-03T15:45:30Z",
      "ip_address": "10.20.30.45"
    }
  ]
}
```

#### Register Display
```http
POST /displays
Content-Type: application/json
```

**Request Body:**
```json
{
  "id": "display-321-main",
  "name": "Courtroom 321 Entrance",
  "courtroom_filter": "321",
  "location": "3rd Floor, East Wing"
}
```

**Response:** `201 Created` with API key for display:
```json
{
  "success": true,
  "data": {
    "id": "display-321-main",
    "api_key": "sk_display_abc123..."
  }
}
```

#### Get Display Configuration (for display client)
```http
GET /displays/:id/config
X-API-Key: sk_display_abc123...
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "display-321-main",
    "name": "Courtroom 321 Entrance",
    "court_name": "U.S. Bankruptcy Court",
    "court_subtitle": "District of Utah",
    "theme": {
      "primary_color": "#FFD700",
      "header_bg": "#FFD700",
      "table_header_bg": "#1a2744",
      "row_gradient_start": "#3a5a8a",
      "row_gradient_end": "#2a4a6a"
    },
    "show_weather": true,
    "weather_location": "Salt Lake City, UT",
    "notice_text": "Please turn your phones OFF in the Courthouse",
    "ticker_enabled": true,
    "ticker_speed": 50,
    "refresh_interval": 30000,
    "logo_url": "/assets/court-seal.png"
  }
}
```

#### Get Display Docket (for display client)
```http
GET /displays/:id/docket
X-API-Key: sk_display_abc123...
```

**Response:**
```json
{
  "success": true,
  "data": {
    "date": "2026-02-03",
    "entries": [
      {
        "debtor_name": "Smith, Jane",
        "hearing_time": "09:00",
        "courtroom": "321",
        "case_number": "26-20001",
        "status": "completed"
      },
      {
        "debtor_name": "Johnson, Robert",
        "hearing_time": "09:30",
        "courtroom": "321",
        "case_number": "26-20045",
        "status": "in_progress",
        "is_current": true
      }
    ]
  },
  "weather": {
    "temperature": 72,
    "condition": "sunny",
    "icon": "☀️",
    "high": 75,
    "low": 58
  },
  "server_time": "2026-02-03T15:45:30Z"
}
```

#### Display Heartbeat
```http
POST /displays/:id/heartbeat
X-API-Key: sk_display_abc123...
```

**Request Body:**
```json
{
  "ip_address": "10.20.30.45",
  "browser": "Chromium 120",
  "resolution": "1920x1080"
}
```

### 5.5 Announcement Endpoints

#### List Announcements
```http
GET /announcements
```

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `active` | boolean | Only return non-expired, enabled announcements |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "ann-001",
      "text": "Building closes at 5 PM today due to weather",
      "priority": 1,
      "enabled": true,
      "expires_at": "2026-02-03T17:00:00Z",
      "created_at": "2026-02-03T08:00:00Z"
    },
    {
      "id": "ann-002",
      "text": "341 Meeting Room B relocated to Room 245 this week",
      "priority": 2,
      "enabled": true,
      "expires_at": "2026-02-07T23:59:59Z",
      "created_at": "2026-02-01T10:00:00Z"
    }
  ]
}
```

#### Create Announcement
```http
POST /announcements
Content-Type: application/json
```

**Request Body:**
```json
{
  "text": "Court closed Monday, Feb 17 for Presidents Day",
  "priority": 1,
  "expires_at": "2026-02-17T23:59:59Z",
  "enabled": true
}
```

#### Update Announcement
```http
PUT /announcements/:id
```

#### Delete Announcement
```http
DELETE /announcements/:id
```

### 5.6 WebSocket Events (Socket.io)

Displays connect to Socket.io for real-time updates:

```javascript
// Display client connection
const socket = io('https://signage.utb.uscourts.gov', {
  auth: { apiKey: 'sk_display_abc123...' },
  query: { displayId: 'display-321-main' }
});

// Events the display listens for:
socket.on('docket:update', (data) => {
  // Full docket refresh
  refreshDocket(data.entries);
});

socket.on('docket:entry:update', (entry) => {
  // Single entry changed (status update, etc.)
  updateEntry(entry);
});

socket.on('announcement:new', (announcement) => {
  addToTicker(announcement);
});

socket.on('announcement:remove', (id) => {
  removeFromTicker(id);
});

socket.on('display:refresh', () => {
  // Force full page refresh (config change)
  location.reload();
});

socket.on('display:message', (message) => {
  // One-time message overlay (emergency, etc.)
  showOverlay(message);
});
```

### 5.7 Error Responses

All errors follow consistent format:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid case number format",
    "details": {
      "field": "case_number",
      "expected": "YY-NNNNN format (e.g., 26-20001)"
    }
  }
}
```

**Error Codes:**
| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid authentication |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `DUPLICATE_ENTRY` | 409 | Entry already exists |
| `RATE_LIMITED` | 429 | Too many requests |
| `SERVER_ERROR` | 500 | Internal server error |

### 5.8 Rate Limiting

| Consumer Type | Limit |
|---------------|-------|
| Admin Portal (JWT) | 1000 requests/minute |
| Display Client | 60 requests/minute |
| API Key (automation) | 300 requests/minute |

### 5.9 Data Models

#### DocketEntry

Based on actual U.S. Bankruptcy Court calendar data:

```typescript
interface DocketEntry {
  // Identifiers
  id: string;                    // UUID (internal)
  schedule_id?: string;          // CM/ECF Schedule ID if available
  
  // Case Information
  case_number: string;           // "25-02015", "24-25863"
  case_title: string;            // "Robert Ray Pilkington and Denise Louise Pilkington"
  case_chapter: string;          // "7", "11", "13" (may include † for adversary)
  adversary_number?: string;     // "25-02015" (for adversary proceedings)
  adversary_title?: string;      // "Ginger Simpson, NYE County Public Administrator v. Pilkington et"
  
  // Hearing Information
  hearing_date: string;          // "2026-02-19"
  hearing_time: string;          // "10:00" (24hr) or "10:00 AM"
  hearing_matter: string;        // "Final Pretrial Conference", "Motion for Relief From Stay"
  hearing_judge: string;         // "Honorable William T. Thurman"
  courtroom?: string;            // Room number (for in-person)
  
  // Participants
  moving_party?: string;         // "Geoffrey L. Chesnut" (attorney)
  opposing_party?: string;       // "Robert Ray Pilkington" (can be multiple, newline separated)
  trustee?: string;              // "Jenkins tr", "Ostrow tr"
  
  // Zoom Information (for remote hearings)
  is_zoom: boolean;              // true if Zoom hearing
  zoom_meeting_id?: string;      // "160 7523 8590"
  zoom_passcode?: string;        // "9626637"
  zoom_phone?: string;           // "1+(669)254-5252"
  
  // Status
  status: EntryStatus;           // scheduled, in_progress, completed, stricken, reserved
  status_note?: string;          // "Stricken from the calendar", "Reserved-Inactive Hearing"
  comment?: string;              // "Planning Report due 2/9/26"
  
  // Metadata
  display_ids: string[];         // Which displays show this
  created_at: string;
  updated_at: string;
  created_by?: string;
}

type EntryStatus = 
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'continued'
  | 'stricken'                   // Stricken from calendar
  | 'reserved';                  // Reserved-Inactive

// Full hearing matter types observed in court calendars
type HearingMatter = 
  // Pretrial/Trial
  | 'Initial Pretrial Conference'
  | 'Final Pretrial Conference'
  | 'Trial'
  | 'Evidentiary Hearing'
  
  // Chapter 13 Specific
  | 'Confirmation Hearing'
  | 'Motion to Modify a Confirmed Chapter 13 Plan'
  | 'Motion to Abate Plan Payments'
  | 'Objection to Dismissal and Motion to Abate/Modify (Non-Payment)'
  | 'Objection to Dismissal'
  | 'Motion for Hardship Discharge'
  
  // Motions
  | 'Motion for Relief From Stay'
  | 'Motion to Approve Settlement/Compromise'
  | 'Motion for Final Decree'
  | 'Motion for Sanctions'
  | 'Motion to Reconsider'
  | 'Motion to Modify Mortgage Loan'
  | 'Motion to Abate'
  
  // Trustee Actions
  | 'Chapter 7 Trustee\'s Final Report and Applications for Fees'
  | '341 Meeting of Creditors'
  
  // Other
  | string;  // Allow custom values
```

#### Display Format Mapping

The display client formats data for readability at distance:

| Display Column | Source Field | Example | Notes |
|----------------|--------------|---------|-------|
| **NAME** | `case_title` | Pilkington, R & D | Abbreviated if long |
| **CH** | `case_chapter` | 13 | †11 for adversary |
| **TIME** | `hearing_time` | 2:30 PM | 12-hour format |
| **CASE #** | `case_number` | 24-25863 | |
| **MATTER** | `hearing_matter` | Relief from Stay | Abbreviated |
| **STATUS** | `status` | 🔴 STRICKEN | Optional indicator |

**Matter Abbreviations** (for display):
| Full Text | Abbreviated |
|-----------|-------------|
| Motion for Relief From Stay Filed by... | Relief from Stay |
| Objection to Dismissal and Motion to Abate/Modify (Non-Payment) | Obj. to Dismissal |
| Motion to Modify a Confirmed Chapter 13 Plan... | Modify Plan |
| Chapter 7 Trustee's Final Report and Applications for Fees | Trustee Final Report |
| Motion to Approve Settlement/Compromise... | Settlement |
| Initial Pretrial Conference | Pretrial (Initial) |
| Final Pretrial Conference | Pretrial (Final) |

#### Calendar Header Information

Each calendar has metadata that should be stored:

```typescript
interface CalendarMetadata {
  judge_name: string;            // "Honorable William T. Thurman"
  judge_code: string;            // "WTT" (from filename)
  courtroom: string;             // "204" (from filename)
  calendar_date: string;         // "2026-02-19"
  generated_at: string;          // "02/3/2026 at 3:40 PM"
  is_zoom_calendar: boolean;     // true if "Zoom Hearing" in header
  zoom_info?: {
    meeting_id: string;
    passcode: string;
    phone: string;
  };
  parameters?: string;           // "Show Stricken, Show Watermark"
}
```

#### Filename Convention Parsing

Calendar PDFs follow the pattern: `{JUDGE}-{ROOM}-{STARTDATE}-{ENDDATE}-{TIMESTAMP}.pdf`

Example: `WTT-204-20260203-20260302-153839588.pdf`
- Judge: WTT (William T. Thurman)
- Room: 204
- Start Date: 2026-02-03
- End Date: 2026-03-02
- Generated: timestamp 153839588

#### API Input Format

```json
{
  "calendar_metadata": {
    "judge_name": "Honorable William T. Thurman",
    "judge_code": "WTT",
    "courtroom": "204",
    "calendar_date": "2026-02-19",
    "is_zoom_calendar": true,
    "zoom_info": {
      "meeting_id": "160 7523 8590",
      "passcode": "9626637",
      "phone": "1+(669)254-5252"
    }
  },
  "entries": [
    {
      "case_number": "24-25863",
      "case_title": "Robert Ray Pilkington and Denise Louise Pilkington",
      "case_chapter": "11",
      "adversary_number": "25-02015",
      "adversary_title": "Ginger Simpson, NYE County Public Administrator v. Pilkington et",
      "hearing_date": "2026-02-19",
      "hearing_time": "10:00",
      "hearing_matter": "Final Pretrial Conference",
      "moving_party": "Geoffrey L. Chesnut",
      "opposing_party": "Robert Ray Pilkington\nDenise Louise Pilkington",
      "status": "stricken",
      "status_note": "Stricken from the calendar"
    },
    {
      "case_number": "21-22434",
      "case_title": "Shane Louis Griffin and Jamie Lyn Griffin",
      "case_chapter": "13",
      "hearing_date": "2026-02-19",
      "hearing_time": "14:30",
      "hearing_matter": "Objection to Dismissal and Motion to Abate/Modify (Non-Payment)",
      "trustee": "Jenkins tr",
      "moving_party": "Ryan E. Simpson",
      "status": "scheduled"
    }
  ],
  "options": {
    "upsert_by": ["case_number", "hearing_date", "hearing_time"],
    "clear_existing_date": false,
    "exclude_stricken": false
  }
}
```

#### Display Configuration

```typescript
interface Display {
  id: string;
  name: string;
  
  // Filtering
  judge_filter?: string;         // "WTT" or "Honorable William T. Thurman"
  courtroom_filter?: string;     // "204"
  chapter_filter?: string[];     // ["7", "13"] - show only these chapters
  
  // Display Options
  show_stricken: boolean;        // Show stricken hearings (grayed out)
  show_zoom_info: boolean;       // Show Zoom meeting details
  show_adversary: boolean;       // Show adversary case info
  show_trustee: boolean;         // Show trustee name
  show_attorneys: boolean;       // Show moving/opposing parties
  
  // Visual
  theme: string;
  columns: DisplayColumn[];
  highlight_current: boolean;    // Highlight in-progress hearing
  
  // Standard fields
  show_weather: boolean;
  weather_location?: string;
  notice_text: string;
  ticker_enabled: boolean;
  ticker_speed: 'slow' | 'medium' | 'fast';
  
  // Status
  status: 'online' | 'offline' | 'unknown';
  last_heartbeat?: string;
  ip_address?: string;
  created_at: string;
  updated_at: string;
}

type DisplayColumn = 
  | 'case_title'
  | 'case_number'
  | 'case_chapter'
  | 'hearing_time'
  | 'hearing_matter'
  | 'courtroom'
  | 'trustee'
  | 'moving_party'
  | 'status';
```

#### Announcement
```typescript
interface Announcement {
  id: string;
  text: string;                  // Max 500 characters
  priority: number;              // Lower = higher priority
  enabled: boolean;
  expires_at?: string;           // ISO8601, null = never
  display_ids?: string[];        // null = all displays
  created_at: string;
  updated_at: string;
  created_by?: string;
}
```

---

## 6. Hardware Recommendations

### 6.1 Display Hardware
| Component | Recommendation |
|-----------|----------------|
| **Display** | Commercial-grade 43" or 55" display (Samsung/LG commercial series) |
| **Resolution** | 1920x1080 minimum |
| **Brightness** | 350+ nits for indoor use |
| **Orientation** | Portrait or Landscape (configurable) |
| **Mounting** | VESA wall mount, positioned at eye level |

### 6.2 Playback Device
| Option | Pros | Cons |
|--------|------|------|
| **Raspberry Pi 4/5** | Low cost (~$75), low power, silent | Requires setup, SD card wear |
| **Intel NUC** | More powerful, reliable storage | Higher cost (~$300+) |
| **Integrated SoC** | Built into display, no extra hardware | Vendor lock-in, updates |
| **Mini PC (Beelink, etc.)** | Good balance of cost/reliability | Varies by model |

**Recommendation**: Raspberry Pi 5 with 4GB RAM running Raspberry Pi OS Lite + Chromium kiosk mode, or Intel NUC for higher reliability requirements.

### 6.3 Network
- Wired Ethernet preferred for reliability
- VLAN isolation recommended
- Outbound HTTPS required for weather API (if used)
- Internal network access to signage server

---

## 7. Security Considerations

### 7.1 Network Security
- Display clients on isolated VLAN
- Admin portal accessible only from court network
- TLS 1.2+ for all communications
- API authentication via JWT tokens

### 7.2 Physical Security
- Displays in secure, public-facing locations
- Playback devices in locked enclosures or behind displays
- No USB ports accessible to public

### 7.3 Data Security
- No PII stored beyond public court records
- Debtor names are public record (as filed)
- Audit logs retained per retention policy
- Database encryption at rest

### 7.4 Federal Compliance
- FedRAMP considerations if cloud-hosted
- On-premises deployment preferred for court data
- CJIS compliance not required (non-criminal data)

---

## 8. Implementation Phases

### Phase 1: MVP (4-6 weeks)
- [ ] Single display client with static configuration
- [ ] Basic admin portal with manual docket entry
- [ ] REST API with polling-based updates
- [ ] SQLite database for simplicity

### Phase 2: Enhanced (4-6 weeks)
- [ ] Multi-display support with per-display configuration
- [ ] WebSocket real-time updates
- [ ] Weather integration (NWS API)
- [ ] Bulk import functionality
- [ ] PostgreSQL migration
- [ ] PDF calendar auto-import from Drupal

### Phase 3: Production (2-4 weeks)
- [ ] AD/ADFS authentication integration
- [ ] Audit logging
- [ ] Monitoring and alerting
- [ ] Documentation and training

### Phase 4: Future Enhancements
- [ ] CM/ECF direct integration
- [ ] QR code display for case lookup
- [ ] Multi-language support
- [ ] Emergency alert integration (building evacuation, etc.)

---

## 9. Automated PDF Calendar Import

### 9.1 Overview

Calendar PDFs are published to the external Drupal site every 20 minutes. The signage system will automatically fetch, parse, and import these calendars to keep displays current.

### 9.2 PDF Source URLs

```
Base URL: https://www.utb.uscourts.gov/sites/utb/files/anticipated_calendars/

Filename Pattern: {JUDGE}-{ROOM}-{STARTDATE}-{ENDDATE}-{TIMESTAMP}.pdf

Examples:
- WTT-204-20260203-20260302-153839588.pdf  (Judge Thurman, Room 204)
- PMH-321-20260203-20260302-153840123.pdf  (Chief Judge Hunt, Room 321)
```

### 9.3 Judge Codes

| Code | Judge Name | Typical Courtroom |
|------|------------|-------------------|
| WTT | Honorable William T. Thurman | 204 |
| PMH | Chief Judge Peggy Hunt | 321 |
| JTM | (Add other judges as needed) | TBD |

### 9.4 Import Service Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    PDF IMPORT SERVICE                           │
│                   (Runs every 5 minutes)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. FETCH          2. PARSE           3. TRANSFORM    4. LOAD  │
│  ┌──────────┐     ┌──────────┐       ┌──────────┐   ┌────────┐ │
│  │  Check   │     │  Extract │       │  Map to  │   │ Upsert │ │
│  │  Drupal  │────▶│   PDF    │──────▶│   API    │──▶│  via   │ │
│  │  for new │     │  Content │       │  Format  │   │  API   │ │
│  │   PDFs   │     │          │       │          │   │        │ │
│  └──────────┘     └──────────┘       └──────────┘   └────────┘ │
│       │                                                   │     │
│       ▼                                                   ▼     │
│  ┌──────────┐                                      ┌──────────┐ │
│  │  Track   │                                      │ Emit WS  │ │
│  │ imported │                                      │  events  │ │
│  │   files  │                                      │          │ │
│  └──────────┘                                      └──────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 9.5 PDF Parsing Rules

#### Header Extraction
```
Line 1: "U.S. BANKRUPTCY COURT"
Line 2: "FOR THE DISTRICT OF UTAH"
Line 3: Judge name (e.g., "Honorable William T. Thurman")
Line 4: Calendar date (e.g., "Thursday, February 19, 2026")
Line 5: Generated timestamp (e.g., "Current as of 02/3/2026 at 3:40 PM")
Line 6+: Zoom info if present:
         "Judge Thurman Zoom Hearing"
         "This meeting is by Zoom. Go to ZoomGov.com/join..."
         "Passcode 9626637"
         "Enter Meeting ID 160 7523 8590"
```

#### Entry Extraction Pattern
```
TIME      ADVERSARY#    ADVERSARY_TITLE (if adversary proceeding)
          †Ch ##        († indicates adversary, Ch = chapter)
          STATUS_NOTE   (if stricken or reserved)
          CASE#         CASE_TITLE
          Trustee:      TRUSTEE_NAME (if Ch 7 or 13)
          Moving:       ATTORNEY_NAME
          Opposing:     PARTY_NAMES (may be multiple lines)
          Matter:       HEARING_MATTER
          Comment:      COMMENT_TEXT (optional)
```

#### Status Detection
| PDF Text | Status Value |
|----------|--------------|
| "Stricken from the calendar" | `stricken` |
| "Reserved-Inactive Hearing" | `reserved` |
| (none) | `scheduled` |

### 9.6 Import Configuration

```typescript
interface ImportConfig {
  // Polling
  poll_interval_minutes: number;     // Default: 5
  drupal_base_url: string;           // https://www.utb.uscourts.gov
  calendar_path: string;             // /sites/utb/files/anticipated_calendars/
  
  // Parsing
  judge_codes: Record<string, string>;  // { "WTT": "Honorable William T. Thurman" }
  
  // Import behavior
  upsert_by: string[];               // ["case_number", "hearing_date", "hearing_time"]
  import_stricken: boolean;          // true - import but mark as stricken
  lookback_days: number;             // 1 - also check yesterday's calendars
  lookahead_days: number;            // 30 - import up to 30 days ahead
  
  // Tracking
  track_imported_files: boolean;     // true - don't re-import same file
  retention_days: number;            // 90 - keep import history
}
```

### 9.7 Zoom Hearing Display

When `is_zoom: true` on the calendar, the display shows Zoom connection info prominently:

```
┌────────────────────────────────────────────────────────────────┐
│ ┌──────────────────────────┐  ┌─────────────────────────────┐  │
│ │      U.S. COURTS SEAL    │  │  Salt Lake City  | ☀️ 45°F  │  │
│ │   U.S. Bankruptcy Court  │  │  2:28 PM  Thursday          │  │
│ │   District of Utah       │  │                             │  │
│ └──────────────────────────┘  └─────────────────────────────┘  │
├────────────────────────────────────────────────────────────────┤
│           📹 ZOOM HEARING - Judge Thurman - Room 204          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Join: ZoomGov.com/join    Meeting ID: 160 7523 8590     │  │
│  │  Phone: 1+(669)254-5252    Passcode: 9626637             │  │
│  └──────────────────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────────────────┤
│  NAME              │ CH │   TIME    │  CASE #   │   MATTER    │
├────────────────────────────────────────────────────────────────┤
│  ░░ Pilkington, R  │†11 │ 10:00 AM  │ 24-25863  │ Pretrial    │
│  (STRICKEN)        │    │           │           │             │
├────────────────────────────────────────────────────────────────┤
│  Griffin, S & J    │ 13 │  2:30 PM  │ 21-22434  │ Obj Dismiss │
│  Fife, Stacy K     │ 13 │  2:30 PM  │ 21-23277  │ Modify Plan │
│  Moreno, Jacqueline│ 13 │  2:30 PM  │ 25-21166  │ Settlement  │
│  ... (more entries)                                            │
├────────────────────────────────────────────────────────────────┤
│  🚫📱  Please turn your phones OFF in the Courthouse          │
├────────────────────────────────────────────────────────────────┤
│  ▶▶ Next in-person calendar: Monday, February 23...           │
└────────────────────────────────────────────────────────────────┘
```

**Visual indicators:**
- 📹 Zoom icon in header when remote hearing
- Zoom connection box prominently displayed below header
- Stricken entries shown with ░░ strikethrough effect and grayed out
- †11 indicates adversary proceeding (dagger prefix)
- Multiple entries at same time grouped visually

---

## 9. Technology Stack

### 9.1 Selected Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Display Client** | HTML5 + CSS3 + Vanilla JS | Lightweight, runs anywhere, no build step |
| **Admin Portal** | Flutter Web | Cross-platform (web + mobile), modern UI |
| **Backend API** | Node.js + Express + TypeScript | Fast development, excellent async handling |
| **Database** | PostgreSQL | Robust, great JSON support, free |
| **Real-time** | Socket.io | Reliable WebSocket abstraction |
| **Caching** | Redis (optional) | Session storage, rate limiting |

### 9.2 API-First Architecture

The system is designed API-first, meaning all functionality is accessible via REST API. The admin portal and display clients are simply consumers of the API.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        API CONSUMERS                                │
├─────────────────┬─────────────────┬─────────────────┬───────────────┤
│  Flutter Admin  │  Display Client │  CM/ECF Script  │  Curl/Postman │
│     Portal      │   (HTML5/JS)    │   (Python)      │   (Testing)   │
└────────┬────────┴────────┬────────┴────────┬────────┴───────┬───────┘
         │                 │                 │                │
         ▼                 ▼                 ▼                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     NODE.JS REST API                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │   /docket    │  │  /displays   │  │/announcements│              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │    /auth     │  │   /config    │  │   /health    │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
├─────────────────────────────────────────────────────────────────────┤
│                     SOCKET.IO (Real-time)                           │
│            Events: docket:update, announcement:new, display:refresh │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │      PostgreSQL        │
                    │  + Redis (optional)    │
                    └────────────────────────┘
```

### 9.3 Integration Patterns

#### Pattern A: Admin Portal (Interactive)
Human operator uses Flutter web app to manage docket entries, configure displays, and manage announcements. Changes propagate to displays in real-time via Socket.io.

#### Pattern B: Direct API (Automation)
Scripts or external systems call the REST API directly using API keys. Example use cases:
- Python script pulls from CM/ECF and pushes to signage API
- Scheduled task clears docket at end of day
- Emergency alert system pushes to ticker

#### Pattern C: Hybrid
Automated import runs nightly/hourly, with admin portal for manual corrections and overrides.

### 9.4 API Authentication

| Consumer Type | Auth Method | Permissions |
|---------------|-------------|-------------|
| Admin Portal | JWT (user login via AD/ADFS) | Full access based on role |
| Display Client | API Key (per-display) | Read-only for own display |
| Automation Scripts | API Key (service account) | Configurable per key |
| Public (optional) | None | Read-only docket (if enabled) |

```
# Example API key header
Authorization: Bearer sk_live_abc123...

# Example JWT header (admin portal)
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

### 9.5 Python Integration Example

For CM/ECF or other automation, a Python script can push updates:

```python
import requests
from datetime import datetime

API_BASE = "https://signage.utb.uscourts.gov/api/v1"
API_KEY = "sk_live_your_key_here"

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

# Add a docket entry
entry = {
    "case_number": "26-20125",
    "debtor_name": "Johnson, Michael",
    "hearing_time": "14:00",
    "courtroom": "321",
    "hearing_type": "341_meeting",
    "date": datetime.now().strftime("%Y-%m-%d")
}

response = requests.post(f"{API_BASE}/docket", json=entry, headers=headers)
print(response.json())

# Bulk import
entries = [
    {"case_number": "26-20126", "debtor_name": "Smith, Jane", ...},
    {"case_number": "26-20127", "debtor_name": "Williams, Robert", ...},
]
response = requests.post(f"{API_BASE}/docket/bulk", json=entries, headers=headers)
```

### 9.6 Folder Structure

```
courthouse-signage/
├── api/                        # Node.js backend
│   ├── src/
│   │   ├── routes/
│   │   │   ├── docket.ts
│   │   │   ├── displays.ts
│   │   │   ├── announcements.ts
│   │   │   └── auth.ts
│   │   ├── models/
│   │   ├── middleware/
│   │   ├── services/
│   │   └── index.ts
│   ├── prisma/                 # Database schema
│   │   └── schema.prisma
│   ├── package.json
│   └── tsconfig.json
│
├── display/                    # HTML5 display client
│   ├── index.html
│   ├── css/
│   │   └── styles.css
│   ├── js/
│   │   └── app.js
│   └── assets/
│       └── court-seal.png
│
├── admin/                      # Flutter web app
│   ├── lib/
│   │   ├── main.dart
│   │   ├── screens/
│   │   ├── widgets/
│   │   ├── models/
│   │   └── services/
│   ├── pubspec.yaml
│   └── web/
│
├── scripts/                    # Python automation scripts
│   ├── cmecf_sync.py
│   ├── daily_clear.py
│   └── requirements.txt
│
├── docker-compose.yml
└── README.md
```

---

## 10. Success Metrics

| Metric | Target |
|--------|--------|
| Display uptime | 99.5% during business hours |
| Data freshness | < 60 seconds from entry to display |
| Admin task completion | < 2 minutes to add single entry |
| User satisfaction | Positive feedback from clerks and public |

---

## 11. Appendices

### Appendix A: Reference Design Analysis

The provided reference image shows a "Johnston Town County Court" design with:
- Yellow header with court seal and name
- Blue info widget with weather (85°F) and time (10:12 PM Monday)
- 12-row docket table with gradient blue rows
- Column headers: NAME, ROOM, TIME, CASE #
- Yellow phone-off notice
- Yellow ticker with local news

This design will be adapted for U.S. Bankruptcy Court branding and federal courthouse aesthetics.

### Appendix B: Courtroom List (Example)

| Room | Description |
|------|-------------|
| 201 | Courtroom 1 - Judge [Name] |
| 210 | Courtroom 2 - Judge [Name] |
| 213 | Courtroom 3 - Judge [Name] |
| 225 | Courtroom 4 - Judge [Name] |
| 231 | 341 Meeting Room A |
| 245 | 341 Meeting Room B |
| 301 | Conference Room A |
| 304 | Conference Room B |
| 305 | Conference Room C |
| 321 | Large Conference Room |
| 331 | Training Room |

### Appendix C: Weather API Options

| Provider | Notes |
|----------|-------|
| **NWS API** | Free, no API key, US only, federal-friendly |
| **OpenWeatherMap** | Freemium, API key required |
| **Internal** | Manual entry, no external dependency |

**Recommendation**: National Weather Service API (api.weather.gov) - free, reliable, appropriate for federal use.

### Appendix D: Flutter Admin Portal - pubspec.yaml

```yaml
name: courthouse_signage_admin
description: Admin portal for U.S. Bankruptcy Court digital signage system
publish_to: 'none'
version: 1.0.0+1

environment:
  sdk: '>=3.2.0 <4.0.0'

dependencies:
  flutter:
    sdk: flutter
  
  # State Management
  flutter_riverpod: ^2.4.9
  riverpod_annotation: ^2.3.3
  
  # Networking
  dio: ^5.4.0
  retrofit: ^4.0.3
  socket_io_client: ^2.0.3+1
  
  # UI Components
  flutter_adaptive_scaffold: ^0.1.7+1
  data_table_2: ^2.5.8
  fl_chart: ^0.66.0
  
  # Forms & Validation
  reactive_forms: ^16.1.1
  
  # Date/Time
  intl: ^0.18.1
  
  # Storage
  shared_preferences: ^2.2.2
  flutter_secure_storage: ^9.0.0
  
  # Auth
  flutter_appauth: ^6.0.3
  
  # Utils
  freezed_annotation: ^2.4.1
  json_annotation: ^4.8.1
  logger: ^2.0.2+1
  
  # Icons
  cupertino_icons: ^1.0.6
  material_design_icons_flutter: ^7.0.7296

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^3.0.1
  build_runner: ^2.4.8
  freezed: ^2.4.6
  json_serializable: ^6.7.1
  retrofit_generator: ^8.0.6
  riverpod_generator: ^2.3.9

flutter:
  uses-material-design: true
  
  assets:
    - assets/images/
    - assets/icons/
  
  fonts:
    - family: Roboto
      fonts:
        - asset: assets/fonts/Roboto-Regular.ttf
        - asset: assets/fonts/Roboto-Bold.ttf
          weight: 700
```

### Appendix E: Node.js Backend - package.json

```json
{
  "name": "courthouse-signage-api",
  "version": "1.0.0",
  "description": "Backend API for U.S. Bankruptcy Court digital signage",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "db:migrate": "prisma migrate dev",
    "db:generate": "prisma generate",
    "db:seed": "tsx prisma/seed.ts",
    "test": "vitest",
    "lint": "eslint src/"
  },
  "dependencies": {
    "@prisma/client": "^5.9.0",
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "dotenv": "^16.4.1",
    "express": "^4.18.2",
    "express-rate-limit": "^7.1.5",
    "helmet": "^7.1.0",
    "jsonwebtoken": "^9.0.2",
    "socket.io": "^4.7.4",
    "winston": "^3.11.0",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.5",
    "@types/node": "^20.11.5",
    "prisma": "^5.9.0",
    "tsx": "^4.7.0",
    "typescript": "^5.3.3",
    "vitest": "^1.2.1"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

### Appendix F: Prisma Database Schema

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model DocketEntry {
  id                 String       @id @default(uuid())
  scheduleId         String?      @map("schedule_id")
  
  // Case Information
  caseNumber         String       @map("case_number")           // "24-25863"
  caseTitle          String       @map("case_title")            // "Robert Ray Pilkington..."
  caseChapter        String       @map("case_chapter")          // "7", "11", "13"
  adversaryNumber    String?      @map("adversary_number")      // For adversary proceedings
  adversaryTitle     String?      @map("adversary_title")       // "Smith v. Jones et al"
  
  // Hearing Information
  hearingDate        DateTime     @map("hearing_date") @db.Date
  hearingTime        String       @map("hearing_time")          // "14:30" (stored 24hr)
  hearingMatter      String       @map("hearing_matter")
  hearingJudge       String       @map("hearing_judge")
  courtroom          String?
  
  // Participants
  movingParty        String?      @map("moving_party")
  opposingParty      String?      @map("opposing_party")        // May contain newlines
  trustee            String?
  
  // Zoom Information
  isZoom             Boolean      @default(false) @map("is_zoom")
  zoomMeetingId      String?      @map("zoom_meeting_id")
  zoomPasscode       String?      @map("zoom_passcode")
  zoomPhone          String?      @map("zoom_phone")
  
  // Status
  status             EntryStatus  @default(SCHEDULED)
  statusNote         String?      @map("status_note")           // "Stricken from calendar"
  comment            String?                                    // "Planning Report due..."
  
  // Metadata
  createdAt          DateTime     @default(now()) @map("created_at")
  updatedAt          DateTime     @updatedAt @map("updated_at")
  createdBy          String?      @map("created_by")
  
  displays           DisplayDocketEntry[]
  
  @@unique([caseNumber, hearingDate, hearingTime], name: "unique_hearing")
  @@map("docket_entries")
  @@index([hearingDate])
  @@index([hearingJudge])
  @@index([courtroom])
  @@index([status])
}

model CalendarMetadata {
  id                 String       @id @default(uuid())
  judgeName          String       @map("judge_name")
  judgeCode          String       @map("judge_code")            // "WTT", "PMH"
  courtroom          String?
  calendarDate       DateTime     @map("calendar_date") @db.Date
  generatedAt        DateTime?    @map("generated_at")
  isZoomCalendar     Boolean      @default(false) @map("is_zoom_calendar")
  zoomMeetingId      String?      @map("zoom_meeting_id")
  zoomPasscode       String?      @map("zoom_passcode")
  zoomPhone          String?      @map("zoom_phone")
  parameters         String?                                    // "Show Stricken, Show Watermark"
  sourceFilename     String?      @map("source_filename")
  createdAt          DateTime     @default(now()) @map("created_at")
  
  @@unique([judgeCode, calendarDate], name: "unique_calendar")
  @@map("calendar_metadata")
}

model Display {
  id              String    @id
  name            String
  
  // Filtering
  judgeFilter     String?   @map("judge_filter")       // "WTT" or full name
  courtroomFilter String?   @map("courtroom_filter")
  chapterFilter   String[]  @default([]) @map("chapter_filter")  // ["7", "13"]
  
  // Display Options
  showStricken    Boolean   @default(false) @map("show_stricken")
  showZoomInfo    Boolean   @default(true) @map("show_zoom_info")
  showAdversary   Boolean   @default(true) @map("show_adversary")
  showTrustee     Boolean   @default(false) @map("show_trustee")
  showAttorneys   Boolean   @default(false) @map("show_attorneys")
  highlightCurrent Boolean  @default(true) @map("highlight_current")
  
  // Visual Configuration
  location        String?
  theme           String    @default("default")
  columns         String[]  @default(["case_title", "case_chapter", "hearing_time", "case_number", "hearing_matter"])
  
  // Weather & Info
  showWeather     Boolean   @default(true) @map("show_weather")
  weatherLocation String?   @map("weather_location")
  noticeText      String    @default("Please turn your phones OFF in the Courthouse") @map("notice_text")
  tickerEnabled   Boolean   @default(true) @map("ticker_enabled")
  tickerSpeed     String    @default("medium") @map("ticker_speed")
  
  // Status
  status          String    @default("unknown")
  lastHeartbeat   DateTime? @map("last_heartbeat")
  ipAddress       String?   @map("ip_address")
  apiKeyHash      String?   @map("api_key_hash")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")
  
  docketEntries   DisplayDocketEntry[]
  
  @@map("displays")
}

model DisplayDocketEntry {
  displayId      String       @map("display_id")
  docketEntryId  String       @map("docket_entry_id")
  
  display        Display      @relation(fields: [displayId], references: [id], onDelete: Cascade)
  docketEntry    DocketEntry  @relation(fields: [docketEntryId], references: [id], onDelete: Cascade)
  
  @@id([displayId, docketEntryId])
  @@map("display_docket_entries")
}

model Announcement {
  id          String    @id @default(uuid())
  text        String    @db.VarChar(500)
  priority    Int       @default(10)
  enabled     Boolean   @default(true)
  expiresAt   DateTime? @map("expires_at")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")
  createdBy   String?   @map("created_by")
  
  @@map("announcements")
  @@index([enabled, expiresAt])
}

model ApiKey {
  id          String    @id @default(uuid())
  name        String
  keyHash     String    @unique @map("key_hash")
  keyPrefix   String    @map("key_prefix")
  permissions String[]
  displayId   String?   @map("display_id")
  expiresAt   DateTime? @map("expires_at")
  lastUsedAt  DateTime? @map("last_used_at")
  createdAt   DateTime  @default(now()) @map("created_at")
  
  @@map("api_keys")
}

model AuditLog {
  id         String   @id @default(uuid())
  action     String
  entityType String   @map("entity_type")
  entityId   String?  @map("entity_id")
  userId     String?  @map("user_id")
  apiKeyId   String?  @map("api_key_id")
  changes    Json?
  ipAddress  String?  @map("ip_address")
  createdAt  DateTime @default(now()) @map("created_at")
  
  @@map("audit_logs")
  @@index([createdAt])
  @@index([entityType, entityId])
}

enum EntryStatus {
  SCHEDULED
  IN_PROGRESS  @map("in_progress")
  COMPLETED
  CANCELLED
  CONTINUED
  STRICKEN
  RESERVED     // Reserved-Inactive
}
```

### Appendix G: Docker Compose Configuration

```yaml
# docker-compose.yml
version: '3.8'

services:
  api:
    build:
      context: ./api
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://signage:${DB_PASSWORD}@db:5432/signage
      - JWT_SECRET=${JWT_SECRET}
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis
    restart: unless-stopped
    networks:
      - signage-net

  display:
    build:
      context: ./display
      dockerfile: Dockerfile
    ports:
      - "8080:80"
    restart: unless-stopped
    networks:
      - signage-net

  admin:
    build:
      context: ./admin
      dockerfile: Dockerfile
    ports:
      - "8081:80"
    restart: unless-stopped
    networks:
      - signage-net

  db:
    image: postgres:16-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_USER=signage
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=signage
    restart: unless-stopped
    networks:
      - signage-net

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: unless-stopped
    networks:
      - signage-net

volumes:
  postgres_data:
  redis_data:

networks:
  signage-net:
    driver: bridge
```

### Appendix H: Python PDF Import Service

```python
#!/usr/bin/env python3
"""
Court Calendar PDF Import Service
Fetches calendar PDFs from Drupal and imports to signage API

Usage:
  python pdf_import_service.py                    # Run once
  python pdf_import_service.py --daemon           # Run continuously
  python pdf_import_service.py --file calendar.pdf  # Parse single file
"""

import argparse
import hashlib
import logging
import re
import time
from dataclasses import dataclass, field
from datetime import datetime, date, timedelta
from pathlib import Path
from typing import List, Optional, Dict, Any
import requests

# PDF parsing - install with: pip install pdfplumber
import pdfplumber

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# =============================================================================
# Configuration
# =============================================================================

CONFIG = {
    "drupal_base_url": "https://www.utb.uscourts.gov",
    "calendar_path": "/sites/utb/files/anticipated_calendars/",
    "signage_api_url": "http://localhost:3000/api/v1",
    "api_key": "sk_live_your_service_key_here",
    
    "poll_interval_minutes": 5,
    "lookback_days": 1,
    "lookahead_days": 30,
    
    "judge_codes": {
        "WTT": "Honorable William T. Thurman",
        "PMH": "Chief Judge Peggy Hunt",
        # Add other judges as needed
    }
}

# =============================================================================
# Data Classes
# =============================================================================

@dataclass
class ZoomInfo:
    meeting_id: str
    passcode: str
    phone: str = "1+(669)254-5252"
    url: str = "ZoomGov.com/join"

@dataclass
class CalendarEntry:
    case_number: str
    case_title: str
    case_chapter: str
    hearing_date: str          # YYYY-MM-DD
    hearing_time: str          # HH:MM (24hr)
    hearing_matter: str
    hearing_judge: str
    courtroom: Optional[str] = None
    adversary_number: Optional[str] = None
    adversary_title: Optional[str] = None
    moving_party: Optional[str] = None
    opposing_party: Optional[str] = None
    trustee: Optional[str] = None
    status: str = "scheduled"
    status_note: Optional[str] = None
    comment: Optional[str] = None
    is_zoom: bool = False
    zoom_meeting_id: Optional[str] = None
    zoom_passcode: Optional[str] = None

@dataclass  
class CalendarMetadata:
    judge_name: str
    judge_code: str
    courtroom: str
    calendar_date: str         # YYYY-MM-DD
    generated_at: Optional[str] = None
    is_zoom_calendar: bool = False
    zoom_info: Optional[ZoomInfo] = None
    source_filename: Optional[str] = None

@dataclass
class ParsedCalendar:
    metadata: CalendarMetadata
    entries: List[CalendarEntry] = field(default_factory=list)

# =============================================================================
# PDF Parser
# =============================================================================

class CourtCalendarParser:
    """Parser for U.S. Bankruptcy Court calendar PDFs"""
    
    # Regex patterns
    TIME_PATTERN = re.compile(r'^(\d{1,2}:\d{2}\s*[AP]M)')
    CASE_NUMBER_PATTERN = re.compile(r'(\d{2}-\d{5})')
    CHAPTER_PATTERN = re.compile(r'[†]?Ch\s*(\d+)')
    ZOOM_ID_PATTERN = re.compile(r'Meeting ID[:\s]*(\d[\d\s]+\d)')
    ZOOM_PASSCODE_PATTERN = re.compile(r'Passcode[:\s]*(\d+)')
    DATE_PATTERN = re.compile(r'(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+(\w+\s+\d+,\s+\d{4})')
    GENERATED_PATTERN = re.compile(r'Current as of\s+(\d+/\d+/\d+)\s+at\s+(\d+:\d+\s*[AP]M)')
    
    def __init__(self):
        self.current_time: Optional[str] = None
        self.is_adversary: bool = False
        
    def parse_file(self, pdf_path: str) -> ParsedCalendar:
        """Parse a calendar PDF file"""
        logger.info(f"Parsing: {pdf_path}")
        
        with pdfplumber.open(pdf_path) as pdf:
            full_text = "\n".join(page.extract_text() or "" for page in pdf.pages)
        
        # Parse filename for metadata hints
        filename = Path(pdf_path).name
        file_meta = self._parse_filename(filename)
        
        # Parse header
        metadata = self._parse_header(full_text, file_meta)
        metadata.source_filename = filename
        
        # Parse entries
        entries = self._parse_entries(full_text, metadata)
        
        logger.info(f"Parsed {len(entries)} entries for {metadata.calendar_date}")
        return ParsedCalendar(metadata=metadata, entries=entries)
    
    def _parse_filename(self, filename: str) -> Dict[str, str]:
        """Parse metadata from filename: WTT-204-20260203-20260302-153839588.pdf"""
        parts = filename.replace('.pdf', '').split('-')
        if len(parts) >= 4:
            return {
                "judge_code": parts[0],
                "courtroom": parts[1],
                "start_date": parts[2],
                "end_date": parts[3],
            }
        return {}
    
    def _parse_header(self, text: str, file_meta: Dict) -> CalendarMetadata:
        """Extract calendar metadata from header"""
        lines = text.split('\n')[:20]  # Header is in first ~20 lines
        
        judge_name = ""
        calendar_date = ""
        generated_at = None
        is_zoom = False
        zoom_info = None
        
        for line in lines:
            # Judge name
            if line.startswith("Honorable") or line.startswith("Chief Judge"):
                judge_name = line.strip()
            
            # Calendar date
            date_match = self.DATE_PATTERN.search(line)
            if date_match:
                date_str = date_match.group(2)
                parsed = datetime.strptime(date_str, "%B %d, %Y")
                calendar_date = parsed.strftime("%Y-%m-%d")
            
            # Generated timestamp
            gen_match = self.GENERATED_PATTERN.search(line)
            if gen_match:
                generated_at = f"{gen_match.group(1)} {gen_match.group(2)}"
            
            # Zoom detection
            if "Zoom Hearing" in line or "ZoomGov.com" in line:
                is_zoom = True
            
            # Zoom details
            if is_zoom:
                zoom_id = self.ZOOM_ID_PATTERN.search(line)
                zoom_pass = self.ZOOM_PASSCODE_PATTERN.search(line)
                if zoom_id or zoom_pass:
                    zoom_info = zoom_info or ZoomInfo("", "")
                    if zoom_id:
                        zoom_info.meeting_id = zoom_id.group(1).replace(" ", "")
                    if zoom_pass:
                        zoom_info.passcode = zoom_pass.group(1)
        
        # Use file metadata as fallback
        judge_code = file_meta.get("judge_code", "")
        if not judge_name and judge_code in CONFIG["judge_codes"]:
            judge_name = CONFIG["judge_codes"][judge_code]
        
        return CalendarMetadata(
            judge_name=judge_name,
            judge_code=judge_code,
            courtroom=file_meta.get("courtroom", ""),
            calendar_date=calendar_date,
            generated_at=generated_at,
            is_zoom_calendar=is_zoom,
            zoom_info=zoom_info
        )
    
    def _parse_entries(self, text: str, metadata: CalendarMetadata) -> List[CalendarEntry]:
        """Parse hearing entries from calendar text"""
        entries = []
        lines = text.split('\n')
        
        current_entry: Optional[Dict[str, Any]] = None
        current_time = ""
        
        i = 0
        while i < len(lines):
            line = lines[i].strip()
            
            # Skip empty lines and page headers
            if not line or "U.S. BANKRUPTCY COURT" in line or "Page " in line:
                i += 1
                continue
            
            # Check for time (starts new hearing block)
            time_match = self.TIME_PATTERN.match(line)
            if time_match:
                # Save previous entry
                if current_entry and current_entry.get("case_number"):
                    entries.append(self._build_entry(current_entry, metadata))
                
                # Start new entry
                current_time = self._convert_to_24hr(time_match.group(1))
                current_entry = {
                    "hearing_time": current_time,
                    "hearing_date": metadata.calendar_date,
                    "hearing_judge": metadata.judge_name,
                    "courtroom": metadata.courtroom,
                    "is_zoom": metadata.is_zoom_calendar,
                    "status": "scheduled"
                }
                
                # Rest of line might have adversary info
                rest = line[time_match.end():].strip()
                if rest:
                    self._parse_entry_line(rest, current_entry)
                
                i += 1
                continue
            
            # Parse entry details
            if current_entry:
                self._parse_entry_line(line, current_entry)
            
            i += 1
        
        # Don't forget last entry
        if current_entry and current_entry.get("case_number"):
            entries.append(self._build_entry(current_entry, metadata))
        
        return entries
    
    def _parse_entry_line(self, line: str, entry: Dict[str, Any]):
        """Parse a single line and update entry dict"""
        
        # Status indicators
        if "Stricken from the calendar" in line:
            entry["status"] = "stricken"
            entry["status_note"] = "Stricken from the calendar"
            return
        if "Reserved-Inactive" in line:
            entry["status"] = "reserved"
            entry["status_note"] = "Reserved-Inactive Hearing"
            return
        
        # Chapter (with optional adversary marker)
        chapter_match = self.CHAPTER_PATTERN.search(line)
        if chapter_match:
            entry["case_chapter"] = chapter_match.group(1)
            if line.startswith("†"):
                entry["is_adversary"] = True
            return
        
        # Case number and title
        case_match = self.CASE_NUMBER_PATTERN.search(line)
        if case_match and "case_number" not in entry:
            entry["case_number"] = case_match.group(1)
            # Title is everything after case number
            title_start = case_match.end()
            if title_start < len(line):
                entry["case_title"] = line[title_start:].strip()
            return
        
        # Adversary number (appears before main case)
        if case_match and "case_number" in entry and "adversary_number" not in entry:
            # This might be the underlying case
            pass
        
        # Trustee
        if line.startswith("Trustee:"):
            entry["trustee"] = line.replace("Trustee:", "").strip()
            return
        
        # Moving party
        if line.startswith("Moving:"):
            entry["moving_party"] = line.replace("Moving:", "").strip()
            return
        
        # Opposing party
        if line.startswith("Opposing:"):
            entry["opposing_party"] = line.replace("Opposing:", "").strip()
            return
        
        # Matter
        if line.startswith("Matter:"):
            entry["hearing_matter"] = line.replace("Matter:", "").strip()
            return
        
        # Comment
        if line.startswith("Comment:"):
            entry["comment"] = line.replace("Comment:", "").strip()
            return
        
        # Append to opposing party if we're in that section
        if entry.get("opposing_party") and not any(
            line.startswith(p) for p in ["Moving:", "Matter:", "Comment:", "Trustee:"]
        ):
            # Might be continuation of opposing party names
            if not self.CASE_NUMBER_PATTERN.search(line) and not self.TIME_PATTERN.match(line):
                entry["opposing_party"] += "\n" + line
    
    def _build_entry(self, data: Dict[str, Any], metadata: CalendarMetadata) -> CalendarEntry:
        """Build CalendarEntry from parsed data"""
        return CalendarEntry(
            case_number=data.get("case_number", ""),
            case_title=data.get("case_title", ""),
            case_chapter=data.get("case_chapter", ""),
            hearing_date=data.get("hearing_date", metadata.calendar_date),
            hearing_time=data.get("hearing_time", ""),
            hearing_matter=data.get("hearing_matter", ""),
            hearing_judge=data.get("hearing_judge", metadata.judge_name),
            courtroom=data.get("courtroom", metadata.courtroom),
            adversary_number=data.get("adversary_number"),
            adversary_title=data.get("adversary_title"),
            moving_party=data.get("moving_party"),
            opposing_party=data.get("opposing_party"),
            trustee=data.get("trustee"),
            status=data.get("status", "scheduled"),
            status_note=data.get("status_note"),
            comment=data.get("comment"),
            is_zoom=data.get("is_zoom", metadata.is_zoom_calendar),
            zoom_meeting_id=metadata.zoom_info.meeting_id if metadata.zoom_info else None,
            zoom_passcode=metadata.zoom_info.passcode if metadata.zoom_info else None,
        )
    
    def _convert_to_24hr(self, time_str: str) -> str:
        """Convert '2:30 PM' to '14:30'"""
        time_str = time_str.strip().upper()
        match = re.match(r'(\d{1,2}):(\d{2})\s*(AM|PM)', time_str)
        if match:
            hour = int(match.group(1))
            minute = match.group(2)
            period = match.group(3)
            
            if period == "PM" and hour != 12:
                hour += 12
            elif period == "AM" and hour == 12:
                hour = 0
            
            return f"{hour:02d}:{minute}"
        return time_str


# =============================================================================
# API Client
# =============================================================================

class SignageAPIClient:
    """Client for pushing data to signage API"""
    
    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url.rstrip('/')
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
    
    def push_calendar(self, calendar: ParsedCalendar) -> bool:
        """Push parsed calendar to API"""
        payload = {
            "calendar_metadata": {
                "judge_name": calendar.metadata.judge_name,
                "judge_code": calendar.metadata.judge_code,
                "courtroom": calendar.metadata.courtroom,
                "calendar_date": calendar.metadata.calendar_date,
                "is_zoom_calendar": calendar.metadata.is_zoom_calendar,
            },
            "entries": [self._entry_to_dict(e) for e in calendar.entries],
            "options": {
                "upsert_by": ["case_number", "hearing_date", "hearing_time"],
                "clear_existing_date": False
            }
        }
        
        if calendar.metadata.zoom_info:
            payload["calendar_metadata"]["zoom_info"] = {
                "meeting_id": calendar.metadata.zoom_info.meeting_id,
                "passcode": calendar.metadata.zoom_info.passcode,
                "phone": calendar.metadata.zoom_info.phone,
            }
        
        try:
            response = requests.post(
                f"{self.base_url}/docket/bulk",
                json=payload,
                headers=self.headers,
                timeout=30
            )
            
            if response.status_code in (200, 201):
                result = response.json()
                logger.info(
                    f"Import successful: {result.get('data', {}).get('created', 0)} created, "
                    f"{result.get('data', {}).get('updated', 0)} updated"
                )
                return True
            else:
                logger.error(f"API error {response.status_code}: {response.text}")
                return False
                
        except requests.RequestException as e:
            logger.error(f"Request failed: {e}")
            return False
    
    def _entry_to_dict(self, entry: CalendarEntry) -> Dict[str, Any]:
        """Convert CalendarEntry to API dict"""
        return {
            "case_number": entry.case_number,
            "case_title": entry.case_title,
            "case_chapter": entry.case_chapter,
            "hearing_date": entry.hearing_date,
            "hearing_time": entry.hearing_time,
            "hearing_matter": entry.hearing_matter,
            "hearing_judge": entry.hearing_judge,
            "courtroom": entry.courtroom,
            "adversary_number": entry.adversary_number,
            "adversary_title": entry.adversary_title,
            "moving_party": entry.moving_party,
            "opposing_party": entry.opposing_party,
            "trustee": entry.trustee,
            "status": entry.status,
            "status_note": entry.status_note,
            "comment": entry.comment,
            "is_zoom": entry.is_zoom,
            "zoom_meeting_id": entry.zoom_meeting_id,
            "zoom_passcode": entry.zoom_passcode,
        }


# =============================================================================
# Import Service
# =============================================================================

class CalendarImportService:
    """Service to poll Drupal and import new calendars"""
    
    def __init__(self):
        self.parser = CourtCalendarParser()
        self.api_client = SignageAPIClient(
            CONFIG["signage_api_url"],
            CONFIG["api_key"]
        )
        self.imported_files: set = set()
    
    def run_once(self):
        """Check for new calendars and import them"""
        logger.info("Checking for new calendar PDFs...")
        
        # In production, you'd scrape the Drupal directory listing
        # or use a known URL pattern with date ranges
        # For now, this shows the pattern:
        
        today = date.today()
        for judge_code in CONFIG["judge_codes"].keys():
            for days_ahead in range(CONFIG["lookahead_days"]):
                check_date = today + timedelta(days=days_ahead)
                # Try to fetch calendar for this judge/date
                # URL pattern would need to be determined from Drupal structure
                pass
        
        logger.info("Import check complete")
    
    def import_file(self, pdf_path: str) -> bool:
        """Import a single PDF file"""
        try:
            calendar = self.parser.parse_file(pdf_path)
            return self.api_client.push_calendar(calendar)
        except Exception as e:
            logger.error(f"Failed to import {pdf_path}: {e}")
            return False
    
    def run_daemon(self):
        """Run continuously, polling for new calendars"""
        logger.info(f"Starting import daemon (interval: {CONFIG['poll_interval_minutes']} min)")
        
        while True:
            try:
                self.run_once()
            except Exception as e:
                logger.error(f"Import cycle failed: {e}")
            
            time.sleep(CONFIG["poll_interval_minutes"] * 60)


# =============================================================================
# Main
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description="Court Calendar PDF Import Service")
    parser.add_argument("--daemon", action="store_true", help="Run continuously")
    parser.add_argument("--file", type=str, help="Import a single PDF file")
    args = parser.parse_args()
    
    service = CalendarImportService()
    
    if args.file:
        success = service.import_file(args.file)
        return 0 if success else 1
    elif args.daemon:
        service.run_daemon()
    else:
        service.run_once()
    
    return 0


if __name__ == "__main__":
    exit(main())
```

### Appendix I: Import Service Requirements

```txt
# requirements.txt for PDF import service
pdfplumber>=0.10.0
requests>=2.31.0
python-dateutil>=2.8.2
```

---

*Document Control: This specification is subject to review and approval by court administration before implementation begins.*
