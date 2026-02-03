import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';

const app = express();
const httpServer = createServer(app);
const prisma = new PrismaClient();

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
