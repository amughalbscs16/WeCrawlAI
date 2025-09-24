import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { testRoutes } from './routes/testRoutes';
import { aiRoutes } from './routes/aiRoutes';
import { healthRoutes } from './routes/healthRoutes';
import settingsRoutes from './routes/settings';
import explorationRoutes from './routes/explorationRoutes';
import simplifiedExplorationRoutes from './routes/simplifiedExplorationRoutes';
import reportsRoutes from './routes/reportsRoutes';
import { WebSocketManager } from './services/WebSocketManager';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Trust proxy for rate limiting
app.set('trust proxy', 1);

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"],
    },
  },
}));

app.use(cors({
  origin: true, // Allow all origins temporarily
  credentials: true
}));

app.use(morgan('combined', {
  stream: {
    write: (message: string) => logger.info(message.trim())
  }
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// Initialize WebSocket manager
const wsManager = new WebSocketManager(wss);

// Routes
app.use('/api/health', healthRoutes);
app.use('/api/tests', testRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/exploration', explorationRoutes);
app.use('/api/simplified-exploration', simplifiedExplorationRoutes);
app.use('/api/reports', reportsRoutes);

// Error handling
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

const PORT = process.env.PORT || 15000;

server.listen(PORT, () => {
  logger.info(`🚀 AI Testing Agent Backend server running on port ${PORT}`);
  logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`🔌 WebSocket server initialized`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
  });
});

// Trigger nodemon restart
export { app, server };