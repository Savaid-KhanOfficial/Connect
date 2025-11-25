import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import db from './database.js';
import logger from './utils/logger.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import friendRoutes, { setSocketIO as setFriendsSocketIO } from './routes/friends.js';
import messageRoutes, { setSocketIO as setMessagesSocketIO, setTimerCleanup } from './routes/messages.js';
import uploadRoutes from './routes/upload.js';
import { setupSocketHandlers, clearMessageTimer, initializeDisappearingMessageTimers } from './socket/socketHandlers.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);

// Use environment variable for CORS origin
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const PORT = process.env.PORT || 3000;

const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_URL,
    methods: ['GET', 'POST']
  }
});

// Socket.IO authentication middleware
io.use((socket, next) => {
  const userId = socket.handshake.auth?.userId;
  
  if (!userId) {
    return next(new Error('Authentication required'));
  }
  
  // Verify user exists in database
  db.get('SELECT id FROM users WHERE id = ?', [userId], (err, user) => {
    if (err || !user) {
      return next(new Error('Invalid user'));
    }
    
    // Attach authenticated userId to socket
    socket.userId = userId;
    next();
  });
});

// Middleware
app.use(cors());
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    }
  },
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
}));
app.use(express.json());

// Serve static uploads directory
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Pass io instance to routes for real-time events
setFriendsSocketIO(io);
setMessagesSocketIO(io);
setTimerCleanup(clearMessageTimer);

// Health check endpoint
app.get('/health', (req, res) => {
  db.get('SELECT 1', (err) => {
    if (err) {
      logger.error('Health check failed - database error:', err);
      return res.status(503).json({ 
        status: 'unhealthy', 
        database: 'down',
        timestamp: new Date().toISOString()
      });
    }
    res.json({ 
      status: 'healthy',
      database: 'connected',
      uptime: process.uptime(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
      },
      timestamp: new Date().toISOString()
    });
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/upload', uploadRoutes);

// Socket.io handlers
setupSocketHandlers(io);

httpServer.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`CORS enabled for: ${CLIENT_URL}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Create database indexes for performance
  db.run('CREATE INDEX IF NOT EXISTS idx_messages_sender_receiver ON messages(sender_id, receiver_id)', (err) => {
    if (err) logger.error('Error creating messages index:', err);
    else logger.info('Database indexes verified');
  });
  db.run('CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_friends_users ON friends(user1_id, user2_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_blocked_users ON blocked_users(blocker_id, blocked_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver ON friend_requests(receiver_id, status)');
});
