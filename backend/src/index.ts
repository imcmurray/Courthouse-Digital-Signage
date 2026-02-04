import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import crypto from 'crypto';
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
const CORS_ORIGIN = process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176', 'http://localhost:8080'];

// Socket.io setup
const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (CORS_ORIGIN.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    console.log(`CORS rejected origin: ${origin}, allowed: ${CORS_ORIGIN.join(', ')}`);
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  credentials: true
}));
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

    // Verify the API key matches using bcrypt
    const isValidKey = await bcrypt.compare(apiKey, display.apiKeyHash);
    if (!isValidKey) {
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
app.get('/api/docket', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
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
app.post('/api/docket', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
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

    // Create audit log for the action
    await createAuditLog('create', 'docket_entry', entry.id, req.user?.userId || null, {
      caseNumber,
      caseTitle,
      hearingDate,
      hearingTime
    });

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

// POST /api/docket/bulk - Bulk create docket entries (CSV import)
app.post('/api/docket/bulk', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { entries } = req.body;

    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'Entries array is required and must not be empty' });
    }

    if (entries.length > 500) {
      return res.status(400).json({ error: 'Maximum 500 entries per import' });
    }

    // Validate all entries have required fields
    const requiredFields = ['caseNumber', 'caseTitle', 'caseChapter', 'hearingDate', 'hearingTime', 'hearingMatter', 'hearingJudge'];
    const validationErrors: string[] = [];

    entries.forEach((entry, index) => {
      const missingFields = requiredFields.filter(field => !entry[field]);
      if (missingFields.length > 0) {
        validationErrors.push(`Entry ${index + 1}: Missing required fields: ${missingFields.join(', ')}`);
      }
    });

    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validationErrors.slice(0, 10) // Return first 10 errors
      });
    }

    // Create all entries in a transaction
    const createdEntries = await prisma.$transaction(
      entries.map(entry =>
        prisma.docketEntry.create({
          data: {
            caseNumber: entry.caseNumber,
            caseTitle: entry.caseTitle,
            caseChapter: entry.caseChapter,
            adversaryNumber: entry.adversaryNumber || null,
            adversaryTitle: entry.adversaryTitle || null,
            hearingDate: new Date(entry.hearingDate),
            hearingTime: entry.hearingTime,
            hearingMatter: entry.hearingMatter,
            hearingJudge: entry.hearingJudge,
            courtroom: entry.courtroom || null,
            movingParty: entry.movingParty || null,
            opposingParty: entry.opposingParty || null,
            trustee: entry.trustee || null,
            isZoom: entry.isZoom === true || entry.isZoom === 'true',
            zoomMeetingId: entry.zoomMeetingId || null,
            zoomPasscode: entry.zoomPasscode || null,
            zoomPhone: entry.zoomPhone || null,
            status: entry.status || 'scheduled',
            statusNote: entry.statusNote || null,
            comment: entry.comment || null
          }
        })
      )
    );

    console.log(`[DB] BULK INSERT into docket_entries - created ${createdEntries.length} records`);

    // Emit WebSocket event for real-time updates
    io.emit('docket:update', {});

    res.status(201).json({
      message: `Successfully imported ${createdEntries.length} entries`,
      count: createdEntries.length,
      entries: createdEntries
    });
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return res.status(409).json({ error: 'Duplicate entry found. Check case numbers, dates, and times.' });
    }
    console.error('Failed to bulk import docket entries:', error);
    res.status(500).json({ error: 'Failed to bulk import docket entries' });
  }
});

// GET /api/docket/template - Download CSV template
app.get('/api/docket/template', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const csvHeader = 'caseNumber,caseTitle,caseChapter,hearingDate,hearingTime,hearingMatter,hearingJudge,courtroom,isZoom,zoomMeetingId,zoomPasscode,zoomPhone,status,adversaryNumber,adversaryTitle,movingParty,opposingParty,trustee,statusNote,comment';
  const sampleRow = '26-12345,Smith John and Jane,7,2026-02-04,09:00,341 Meeting of Creditors,Judge Anderson,321,false,,,,,scheduled,,,,,,';
  const csvContent = `${csvHeader}\n${sampleRow}`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="docket-template.csv"');
  res.send(csvContent);
});

// GET /api/docket/:id - Get a single docket entry
app.get('/api/docket/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
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
app.put('/api/docket/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
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

    // Create audit log for the update
    await createAuditLog('update', 'docket_entry', entry.id, req.user?.userId || null, updateData);

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

// DELETE /api/docket/clear - Clear docket entries by date with optional archive
// IMPORTANT: This route must come BEFORE /api/docket/:id to avoid matching "clear" as an id
app.delete('/api/docket/clear', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { date, courtroom, archive } = req.body;

    if (!date) {
      return res.status(400).json({ error: 'Date is required to clear docket entries' });
    }

    // Parse the date
    const filterDate = new Date(date);
    filterDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(filterDate);
    nextDay.setDate(nextDay.getDate() + 1);

    // Build where clause
    const where: Record<string, unknown> = {
      hearingDate: {
        gte: filterDate,
        lt: nextDay
      }
    };

    if (courtroom) {
      where.courtroom = courtroom;
    }

    // Count entries to be cleared
    const count = await prisma.docketEntry.count({ where });

    if (count === 0) {
      return res.status(404).json({
        error: 'No docket entries found for the specified date',
        count: 0
      });
    }

    // If archive option is set, mark entries as archived by setting status to 'archived'
    // For now, we don't have an archived_docket_entries table, so archive just sets status
    if (archive) {
      await prisma.docketEntry.updateMany({
        where,
        data: { status: 'archived' as unknown as string }
      });
      console.log(`[DB] Archived ${count} docket entries for date ${date}`);
    } else {
      // Delete the entries
      await prisma.docketEntry.deleteMany({ where });
      console.log(`[DB] Deleted ${count} docket entries for date ${date}`);
    }

    // Emit WebSocket event for real-time updates
    io.emit('docket:update', {});

    res.json({
      message: archive ? `Archived ${count} docket entries` : `Deleted ${count} docket entries`,
      count,
      archived: archive || false
    });
  } catch (error) {
    console.error('Failed to clear docket entries:', error);
    res.status(500).json({ error: 'Failed to clear docket entries' });
  }
});

// DELETE /api/docket/:id - Delete a docket entry
app.delete('/api/docket/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Get entry info before deletion for audit log
    const entry = await prisma.docketEntry.findUnique({
      where: { id: req.params.id }
    });

    if (!entry) {
      return res.status(404).json({ error: 'Docket entry not found' });
    }

    await prisma.docketEntry.delete({
      where: { id: req.params.id }
    });

    console.log(`[DB] DELETE from docket_entries WHERE id = ${req.params.id}`);

    // Create audit log for the deletion
    await createAuditLog('delete', 'docket_entry', req.params.id, req.user?.userId || null, {
      caseNumber: entry.caseNumber,
      caseTitle: entry.caseTitle
    });

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

    // Generate API key and hash it with bcrypt
    const apiKey = crypto.randomBytes(32).toString('hex');
    const apiKeyHash = await bcrypt.hash(apiKey, 10);

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

    // Return display info along with the plain API key (only returned on creation!)
    res.status(201).json({
      ...display,
      apiKey: apiKey,  // Return plain key only on creation
      apiKeyHash: undefined  // Don't expose the hash
    });
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return res.status(409).json({ error: 'Display with this ID already exists' });
    }
    console.error('Failed to create display:', error);
    res.status(500).json({ error: 'Failed to create display' });
  }
});

// PUT /api/displays/:id - Update a display
app.put('/api/displays/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
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

    // Check if display exists
    const existingDisplay = await prisma.display.findUnique({
      where: { id }
    });

    if (!existingDisplay) {
      return res.status(404).json({ error: 'Display not found' });
    }

    const display = await prisma.display.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(location !== undefined && { location }),
        ...(judgeFilter !== undefined && { judgeFilter: judgeFilter || null }),
        ...(courtroomFilter !== undefined && { courtroomFilter: courtroomFilter || null }),
        ...(chapterFilter !== undefined && { chapterFilter: chapterFilter ? JSON.stringify(chapterFilter) : null }),
        ...(showStricken !== undefined && { showStricken }),
        ...(showZoomInfo !== undefined && { showZoomInfo }),
        ...(highlightCurrent !== undefined && { highlightCurrent }),
        ...(theme !== undefined && { theme }),
        ...(columns !== undefined && { columns: Array.isArray(columns) ? JSON.stringify(columns) : columns }),
        ...(showWeather !== undefined && { showWeather }),
        ...(weatherLocation !== undefined && { weatherLocation: weatherLocation || null }),
        ...(noticeText !== undefined && { noticeText }),
        ...(tickerEnabled !== undefined && { tickerEnabled }),
        ...(tickerSpeed !== undefined && { tickerSpeed })
      }
    });

    console.log(`[DB] UPDATE displays SET ... WHERE id = '${id}'`);

    res.json(display);
  } catch (error) {
    console.error('Failed to update display:', error);
    res.status(500).json({ error: 'Failed to update display' });
  }
});

// DELETE /api/displays/:id - Delete a display
app.delete('/api/displays/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if display exists
    const existingDisplay = await prisma.display.findUnique({
      where: { id }
    });

    if (!existingDisplay) {
      return res.status(404).json({ error: 'Display not found' });
    }

    await prisma.display.delete({
      where: { id }
    });

    console.log(`[DB] DELETE FROM displays WHERE id = '${id}'`);

    res.json({ success: true, message: 'Display deleted successfully' });
  } catch (error) {
    console.error('Failed to delete display:', error);
    res.status(500).json({ error: 'Failed to delete display' });
  }
});

// POST /api/displays/:id/regenerate-key - Regenerate API key for a display
app.post('/api/displays/:id/regenerate-key', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Check if display exists
    const existingDisplay = await prisma.display.findUnique({
      where: { id }
    });

    if (!existingDisplay) {
      return res.status(404).json({ error: 'Display not found' });
    }

    // Generate new API key and hash it with bcrypt
    const newApiKey = crypto.randomBytes(32).toString('hex');
    const newApiKeyHash = await bcrypt.hash(newApiKey, 10);

    // Update display with new API key hash
    await prisma.display.update({
      where: { id },
      data: {
        apiKeyHash: newApiKeyHash
      }
    });

    console.log(`[DB] Regenerated API key for display '${id}'`);

    // Return the new API key (only time it will be visible)
    res.json({
      success: true,
      message: 'API key regenerated successfully',
      apiKey: newApiKey,
      displayId: id
    });
  } catch (error) {
    console.error('Failed to regenerate API key:', error);
    res.status(500).json({ error: 'Failed to regenerate API key' });
  }
});

// =========================================
// User Management Endpoints (Admin Only)
// =========================================

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

// =========================================
// API Key Management Endpoints (Admin Only)
// =========================================

// GET /api/api-keys - List all API keys (admin only)
app.get('/api/api-keys', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const apiKeys = await prisma.apiKey.findMany({
      include: {
        display: {
          select: { id: true, name: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Never return the key hash, only the prefix for identification
    const sanitizedKeys = apiKeys.map(key => ({
      id: key.id,
      name: key.name,
      keyPrefix: key.keyPrefix,
      permissions: JSON.parse(key.permissions),
      displayId: key.displayId,
      display: key.display,
      expiresAt: key.expiresAt,
      lastUsedAt: key.lastUsedAt,
      createdAt: key.createdAt
    }));

    console.log(`[DB] SELECT from api_keys - found ${apiKeys.length} records`);
    res.json({ apiKeys: sanitizedKeys, total: apiKeys.length });
  } catch (error) {
    console.error('Failed to fetch API keys:', error);
    res.status(500).json({ error: 'Failed to fetch API keys' });
  }
});

// POST /api/api-keys - Create a new API key (admin only)
app.post('/api/api-keys', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, permissions, displayId, expiresAt } = req.body;

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Validate permissions
    const validPermissions = ['read', 'write', 'admin'];
    let permissionsArray = permissions || ['read'];
    if (!Array.isArray(permissionsArray)) {
      permissionsArray = [permissionsArray];
    }
    for (const perm of permissionsArray) {
      if (!validPermissions.includes(perm)) {
        return res.status(400).json({ error: `Invalid permission: ${perm}. Valid permissions are: ${validPermissions.join(', ')}` });
      }
    }

    // If displayId provided, verify display exists
    if (displayId) {
      const display = await prisma.display.findUnique({
        where: { id: displayId }
      });
      if (!display) {
        return res.status(400).json({ error: 'Display not found' });
      }
    }

    // Generate API key
    const apiKey = crypto.randomBytes(32).toString('hex');
    const keyPrefix = apiKey.substring(0, 8);
    const keyHash = await bcrypt.hash(apiKey, 10);

    // Create API key record
    const newApiKey = await prisma.apiKey.create({
      data: {
        name: name.trim(),
        keyHash,
        keyPrefix,
        permissions: JSON.stringify(permissionsArray),
        displayId: displayId || null,
        expiresAt: expiresAt ? new Date(expiresAt) : null
      },
      include: {
        display: {
          select: { id: true, name: true }
        }
      }
    });

    console.log(`[DB] INSERT into api_keys - created id: ${newApiKey.id}`);

    // Return the key details along with the plain API key (only shown once!)
    res.status(201).json({
      id: newApiKey.id,
      name: newApiKey.name,
      keyPrefix: newApiKey.keyPrefix,
      permissions: permissionsArray,
      displayId: newApiKey.displayId,
      display: newApiKey.display,
      expiresAt: newApiKey.expiresAt,
      createdAt: newApiKey.createdAt,
      apiKey: apiKey // Only returned on creation!
    });
  } catch (error) {
    console.error('Failed to create API key:', error);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

// GET /api/api-keys/:id - Get a single API key (admin only)
app.get('/api/api-keys/:id', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const apiKey = await prisma.apiKey.findUnique({
      where: { id: req.params.id },
      include: {
        display: {
          select: { id: true, name: true }
        }
      }
    });

    if (!apiKey) {
      return res.status(404).json({ error: 'API key not found' });
    }

    console.log(`[DB] SELECT from api_keys WHERE id = ${req.params.id}`);
    res.json({
      id: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      permissions: JSON.parse(apiKey.permissions),
      displayId: apiKey.displayId,
      display: apiKey.display,
      expiresAt: apiKey.expiresAt,
      lastUsedAt: apiKey.lastUsedAt,
      createdAt: apiKey.createdAt
    });
  } catch (error) {
    console.error('Failed to fetch API key:', error);
    res.status(500).json({ error: 'Failed to fetch API key' });
  }
});

// DELETE /api/api-keys/:id - Revoke/delete an API key (admin only)
app.delete('/api/api-keys/:id', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Check if API key exists
    const existingKey = await prisma.apiKey.findUnique({
      where: { id: req.params.id }
    });

    if (!existingKey) {
      return res.status(404).json({ error: 'API key not found' });
    }

    await prisma.apiKey.delete({
      where: { id: req.params.id }
    });

    console.log(`[DB] DELETE from api_keys WHERE id = ${req.params.id}`);
    res.json({ success: true, message: 'API key revoked successfully' });
  } catch (error) {
    console.error('Failed to revoke API key:', error);
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

// =========================================
// Audit Log Utility Function
// =========================================
async function createAuditLog(
  action: string,
  entityType: string,
  entityId: string | null,
  userId: string | null,
  changes: Record<string, unknown> | null = null,
  ipAddress: string | null = null
) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        entityType,
        entityId,
        userId,
        changes: changes ? JSON.stringify(changes) : null,
        ipAddress
      }
    });
    console.log(`[AUDIT] ${action} ${entityType}${entityId ? ` (${entityId})` : ''} by user ${userId || 'unknown'}`);
  } catch (error) {
    console.error('Failed to create audit log:', error);
  }
}

// =========================================
// Audit Log Endpoints (Admin Only)
// =========================================

// GET /api/audit-logs - List audit logs with optional filters
app.get('/api/audit-logs', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { action, entityType, userId, startDate, endDate, limit = '100', offset = '0' } = req.query;

    // Build filter conditions
    const where: Record<string, unknown> = {};

    if (action) where.action = action;
    if (entityType) where.entityType = entityType;
    if (userId) where.userId = userId;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        (where.createdAt as Record<string, unknown>).gte = new Date(startDate as string);
      }
      if (endDate) {
        (where.createdAt as Record<string, unknown>).lte = new Date(endDate as string);
      }
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: { id: true, name: true, email: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(parseInt(limit as string, 10), 500),
        skip: parseInt(offset as string, 10)
      }),
      prisma.auditLog.count({ where })
    ]);

    console.log(`[DB] SELECT from audit_logs - found ${logs.length} records`);
    res.json({ logs, total });
  } catch (error) {
    console.error('Failed to fetch audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
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
