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
  function init() {
    console.log('Initializing display:', CONFIG.displayId);

    // Start clock
    updateClock();
    setInterval(updateClock, CONFIG.clockInterval);

    // Fetch initial data
    fetchCourtBranding();
    fetchDisplayConfig();
    fetchDocket();
    fetchAnnouncements();
    fetchWeather();

    // Set up refresh intervals
    setInterval(fetchDocket, CONFIG.refreshInterval);
    setInterval(fetchAnnouncements, CONFIG.refreshInterval);
    setInterval(fetchWeather, CONFIG.weatherRefreshInterval);

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

    // Check schedule after config loads
    checkSchedule();
  }

  // Fetch docket entries
  async function fetchDocket() {
    try {
      const response = await fetch(
        `${CONFIG.apiBaseUrl}/api/displays/${CONFIG.displayId}/docket`,
        {
          headers: {
            'X-API-Key': getApiKey(),
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        docketData = data.entries || [];
        renderDocket();
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
        } else if (minutesDiff !== null && minutesDiff <= 0) {
          // Scheduled but time has passed -- treat as upcoming soon (clock drift / not yet started)
          upcomingSoon.push({ entry, category: 'upcoming_soon' });
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
      ? '<span class="adversary-marker">&#8224;</span>'
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

  // Create weighted rotation order: high-priority pages shown after every low-priority page
  function buildRotationOrder(pages) {
    if (pages.length <= 1) return pages.map((_, i) => i);

    const highPages = [];
    const otherPages = [];

    pages.forEach((page, i) => {
      if (page.priority === 'high') highPages.push(i);
      else otherPages.push(i);
    });

    // If no high-priority pages, just cycle through all
    if (highPages.length === 0) return pages.map((_, i) => i);
    // If no other pages, just cycle high-priority
    if (otherPages.length === 0) return highPages;

    // Interleave: after each other page, show all high-priority pages
    const order = [];
    otherPages.forEach(otherIdx => {
      // Show high-priority pages first
      highPages.forEach(hIdx => order.push(hIdx));
      order.push(otherIdx);
    });
    // End with high-priority pages one more time
    highPages.forEach(hIdx => order.push(hIdx));

    return order;
  }

  function showPage(pageIndex) {
    const tbody = document.getElementById('docket-body');
    if (!tbody || !paginationState.pages[pageIndex]) return;

    tbody.innerHTML = paginationState.pages[pageIndex].html;

    const totalPages = paginationState.pages.length;
    if (totalPages > 1) {
      // Move the first separator's label into the legend bar so it matches
      // the "(CONT.)" treatment on continuation pages.
      let label = paginationState.pages[pageIndex].contLabel || '';
      const firstSep = tbody.querySelector('tr.time-separator');
      if (firstSep) {
        const labelEl = firstSep.querySelector('.separator-label');
        if (labelEl) label = labelEl.textContent;
        firstSep.remove();
      }
      updatePaginationInfo(pageIndex, label);
    } else {
      updatePaginationInfo(pageIndex, '');
    }
  }

  function transitionToNextPage() {
    const tbody = document.getElementById('docket-body');
    if (!tbody || paginationState.pages.length === 0) return;

    // Advance to next position in rotation order
    paginationState.currentIndex = (paginationState.currentIndex + 1) % paginationState.rotationOrder.length;
    const nextPageIdx = paginationState.rotationOrder[paginationState.currentIndex];

    // Fade out
    tbody.classList.add('page-fade-out');

    setTimeout(() => {
      showPage(nextPageIdx);
      tbody.classList.remove('page-fade-out');
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

    // Clear pagination info from legend bar, but keep stricken notice
    const leftEl = document.getElementById('pagination-info');
    if (leftEl) leftEl.innerHTML = getStrickenNotice();
    updateLegendBarVisibility();
  }

  // Render docket table
  function renderDocket() {
    const tbody = document.getElementById('docket-body');
    if (!tbody) return;

    if (docketData.length === 0) {
      tbody.innerHTML = `
        <tr class="placeholder-row">
          <td colspan="7">No hearings scheduled for today</td>
        </tr>
      `;
      renderZoomLegend(null);
      return;
    }

    const now = new Date();
    const isSmartMode = displayConfig.docketViewMode === 'smart';
    const showZoomInfo = displayConfig.showZoomInfo !== false;

    // Collect zoom meetings for pill rendering and legend (no time gate)
    const legendMap = showZoomInfo ? collectAllZoomMeetings(docketData) : null;

    if (isSmartMode) {
      renderSmartDocket(tbody, docketData, now, legendMap);
    } else {
      renderAllDocket(tbody, docketData, now, legendMap);
    }

    // Render zoom legend (always shows for any zoom hearing today, not time-gated)
    renderZoomLegend(legendMap);

    // Adjust docket section bottom padding to avoid zoom legend overlap
    adjustDocketPadding();

    // Activate pagination if needed
    const container = document.getElementById('docket-container');
    const scrollThreshold = document.body.classList.contains('portrait') ? 18 : 8;
    const rowCount = tbody.querySelectorAll('tr:not(.time-separator)').length;

    if (container && rowCount > scrollThreshold) {
      container.classList.remove('scrolling'); // Remove legacy auto-scroll class
      const rowsPerPage = getRowsPerPage();
      const sections = isSmartMode
        ? buildSectionsForPagination(docketData, now, legendMap)
        : buildAllSectionsForPagination(docketData, now, legendMap);
      const pages = buildPaginatedPages(sections, rowsPerPage);

      if (pages.length > 0) {
        // Soft refresh: if page structure is similar, just update current page content
        const newSig = pages.map(p => p.html.length + ':' + p.priority).join('|');
        if (paginationState.active && newSig === paginationState.pageSignature) {
          // Soft refresh — update pages in place without restarting rotation
          paginationState.pages = pages;
          const currentPageIdx = paginationState.rotationOrder[paginationState.currentIndex];
          if (currentPageIdx !== undefined) {
            showPage(currentPageIdx);
          }
        } else {
          startPagination(pages);
        }
      }
    } else if (container) {
      container.classList.remove('scrolling');
      stopPagination();
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
    try {
      const response = await fetch(
        `${CONFIG.apiBaseUrl}/api/announcements?active=true`,
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
          console.log('Refresh command received');
          window.location.reload();
        });

        socket.on('display:message', (data) => {
          console.log('Message received:', data);
          showOverlayMessage(data.message, data.duration || 5000);
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
