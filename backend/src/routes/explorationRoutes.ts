/**
 * API Routes for RL-based Web Exploration
 * Provides endpoints for starting, controlling, and monitoring exploration sessions
 */

import express from 'express';
import { explorationRLService } from '../services/ExplorationRLService';
import { multiModalStateCaptureService } from '../services/StateCapture/MultiModalStateCaptureService';
import { logger } from '../utils/logger';
import {
  ExplorationConfig,
  ExplorationStrategy,
  ActionType,
  SafetyConstraints
} from '../types/exploration';
import { WebSocketManager } from '../services/WebSocketManager';

const router = express.Router();

/**
 * POST /api/exploration/start
 * Start a new exploration session
 */
router.post('/start', async (req, res): Promise<void> => {
  try {
    const {
      startUrl,
      strategy = ExplorationStrategy.CURIOSITY_DRIVEN,
      maxSessionDuration = 300000, // 5 minutes default
      maxActionsPerSession = 100,
      maxPagesPerSession = 20,
      enableScreenshots = true,
      enableVideoRecording = false,
      domains = [],
      allowedActions = Object.values(ActionType),
      safetyConstraints = {}
    } = req.body;

    // Validate required parameters
    if (!startUrl) {
      res.status(400).json({
        success: false,
        error: 'startUrl is required'
      });
      return;
    }

    // Validate URL format
    try {
      new URL(startUrl);
    } catch {
      res.status(400).json({
        success: false,
        error: 'Invalid URL format'
      });
      return;
    }

    // Create exploration configuration
    const config: ExplorationConfig = {
      maxSessionDuration,
      maxActionsPerSession,
      maxPagesPerSession,
      enableScreenshots,
      enableVideoRecording,
      explorationStrategy: strategy,
      rewardWeights: {
        noveltyReward: 0.3,
        coverageReward: 0.2,
        diversityReward: 0.1,
        informationGainReward: 0.1,
        taskProgressReward: 0.1,
        goalCompletionReward: 0.1,
        efficiencyReward: 0.1
      },
      safetyConstraints: {
        respectRobotsTxt: true,
        maxRequestsPerMinute: 30,
        avoidDestructiveActions: true,
        stayWithinDomain: domains.length > 0,
        avoidSensitivePages: ['/admin', '/delete', '/cancel'],
        maxFormSubmissions: 5,
        requireConfirmationFor: [ActionType.SUBMIT_FORM, ActionType.DOWNLOAD_FILE],
        ...safetyConstraints
      },
      domains,
      allowedActions
    };

    // Start exploration session
    const sessionId = await explorationRLService.startExplorationSession(startUrl, config);

    logger.info('Exploration session started via API', {
      sessionId,
      startUrl,
      strategy,
      requestIp: req.ip
    });

    res.status(201).json({
      success: true,
      data: {
        sessionId,
        startUrl,
        config,
        message: 'Exploration session started successfully'
      }
    });
  } catch (error: any) {
    logger.error('Failed to start exploration session via API', {
      error: error.message,
      stack: error.stack,
      requestBody: req.body
    });

    res.status(500).json({
      success: false,
      error: 'Failed to start exploration session',
      details: error.message
    });
  }
});

/**
 * POST /api/exploration/:sessionId/step
 * Perform one exploration step
 */
router.post('/:sessionId/step', async (req, res): Promise<void> => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      res.status(400).json({
        success: false,
        error: 'sessionId is required'
      });
      return;
    }

    // Perform exploration step
    const result = await explorationRLService.exploreStep(sessionId);

    logger.info('Exploration step completed via API', {
      sessionId,
      actionType: result.action.type,
      reward: result.reward.totalReward,
      done: result.done
    });

    res.status(200).json({
      success: true,
      data: {
        sessionId,
        action: {
          type: result.action.type,
          target: result.action.target ? {
            id: result.action.target.id,
            tagName: result.action.target.tagName,
            text: result.action.target.text,
            selector: result.action.target.selector
          } : null,
          coordinates: result.action.coordinates,
          value: result.action.value,
          success: result.action.success,
          errorMessage: result.action.errorMessage,
          timestamp: result.action.timestamp,
          duration: result.action.duration
        },
        newState: {
          url: result.newState.url,
          domain: result.newState.domain,
          pageType: result.newState.pageType,
          elementCount: result.newState.domSnapshot.elements.length,
          formsCount: result.newState.domSnapshot.forms.length,
          linksCount: result.newState.domSnapshot.links.length
        },
        reward: result.reward,
        done: result.done,
        meta: {
          totalActions: result.newState.actionHistory.length + 1,
          pagesExplored: result.newState.pagesExplored,
          sessionDuration: result.newState.currentSessionDuration
        }
      }
    });
  } catch (error: any) {
    logger.error('Failed to perform exploration step via API', {
      sessionId: req.params.sessionId,
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      error: 'Failed to perform exploration step',
      details: error.message
    });
  }
});

/**
 * POST /api/exploration/:sessionId/auto
 * Run autonomous exploration for specified duration or steps
 */
router.post('/:sessionId/auto', async (req, res): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const {
      maxSteps = 50,
      maxDuration = 120000, // 2 minutes default
      stopOnError = true
    } = req.body;

    if (!sessionId) {
      res.status(400).json({
        success: false,
        error: 'sessionId is required'
      });
      return;
    }

    const startTime = Date.now();
    const results = [];
    let stepCount = 0;
    let totalReward = 0;

    logger.info('Starting autonomous exploration', {
      sessionId,
      maxSteps,
      maxDuration
    });

    // Run exploration loop
    while (stepCount < maxSteps && (Date.now() - startTime) < maxDuration) {
      try {
        const result = await explorationRLService.exploreStep(sessionId);

        const stepData = {
          step: stepCount + 1,
          action: result.action.type,
          reward: result.reward.totalReward,
          success: result.action.success,
          url: result.newState.url,
          pageType: result.newState.pageType
        };

        results.push(stepData);

        // Broadcast real-time update via WebSocket
        const wsManager = WebSocketManager.getInstance();
        if (wsManager) {
          wsManager.broadcastToRoom(`exploration_${sessionId}`, {
            type: 'exploration_step',
            payload: {
              sessionId,
              step: stepData,
              totalSteps: stepCount + 1,
              totalReward: totalReward + result.reward.totalReward,
              done: result.done
            }
          });
        }

        totalReward += result.reward.totalReward;
        stepCount++;

        // Check if session is done
        if (result.done) {
          logger.info('Exploration session completed naturally', { sessionId, stepCount });
          break;
        }

        // Stop on error if requested
        if (stopOnError && !result.action.success) {
          logger.info('Stopping exploration due to error', {
            sessionId,
            stepCount,
            error: result.action.errorMessage
          });
          break;
        }

        // Small delay between steps
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (stepError: any) {
        logger.error('Error during exploration step', {
          sessionId,
          stepCount,
          error: stepError.message
        });

        if (stopOnError) {
          break;
        }
      }
    }

    const duration = Date.now() - startTime;

    logger.info('Autonomous exploration completed', {
      sessionId,
      stepsCompleted: stepCount,
      duration,
      totalReward,
      averageReward: totalReward / Math.max(stepCount, 1)
    });

    res.status(200).json({
      success: true,
      data: {
        sessionId,
        summary: {
          stepsCompleted: stepCount,
          duration,
          totalReward,
          averageReward: totalReward / Math.max(stepCount, 1),
          successRate: results.filter(r => r.success).length / Math.max(stepCount, 1)
        },
        results,
        message: 'Autonomous exploration completed'
      }
    });
  } catch (error: any) {
    logger.error('Failed to run autonomous exploration via API', {
      sessionId: req.params.sessionId,
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      error: 'Failed to run autonomous exploration',
      details: error.message
    });
  }
});

/**
 * GET /api/exploration/:sessionId/stats
 * Get exploration session statistics
 */
router.get('/:sessionId/stats', async (req, res): Promise<void> => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      res.status(400).json({
        success: false,
        error: 'sessionId is required'
      });
      return;
    }

    const stats = explorationRLService.getSessionStats(sessionId);

    if (!stats) {
      res.status(404).json({
        success: false,
        error: 'Exploration session not found'
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    logger.error('Failed to get exploration stats via API', {
      sessionId: req.params.sessionId,
      error: error.message
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get exploration statistics',
      details: error.message
    });
  }
});

/**
 * DELETE /api/exploration/:sessionId
 * End exploration session
 */
router.delete('/:sessionId', async (req, res): Promise<void> => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      res.status(400).json({
        success: false,
        error: 'sessionId is required'
      });
      return;
    }

    const session = await explorationRLService.endExplorationSession(sessionId);

    logger.info('Exploration session ended via API', {
      sessionId,
      duration: session.duration,
      totalActions: session.actions.length,
      totalReward: session.totalReward
    });

    res.status(200).json({
      success: true,
      data: {
        sessionId,
        summary: {
          duration: session.duration,
          totalActions: session.actions.length,
          totalReward: session.totalReward,
          pagesExplored: session.pagesExplored,
          successRate: session.successfulActions / (session.successfulActions + session.failedActions)
        },
        message: 'Exploration session ended successfully'
      }
    });
  } catch (error: any) {
    logger.error('Failed to end exploration session via API', {
      sessionId: req.params.sessionId,
      error: error.message
    });

    res.status(500).json({
      success: false,
      error: 'Failed to end exploration session',
      details: error.message
    });
  }
});

/**
 * GET /api/exploration/strategies
 * Get available exploration strategies
 */
router.get('/strategies', (req, res): void => {
  const strategies = Object.values(ExplorationStrategy).map(strategy => ({
    value: strategy,
    label: strategy.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    description: getStrategyDescription(strategy)
  }));

  res.status(200).json({
    success: true,
    data: strategies
  });
});

/**
 * GET /api/exploration/action-types
 * Get available action types
 */
router.get('/action-types', (req, res): void => {
  const actionTypes = Object.values(ActionType).map(actionType => ({
    value: actionType,
    label: actionType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    description: getActionTypeDescription(actionType)
  }));

  res.status(200).json({
    success: true,
    data: actionTypes
  });
});

/**
 * POST /api/exploration/batch
 * Start multiple exploration sessions in parallel
 */
router.post('/batch', async (req, res): Promise<void> => {
  try {
    const { sessions, maxConcurrent = 3 } = req.body;

    if (!Array.isArray(sessions) || sessions.length === 0) {
      res.status(400).json({
        success: false,
        error: 'sessions array is required'
      });
      return;
    }

    const results = [];
    const batches = [];

    // Split into batches
    for (let i = 0; i < sessions.length; i += maxConcurrent) {
      batches.push(sessions.slice(i, i + maxConcurrent));
    }

    // Process batches sequentially
    for (const batch of batches) {
      const batchPromises = batch.map(async (sessionConfig) => {
        try {
          const sessionId = await explorationRLService.startExplorationSession(
            sessionConfig.startUrl,
            sessionConfig.config || {}
          );
          return { success: true, sessionId, startUrl: sessionConfig.startUrl };
        } catch (error: any) {
          return { success: false, error: error.message, startUrl: sessionConfig.startUrl };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const successCount = results.filter(r => r.success).length;

    logger.info('Batch exploration sessions started', {
      totalSessions: sessions.length,
      successCount,
      failureCount: sessions.length - successCount
    });

    res.status(200).json({
      success: true,
      data: {
        totalSessions: sessions.length,
        successCount,
        failureCount: sessions.length - successCount,
        results
      }
    });
  } catch (error: any) {
    logger.error('Failed to start batch exploration sessions', {
      error: error.message,
      requestBody: req.body
    });

    res.status(500).json({
      success: false,
      error: 'Failed to start batch exploration sessions',
      details: error.message
    });
  }
});

// Helper functions
function getStrategyDescription(strategy: ExplorationStrategy): string {
  switch (strategy) {
    case ExplorationStrategy.RANDOM:
      return 'Randomly selects actions from available options';
    case ExplorationStrategy.CURIOSITY_DRIVEN:
      return 'Prioritizes novel elements and unexplored areas';
    case ExplorationStrategy.TASK_ORIENTED:
      return 'Infers and pursues potential user tasks';
    case ExplorationStrategy.COVERAGE_MAXIMIZING:
      return 'Maximizes breadth of website exploration';
    case ExplorationStrategy.EFFICIENCY_FOCUSED:
      return 'Balances exploration with action efficiency';
    case ExplorationStrategy.HYBRID:
      return 'Combines multiple strategies adaptively';
    default:
      return 'No description available';
  }
}

function getActionTypeDescription(actionType: ActionType): string {
  switch (actionType) {
    case ActionType.CLICK:
      return 'Click on interactive elements';
    case ActionType.TYPE:
      return 'Type text into input fields';
    case ActionType.SCROLL:
      return 'Scroll page in different directions';
    case ActionType.HOVER:
      return 'Hover over elements to reveal content';
    case ActionType.NAVIGATE:
      return 'Navigate to different URLs';
    case ActionType.WAIT:
      return 'Wait for specified duration';
    case ActionType.SCREENSHOT:
      return 'Capture screenshot of current state';
    case ActionType.EXTRACT_DATA:
      return 'Extract data from page elements';
    default:
      return 'No description available';
  }
}

export default router;