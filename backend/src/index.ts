import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import * as calendarImportService from './services/calendarImportService';

const app = express();
const httpServer = createServer(app);
const prisma = new PrismaClient();

// JWT configuration
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required. Set it before starting the server.');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '30m'; // 30 minutes session timeout
const JWT_REFRESH_EXPIRES_IN = '7d'; // 7 days for refresh token

// Interface for JWT payload
interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

// Route params type — Express 5 types params as string | string[], narrow to string for our routes
interface RouteParams { [key: string]: string }

// Extend Express Request type
interface AuthenticatedRequest extends Request<RouteParams> {
  user?: JwtPayload;
}

// Environment variables
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176', 'http://localhost:5177', 'http://localhost:5178', 'http://localhost:5179', 'http://localhost:5180', 'http://localhost:5181', 'http://localhost:5182', 'http://localhost:5183', 'http://localhost:5184', 'http://localhost:5185', 'http://localhost:8080', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174', 'http://127.0.0.1:5175', 'http://127.0.0.1:5176', 'http://127.0.0.1:5177', 'http://127.0.0.1:5178', 'http://127.0.0.1:5179', 'http://127.0.0.1:5180', 'http://127.0.0.1:8080'];

// Preview token store (in-memory, ephemeral)
interface PreviewTokenEntry {
  displayId: string;
  expiresAt: number;
}
const previewTokens = new Map<string, PreviewTokenEntry>();
const PREVIEW_TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Clean up expired preview tokens every 60 seconds
const previewTokenCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of previewTokens) {
    if (entry.expiresAt <= now) {
      previewTokens.delete(token);
    }
  }
}, 60_000);
previewTokenCleanupInterval.unref();

// Uploads directory setup
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with original extension
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `court-logo-${Date.now()}${ext}`;
    cb(null, filename);
  }
});

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Accept only PNG files (SVG disallowed due to script injection risk)
  if (file.mimetype === 'image/png') {
    cb(null, true);
  } else {
    cb(new Error('Only PNG files are allowed'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  }
});

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
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());

// =========================================
// Rate Limiting Configuration
// =========================================

// General API rate limiter - 1000 requests per minute for admin portal
const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 1000, // 1000 requests per minute
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    error: 'Too many requests, please try again later.',
    retryAfter: 60
  },
  keyGenerator: (req) => {
    // Use IP address for rate limiting
    return req.ip || req.socket.remoteAddress || 'unknown';
  }
});

// Strict rate limiter for display clients - 60 requests per minute
const displayLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests from this display, please try again later.',
    retryAfter: 60
  },
  keyGenerator: (req) => {
    // Use API key or IP for display rate limiting
    const apiKey = req.headers['x-api-key'] as string;
    return apiKey || req.ip || req.socket.remoteAddress || 'unknown';
  }
});

// API key rate limiter - 300 requests per minute
const apiKeyLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300, // 300 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'API key rate limit exceeded, please try again later.',
    retryAfter: 60
  },
  keyGenerator: (req) => {
    const apiKey = req.headers['x-api-key'] as string;
    return apiKey || req.ip || req.socket.remoteAddress || 'unknown';
  }
});

// Apply general rate limiter to all API routes
app.use('/api', generalLimiter);

// Serve display client static files
app.use('/display', express.static(path.join(__dirname, '../../display')));

// Swagger UI - interactive API documentation
const openapiSpec = YAML.parse(
  fs.readFileSync(path.join(__dirname, 'openapi.yaml'), 'utf8')
);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiSpec, {
  customSiteTitle: 'Courthouse Signage API',
}));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// =========================================
// Authentication Middleware
// =========================================
const authenticateToken = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload & { type?: string };

    // Reject refresh tokens used as access tokens
    if (decoded.type === 'refresh') {
      return res.status(403).json({ error: 'Refresh tokens cannot be used for API access' });
    }

    // Check if user still exists and is active in database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, isActive: true }
    });

    if (!user) {
      return res.status(403).json({ error: 'User not found' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'User account has been deactivated' });
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Interface for API key authenticated request
interface ApiKeyRequest extends Request<RouteParams> {
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

    // Check preview tokens first (O(1) Map lookup, no bcrypt)
    const previewEntry = previewTokens.get(apiKey);
    if (previewEntry && previewEntry.displayId === displayId && previewEntry.expiresAt > Date.now()) {
      const display = await prisma.display.findUnique({ where: { id: displayId } });
      if (!display) {
        return res.status(404).json({ error: 'Display not found' });
      }
      req.display = { id: display.id, name: display.name };
      // Do NOT update lastHeartbeat/status for preview sessions
      return next();
    }

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

// Middleware to check editor or admin role
const requireEditor = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.user.role !== 'admin' && req.user.role !== 'editor') {
    return res.status(403).json({ error: 'Editor or admin access required' });
  }
  next();
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

// Interface for standalone API key authenticated request
interface StandaloneApiKeyRequest extends Request {
  apiKeyInfo?: {
    id: string;
    name: string;
    permissions: string[];
  };
}

// Middleware to authenticate standalone API keys (from api_keys table)
const authenticateStandaloneApiKey = async (req: StandaloneApiKeyRequest, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    return res.status(401).json({ error: 'API key required. Use X-API-Key header.' });
  }

  try {
    // Find all API keys and compare with bcrypt
    const apiKeys = await prisma.apiKey.findMany();

    for (const key of apiKeys) {
      // Check if key is expired
      if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
        continue; // Skip expired keys
      }

      const isValidKey = await bcrypt.compare(apiKey, key.keyHash);
      if (isValidKey) {
        // Update lastUsedAt
        await prisma.apiKey.update({
          where: { id: key.id },
          data: { lastUsedAt: new Date() }
        });

        // Attach API key info to request
        req.apiKeyInfo = {
          id: key.id,
          name: key.name,
          permissions: JSON.parse(key.permissions)
        };

        return next();
      }
    }

    // No matching key found
    return res.status(401).json({ error: 'Invalid API key' });
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

    // Set refresh token as HttpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/api/auth',
    });

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
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/logout - Logout
app.post('/api/auth/logout', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  console.log(`[AUTH] User logged out: ${req.user?.email}`);
  // Clear the refresh token cookie
  res.clearCookie('refreshToken', { path: '/api/auth' });
  res.json({ message: 'Logged out successfully' });
});

// POST /api/auth/refresh - Refresh JWT token
app.post('/api/auth/refresh', async (req: Request, res: Response) => {
  try {
    // Read refresh token from HttpOnly cookie (fallback to body for backward compat)
    const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;

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
app.get('/api/schema-check', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
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
// Dashboard Stats Endpoint
// =========================================

// GET /api/stats - Get dashboard statistics
app.get('/api/stats', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Get today's date range in UTC (hearing dates are stored as UTC midnight)
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0));
    const todayEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999));

    // Count today's hearings
    const todaysHearings = await prisma.docketEntry.count({
      where: {
        hearingDate: {
          gte: todayStart,
          lte: todayEnd,
        },
      },
    });

    // Count active displays (those that have sent a heartbeat in the last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const activeDisplays = await prisma.display.count({
      where: {
        lastHeartbeat: {
          gte: fiveMinutesAgo,
        },
      },
    });

    // Count total displays for comparison
    const totalDisplays = await prisma.display.count();

    // Count active announcements (enabled and not expired)
    const activeAnnouncements = await prisma.announcement.count({
      where: {
        enabled: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gte: now } },
        ],
      },
    });

    // Count active users
    const activeUsers = await prisma.user.count({
      where: {
        isActive: true,
      },
    });

    res.json({
      todaysHearings,
      activeDisplays,
      totalDisplays,
      activeAnnouncements,
      activeUsers,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/recent-activity - Get recent activity for dashboard
app.get('/api/recent-activity', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;

    const recentActivity = await prisma.auditLog.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { name: true, email: true }
        }
      }
    });

    // Format activity for frontend
    const formattedActivity = recentActivity.map(log => ({
      id: log.id,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      user: log.user ? log.user.name : 'System',
      timestamp: log.createdAt,
      changes: log.changes ? JSON.parse(log.changes) : null
    }));

    res.json(formattedActivity);
  } catch (error) {
    console.error('Error fetching recent activity:', error);
    res.status(500).json({ error: 'Failed to fetch recent activity' });
  }
});

// =========================================
// Docket Endpoints
// =========================================

// GET /api/docket - List docket entries with optional filters and pagination
app.get('/api/docket', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { date, courtroom, status, judge, chapter, search, limit = '10', page = '1', sortBy, sortOrder, hidePast } = req.query;

    // Parse pagination params
    const pageSize = Math.min(parseInt(limit as string, 10) || 10, 500);
    const currentPage = Math.max(parseInt(page as string, 10) || 1, 1);
    const offset = (currentPage - 1) * pageSize;

    // Build filter conditions
    const where: Record<string, unknown> = {};

    // Filter by date (hearing dates are stored as UTC midnight)
    if (date) {
      const [year, month, day] = (date as string).split('-').map(Number);
      const filterDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
      const nextDay = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0));
      where.hearingDate = {
        gte: filterDate,
        lt: nextDay
      };
    }

    if (courtroom) where.courtroom = courtroom;
    if (status) where.status = status;
    if (judge) where.hearingJudge = judge;
    if (chapter) where.caseChapter = chapter;

    // Text search across case number, case title, and hearing matter
    // Note: SQLite's LIKE is case-insensitive for ASCII by default
    if (search && typeof search === 'string' && search.trim()) {
      const searchTerm = search.trim();
      where.OR = [
        { caseNumber: { contains: searchTerm } },
        { caseTitle: { contains: searchTerm } },
        { hearingMatter: { contains: searchTerm } },
        { hearingJudge: { contains: searchTerm } }
      ];
    }

    // Hide entries whose hearing date+time have passed
    if (hidePast === 'true') {
      const now = new Date();
      const todayMidnight = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
      const tomorrowMidnight = new Date(todayMidnight);
      tomorrowMidnight.setUTCDate(tomorrowMidnight.getUTCDate() + 1);
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      // Wrap existing conditions + "not expired" in an AND
      const existing = { ...where };
      for (const k of Object.keys(where)) delete (where as Record<string, unknown>)[k];
      where.AND = [
        existing,
        {
          OR: [
            { hearingDate: { gte: tomorrowMidnight } },
            {
              AND: [
                { hearingDate: { gte: todayMidnight, lt: tomorrowMidnight } },
                { hearingTime: { gte: currentTime } }
              ]
            }
          ]
        }
      ];
    }

    // Get total count for pagination
    const total = await prisma.docketEntry.count({ where });

    // Build orderBy clause - support dynamic sorting
    const validSortFields = ['hearingTime', 'hearingDate', 'caseNumber', 'caseTitle', 'status', 'courtroom', 'hearingJudge', 'caseChapter', 'hearingMatter'];
    const validSortOrders = ['asc', 'desc'];

    let orderBy: Record<string, string>[] = [
      { hearingDate: 'asc' },
      { hearingTime: 'asc' },
      { caseTitle: 'asc' }
    ];

    if (sortBy && typeof sortBy === 'string' && validSortFields.includes(sortBy)) {
      const order = (sortOrder && typeof sortOrder === 'string' && validSortOrders.includes(sortOrder))
        ? sortOrder
        : 'asc';
      if (sortBy === 'hearingTime') {
        orderBy = [{ hearingDate: order }, { hearingTime: order }];
      } else {
        orderBy = [{ [sortBy]: order }];
      }
    }

    // Get paginated entries
    const entries = await prisma.docketEntry.findMany({
      where,
      orderBy,
      take: pageSize,
      skip: offset
    });

    const totalPages = Math.ceil(total / pageSize);

    console.log(`[DB] SELECT from docket_entries - found ${entries.length} of ${total} records (page ${currentPage}/${totalPages})`);
    res.json({
      entries,
      total,
      page: currentPage,
      limit: pageSize,
      totalPages
    });
  } catch (error) {
    console.error('Failed to fetch docket entries:', error);
    res.status(500).json({ error: 'Failed to fetch docket entries' });
  }
});

// POST /api/docket - Create a single docket entry
app.post('/api/docket', authenticateToken, requireEditor, async (req: AuthenticatedRequest, res: Response) => {
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
      comment,
      displayIds
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

    // Create display-docket associations if displayIds provided
    if (displayIds && Array.isArray(displayIds) && displayIds.length > 0) {
      // Create display-docket associations one by one to handle potential duplicates
      for (const displayId of displayIds) {
        try {
          await prisma.displayDocketEntry.create({
            data: {
              displayId: displayId as string,
              docketEntryId: entry.id
            }
          });
        } catch (err) {
          // Ignore duplicate key errors
          console.log(`[DB] Skipping duplicate display-docket association: ${displayId} -> ${entry.id}`);
        }
      }
      console.log(`[DB] Created display-docket associations for entry ${entry.id}`);
    }

    // Create audit log for the action
    await createAuditLog('create', 'docket_entry', entry.id, req.user?.userId || null, {
      caseNumber,
      caseTitle,
      hearingDate,
      hearingTime,
      displayIds
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
app.post('/api/docket/bulk', authenticateToken, requireEditor, async (req: AuthenticatedRequest, res: Response) => {
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

// GET /api/docket/judges - Get distinct judge names for autocomplete
app.get('/api/docket/judges', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const results: { hearing_judge: string }[] = await prisma.$queryRaw`
      SELECT DISTINCT hearing_judge FROM docket_entries ORDER BY hearing_judge ASC
    `;
    const judges = results.map(r => r.hearing_judge);
    res.json({ judges });
  } catch (error) {
    console.error('Failed to fetch judges:', error);
    res.status(500).json({ error: 'Failed to fetch judges' });
  }
});

// GET /api/docket/courtrooms - Get distinct courtroom values for autocomplete
app.get('/api/docket/courtrooms', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const results: { courtroom: string }[] = await prisma.$queryRaw`
      SELECT DISTINCT courtroom FROM docket_entries WHERE courtroom IS NOT NULL AND courtroom != '' ORDER BY courtroom ASC
    `;
    const courtrooms = results.map(r => r.courtroom);
    res.json({ courtrooms });
  } catch (error) {
    console.error('Failed to fetch courtrooms:', error);
    res.status(500).json({ error: 'Failed to fetch courtrooms' });
  }
});

// GET /api/docket/trustees - Get distinct trustee values for autocomplete
app.get('/api/docket/trustees', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const results: { trustee: string }[] = await prisma.$queryRaw`
      SELECT DISTINCT trustee FROM docket_entries WHERE trustee IS NOT NULL AND trustee != '' ORDER BY trustee ASC
    `;
    const trustees = results.map(r => r.trustee);
    res.json({ trustees });
  } catch (error) {
    console.error('Failed to fetch trustees:', error);
    res.status(500).json({ error: 'Failed to fetch trustees' });
  }
});

// GET /api/docket/dates - Get distinct hearing dates for calendar highlights
app.get('/api/docket/dates', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const results: { hearing_date: string }[] = await prisma.$queryRaw`
      SELECT DISTINCT DATE(hearing_date / 1000, 'unixepoch') as hearing_date
      FROM docket_entries WHERE hearing_date IS NOT NULL ORDER BY hearing_date ASC
    `;
    const dates = results.map(r => r.hearing_date);
    res.json({ dates });
  } catch (error) {
    console.error('Failed to fetch hearing dates:', error);
    res.status(500).json({ error: 'Failed to fetch hearing dates' });
  }
});

// GET /api/docket/judge-zoom - Get Zoom defaults from a judge's most recent Zoom hearing
app.get('/api/docket/judge-zoom', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const judge = req.query.judge as string;

    if (!judge || typeof judge !== 'string' || judge.trim().length === 0) {
      return res.status(400).json({ error: 'Judge name is required' });
    }

    const entry = await prisma.docketEntry.findFirst({
      where: {
        hearingJudge: judge.trim(),
        isZoom: true,
        zoomMeetingId: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        zoomMeetingId: true,
        zoomPasscode: true,
        zoomPhone: true,
      },
    });

    if (!entry) {
      return res.json({ defaults: null });
    }

    res.json({
      defaults: {
        zoomMeetingId: entry.zoomMeetingId,
        zoomPasscode: entry.zoomPasscode,
        zoomPhone: entry.zoomPhone,
      },
    });
  } catch (error) {
    console.error('Failed to fetch judge zoom defaults:', error);
    res.status(500).json({ error: 'Failed to fetch judge zoom defaults' });
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
app.put('/api/docket/:id', authenticateToken, requireEditor, async (req: AuthenticatedRequest, res: Response) => {
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

    // Optimistic concurrency control: check updatedAt if provided
    const expectedUpdatedAt = req.body.updatedAt;
    if (expectedUpdatedAt) {
      const existingEntry = await prisma.docketEntry.findUnique({
        where: { id: req.params.id },
        select: { updatedAt: true, caseTitle: true, hearingTime: true }
      });

      if (!existingEntry) {
        return res.status(404).json({ error: 'Docket entry not found' });
      }

      // Compare timestamps - convert to ISO strings for reliable comparison
      const existingTimestamp = existingEntry.updatedAt.toISOString();
      const expectedTimestamp = new Date(expectedUpdatedAt).toISOString();

      if (existingTimestamp !== expectedTimestamp) {
        console.log(`[CONFLICT] Docket entry ${req.params.id} was modified by another user`);
        console.log(`  Expected: ${expectedTimestamp}, Actual: ${existingTimestamp}`);
        return res.status(409).json({
          error: 'Conflict: This entry was modified by another user',
          code: 'CONFLICT',
          currentUpdatedAt: existingEntry.updatedAt,
          message: 'This entry has been modified since you started editing. Please refresh and try again.'
        });
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

    // Parse the date (hearing dates are stored as UTC midnight)
    const [year, month, day] = date.split('-').map(Number);
    const filterDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    const nextDay = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0));

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
app.delete('/api/docket/:id', authenticateToken, requireEditor, async (req: AuthenticatedRequest, res: Response) => {
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
app.get('/api/displays/:id/config', displayLimiter, authenticateApiKey, async (req: ApiKeyRequest, res: Response) => {
  try {
    const display = await prisma.display.findUnique({
      where: { id: req.params.id }
    });

    if (!display) {
      return res.status(404).json({ error: 'Display not found' });
    }

    // Fetch global settings for court name, subtitle, and logo
    const settings = await prisma.setting.findMany({
      where: {
        key: { in: ['court_name', 'court_subtitle', 'courthouse_name', 'chief_judge', 'clerk_of_court', 'timezone', 'court_logo'] }
      }
    });

    const settingsMap: Record<string, string> = {};
    for (const setting of settings) {
      settingsMap[setting.key] = JSON.parse(setting.value);
    }

    console.log(`[API] Display config fetched for: ${req.display?.name || req.params.id}`);

    res.json({
      id: display.id,
      name: display.name,
      location: display.location,
      showWeather: display.showWeather,
      weatherLocation: display.weatherLocation || null,
      noticeText: display.noticeText,
      tickerEnabled: display.tickerEnabled,
      tickerSpeed: display.tickerSpeed,
      orientation: display.orientation,
      showStricken: display.showStricken,
      showZoomInfo: display.showZoomInfo,
      highlightCurrent: display.highlightCurrent,
      theme: display.theme,
      columns: JSON.parse(display.columns),
      scheduleEnabled: display.scheduleEnabled,
      scheduleConfig: JSON.parse(display.scheduleConfig || '{}'),
      screensaverType: display.screensaverType,
      docketViewMode: display.docketViewMode,
      displayType: display.displayType,
      wayfindingConfig: (() => {
        if (!display.wayfindingConfig) return null;
        let parsed = JSON.parse(display.wayfindingConfig);
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
        return parsed;
      })(),
      rtspUrl1: display.rtspUrl1,
      rtspUrl2: display.rtspUrl2,
      cameraLabel1: display.cameraLabel1,
      cameraLabel2: display.cameraLabel2,
      cameraRotateInterval: display.cameraRotateInterval,
      // Global settings
      courtName: settingsMap.court_name || 'U.S. Bankruptcy Court',
      courtSubtitle: settingsMap.court_subtitle || 'District of Utah',
      courthouseName: settingsMap.courthouse_name || '',
      chiefJudge: settingsMap.chief_judge || '',
      clerkOfCourt: settingsMap.clerk_of_court || '',
      timezone: settingsMap.timezone || 'America/Denver',
      courtLogo: settingsMap.court_logo || null
    });
  } catch (error) {
    console.error('Failed to fetch display config:', error);
    res.status(500).json({ error: 'Failed to fetch display config' });
  }
});

// GET /api/displays/:id/docket - Get docket entries for a specific display (requires API key)
app.get('/api/displays/:id/docket', displayLimiter, authenticateApiKey, async (req: ApiKeyRequest, res: Response) => {
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

    // Default to today's entries (use UTC date to match database storage)
    const now = new Date();
    const todayUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0));
    const tomorrowUTC = new Date(todayUTC);
    tomorrowUTC.setUTCDate(tomorrowUTC.getUTCDate() + 1);
    where.hearingDate = {
      gte: todayUTC,
      lt: tomorrowUTC
    };

    // Apply display filters (wayfinding shows all hearings — skip judge/courtroom filters)
    if (display.judgeFilter && display.displayType !== 'wayfinding') {
      where.hearingJudge = display.judgeFilter;
    }
    // Chambers type: filter by judge only (skip courtroom filter to show all rooms)
    if (display.courtroomFilter && display.displayType !== 'chambers' && display.displayType !== 'wayfinding') {
      where.OR = [
        { courtroom: display.courtroomFilter },
        { courtroom: null }
      ];
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
    // Check if request is authenticated (optional auth)
    let isAuthenticated = false;
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token) {
      try {
        jwt.verify(token, JWT_SECRET);
        isAuthenticated = true;
      } catch {
        // Invalid token - treat as unauthenticated
      }
    }

    // Unauthenticated requests always get active-only announcements
    const activeOnly = isAuthenticated ? req.query.active === 'true' : true;

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
        { priority: 'desc' },
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
app.post('/api/announcements', authenticateToken, requireEditor, async (req: AuthenticatedRequest, res: Response) => {
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
app.get('/api/announcements/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
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
app.put('/api/announcements/:id', authenticateToken, requireEditor, async (req: AuthenticatedRequest, res: Response) => {
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
app.delete('/api/announcements/:id', authenticateToken, requireEditor, async (req: AuthenticatedRequest, res: Response) => {
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

// PATCH /api/announcements/reorder - Bulk update announcement priorities
app.patch('/api/announcements/reorder', authenticateToken, requireEditor, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { order } = req.body;

    if (!Array.isArray(order) || order.length === 0) {
      return res.status(400).json({ error: 'order must be a non-empty array of { id, priority }' });
    }

    for (const item of order) {
      if (!item.id || typeof item.priority !== 'number') {
        return res.status(400).json({ error: 'Each item must have id (string) and priority (number)' });
      }
    }

    const updates = await prisma.$transaction(
      order.map((item: { id: string; priority: number }) =>
        prisma.announcement.update({
          where: { id: item.id },
          data: { priority: item.priority },
        })
      )
    );

    console.log(`[DB] Reordered ${updates.length} announcements`);

    // Emit WebSocket event to refresh display tickers
    io.emit('announcement:new', {});

    res.json({ success: true, updated: updates.length });
  } catch (error) {
    console.error('Failed to reorder announcements:', error);
    res.status(500).json({ error: 'Failed to reorder announcements' });
  }
});

// GET /api/displays - List all displays
app.get('/api/displays', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const displays = await prisma.display.findMany({
      orderBy: { name: 'asc' }
    });
    console.log(`[DB] SELECT from displays - found ${displays.length} records`);

    // Compute status based on heartbeat freshness (2 minute threshold)
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    const displaysWithStatus = displays.map(d => ({
      ...d,
      status: d.lastHeartbeat && d.lastHeartbeat >= twoMinutesAgo ? 'online' : 'offline'
    }));

    res.json({ displays: displaysWithStatus, total: displays.length });
  } catch (error) {
    console.error('Failed to fetch displays:', error);
    res.status(500).json({ error: 'Failed to fetch displays' });
  }
});

// POST /api/displays - Create a new display
app.post('/api/displays', authenticateToken, requireEditor, async (req: AuthenticatedRequest, res: Response) => {
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
      tickerSpeed,
      orientation,
      scheduleEnabled,
      scheduleConfig,
      screensaverType,
      docketViewMode,
      displayType,
      wayfindingConfig,
      rtspUrl1,
      rtspUrl2,
      cameraLabel1,
      cameraLabel2,
      cameraRotateInterval
    } = req.body;

    if (!id || !name || !location) {
      return res.status(400).json({ error: 'Missing required fields: id, name, location' });
    }

    if (screensaverType && !['black', 'clock', 'logo'].includes(screensaverType)) {
      return res.status(400).json({ error: 'screensaverType must be one of: black, clock, logo' });
    }

    const validDisplayTypes = ['courtroom', 'combined', 'wayfinding', 'it-status', 'chambers'];
    if (displayType && !validDisplayTypes.includes(displayType)) {
      return res.status(400).json({ error: `displayType must be one of: ${validDisplayTypes.join(', ')}` });
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
        orientation: orientation || 'landscape',
        theme: theme || 'default',
        columns: columns ? JSON.stringify(columns) : '["NAME","CH","TIME","CASE","MATTER","ROOM"]',
        showWeather: showWeather ?? true,
        weatherLocation,
        noticeText: noticeText || 'Please turn your phones OFF in the Courthouse',
        tickerEnabled: tickerEnabled ?? true,
        tickerSpeed: tickerSpeed || 'medium',
        scheduleEnabled: scheduleEnabled ?? false,
        scheduleConfig: scheduleConfig ? JSON.stringify(scheduleConfig) : '{}',
        screensaverType: screensaverType || 'black',
        docketViewMode: docketViewMode || 'all',
        displayType: displayType || 'courtroom',
        wayfindingConfig: wayfindingConfig
          ? (typeof wayfindingConfig === 'string' ? wayfindingConfig : JSON.stringify(wayfindingConfig))
          : null,
        rtspUrl1: rtspUrl1 || null,
        rtspUrl2: rtspUrl2 || null,
        cameraLabel1: cameraLabel1 || null,
        cameraLabel2: cameraLabel2 || null,
        cameraRotateInterval: cameraRotateInterval ?? null,
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
app.put('/api/displays/:id', authenticateToken, requireEditor, async (req: AuthenticatedRequest, res: Response) => {
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
      tickerSpeed,
      orientation,
      scheduleEnabled,
      scheduleConfig,
      screensaverType,
      docketViewMode,
      displayType,
      wayfindingConfig,
      rtspUrl1,
      rtspUrl2,
      cameraLabel1,
      cameraLabel2,
      cameraRotateInterval
    } = req.body;

    if (screensaverType !== undefined && !['black', 'clock', 'logo'].includes(screensaverType)) {
      return res.status(400).json({ error: 'screensaverType must be one of: black, clock, logo' });
    }

    const validDisplayTypes = ['courtroom', 'combined', 'wayfinding', 'it-status', 'chambers'];
    if (displayType !== undefined && !validDisplayTypes.includes(displayType)) {
      return res.status(400).json({ error: `displayType must be one of: ${validDisplayTypes.join(', ')}` });
    }

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
        ...(orientation !== undefined && { orientation }),
        ...(theme !== undefined && { theme }),
        ...(columns !== undefined && { columns: Array.isArray(columns) ? JSON.stringify(columns) : columns }),
        ...(showWeather !== undefined && { showWeather }),
        ...(weatherLocation !== undefined && { weatherLocation: weatherLocation || null }),
        ...(noticeText !== undefined && { noticeText }),
        ...(tickerEnabled !== undefined && { tickerEnabled }),
        ...(tickerSpeed !== undefined && { tickerSpeed }),
        ...(scheduleEnabled !== undefined && { scheduleEnabled }),
        ...(scheduleConfig !== undefined && { scheduleConfig: JSON.stringify(scheduleConfig) }),
        ...(screensaverType !== undefined && { screensaverType }),
        ...(docketViewMode !== undefined && { docketViewMode }),
        ...(displayType !== undefined && { displayType }),
        ...(wayfindingConfig !== undefined && { wayfindingConfig: wayfindingConfig
          ? (typeof wayfindingConfig === 'string' ? wayfindingConfig : JSON.stringify(wayfindingConfig))
          : null }),
        ...(rtspUrl1 !== undefined && { rtspUrl1: rtspUrl1 || null }),
        ...(rtspUrl2 !== undefined && { rtspUrl2: rtspUrl2 || null }),
        ...(cameraLabel1 !== undefined && { cameraLabel1: cameraLabel1 || null }),
        ...(cameraLabel2 !== undefined && { cameraLabel2: cameraLabel2 || null }),
        ...(cameraRotateInterval !== undefined && { cameraRotateInterval: cameraRotateInterval ?? null })
      }
    });

    console.log(`[DB] UPDATE displays SET ... WHERE id = '${id}'`);

    res.json(display);
  } catch (error) {
    console.error('Failed to update display:', error);
    res.status(500).json({ error: 'Failed to update display' });
  }
});

// GET /api/display-docket-entries - Query display-docket associations (for verification/testing)
app.get('/api/display-docket-entries', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { displayId, docketEntryId } = req.query;

    const where: Record<string, string> = {};
    if (displayId) where.displayId = displayId as string;
    if (docketEntryId) where.docketEntryId = docketEntryId as string;

    const associations = await prisma.displayDocketEntry.findMany({
      where,
      include: {
        display: {
          select: { id: true, name: true, location: true }
        },
        docketEntry: {
          select: { id: true, caseNumber: true, caseTitle: true, hearingDate: true }
        }
      }
    });

    console.log(`[DB] SELECT from display_docket_entries - found ${associations.length} records`);
    res.json({ associations, total: associations.length });
  } catch (error) {
    console.error('Failed to fetch display-docket associations:', error);
    res.status(500).json({ error: 'Failed to fetch display-docket associations' });
  }
});

// DELETE /api/displays/:id - Delete a display
app.delete('/api/displays/:id', authenticateToken, requireEditor, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Check if display exists
    const existingDisplay = await prisma.display.findUnique({
      where: { id }
    });

    if (!existingDisplay) {
      return res.status(404).json({ error: 'Display not found' });
    }

    // The cascade delete is configured in Prisma schema - DisplayDocketEntry records
    // will be automatically deleted when the display is deleted
    await prisma.display.delete({
      where: { id }
    });

    console.log(`[DB] DELETE FROM displays WHERE id = '${id}' (cascade delete removed associations)`);

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

// POST /api/displays/:id/preview-token - Generate ephemeral preview token for a display
app.post('/api/displays/:id/preview-token', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const display = await prisma.display.findUnique({ where: { id } });
    if (!display) {
      return res.status(404).json({ error: 'Display not found' });
    }

    const previewToken = crypto.randomBytes(32).toString('hex');
    previewTokens.set(previewToken, {
      displayId: id,
      expiresAt: Date.now() + PREVIEW_TOKEN_TTL_MS,
    });

    res.json({
      previewToken,
      displayId: id,
      expiresIn: 300,
    });
  } catch (error) {
    console.error('Failed to generate preview token:', error);
    res.status(500).json({ error: 'Failed to generate preview token' });
  }
});

// POST /api/displays/refresh - Force all displays to refresh
app.post('/api/displays/refresh', authenticateToken, requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    io.emit('display:refresh');
    res.json({ success: true, message: 'Refresh signal sent to all displays' });
  } catch (error) {
    console.error('Failed to send refresh signal:', error);
    res.status(500).json({ error: 'Failed to send refresh signal' });
  }
});

// POST /api/displays/:id/screensaver - Manual screensaver control
app.post('/api/displays/:id/screensaver', authenticateToken, requireEditor, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { action } = req.body;

    if (!action || !['activate', 'deactivate'].includes(action)) {
      return res.status(400).json({ error: 'action must be one of: activate, deactivate' });
    }

    const display = await prisma.display.findUnique({ where: { id } });
    if (!display) {
      return res.status(404).json({ error: 'Display not found' });
    }

    io.emit('display:screensaver', { displayId: id, action });
    console.log(`[WS] Screensaver ${action} sent to display: ${id}`);

    res.json({ success: true, message: `Screensaver ${action} signal sent to display ${id}` });
  } catch (error) {
    console.error('Failed to control screensaver:', error);
    res.status(500).json({ error: 'Failed to control screensaver' });
  }
});

// GET /api/displays/:id/schedule - Get display schedule (API key auth, for Pi script)
app.get('/api/displays/:id/schedule', displayLimiter, authenticateApiKey, async (req: ApiKeyRequest, res: Response) => {
  try {
    const display = await prisma.display.findUnique({
      where: { id: req.params.id }
    });

    if (!display) {
      return res.status(404).json({ error: 'Display not found' });
    }

    const settings = await prisma.setting.findMany({
      where: { key: { in: ['timezone'] } }
    });
    const settingsMap: Record<string, string> = {};
    for (const setting of settings) {
      settingsMap[setting.key] = JSON.parse(setting.value);
    }

    res.json({
      displayId: display.id,
      scheduleEnabled: display.scheduleEnabled,
      scheduleConfig: JSON.parse(display.scheduleConfig || '{}'),
      screensaverType: display.screensaverType,
      timezone: settingsMap.timezone || 'America/Denver'
    });
  } catch (error) {
    console.error('Failed to fetch display schedule:', error);
    res.status(500).json({ error: 'Failed to fetch display schedule' });
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

// DELETE /api/users/:id/permanent - Permanently delete a deactivated user (admin only)
app.delete('/api/users/:id/permanent', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const existingUser = await prisma.user.findUnique({
      where: { id: req.params.id }
    });

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (req.user?.userId === req.params.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    if (existingUser.isActive) {
      return res.status(400).json({ error: 'User must be deactivated before permanent deletion' });
    }

    await prisma.user.delete({
      where: { id: req.params.id }
    });

    await createAuditLog('delete', 'user', req.params.id, req.user?.userId || null, {
      name: existingUser.name,
      email: existingUser.email,
      permanent: true,
    });

    console.log(`[DB] DELETE FROM users WHERE id = ${req.params.id}`);
    res.status(204).send();
  } catch (error) {
    console.error('Failed to permanently delete user:', error);
    res.status(500).json({ error: 'Failed to permanently delete user' });
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

// GET /api/api-keys/validate - Validate an API key (uses X-API-Key header)
// This endpoint allows clients to verify their API key is valid
// NOTE: This route MUST be defined BEFORE /api/api-keys/:id to avoid matching 'validate' as an id
app.get('/api/api-keys/validate', authenticateStandaloneApiKey, async (req: StandaloneApiKeyRequest, res: Response) => {
  res.json({
    valid: true,
    keyInfo: {
      id: req.apiKeyInfo?.id,
      name: req.apiKeyInfo?.name,
      permissions: req.apiKeyInfo?.permissions
    }
  });
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

// PUT /api/api-keys/:id - Update an API key (admin only)
app.put('/api/api-keys/:id', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const existingKey = await prisma.apiKey.findUnique({
      where: { id: req.params.id }
    });

    if (!existingKey) {
      return res.status(404).json({ error: 'API key not found' });
    }

    const { name, permissions, displayId, expiresAt } = req.body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'Name must be a non-empty string' });
      }
      updateData.name = name.trim();
    }
    if (permissions !== undefined) {
      if (!Array.isArray(permissions) || permissions.length === 0) {
        return res.status(400).json({ error: 'Permissions must be a non-empty array' });
      }
      const validPermissions = ['read', 'write', 'admin'];
      const invalid = permissions.filter((p: string) => !validPermissions.includes(p));
      if (invalid.length > 0) {
        return res.status(400).json({ error: `Invalid permissions: ${invalid.join(', ')}` });
      }
      updateData.permissions = JSON.stringify(permissions);
    }
    if (displayId !== undefined) {
      updateData.displayId = displayId || null;
    }
    if (expiresAt !== undefined) {
      updateData.expiresAt = expiresAt ? new Date(expiresAt) : null;
    }

    const updatedKey = await prisma.apiKey.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        display: {
          select: { id: true, name: true }
        }
      }
    });

    console.log(`[DB] UPDATE api_keys WHERE id = ${req.params.id}`);
    res.json({
      id: updatedKey.id,
      name: updatedKey.name,
      keyPrefix: updatedKey.keyPrefix,
      permissions: JSON.parse(updatedKey.permissions),
      displayId: updatedKey.displayId,
      display: updatedKey.display,
      expiresAt: updatedKey.expiresAt,
      lastUsedAt: updatedKey.lastUsedAt,
      createdAt: updatedKey.createdAt
    });
  } catch (error) {
    console.error('Failed to update API key:', error);
    res.status(500).json({ error: 'Failed to update API key' });
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
    const { action, entityType, userId, startDate, endDate, limit = '100', offset = '0', sortOrder } = req.query;

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
        orderBy: { createdAt: sortOrder === 'asc' ? 'asc' : 'desc' },
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

// GET /api/audit-logs/export - Export audit logs as CSV or JSON
app.get('/api/audit-logs/export', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { action, entityType, userId, startDate, endDate, format = 'csv' } = req.query;

    // Build filter conditions (same as listing)
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

    // Fetch all matching logs (up to 10000 for export)
    const logs = await prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 10000
    });

    console.log(`[DB] SELECT from audit_logs for export - found ${logs.length} records`);

    if (format === 'json') {
      // Export as JSON
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="audit-logs-export.json"');
      res.json(logs.map(log => ({
        id: log.id,
        timestamp: log.createdAt,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        user: log.user?.name || log.user?.email || 'System',
        userId: log.userId,
        changes: log.changes ? JSON.parse(log.changes) : null,
        ipAddress: log.ipAddress
      })));
    } else {
      // Export as CSV (default)
      const csvHeader = 'Timestamp,Action,Entity Type,Entity ID,User,User ID,Changes,IP Address';
      const csvRows = logs.map(log => {
        const timestamp = new Date(log.createdAt).toISOString();
        const changesStr = log.changes ? log.changes.replace(/"/g, '""') : '';
        return `"${timestamp}","${log.action}","${log.entityType}","${log.entityId || ''}","${log.user?.name || log.user?.email || 'System'}","${log.userId || ''}","${changesStr}","${log.ipAddress || ''}"`;
      });
      const csvContent = [csvHeader, ...csvRows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="audit-logs-export.csv"');
      res.send(csvContent);
    }
  } catch (error) {
    console.error('Failed to export audit logs:', error);
    res.status(500).json({ error: 'Failed to export audit logs' });
  }
});

// =========================================
// Settings Endpoints
// =========================================

// GET /api/settings/public - Public court branding info (no auth required)
app.get('/api/settings/public', async (req: Request, res: Response) => {
  try {
    const settings = await prisma.setting.findMany({
      where: {
        key: { in: ['court_name', 'court_subtitle', 'courthouse_name', 'chief_judge', 'clerk_of_court', 'court_logo'] }
      }
    });

    const settingsMap: Record<string, string> = {};
    for (const setting of settings) {
      settingsMap[setting.key] = JSON.parse(setting.value);
    }

    res.json({
      courtName: settingsMap.court_name || 'U.S. Bankruptcy Court',
      courtSubtitle: settingsMap.court_subtitle || 'District of Utah',
      courthouseName: settingsMap.courthouse_name || '',
      chiefJudge: settingsMap.chief_judge || '',
      clerkOfCourt: settingsMap.clerk_of_court || '',
      courtLogo: settingsMap.court_logo || null
    });
  } catch (error) {
    console.error('Failed to fetch public settings:', error);
    res.status(500).json({ error: 'Failed to fetch public settings' });
  }
});

// GET /api/settings - Get all settings
app.get('/api/settings', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const settings = await prisma.setting.findMany({
      include: {
        updatedBy: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    // Transform settings array to a more usable object format
    const settingsObject: Record<string, unknown> = {};
    const settingsMetadata: Record<string, { updatedAt: Date; updatedBy: { name: string | null } | null }> = {};

    for (const setting of settings) {
      settingsObject[setting.key] = JSON.parse(setting.value);
      settingsMetadata[setting.key] = {
        updatedAt: setting.updatedAt,
        updatedBy: setting.updatedBy
      };
    }

    console.log(`[DB] SELECT from settings - found ${settings.length} records`);
    res.json({ settings: settingsObject, metadata: settingsMetadata });
  } catch (error) {
    console.error('Failed to fetch settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PUT /api/settings - Update settings (admin only)
app.put('/api/settings', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { settings } = req.body;

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Settings object is required' });
    }

    // Valid settings keys that can be updated
    const validKeys = ['court_name', 'court_subtitle', 'courthouse_name', 'chief_judge', 'clerk_of_court', 'timezone', 'default_theme'];

    // Update each setting
    const updatedSettings: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(settings)) {
      if (!validKeys.includes(key)) {
        continue; // Skip invalid keys
      }

      await prisma.setting.upsert({
        where: { key },
        update: {
          value: JSON.stringify(value),
          updatedById: req.user?.userId || null
        },
        create: {
          key,
          value: JSON.stringify(value),
          updatedById: req.user?.userId || null
        }
      });
      updatedSettings[key] = value;
    }

    console.log(`[DB] UPDATE settings - updated ${Object.keys(updatedSettings).length} records`);

    // Create audit log for settings change
    await createAuditLog('update', 'settings', null, req.user?.userId || null, updatedSettings);

    // Emit WebSocket event for real-time updates (displays may need to refresh)
    io.emit('settings:update', { settings: updatedSettings });

    res.json({
      message: 'Settings updated successfully',
      settings: updatedSettings
    });
  } catch (error) {
    console.error('Failed to update settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// POST /api/settings/logo - Upload court logo (admin only)
app.post('/api/settings/logo', authenticateToken, requireAdmin, upload.single('logo'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const logoPath = `/uploads/${req.file.filename}`;

    // Delete old logo if exists
    const existingLogo = await prisma.setting.findUnique({
      where: { key: 'court_logo' }
    });

    if (existingLogo) {
      try {
        const oldPath = JSON.parse(existingLogo.value);
        const oldFilePath = path.resolve(UPLOADS_DIR, path.basename(oldPath));
        if (oldFilePath.startsWith(path.resolve(UPLOADS_DIR)) && fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
        }
      } catch (e) {
        console.warn('Could not delete old logo:', e);
      }
    }

    // Save new logo path to settings
    await prisma.setting.upsert({
      where: { key: 'court_logo' },
      update: {
        value: JSON.stringify(logoPath),
        updatedById: req.user?.userId || null
      },
      create: {
        key: 'court_logo',
        value: JSON.stringify(logoPath),
        updatedById: req.user?.userId || null
      }
    });

    console.log(`[DB] UPSERT setting court_logo = ${logoPath}`);

    // Create audit log
    await createAuditLog('upload', 'settings', null, req.user?.userId || null, { court_logo: logoPath });

    // Emit WebSocket event
    io.emit('settings:update', { court_logo: logoPath });

    res.json({
      message: 'Logo uploaded successfully',
      logo: logoPath,
      filename: req.file.filename
    });
  } catch (error) {
    console.error('Failed to upload logo:', error);
    // Clean up uploaded file on error
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
        console.warn('Could not delete failed upload:', e);
      }
    }
    res.status(500).json({ error: 'Failed to upload logo' });
  }
});

// DELETE /api/settings/logo - Remove court logo (admin only)
app.delete('/api/settings/logo', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const existingLogo = await prisma.setting.findUnique({
      where: { key: 'court_logo' }
    });

    if (existingLogo) {
      // Delete file from disk (validate path stays within uploads directory)
      try {
        const logoPath = JSON.parse(existingLogo.value);
        const filePath = path.resolve(UPLOADS_DIR, path.basename(logoPath));
        if (filePath.startsWith(path.resolve(UPLOADS_DIR)) && fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (e) {
        console.warn('Could not delete logo file:', e);
      }

      // Remove from database
      await prisma.setting.delete({
        where: { key: 'court_logo' }
      });

      console.log('[DB] DELETE setting court_logo');

      // Create audit log
      await createAuditLog('delete', 'settings', null, req.user?.userId || null, { court_logo: 'removed' });

      // Emit WebSocket event
      io.emit('settings:update', { court_logo: null });
    }

    res.json({ message: 'Logo removed successfully' });
  } catch (error) {
    console.error('Failed to remove logo:', error);
    res.status(500).json({ error: 'Failed to remove logo' });
  }
});

// =========================================
// Calendar Import Endpoints (Admin Only)
// =========================================

// GET /api/calendar-import/status - Current import state
app.get('/api/calendar-import/status', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const status = await calendarImportService.getImportStatus();
    res.json(status);
  } catch (error) {
    console.error('Failed to get import status:', error);
    res.status(500).json({ error: 'Failed to get import status' });
  }
});

// POST /api/calendar-import/run - Trigger manual import (returns immediately, runs async)
app.post('/api/calendar-import/run', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const status = await calendarImportService.getImportStatus();
    if (status.isRunning) {
      return res.status(409).json({ error: 'Import is already running' });
    }

    // Start import in background
    calendarImportService.runImport(io).catch(err => {
      console.error('Background import failed:', err);
    });

    res.json({ message: 'Import started' });
  } catch (error) {
    console.error('Failed to start import:', error);
    res.status(500).json({ error: 'Failed to start import' });
  }
});

// GET /api/calendar-import/history - List import logs (paginated)
app.get('/api/calendar-import/history', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const history = await calendarImportService.getImportHistory(page, limit);
    res.json(history);
  } catch (error) {
    console.error('Failed to get import history:', error);
    res.status(500).json({ error: 'Failed to get import history' });
  }
});

// GET /api/calendar-import/history/:id - Single import log detail
app.get('/api/calendar-import/history/:id', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const log = await calendarImportService.getImportLogById(req.params.id);
    if (!log) {
      return res.status(404).json({ error: 'Import log not found' });
    }
    res.json(log);
  } catch (error) {
    console.error('Failed to get import log:', error);
    res.status(500).json({ error: 'Failed to get import log' });
  }
});

// GET /api/calendar-import/config - Get import configuration
app.get('/api/calendar-import/config', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const config = await calendarImportService.getImportConfig();
    res.json(config);
  } catch (error) {
    console.error('Failed to get import config:', error);
    res.status(500).json({ error: 'Failed to get import config' });
  }
});

// PUT /api/calendar-import/config - Update import configuration
app.put('/api/calendar-import/config', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { enabled, intervalMinutes, sourceUrl } = req.body;
    await calendarImportService.updateImportConfig(
      { enabled, intervalMinutes, sourceUrl },
      req.user?.userId
    );
    const config = await calendarImportService.getImportConfig();
    res.json(config);
  } catch (error) {
    console.error('Failed to update import config:', error);
    res.status(500).json({ error: 'Failed to update import config' });
  }
});

// =========================================
// Data Management Endpoints (Admin Only)
// =========================================

// GET /api/export - Export system data
app.get('/api/export', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const includeParam = (req.query.include as string) || '';
    const include = new Set(includeParam.split(',').filter(Boolean));

    const categories: Record<string, unknown[]> = {};

    if (include.has('settings')) {
      categories.settings = await prisma.setting.findMany();
    }

    if (include.has('displays')) {
      const displays = await prisma.display.findMany();
      categories.displays = displays.map(({ apiKeyHash, ...rest }) => rest);
    }

    if (include.has('docket')) {
      categories.docketEntries = await prisma.docketEntry.findMany();
      categories.displayDocketEntries = await prisma.displayDocketEntry.findMany();
    }

    if (include.has('announcements')) {
      categories.announcements = await prisma.announcement.findMany();
    }

    if (include.has('users')) {
      const users = await prisma.user.findMany();
      categories.users = users.map(({ passwordHash, ...rest }) => rest);
    }

    if (include.has('auditLogs')) {
      categories.auditLogs = await prisma.auditLog.findMany();
    }

    const exportData = {
      exportedAt: new Date().toISOString(),
      version: 1,
      categories,
    };

    const dateStr = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Disposition', `attachment; filename="courthouse-export-${dateStr}.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(exportData);
  } catch (error) {
    console.error('Export failed:', error);
    res.status(500).json({ error: 'Export failed' });
  }
});

// DELETE /api/clear - Clear selected data categories
app.delete('/api/clear', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { categories } = req.body as { categories: string[] };
    if (!Array.isArray(categories) || categories.length === 0) {
      return res.status(400).json({ error: 'categories array is required' });
    }

    const cleared: Record<string, number> = {};

    await prisma.$transaction(async (tx) => {
      // Delete in FK-safe order
      if (categories.includes('docket')) {
        const dde = await tx.displayDocketEntry.deleteMany({});
        cleared.displayDocketEntries = dde.count;
        const de = await tx.docketEntry.deleteMany({});
        cleared.docketEntries = de.count;
      }

      if (categories.includes('announcements')) {
        const r = await tx.announcement.deleteMany({});
        cleared.announcements = r.count;
      }

      if (categories.includes('auditLogs')) {
        const r = await tx.auditLog.deleteMany({});
        cleared.auditLogs = r.count;
      }

      if (categories.includes('displays')) {
        // display_docket_entries cascade from displays, but also delete api_keys
        if (!categories.includes('docket')) {
          await tx.displayDocketEntry.deleteMany({});
        }
        await tx.apiKey.deleteMany({});
        const r = await tx.display.deleteMany({});
        cleared.displays = r.count;
      }

      if (categories.includes('users')) {
        const r = await tx.user.deleteMany({});
        cleared.users = r.count;
      }

      if (categories.includes('settings')) {
        const r = await tx.setting.deleteMany({});
        cleared.settings = r.count;
      }
    });

    await createAuditLog('clear', 'system', null, req.user?.userId || null, { cleared });
    res.json({ cleared });
  } catch (error) {
    console.error('Clear failed:', error);
    res.status(500).json({ error: 'Clear failed' });
  }
});

// POST /api/import - Import system data
app.post('/api/import', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = req.body;
    if (!data || data.version !== 1 || !data.categories) {
      return res.status(400).json({ error: 'Invalid import file. Expected version 1 with categories.' });
    }

    const imported: Record<string, number> = {};
    const cats = data.categories;

    await prisma.$transaction(async (tx) => {
      if (cats.settings && Array.isArray(cats.settings)) {
        let count = 0;
        for (const s of cats.settings) {
          await tx.setting.upsert({
            where: { key: s.key },
            update: { value: s.value, updatedById: s.updatedById || null },
            create: { key: s.key, value: s.value, updatedById: s.updatedById || null },
          });
          count++;
        }
        imported.settings = count;
      }

      if (cats.users && Array.isArray(cats.users)) {
        const placeholderHash = await bcrypt.hash('RESET_REQUIRED', 10);
        const usersToCreate = cats.users.map((u: Record<string, unknown>) => ({
          id: u.id as string,
          email: u.email as string,
          passwordHash: placeholderHash,
          name: u.name as string,
          role: (u.role as string) || 'viewer',
          isActive: u.isActive !== false,
        }));
        const r = await tx.user.createMany({ data: usersToCreate, // @ts-expect-error -- skipDuplicates works with SQLite at runtime (Prisma uses INSERT OR IGNORE)
          skipDuplicates: true });
        imported.users = r.count;
      }

      if (cats.displays && Array.isArray(cats.displays)) {
        const placeholderKeyHash = crypto.createHash('sha256').update('REGENERATE_REQUIRED').digest('hex');
        const displaysToCreate = cats.displays.map((d: Record<string, unknown>) => ({
          id: d.id as string,
          name: d.name as string,
          location: d.location as string,
          judgeFilter: (d.judgeFilter as string) || null,
          courtroomFilter: (d.courtroomFilter as string) || null,
          chapterFilter: (d.chapterFilter as string) || null,
          showStricken: d.showStricken === true,
          showZoomInfo: d.showZoomInfo !== false,
          highlightCurrent: d.highlightCurrent !== false,
          theme: (d.theme as string) || 'default',
          columns: (d.columns as string) || '["NAME","CH","TIME","CASE","MATTER","ROOM"]',
          showWeather: d.showWeather !== false,
          weatherLocation: (d.weatherLocation as string) || null,
          noticeText: (d.noticeText as string) || 'Please turn your phones OFF in the Courthouse',
          tickerEnabled: d.tickerEnabled !== false,
          tickerSpeed: (d.tickerSpeed as string) || 'medium',
          status: (d.status as string) || 'unknown',
          apiKeyHash: placeholderKeyHash,
        }));
        const r = await tx.display.createMany({ data: displaysToCreate, // @ts-expect-error -- skipDuplicates works with SQLite at runtime (Prisma uses INSERT OR IGNORE)
          skipDuplicates: true });
        imported.displays = r.count;
      }

      if (cats.docketEntries && Array.isArray(cats.docketEntries)) {
        const entriesToCreate = cats.docketEntries.map((e: Record<string, unknown>) => ({
          id: e.id as string,
          caseNumber: e.caseNumber as string,
          caseTitle: e.caseTitle as string,
          caseChapter: e.caseChapter as string,
          adversaryNumber: (e.adversaryNumber as string) || null,
          adversaryTitle: (e.adversaryTitle as string) || null,
          hearingDate: new Date(e.hearingDate as string),
          hearingTime: e.hearingTime as string,
          hearingMatter: e.hearingMatter as string,
          hearingJudge: e.hearingJudge as string,
          courtroom: (e.courtroom as string) || null,
          movingParty: (e.movingParty as string) || null,
          opposingParty: (e.opposingParty as string) || null,
          trustee: (e.trustee as string) || null,
          isZoom: e.isZoom === true,
          zoomMeetingId: (e.zoomMeetingId as string) || null,
          zoomPasscode: (e.zoomPasscode as string) || null,
          zoomPhone: (e.zoomPhone as string) || null,
          status: (e.status as string) || 'scheduled',
          statusNote: (e.statusNote as string) || null,
          comment: (e.comment as string) || null,
          createdById: (e.createdById as string) || null,
        }));
        const r = await tx.docketEntry.createMany({ data: entriesToCreate, // @ts-expect-error -- skipDuplicates works with SQLite at runtime (Prisma uses INSERT OR IGNORE)
          skipDuplicates: true });
        imported.docketEntries = r.count;
      }

      if (cats.displayDocketEntries && Array.isArray(cats.displayDocketEntries)) {
        const ddesToCreate = cats.displayDocketEntries.map((d: Record<string, unknown>) => ({
          displayId: d.displayId as string,
          docketEntryId: d.docketEntryId as string,
        }));
        const r = await tx.displayDocketEntry.createMany({ data: ddesToCreate, // @ts-expect-error -- skipDuplicates works with SQLite at runtime (Prisma uses INSERT OR IGNORE)
          skipDuplicates: true });
        imported.displayDocketEntries = r.count;
      }

      if (cats.announcements && Array.isArray(cats.announcements)) {
        const announcementsToCreate = cats.announcements.map((a: Record<string, unknown>) => ({
          id: a.id as string,
          text: a.text as string,
          priority: (a.priority as number) || 100,
          enabled: a.enabled !== false,
          expiresAt: a.expiresAt ? new Date(a.expiresAt as string) : null,
          createdById: (a.createdById as string) || null,
        }));
        const r = await tx.announcement.createMany({ data: announcementsToCreate, // @ts-expect-error -- skipDuplicates works with SQLite at runtime (Prisma uses INSERT OR IGNORE)
          skipDuplicates: true });
        imported.announcements = r.count;
      }
    });

    await createAuditLog('import', 'system', null, req.user?.userId || null, { imported });
    res.json({ imported });
  } catch (error) {
    console.error('Import failed:', error);
    res.status(500).json({ error: 'Import failed' });
  }
});

// Serve uploaded files
app.use('/uploads', express.static(UPLOADS_DIR));

// Socket.IO authentication middleware - require API key with displayId
io.use(async (socket, next) => {
  const apiKey = socket.handshake.auth?.apiKey as string;
  const displayId = socket.handshake.auth?.displayId as string;

  if (!apiKey || !displayId) {
    return next(new Error('API key and display ID required'));
  }

  try {
    // Find the display and verify the API key
    const display = await prisma.display.findUnique({ where: { id: displayId } });
    if (!display) {
      return next(new Error('Display not found'));
    }

    // Check preview tokens first (O(1) Map lookup, no bcrypt)
    const previewEntry = previewTokens.get(apiKey);
    if (previewEntry && previewEntry.displayId === displayId && previewEntry.expiresAt > Date.now()) {
      (socket as any).displayId = displayId;
      return next();
    }

    // Verify the hashed API key
    const isValid = await bcrypt.compare(apiKey, display.apiKeyHash);
    if (!isValid) {
      return next(new Error('Invalid API key'));
    }

    (socket as any).displayId = displayId;
    next();
  } catch (err) {
    console.error('Socket.IO auth error:', err);
    return next(new Error('Authentication failed'));
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  const displayId = (socket as any).displayId;
  console.log(`Client connected: ${socket.id} (display: ${displayId})`);

  // Update heartbeat on connection (already authenticated)
  if (displayId) {
    prisma.display.update({
      where: { id: displayId },
      data: { lastHeartbeat: new Date(), status: 'online' }
    }).catch(err => console.error(`Failed to update display on connect: ${displayId}`, err));
  }

  // Track display registration (re-register on reconnect)
  socket.on('display:register', async (data) => {
    if (data?.displayId && data.displayId === displayId) {
      try {
        await prisma.display.update({
          where: { id: data.displayId },
          data: { lastHeartbeat: new Date(), status: 'online' }
        });
      } catch (err) {
        console.error(`Failed to update display on register: ${data.displayId}`, err);
      }
    }
  });

  socket.on('disconnect', () => {
    const displayId = (socket as any).displayId;
    console.log(`Client disconnected: ${socket.id}${displayId ? ` (display: ${displayId})` : ''}`);
  });

  // Display heartbeat - update DB
  socket.on('display:heartbeat', async (data) => {
    if (data?.displayId) {
      try {
        await prisma.display.update({
          where: { id: data.displayId },
          data: { lastHeartbeat: new Date(), status: 'online' }
        });
      } catch (err) {
        console.error(`Failed to update heartbeat for display: ${data.displayId}`, err);
      }
    }
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
  clearInterval(previewTokenCleanupInterval);
  previewTokens.clear();
  await prisma.$disconnect();
  process.exit(0);
});

// Start server
httpServer.listen(PORT, async () => {
  console.log('============================================');
  console.log('  Courthouse Digital Signage - Backend API');
  console.log('============================================');
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log('============================================');

  // Start auto-import polling if enabled in settings
  try {
    await calendarImportService.syncPollingTimer(io);
  } catch (err) {
    console.error('Failed to initialize calendar import polling:', err);
  }
});

export { app, io, prisma };
