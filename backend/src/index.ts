import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';

import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { testRoutes } from './routes/testRoutes';
import { aiRoutes } from './routes/aiRoutes';
import { healthRoutes } from './routes/healthRoutes';
import settingsRoutes from './routes/settings';
import explorationRoutes from './routes/explorationRoutes';
import simplifiedExplorationRoutes from './routes/simplifiedExplorationRoutes';
import reportsRoutes from './routes/reportsRoutes';
import testGenerationRoutes from './routes/testGenerationRoutes';
import { getLogsDashboard, getLogsJSON } from './controllers/logsController';
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

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

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
app.use('/api/test-generation', testGenerationRoutes);

// EASY ACCESS LOGS DASHBOARD - Just go to http://localhost:15000/logs
app.get('/logs', getLogsDashboard);
app.get('/api/logs', getLogsJSON);

// Home page with links to all features
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>AI Testing Agent</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          justify-content: center;
          align-items: center;
          margin: 0;
        }
        .container {
          background: white;
          padding: 40px;
          border-radius: 20px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.2);
          max-width: 600px;
          width: 90%;
        }
        h1 {
          color: #2d3748;
          margin-bottom: 30px;
          text-align: center;
        }
        .links {
          display: grid;
          gap: 15px;
        }
        a {
          display: block;
          padding: 15px 20px;
          background: linear-gradient(135deg, #667eea, #764ba2);
          color: white;
          text-decoration: none;
          border-radius: 10px;
          font-weight: bold;
          transition: transform 0.3s;
          text-align: center;
        }
        a:hover {
          transform: translateY(-3px);
        }
        .badge {
          display: inline-block;
          background: rgba(255,255,255,0.3);
          padding: 2px 8px;
          border-radius: 5px;
          font-size: 12px;
          margin-left: 10px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🚀 AI Testing Agent</h1>
        <div class="links">
          <a href="/logs">📊 View Logs Dashboard <span class="badge">NEW!</span></a>
          <a href="/api/logs">📄 Get Logs (JSON)</a>
          <a href="/api/test-generation/statistics">💰 API Usage Statistics</a>
          <a href="/exploration-dashboard.html" target="_blank">🧭 Exploration Dashboard <span class="badge">BETA</span></a>
          <a href="http://localhost:15001" target="_blank">🎨 Frontend UI</a>
          <a href="/api/health">❤️ Health Check</a>
        </div>
      </div>
    </body>
    </html>
  `);
});

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

export { app, server };
