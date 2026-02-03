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

// Placeholder routes - will be implemented by coding agents
app.get('/api/docket', async (req, res) => {
  // TODO: Implement docket listing with filters
  res.json({ entries: [], total: 0 });
});

app.get('/api/announcements', async (req, res) => {
  // TODO: Implement announcements listing
  res.json({ announcements: [], total: 0 });
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
