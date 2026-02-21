/**
 * Courthouse Digital Signage - Display Client
 * Handles data fetching, rendering, and real-time updates
 */

(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    apiBaseUrl: getApiBaseUrl(),
    displayId: getDisplayId(),
    apiKey: getApiKey(),
    refreshInterval: 30000, // 30 seconds
    clockInterval: 1000, // 1 second
    weatherRefreshInterval: 900000, // 15 minutes
    tickerSpeed: 50, // pixels per second
  };

  // Derive API base URL: ?apiBase= param, same origin (behind proxy/nginx), or port 3000 fallback
  function getApiBaseUrl() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('apiBase')) return params.get('apiBase');
    const port = window.location.port;
    // Behind nginx (80/443) or served directly by backend (3000): use same origin
    if (!port || port === '80' || port === '443' || port === '3000') {
      return window.location.origin;
    }
    // Other ports (e.g. separate static server on 8080): assume backend on 3000
    return `${window.location.protocol}//${window.location.hostname}:3000`;
  }

  // State
  let isOnline = true;
  let lastUpdate = null;
  let docketData = [];
  let announcements = [];
  let displayConfig = {};
  let socket = null;

  // Pagination state
  let paginationState = {
    pages: [],           // Array of page HTML strings
    rotationOrder: [],   // Weighted index sequence for rotation
    currentIndex: 0,     // Current position in rotationOrder
    timer: null,         // setInterval ID
    active: false,       // Whether pagination is running
    pageSignature: '',   // Hash of page structure for soft-refresh detection
  };

  const PAGINATION_DWELL = 8000;   // ms per page
  const PAGINATION_FADE = 600;     // ms fade transition

  // Screensaver state
  let screensaverActive = false;
  let screensaverManualOverride = null; // null = auto, 'on' = forced, 'off' = forced
  let screensaverAnimationId = null;

  // Content card state
  let contentCardData = null;
  let contentCardSlides = [];
  let contentCardCurrentSlide = 0;
  let contentCardRotationTimer = null;
  let contentCardActive = false;

  // Emergency state
  let emergencyActive = false;
  let emergencyData = null;
  let emergencyLevel = 0;
  let emergencyPollTimer = null;

  // Template engine state
  var activeTemplate = null;
  var cameraGridInitialized = false;

  // =============================================
  // Display Component Registry & Default Templates
  // =============================================

  var DISPLAY_COMPONENTS = {
    'hearing-table':    { name: 'Hearing Table', description: 'Full docket table with columns' },
    'hearing-pills':    { name: 'Schedule Pills', description: 'Compact judge/room/time pill layout' },
    'content-cards':       { name: 'Content Cards', description: 'Info cards, news, statistics slideshow' },
    'direction-cards':  { name: 'Wayfinding Directions', description: 'Direction card grid' },
    'camera-grid':      { name: 'Camera Grid', description: 'RTSP camera tile grid' },
    'system-status':    { name: 'System Status', description: 'Database, uptime, display status' }
  };

  var DEFAULT_DISPLAY_TEMPLATES = {
    courtroom: {
      components: [
        { type: 'hearing-table', config: { viewMode: 'smart' } },
        { type: 'content-cards', config: { mode: 'interleave-pagination' } }
      ],
      layout: null // single flex column
    },
    chambers: {
      components: [
        { type: 'hearing-table', config: { viewMode: 'smart', hideColumns: ['judge'] } },
        { type: 'content-cards', config: { mode: 'interleave-pagination' } }
      ],
      layout: null
    },
    combined: {
      components: [
        { type: 'hearing-table', config: { viewMode: 'all' } },
        { type: 'content-cards', config: { mode: 'interleave-pagination' } }
      ],
      layout: null
    },
    wayfinding: {
      components: [
        { type: 'hearing-pills', config: {}, gridArea: { landscape: 'left', portrait: 'top' } },
        { type: 'direction-cards', config: {}, gridArea: { landscape: 'right', portrait: 'bottom' } },
        { type: 'content-cards', config: { mode: 'replace-panel', target: 'hearing-pills' } }
      ],
      layout: {
        landscape: { columns: '40% 60%', rows: '1fr', areas: [['left', 'right']] },
        portrait: { columns: '1fr', rows: '45% 55%', areas: [['top'], ['bottom']] }
      }
    },
    'it-status': {
      components: [
        { type: 'camera-grid', config: {}, gridArea: { landscape: 'cameras', portrait: 'cameras' } },
        { type: 'system-status', config: {}, gridArea: { landscape: 'status', portrait: 'status' } },
        { type: 'hearing-pills', config: {}, gridArea: { landscape: 'pills', portrait: 'pills' } },
        { type: 'content-cards', config: { mode: 'replace-panel', target: 'hearing-pills' } }
      ],
      layout: {
        landscape: { columns: '60% 40%', rows: '1fr auto', areas: [['cameras', 'pills'], ['status', 'pills']] },
        portrait: { columns: '1fr', rows: '1fr auto 1fr', areas: [['cameras'], ['status'], ['pills']] }
      }
    }
  };

  // Get display ID from URL or default
  function getDisplayId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('displayId') || 'display-default';
  }

  // Get API key from URL or localStorage
  function getApiKey() {
    const params = new URLSearchParams(window.location.search);
    return params.get('apiKey') || localStorage.getItem('displayApiKey') || '';
  }

  // Initialize display
  async function init() {
    console.log('Initializing display:', CONFIG.displayId);

    // Start clock
    updateClock();
    setInterval(updateClock, CONFIG.clockInterval);

    // Fetch initial data — config must resolve first so displayType is known
    fetchCourtBranding();
    await fetchDisplayConfig();
    fetchDocket();
    fetchAnnouncements();
    fetchWeather();
    fetchContentCards();
    fetchEmergencyStatus();

    // Set up refresh intervals
    setInterval(fetchDocket, CONFIG.refreshInterval);
    setInterval(fetchAnnouncements, CONFIG.refreshInterval);
    setInterval(fetchContentCards, 300000); // Refresh content cards every 5 minutes
    setInterval(fetchWeather, CONFIG.weatherRefreshInterval);
    emergencyPollTimer = setInterval(fetchEmergencyStatus, 30000); // Poll emergency status every 30 seconds as fallback

    // Set up schedule checker (runs every 30 seconds)
    setInterval(checkSchedule, 30000);

    // Set up WebSocket connection
    setupWebSocket();

    // Handle online/offline status
    window.addEventListener('online', () => handleConnectionChange(true));
    window.addEventListener('offline', () => handleConnectionChange(false));
  }

  // Update clock
  function updateClock() {
    const now = new Date();
    const timeEl = document.getElementById('time');
    const dayEl = document.getElementById('day');
    const dateEl = document.getElementById('date');

    if (timeEl) {
      timeEl.textContent = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    }

    if (dayEl) {
      dayEl.textContent = now.toLocaleDateString('en-US', {
        weekday: 'long',
      });
    }

    if (dateEl) {
      dateEl.textContent = now.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    }
  }

  // Show or hide the separator between subtitle and courthouse name
  function updateCourthouseSep() {
    var sep = document.getElementById('courthouse-sep');
    var subtitle = document.getElementById('court-subtitle');
    var courthouse = document.getElementById('courthouse-name');
    if (sep) {
      var show = subtitle && subtitle.textContent && courthouse && courthouse.textContent;
      sep.textContent = ' | ';
      sep.classList.toggle('visible', !!show);
    }
  }

  // Fetch public court branding (no API key needed)
  async function fetchCourtBranding() {
    try {
      const response = await fetch(`${CONFIG.apiBaseUrl}/api/settings/public`);
      if (response.ok) {
        const data = await response.json();

        const courtTitleEl = document.getElementById('court-title');
        if (courtTitleEl && data.courtName) courtTitleEl.textContent = data.courtName;

        const courtSubtitleEl = document.getElementById('court-subtitle');
        if (courtSubtitleEl && data.courtSubtitle) courtSubtitleEl.textContent = data.courtSubtitle;

        const courthouseNameEl = document.getElementById('courthouse-name');
        if (courthouseNameEl) courthouseNameEl.textContent = data.courthouseName || '';

        updateCourthouseSep();

        const officialsEl = document.getElementById('court-officials');
        if (officialsEl) {
          const parts = [];
          if (data.chiefJudge) parts.push(data.chiefJudge + ', Chief Judge');
          if (data.clerkOfCourt) parts.push(data.clerkOfCourt + ', Clerk of Court');
          officialsEl.textContent = parts.join(' | ');
        }

        if (data.courtLogo) {
          const courtSealEl = document.getElementById('court-seal');
          if (courtSealEl) {
            courtSealEl.src = `${CONFIG.apiBaseUrl}${data.courtLogo}`;
            courtSealEl.alt = 'Court Logo';
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch court branding:', error);
    }
  }

  // Fetch display configuration
  async function fetchDisplayConfig() {
    try {
      const response = await fetch(
        `${CONFIG.apiBaseUrl}/api/displays/${CONFIG.displayId}/config`,
        {
          headers: {
            'X-API-Key': getApiKey(),
          },
        }
      );

      if (response.ok) {
        displayConfig = await response.json();
        applyDisplayConfig();
        handleConnectionChange(true);
      }
    } catch (error) {
      console.error('Failed to fetch display config:', error);
      handleConnectionChange(false);
    }
  }

  // Apply display configuration
  function applyDisplayConfig() {
    // Apply court name and subtitle from global settings
    if (displayConfig.courtName) {
      const courtTitleEl = document.getElementById('court-title');
      if (courtTitleEl) courtTitleEl.textContent = displayConfig.courtName;
    }

    if (displayConfig.courtSubtitle) {
      const courtSubtitleEl = document.getElementById('court-subtitle');
      if (courtSubtitleEl) courtSubtitleEl.textContent = displayConfig.courtSubtitle;
    }

    if (displayConfig.courthouseName) {
      const courthouseNameEl = document.getElementById('courthouse-name');
      if (courthouseNameEl) courthouseNameEl.textContent = displayConfig.courthouseName;
    }

    updateCourthouseSep();

    // Apply chief judge and clerk of court
    const officialsEl = document.getElementById('court-officials');
    if (officialsEl) {
      const parts = [];
      if (displayConfig.chiefJudge) parts.push(displayConfig.chiefJudge + ', Chief Judge');
      if (displayConfig.clerkOfCourt) parts.push(displayConfig.clerkOfCourt + ', Clerk of Court');
      officialsEl.textContent = parts.join(' | ');
    }

    // Apply custom court logo if available
    if (displayConfig.courtLogo) {
      const courtSealEl = document.getElementById('court-seal');
      if (courtSealEl) {
        courtSealEl.src = `${CONFIG.apiBaseUrl}${displayConfig.courtLogo}`;
        courtSealEl.alt = 'Court Logo';
      }
    }

    if (displayConfig.noticeText) {
      const noticeEl = document.getElementById('notice-text');
      if (noticeEl) noticeEl.textContent = displayConfig.noticeText;
    }

    if (displayConfig.weatherLocation) {
      const locationEl = document.getElementById('location');
      if (locationEl) locationEl.textContent = displayConfig.weatherLocation;
    }

    if (!displayConfig.showWeather) {
      const weatherEl = document.querySelector('.weather');
      if (weatherEl) weatherEl.style.display = 'none';
    }

    // Apply orientation
    if (displayConfig.orientation === 'portrait') {
      document.body.classList.add('portrait');
      document.documentElement.style.width = '1080px';
      document.documentElement.style.height = '1920px';
    } else {
      document.body.classList.remove('portrait');
      document.documentElement.style.width = '1920px';
      document.documentElement.style.height = '1080px';
    }

    if (!displayConfig.tickerEnabled) {
      const tickerEl = document.getElementById('ticker-container');
      if (tickerEl) tickerEl.style.display = 'none';
    }

    // Apply ticker speed (pixels per second)
    if (displayConfig.tickerSpeed) {
      CONFIG.tickerSpeed = displayConfig.tickerSpeed === 'slow' ? 30 :
                           displayConfig.tickerSpeed === 'fast' ? 80 : 50;
      startTickerAnimation();
    }

    // Apply template (creates component grid, scaffolds DOM)
    applyTemplate();

    // Check schedule after config loads
    checkSchedule();
  }

  // Fetch docket entries
  async function fetchDocket() {
    if (screensaverActive) return;
    try {
      const response = await fetch(
        `${CONFIG.apiBaseUrl}/api/displays/${CONFIG.displayId}/docket`,
        {
          headers: {
            'X-API-Key': getApiKey(),
          },
          cache: 'no-store',
        }
      );

      if (response.ok) {
        const data = await response.json();
        docketData = data.entries || [];
        renderAllComponents();
        handleConnectionChange(true);
        lastUpdate = new Date();
      }
    } catch (error) {
      console.error('Failed to fetch docket:', error);
      handleConnectionChange(false);
    }
  }

  // Zoom pill color palette
  const ZOOM_COLORS = ['#2D8CFF', '#00897B', '#7B1FA2', '#E65100', '#C2185B', '#00ACC1'];

  // Classify docket entries by time relevance for smart view mode
  function classifyEntries(entries, now) {
    const inProgress = [];
    const upcomingSoon = [];
    const upcomingLater = [];
    const pastRecent = [];

    entries.forEach(entry => {
      // Parse hearing time
      const [h, m] = (entry.hearingTime || '').split(':').map(Number);
      let minutesDiff = null;
      if (!isNaN(h) && !isNaN(m)) {
        const hearingTime = new Date(now);
        hearingTime.setHours(h, m, 0, 0);
        minutesDiff = (hearingTime - now) / 60000;
      }

      if (entry.status === 'in_progress') {
        inProgress.push({ entry, category: 'in_progress' });
      } else if (entry.status === 'completed' || entry.status === 'cancelled') {
        // Past entry -- check if recent (within 30 min)
        if (minutesDiff !== null && minutesDiff >= -30) {
          pastRecent.push({ entry, category: 'past_recent' });
        }
        // Past old: hidden entirely (not added to any bucket)
      } else if (entry.status === 'scheduled' || entry.status === 'reserved') {
        if (minutesDiff !== null && minutesDiff <= 30 && minutesDiff > 0) {
          upcomingSoon.push({ entry, category: 'upcoming_soon' });
        } else if (minutesDiff !== null && minutesDiff > 30 && minutesDiff <= 120) {
          upcomingLater.push({ entry, category: 'upcoming_later' });
        } else if (minutesDiff !== null && minutesDiff <= 0 && minutesDiff >= -15) {
          // Scheduled but time passed within 15 min -- grace period (clock drift / not yet started)
          upcomingSoon.push({ entry, category: 'upcoming_soon' });
        } else if (minutesDiff !== null && minutesDiff < -15 && minutesDiff >= -60) {
          // Scheduled 15-60 min ago -- recently passed
          pastRecent.push({ entry, category: 'past_recent' });
        } else if (minutesDiff !== null && minutesDiff < -60) {
          // Scheduled more than 60 min ago -- drop entirely (not shown)
        } else if (minutesDiff !== null && minutesDiff > 120) {
          upcomingLater.push({ entry, category: 'upcoming_later' });
        } else {
          // No valid time -- show in upcoming later
          upcomingLater.push({ entry, category: 'upcoming_later' });
        }
      } else if (entry.status === 'stricken') {
        // Stricken entries stay in their natural time slot (not EARLIER)
        if (minutesDiff !== null && minutesDiff > 30) {
          upcomingLater.push({ entry, category: 'upcoming_later' });
        } else if (minutesDiff !== null && minutesDiff >= -30) {
          upcomingSoon.push({ entry, category: 'upcoming_soon' });
        }
        // Stricken older than 30 min past: hidden entirely
      } else {
        // Any other status -- show in upcoming later
        upcomingLater.push({ entry, category: 'upcoming_later' });
      }
    });

    return { inProgress, upcomingSoon, upcomingLater, pastRecent };
  }

  // Collect unique Zoom meetings and assign colors (for pills and legend)
  function collectAllZoomMeetings(entries) {
    const zoomMap = new Map();
    let colorIndex = 0;

    entries.forEach(entry => {
      if (!entry.isZoom || !entry.zoomMeetingId) return;

      if (!zoomMap.has(entry.zoomMeetingId)) {
        const lastName = entry.hearingJudge ? entry.hearingJudge.split(' ').pop() : '';
        zoomMap.set(entry.zoomMeetingId, {
          color: ZOOM_COLORS[colorIndex % ZOOM_COLORS.length],
          meetingId: entry.zoomMeetingId,
          passcode: entry.zoomPasscode || '---',
          phone: entry.zoomPhone || '---',
          judgeName: lastName,
        });
        colorIndex++;
      }
    });

    return zoomMap;
  }

  // Render zoom connection details into the right section of the legend bar
  function renderZoomLegend(zoomMap) {
    const rightEl = document.getElementById('zoom-legend-content');
    if (!rightEl) return;

    if (!zoomMap || zoomMap.size === 0) {
      rightEl.innerHTML = '';
      updateLegendBarVisibility();
      return;
    }

    let html = '<div class="zoom-legend-title">ZOOM CONNECTIONS</div><div class="zoom-legend-entries">';
    zoomMap.forEach(info => {
      html += `
        <div class="zoom-legend-entry">
          ${info.judgeName ? '<span class="zoom-legend-field">Judge </span><span class="zoom-legend-value">' + escapeHtml(info.judgeName) + '</span>' : ''}
          <span class="zoom-legend-dot" style="background: ${info.color}"></span>
          <span class="zoom-legend-field">Meeting ID</span>
          <span class="zoom-legend-value">${escapeHtml(info.meetingId)}</span>
          <span class="zoom-legend-sep"></span>
          <span class="zoom-legend-field">Passcode</span>
          <span class="zoom-legend-value">${escapeHtml(info.passcode)}</span>
          <span class="zoom-legend-sep"></span>
          <span class="zoom-legend-field">Phone</span>
          <span class="zoom-legend-value">${escapeHtml(info.phone)}</span>
        </div>
      `;
    });
    html += '</div>';

    rightEl.innerHTML = html;
    updateLegendBarVisibility();
  }

  // Build the stricken-hidden notice if applicable
  function getStrickenNotice() {
    return displayConfig.showStricken === false
      ? '<span class="stricken-notice">(Stricken hearings hidden)</span>'
      : '';
  }

  // Update pagination info in the left section of the legend bar
  function updatePaginationInfo(pageIndex, label) {
    const leftEl = document.getElementById('pagination-info');
    if (!leftEl) return;

    const totalPages = paginationState.pages.length;
    if (totalPages <= 1) {
      leftEl.innerHTML = getStrickenNotice();
      updateLegendBarVisibility();
      return;
    }

    let html = '';
    if (label) {
      html += `<span class="separator-label">${escapeHtml(label)}</span>`;
    }
    html += '<span class="page-dots">';
    for (let i = 0; i < totalPages; i++) {
      html += `<span class="page-dot${i === pageIndex ? ' active' : ''}"></span>`;
    }
    html += '</span>';
    html += getStrickenNotice();

    leftEl.innerHTML = html;
    updateLegendBarVisibility();
  }

  // Show or hide the legend bar based on whether either section has content
  function updateLegendBarVisibility() {
    const bar = document.getElementById('zoom-legend');
    const leftEl = document.getElementById('pagination-info');
    const rightEl = document.getElementById('zoom-legend-content');
    if (!bar) return;

    const hasLeft = leftEl && leftEl.innerHTML.trim() !== '';
    const hasRight = rightEl && rightEl.innerHTML.trim() !== '';
    bar.style.display = (hasLeft || hasRight) ? 'flex' : 'none';

    // Re-adjust docket padding since bar visibility may have changed
    adjustDocketPadding();
  }

  // Build HTML for a single hearing row (shared between both modes)
  function buildEntryRow(entry, rowIndex, now, zoomMap, extraClasses) {
    const rowParity = rowIndex % 2 === 0 ? 'row-odd' : 'row-even';
    const classes = [rowParity];
    if (extraClasses) classes.push(...extraClasses);
    if (entry.status === 'in_progress') classes.push('current');
    if (entry.status === 'stricken') classes.push('stricken');

    const useZoomPill = entry.isZoom && displayConfig.showZoomInfo !== false;

    const adversaryMarker = entry.adversaryNumber
      ? '<span class="adversary-marker">&#9876;&#65039;</span>'
      : '';

    // Room column: use colored pill if zoom dedup is active, else plain text
    let roomContent;
    if (useZoomPill && entry.zoomMeetingId && zoomMap && zoomMap.has(entry.zoomMeetingId)) {
      const zoomInfo = zoomMap.get(entry.zoomMeetingId);
      roomContent = `<span class="zoom-pill" style="background: ${zoomInfo.color}">Zoom</span>`;
    } else if (useZoomPill && !entry.zoomMeetingId) {
      // Zoom hearing without a meetingId -- plain text
      roomContent = 'Zoom';
    } else {
      roomContent = entry.isZoom && !entry.courtroom ? 'Zoom' : escapeHtml(entry.courtroom || '--');
    }

    return `
      <tr class="${escapeHtml(classes.join(' '))}">
        <td>${escapeHtml(entry.caseTitle)}${adversaryMarker}</td>
        <td>${escapeHtml(entry.caseChapter)}</td>
        <td>${formatTime(entry.hearingTime)}</td>
        <td>${escapeHtml(entry.caseNumber)}</td>
        <td>${escapeHtml(truncateText(entry.hearingMatter, 80))}</td>
        <td>${roomContent}</td>
        <td>${escapeHtml(entry.hearingJudge ? entry.hearingJudge.split(' ').pop() : '--')}</td>
      </tr>
    `;
  }

  // Build a separator row for smart mode
  function buildSeparatorRow(label) {
    return `
      <tr class="time-separator">
        <td colspan="7"><span class="separator-label">${escapeHtml(label)}</span><span class="separator-line"></span></td>
      </tr>
    `;
  }

  // =============================================
  // Pagination Engine
  // =============================================

  // Calculate how many hearing rows fit on one page
  function getRowsPerPage() {
    const isPortrait = document.body.classList.contains('portrait');
    const screenHeight = isPortrait ? 1920 : 1080;

    // Fixed elements: header, thead, bottom bar (notice + ticker)
    const headerEl = document.querySelector('.header');
    const headerH = headerEl ? headerEl.offsetHeight : (isPortrait ? 160 : 120);
    const docketHeaderEl = document.querySelector('.docket-header');
    const docketHeaderH = docketHeaderEl ? docketHeaderEl.offsetHeight : 60;
    const theadEl = document.querySelector('.docket-table thead');
    const theadH = theadEl ? theadEl.offsetHeight : 60;
    const bottomBarH = isPortrait ? 94 : 110;

    // Zoom legend height (dynamic)
    const legendEl = document.getElementById('zoom-legend');
    const legendH = (legendEl && legendEl.style.display !== 'none') ? legendEl.offsetHeight : 0;

    // Page indicator height
    const pageIndicatorH = 30;

    const available = screenHeight - headerH - docketHeaderH - theadH - bottomBarH - legendH - pageIndicatorH - 10;
    const rowH = isPortrait ? 46 : 58;
    const separatorH = isPortrait ? 32 : 40;

    // Reserve space for at least one separator per page
    return Math.max(2, Math.floor((available - separatorH) / rowH));
  }

  // Build sections array from classified entries for pagination
  function buildSectionsForPagination(entries, now, zoomMap) {
    const { inProgress, upcomingSoon, upcomingLater, pastRecent } = classifyEntries(entries, now);
    const sections = [];

    if (inProgress.length > 0) {
      const rows = [];
      let ri = 0;
      inProgress.forEach(({ entry }) => {
        rows.push(buildEntryRow(entry, ri, now, zoomMap, []));
        ri++;
      });
      sections.push({ label: 'NOW', rows, priority: 'high' });
    }

    if (upcomingSoon.length > 0) {
      const rows = [];
      let ri = 0;
      const hasInProgress = inProgress.length > 0;
      upcomingSoon.forEach(({ entry }, idx) => {
        const extra = ['upcoming-soon'];
        // First upcoming-soon entry gets "next up" treatment when nothing is in progress
        if (idx === 0 && !hasInProgress) extra.push('upcoming-next');
        rows.push(buildEntryRow(entry, ri, now, zoomMap, extra));
        ri++;
      });
      sections.push({ label: 'COMING UP', rows, priority: 'high' });
    }

    if (upcomingLater.length > 0) {
      const rows = [];
      let ri = 0;
      upcomingLater.forEach(({ entry }) => {
        rows.push(buildEntryRow(entry, ri, now, zoomMap, []));
        ri++;
      });
      sections.push({ label: 'LATER', rows, priority: 'low' });
    }

    // Drop EARLIER on busy days (more than 3 past entries)
    if (pastRecent.length > 0 && pastRecent.length <= 3) {
      const rows = [];
      let ri = 0;
      pastRecent.forEach(({ entry }) => {
        rows.push(buildEntryRow(entry, ri, now, zoomMap, ['past-recent']));
        ri++;
      });
      sections.push({ label: 'EARLIER', rows, priority: 'none' });
    }

    return sections;
  }

  // Slice sections into screen-sized pages, respecting section boundaries
  function buildPaginatedPages(sections, rowsPerPage) {
    const pages = [];
    let currentPageHtml = '';
    let currentPageRows = 0;
    let currentPagePriority = 'low'; // track highest priority on current page
    let currentPageContLabel = null;  // continuation label (shown in legend bar)

    sections.forEach(section => {
      // If adding this section's separator + first row would overflow, start new page
      if (currentPageRows > 0 && currentPageRows + 1 > rowsPerPage) {
        pages.push({ html: currentPageHtml, priority: currentPagePriority, contLabel: currentPageContLabel });
        currentPageHtml = '';
        currentPageRows = 0;
        currentPagePriority = 'low';
        currentPageContLabel = null;
      }

      // Add separator
      currentPageHtml += buildSeparatorRow(section.label);

      // Track priority
      if (section.priority === 'high') currentPagePriority = 'high';
      else if (section.priority === 'none' && currentPagePriority !== 'high') currentPagePriority = 'none';

      // Add rows, splitting across pages if needed
      section.rows.forEach(rowHtml => {
        if (currentPageRows >= rowsPerPage) {
          pages.push({ html: currentPageHtml, priority: currentPagePriority, contLabel: currentPageContLabel });
          currentPageHtml = '';
          currentPageRows = 0;
          currentPagePriority = section.priority === 'high' ? 'high' : 'low';
          // Continuation label moves to legend bar (no separator row in table)
          currentPageContLabel = section.label + ' (CONT.)';
        }
        currentPageHtml += rowHtml;
        currentPageRows++;
      });
    });

    if (currentPageHtml) {
      pages.push({ html: currentPageHtml, priority: currentPagePriority, contLabel: currentPageContLabel });
    }

    return pages;
  }

  // Simple sequential rotation: cycle through pages in order (0→1→2→0→1→2...)
  function buildRotationOrder(pages) {
    return pages.map((_, i) => i);
  }

  function showPage(pageIndex) {
    var page = paginationState.pages[pageIndex];
    if (!page) return;

    var tbody = document.getElementById('docket-body');
    var table = document.querySelector('.docket-table');
    var contentCardContainer = document.getElementById('content-card-container');

    if (page.type === 'content-card') {
      // Hide docket table, show content card container with slide HTML
      if (table) table.style.display = 'none';
      if (contentCardContainer) {
        contentCardContainer.style.display = 'flex';
        contentCardContainer.innerHTML = page.html;
      }
      var totalPages = paginationState.pages.length;
      if (totalPages > 1) {
        updatePaginationInfo(pageIndex, '');
      } else {
        updatePaginationInfo(pageIndex, '');
      }
    } else {
      // Docket page: show table, hide content card container
      if (table) table.style.display = '';
      if (contentCardContainer) {
        contentCardContainer.style.display = 'none';
        contentCardContainer.innerHTML = '';
      }
      if (!tbody) return;
      tbody.innerHTML = page.html;

      var totalPages = paginationState.pages.length;
      if (totalPages > 1) {
        // Move the first separator's label into the legend bar so it matches
        // the "(CONT.)" treatment on continuation pages.
        var label = page.contLabel || '';
        var firstSep = tbody.querySelector('tr.time-separator');
        if (firstSep) {
          var labelEl = firstSep.querySelector('.separator-label');
          if (labelEl) label = labelEl.textContent;
          firstSep.remove();
        }
        updatePaginationInfo(pageIndex, label);
      } else {
        updatePaginationInfo(pageIndex, '');
      }
    }
  }

  function transitionToNextPage() {
    if (paginationState.pages.length === 0) return;

    var currentPageIdx = paginationState.rotationOrder[paginationState.currentIndex];
    var currentPage = paginationState.pages[currentPageIdx];

    // Advance to next position in rotation order
    paginationState.currentIndex = (paginationState.currentIndex + 1) % paginationState.rotationOrder.length;
    var nextPageIdx = paginationState.rotationOrder[paginationState.currentIndex];

    var currentIsContentCard = currentPage && currentPage.type === 'content-card';

    // Fade out the currently visible container
    var fadeTarget;
    if (currentIsContentCard) {
      fadeTarget = document.getElementById('content-card-container');
    } else {
      fadeTarget = document.getElementById('docket-body');
    }

    if (fadeTarget) fadeTarget.classList.add('page-fade-out');

    setTimeout(function() {
      showPage(nextPageIdx);
      if (fadeTarget) fadeTarget.classList.remove('page-fade-out');
    }, PAGINATION_FADE);
  }

  function startPagination(pages) {
    stopPagination();

    paginationState.pages = pages;
    paginationState.rotationOrder = buildRotationOrder(pages);
    paginationState.currentIndex = 0;
    paginationState.active = true;
    paginationState.pageSignature = pages.map(p => p.html.length + ':' + p.priority).join('|');

    // Show first page immediately
    if (paginationState.rotationOrder.length > 0) {
      showPage(paginationState.rotationOrder[0]);
    }

    // Start rotation timer (only if more than one page)
    if (pages.length > 1) {
      paginationState.timer = setInterval(transitionToNextPage, PAGINATION_DWELL);
    }
  }

  function stopPagination() {
    if (paginationState.timer) {
      clearInterval(paginationState.timer);
      paginationState.timer = null;
    }
    paginationState.active = false;
    paginationState.pages = [];
    paginationState.rotationOrder = [];
    paginationState.currentIndex = 0;
    paginationState.pageSignature = '';

    // Ensure docket table is visible and content card container is hidden
    var table = document.querySelector('.docket-table');
    var contentCardContainer = document.getElementById('content-card-container');
    if (table) table.style.display = '';
    if (contentCardContainer) { contentCardContainer.style.display = 'none'; contentCardContainer.innerHTML = ''; }

    // Clear pagination info from legend bar, but keep stricken notice
    var leftEl = document.getElementById('pagination-info');
    if (leftEl) leftEl.innerHTML = getStrickenNotice();
    updateLegendBarVisibility();
  }

  // Render docket table
  function renderDocket() {
    var tbody = document.getElementById('docket-body');
    if (!tbody) return;

    var contentCardsEnabled = displayConfig.showContentCards && contentCardData && contentCardData.enabled;
    console.log('[content-cards-interleave] renderDocket: showContentCards=' + displayConfig.showContentCards + ', data=' + !!contentCardData + ', dataEnabled=' + (contentCardData && contentCardData.enabled) + ', contentCardsEnabled=' + contentCardsEnabled + ', hearings=' + docketData.length);

    // --- Zero hearings ---
    if (docketData.length === 0) {
      if (contentCardsEnabled) {
        var slides = buildContentCardSlides(true); // with schedule summary
        if (slides.length > 0) {
          renderZoomLegend(null);
          var pages = slides.map(function(s) {
            return { html: s, type: 'content-card', priority: 'low', contLabel: null };
          });
          softRefreshOrStartPagination(pages);
          adjustDocketPadding();
          return;
        }
      }
      stopPagination();
      tbody.innerHTML = '<tr class="placeholder-row"><td colspan="7">No hearings scheduled for today</td></tr>';
      renderZoomLegend(null);
      adjustDocketPadding();
      return;
    }

    var now = new Date();
    var isSmartMode = displayConfig.docketViewMode === 'smart';

    // --- Smart mode: all entries filtered out ---
    if (isSmartMode && docketData.length > 8) {
      var classified = classifyEntries(docketData, now);
      var totalVisible = classified.inProgress.length + classified.upcomingSoon.length +
                         classified.upcomingLater.length + classified.pastRecent.length;
      if (totalVisible === 0) {
        if (contentCardsEnabled) {
          var slides2 = buildContentCardSlides(true); // with schedule summary (shows faded past pills)
          if (slides2.length > 0) {
            renderZoomLegend(null);
            var pages2 = slides2.map(function(s) {
              return { html: s, type: 'content-card', priority: 'low', contLabel: null };
            });
            softRefreshOrStartPagination(pages2);
            adjustDocketPadding();
            return;
          }
        }
        stopPagination();
        tbody.innerHTML = '<tr class="placeholder-row"><td colspan="7">All hearings completed for today</td></tr>';
        renderZoomLegend(null);
        adjustDocketPadding();
        return;
      }
    }

    // --- Active hearings ---
    var showZoomInfo = displayConfig.showZoomInfo !== false;
    var zoomMap = showZoomInfo ? collectAllZoomMeetings(docketData) : null;

    if (isSmartMode) {
      renderSmartDocket(tbody, docketData, now, zoomMap);
    } else {
      renderAllDocket(tbody, docketData, now, zoomMap);
    }

    // Pre-render zoom legend BEFORE pagination so getRowsPerPage() sees the real height.
    var legendMap = zoomMap;
    if (showZoomInfo && zoomMap && isSmartMode && docketData.length > 8) {
      var classifiedForLegend = classifyEntries(docketData, now);
      var visibleEntries = [
        ...classifiedForLegend.inProgress,
        ...classifiedForLegend.upcomingSoon,
        ...classifiedForLegend.upcomingLater,
        ...classifiedForLegend.pastRecent
      ].map(function(item) { return item.entry; });
      var visibleMeetingIds = new Set(
        visibleEntries.filter(function(e) { return e.isZoom && e.zoomMeetingId; }).map(function(e) { return e.zoomMeetingId; })
      );
      legendMap = new Map([...zoomMap].filter(function(pair) { return visibleMeetingIds.has(pair[0]); }));
    }
    renderZoomLegend(legendMap);

    // Build pagination pages
    var container = document.getElementById('docket-container');
    var scrollThreshold = document.body.classList.contains('portrait') ? 18 : 8;
    var rowCount = tbody.querySelectorAll('tr:not(.time-separator)').length;

    if (container && rowCount > scrollThreshold) {
      container.classList.remove('scrolling');
      var rowsPerPage = getRowsPerPage();
      var sections = isSmartMode
        ? buildSectionsForPagination(docketData, now, zoomMap)
        : buildAllSectionsForPagination(docketData, now, zoomMap);
      var pages = buildPaginatedPages(sections, rowsPerPage);

      // Append content card slides as additional pages
      if (contentCardsEnabled) {
        var contentCardSlideHtmls = buildContentCardSlides(false); // no schedule summary (docket IS the schedule)
        console.log('[content-cards-interleave] Paginated docket: appending ' + contentCardSlideHtmls.length + ' content card slides to ' + pages.length + ' docket pages');
        if (contentCardSlideHtmls.length === 0) {
          console.log('[content-cards-interleave] No content card slides: check that info_cards, news, or statistics modules have content');
        }
        contentCardSlideHtmls.forEach(function(slideHtml) {
          pages.push({ html: slideHtml, type: 'content-card', priority: 'low', contLabel: null });
        });
      }

      if (pages.length > 0) {
        var paginationDroppedEarlier = false;
        if (isSmartMode) {
          paginationDroppedEarlier = !sections.some(function(s) { return s.label === 'EARLIER'; });
        }

        softRefreshOrStartPagination(pages);

        // Post-pagination: if EARLIER was dropped, re-filter legend
        if (paginationDroppedEarlier && showZoomInfo && zoomMap && isSmartMode && docketData.length > 8) {
          var postClassified = classifyEntries(docketData, now);
          var finalEntries = [
            ...postClassified.inProgress,
            ...postClassified.upcomingSoon,
            ...postClassified.upcomingLater
          ].map(function(item) { return item.entry; });
          var finalMeetingIds = new Set(
            finalEntries.filter(function(e) { return e.isZoom && e.zoomMeetingId; }).map(function(e) { return e.zoomMeetingId; })
          );
          legendMap = new Map([...zoomMap].filter(function(pair) { return finalMeetingIds.has(pair[0]); }));
          renderZoomLegend(legendMap);
        }
      }
    } else if (container) {
      container.classList.remove('scrolling');

      // Even though docket fits on one page, content card slides may create multi-page rotation
      if (contentCardsEnabled) {
        var contentCardSlideHtmls2 = buildContentCardSlides(false);
        console.log('[content-cards-interleave] Single-page docket: ' + contentCardSlideHtmls2.length + ' content card slides');
        if (contentCardSlideHtmls2.length === 0) {
          console.log('[content-cards-interleave] No content card slides: check that info_cards, news, or statistics modules have content');
        }
        if (contentCardSlideHtmls2.length > 0) {
          var docketPageHtml = tbody.innerHTML;
          var pages3 = [{ html: docketPageHtml, type: 'docket', priority: 'low', contLabel: null }];
          contentCardSlideHtmls2.forEach(function(slideHtml) {
            pages3.push({ html: slideHtml, type: 'content-card', priority: 'low', contLabel: null });
          });
          softRefreshOrStartPagination(pages3);
        } else {
          stopPagination();
        }
      } else {
        stopPagination();
      }
    }

    adjustDocketPadding();
  }

  // Soft-refresh pagination if page structure is similar, otherwise restart
  function softRefreshOrStartPagination(pages) {
    var newSig = pages.map(function(p) { return (p.html ? p.html.length : 0) + ':' + p.priority; }).join('|');
    if (paginationState.active && newSig === paginationState.pageSignature) {
      paginationState.pages = pages;
      paginationState.rotationOrder = buildRotationOrder(pages);
      var currentPageIdx = paginationState.rotationOrder[paginationState.currentIndex];
      if (currentPageIdx !== undefined) {
        showPage(currentPageIdx);
      }
    } else {
      startPagination(pages);
    }
  }

  // Build sections for "all" mode pagination
  function buildAllSectionsForPagination(entries, now, zoomMap) {
    const rows = [];
    let ri = 0;
    entries.forEach(entry => {
      rows.push(buildEntryRow(entry, ri, now, zoomMap, []));
      ri++;
    });
    return [{ label: "TODAY'S HEARINGS", rows, priority: 'low' }];
  }

  // Adjust docket section bottom padding to avoid zoom legend overlap
  function adjustDocketPadding() {
    const legendEl = document.getElementById('zoom-legend');
    const docketSection = document.querySelector('.docket-section');
    if (!docketSection) return;
    const legendH = (legendEl && legendEl.style.display !== 'none') ? legendEl.offsetHeight : 0;
    docketSection.style.paddingBottom = legendH > 0 ? legendH + 'px' : '0';

  }

  // Render all-mode docket (legacy behavior, but with zoom pill dedup)
  function renderAllDocket(tbody, entries, now, zoomMap) {
    let rowIndex = 0;

    tbody.innerHTML = entries.map(entry => {
      const html = buildEntryRow(entry, rowIndex, now, zoomMap, []);
      rowIndex++;
      return html;
    }).join('');
  }

  // Render smart-mode docket with time-priority filtering
  function renderSmartDocket(tbody, entries, now, zoomMap) {
    const { inProgress, upcomingSoon, upcomingLater, pastRecent } = classifyEntries(entries, now);
    const totalVisible = inProgress.length + upcomingSoon.length + upcomingLater.length + pastRecent.length;

    // Light day: 8 or fewer entries total -- show everything without filtering
    if (entries.length <= 8) {
      let rowIndex = 0;
      tbody.innerHTML = entries.map(entry => {
        const html = buildEntryRow(entry, rowIndex, now, zoomMap, []);
        rowIndex++;
        return html;
      }).join('');
      return;
    }

    // End of day: nothing visible
    if (totalVisible === 0) {
      tbody.innerHTML = `
        <tr class="placeholder-row">
          <td colspan="7">All hearings completed for today</td>
        </tr>
      `;
      return;
    }

    let html = '';
    let rowIndex = 0;

    // In-progress section
    if (inProgress.length > 0) {
      html += buildSeparatorRow('NOW');
      inProgress.forEach(({ entry }) => {
        html += buildEntryRow(entry, rowIndex, now, zoomMap, []);
        rowIndex++;
      });
    }

    // Upcoming soon section
    if (upcomingSoon.length > 0) {
      html += buildSeparatorRow('COMING UP');
      upcomingSoon.forEach(({ entry }, idx) => {
        const extra = ['upcoming-soon'];
        // First upcoming-soon entry gets "next up" when nothing is in progress
        if (idx === 0 && inProgress.length === 0) extra.push('upcoming-next');
        html += buildEntryRow(entry, rowIndex, now, zoomMap, extra);
        rowIndex++;
      });
    }

    // Upcoming later section
    if (upcomingLater.length > 0) {
      if (inProgress.length > 0 || upcomingSoon.length > 0) {
        html += buildSeparatorRow('LATER');
      }
      upcomingLater.forEach(({ entry }) => {
        html += buildEntryRow(entry, rowIndex, now, zoomMap, []);
        rowIndex++;
      });
    }

    // Past recent section
    if (pastRecent.length > 0) {
      html += buildSeparatorRow('EARLIER');
      pastRecent.forEach(({ entry }) => {
        html += buildEntryRow(entry, rowIndex, now, zoomMap, ['past-recent']);
        rowIndex++;
      });
    }

    tbody.innerHTML = html;
  }

  // Track current ticker animation
  let tickerAnimation = null;
  let announcementsSignature = '';

  // Fetch announcements
  async function fetchAnnouncements() {
    if (screensaverActive) return;
    try {
      const response = await fetch(
        `${CONFIG.apiBaseUrl}/api/announcements?active=true&displayId=${encodeURIComponent(CONFIG.displayId)}`,
        {
          headers: {
            'X-API-Key': getApiKey(),
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        const newAnnouncements = data.announcements || [];

        // Only re-render if announcements have actually changed
        const newSignature = newAnnouncements.map(a => a.id + a.text + a.priority).join('|');
        if (newSignature === announcementsSignature) return;

        announcements = newAnnouncements;
        announcementsSignature = newSignature;
        renderTicker();
      }
    } catch (error) {
      console.error('Failed to fetch announcements:', error);
    }
  }

  // Render announcement ticker
  function renderTicker() {
    const tickerContent = document.getElementById('ticker-content');
    if (!tickerContent) return;

    if (announcements.length === 0) {
      tickerContent.innerHTML = '<span class="ticker-text">Welcome to the U.S. Bankruptcy Court</span>';
      startTickerAnimation();
      return;
    }

    tickerContent.innerHTML = announcements
      .map(a => `<span class="ticker-text">${escapeHtml(a.text)}</span>`)
      .join('');

    startTickerAnimation();
  }

  // JS-driven ticker animation with proper width calculation
  function startTickerAnimation() {
    const container = document.getElementById('ticker-container');
    const content = document.getElementById('ticker-content');
    if (!container || !content) return;

    // Cancel any existing animation
    if (tickerAnimation) {
      tickerAnimation.cancel();
      tickerAnimation = null;
    }

    // Wait a frame for layout to settle after innerHTML change
    requestAnimationFrame(() => {
      const containerWidth = container.offsetWidth;
      const contentWidth = content.scrollWidth;
      const totalDistance = containerWidth + contentWidth;
      const duration = (totalDistance / CONFIG.tickerSpeed) * 1000;

      tickerAnimation = content.animate([
        { transform: `translateX(${containerWidth}px)` },
        { transform: `translateX(-${contentWidth}px)` }
      ], {
        duration: duration,
        iterations: Infinity,
        easing: 'linear'
      });
    });
  }

  // Weather cache for offline mode
  let cachedWeatherData = null;
  // Cache NWS /points metadata (never changes for a given location)
  let nwsForecastUrls = null;

  // Parse NWS icon URL to extract condition code and day/night
  // e.g. "https://api.weather.gov/icons/land/day/sct?size=small" → { code: "sct", isDaytime: true }
  // e.g. "https://api.weather.gov/icons/land/night/tsra,40/ovc" → { code: "tsra", isDaytime: false }
  function parseNwsIconUrl(iconUrl) {
    if (!iconUrl) return { code: 'default', isDaytime: true };
    try {
      const url = new URL(iconUrl);
      const parts = url.pathname.split('/');
      // Path: /icons/land/{day|night}/{condition[,probability][/condition2]}
      const dayNightIdx = parts.indexOf('day') !== -1 ? parts.indexOf('day') : parts.indexOf('night');
      const isDaytime = parts[dayNightIdx] === 'day';
      const conditionPart = parts[dayNightIdx + 1] || 'default';
      // Strip probability suffix (e.g. "tsra,40" → "tsra")
      const code = conditionPart.split(',')[0];
      return { code, isDaytime };
    } catch (e) {
      return { code: 'default', isDaytime: true };
    }
  }

  // Map NWS condition code to local SVG path
  function getWeatherIconPath(code, isDaytime) {
    // Day/night variants for sky conditions
    const dayNightMap = {
      skc: isDaytime ? 'clear-day' : 'clear-night',
      few: isDaytime ? 'few-clouds-day' : 'few-clouds-night',
      sct: isDaytime ? 'partly-cloudy-day' : 'partly-cloudy-night',
    };
    if (dayNightMap[code]) return `assets/weather/${dayNightMap[code]}.svg`;

    // Universal mappings (no day/night variant)
    const universalMap = {
      bkn: 'mostly-cloudy',
      ovc: 'overcast',
      ra: 'rain',
      minus_ra: 'rain',
      shra: 'rain',
      tsra: 'thunderstorm',
      tsra_sct: 'thunderstorm',
      tsra_hi: 'thunderstorm',
      sn: 'snow',
      snip: 'snow',
      blizzard: 'snow',
      cold: 'snow',
      fzra: 'freezing-rain',
      ra_fzra: 'freezing-rain',
      fzra_sn: 'freezing-rain',
      raip: 'freezing-rain',
      ip: 'freezing-rain',
      ra_sn: 'freezing-rain',
      fg: 'fog',
      wind_skc: 'wind',
      wind_few: 'wind',
      wind_sct: 'wind',
      wind_bkn: 'wind',
      wind_ovc: 'wind',
      hz: 'haze',
      fu: 'haze',
      du: 'haze',
    };
    const mapped = universalMap[code];
    return mapped ? `assets/weather/${mapped}.svg` : 'assets/weather/default.svg';
  }

  // Fetch weather data
  async function fetchWeather() {
    if (screensaverActive) return;
    try {
      const nwsHeaders = { 'User-Agent': 'CourthouseSignage/1.0' };

      // Fetch /points metadata once, cache the URLs
      if (!nwsForecastUrls) {
        const pointsUrl = 'https://api.weather.gov/points/40.7608,-111.8910';
        const pointsResponse = await fetch(pointsUrl, { headers: nwsHeaders });
        if (!pointsResponse.ok) throw new Error('Points request failed');
        const pointsData = await pointsResponse.json();
        nwsForecastUrls = {
          forecast: pointsData.properties.forecast,
          forecastHourly: pointsData.properties.forecastHourly,
        };
      }

      // Fetch both forecasts in parallel
      const [forecastRes, hourlyRes] = await Promise.all([
        fetch(nwsForecastUrls.forecast, { headers: nwsHeaders }),
        fetch(nwsForecastUrls.forecastHourly, { headers: nwsHeaders }),
      ]);

      if (!forecastRes.ok || !hourlyRes.ok) throw new Error('Forecast request failed');

      const [forecastData, hourlyData] = await Promise.all([
        forecastRes.json(),
        hourlyRes.json(),
      ]);

      // Current conditions from hourly forecast (changes every hour)
      const hourlyPeriod = hourlyData.properties.periods[0];
      const { code: iconCode, isDaytime } = parseNwsIconUrl(hourlyPeriod.icon);

      // Hi/Lo from regular forecast (12-hour periods)
      const periods = forecastData.properties.periods;
      let high = null;
      let low = null;
      for (const period of periods.slice(0, 4)) {
        if (period.isDaytime && high === null) {
          high = period.temperature;
        } else if (!period.isDaytime && low === null) {
          low = period.temperature;
        }
        if (high !== null && low !== null) break;
      }

      // Cache flat structure
      cachedWeatherData = {
        temperature: hourlyPeriod.temperature,
        temperatureUnit: hourlyPeriod.temperatureUnit === 'F' ? 'F' : hourlyPeriod.temperatureUnit,
        shortForecast: hourlyPeriod.shortForecast,
        iconCode,
        isDaytime,
        high,
        low,
        timestamp: new Date().toISOString(),
      };

      try {
        localStorage.setItem('weatherCache', JSON.stringify(cachedWeatherData));
      } catch (e) {
        console.warn('Could not cache weather data:', e);
      }

      renderWeather(cachedWeatherData);
    } catch (error) {
      console.error('Failed to fetch weather:', error);
      // Try to use cached data for offline mode
      if (!cachedWeatherData) {
        try {
          const cached = localStorage.getItem('weatherCache');
          if (cached) {
            cachedWeatherData = JSON.parse(cached);
            renderWeather(cachedWeatherData);
            console.log('Using cached weather data from:', cachedWeatherData.timestamp);
          }
        } catch (e) {
          console.warn('Could not load cached weather:', e);
        }
      }
    }
  }

  // Render weather widget
  function renderWeather(data) {
    const weatherEl = document.getElementById('weather');
    if (!weatherEl || !data) return;

    const iconEl = weatherEl.querySelector('.weather-icon');
    const tempEl = weatherEl.querySelector('.temperature');
    const highEl = weatherEl.querySelector('.temp-high');
    const lowEl = weatherEl.querySelector('.temp-low');

    if (iconEl) iconEl.src = getWeatherIconPath(data.iconCode || 'default', data.isDaytime !== false);
    if (tempEl) tempEl.textContent = `${data.temperature}°${data.temperatureUnit}`;
    if (highEl && data.high !== null) highEl.textContent = `H: ${data.high}°`;
    if (lowEl && data.low !== null) lowEl.textContent = `L: ${data.low}°`;
  }

  // Set up WebSocket connection
  function setupWebSocket() {
    try {
      // Import socket.io client dynamically or use global
      if (typeof io !== 'undefined') {
        socket = io(CONFIG.apiBaseUrl, {
          auth: {
            apiKey: CONFIG.apiKey,
            displayId: CONFIG.displayId
          }
        });

        socket.on('connect', () => {
          console.log('WebSocket connected');
          socket.emit('display:register', { displayId: CONFIG.displayId });
        });

        socket.on('disconnect', () => {
          console.log('WebSocket disconnected');
        });

        socket.on('docket:update', () => {
          console.log('Docket update received');
          fetchDocket();
        });

        socket.on('announcement:new', () => {
          console.log('New announcement received');
          fetchAnnouncements();
        });

        socket.on('announcement:remove', () => {
          console.log('Announcement removed');
          fetchAnnouncements();
        });

        socket.on('display:refresh', () => {
          if (emergencyActive) {
            console.log('Refresh command received but emergency active — skipping reload');
            return;
          }
          console.log('Refresh command received');
          window.location.reload();
        });

        socket.on('display:message', (data) => {
          console.log('Message received:', data);
          showOverlayMessage(data.message, data.duration || 5000);
        });

        socket.on('content-cards:update', () => {
          console.log('Content cards update received');
          fetchContentCards();
        });

        socket.on('emergency:activate', (data) => {
          console.log('[EMERGENCY] Activate event received:', data);
          // Check if this emergency targets our display
          if (data.displayIds && !data.displayIds.includes(CONFIG.displayId)) {
            console.log('[EMERGENCY] Not targeted at this display, ignoring');
            return;
          }
          handleEmergencyActivation(data);
        });

        socket.on('emergency:deactivate', (data) => {
          console.log('[EMERGENCY] Deactivate event received:', data);
          deactivateEmergency();
        });

        socket.on('display:screensaver', (data) => {
          if (data.displayId && data.displayId !== CONFIG.displayId) return;
          console.log('Screensaver command received:', data.action);
          if (data.action === 'activate') {
            screensaverManualOverride = 'on';
            activateScreensaver();
          } else if (data.action === 'deactivate') {
            screensaverManualOverride = 'off';
            deactivateScreensaver();
          }
        });
      }
    } catch (error) {
      console.error('WebSocket setup failed:', error);
    }
  }

  // Handle connection status changes
  function handleConnectionChange(online) {
    isOnline = online;
    const indicator = document.getElementById('offline-indicator');
    const lastUpdatedEl = document.getElementById('last-updated');

    if (indicator) {
      indicator.style.display = online ? 'none' : 'block';
    }

    if (lastUpdatedEl && lastUpdate) {
      lastUpdatedEl.textContent = lastUpdate.toLocaleTimeString();
    }
  }

  // Show overlay message
  function showOverlayMessage(message, duration) {
    const overlay = document.createElement('div');
    overlay.className = 'message-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.9);
      color: white;
      padding: 40px 60px;
      border-radius: 10px;
      font-size: 36px;
      z-index: 10000;
      text-align: center;
    `;
    overlay.textContent = message;
    document.body.appendChild(overlay);

    setTimeout(() => {
      overlay.remove();
    }, duration);
  }

  // Utility: Escape HTML
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Utility: Truncate text
  function truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  // Utility: Format time
  function formatTime(time) {
    if (!time) return '--:--';
    // Assuming HH:MM format
    const [hours, minutes] = time.split(':');
    const h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${minutes} ${ampm}`;
  }

  // =============================================
  // Template Engine
  // =============================================

  // IT Status state
  let hlsPlayers = [];
  let testPatternTimers = [];

  // Component renderer registry
  var COMPONENT_RENDERERS = {
    'hearing-table': renderHearingTableComponent,
    'hearing-pills': renderHearingPillsComponent,
    'direction-cards': renderDirectionCardsComponent,
    'camera-grid': renderCameraGridComponent,
    'system-status': renderSystemStatusComponent
  };

  // Apply the active template: create CSS Grid layout and scaffold component DOM
  function applyTemplate() {
    var container = document.getElementById('template-content');
    if (!container) return;
    container.innerHTML = '';

    // Reset camera grid state so it re-initializes
    cameraGridInitialized = false;

    // Resolve template: from server config, or local fallback
    var template = displayConfig.template;
    if (!template) {
      var slug = displayConfig.displayType || 'courtroom';
      template = DEFAULT_DISPLAY_TEMPLATES[slug] || DEFAULT_DISPLAY_TEMPLATES.courtroom;
    }

    var orientation = displayConfig.orientation || 'landscape';
    var layout = template.layout && template.layout[orientation];

    if (layout && layout.areas && layout.areas.length > 0) {
      // Multi-cell CSS Grid
      container.style.display = 'grid';
      container.style.gridTemplateColumns = layout.columns || '1fr';
      container.style.gridTemplateRows = layout.rows || '1fr';
      container.style.gap = layout.gap || '0px';
      container.style.gridTemplateAreas = layout.areas
        .map(function(row) { return '"' + row.join(' ') + '"'; })
        .join(' ');
    } else {
      // Single-column default
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
    }

    // Create cells for each component
    var components = template.components || [];
    components.forEach(function(comp) {
      // Skip content-cards — it's a behavior, not a visual cell
      if (comp.type === 'content-cards') return;

      var cell = document.createElement('div');
      cell.className = 'template-cell';
      cell.dataset.componentType = comp.type;

      // Apply grid area if defined
      var area = comp.gridArea && comp.gridArea[orientation];
      if (area) {
        cell.style.gridArea = area;
      }

      // Scaffold the inner DOM for this component type
      scaffoldComponent(cell, comp.type);

      container.appendChild(cell);
    });

    // Create content card overlay (hidden by default, activated by content card system)
    var contentCardCell = document.createElement('div');
    contentCardCell.id = 'content-card-overlay';
    contentCardCell.className = 'content-card-container';
    contentCardCell.style.display = 'none';
    container.appendChild(contentCardCell);

    // Store active template for renderer access
    activeTemplate = template;

    var contentCardCompLog = components.find(function(c) { return c.type === 'content-cards'; });
    console.log('[template] Applied template: ' + (template.slug || displayConfig.displayType || 'fallback') +
      ', components: ' + components.map(function(c) { return c.type; }).join(', ') +
      ', content-cards config: ' + JSON.stringify(contentCardCompLog ? contentCardCompLog.config : null));

    // Apply display-type-specific tweaks (title changes, CSS classes)
    applyTypeSpecificTweaks();
  }

  // Create the inner DOM structure for a given component type
  function scaffoldComponent(cell, type) {
    if (type === 'hearing-table') {
      cell.style.flex = '1';
      cell.style.display = 'flex';
      cell.style.flexDirection = 'column';
      cell.innerHTML =
        '<section class="docket-section">' +
          '<div class="docket-header">' +
            '<h3 id="docket-title">TODAY\'S HEARING CALENDAR</h3>' +
          '</div>' +
          '<div class="docket-table-container" id="docket-container">' +
            '<table class="docket-table">' +
              '<thead><tr>' +
                '<th>NAME</th><th>CH</th><th>TIME</th><th>CASE #</th><th>MATTER</th><th>ROOM</th><th>JUDGE</th>' +
              '</tr></thead>' +
              '<tbody id="docket-body">' +
                '<tr class="placeholder-row"><td colspan="7">Loading docket entries...</td></tr>' +
              '</tbody>' +
            '</table>' +
            '<div id="content-card-container" class="content-card-container" style="display: none;"></div>' +
          '</div>' +
        '</section>';
    } else if (type === 'hearing-pills') {
      cell.style.backgroundColor = 'var(--navy-dark)';
      cell.style.padding = '20px';
      cell.style.overflowY = 'auto';
      cell.innerHTML = '<div id="hearing-pills-panel"></div>';
    } else if (type === 'direction-cards') {
      cell.style.overflowY = 'auto';
      cell.style.alignContent = 'start';
      cell.className += ' wayfinding-directions';
      cell.id = 'direction-cards-panel';
    } else if (type === 'camera-grid') {
      cell.style.backgroundColor = 'var(--black)';
      cell.style.display = 'grid';
      cell.style.gridTemplateColumns = 'repeat(2, 1fr)';
      cell.style.gridTemplateRows = 'repeat(2, 1fr)';
      cell.style.gap = '2px';
      cell.style.overflow = 'hidden';
      cell.id = 'it-camera-grid';
    } else if (type === 'system-status') {
      cell.className += ' it-system-status';
      cell.id = 'it-system-status';
    }
  }

  // Apply display-type-specific CSS classes and title customizations
  function applyTypeSpecificTweaks() {
    var type = displayConfig.displayType || 'courtroom';

    // Chambers: add CSS class for column hiding, set title
    if (type === 'chambers') {
      document.body.classList.add('chambers-mode');
      var titleEl = document.getElementById('docket-title');
      if (titleEl && displayConfig.judgeFilter) {
        titleEl.textContent = "TODAY'S HEARING CALENDAR For " + displayConfig.judgeFilter;
      }
    }

    // Courtroom with room filter: customize title
    if (type === 'courtroom' && displayConfig.courtroomFilter) {
      document.body.classList.add('courtroom-mode');
      var titleEl2 = document.getElementById('docket-title');
      if (titleEl2) {
        titleEl2.textContent = "TODAY'S HEARING CALENDAR For Courtroom " + displayConfig.courtroomFilter;
      }
    }

    // Wayfinding: add separator border between columns
    var hearingPillsCell = document.querySelector('.template-cell[data-component-type="hearing-pills"]');
    if (type === 'wayfinding' && hearingPillsCell) {
      if (displayConfig.orientation === 'portrait') {
        hearingPillsCell.style.borderBottom = '3px solid var(--primary-yellow)';
      } else {
        hearingPillsCell.style.borderRight = '3px solid var(--primary-yellow)';
      }
    }

    // IT Status: add separator border for hearing-pills panel
    if (type === 'it-status' && hearingPillsCell) {
      if (displayConfig.orientation === 'portrait') {
        hearingPillsCell.style.borderTop = '3px solid var(--primary-yellow)';
      } else {
        hearingPillsCell.style.borderLeft = '3px solid var(--primary-yellow)';
      }
    }

    // IT Status: system-status cell already gets border-top from .it-system-status CSS class
  }

  // Unified render function — dispatches to component renderers
  function renderAllComponents() {
    if (!activeTemplate) return;

    activeTemplate.components.forEach(function(comp) {
      if (comp.type === 'content-cards') return; // handled separately

      var renderer = COMPONENT_RENDERERS[comp.type];
      if (renderer) {
        renderer(comp.config || {});
      }
    });

    // Handle content-cards behavior
    handleContentCards();
  }

  // Component renderers

  function renderHearingTableComponent(config) {
    // Existing renderDocket() handles all docket table rendering
    renderDocket();
  }

  function renderHearingPillsComponent(config) {
    var panel = document.getElementById('hearing-pills-panel');
    if (!panel) return;

    if (docketData.length === 0) {
      panel.innerHTML = '<h4>Today\'s Schedule by Judge</h4>' +
        '<p style="color: rgba(255,255,255,0.5); font-style: italic;">No hearings scheduled</p>';
      return;
    }

    var result = buildJudgeScheduleHtml(docketData, new Date());
    panel.innerHTML = result.html;
  }

  function renderDirectionCardsComponent(config) {
    var directionsEl = document.getElementById('direction-cards-panel');
    if (!directionsEl) return;

    // Need hearing counts for badges
    var hearingCounts = {};
    docketData.forEach(function(entry) {
      var room = entry.courtroom || 'Unassigned';
      if (!hearingCounts[room]) hearingCounts[room] = 0;
      hearingCounts[room]++;
    });

    var directions = (displayConfig.wayfindingConfig && displayConfig.wayfindingConfig.directions) || [];
    var directionsHtml = '';
    directions.forEach(function(dir, index) {
      // Count hearings matching this direction name (fuzzy case-insensitive)
      var count = 0;
      var dirNameLower = (dir.name || '').toLowerCase();
      Object.keys(hearingCounts).forEach(function(room) {
        if (room.toLowerCase().indexOf(dirNameLower) !== -1 || dirNameLower.indexOf(room.toLowerCase()) !== -1) {
          count += hearingCounts[room];
        }
      });

      var col = dir.column || 1;
      var row = dir.row || (index + 1);
      var cardClass = 'wayfinding-direction-card';
      if (col === 2) cardClass += ' wayfinding-col-right';
      if (dir.icon === 'emergency') cardClass += ' wayfinding-card-emergency';
      directionsHtml += '<div class="' + cardClass + '" style="grid-column:' + col + ';grid-row:' + row + ';">';
      directionsHtml += '<div class="wayfinding-arrow">' + getDirectionArrowSvg(dir.arrow || dir.direction) + '</div>';
      directionsHtml += '<div class="wayfinding-card-info">';
      directionsHtml += '<div class="wayfinding-card-name">' + escapeHtml(dir.name) + '</div>';
      directionsHtml += '<div class="wayfinding-card-desc">' + escapeHtml(dir.description) + '</div>';
      directionsHtml += '</div>';
      if (count > 0 && dir.icon !== 'informational' && dir.icon !== 'emergency') {
        directionsHtml += '<div class="wayfinding-card-badge">' + count + ' hearing' + (count !== 1 ? 's' : '') + '</div>';
      }
      directionsHtml += '</div>';
    });

    if (directions.length === 0) {
      directionsHtml = '<p style="color: rgba(255,255,255,0.5); font-size: 24px; text-align: center; margin-top: 40px;">No directions configured</p>';
    }

    directionsEl.innerHTML = directionsHtml;
  }

  function renderCameraGridComponent(config) {
    if (cameraGridInitialized) return;
    cameraGridInitialized = true;

    var gridEl = document.getElementById('it-camera-grid');
    if (!gridEl) return;

    // Clean up previous state
    hlsPlayers.forEach(function(p) { if (p) p.destroy(); });
    hlsPlayers = [];
    testPatternTimers.forEach(function(t) { if (t) clearInterval(t); });
    testPatternTimers = [];

    var cameras = parseCamerasFromConfig();

    if (cameras.length === 0) {
      var tile = createCameraTile('No Camera Configured', '');
      gridEl.appendChild(tile);
    } else {
      cameras.forEach(function(cam) {
        var tile = createCameraTile(cam.name || '', cam.url || '');
        gridEl.appendChild(tile);
      });
    }

    // Start system status polling
    fetchSystemStatus();
    if (systemStatusTimer) clearInterval(systemStatusTimer);
    systemStatusTimer = setInterval(fetchSystemStatus, 30000);
  }

  function renderSystemStatusComponent(config) {
    // System status is polled on interval by renderCameraGridComponent.
    // Trigger a fetch in case it hasn't started yet.
    if (!systemStatusTimer) {
      fetchSystemStatus();
      systemStatusTimer = setInterval(fetchSystemStatus, 30000);
    }
  }

  // Handle content-cards component behavior
  function handleContentCards() {
    if (!activeTemplate) { console.log('[content-cards] No activeTemplate'); return; }

    var contentCardComp = null;
    activeTemplate.components.forEach(function(comp) {
      if (comp.type === 'content-cards') contentCardComp = comp;
    });
    if (!contentCardComp) { console.log('[content-cards] No content-cards component in template'); return; }

    var config = contentCardComp.config || {};
    var mode = config.mode || 'interleave-pagination';

    // Auto-correct: if mode is interleave-pagination but template has no hearing-table,
    // interleave has nowhere to run (renderDocket needs #docket-body). Fall back to
    // replace-panel when a target is specified.
    if (mode === 'interleave-pagination' && config.target) {
      var hasHearingTable = activeTemplate.components.some(function(c) { return c.type === 'hearing-table'; });
      if (!hasHearingTable) {
        console.log('[content-cards] Auto-correcting mode: interleave-pagination → replace-panel (no hearing-table in template, target=' + config.target + ')');
        mode = 'replace-panel';
      }
    }

    console.log('[content-cards] handleContentCards: mode=' + mode + ', target=' + (config.target || 'none') + ', showWhen=' + (config.showWhen || 'when-idle'));

    if (mode === 'replace-panel' && config.target) {
      var targetCell = document.querySelector('.template-cell[data-component-type="' + config.target + '"]');
      var contentCardOverlay = document.getElementById('content-card-overlay');
      if (!targetCell || !contentCardOverlay) {
        console.log('[content-cards] replace-panel DOM not found: targetCell=' + !!targetCell + ', overlay=' + !!contentCardOverlay);
        return;
      }

      var showWhen = config.showWhen || 'when-idle';
      var isContentCardTime =(showWhen === 'always') || (docketData.length === 0);
      var contentCardsEnabled = contentCardData && contentCardData.enabled;
      console.log('[content-cards] replace-panel check: isContentCardTime=' + isContentCardTime + ' (showWhen=' + showWhen + ', hearings=' + docketData.length + '), contentCardsEnabled=' + contentCardsEnabled + ' (data=' + !!contentCardData + ', enabled=' + (contentCardData && contentCardData.enabled) + '), contentCardActive=' + contentCardActive);

      if (isContentCardTime && contentCardsEnabled) {
        if (!contentCardActive) {
          targetCell.style.display = 'none';
          // Position content card overlay in the target's grid area
          contentCardOverlay.style.gridArea = targetCell.style.gridArea;
          contentCardOverlay.style.backgroundColor = 'var(--navy-dark)';
          var slides = buildContentCardSlides(true);
          console.log('[content-cards] Activating replace-panel: ' + slides.length + ' slides');
          if (slides.length > 0) {
            activateContentCardSlideshow(contentCardOverlay, slides);
          } else {
            console.log('[content-cards] replace-panel: no slides to show');
          }
        }
      } else {
        if (contentCardActive) {
          console.log('[content-cards] Deactivating replace-panel content cards');
          deactivateContentCardsForType('content-card-overlay', null);
          targetCell.style.display = '';
          contentCardOverlay.style.display = 'none';
        }
      }
    }
    // interleave-pagination mode is handled inside renderDocket() — no action needed here
  }

  // =============================================
  // Content Card System
  // =============================================

  async function fetchContentCards() {
    if (screensaverActive) { console.log('[content-cards] fetchContentCards skipped: screensaver active'); return; }
    console.log('[content-cards] fetchContentCards: fetching from /api/displays/' + CONFIG.displayId + '/content-cards');
    try {
      var response = await fetch(
        CONFIG.apiBaseUrl + '/api/displays/' + encodeURIComponent(CONFIG.displayId) + '/content-cards',
        { headers: { 'X-API-Key': getApiKey() } }
      );
      if (response.ok) {
        contentCardData = await response.json();
        console.log('[content-cards] fetchContentCards result:', JSON.stringify({
          enabled: contentCardData.enabled,
          modules: Object.keys(contentCardData.modules || {}),
          rotationInterval: contentCardData.rotationInterval
        }));
        // Re-render to pick up content cards (handles both first-load race
        // condition and periodic refreshes with updated data)
        if (contentCardActive) {
          deactivateContentCardsForType('content-card-overlay', null);
        }
        renderAllComponents();
      } else {
        console.log('[content-cards] fetchContentCards failed: HTTP ' + response.status);
      }
    } catch (error) {
      console.error('[content-cards] fetchContentCards error:', error);
    }
  }

  // buildContentCardSlides is defined below after buildStatisticsSlide

  function showContentCardSlide(index, container) {
    // Fade out current
    var currentSlide = container.querySelector('.content-card-slide');
    if (currentSlide) {
      currentSlide.classList.add('fade-out');
      setTimeout(function() {
        // Replace with new slide
        var slidesAndDots = container.querySelector('.content-card-dots');
        container.innerHTML = contentCardSlides[index];
        if (slidesAndDots) {
          // Re-add dots
          var dotsHtml = '<div class="content-card-dots">';
          for (var i = 0; i < contentCardSlides.length; i++) {
            dotsHtml += '<span class="content-card-dot' + (i === index ? ' active' : '') + '"></span>';
          }
          dotsHtml += '</div>';
          if (contentCardSlides.length > 1) {
            container.insertAdjacentHTML('beforeend', dotsHtml);
            var progressInterval = contentCardData.rotationInterval || 10;
            container.insertAdjacentHTML('beforeend', '<div class="content-card-progress-bar"><div class="content-card-progress-bar-fill" style="animation-duration: ' + progressInterval + 's;"></div></div>');
          }
        }
      }, PAGINATION_FADE);
    } else {
      container.innerHTML = contentCardSlides[index];
      // Add dots and progress bar
      if (contentCardSlides.length > 1) {
        var dotsHtml = '<div class="content-card-dots">';
        for (var i = 0; i < contentCardSlides.length; i++) {
          dotsHtml += '<span class="content-card-dot' + (i === index ? ' active' : '') + '"></span>';
        }
        dotsHtml += '</div>';
        container.insertAdjacentHTML('beforeend', dotsHtml);
        var progressInterval = contentCardData.rotationInterval || 10;
        container.insertAdjacentHTML('beforeend', '<div class="content-card-progress-bar"><div class="content-card-progress-bar-fill" style="animation-duration: ' + progressInterval + 's;"></div></div>');
      }
    }
  }

  function deactivateContentCards() {
    deactivateContentCardsForType('content-card-container', null);
    var table = document.querySelector('.docket-table');
    if (table) table.style.display = '';
  }

  function deactivateTemplateContentCards() {
    deactivateContentCardsForType('content-card-overlay', null);
    // Restore the hidden target cell
    if (activeTemplate) {
      activeTemplate.components.forEach(function(comp) {
        if (comp.type === 'content-cards' && comp.config && comp.config.target) {
          var targetCell = document.querySelector('.template-cell[data-component-type="' + comp.config.target + '"]');
          if (targetCell) targetCell.style.display = '';
        }
      });
    }
  }

  function buildUpcomingHearingsSlide(data) {
    var dateObj = new Date(data.date);
    var dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    var dateStr = dayNames[dateObj.getUTCDay()] + ', ' + monthNames[dateObj.getUTCMonth()] + ' ' + dateObj.getUTCDate();

    var html = '<div class="content-card-slide content-card-upcoming">';
    html += '<div class="content-card-slide-title">NEXT HEARINGS: ' + escapeHtml(dateStr) + '</div>';

    // Group by judge
    var judgeGroups = {};
    data.entries.forEach(function(entry) {
      var judge = entry.hearingJudge || 'Unassigned';
      if (!judgeGroups[judge]) judgeGroups[judge] = { entries: [], courtroom: null, zoom: null };
      judgeGroups[judge].entries.push(entry);
      if (entry.courtroom && !judgeGroups[judge].courtroom) judgeGroups[judge].courtroom = entry.courtroom;
      if (entry.isZoom && entry.zoomMeetingId && !judgeGroups[judge].zoom) {
        judgeGroups[judge].zoom = { meetingId: entry.zoomMeetingId, passcode: entry.zoomPasscode, phone: entry.zoomPhone };
      }
    });

    Object.keys(judgeGroups).sort().forEach(function(judge) {
      var group = judgeGroups[judge];
      html += '<div class="wayfinding-judge-group">';
      html += '<div class="wayfinding-judge-name">' + escapeHtml(judge) + '</div>';

      var metaParts = [];
      if (group.courtroom) metaParts.push(escapeHtml(group.courtroom));
      if (group.zoom) metaParts.push('Zoom');
      if (metaParts.length > 0) {
        html += '<div class="wayfinding-judge-meta">' + metaParts.join(' &middot; ') + '</div>';
      }

      if (group.zoom) {
        html += '<div class="wayfinding-zoom-details">';
        if (group.zoom.meetingId) html += '<span class="zoom-legend-field">Meeting ID</span> <span class="zoom-legend-value">' + escapeHtml(group.zoom.meetingId) + '</span>';
        if (group.zoom.passcode) html += ' <span class="zoom-legend-sep"></span> <span class="zoom-legend-field">Passcode</span> <span class="zoom-legend-value">' + escapeHtml(group.zoom.passcode) + '</span>';
        if (group.zoom.phone) html += ' <span class="zoom-legend-sep"></span> <span class="zoom-legend-field">Phone</span> <span class="zoom-legend-value">' + escapeHtml(group.zoom.phone) + '</span>';
        html += '</div>';
      }

      // Time pills
      var timeCounts = {};
      group.entries.forEach(function(entry) {
        var t = formatTime(entry.hearingTime);
        if (!timeCounts[t]) timeCounts[t] = 0;
        timeCounts[t]++;
      });
      html += '<div class="wayfinding-time-pills">';
      Object.keys(timeCounts).forEach(function(time) {
        html += '<span class="wayfinding-time-pill">' + time + (timeCounts[time] > 1 ? ' (' + timeCounts[time] + ')' : '') + '</span>';
      });
      html += '</div>';
      html += '</div>';
    });

    html += '</div>';
    return html;
  }

  function buildInfoCardSlide(card) {
    var iconHtml = '';
    if (card.icon) {
      var iconMap = {
        phone: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
        clock: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
        gavel: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
        info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
        location: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z',
        calendar: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
        shield: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
        document: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
      };
      var path = iconMap[card.icon] || iconMap.info;
      iconHtml = '<div class="content-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="' + path + '"/></svg></div>';
    }
    return '<div class="content-card-slide content-card-info">' +
      iconHtml +
      '<div class="content-card-title">' + escapeHtml(card.title) + '</div>' +
      '<div class="content-card-body">' + renderMarkdown(card.body) + '</div>' +
      '</div>';
  }

  function buildNewsSlide(article) {
    var dateStr = '';
    if (article.publishedAt) {
      dateStr = new Date(article.publishedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    } else if (article.fetchedAt) {
      dateStr = new Date(article.fetchedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }
    return '<div class="content-card-slide content-card-news">' +
      '<div class="content-card-news-source">COURT NEWS</div>' +
      '<div class="content-card-news-title">' + escapeHtml(article.title) + '</div>' +
      '<div class="content-card-news-summary">' + escapeHtml(article.summary) + '</div>' +
      (dateStr ? '<div class="content-card-news-date">' + escapeHtml(dateStr) + '</div>' : '') +
      '</div>';
  }

  function buildStatisticsSlide(stats) {
    var nextDateStr = '';
    if (stats.nextHearingDate) {
      var nd = new Date(stats.nextHearingDate);
      nextDateStr = nd.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    }
    return '<div class="content-card-slide content-card-stats">' +
      '<div class="content-card-slide-title">COURT STATISTICS</div>' +
      '<div class="content-card-stats-grid">' +
        '<div class="content-card-stats-item">' +
          '<div class="content-card-stats-number">' + (stats.hearingsNext30 || 0) + '</div>' +
          '<div class="content-card-stats-label">Next 30 Days</div>' +
        '</div>' +
        '<div class="content-card-stats-item">' +
          '<div class="content-card-stats-number">' + (stats.hearingsNext7 || 0) + '</div>' +
          '<div class="content-card-stats-label">Next 7 Days</div>' +
        '</div>' +
        '<div class="content-card-stats-item">' +
          '<div class="content-card-stats-number">' + (stats.casesNext30 || 0) + '</div>' +
          '<div class="content-card-stats-label">Cases Next 30 Days</div>' +
        '</div>' +
        '<div class="content-card-stats-item">' +
          '<div class="content-card-stats-number">' + (stats.judgesActive || 0) + '</div>' +
          '<div class="content-card-stats-label">Active Judges</div>' +
        '</div>' +
      '</div>' +
      (nextDateStr ? '<div class="content-card-stats-next">Next Hearing Day: ' + escapeHtml(nextDateStr) + '</div>' : '') +
      '</div>';
  }

  // Build a "Today's Schedule" slide using the judge-grouped pill layout
  function buildTodayScheduleSummarySlide(entries, now) {
    if (!entries || entries.length === 0) {
      return '<div class="content-card-slide content-card-schedule-summary">' +
        '<div class="content-card-slide-title">TODAY\'S SCHEDULE</div>' +
        '<div class="content-card-schedule-empty">No hearings scheduled</div>' +
        '</div>';
    }
    var result = buildJudgeScheduleHtml(entries, now);
    // Strip the <h4> title since the slide has its own content-card-slide-title
    var body = result.html.replace(/<h4>[\s\S]*?<\/h4>/, '');
    return '<div class="content-card-slide content-card-schedule-summary">' +
      '<div class="content-card-slide-title">TODAY\'S SCHEDULE</div>' +
      '<div class="content-card-schedule-body">' + body + '</div>' +
      '</div>';
  }

  // Build array of content card slide HTML strings from enabled modules
  function buildContentCardSlides(includeScheduleSummary) {
    var slides = [];

    // Schedule summary slide (pill view of today's schedule)
    if (includeScheduleSummary) {
      slides.push(buildTodayScheduleSummarySlide(docketData, new Date()));
    }

    if (!contentCardData || !contentCardData.enabled) {
      console.log('[content-cards] buildContentCardSlides(summary=' + includeScheduleSummary + '): data=' + !!contentCardData + ', enabled=' + (contentCardData && contentCardData.enabled) + ' → returning ' + slides.length + ' slides (schedule only)');
      return slides;
    }

    var modules = contentCardData.modules || {};

    // Upcoming hearings slide (next scheduled date)
    if (modules.upcoming_hearings && modules.upcoming_hearings.date && modules.upcoming_hearings.entries && modules.upcoming_hearings.entries.length > 0) {
      slides.push(buildUpcomingHearingsSlide(modules.upcoming_hearings));
    }

    // Info Card slides — one per card
    if (modules.info_cards && modules.info_cards.cards) {
      modules.info_cards.cards.forEach(function(card) {
        slides.push(buildInfoCardSlide(card));
      });
    }

    // News slides — one per article
    if (modules.news && modules.news.articles) {
      modules.news.articles.forEach(function(article) {
        slides.push(buildNewsSlide(article));
      });
    }

    // Statistics slide
    if (modules.statistics && modules.statistics.stats) {
      slides.push(buildStatisticsSlide(modules.statistics.stats));
    }

    console.log('[content-cards] buildContentCardSlides(summary=' + includeScheduleSummary + '): ' + slides.length + ' total slides (' +
      'upcoming=' + (modules.upcoming_hearings && modules.upcoming_hearings.entries ? modules.upcoming_hearings.entries.length + ' entries' : 'none') +
      ', info_cards=' + ((modules.info_cards && modules.info_cards.cards) || []).length +
      ', news=' + ((modules.news && modules.news.articles) || []).length +
      ', stats=' + (modules.statistics && modules.statistics.stats ? 'yes' : 'no') + ')');
    return slides;
  }

  // Activate a content card slideshow in a container (used by wayfinding and IT status)
  function activateContentCardSlideshow(container, slides) {
    console.log('[content-cards] activateContentCardSlideshow: container=' + (container ? container.id : 'null') + ', slides=' + slides.length);
    if (!container || slides.length === 0) return;

    contentCardSlides = slides;
    contentCardActive = true;
    contentCardCurrentSlide = 0;

    container.style.display = 'flex';
    showContentCardSlide(0, container);

    if (slides.length > 1) {
      var dotsHtml = '<div class="content-card-dots">';
      for (var i = 0; i < slides.length; i++) {
        dotsHtml += '<span class="content-card-dot' + (i === 0 ? ' active' : '') + '"></span>';
      }
      dotsHtml += '</div>';
      container.insertAdjacentHTML('beforeend', dotsHtml);

      var progressInterval = contentCardData ? (contentCardData.rotationInterval || 10) : 10;
      container.insertAdjacentHTML('beforeend', '<div class="content-card-progress-bar"><div class="content-card-progress-bar-fill" style="animation-duration: ' + progressInterval + 's;"></div></div>');

      if (contentCardRotationTimer) clearInterval(contentCardRotationTimer);
      contentCardRotationTimer = setInterval(function() {
        contentCardCurrentSlide = (contentCardCurrentSlide + 1) % contentCardSlides.length;
        showContentCardSlide(contentCardCurrentSlide, container);
      }, progressInterval * 1000);
    }
  }

  // Shared deactivation for content card slideshows (wayfinding, IT status)
  function deactivateContentCardsForType(containerId, restoreElId) {
    if (contentCardRotationTimer) {
      clearInterval(contentCardRotationTimer);
      contentCardRotationTimer = null;
    }
    var container = document.getElementById(containerId);
    if (container) {
      container.style.display = 'none';
      container.innerHTML = '';
    }
    if (restoreElId) {
      var restoreEl = document.getElementById(restoreElId);
      if (restoreEl) restoreEl.style.display = '';
    }
    contentCardActive = false;
    contentCardSlides = [];
    contentCardCurrentSlide = 0;
  }

  // =============================================
  // Wayfinding Directory
  // =============================================

  // Build judge-grouped schedule HTML (shared between wayfinding and IT status)
  function buildJudgeScheduleHtml(entries, now) {
    var judgeGroups = {};
    var hearingCounts = {};
    entries.forEach(function(entry) {
      var judge = entry.hearingJudge || 'Unassigned';
      if (!judgeGroups[judge]) judgeGroups[judge] = { entries: [], courtroom: null, zoom: null };
      judgeGroups[judge].entries.push(entry);
      if (entry.courtroom && !judgeGroups[judge].courtroom) {
        judgeGroups[judge].courtroom = entry.courtroom;
      }
      if (entry.isZoom && entry.zoomMeetingId && !judgeGroups[judge].zoom) {
        judgeGroups[judge].zoom = {
          meetingId: entry.zoomMeetingId,
          passcode: entry.zoomPasscode,
          phone: entry.zoomPhone
        };
      }

      var room = entry.courtroom || 'Unassigned';
      if (!hearingCounts[room]) hearingCounts[room] = 0;
      hearingCounts[room]++;
    });

    var html = '<h4>Today\'s Schedule by Judge</h4>';
    var judgeNames = Object.keys(judgeGroups).sort();
    if (judgeNames.length === 0) {
      html += '<p style="color: rgba(255,255,255,0.5); font-style: italic;">No hearings scheduled</p>';
    } else {
      judgeNames.forEach(function(judge) {
        var group = judgeGroups[judge];
        html += '<div class="wayfinding-judge-group">';
        html += '<div class="wayfinding-judge-name">' + escapeHtml(judge) + '</div>';

        var metaParts = [];
        if (group.courtroom) metaParts.push(escapeHtml(group.courtroom));
        if (group.zoom) metaParts.push('Zoom');
        if (metaParts.length > 0) {
          html += '<div class="wayfinding-judge-meta">' + metaParts.join(' &middot; ') + '</div>';
        }

        if (group.zoom) {
          html += '<div class="wayfinding-zoom-details">';
          if (group.zoom.meetingId) html += '<span class="zoom-legend-field">Meeting ID</span> <span class="zoom-legend-value">' + escapeHtml(group.zoom.meetingId) + '</span>';
          if (group.zoom.passcode) html += ' <span class="zoom-legend-sep"></span> <span class="zoom-legend-field">Passcode</span> <span class="zoom-legend-value">' + escapeHtml(group.zoom.passcode) + '</span>';
          if (group.zoom.phone) html += ' <span class="zoom-legend-sep"></span> <span class="zoom-legend-field">Phone</span> <span class="zoom-legend-value">' + escapeHtml(group.zoom.phone) + '</span>';
          html += '</div>';
        }

        var timeCounts = {};
        group.entries.forEach(function(entry) {
          var t = formatTime(entry.hearingTime);
          if (!timeCounts[t]) timeCounts[t] = { raw: entry.hearingTime, count: 0 };
          timeCounts[t].count++;
        });
        var nowMinutes = now ? now.getHours() * 60 + now.getMinutes() : null;
        html += '<div class="wayfinding-time-pills">';
        Object.keys(timeCounts).forEach(function(time) {
          var info = timeCounts[time];
          var pillClass = 'wayfinding-time-pill';
          if (nowMinutes !== null && info.raw) {
            var parts = info.raw.split(':');
            var hearingMinutes = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
            var diffMin = hearingMinutes - nowMinutes;
            if (diffMin >= -15 && diffMin <= 15) {
              pillClass += ' time-imminent';
            } else if (diffMin < -15) {
              pillClass += ' time-past';
            }
          }
          html += '<span class="' + pillClass + '">' + time + (info.count > 1 ? ' (' + info.count + ')' : '') + '</span>';
        });
        html += '</div>';

        html += '</div>';
      });
    }

    return { html: html, hearingCounts: hearingCounts };
  }

  // renderWayfinding() — removed; replaced by renderHearingPillsComponent() + renderDirectionCardsComponent()

  function getDirectionArrowSvg(direction) {
    // L-shaped compound arrows (custom path, no rotation)
    var lPaths = {
      'left-near-up':    'M21 19H15V5M11 9l4-4 4 4',
      'left-mid-up':     'M21 19H11V5M7 9l4-4 4 4',
      'left-far-up':     'M21 19H6V5M2 9l4-4 4 4',
      'left-near-down':  'M21 5H15V19M11 15l4 4 4-4',
      'left-mid-down':   'M21 5H11V19M7 15l4 4 4-4',
      'left-far-down':   'M21 5H6V19M2 15l4 4 4-4',
      'right-near-up':   'M3 19H9V5M5 9l4-4 4 4',
      'right-mid-up':    'M3 19H13V5M9 9l4-4 4 4',
      'right-far-up':    'M3 19H18V5M14 9l4-4 4 4',
      'right-near-down': 'M3 5H9V19M5 15l4 4 4-4',
      'right-mid-down':  'M3 5H13V19M9 15l4 4 4-4',
    };
    if (lPaths[direction]) {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="' + lPaths[direction] + '"/></svg>';
    }

    // Simple directional arrows (rotation of base arrow)
    var rotation = '0';
    switch (direction) {
      case 'right': rotation = '0'; break;
      case 'left': rotation = '180'; break;
      case 'up': rotation = '-90'; break;
      case 'straight': rotation = '-90'; break;
      case 'down-the-hall': rotation = '-90'; break;
      case 'up-right': rotation = '-45'; break;
      case 'up-left': rotation = '-135'; break;
      default: rotation = '0';
    }
    return '<svg viewBox="0 0 24 24" style="transform: rotate(' + rotation + 'deg)" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  }

  // =============================================
  // IT Status Monitor
  // =============================================

  var systemStatusTimer = null;

  // Parse cameras from config (with backward compat for old fields)
  function parseCamerasFromConfig() {
    if (displayConfig.cameraConfig && displayConfig.cameraConfig.cameras) {
      return displayConfig.cameraConfig.cameras;
    }
    // Backward compat: construct from old fields
    var cameras = [];
    if (displayConfig.rtspUrl1 || displayConfig.cameraLabel1) {
      cameras.push({ name: displayConfig.cameraLabel1 || 'Camera 1', url: displayConfig.rtspUrl1 || '' });
    }
    if (displayConfig.rtspUrl2 || displayConfig.cameraLabel2) {
      cameras.push({ name: displayConfig.cameraLabel2 || 'Camera 2', url: displayConfig.rtspUrl2 || '' });
    }
    return cameras;
  }

  // initItStatus() — removed; replaced by renderCameraGridComponent() + renderSystemStatusComponent()

  function createCameraTile(name, url) {
    var tile = document.createElement('div');
    tile.className = 'camera-tile';

    // Label overlay
    if (name) {
      var labelEl = document.createElement('div');
      labelEl.className = 'camera-label';
      labelEl.textContent = name;
      tile.appendChild(labelEl);
    }

    if (url) {
      // Create video element and init HLS
      var videoEl = document.createElement('video');
      videoEl.autoplay = true;
      videoEl.muted = true;
      videoEl.playsInline = true;
      tile.appendChild(videoEl);

      var canvas = document.createElement('canvas');
      canvas.style.display = 'none';
      tile.appendChild(canvas);

      if (typeof Hls !== 'undefined' && Hls.isSupported()) {
        var hls = new Hls({ enableWorker: true, lowLatencyMode: true });
        hls.loadSource(url);
        hls.attachMedia(videoEl);
        hls.on(Hls.Events.ERROR, function(event, data) {
          if (data.fatal) {
            console.error('HLS fatal error for ' + name + ':', data.type);
            videoEl.style.display = 'none';
            canvas.style.display = 'block';
            showTestPatternOnCanvas(canvas, name || 'Camera Offline');
          }
        });
        hlsPlayers.push(hls);
      } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        videoEl.src = url;
        videoEl.addEventListener('error', function() {
          videoEl.style.display = 'none';
          canvas.style.display = 'block';
          showTestPatternOnCanvas(canvas, name || 'Camera Offline');
        }, { once: true });
      } else {
        videoEl.style.display = 'none';
        canvas.style.display = 'block';
        showTestPatternOnCanvas(canvas, name || 'Camera Offline');
      }
    } else {
      // No URL — show test pattern
      var canvas = document.createElement('canvas');
      tile.appendChild(canvas);
      showTestPatternOnCanvas(canvas, name || 'Test Pattern');
    }

    return tile;
  }

  // Canvas test pattern (SMPTE color bars + label + clock)
  // Always renders at native 1080p; CSS object-fit scales it to the tile.
  function showTestPatternOnCanvas(canvas, label) {
    var w = 1920;
    var h = 1080;
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');

    function draw() {

      // SMPTE color bars (top 2/3)
      var colors = ['#C0C0C0', '#C0C000', '#00C0C0', '#00C000', '#C000C0', '#C00000', '#0000C0'];
      var barW = w / colors.length;
      var barH = h * 0.67;
      colors.forEach(function(color, i) {
        ctx.fillStyle = color;
        ctx.fillRect(i * barW, 0, barW + 1, barH);
      });

      // Bottom stripe (dark bars)
      var darkColors = ['#0000C0', '#000000', '#C000C0', '#000000', '#00C0C0', '#000000', '#C0C0C0'];
      var stripH = h * 0.08;
      darkColors.forEach(function(color, i) {
        ctx.fillStyle = color;
        ctx.fillRect(i * barW, barH, barW + 1, stripH);
      });

      // Black bottom section
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, barH + stripH, w, h - barH - stripH);

      // "TEST PATTERN" text
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold ' + Math.max(24, Math.floor(h * 0.05)) + 'px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('TEST PATTERN', w / 2, barH + stripH + (h - barH - stripH) * 0.35);

      // Label text
      if (label) {
        ctx.font = Math.max(16, Math.floor(h * 0.03)) + 'px Arial, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText(label, w / 2, barH + stripH + (h - barH - stripH) * 0.55);
      }

      // Clock
      var now = new Date();
      var timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
      ctx.font = 'bold ' + Math.max(20, Math.floor(h * 0.04)) + 'px Arial, sans-serif';
      ctx.fillStyle = '#FFD700';
      ctx.fillText(timeStr, w / 2, barH + stripH + (h - barH - stripH) * 0.78);
    }

    draw();
    var timer = setInterval(draw, 1000);
    testPatternTimers.push(timer);
  }

  // System status fetching and rendering
  async function fetchSystemStatus() {
    if (screensaverActive) return;
    try {
      var response = await fetch(
        CONFIG.apiBaseUrl + '/api/displays/' + CONFIG.displayId + '/system-status',
        { headers: { 'X-API-Key': getApiKey() } }
      );
      if (response.ok) {
        var data = await response.json();
        renderSystemStatus(data);
      }
    } catch (error) {
      console.error('Failed to fetch system status:', error);
    }
  }

  function renderSystemStatus(data) {
    var el = document.getElementById('it-system-status');
    if (!el) return;

    var html = '';

    // Health status
    var healthOk = data.health && data.health.status === 'ok';
    var uptimeStr = '';
    if (data.health && data.health.uptime) {
      var secs = Math.floor(data.health.uptime);
      var hrs = Math.floor(secs / 3600);
      var mins = Math.floor((secs % 3600) / 60);
      uptimeStr = hrs + 'h ' + mins + 'm';
    }
    html += '<div class="it-status-item">';
    html += '<span class="it-status-dot" style="background:' + (healthOk ? '#4CAF50' : '#E53E3E') + '"></span>';
    html += '<span class="it-status-label">System</span>';
    html += '<span class="it-status-value">' + (healthOk ? 'OK' : 'Database Disconnected') + '</span>';
    if (uptimeStr) html += '<span class="it-status-label" style="margin-left:8px">Uptime</span><span class="it-status-value">' + uptimeStr + '</span>';
    html += '</div>';

    // Calendar sync
    if (data.calendarSync) {
      var sync = data.calendarSync;
      var syncOk = sync.lastRunStatus === 'success';
      var syncText = 'Never';
      if (sync.lastRunAt) {
        var ago = Math.floor((Date.now() - new Date(sync.lastRunAt).getTime()) / 60000);
        if (ago < 1) syncText = 'Just now';
        else if (ago < 60) syncText = ago + ' min ago';
        else syncText = Math.floor(ago / 60) + 'h ' + (ago % 60) + 'm ago';
        syncText += ' \u2014 ' + (syncOk ? 'Success' : 'Failed');
      }
      html += '<div class="it-status-item">';
      html += '<span class="it-status-dot" style="background:' + (sync.lastRunAt ? (syncOk ? '#4CAF50' : '#E53E3E') : '#999') + '"></span>';
      html += '<span class="it-status-label">Calendar Sync</span>';
      html += '<span class="it-status-value">' + syncText + '</span>';
      html += '</div>';
    }

    // Displays
    if (data.displays) {
      var online = data.displays.filter(function(d) { return d.status === 'online'; }).length;
      var total = data.displays.length;
      html += '<div class="it-status-item">';
      html += '<span class="it-status-dot" style="background:' + (online > 0 ? '#4CAF50' : '#E53E3E') + '"></span>';
      html += '<span class="it-status-label">Displays</span>';
      html += '<span class="it-status-value">' + online + '/' + total + ' online</span>';
      html += '</div>';

      // Individual display pills on their own line
      html += '<div class="it-status-item it-status-displays-list">';
      data.displays.forEach(function(d) {
        var isOn = d.status === 'online';
        html += '<span class="it-status-display-pill ' + (isOn ? 'online' : 'offline') + '">';
        html += escapeHtml(d.name);
        html += '</span>';
      });
      html += '</div>';
    }

    el.innerHTML = html;
  }

  // renderItHearings() — removed; replaced by renderHearingPillsComponent()

  // =============================================
  // Screensaver Logic
  // =============================================

  // Check if current time is within active hours
  function isWithinActiveHours() {
    if (!displayConfig.scheduleEnabled) return true;

    const schedule = displayConfig.scheduleConfig;
    if (!schedule || typeof schedule !== 'object') return true;

    const now = new Date();
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const todayName = dayNames[now.getDay()];
    const dayConfig = schedule[todayName];

    // null = inactive all day
    if (dayConfig === null || dayConfig === undefined) return false;
    if (!dayConfig.start || !dayConfig.end) return true;

    const [startH, startM] = dayConfig.start.split(':').map(Number);
    const [endH, endM] = dayConfig.end.split(':').map(Number);
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  // Check schedule and activate/deactivate screensaver
  function checkSchedule() {
    // Manual override takes precedence
    if (screensaverManualOverride === 'on') {
      if (!screensaverActive) activateScreensaver();
      return;
    }
    if (screensaverManualOverride === 'off') {
      if (screensaverActive) deactivateScreensaver();
      return;
    }

    // Auto mode based on schedule
    const active = isWithinActiveHours();
    if (!active && !screensaverActive) {
      activateScreensaver();
    } else if (active && screensaverActive) {
      deactivateScreensaver();
    }
  }

  function activateScreensaver() {
    const overlay = document.getElementById('screensaver-overlay');
    const content = document.getElementById('screensaver-content');
    if (!overlay || !content) return;

    screensaverActive = true;
    content.innerHTML = '';

    const type = displayConfig.screensaverType || 'black';

    if (type === 'clock') {
      const clockEl = document.createElement('div');
      clockEl.className = 'screensaver-clock';
      content.appendChild(clockEl);
      startBouncingAnimation(clockEl, function() {
        clockEl.textContent = new Date().toLocaleTimeString('en-US', {
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
        });
      });
    } else if (type === 'logo') {
      const logoEl = document.createElement('img');
      logoEl.className = 'screensaver-logo';
      logoEl.src = displayConfig.courtLogo
        ? CONFIG.apiBaseUrl + displayConfig.courtLogo
        : 'assets/court-seal.svg';
      logoEl.alt = 'Court Seal';
      content.appendChild(logoEl);
      startBouncingAnimation(logoEl);
    }
    // 'black' mode: just show the overlay, no content

    overlay.style.display = 'block';
    console.log('Screensaver activated (type: ' + type + ')');
  }

  function deactivateScreensaver() {
    var overlay = document.getElementById('screensaver-overlay');
    var content = document.getElementById('screensaver-content');
    if (overlay) overlay.style.display = 'none';
    if (content) content.innerHTML = '';

    if (screensaverAnimationId) {
      cancelAnimationFrame(screensaverAnimationId);
      screensaverAnimationId = null;
    }

    screensaverActive = false;
    screensaverManualOverride = null;

    // Refresh all data on wake
    fetchDisplayConfig();
    fetchDocket();
    fetchAnnouncements();
    fetchWeather();

    console.log('Screensaver deactivated, refreshing data');
  }

  function startBouncingAnimation(element, updateFn) {
    // Initial position and velocity
    var x = Math.random() * 300 + 100;
    var y = Math.random() * 200 + 100;
    var vx = 1.5;
    var vy = 1.0;

    function animate() {
      var overlay = document.getElementById('screensaver-overlay');
      if (!overlay || overlay.style.display === 'none') return;

      if (updateFn) updateFn();

      // Get bounds
      var ow = overlay.offsetWidth || 1920;
      var oh = overlay.offsetHeight || 1080;
      var ew = element.offsetWidth || 200;
      var eh = element.offsetHeight || 60;

      x += vx;
      y += vy;

      // Bounce off edges
      if (x <= 0 || x + ew >= ow) { vx = -vx; x = Math.max(0, Math.min(x, ow - ew)); }
      if (y <= 0 || y + eh >= oh) { vy = -vy; y = Math.max(0, Math.min(y, oh - eh)); }

      element.style.left = x + 'px';
      element.style.top = y + 'px';

      screensaverAnimationId = requestAnimationFrame(animate);
    }

    // Initial position set
    element.style.left = x + 'px';
    element.style.top = y + 'px';

    screensaverAnimationId = requestAnimationFrame(animate);
  }

  // =============================================
  // Markdown Renderer (lightweight, for card bodies)
  // =============================================

  function renderMarkdown(text) {
    if (!text) return '';
    // Sanitize: strip script tags, event handlers
    var s = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    s = s.replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '');
    // Bold: **text**
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic: *text*
    s = s.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
    // Line breaks
    s = s.replace(/\n/g, '<br>');
    // Bullet lists: lines starting with - (after <br> conversion)
    s = s.replace(/(?:^|<br>)\s*-\s+(.+?)(?=<br>|$)/g, function(match, item) {
      return '<br>&bull; ' + item;
    });
    // Links: [text](url)
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color: #87CEEB; text-decoration: underline;">$1</a>');
    // Clean up leading <br>
    s = s.replace(/^<br>/, '');
    return s;
  }

  // =============================================
  // Emergency Content System
  // =============================================

  async function fetchEmergencyStatus() {
    try {
      var response = await fetch(
        CONFIG.apiBaseUrl + '/api/displays/' + encodeURIComponent(CONFIG.displayId) + '/emergency',
        { headers: { 'x-api-key': CONFIG.apiKey } }
      );
      if (response.ok) {
        var data = await response.json();
        if (data.active && !emergencyActive) {
          handleEmergencyActivation(data);
        } else if (!data.active && emergencyActive) {
          deactivateEmergency();
        }
      }
    } catch (error) {
      console.error('[EMERGENCY] fetchEmergencyStatus error:', error);
    }
  }

  function handleEmergencyActivation(data) {
    console.log('[EMERGENCY] Activating level ' + data.level + ' emergency');
    emergencyActive = true;
    emergencyData = data;
    emergencyLevel = data.level;

    var cardHtml = buildEmergencyCardHtml(data);

    if (data.level === 3) {
      activateEmergencyLevel3(cardHtml);
    } else if (data.level === 2) {
      activateEmergencyLevel2(cardHtml);
    } else if (data.level === 1) {
      activateEmergencyLevel1(data, cardHtml);
    }
  }

  function activateEmergencyLevel3(cardHtml) {
    // Full screen takeover - above everything including screensaver
    var overlay = document.getElementById('emergency-overlay');
    if (!overlay) return;
    overlay.className = 'emergency-overlay emergency-level-3';
    overlay.innerHTML = cardHtml;
    overlay.style.display = 'flex';
    console.log('[EMERGENCY] Level 3: full screen takeover active');
  }

  function activateEmergencyLevel2(cardHtml) {
    // Content area override - replaces template content but keeps header & bottom bar
    var contentArea = document.getElementById('template-content');
    if (!contentArea) return;
    // Create level-2 overlay inside the content area
    var overlay = document.getElementById('emergency-overlay');
    if (!overlay) return;
    overlay.className = 'emergency-overlay emergency-level-2';
    overlay.innerHTML = cardHtml;
    overlay.style.display = 'flex';
    // Move overlay into content area for proper positioning
    contentArea.appendChild(overlay);
    console.log('[EMERGENCY] Level 2: content area override active');
  }

  function activateEmergencyLevel1(data, cardHtml) {
    // Section override - replaces a single template component and expands to fill the content area
    var targetSlug = data.target;
    if (!targetSlug) {
      console.warn('[EMERGENCY] Level 1 requires a target component slug');
      return;
    }
    // Find the template cell for this component
    var cells = document.querySelectorAll('.template-cell');
    var targetCell = null;
    cells.forEach(function(cell) {
      if (cell.dataset.componentType === targetSlug) {
        targetCell = cell;
      }
    });
    if (!targetCell) {
      console.warn('[EMERGENCY] Level 1: target component "' + targetSlug + '" not found');
      return;
    }
    // Save originals
    targetCell.dataset.emergencyBackup = targetCell.innerHTML;
    targetCell.dataset.emergencyStyles = targetCell.style.cssText;

    // Replace content
    targetCell.innerHTML = '<div class="emergency-section" style="width:100%;height:100%;display:flex;">' + cardHtml + '</div>';

    // Clear inline styles from scaffoldComponent (e.g. camera-grid's inner grid)
    // but preserve the grid-area placement so the cell stays in its grid position
    var savedArea = targetCell.style.gridArea;
    targetCell.style.cssText = '';
    if (savedArea) targetCell.style.gridArea = savedArea;

    console.log('[EMERGENCY] Level 1: section override on "' + targetSlug + '" active');
  }

  function deactivateEmergency() {
    if (!emergencyActive) return;
    console.log('[EMERGENCY] Deactivating emergency level ' + emergencyLevel);

    if (emergencyLevel === 3 || emergencyLevel === 2) {
      var overlay = document.getElementById('emergency-overlay');
      if (overlay) {
        overlay.style.display = 'none';
        overlay.innerHTML = '';
        overlay.className = 'emergency-overlay';
        // If it was moved into template-content for level 2, move it back
        var body = document.body;
        var screensaver = document.getElementById('screensaver-overlay');
        if (overlay.parentElement && overlay.parentElement.id === 'template-content') {
          // Move back before screensaver
          if (screensaver) {
            body.insertBefore(overlay, screensaver);
          } else {
            body.appendChild(overlay);
          }
        }
      }
    } else if (emergencyLevel === 1) {
      // Restore the original cell content and inline styles
      var cells = document.querySelectorAll('.template-cell');
      cells.forEach(function(cell) {
        if (cell.dataset.emergencyBackup !== undefined) {
          cell.innerHTML = cell.dataset.emergencyBackup;
          delete cell.dataset.emergencyBackup;
        }
        if (cell.dataset.emergencyStyles !== undefined) {
          cell.style.cssText = cell.dataset.emergencyStyles;
          delete cell.dataset.emergencyStyles;
        }
      });
    }

    emergencyActive = false;
    emergencyData = null;
    emergencyLevel = 0;

    // Re-render normal content
    renderDocket();
    console.log('[EMERGENCY] Emergency deactivated, normal content restored');
  }

  function buildEmergencyCardHtml(data) {
    var iconHtml = '';
    if (data.icon) {
      var iconMap = {
        phone: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
        clock: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
        gavel: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
        info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
        location: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z',
        calendar: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
        shield: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
        document: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
        warning: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
      };
      var path = iconMap[data.icon] || iconMap.warning;
      iconHtml = '<div class="emergency-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="' + path + '"/></svg></div>';
    } else {
      // Default: warning icon for emergencies
      iconHtml = '<div class="emergency-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg></div>';
    }
    return '<div class="emergency-card emergency-level-' + (data.level || 3) + '">' +
      iconHtml +
      '<div class="emergency-title">' + escapeHtml(data.title) + '</div>' +
      '<div class="emergency-body">' + renderMarkdown(data.body) + '</div>' +
      '</div>';
  }

  // Send heartbeat
  function sendHeartbeat() {
    if (socket && socket.connected) {
      socket.emit('display:heartbeat', {
        displayId: CONFIG.displayId,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Start heartbeat
  setInterval(sendHeartbeat, 60000); // Every minute

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
