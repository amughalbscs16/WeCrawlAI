import { Request, Response } from 'express';
import testGenerationService from '../services/testGenerationService';
import logger from '../utils/logger';
import apiLogger from '../utils/apiLogger';

export const generateTest = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { summary, actions } = req.body;

    // Validate input
    if (!summary || !actions || !Array.isArray(actions)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input. Please provide a summary and an array of actions.'
      });
    }

    // Generate the test
    const generatedTest = await testGenerationService.generateTest({
      summary,
      actions
    });

    return res.json({
      success: true,
      data: {
        code: generatedTest.code,
        annotations: generatedTest.annotations,
        timestamp: generatedTest.timestamp
      }
    });
  } catch (error: any) {
    logger.error('Test generation controller error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Test generation failed'
    });
  }
};

export const executeGeneratedTest = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'No test code provided'
      });
    }

    const result = await testGenerationService.executeTest(code);

    return res.json({
      success: result.success,
      data: result
    });
  } catch (error: any) {
    logger.error('Test execution controller error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Test execution failed'
    });
  }
};

export const getTestHistory = async (req: Request, res: Response): Promise<Response> => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const history = await testGenerationService.getTestHistory(limit);

    return res.json({
      success: true,
      data: {
        history,
        count: history.length
      }
    });
  } catch (error: any) {
    logger.error('Get test history error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve test history'
    });
  }
};

export const getAPIStatistics = async (req: Request, res: Response): Promise<Response> => {
  try {
    const stats = await apiLogger.getStatistics();

    return res.json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    logger.error('Get API statistics error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve API statistics'
    });
  }
};