import express from 'express';
import {
  generateTest,
  executeGeneratedTest,
  getTestHistory,
  getAPIStatistics
} from '../controllers/testGenerationController';
import costTracker from '../utils/costTracker';

const router = express.Router();

/**
 * @route   POST /api/test-generation/generate
 * @desc    Generate test code based on scenario
 * @body    { summary: string, actions: string[] }
 */
router.post('/generate', generateTest);

/**
 * @route   POST /api/test-generation/execute
 * @desc    Execute generated test code
 * @body    { code: string }
 */
router.post('/execute', executeGeneratedTest);

/**
 * @route   GET /api/test-generation/history
 * @desc    Get test generation history
 * @query   limit: number (optional, default: 10)
 */
router.get('/history', getTestHistory);

/**
 * @route   GET /api/test-generation/statistics
 * @desc    Get API usage statistics and costs
 */
router.get('/statistics', getAPIStatistics);

/**
 * @route   GET /api/test-generation/lifetime-costs
 * @desc    Get lifetime cost tracking data
 */
router.get('/lifetime-costs', async (req, res) => {
  try {
    const lifetimeStats = await costTracker.getLifetimeStats();
    const todayCost = await costTracker.getTodayCost();
    const monthCost = await costTracker.getMonthCost();
    const summary = costTracker.formatCostSummary(lifetimeStats);

    res.json({
      success: true,
      data: {
        lifetimeStats,
        todayCost,
        monthCost,
        formattedSummary: summary
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/test-generation/logs
 * @desc    Get list of generation logs
 */
router.get('/logs', async (req, res) => {
  const path = require('path');
  const fs = require('fs').promises;

  try {
    const indexPath = path.join(process.cwd(), 'generation_logs', 'index.json');
    const indexData = await fs.readFile(indexPath, 'utf8');
    const index = JSON.parse(indexData);

    res.json({
      success: true,
      data: index.reverse() // Most recent first
    });
  } catch (error: any) {
    res.json({
      success: true,
      data: [] // Return empty array if no logs yet
    });
  }
});

/**
 * @route   GET /api/test-generation/logs/:id
 * @desc    Get specific generation log by ID
 */
router.get('/logs/:id', async (req, res) => {
  const path = require('path');
  const fs = require('fs').promises;

  try {
    const logPath = path.join(process.cwd(), 'generation_logs', `${req.params.id}.json`);
    const logData = await fs.readFile(logPath, 'utf8');

    res.json({
      success: true,
      data: JSON.parse(logData)
    });
  } catch (error: any) {
    res.status(404).json({
      success: false,
      error: 'Generation log not found'
    });
  }
});

export default router;