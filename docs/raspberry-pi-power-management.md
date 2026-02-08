# Raspberry Pi HDMI Power Management

Automatically turn Raspberry Pi HDMI output on and off based on a per-display active hours schedule configured in the admin portal. This saves energy and extends display panel life by powering off screens outside of court hours.

> **Prerequisite:** Your Pi should already be running in kiosk mode. See [Display Setup Guide](display-setup.md) for initial setup.

## How It Works

The system has two layers of power management that work together:

```
┌──────────────────────────────────────────────────────────────────┐
│  Admin Portal                                                    │
│                                                                  │
│  Display Settings ─► Schedule: Mon-Fri 7:00 AM - 6:00 PM       │
│                      Screensaver: Bouncing Clock                 │
│                      Sleep / Wake buttons (manual override)      │
└──────────────────┬───────────────────────┬───────────────────────┘
                   │                       │
          WebSocket event           REST API poll
        (manual Sleep/Wake)       (every 60 seconds)
                   │                       │
                   ▼                       ▼
┌──────────────────────────┐  ┌────────────────────────────────────┐
│  Display Client (browser)│  │  display-power.sh (systemd)        │
│                          │  │                                    │
│  Software screensaver:   │  │  Hardware HDMI power:              │
│  - Black screen          │  │  - vcgencmd display_power 0/1     │
│  - Bouncing clock        │  │  - xset dpms force off/on         │
│  - Bouncing court logo   │  │                                    │
└──────────────────────────┘  └────────────────────────────────────┘
```

| Layer | What it does | When to use |
|-------|-------------|-------------|
| **Software screensaver** | Shows a black screen, bouncing clock, or bouncing logo overlay inside the browser | Always active; provides visual indication that the display is in sleep mode |
| **Hardware HDMI power** | Turns the HDMI signal off entirely via `vcgencmd` or `xset` | Optional; actually powers down the display panel to save energy |

Both layers read from the same schedule. The software screensaver runs automatically inside the display client. The hardware power script (`display-power.sh`) runs as a separate systemd service on the Pi.

## Step 1: Configure the Schedule in Admin

1. Log in to the admin portal
2. Go to **Displays** and click **Edit** on the display
3. Scroll to **Schedule & Screensaver**
4. Check **Enable Active Hours Schedule**
5. Set the active hours for each day:
   - Check the box next to each day the display should be on
   - Set the start and end times (24-hour format)
   - Unchecked days = display sleeps all day
6. Choose a **Screensaver Style**:
   - **Black Screen** — simple blackout
   - **Moving Clock** — bouncing digital clock with gold glow
   - **Bouncing Court Logo** — DVD-style bouncing court seal
7. Click **Update**

### Typical courthouse schedule

| Day | Active Hours |
|-----|-------------|
| Monday - Friday | 7:00 AM - 6:00 PM |
| Saturday | Off |
| Sunday | Off |

### Manual Sleep/Wake

For ad-hoc control (e.g., special events, early closure), use the **Sleep** and **Wake** buttons in the Displays table. These appear for online displays and send an immediate signal via WebSocket. The manual override resets automatically when the screensaver next deactivates.

## Step 2: Verify the Software Screensaver

The software screensaver works automatically with no extra setup on the Pi. Once you've configured the schedule and saved:

1. The display client fetches the schedule when it loads (`GET /api/displays/:id/config`)
2. Every 30 seconds, it checks whether the current time falls within active hours
3. **Outside active hours:** the screensaver overlay appears (fullscreen, covers all content)
4. **During active hours:** the overlay hides and all data refreshes (docket, announcements, weather)

To test: set the schedule end time to a minute from now and wait. The screensaver should activate when the end time passes.

## Step 3: Install the HDMI Power Script (Optional)

The hardware power script physically turns the HDMI output off, which powers down connected displays. This is optional but recommended for energy savings.

### Copy the script to the Pi

```bash
# From your development machine
scp scripts/display-power.sh pi@<pi-ip>:/home/pi/display-power.sh

# On the Pi
chmod +x /home/pi/display-power.sh
```

### Test it manually

```bash
# Single check (does not loop)
/home/pi/display-power.sh \
  --display-id display-321-main \
  --api-url http://192.168.1.100:3000 \
  --api-key YOUR_DISPLAY_API_KEY \
  --once
```

You should see output like:

```
[2026-02-08 18:05:01] Starting display power manager for display-321-main (poll: 60s, method: vcgencmd)
[2026-02-08 18:05:01] Display power set to off (method: vcgencmd)
```

If neither `vcgencmd` nor `xset` is available, the script runs in dry-run mode and logs what it would do.

### Set up the systemd service

Create `/etc/systemd/system/display-power.service`:

```ini
[Unit]
Description=Display HDMI Power Management
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/home/pi/display-power.sh \
  --display-id display-321-main \
  --api-url http://192.168.1.100:3000 \
  --api-key YOUR_DISPLAY_API_KEY
Restart=always
RestartSec=30
User=pi

[Install]
WantedBy=multi-user.target
```

Replace `display-321-main`, the server IP, and the API key with your actual values.

```bash
sudo systemctl daemon-reload
sudo systemctl enable display-power.service
sudo systemctl start display-power.service

# Check status
sudo systemctl status display-power.service

# View logs
journalctl -u display-power.service -f
```

### Script options

| Flag | Default | Description |
|------|---------|-------------|
| `--display-id` | (required) | Display ID from the admin portal |
| `--api-url` | (required) | Backend server URL (e.g., `http://192.168.1.100:3000`) |
| `--api-key` | (required) | Display API key |
| `--poll-interval` | `60` | Seconds between schedule checks |
| `--once` | (flag) | Check once and exit (useful for cron) |

### Using cron instead of systemd

If you prefer cron over a long-running service:

```bash
# Check every minute
* * * * * /home/pi/display-power.sh --display-id display-321-main --api-url http://192.168.1.100:3000 --api-key YOUR_KEY --once >> /var/log/display-power.log 2>&1
```

## Requirements

The power script requires:

- **bash** and **curl** (pre-installed on Raspberry Pi OS)
- **python3** with `zoneinfo` module (Python 3.9+, standard on Raspberry Pi OS Bookworm)
- Network access to the backend API on port 3000

For HDMI control, one of:

| Method | Available on | Notes |
|--------|-------------|-------|
| `vcgencmd display_power` | Raspberry Pi OS (all models) | Preferred; controls the GPU HDMI output directly |
| `xset dpms force` | Any Linux with X11 | Fallback; requires `DISPLAY=:0` environment variable |

If neither is available, the script logs what it would do (dry-run mode).

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Script logs `ERROR: Failed to fetch schedule` | Can't reach the API | Check network, verify `--api-url` and `--api-key` |
| HDMI doesn't turn off | `vcgencmd` not in PATH for systemd | Add `Environment=PATH=/usr/bin:/opt/vc/bin` to the service file |
| Screen turns off but Pi stays on | Expected behavior | The script only controls HDMI output, not the Pi itself |
| Screensaver doesn't activate in browser | Schedule not enabled or config not fetched | Check the schedule is enabled in admin; check browser console for API errors |
| Times are wrong | Timezone mismatch | Set the timezone in admin Settings; the script and display client both use it |
| `xset` fails with "unable to open display" | Missing DISPLAY variable | Add `Environment=DISPLAY=:0` to the systemd service file |
| Wake button doesn't work | Display is offline / WebSocket disconnected | Check display status in admin; the Pi must have an active WebSocket connection |

## Multiple Displays

Each Pi runs its own instance of `display-power.sh` with its own `--display-id` and `--api-key`. Each display can have an independent schedule (e.g., a lobby display stays on longer than a courtroom display).

If running multiple displays from a single Pi (unusual but possible), create separate service files:

```bash
display-power-lobby.service    → --display-id display-lobby
display-power-courtroom.service → --display-id display-321-main
```
