# Courthouse Digital Signage System

A digital signage system for the Frank E. Moss U.S. Courthouse that displays daily court docket information, announcements, and real-time data on HDMI-connected displays positioned outside courtrooms.

## Overview

This system consists of three main components:

1. **Backend API** - Node.js/Express REST API with WebSocket support
2. **Admin Portal** - React-based content management interface
3. **Display Client** - HTML5 kiosk display for courtroom screens

## Technology Stack

### Backend
- Node.js 20+ with Express
- TypeScript
- Prisma ORM with SQLite (dev) / PostgreSQL (prod)
- Socket.io for real-time updates
- JWT authentication

### Admin Portal
- React 18 with TypeScript
- Tailwind CSS
- React Query (TanStack Query)
- React Router v6
- React Hook Form with Zod validation

### Display Client
- HTML5 + CSS3 + Vanilla JavaScript
- Full HD (1920x1080) optimized
- Chromium kiosk mode compatible

## Project Structure

```
moss-dig-sig-2026/
├── backend/                 # Backend API server
│   ├── src/
│   │   ├── routes/         # API route handlers
│   │   ├── middleware/     # Express middleware
│   │   ├── services/       # Business logic
│   │   ├── utils/          # Utility functions
│   │   └── types/          # TypeScript types
│   └── prisma/             # Database schema and migrations
├── admin/                   # Admin portal (React)
│   └── src/
│       ├── components/     # React components
│       ├── pages/          # Page components
│       ├── hooks/          # Custom hooks
│       ├── services/       # API services
│       ├── types/          # TypeScript types
│       └── utils/          # Utility functions
├── display/                 # Display client (HTML5)
│   ├── css/                # Stylesheets
│   ├── js/                 # JavaScript
│   └── assets/             # Images and icons
├── init.sh                  # Development setup script
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 20 or higher
- npm
- SQLite3 (optional, for database inspection)

### Quick Start

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd moss-dig-sig-2026
   ```

2. Run the setup script:
   ```bash
   ./init.sh
   ```

3. Access the applications:
   - **Backend API**: http://localhost:3000
   - **Admin Portal**: http://localhost:5173
   - **Display Client**: http://localhost:8080

### Default Credentials

- **Email**: admin@courthouse.gov
- **Password**: admin123

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/refresh` - Refresh JWT token
- `GET /api/auth/me` - Get current user

### Docket
- `GET /api/docket` - List entries (with filters)
- `POST /api/docket` - Create entry
- `POST /api/docket/bulk` - Bulk create entries
- `GET /api/docket/:id` - Get entry
- `PUT /api/docket/:id` - Update entry
- `DELETE /api/docket/:id` - Delete entry

### Displays
- `GET /api/displays` - List displays
- `POST /api/displays` - Register display
- `GET /api/displays/:id` - Get display
- `PUT /api/displays/:id` - Update display
- `DELETE /api/displays/:id` - Remove display
- `GET /api/displays/:id/docket` - Get filtered docket
- `POST /api/displays/:id/heartbeat` - Display heartbeat

### Announcements
- `GET /api/announcements` - List announcements
- `POST /api/announcements` - Create announcement
- `GET /api/announcements/:id` - Get announcement
- `PUT /api/announcements/:id` - Update announcement
- `DELETE /api/announcements/:id` - Delete announcement

### System
- `GET /api/health` - Health check with DB status
- `GET /api/settings` - Get global settings
- `PUT /api/settings` - Update settings (admin)
- `GET /api/audit-logs` - Query audit logs (admin)

## User Roles

| Role | Permissions |
|------|-------------|
| **Admin** | Full access to all features |
| **Editor** | Manage docket entries and announcements |
| **Viewer** | Read-only access to dashboard |

## Display Features

- Court seal and branding header
- Weather widget with NWS integration
- Docket table with auto-scroll
- Zoom meeting information display
- Notice banner
- Scrolling announcement ticker
- Offline mode with cached data
- Real-time updates via WebSocket

## Development

### Running Individual Components

**Backend only:**
```bash
cd backend
npm run dev
```

**Admin portal only:**
```bash
cd admin
npm run dev
```

**Display client only:**
```bash
cd display
npx serve -l 8080 .
```

### Database Management

```bash
cd backend

# Generate Prisma client
npx prisma generate

# Apply migrations
npx prisma migrate deploy

# Open database GUI
npx prisma studio
```

## License

Internal use only - U.S. Courts
