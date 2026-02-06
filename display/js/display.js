/**
 * Courthouse Digital Signage - Display Client
 * Handles data fetching, rendering, and real-time updates
 */

(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    apiBaseUrl: 'http://localhost:3000',
    displayId: getDisplayId(),
    refreshInterval: 30000, // 30 seconds
    clockInterval: 1000, // 1 second
    weatherRefreshInterval: 900000, // 15 minutes
    tickerSpeed: 50, // pixels per second
  };

  // State
  let isOnline = true;
  let lastUpdate = null;
  let docketData = [];
  let announcements = [];
  let displayConfig = {};
  let socket = null;

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

        const officialsEl = document.getElementById('court-officials');
        if (officialsEl) {
          const parts = [];
          if (data.chiefJudge) parts.push(data.chiefJudge + ', Chief Judge');
          if (data.clerkOfCourt) parts.push(data.clerkOfCourt + ', Clerk of Court');
          officialsEl.textContent = parts.join(' \u2022 ');
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

    // Apply chief judge and clerk of court
    const officialsEl = document.getElementById('court-officials');
    if (officialsEl) {
      const parts = [];
      if (displayConfig.chiefJudge) parts.push(displayConfig.chiefJudge + ', Chief Judge');
      if (displayConfig.clerkOfCourt) parts.push(displayConfig.clerkOfCourt + ', Clerk of Court');
      officialsEl.textContent = parts.join(' \u2022 ');
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

    if (!displayConfig.tickerEnabled) {
      const tickerEl = document.getElementById('ticker-container');
      if (tickerEl) tickerEl.style.display = 'none';
    }

    // Apply ticker speed
    if (displayConfig.tickerSpeed) {
      const duration = displayConfig.tickerSpeed === 'slow' ? 45 :
                       displayConfig.tickerSpeed === 'fast' ? 20 : 30;
      const tickerContent = document.getElementById('ticker-content');
      if (tickerContent) {
        tickerContent.style.animationDuration = `${duration}s`;
      }
    }
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

  // Render docket table
  function renderDocket() {
    const tbody = document.getElementById('docket-body');
    if (!tbody) return;

    if (docketData.length === 0) {
      tbody.innerHTML = `
        <tr class="placeholder-row">
          <td colspan="6">No hearings scheduled for today</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = docketData.map(entry => {
      const classes = [];
      if (entry.status === 'in_progress') classes.push('current');
      if (entry.status === 'stricken') classes.push('stricken');

      const adversaryMarker = entry.adversaryNumber
        ? '<span class="adversary-marker">&#8224;</span>'
        : '';

      return `
        <tr class="${classes.join(' ')}">
          <td>${escapeHtml(entry.caseTitle)}${adversaryMarker}</td>
          <td>${escapeHtml(entry.caseChapter)}</td>
          <td>${formatTime(entry.hearingTime)}</td>
          <td>${escapeHtml(entry.caseNumber)}</td>
          <td>${escapeHtml(truncateText(entry.hearingMatter, 80))}</td>
          <td>${escapeHtml(entry.courtroom || '--')}</td>
        </tr>
      `;
    }).join('');

    // Enable auto-scroll if needed
    const container = document.getElementById('docket-container');
    if (container && docketData.length > 8) {
      container.classList.add('scrolling');
    } else if (container) {
      container.classList.remove('scrolling');
    }

    // Show Zoom info if current hearing has Zoom
    const currentEntry = docketData.find(e => e.status === 'in_progress');
    if (currentEntry && currentEntry.isZoom) {
      showZoomInfo(currentEntry);
    } else {
      hideZoomInfo();
    }
  }

  // Show Zoom information
  function showZoomInfo(entry) {
    const zoomEl = document.getElementById('zoom-info');
    if (!zoomEl) return;

    document.getElementById('zoom-meeting-id').textContent = entry.zoomMeetingId || '---';
    document.getElementById('zoom-passcode').textContent = entry.zoomPasscode || '---';
    document.getElementById('zoom-phone').textContent = entry.zoomPhone || '---';
    zoomEl.style.display = 'flex';
  }

  // Hide Zoom information
  function hideZoomInfo() {
    const zoomEl = document.getElementById('zoom-info');
    if (zoomEl) zoomEl.style.display = 'none';
  }

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
        announcements = data.announcements || [];
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
      return;
    }

    tickerContent.innerHTML = announcements
      .map(a => `<span class="ticker-text">${escapeHtml(a.text)}</span>`)
      .join('');
  }

  // Weather cache for offline mode
  let cachedWeatherData = null;

  // Fetch weather data
  async function fetchWeather() {
    try {
      // Using National Weather Service API (free, no key required)
      // Salt Lake City coordinates: 40.7608, -111.8910
      const pointsUrl = 'https://api.weather.gov/points/40.7608,-111.8910';

      const pointsResponse = await fetch(pointsUrl, {
        headers: {
          'User-Agent': 'CourthouseSignage/1.0',
        },
      });

      if (pointsResponse.ok) {
        const pointsData = await pointsResponse.json();
        const forecastUrl = pointsData.properties.forecast;

        const forecastResponse = await fetch(forecastUrl, {
          headers: {
            'User-Agent': 'CourthouseSignage/1.0',
          },
        });

        if (forecastResponse.ok) {
          const forecastData = await forecastResponse.json();
          const periods = forecastData.properties.periods;

          // Get current conditions from first period
          const current = periods[0];

          // Find today's high and low from the forecast periods
          // NWS returns periods like "Today", "Tonight", "Tuesday", etc.
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

          // Cache the weather data
          cachedWeatherData = {
            current,
            high,
            low,
            temperatureUnit: current.temperatureUnit,
            timestamp: new Date().toISOString()
          };

          // Store in localStorage for offline mode
          try {
            localStorage.setItem('weatherCache', JSON.stringify(cachedWeatherData));
          } catch (e) {
            console.warn('Could not cache weather data:', e);
          }

          renderWeather(cachedWeatherData);
        }
      }
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

    if (iconEl) iconEl.textContent = getWeatherEmoji(data.current.shortForecast);
    if (tempEl) tempEl.textContent = `${data.current.temperature}°${data.temperatureUnit}`;
    if (highEl && data.high !== null) highEl.textContent = `H: ${data.high}°`;
    if (lowEl && data.low !== null) lowEl.textContent = `L: ${data.low}°`;
  }

  // Get weather emoji based on forecast
  function getWeatherEmoji(forecast) {
    const lower = (forecast || '').toLowerCase();
    if (lower.includes('sunny') || lower.includes('clear')) return 'sunny';
    if (lower.includes('cloud')) return 'cloudy';
    if (lower.includes('rain') || lower.includes('shower')) return 'rain';
    if (lower.includes('snow')) return 'snow';
    if (lower.includes('thunder') || lower.includes('storm')) return 'stormy';
    return 'weather';
  }

  // Set up WebSocket connection
  function setupWebSocket() {
    try {
      // Import socket.io client dynamically or use global
      if (typeof io !== 'undefined') {
        socket = io(CONFIG.apiBaseUrl);

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
