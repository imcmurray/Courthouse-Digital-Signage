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
const CORS_ORIGIN = process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173', 'http://localhost:8080'];

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

// Placeholder routes - will be implemented by coding agents
app.get('/api/docket', async (req, res) => {
  // TODO: Implement docket listing with filters
  res.json({ entries: [], total: 0 });
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

app.get('/api/displays', async (req, res) => {
  // TODO: Implement displays listing
  res.json({ displays: [], total: 0 });
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
