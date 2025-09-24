import { Router, Request, Response } from 'express';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { TestExecutionService } from '../services/TestExecutionService';
import { validateTestScenario } from '../middleware/validation';
import { logger } from '../utils/logger';

const router = Router();
const testExecutionService = new TestExecutionService();

// Execute a test scenario
router.post('/execute', validateTestScenario, asyncHandler(async (req: Request, res: Response) => {
  const { scenario, url, options = {} } = req.body;

  logger.info('Test execution requested', {
    url,
    scenarioLength: scenario.length,
    options
  });

  try {
    const executionId = await testExecutionService.executeScenario({
      scenario,
      url,
      options
    });

    res.status(202).json({
      success: true,
      data: {
        executionId,
        message: 'Test execution started',
        status: 'running'
      }
    });
  } catch (error) {
    logger.error('Test execution failed to start', { error: error.message });
    throw createError('Failed to start test execution', 500);
  }
}));

// Get test execution status
router.get('/execution/:id/status', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const status = await testExecutionService.getExecutionStatus(id);

  if (!status) {
    throw createError('Test execution not found', 404);
  }

  res.status(200).json({
    success: true,
    data: status
  });
}));

// Get test execution results
router.get('/execution/:id/results', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const results = await testExecutionService.getExecutionResults(id);

  if (!results) {
    throw createError('Test execution results not found', 404);
  }

  res.status(200).json({
    success: true,
    data: results
  });
}));

// Stop test execution
router.post('/execution/:id/stop', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const stopped = await testExecutionService.stopExecution(id);

  if (!stopped) {
    throw createError('Test execution not found or already completed', 404);
  }

  res.status(200).json({
    success: true,
    data: {
      message: 'Test execution stopped',
      executionId: id
    }
  });
}));

// Get test execution history
router.get('/history', asyncHandler(async (req: Request, res: Response) => {
  const { page = 1, limit = 10 } = req.query;

  const history = await testExecutionService.getExecutionHistory({
    page: parseInt(page as string),
    limit: parseInt(limit as string)
  });

  res.status(200).json({
    success: true,
    data: history
  });
}));

export { router as testRoutes };