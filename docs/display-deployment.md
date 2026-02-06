# Display Client Deployment Guide

How to deploy the courthouse digital signage display to a Raspberry Pi (or any device) running Chromium in kiosk mode.

## Architecture

```
┌─────────────────────────────────┐       ┌──────────────────────┐
│  Server (Container)             │       │  Raspberry Pi        │
│                                 │       │                      │
│  ┌─────────────────────────┐    │       │  Chromium (kiosk)    │
│  │ Backend API  :3000      │◄───┼───────┼── API requests       │
│  │  - REST endpoints       │    │       │                      │
│  │  - WebSocket (Socket.io)│    │       │  Loads display from: │
│  │  - SQLite/PostgreSQL    │    │       │  http://<server>:8080 │
│  └─────────────────────────┘    │       └──────────────────────┘
│                                 │
│  ┌─────────────────────────┐    │
│  │ Display Client  :8080   │    │
│  │  - Static HTML/CSS/JS   │    │
│  │  - Served by nginx/serve│    │
│  └─────────────────────────┘    │
│                                 │
│  ┌─────────────────────────┐    │
│  │ Admin Portal  :5173     │    │
│  │  - React SPA            │    │
│  └─────────────────────────┘    │
└─────────────────────────────────┘
```

## Display Client URL Format

```
http://<server-ip>:8080/?displayId=<id>&apiKey=<key>
```

| Parameter   | Required | Description |
|-------------|----------|-------------|
| `displayId` | Yes      | The display ID created in the admin portal |
| `apiKey`    | Yes      | The API key returned when the display was created |
| `apiBase`   | No       | Override the API URL (defaults to same hostname, port 3000) |

### Examples

```
# Standard setup - API on same host, port 3000
http://192.168.1.100:8080/?displayId=display-321-main&apiKey=abc123def456...

# Custom API server location
http://192.168.1.100:8080/?apiBase=http://10.0.0.5:3000&displayId=display-321-main&apiKey=abc123...
```

### How the API URL is resolved

The display client automatically derives the backend API URL:

1. If `?apiBase=` is in the URL, use that
2. Otherwise, use the same protocol and hostname as the display page, on port 3000

This means `http://192.168.1.100:8080/` automatically connects to `http://192.168.1.100:3000`.

## Setup Steps

### 1. Create a Display in the Admin Portal

1. Log in to the admin portal at `http://<server-ip>:5173`
2. Go to **Displays** and click **Create Display**
3. Fill in:
   - **Display ID** - a slug like `display-321-main`
   - **Name** - human-readable name like "Courtroom 321 Main Display"
   - **Location** - physical location like "Third Floor, Outside Courtroom 321"
   - Configure filters (judge, courtroom, chapter) as needed
4. Save the display
5. **Copy the API key** - it is only shown once at creation time

### 2. Configure the Raspberry Pi

#### Install Chromium kiosk mode

```bash
# Install dependencies
sudo apt-get update
sudo apt-get install -y chromium-browser unclutter xdotool

# Disable screen blanking
sudo raspi-config  # Display Options > Screen Blanking > Off
```

#### Create the kiosk startup script

Create `/home/pi/kiosk.sh`:

```bash
#!/bin/bash

# Display configuration
SERVER="192.168.1.100"
DISPLAY_ID="display-321-main"
API_KEY="your-api-key-here"

# Wait for network
until ping -c1 $SERVER &>/dev/null; do sleep 1; done

# Hide cursor
unclutter -idle 0.5 -root &

# Launch Chromium in kiosk mode
chromium-browser \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-restore-session-state \
  --incognito \
  "http://${SERVER}:8080/?displayId=${DISPLAY_ID}&apiKey=${API_KEY}"
```

```bash
chmod +x /home/pi/kiosk.sh
```

#### Auto-start on boot

Add to `/etc/xdg/lxsession/LXDE-pi/autostart`:

```
@/home/pi/kiosk.sh
```

Or create a systemd service at `/etc/systemd/system/kiosk.service`:

```ini
[Unit]
Description=Courthouse Digital Signage Kiosk
After=graphical.target network-online.target
Wants=network-online.target

[Service]
User=pi
Environment=DISPLAY=:0
ExecStart=/home/pi/kiosk.sh
Restart=on-failure
RestartSec=10

[Install]
WantedBy=graphical.target
```

```bash
sudo systemctl enable kiosk.service
```

### 3. Verify the Connection

Once the Pi boots and Chromium opens, the display should show:

- Court branding header (name, subtitle, chief judge, clerk of court)
- Today's docket entries (filtered by the display's configuration)
- Weather widget
- Announcement ticker
- Notice banner

Check the browser console (if accessible) for any connection errors. Common issues:

| Symptom | Cause | Fix |
|---------|-------|-----|
| "OFFLINE" indicator | Can't reach backend API | Check network, verify server IP |
| 401 on `/config` and `/docket` | Invalid or missing API key | Verify the `apiKey` URL parameter |
| 404 on `/displays/:id/config` | Wrong display ID | Check `displayId` matches what's in admin |
| No docket entries | No entries for today / filter too narrow | Check docket in admin portal, check display filters |
| Court branding shows defaults | API key issue (branding still loads via public endpoint) | Verify `/api/settings/public` is reachable |

## Display Features Loaded Without API Key

Even without a valid API key, the display will show:

- **Court branding** (name, subtitle, chief judge, clerk of court, logo) — via `/api/settings/public`
- **Announcements** — via `/api/announcements?active=true`
- **Clock and date**

With a valid API key, it additionally loads:

- **Display-specific configuration** (filters, theme, columns, weather location)
- **Filtered docket entries** for the specific courtroom
- **Weather data**
- **Real-time WebSocket updates**

## Network Requirements

The Raspberry Pi needs network access to the server on these ports:

| Port | Protocol | Purpose |
|------|----------|---------|
| 8080 | HTTP     | Load the display client HTML/CSS/JS |
| 3000 | HTTP/WS  | Backend API and WebSocket connection |

## Multiple Displays

Each courtroom gets its own display configuration:

1. Create a separate display in the admin portal for each screen
2. Configure each with appropriate judge/courtroom/chapter filters
3. Each Pi gets its own `displayId` and `apiKey` in the kiosk URL
4. All Pis point to the same server
