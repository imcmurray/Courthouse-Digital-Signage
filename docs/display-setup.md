# Display Setup Guide

Step-by-step instructions for setting up a Raspberry Pi as a dedicated courthouse digital signage kiosk, from bare hardware to a fully running display.

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

## Recommended Hardware

| Component | Recommendation | Notes |
|-----------|---------------|-------|
| **Board** | Raspberry Pi 4 Model B (2 GB+) or Pi 5 | Pi 3B+ works but slower initial page load |
| **Storage** | 16 GB+ microSD card (Class 10 / A1) | 32 GB recommended for longevity |
| **Power** | Official USB-C power supply (5V 3A) | Underpowered supplies cause crashes and SD corruption |
| **HDMI cable** | Micro-HDMI to HDMI (Pi 4/5) or full HDMI (Pi 3) | Use the HDMI 0 port (closest to USB-C power) |
| **Display** | Any TV or monitor with HDMI input | 1920x1080 landscape or 1080x1920 portrait |
| **Network** | Ethernet (preferred) or Wi-Fi | Ethernet avoids wireless dropouts |
| **Case** | Optional, passive-cooled or VESA-mount | A VESA case lets you mount the Pi behind the display |

## Step 1: Install Raspberry Pi OS

### Download and flash

1. Download **Raspberry Pi Imager** from https://www.raspberrypi.com/software/ on your computer
2. Insert the microSD card into your computer
3. Open Raspberry Pi Imager and configure:
   - **Device:** Select your Pi model
   - **Operating System:** Raspberry Pi OS (64-bit) — the full desktop version (not Lite)
   - **Storage:** Select your microSD card
4. Click the **gear icon** (or "Edit Settings") to pre-configure:
   - **Hostname:** something descriptive, e.g. `courtroom-321`
   - **Username / Password:** set a username and password (the default `pi` user is fine)
   - **Wi-Fi:** enter your network credentials if not using Ethernet
   - **Locale:** set your timezone and keyboard layout
   - **SSH:** enable SSH (under Services tab) so you can manage the Pi remotely
5. Click **Write** and wait for it to finish

> **Why the full desktop version?** The signage display runs in Chromium, which needs a graphical desktop environment. Raspberry Pi OS Lite does not include one.

### First boot

1. Insert the microSD card into the Pi
2. Connect HDMI, Ethernet (if using), and power
3. The Pi will boot to the desktop — initial setup takes 1-2 minutes on first boot
4. If you configured Wi-Fi in the imager, it should connect automatically

### Verify SSH access

From another computer on the same network:

```bash
ssh pi@courtroom-321.local
# or by IP address:
ssh pi@192.168.1.50
```

All remaining steps can be done over SSH, so you don't need a keyboard/mouse connected to the Pi.

## Step 2: System Configuration

### Update the system

```bash
sudo apt-get update && sudo apt-get upgrade -y
```

### Set the timezone

The Pi's system clock should match your courthouse timezone. This was likely set in the imager, but verify:

```bash
# Check current timezone
timedatectl

# Set timezone if needed (example: US Mountain Time)
sudo timedatectl set-timezone America/Denver
```

### Configure display resolution

Most displays auto-negotiate the correct resolution over HDMI. If you need to force a specific resolution:

```bash
sudo raspi-config
```

Navigate to **Display Options > Resolution** and select:
- **1920x1080 (landscape)** for standard widescreen displays
- For portrait-mode displays, select 1920x1080 and handle rotation (see [Portrait Mode](#portrait-mode) below)

### Disable screen blanking

By default, Raspberry Pi OS blanks the screen after 10 minutes of inactivity. Disable this:

```bash
sudo raspi-config
```

Navigate to **Display Options > Screen Blanking** and select **Off**.

Also disable DPMS (Display Power Management Signaling) in X11:

```bash
# Add to the end of /etc/xdg/lxsession/LXDE-pi/autostart
echo '@xset s off' | sudo tee -a /etc/xdg/lxsession/LXDE-pi/autostart
echo '@xset -dpms' | sudo tee -a /etc/xdg/lxsession/LXDE-pi/autostart
echo '@xset s noblank' | sudo tee -a /etc/xdg/lxsession/LXDE-pi/autostart
```

> **Note:** If you later set up the [HDMI power management](raspberry-pi-power-management.md) script, it will override DPMS as needed. Disabling blanking here just prevents the default screensaver from interfering.

### Disable desktop notifications and taskbar

For a clean kiosk display, hide the taskbar and disable the screen saver dialog:

```bash
# Hide the taskbar (LXDE panel)
# Edit the autostart to not launch lxpanel:
sudo sed -i 's/@lxpanel --profile LXDE-pi/# @lxpanel --profile LXDE-pi/' /etc/xdg/lxsession/LXDE-pi/autostart

# Disable the Pi's own screensaver
sudo apt-get remove -y xscreensaver
```

## Step 3: Install Kiosk Software

### Install required packages

```bash
sudo apt-get install -y chromium-browser unclutter
```

| Package | Purpose |
|---------|---------|
| `chromium-browser` | Full-screen web browser for the signage display |
| `unclutter` | Hides the mouse cursor after a brief idle period |

### Create the display configuration file

Store your display settings in a single config file so they're easy to update:

```bash
sudo mkdir -p /etc/signage
sudo tee /etc/signage/display.conf << 'EOF'
# Courthouse Digital Signage - Display Configuration
# Edit these values for your specific display

# Server hostname or IP address
SERVER=192.168.1.100

# Display ID (from the admin portal)
DISPLAY_ID=display-321-main

# Display API key (from the admin portal - shown once at creation)
API_KEY=your-api-key-here
EOF

sudo chmod 600 /etc/signage/display.conf
```

### Create the kiosk launch script

```bash
sudo tee /home/pi/kiosk.sh << 'SCRIPT'
#!/bin/bash

# Load display configuration
source /etc/signage/display.conf

# Wait for network connectivity
echo "Waiting for network..."
until ping -c1 "$SERVER" &>/dev/null; do
  sleep 2
done
echo "Network ready."

# Wait for X display to be available
while [ -z "$DISPLAY" ]; do
  export DISPLAY=:0
  sleep 1
done

# Hide the mouse cursor
unclutter -idle 0.5 -root &

# Clean up any Chromium crash flags from previous session
CHROMIUM_DIR="/home/pi/.config/chromium"
if [ -d "$CHROMIUM_DIR/Default" ]; then
  sed -i 's/"exited_cleanly":false/"exited_cleanly":true/' \
    "$CHROMIUM_DIR/Default/Preferences" 2>/dev/null
  sed -i 's/"exit_type":"Crashed"/"exit_type":"Normal"/' \
    "$CHROMIUM_DIR/Default/Preferences" 2>/dev/null
fi

# Launch Chromium in kiosk mode
exec chromium-browser \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-restore-session-state \
  --disable-features=TranslateUI \
  --disable-component-update \
  --check-for-update-interval=31536000 \
  --autoplay-policy=no-user-gesture-required \
  --incognito \
  "http://${SERVER}:8080/?displayId=${DISPLAY_ID}&apiKey=${API_KEY}"
SCRIPT

chmod +x /home/pi/kiosk.sh
```

### Chromium flags explained

| Flag | Purpose |
|------|---------|
| `--kiosk` | Full-screen mode, no address bar or window controls |
| `--noerrdialogs` | Suppress error dialogs that would block the display |
| `--disable-infobars` | Hide the "Chromium is being controlled" bar |
| `--disable-session-crashed-bubble` | Don't show "restore pages" prompt after a crash |
| `--disable-restore-session-state` | Always start fresh instead of restoring old tabs |
| `--disable-features=TranslateUI` | Disable the translation popup |
| `--disable-component-update` | Prevent background component updates |
| `--check-for-update-interval=31536000` | Don't check for updates (1 year interval) |
| `--autoplay-policy=no-user-gesture-required` | Allow auto-playing content without user interaction |
| `--incognito` | Don't save browsing history or cache between restarts |

## Step 4: Auto-Start on Boot

### Create a systemd service

```bash
sudo tee /etc/systemd/system/kiosk.service << 'EOF'
[Unit]
Description=Courthouse Digital Signage Kiosk
After=graphical.target network-online.target
Wants=network-online.target

[Service]
User=pi
Environment=DISPLAY=:0
Environment=XAUTHORITY=/home/pi/.Xauthority
ExecStart=/home/pi/kiosk.sh
Restart=on-failure
RestartSec=10

[Install]
WantedBy=graphical.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable kiosk.service
```

### Reboot and verify

```bash
sudo reboot
```

After reboot, the Pi should:

1. Boot to the desktop (no taskbar)
2. Launch Chromium in full-screen kiosk mode
3. Load the signage display with the court header, docket, weather, and announcements
4. Hide the mouse cursor

## Step 5: Register the Display in Admin

If you haven't already created the display in the admin portal:

1. Log in to the admin portal at `http://<server-ip>:5173`
2. Go to **Displays** and click **Add Display**
3. Fill in:
   - **Display ID** — must match `DISPLAY_ID` in `/etc/signage/display.conf`
   - **Name** — e.g., "Courtroom 321 Main Display"
   - **Location** — e.g., "Third Floor, Outside Courtroom 321"
4. Configure filters (judge, courtroom) to show only relevant hearings
5. Click **Register Display**
6. **Copy the API key** and update `/etc/signage/display.conf` on the Pi:

```bash
ssh pi@courtroom-321.local
sudo nano /etc/signage/display.conf
# Update the API_KEY value, save, then restart kiosk:
sudo systemctl restart kiosk.service
```

## Display Client URL Format

The kiosk script constructs this URL automatically from `/etc/signage/display.conf`, but if you ever need to build it manually:

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

## Portrait Mode

For vertically-mounted displays (1080x1920):

### 1. Rotate the display output

Add a rotation setting to `/boot/firmware/config.txt` (or `/boot/config.txt` on older Pi OS):

```bash
# Rotate 90 degrees clockwise
echo 'display_hdmi_rotate=1' | sudo tee -a /boot/firmware/config.txt

# Or for other rotations:
# display_hdmi_rotate=1  → 90° clockwise
# display_hdmi_rotate=2  → 180°
# display_hdmi_rotate=3  → 90° counter-clockwise
```

Alternatively, for Pi 4/5 with the KMS video driver, use the display configuration tool:

```bash
sudo raspi-config
# Display Options > Screen Rotation
```

### 2. Set portrait orientation in admin

Edit the display in the admin portal and set **Orientation** to **Portrait**. The display client will automatically adjust its layout for 1080x1920.

### 3. Reboot

```bash
sudo reboot
```

## Network Configuration

### Static IP (recommended)

A static IP prevents the display from losing connectivity if DHCP assignments change.

Edit `/etc/dhcpcd.conf`:

```bash
sudo nano /etc/dhcpcd.conf
```

Add at the bottom (adjust for your network):

```
interface eth0
static ip_address=192.168.1.50/24
static routers=192.168.1.1
static domain_name_servers=192.168.1.1 8.8.8.8
```

For Wi-Fi, replace `eth0` with `wlan0`.

```bash
sudo reboot
```

### Firewall considerations

The Pi needs **outbound** access to:

| Destination | Port | Purpose |
|-------------|------|---------|
| Signage server | 8080 | Load the display client HTML/CSS/JS |
| Signage server | 3000 | Backend API and WebSocket connection |
| api.weather.gov | 443 | Weather data (fetched by the browser) |

No inbound ports need to be open on the Pi unless you want SSH access (port 22).

## Automatic Recovery

The systemd service is configured to restart Chromium if it crashes. For additional resilience:

### Watchdog: daily reboot

A nightly reboot clears any accumulated memory leaks and ensures a clean state each morning:

```bash
# Reboot at 5:00 AM daily (before court hours)
echo '0 5 * * * root /sbin/reboot' | sudo tee /etc/cron.d/daily-reboot
```

### Watchdog: network recovery

If the network drops and Chromium shows a connection error, you may want to automatically reload the page when connectivity returns. The display client already handles this with its reconnection logic and offline indicator, but for severe network outages you can add a connectivity watchdog:

```bash
sudo tee /home/pi/network-watchdog.sh << 'SCRIPT'
#!/bin/bash
source /etc/signage/display.conf

# If we can't reach the server, restart the kiosk when it comes back
if ! ping -c3 "$SERVER" &>/dev/null; then
  echo "$(date): Server unreachable, waiting for recovery..."
  until ping -c1 "$SERVER" &>/dev/null; do sleep 10; done
  echo "$(date): Server reachable again, restarting kiosk"
  systemctl restart kiosk.service
fi
SCRIPT

chmod +x /home/pi/network-watchdog.sh

# Run every 5 minutes
echo '*/5 * * * * pi /home/pi/network-watchdog.sh >> /var/log/network-watchdog.log 2>&1' | \
  sudo tee /etc/cron.d/network-watchdog
```

## Optional: HDMI Power Management

To automatically turn the display off outside court hours (saving energy and panel life), see the [HDMI Power Management Guide](raspberry-pi-power-management.md). It covers:

- Configuring an active hours schedule in the admin portal
- Software screensaver (black screen, bouncing clock, or bouncing logo)
- Hardware HDMI power control via a companion script on the Pi

## Maintenance

### Updating the Pi

```bash
sudo apt-get update && sudo apt-get upgrade -y
sudo reboot
```

### Changing the display configuration

Edit `/etc/signage/display.conf` and restart the kiosk:

```bash
sudo nano /etc/signage/display.conf
sudo systemctl restart kiosk.service
```

### Viewing logs

```bash
# Kiosk service logs
journalctl -u kiosk.service -f

# Chromium console output (if errors appear)
journalctl -u kiosk.service --since "10 minutes ago"
```

### Remote access

SSH into the Pi from any computer on the network:

```bash
ssh pi@courtroom-321.local
# or
ssh pi@192.168.1.50
```

To view the screen remotely (for debugging), you can install VNC:

```bash
sudo raspi-config
# Interface Options > VNC > Enable
```

Then connect with a VNC client to `courtroom-321.local:5900`.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Black screen after boot, no desktop | OS didn't boot or HDMI not detected | Check power supply (must be 5V 3A); try a different HDMI cable; check the microSD card is seated |
| Desktop appears but no Chromium | kiosk.service not running | Run `sudo systemctl status kiosk.service` and check for errors |
| Chromium opens but shows "connection refused" | Server not reachable or wrong IP | Verify `SERVER` in `/etc/signage/display.conf`; `ping` the server from the Pi |
| Display shows "OFFLINE" banner | API requests failing | Check network; verify `API_KEY` in config file matches what admin portal issued |
| Resolution looks wrong | Auto-negotiation picked wrong mode | Force resolution via `raspi-config` > Display Options > Resolution |
| Screen goes black after 10 minutes | Screen blanking still enabled | Run `raspi-config` > Display Options > Screen Blanking > Off; verify DPMS is disabled |
| Mouse cursor visible | `unclutter` not running | Check kiosk.sh includes the unclutter line; install with `sudo apt-get install unclutter` |
| Chromium shows "restore pages" dialog | Didn't clean crash flags | The kiosk.sh script handles this; verify the sed commands are present |
| Display rotated the wrong way | Wrong rotation value | Adjust `display_hdmi_rotate` in config.txt (1=90CW, 2=180, 3=90CCW) |
| Pi runs hot / throttles | Inadequate cooling | Add a heatsink or fan; check `vcgencmd measure_temp` (should be under 80C) |

## Quick Reference

### Key files on the Pi

| File | Purpose |
|------|---------|
| `/etc/signage/display.conf` | Server URL, display ID, and API key |
| `/home/pi/kiosk.sh` | Chromium kiosk launch script |
| `/etc/systemd/system/kiosk.service` | systemd service for auto-start |

### Useful commands

```bash
# Restart the display
sudo systemctl restart kiosk.service

# Stop the display
sudo systemctl stop kiosk.service

# Check display status
sudo systemctl status kiosk.service

# View live logs
journalctl -u kiosk.service -f

# Check Pi temperature
vcgencmd measure_temp

# Check available memory
free -h

# Check disk usage
df -h
```

## Multiple Displays

Each courtroom gets its own display configuration:

1. Create a separate display in the admin portal for each screen
2. Configure each with appropriate judge/courtroom/chapter filters
3. Each Pi gets its own `DISPLAY_ID` and `API_KEY` in `/etc/signage/display.conf`
4. All Pis point to the same server

## Related Documentation

- [HDMI Power Management](raspberry-pi-power-management.md) — Schedule-based HDMI power control and screensaver configuration
