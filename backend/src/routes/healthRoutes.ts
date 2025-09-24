import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

const router = Router();

// Health check endpoint
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const healthCheck = {
    uptime: process.uptime(),
    message: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0'
  };

  res.status(200).json({
    success: true,
    data: healthCheck
  });
}));

// Detailed health check with dependencies
router.get('/detailed', asyncHandler(async (req: Request, res: Response) => {
  const checks = {
    server: 'healthy',
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      external: Math.round(process.memoryUsage().external / 1024 / 1024)
    },
    uptime: {
      seconds: Math.floor(process.uptime()),
      human: new Date(process.uptime() * 1000).toISOString().substr(11, 8)
    },
    timestamp: new Date().toISOString()
  };

  logger.info('Health check performed', checks);

  res.status(200).json({
    success: true,
    data: checks
  });
}));

export { router as healthRoutes };