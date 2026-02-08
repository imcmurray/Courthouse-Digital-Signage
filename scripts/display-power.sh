#!/usr/bin/env bash
# display-power.sh — Raspberry Pi HDMI power management based on display schedule
#
# Usage:
#   ./display-power.sh --display-id DISPLAY_ID --api-url http://server:3000 --api-key YOUR_KEY
#
# Options:
#   --display-id   The display ID configured in the admin panel
#   --api-url      Base URL of the signage backend (e.g. http://192.168.1.100:3000)
#   --api-key      Display API key for authentication
#   --poll-interval  Seconds between schedule checks (default: 60)
#   --once         Check once and exit (for cron usage)
#
# The script polls GET /api/displays/:id/schedule and uses the schedule + timezone
# to determine whether HDMI output should be on or off.
#
# Power control methods (in order of preference):
#   1. vcgencmd display_power 0/1  (Raspberry Pi firmware)
#   2. xset dpms force off/on      (X11 fallback)
#   3. Dry-run logging             (if neither is available)
#
# ---- systemd service template ----
# Save as /etc/systemd/system/display-power.service
#
# [Unit]
# Description=Display HDMI Power Management
# After=network-online.target
# Wants=network-online.target
#
# [Service]
# Type=simple
# ExecStart=/opt/signage/scripts/display-power.sh \
#   --display-id display-321-main \
#   --api-url http://192.168.1.100:3000 \
#   --api-key YOUR_API_KEY_HERE
# Restart=always
# RestartSec=30
# User=pi
#
# [Install]
# WantedBy=multi-user.target
# ---- end template ----

set -euo pipefail

DISPLAY_ID=""
API_URL=""
API_KEY=""
POLL_INTERVAL=60
RUN_ONCE=false
CURRENT_STATE="" # "on" or "off" — tracks current HDMI state to avoid redundant commands

usage() {
  echo "Usage: $0 --display-id ID --api-url URL --api-key KEY [--poll-interval SECS] [--once]"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --display-id)   DISPLAY_ID="$2"; shift 2 ;;
    --api-url)      API_URL="$2"; shift 2 ;;
    --api-key)      API_KEY="$2"; shift 2 ;;
    --poll-interval) POLL_INTERVAL="$2"; shift 2 ;;
    --once)         RUN_ONCE=true; shift ;;
    *)              usage ;;
  esac
done

[[ -z "$DISPLAY_ID" || -z "$API_URL" || -z "$API_KEY" ]] && usage

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

# Determine which power control method is available
if command -v vcgencmd &>/dev/null; then
  POWER_METHOD="vcgencmd"
elif command -v xset &>/dev/null; then
  POWER_METHOD="xset"
else
  POWER_METHOD="dryrun"
  log "WARNING: Neither vcgencmd nor xset found. Running in dry-run mode."
fi

set_display_power() {
  local desired="$1" # "on" or "off"

  if [[ "$CURRENT_STATE" == "$desired" ]]; then
    return 0
  fi

  case "$POWER_METHOD" in
    vcgencmd)
      if [[ "$desired" == "on" ]]; then
        vcgencmd display_power 1 >/dev/null 2>&1
      else
        vcgencmd display_power 0 >/dev/null 2>&1
      fi
      ;;
    xset)
      if [[ "$desired" == "on" ]]; then
        xset dpms force on 2>/dev/null
      else
        xset dpms force off 2>/dev/null
      fi
      ;;
    dryrun)
      log "DRY-RUN: Would set display power to $desired"
      ;;
  esac

  CURRENT_STATE="$desired"
  log "Display power set to $desired (method: $POWER_METHOD)"
}

check_schedule() {
  local response
  response=$(curl -sf -H "X-API-Key: $API_KEY" \
    "${API_URL}/api/displays/${DISPLAY_ID}/schedule" 2>/dev/null) || {
    log "ERROR: Failed to fetch schedule from API"
    return 1
  }

  local schedule_enabled
  schedule_enabled=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('scheduleEnabled', False))" 2>/dev/null)

  if [[ "$schedule_enabled" != "True" ]]; then
    set_display_power "on"
    return 0
  fi

  local tz
  tz=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('timezone', 'America/Denver'))" 2>/dev/null)

  # Use python3 to evaluate schedule against current time in the correct timezone
  local should_be_on
  should_be_on=$(echo "$response" | python3 -c "
import sys, json
from datetime import datetime
try:
    from zoneinfo import ZoneInfo
except ImportError:
    from backports.zoneinfo import ZoneInfo

data = json.load(sys.stdin)
config = data.get('scheduleConfig', {})
tz = ZoneInfo('$tz')
now = datetime.now(tz)
day_name = now.strftime('%A').lower()
day_config = config.get(day_name)

if day_config is None:
    print('off')
elif not day_config.get('start') or not day_config.get('end'):
    print('on')
else:
    sh, sm = map(int, day_config['start'].split(':'))
    eh, em = map(int, day_config['end'].split(':'))
    current_min = now.hour * 60 + now.minute
    start_min = sh * 60 + sm
    end_min = eh * 60 + em
    print('on' if start_min <= current_min < end_min else 'off')
" 2>/dev/null)

  if [[ -z "$should_be_on" ]]; then
    log "ERROR: Failed to evaluate schedule"
    return 1
  fi

  set_display_power "$should_be_on"
}

log "Starting display power manager for $DISPLAY_ID (poll: ${POLL_INTERVAL}s, method: $POWER_METHOD)"

if [[ "$RUN_ONCE" == "true" ]]; then
  check_schedule
  exit $?
fi

while true; do
  check_schedule || true
  sleep "$POLL_INTERVAL"
done
