import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const app = express();
const httpServer = createServer(app);
const prisma = new PrismaClient();

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'courthouse-signage-secret-key-change-in-production';
const JWT_EXPIRES_IN = '30m'; // 30 minutes session timeout
const JWT_REFRESH_EXPIRES_IN = '7d'; // 7 days for refresh token

// Interface for JWT payload
interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

// Extend Express Request type
interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

// Environment variables
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:8080'];

// Socket.io setup
const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// =========================================
// Authentication Middleware
// =========================================
const authenticateToken = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Interface for API key authenticated request
interface ApiKeyRequest extends Request {
  display?: {
    id: string;
    name: string;
  };
}

// Middleware to authenticate display clients via X-API-Key header
const authenticateApiKey = async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    return res.status(401).json({ error: 'API key required. Use X-API-Key header.' });
  }

  try {
    // The display ID is in the URL params
    const displayId = req.params.id;

    // Find the display
    const display = await prisma.display.findUnique({
      where: { id: displayId }
    });

    if (!display) {
      return res.status(404).json({ error: 'Display not found' });
    }

    // Verify the API key matches
    // The apiKeyHash stored is the plain key (from seed), so we compare directly
    // In production, you'd hash the incoming key and compare hashes
    if (display.apiKeyHash !== apiKey) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    // Attach display info to request
    req.display = {
      id: display.id,
      name: display.name
    };

    // Update last heartbeat for the display
    await prisma.display.update({
      where: { id: displayId },
      data: {
        lastHeartbeat: new Date(),
        status: 'online'
      }
    });

    next();
  } catch (error) {
    console.error('API key authentication error:', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
};

// =========================================
// Authentication Endpoints
// =========================================

// POST /api/auth/login - User login with JWT response
app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({ error: 'Account is deactivated' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT tokens
    const accessToken = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    const refreshToken = jwt.sign(
      { userId: user.id, type: 'refresh' },
      JWT_SECRET,
      { expiresIn: JWT_REFRESH_EXPIRES_IN }
    );

    console.log(`[AUTH] User logged in: ${user.email} (${user.role})`);

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/logout - Logout (client-side token removal)
app.post('/api/auth/logout', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  // In a stateless JWT setup, logout is handled client-side
  // We could add token blacklisting here in the future
  console.log(`[AUTH] User logged out: ${req.user?.email}`);
  res.json({ message: 'Logged out successfully' });
});

// POST /api/auth/refresh - Refresh JWT token
app.post('/api/auth/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    // Verify refresh token
    let decoded: { userId: string; type: string };
    try {
      decoded = jwt.verify(refreshToken, JWT_SECRET) as { userId: string; type: string };
    } catch (err) {
      return res.status(403).json({ error: 'Invalid or expired refresh token' });
    }

    if (decoded.type !== 'refresh') {
      return res.status(403).json({ error: 'Invalid token type' });
    }

    // Fetch user to ensure they still exist and are active
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user || !user.isActive) {
      return res.status(403).json({ error: 'User not found or deactivated' });
    }

    // Generate new access token
    const accessToken = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    console.log(`[AUTH] Token refreshed for: ${user.email}`);

    res.json({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// GET /api/auth/me - Get current user info
app.get('/api/auth/me', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'degraded',
      database: 'disconnected',
      timestamp: new Date().toISOString(),
      error: 'Database connection failed',
    });
  }
});

// Schema verification endpoint - verifies all required tables exist
app.get('/api/schema-check', async (req, res) => {
  try {
    const tables: { name: string }[] = await prisma.$queryRaw`
      SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%'
    `;

    const tableNames = tables.map(t => t.name).sort();

    // Required tables from the Prisma schema (mapped names)
    const requiredTables = [
      'users',
      'docket_entries',
      'displays',
      'display_docket_entries',
      'announcements',
      'api_keys',
      'audit_logs',
      'settings',
      'calendar_metadata'
    ].sort();

    const missingTables = requiredTables.filter(t => !tableNames.includes(t));
    const extraTables = tableNames.filter(t => !requiredTables.includes(t));

    // Get column info for users table
    const usersColumns: { name: string; type: string }[] = await prisma.$queryRaw`
      PRAGMA table_info(users)
    `;

    // Get column info for docket_entries table
    const docketColumns: { name: string; type: string }[] = await prisma.$queryRaw`
      PRAGMA table_info(docket_entries)
    `;

    // Get column info for displays table
    const displaysColumns: { name: string; type: string }[] = await prisma.$queryRaw`
      PRAGMA table_info(displays)
    `;

    res.json({
      status: missingTables.length === 0 ? 'ok' : 'incomplete',
      tables: tableNames,
      requiredTables,
      missingTables,
      extraTables,
      columnInfo: {
        users: usersColumns.map(c => c.name),
        docket_entries: docketColumns.map(c => c.name),
        displays: displaysColumns.map(c => c.name),
      }
    });
  } catch (error) {
    console.error('Schema check failed:', error);
    res.status(500).json({
      status: 'error',
      error: 'Schema check failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// =========================================
// Docket Endpoints
// =========================================

// GET /api/docket - List docket entries with optional filters
app.get('/api/docket', async (req: Request, res: Response) => {
  try {
    const { date, courtroom, status, judge, chapter } = req.query;

    // Build filter conditions
    const where: Record<string, unknown> = {};

    // Filter by date (default to today)
    if (date) {
      const filterDate = new Date(date as string);
      filterDate.setHours(0, 0, 0, 0);
      const nextDay = new Date(filterDate);
      nextDay.setDate(nextDay.getDate() + 1);
      where.hearingDate = {
        gte: filterDate,
        lt: nextDay
      };
    }

    if (courtroom) where.courtroom = courtroom;
    if (status) where.status = status;
    if (judge) where.hearingJudge = judge;
    if (chapter) where.caseChapter = chapter;

    const entries = await prisma.docketEntry.findMany({
      where,
      orderBy: [
        { hearingTime: 'asc' },
        { caseTitle: 'asc' }
      ]
    });

    console.log(`[DB] SELECT from docket_entries - found ${entries.length} records`);
    res.json({ entries, total: entries.length });
  } catch (error) {
    console.error('Failed to fetch docket entries:', error);
    res.status(500).json({ error: 'Failed to fetch docket entries' });
  }
});

// POST /api/docket - Create a single docket entry
app.post('/api/docket', async (req: Request, res: Response) => {
  try {
    const {
      caseNumber,
      caseTitle,
      caseChapter,
      adversaryNumber,
      adversaryTitle,
      hearingDate,
      hearingTime,
      hearingMatter,
      hearingJudge,
      courtroom,
      movingParty,
      opposingParty,
      trustee,
      isZoom,
      zoomMeetingId,
      zoomPasscode,
      zoomPhone,
      status,
      statusNote,
      comment
    } = req.body;

    // Validate required fields
    if (!caseNumber || !caseTitle || !caseChapter || !hearingDate || !hearingTime || !hearingMatter || !hearingJudge) {
      return res.status(400).json({
        error: 'Missing required fields: caseNumber, caseTitle, caseChapter, hearingDate, hearingTime, hearingMatter, hearingJudge'
      });
    }

    const entry = await prisma.docketEntry.create({
      data: {
        caseNumber,
        caseTitle,
        caseChapter,
        adversaryNumber,
        adversaryTitle,
        hearingDate: new Date(hearingDate),
        hearingTime,
        hearingMatter,
        hearingJudge,
        courtroom,
        movingParty,
        opposingParty,
        trustee,
        isZoom: isZoom || false,
        zoomMeetingId,
        zoomPasscode,
        zoomPhone,
        status: status || 'scheduled',
        statusNote,
        comment
      }
    });

    console.log(`[DB] INSERT into docket_entries - created id: ${entry.id}`);

    // Emit WebSocket event for real-time updates
    io.emit('docket:update', {});

    res.status(201).json(entry);
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return res.status(409).json({ error: 'Duplicate entry: case number, date, and time combination already exists' });
    }
    console.error('Failed to create docket entry:', error);
    res.status(500).json({ error: 'Failed to create docket entry' });
  }
});

// GET /api/docket/:id - Get a single docket entry
app.get('/api/docket/:id', async (req: Request, res: Response) => {
  try {
    const entry = await prisma.docketEntry.findUnique({
      where: { id: req.params.id },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    if (!entry) {
      return res.status(404).json({ error: 'Docket entry not found' });
    }

    console.log(`[DB] SELECT from docket_entries WHERE id = ${req.params.id}`);
    res.json(entry);
  } catch (error) {
    console.error('Failed to fetch docket entry:', error);
    res.status(500).json({ error: 'Failed to fetch docket entry' });
  }
});

// PUT /api/docket/:id - Update a docket entry
app.put('/api/docket/:id', async (req: Request, res: Response) => {
  try {
    const updateData: Record<string, unknown> = {};
    const allowedFields = [
      'caseNumber', 'caseTitle', 'caseChapter', 'adversaryNumber', 'adversaryTitle',
      'hearingDate', 'hearingTime', 'hearingMatter', 'hearingJudge', 'courtroom',
      'movingParty', 'opposingParty', 'trustee', 'isZoom', 'zoomMeetingId',
      'zoomPasscode', 'zoomPhone', 'status', 'statusNote', 'comment'
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        if (field === 'hearingDate') {
          updateData[field] = new Date(req.body[field]);
        } else {
          updateData[field] = req.body[field];
        }
      }
    }

    const entry = await prisma.docketEntry.update({
      where: { id: req.params.id },
      data: updateData
    });

    console.log(`[DB] UPDATE docket_entries WHERE id = ${req.params.id}`);

    // Emit WebSocket event for real-time updates
    io.emit('docket:update', {});
    io.emit('docket:entry:update', { id: entry.id });

    res.json(entry);
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      return res.status(404).json({ error: 'Docket entry not found' });
    }
    console.error('Failed to update docket entry:', error);
    res.status(500).json({ error: 'Failed to update docket entry' });
  }
});

// DELETE /api/docket/:id - Delete a docket entry
app.delete('/api/docket/:id', async (req: Request, res: Response) => {
  try {
    await prisma.docketEntry.delete({
      where: { id: req.params.id }
    });

    console.log(`[DB] DELETE from docket_entries WHERE id = ${req.params.id}`);

    // Emit WebSocket event for real-time updates
    io.emit('docket:update', {});

    res.status(204).send();
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      return res.status(404).json({ error: 'Docket entry not found' });
    }
    console.error('Failed to delete docket entry:', error);
    res.status(500).json({ error: 'Failed to delete docket entry' });
  }
});

// =========================================
// Display-specific Endpoints
// =========================================

// GET /api/displays/:id/config - Get display configuration (requires API key)
app.get('/api/displays/:id/config', authenticateApiKey, async (req: ApiKeyRequest, res: Response) => {
  try {
    const display = await prisma.display.findUnique({
      where: { id: req.params.id }
    });

    if (!display) {
      return res.status(404).json({ error: 'Display not found' });
    }

    console.log(`[API] Display config fetched for: ${req.display?.name || req.params.id}`);

    res.json({
      id: display.id,
      name: display.name,
      location: display.location,
      showWeather: display.showWeather,
      weatherLocation: display.weatherLocation || display.location,
      noticeText: display.noticeText,
      tickerEnabled: display.tickerEnabled,
      tickerSpeed: display.tickerSpeed,
      showStricken: display.showStricken,
      showZoomInfo: display.showZoomInfo,
      highlightCurrent: display.highlightCurrent,
      theme: display.theme,
      columns: JSON.parse(display.columns)
    });
  } catch (error) {
    console.error('Failed to fetch display config:', error);
    res.status(500).json({ error: 'Failed to fetch display config' });
  }
});

// GET /api/displays/:id/docket - Get docket entries for a specific display (requires API key)
app.get('/api/displays/:id/docket', authenticateApiKey, async (req: ApiKeyRequest, res: Response) => {
  try {
    const display = await prisma.display.findUnique({
      where: { id: req.params.id }
    });

    if (!display) {
      return res.status(404).json({ error: 'Display not found' });
    }

    console.log(`[API] Display docket fetched for: ${req.display?.name || req.params.id}`);

    // Build filter based on display configuration
    const where: Record<string, unknown> = {};

    // Default to today's entries
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    where.hearingDate = {
      gte: today,
      lt: tomorrow
    };

    // Apply display filters
    if (display.judgeFilter) {
      where.hearingJudge = display.judgeFilter;
    }
    if (display.courtroomFilter) {
      where.courtroom = display.courtroomFilter;
    }
    if (display.chapterFilter) {
      const chapters = JSON.parse(display.chapterFilter);
      if (chapters.length > 0) {
        where.caseChapter = { in: chapters };
      }
    }

    // Optionally exclude stricken entries
    if (!display.showStricken) {
      where.status = { not: 'stricken' };
    }

    const entries = await prisma.docketEntry.findMany({
      where,
      orderBy: [
        { hearingTime: 'asc' },
        { caseTitle: 'asc' }
      ]
    });

    console.log(`[DB] SELECT from docket_entries for display ${req.params.id} - found ${entries.length} records`);
    res.json({ entries, total: entries.length });
  } catch (error) {
    console.error('Failed to fetch display docket:', error);
    res.status(500).json({ error: 'Failed to fetch display docket' });
  }
});

app.get('/api/announcements', async (req, res) => {
  try {
    const activeOnly = req.query.active === 'true';

    // Build where clause for filtering active announcements
    const announcements = await prisma.announcement.findMany({
      where: activeOnly
        ? {
            enabled: true,
            OR: [
              { expiresAt: null },
              { expiresAt: { gte: new Date() } }
            ]
          }
        : undefined,
      orderBy: [
        { priority: 'asc' },
        { createdAt: 'desc' }
      ],
    });

    console.log(`[DB] SELECT from announcements - found ${announcements.length} records`);
    res.json({ announcements, total: announcements.length });
  } catch (error) {
    console.error('Failed to fetch announcements:', error);
    res.status(500).json({ error: 'Failed to fetch announcements' });
  }
});

// Create announcement
app.post('/api/announcements', async (req, res) => {
  try {
    const { text, priority = 100, enabled = true, expiresAt } = req.body;

    if (!text || typeof text !== 'string' || text.length === 0) {
      return res.status(400).json({ error: 'Announcement text is required' });
    }

    if (text.length > 500) {
      return res.status(400).json({ error: 'Announcement text must be 500 characters or less' });
    }

    const announcement = await prisma.announcement.create({
      data: {
        text,
        priority: typeof priority === 'number' ? priority : 100,
        enabled: typeof enabled === 'boolean' ? enabled : true,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });

    console.log(`[DB] INSERT into announcements - created id: ${announcement.id}`);

    // Emit WebSocket event for real-time updates
    io.emit('announcement:new', { id: announcement.id });

    res.status(201).json(announcement);
  } catch (error) {
    console.error('Failed to create announcement:', error);
    res.status(500).json({ error: 'Failed to create announcement' });
  }
});

// Get single announcement
app.get('/api/announcements/:id', async (req, res) => {
  try {
    const announcement = await prisma.announcement.findUnique({
      where: { id: req.params.id },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    console.log(`[DB] SELECT from announcements WHERE id = ${req.params.id}`);
    res.json(announcement);
  } catch (error) {
    console.error('Failed to fetch announcement:', error);
    res.status(500).json({ error: 'Failed to fetch announcement' });
  }
});

// Update announcement
app.put('/api/announcements/:id', async (req, res) => {
  try {
    const { text, priority, enabled, expiresAt } = req.body;

    const updateData: Record<string, unknown> = {};
    if (text !== undefined) {
      if (typeof text !== 'string' || text.length === 0) {
        return res.status(400).json({ error: 'Announcement text must be a non-empty string' });
      }
      if (text.length > 500) {
        return res.status(400).json({ error: 'Announcement text must be 500 characters or less' });
      }
      updateData.text = text;
    }
    if (priority !== undefined) updateData.priority = priority;
    if (enabled !== undefined) updateData.enabled = enabled;
    if (expiresAt !== undefined) updateData.expiresAt = expiresAt ? new Date(expiresAt) : null;

    const announcement = await prisma.announcement.update({
      where: { id: req.params.id },
      data: updateData,
    });

    console.log(`[DB] UPDATE announcements WHERE id = ${req.params.id}`);

    // Emit WebSocket event for real-time updates
    io.emit('announcement:new', { id: announcement.id });

    res.json(announcement);
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      return res.status(404).json({ error: 'Announcement not found' });
    }
    console.error('Failed to update announcement:', error);
    res.status(500).json({ error: 'Failed to update announcement' });
  }
});

// Delete announcement
app.delete('/api/announcements/:id', async (req, res) => {
  try {
    await prisma.announcement.delete({
      where: { id: req.params.id },
    });

    console.log(`[DB] DELETE from announcements WHERE id = ${req.params.id}`);

    // Emit WebSocket event for real-time updates
    io.emit('announcement:remove', { id: req.params.id });

    res.status(204).send();
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      return res.status(404).json({ error: 'Announcement not found' });
    }
    console.error('Failed to delete announcement:', error);
    res.status(500).json({ error: 'Failed to delete announcement' });
  }
});

// GET /api/displays - List all displays
app.get('/api/displays', async (req: Request, res: Response) => {
  try {
    const displays = await prisma.display.findMany({
      orderBy: { name: 'asc' }
    });
    console.log(`[DB] SELECT from displays - found ${displays.length} records`);
    res.json({ displays, total: displays.length });
  } catch (error) {
    console.error('Failed to fetch displays:', error);
    res.status(500).json({ error: 'Failed to fetch displays' });
  }
});

// POST /api/displays - Create a new display
app.post('/api/displays', async (req: Request, res: Response) => {
  try {
    const {
      id,
      name,
      location,
      judgeFilter,
      courtroomFilter,
      chapterFilter,
      showStricken,
      showZoomInfo,
      highlightCurrent,
      theme,
      columns,
      showWeather,
      weatherLocation,
      noticeText,
      tickerEnabled,
      tickerSpeed
    } = req.body;

    if (!id || !name || !location) {
      return res.status(400).json({ error: 'Missing required fields: id, name, location' });
    }

    // Generate a simple API key hash (in production, use proper key generation)
    const apiKeyHash = require('crypto').randomBytes(32).toString('hex');

    const display = await prisma.display.create({
      data: {
        id,
        name,
        location,
        judgeFilter,
        courtroomFilter,
        chapterFilter: chapterFilter ? JSON.stringify(chapterFilter) : null,
        showStricken: showStricken ?? false,
        showZoomInfo: showZoomInfo ?? true,
        highlightCurrent: highlightCurrent ?? true,
        theme: theme || 'default',
        columns: columns ? JSON.stringify(columns) : '["NAME","CH","TIME","CASE","MATTER","ROOM"]',
        showWeather: showWeather ?? true,
        weatherLocation,
        noticeText: noticeText || 'Please turn your phones OFF in the Courthouse',
        tickerEnabled: tickerEnabled ?? true,
        tickerSpeed: tickerSpeed || 'medium',
        apiKeyHash
      }
    });

    console.log(`[DB] INSERT into displays - created id: ${display.id}`);
    res.status(201).json(display);
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return res.status(409).json({ error: 'Display with this ID already exists' });
    }
    console.error('Failed to create display:', error);
    res.status(500).json({ error: 'Failed to create display' });
  }
});

// =========================================
// User Management Endpoints (Admin Only)
// =========================================

// Middleware to check admin role
const requireAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// GET /api/users - List all users (admin only)
app.get('/api/users', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { name: 'asc' }
    });

    console.log(`[DB] SELECT from users - found ${users.length} records`);
    res.json({ users, total: users.length });
  } catch (error) {
    console.error('Failed to fetch users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// POST /api/users - Create a new user (admin only)
app.post('/api/users', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, password, name, role } = req.body;

    // Validate required fields
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Validate password length
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Validate role
    const validRoles = ['admin', 'editor', 'viewer'];
    const userRole = role || 'viewer';
    if (!validRoles.includes(userRole)) {
      return res.status(400).json({ error: 'Invalid role. Must be admin, editor, or viewer' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        name,
        role: userRole,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      }
    });

    console.log(`[DB] INSERT into users - created user: ${user.email}`);
    res.status(201).json(user);
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }
    console.error('Failed to create user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// GET /api/users/:id - Get a single user (admin only)
app.get('/api/users/:id', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`[DB] SELECT from users WHERE id = ${req.params.id}`);
    res.json(user);
  } catch (error) {
    console.error('Failed to fetch user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// PUT /api/users/:id - Update a user (admin only)
app.put('/api/users/:id', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, password, name, role, isActive } = req.body;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: req.params.id }
    });

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (email !== undefined) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }
      updateData.email = email.toLowerCase();
    }

    if (password !== undefined) {
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      updateData.passwordHash = await bcrypt.hash(password, 10);
    }

    if (name !== undefined) updateData.name = name;

    if (role !== undefined) {
      const validRoles = ['admin', 'editor', 'viewer'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role. Must be admin, editor, or viewer' });
      }
      updateData.role = role;
    }

    if (isActive !== undefined) updateData.isActive = isActive;

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    console.log(`[DB] UPDATE users WHERE id = ${req.params.id}`);
    res.json(user);
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }
    console.error('Failed to update user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// DELETE /api/users/:id - Deactivate a user (admin only)
app.delete('/api/users/:id', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: req.params.id }
    });

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent deleting yourself
    if (req.user?.userId === req.params.id) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    // Soft delete by setting isActive to false
    await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: false }
    });

    console.log(`[DB] UPDATE users SET isActive=false WHERE id = ${req.params.id}`);
    res.status(204).send();
  } catch (error) {
    console.error('Failed to deactivate user:', error);
    res.status(500).json({ error: 'Failed to deactivate user' });
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });

  // Display heartbeat
  socket.on('display:heartbeat', (data) => {
    console.log(`Heartbeat from display: ${data.displayId}`);
  });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

// Start server
httpServer.listen(PORT, () => {
  console.log('============================================');
  console.log('  Courthouse Digital Signage - Backend API');
  console.log('============================================');
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log('============================================');
});

export { app, io, prisma };
