/**
 * Simplified Exploration Routes
 * Single focused approach with minimized HTML exploration
 */

import express from 'express';
import { simplifiedRLExploration } from '../services/SimplifiedRLExploration';
import { logger } from '../utils/logger';
import { WebSocketManager } from '../services/WebSocketManager';

const router = express.Router();

/**
 * POST /api/simplified-exploration/start
 * Start a new simplified exploration session
 */
router.post('/start', async (req, res): Promise<void> => {
  try {
    const { startUrl } = req.body;

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

    const sessionId = await simplifiedRLExploration.startSession(startUrl);

    logger.info('Simplified exploration session started', {
      sessionId,
      startUrl
    });

    res.status(201).json({
      success: true,
      data: {
        sessionId,
        startUrl,
        message: 'Simplified exploration session started successfully'
      }
    });
  } catch (error: any) {
    logger.error('Failed to start simplified exploration', {
      error: error.message
    });

    res.status(500).json({
      success: false,
      error: 'Failed to start exploration session',
      details: error.message
    });
  }
});

/**
 * POST /api/simplified-exploration/:sessionId/step
 * Perform one exploration step
 */
router.post('/:sessionId/step', async (req, res): Promise<void> => {
  try {
    const { sessionId } = req.params;

    const result = await simplifiedRLExploration.exploreStep(sessionId);

    logger.info('Exploration step completed', {
      sessionId,
      actionType: result.action.type,
      success: result.action.success,
      url: result.newState.url
    });

    res.status(200).json({
      success: true,
      data: {
        sessionId,
        action: {
          type: result.action.type,
          success: result.action.success,
          elementText: result.action.element?.text?.substring(0, 50)
        },
        newState: {
          url: result.newState.url,
          elementCount: result.newState.elements.length
        },
        done: result.done
      }
    });
  } catch (error: any) {
    logger.error('Failed to perform exploration step', {
      sessionId: req.params.sessionId,
      error: error.message
    });

    res.status(500).json({
      success: false,
      error: 'Failed to perform exploration step',
      details: error.message
    });
  }
});

/**
 * POST /api/simplified-exploration/:sessionId/auto
 * Run autonomous exploration
 */
router.post('/:sessionId/auto', async (req, res): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const { maxSteps = 50 } = req.body;

    const results = [];
    let done = false;
    let stepCount = 0;

    logger.info('Starting autonomous exploration', {
      sessionId,
      maxSteps
    });

    // Run exploration loop
    while (!done && stepCount < maxSteps) {
      try {
        const result = await simplifiedRLExploration.exploreStep(sessionId);

        const stepData = {
          step: stepCount + 1,
          action: result.action.type,
          success: result.action.success,
          url: result.newState.url,
          elements: result.newState.elements.length,
          // Include element details for click and type actions
          elementDetails: result.action.element ? {
            selector: result.action.selector,
            tagName: result.action.element.tagName,
            text: result.action.element.text?.substring(0, 50),
            href: result.action.element.href,
            label: result.action.element.label,
            ariaLabel: result.action.element.ariaLabel,
            type: result.action.element.type
          } : null,
          scrollDirection: result.action.value // For scroll actions
        };

        results.push(stepData);

        // Broadcast update via WebSocket
        const wsManager = WebSocketManager.getInstance();
        if (wsManager) {
          wsManager.broadcastToRoom(`exploration_${sessionId}`, {
            type: 'exploration_step',
            payload: {
              sessionId,
              step: stepData,
              totalSteps: stepCount + 1,
              done: result.done
            }
          });
        }

        done = result.done;
        stepCount++;

        // Small delay between steps
        await new Promise(resolve => setTimeout(resolve, 1500));

      } catch (stepError: any) {
        logger.error('Error during exploration step', {
          sessionId,
          stepCount,
          error: stepError.message
        });
        break;
      }
    }

    const stats = simplifiedRLExploration.getSessionStats(sessionId);

    logger.info('Autonomous exploration completed', {
      sessionId,
      stepsCompleted: stepCount,
      stats
    });

    res.status(200).json({
      success: true,
      data: {
        sessionId,
        summary: {
          stepsCompleted: stepCount,
          ...stats
        },
        results,
        message: 'Autonomous exploration completed'
      }
    });
  } catch (error: any) {
    logger.error('Failed to run autonomous exploration', {
      sessionId: req.params.sessionId,
      error: error.message
    });

    res.status(500).json({
      success: false,
      error: 'Failed to run autonomous exploration',
      details: error.message
    });
  }
});

/**
 * GET /api/simplified-exploration/:sessionId/stats
 * Get session statistics
 */
router.get('/:sessionId/stats', async (req, res): Promise<void> => {
  try {
    const { sessionId } = req.params;

    const stats = simplifiedRLExploration.getSessionStats(sessionId);

    if (!stats) {
      res.status(404).json({
        success: false,
        error: 'Session not found'
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    logger.error('Failed to get session stats', {
      sessionId: req.params.sessionId,
      error: error.message
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get session statistics',
      details: error.message
    });
  }
});

/**
 * DELETE /api/simplified-exploration/:sessionId
 * End exploration session
 */
router.delete('/:sessionId', async (req, res): Promise<void> => {
  try {
    const { sessionId } = req.params;

    await simplifiedRLExploration.endSession(sessionId);

    logger.info('Session ended', { sessionId });

    res.status(200).json({
      success: true,
      data: {
        sessionId,
        message: 'Session ended successfully'
      }
    });
  } catch (error: any) {
    logger.error('Failed to end session', {
      sessionId: req.params.sessionId,
      error: error.message
    });

    res.status(500).json({
      success: false,
      error: 'Failed to end session',
      details: error.message
    });
  }
});

export default router;