/**
 * Enhanced ChromeDriver Service for RL-based Web Exploration
 * Extends the existing ChromeDriverService with multi-modal state capture,
 * action recording, and exploration capabilities for reinforcement learning
 */

import { WebDriver, By, WebElement, until, Key } from 'selenium-webdriver';
import { logger } from '../utils/logger';
import { multiModalStateCaptureService } from './StateCapture/MultiModalStateCaptureService';
import {
  ExplorationState,
  ExplorationSession,
  ActionData,
  ActionType,
  RewardComponents,
  ExplorationConfig,
  ExplorationStrategy,
  Trajectory,
  Experience,
  InteractiveElement,
  SafetyConstraints
} from '../types/exploration';
import { chromeDriverService, BrowserSession } from './ChromeDriverService';
import { SmartActionSelector, ElementCategory } from './SmartActionSelector';
import { PageContextAnalyzer, PageType } from './PageContextAnalyzer';
import { ImportantElementFilter, FilteredElement } from './ImportantElementFilter';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { NoveltyEstimator } from '../rl/NoveltyEstimator';
import { OptionScheduler } from '../rl/OptionScheduler';
import { OptionContext } from '../rl/Options';
import { RND } from '../rl/RND';
import { settingsService } from './SettingsService';
import { FrontierManager } from '../rl/FrontierManager';
import { WebSocketManager } from './WebSocketManager';

export class ExplorationRLService {
  private explorationDataDir: string;
  private sessionsMap: Map<string, ExplorationSession> = new Map();
  private browserSessionMap: Map<string, string> = new Map(); // Maps exploration session ID to browser session ID
  private clickedElementsMap: Map<string, Map<string, Set<string>>> = new Map(); // SessionId -> URL -> Set of element identifiers
  private rewardCalculator: RewardCalculator;
  private actionExecutor: ActionExecutor;
  private safetyValidator: SafetyValidator;
  private noveltyEstimator: NoveltyEstimator;
  private optionScheduler: OptionScheduler;
  private frontier: FrontierManager;
  private rnd: RND | null = null;
  private epsilon = 0.15;
  private noveltyBlend = 0.3;
  private noveltyLowThreshold = 0.4;
  private pendingBacktrack: Map<string, string> = new Map();

  constructor() {
    this.explorationDataDir = path.join(process.cwd(), 'exploration_data');
    this.ensureDirectories();
    this.rewardCalculator = new RewardCalculator();
    this.actionExecutor = new ActionExecutor();
    this.safetyValidator = new SafetyValidator();
    this.noveltyEstimator = new NoveltyEstimator('exploration');
    this.loadSettingsSync();
    this.optionScheduler = new OptionScheduler(this.noveltyEstimator, this.epsilon);
    this.frontier = new FrontierManager();
  }

  private loadSettingsSync() {
    try {
      // Synchronous read via settingsService (uses fs sync internally)
      const s: any = (settingsService as any).getDefaultSettings ? null : null; // noop to keep types
    } catch {}
  }

  private async applyRuntimeSettings() {
    try {
      const s = await settingsService.loadSettings();
      const ex = s.exploration || {};
      this.epsilon = ex.epsilon ?? this.epsilon;
      this.noveltyBlend = ex.noveltyBlend ?? this.noveltyBlend;
      this.noveltyLowThreshold = ex.noveltyLowThreshold ?? this.noveltyLowThreshold;
      if (this.optionScheduler) {
        // recreate to apply epsilon
        this.optionScheduler = new OptionScheduler(this.noveltyEstimator, this.epsilon);
      }
      const rndCfg = ex.rnd || {};
      const enabled = rndCfg.enabled ?? true;
      this.rnd = enabled ? new RND({ inDim: rndCfg.inDim ?? 256, outDim: rndCfg.outDim ?? 64, lr: rndCfg.lr ?? 0.001, enabled }) : null;
    } catch {}
  }

  private ensureDirectories(): void {
    const dirs = [
      this.explorationDataDir,
      path.join(this.explorationDataDir, 'sessions'),
      path.join(this.explorationDataDir, 'trajectories'),
      path.join(this.explorationDataDir, 'experiences'),
      path.join(this.explorationDataDir, 'models')
    ];

    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Start a new exploration session
   */
  async startExplorationSession(
    startUrl: string,
    config: ExplorationConfig
  ): Promise<string> {
    try {
      await this.applyRuntimeSettings();
      const sessionId = uuidv4();
      logger.info('Starting exploration session', { sessionId, startUrl });

      // Create browser session with RL-optimized settings
      const browserSessionId = await chromeDriverService.createBrowserSession({
        headless: config.enableScreenshots ? false : true, // Keep visible for screenshot quality
        timeout: config.maxSessionDuration,
        viewport: { width: 1280, height: 720 },
        enableSecurity: true,
        enableScreenshots: config.enableScreenshots,
        enableVideo: config.enableVideoRecording
      });

      // Navigate to start URL
      await chromeDriverService.navigateToUrl(browserSessionId, startUrl);

      // Set up session mapping first
      this.browserSessionMap.set(sessionId, browserSessionId);

      // Capture initial state
      const driver = this.getDriverFromSession(sessionId);
      const initialState = await multiModalStateCaptureService.captureState(driver, sessionId);

      // Seed novelty and frontier with initial state
      try {
        const novelty = this.computeNovelty(initialState);
        this.frontier.consider(initialState, novelty, 0);
        this.noveltyEstimator.observe(initialState);
        this.frontier.markVisited(initialState);
      } catch {}

      // Create exploration session
      const session: ExplorationSession = {
        id: sessionId,
        startUrl,
        startTime: new Date(),
        states: [initialState],
        actions: [],
        rewards: [],
        totalReward: 0,
        pagesExplored: 1,
        uniqueDomainsVisited: 1,
        successfulActions: 0,
        failedActions: 0,
        trajectories: [],
        experiences: [],
        userAgent: await driver.executeScript('return navigator.userAgent') as string,
        viewport: { width: 1280, height: 720 },
        sessionConfig: config
      };

      this.sessionsMap.set(sessionId, session);

      logger.info('Exploration session started successfully', {
        sessionId,
        browserSessionId,
        initialPageType: initialState.pageType
      });

      return sessionId;
    } catch (error: any) {
      logger.error('Failed to start exploration session', {
        startUrl,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Perform autonomous exploration step
   */
  async exploreStep(sessionId: string): Promise<{
    action: ActionData;
    newState: ExplorationState;
    reward: RewardComponents;
    done: boolean;
  }> {
    try {
      const session = this.sessionsMap.get(sessionId);
      if (!session) {
        throw new Error(`Exploration session ${sessionId} not found`);
      }

      const currentState = session.states[session.states.length - 1];
      const driver = this.getDriverFromSession(sessionId);

      // Handle pending backtrack request (forced NAVIGATE)
      let action: ActionData;
      const backtrackUrl = this.pendingBacktrack.get(sessionId);
      if (backtrackUrl) {
        action = {
          type: ActionType.NAVIGATE,
          value: backtrackUrl,
          timestamp: new Date(),
          duration: 0,
          success: true,
        } as any;
        this.pendingBacktrack.delete(sessionId);
      } else {
        // Select action based on exploration strategy
        action = await this.selectAction(currentState, session.sessionConfig, sessionId);
      }

      // Log the selected action with full details
      logger.info('Selected action for exploration', {
        sessionId,
        actionType: action.type,
        targetElement: action.target ? {
          selector: action.target.selector,
          text: action.target.text?.substring(0, 50),
          tagName: action.target.tagName,
          className: (action.target as any).className
        } : null,
        url: currentState.url,
        pageType: currentState.pageType
      });

      // Validate action safety
      const isSafe = await this.safetyValidator.validateAction(action, currentState);
      if (!isSafe) {
        logger.warn('Unsafe action blocked', { sessionId, action: action.type });
        action.success = false;
        action.errorMessage = 'Action blocked by safety validator';
      } else {
        // Execute action
        await this.actionExecutor.executeAction(driver, action);

        // If action was successful and it was a click, record the clicked element
        if (action.success && action.type === ActionType.CLICK && action.target) {
          this.recordClickedElement(sessionId, currentState.url, action.target);
        }
      }

      // Capture new state after action
      const newState = await multiModalStateCaptureService.captureState(driver, sessionId);

      // Update novelty/frontier with new state observation
      try {
        const novelty = this.computeNovelty(newState);
        this.frontier.consider(newState, novelty, session.actions.length);
        this.noveltyEstimator.observe(newState);
        this.frontier.markVisited(newState);
      } catch {}

      // Calculate reward
      const reward = this.rewardCalculator.calculateReward(
        currentState,
        action,
        newState,
        session
      );

      // Update session
      session.actions.push(action);
      session.states.push(newState);
      session.rewards.push(reward);
      session.totalReward += reward.totalReward;

      if (action.success) {
        session.successfulActions++;
      } else {
        session.failedActions++;
      }

      // Check if session should end
      const done = this.shouldEndSession(session);

      // Create experience for RL training
      const experience: Experience = {
        state: currentState,
        action,
        reward: reward.totalReward,
        nextState: newState,
        done,
        value: 0, // Will be computed by value function
        advantage: 0, // Will be computed during training
        logProbability: 0 // Will be set by policy network
      };

      session.experiences.push(experience);

      // Save session data periodically
      if (session.actions.length % 10 === 0) {
        await this.saveSessionData(session);
      }

      logger.info('Exploration step completed', {
        sessionId,
        actionType: action.type,
        reward: reward.totalReward,
        newPageType: newState.pageType,
        totalActions: session.actions.length
      });

      // WebSocket live updates for core exploration
      try {
        const ws = WebSocketManager.getInstance();
        if (ws) {
          const room = `exploration_${sessionId}`;
          // Step timeline: novelty and reward
          ws.broadcastToRoom(room, {
            type: 'core_step',
            payload: {
              sessionId,
              step: {
                index: session.actions.length,
                actionType: action.type,
                success: action.success,
                url: newState.url,
                reward: reward.totalReward,
                totalReward: session.totalReward,
                novelty: this.computeNovelty(newState)
              }
            }
          });

          // Metrics snapshot
          const metrics = this.getSessionMetrics(sessionId);
          ws.broadcastToRoom(room, {
            type: 'core_metrics',
            payload: { sessionId, metrics }
          });

          // Frontier snapshot (same-domain)
          const snapshot = (this.frontier as any).snapshot?.() || [];
          const domain = new URL(newState.url).hostname;
          const frontier = snapshot.filter((e: any) => e.domain === domain).slice(0, 50);
          ws.broadcastToRoom(room, {
            type: 'core_frontier',
            payload: { sessionId, frontier }
          });
        }
      } catch {}

      return { action, newState, reward, done };
    } catch (error: any) {
      logger.error('Failed to perform exploration step', {
        sessionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Request a backtrack; next exploreStep will navigate to URL or best frontier candidate.
   */
  requestBacktrack(sessionId: string, url?: string): string | null {
    const session = this.sessionsMap.get(sessionId);
    if (!session) return null;
    if (!url) {
      // pick best candidate from same domain
      const visited = new Set(session.states.map(s => s.url.split('#')[0].split('?')[0]));
      const candidate = this.frontier.nextCandidate(session.states[session.states.length - 1].url, visited);
      if (!candidate) return null;
      this.pendingBacktrack.set(sessionId, candidate);
      return candidate;
    }
    this.pendingBacktrack.set(sessionId, url);
    return url;
  }

  /**
   * Select next action based on exploration strategy
   */
  private async selectAction(
    state: ExplorationState,
    config: ExplorationConfig,
    sessionId: string
  ): Promise<ActionData> {
    const startTime = Date.now();

    let selectedAction: ActionData;

    switch (config.explorationStrategy) {
      case ExplorationStrategy.RANDOM:
        selectedAction = await this.selectRandomAction(state, sessionId);
        break;

      case ExplorationStrategy.CURIOSITY_DRIVEN:
        selectedAction = await this.selectCuriosityDrivenAction(state, sessionId);
        break;

      case ExplorationStrategy.TASK_ORIENTED:
        selectedAction = await this.selectTaskOrientedAction(state, sessionId);
        break;

      case ExplorationStrategy.COVERAGE_MAXIMIZING:
        selectedAction = await this.selectCoverageMaximizingAction(state, sessionId);
        break;

      default:
        selectedAction = await this.selectRandomAction(state, sessionId);
    }

    selectedAction.timestamp = new Date();
    selectedAction.duration = Date.now() - startTime;

    return selectedAction;
  }

  /**
   * Random action selection (improved with SmartActionSelector)
   */
  private async selectRandomAction(state: ExplorationState, sessionId: string): Promise<ActionData> {
    // Use SmartActionSelector to get better action choices
    const smartAction = SmartActionSelector.selectSmartAction(
      state.domSnapshot.elements,
      state.actionHistory
    );

    if (!smartAction) {
      // No suitable elements found, try scrolling
      logger.debug('No interactive elements found, scrolling down');
      return {
        type: ActionType.SCROLL,
        coordinates: { x: 640, y: 360 },
        value: 'down',
        timestamp: new Date(),
        duration: 0,
        success: true
      };
    }

    // Log action distribution for debugging
    const distribution = SmartActionSelector.getActionDistribution(state.domSnapshot.elements);
    logger.debug('Page element distribution', {
      distribution: Array.from(distribution.entries())
    });

    // Convert recommended action to ActionType
    let actionType: ActionType;
    switch (smartAction.recommendedAction) {
      case 'type':
      case 'clear_and_type':
        actionType = ActionType.TYPE;
        break;
      case 'click':
      case 'submit':
      case 'toggle':
      case 'check':
        actionType = ActionType.CLICK;
        break;
      case 'hover':
        actionType = ActionType.HOVER;
        break;
      case 'scroll_to':
        actionType = ActionType.SCROLL;
        break;
      default:
        actionType = ActionType.CLICK;
    }

    const action: ActionData = {
      type: actionType,
      target: smartAction.element,
      coordinates: {
        x: smartAction.element.boundingBox?.centerX || 0,
        y: smartAction.element.boundingBox?.centerY || 0
      },
      value: smartAction.value,
      timestamp: new Date(),
      duration: 0,
      success: true
    };

    logger.debug('Smart action selected', {
      category: smartAction.category,
      action: smartAction.recommendedAction,
      priority: smartAction.priority,
      element: smartAction.element.selector
    });

    return action;
  }

  /**
   * Curiosity-driven action selection (prioritizes novel elements/pages)
   * Fixed to detect ping-ponging between URLs
   */
  private async selectCuriosityDrivenAction(state: ExplorationState, sessionId: string): Promise<ActionData> {
    // Frontier backtracking if stuck (Go-Explore style)
    try {
      const session = this.sessionsMap.get(sessionId);
      if (session) {
        const recentUrls = session.states.slice(-8).map(s => s.url.split('#')[0].split('?')[0]);
        const uniq = new Set(recentUrls);
        const isPingPonging = recentUrls.length >= 6 && uniq.size <= 2;
        const noveltyNow = this.computeNovelty(state);
        const lowNovelty = noveltyNow < 0.4;
        if (isPingPonging || lowNovelty) {
          const visited = new Set(session.states.map(s => s.url.split('#')[0].split('?')[0]));
          const nextUrl = this.frontier.nextCandidate(state.url, visited);
          if (nextUrl && nextUrl !== state.url) {
            logger.info('Frontier backtracking to explore new branch', { from: state.url, to: nextUrl, reason: isPingPonging ? 'ping_pong' : 'low_novelty' });
            return {
              type: ActionType.NAVIGATE,
              value: nextUrl,
              timestamp: new Date(),
              duration: 0,
              success: true
            } as any;
          }
        }
      }
    } catch {}

    // First, try hierarchical option-based policy with novelty bonus
    try {
      const session = Array.from(this.sessionsMap.values()).find(s => s.states.includes(state));
      const recentUrls = session ? session.states.slice(-10).map(s => s.url) : [];
      const clickedSet = new Set<string>();
      if (session) {
        const urlKey = (state.url || '').split('#')[0].split('?')[0];
        const clickedOnPage = (this.clickedElementsMap.get(session.id)?.get(urlKey)) || new Set<string>();
        clickedOnPage.forEach(x => clickedSet.add(x));
      }

      const ctx: OptionContext = {
        recentUrls,
        visitedUrls: new Set((session?.states || []).map(s => s.url.split('#')[0].split('?')[0])),
        clickedSelectorsOnPage: clickedSet,
      };

      const proposed = this.optionScheduler.proposeAction(state, ctx);
      if (proposed) {
        return proposed;
      }
    } catch {}

    // Fallback to existing page-context guided heuristics
    // Analyze page context
    const pageContext = PageContextAnalyzer.analyzePageContext(
      state.url,
      state.domSnapshot.elements,
      undefined
    );

    logger.debug('Page context for curiosity-driven exploration', {
      pageType: pageContext.type,
      confidence: pageContext.confidence,
      currentUrl: state.url
    });

    // Get session to access all states for URL history
    const sessionIdFromState = Array.from(this.sessionsMap.keys()).find(id =>
      this.sessionsMap.get(id)?.states.includes(state)
    );
    const session = sessionIdFromState ? this.sessionsMap.get(sessionIdFromState) : null;

    // Track URL + action combinations to avoid repeating failed actions
    const urlActionHistory = new Map<string, Set<string>>();
    const failedUrlActions = new Map<string, Set<string>>();
    let consecutiveFailuresOnPage = 0;

    // Track URL visit patterns to detect loops
    const recentUrls: string[] = [];
    const urlVisitCount = new Map<string, number>();

    // Build URL history from session states
    if (session) {
      session.states.forEach((s: ExplorationState, idx: number) => {
        const urlKey = s.url.split('#')[0].split('?')[0]; // Remove hash and query params
        recentUrls.push(urlKey);
        urlVisitCount.set(urlKey, (urlVisitCount.get(urlKey) || 0) + 1);
      });
    }

    // Analyze action history for patterns with proper URL tracking
    state.actionHistory.forEach((action, index) => {
      // Try to get URL from corresponding state in session
      let actionUrl = state.url;
      if (session && session.states[index]) {
        actionUrl = session.states[index].url;
      }

      // Track what actions have been tried on each URL
      const urlKey = actionUrl.split('#')[0].split('?')[0]; // Remove hash and query params
      if (!urlActionHistory.has(urlKey)) {
        urlActionHistory.set(urlKey, new Set());
      }

      // Track action type on this URL
      const actionKey = `${action.type}_${action.target?.selector || ''}`;
      urlActionHistory.get(urlKey)!.add(actionKey);

      // Track failed actions on specific URLs
      if (!action.success) {
        if (!failedUrlActions.has(urlKey)) {
          failedUrlActions.set(urlKey, new Set());
        }
        failedUrlActions.get(urlKey)!.add(action.type);

        // Count consecutive failures on current page
        if (urlKey === state.url.split('#')[0].split('?')[0] && index === state.actionHistory.length - 1) {
          consecutiveFailuresOnPage++;
        }
      } else {
        if (urlKey === state.url.split('#')[0].split('?')[0]) {
          consecutiveFailuresOnPage = 0; // Reset on success
        }
      }
    });

    // Track recent URL visits to detect ping-ponging
    const currentUrlKey = state.url.split('#')[0].split('?')[0];

    // Count how many times we've visited current URL
    const currentUrlVisits = urlVisitCount.get(currentUrlKey) || 0;

    // Check if we're ping-ponging between 2-3 URLs (look at last 8 URLs)
    const recentUrlsSlice = recentUrls.slice(-8);
    const uniqueRecentUrls = new Set(recentUrlsSlice);
    const isPingPonging = recentUrlsSlice.length >= 6 && uniqueRecentUrls.size <= 2;

    // Check if we've visited this URL too many times
    const isStuckOnUrl = currentUrlVisits > 2 ||
                         (urlActionHistory.get(currentUrlKey)?.size || 0) > 4;

    const failedActionsOnCurrentPage = failedUrlActions.get(currentUrlKey) || new Set();

    // If we have too many failures OR we're stuck in a loop, try to navigate away
    if (consecutiveFailuresOnPage >= 3 || failedActionsOnCurrentPage.size >= 3 ||
        isPingPonging || isStuckOnUrl) {
      logger.info('Detected stuck exploration pattern, attempting to navigate away', {
        url: currentUrlKey,
        consecutiveFailures: consecutiveFailuresOnPage,
        failedActionTypes: Array.from(failedActionsOnCurrentPage),
        isPingPonging,
        isStuckOnUrl,
        currentUrlVisits,
        actionsTriedOnPage: urlActionHistory.get(currentUrlKey)?.size || 0
      });

      // Look for navigation elements to leave this page
      const navActions = SmartActionSelector.analyzePageElements(state.domSnapshot.elements)
        .filter(action =>
          action.category === ElementCategory.NAVIGATION ||
          action.category === ElementCategory.LINK ||
          (action.category === ElementCategory.BUTTON &&
           (action.element.text?.toLowerCase().includes('back') ||
            action.element.text?.toLowerCase().includes('home') ||
            action.element.text?.toLowerCase().includes('cancel')))
        );

      if (navActions.length > 0) {
        const navAction = navActions[Math.floor(Math.random() * Math.min(3, navActions.length))];
        logger.debug('Navigating away from problematic page', {
          targetText: navAction.element.text,
          category: navAction.category
        });

        return {
          type: this.mapRecommendedActionToType(navAction.recommendedAction),
          target: navAction.element,
          coordinates: {
            x: navAction.element.boundingBox?.centerX || 0,
            y: navAction.element.boundingBox?.centerY || 0
          },
          value: navAction.value,
          timestamp: new Date(),
          duration: 0,
          success: true
        };
      }
    }

    // Track element interactions with URL context
    const elementInteractionCounts = new Map<string, number>();
    state.actionHistory.forEach(action => {
      if (action.target) {
        // Include URL in the key to track per-page interactions
        const key = `${currentUrlKey}_${action.target.selector || ''}_${action.target.text || ''}_${action.target.tagName || ''}`;
        elementInteractionCounts.set(key, (elementInteractionCounts.get(key) || 0) + 1);
      }
    });

    // First filter to only important elements
    const importantElements = ImportantElementFilter.filterImportantElements(state.domSnapshot.elements);

    // Log the filtered elements for debugging
    ImportantElementFilter.logElementMapping(importantElements, state.url);

    // Get all categorized elements from the filtered set
    const allActions = SmartActionSelector.analyzePageElements(importantElements);

    logger.info('🔍 FILTERING ELEMENTS - Filtered element analysis', {
      totalOriginalElements: state.domSnapshot.elements.length,
      importantElements: importantElements.length,
      categorizedActions: allActions.length,
      url: state.url
    });

    // Score elements by curiosity value with URL-aware tracking
    const scoredActions = allActions.map(action => {
      // Check if this element was already clicked on this page
      const wasClicked = this.wasElementClicked(sessionId, state.url, action.element);

      // Create URL-specific identifier for this element
      const elementKey = `${currentUrlKey}_${action.element.selector || ''}_${action.element.text || ''}_${action.element.tagName || ''}`;
      const interactionCount = elementInteractionCounts.get(elementKey) || 0;

      let curiosityScore = action.priority;

      // STRONGLY penalize elements that were already clicked on this page
      if (wasClicked) {
        curiosityScore -= 100; // Very heavy penalty for already-clicked elements
        logger.debug('Element already clicked on this page, heavily penalizing', {
          element: action.element.selector,
          text: action.element.text?.substring(0, 30),
          url: currentUrlKey
        });
      }

      // Check if this action type has failed on this URL before
      const actionType = this.mapRecommendedActionToType(action.recommendedAction);
      if (failedActionsOnCurrentPage.has(actionType)) {
        curiosityScore -= 20; // Heavy penalty for action types that have failed on this page
        logger.debug('Penalizing action type that failed on this page', {
          actionType,
          url: currentUrlKey
        });
      }

      // Heavily penalize elements that have been interacted with multiple times on this page
      if (interactionCount > 0) {
        curiosityScore -= (interactionCount * 15); // Stronger penalty
      }

      // Boost score for elements that might lead to new pages (escape current page)
      if (consecutiveFailuresOnPage > 0) {
        if (action.category === ElementCategory.LINK ||
            action.category === ElementCategory.NAVIGATION) {
          curiosityScore += 10; // Strong boost to leave problematic page
        }
      }

      // Standard scoring adjustments
      if (action.category === ElementCategory.SEARCH) {
        curiosityScore += 5;
      }

      if (action.category === ElementCategory.MEDIA ||
          action.category === ElementCategory.SOCIAL) {
        curiosityScore -= 2;
      }

      // Consider page context
      if (pageContext.type === PageType.LOGIN) {
        // On login pages, avoid repeatedly trying to type if it's been failing
        if (action.recommendedAction === 'type' && failedActionsOnCurrentPage.has(ActionType.TYPE)) {
          curiosityScore -= 30; // Strong penalty for typing on login pages where it's been failing
        }
        // Prefer navigation away from login if we can't log in
        if (action.category === ElementCategory.NAVIGATION || action.category === ElementCategory.LINK) {
          curiosityScore += 8;
        }
      }

      // Add slight randomness
      curiosityScore += Math.random() * 1.5;

      return { ...action, curiosityScore, interactionCount, actionType };
    }).sort((a, b) => b.curiosityScore - a.curiosityScore);

    // Filter out elements that have been tried too many times on this specific page
    const viableActions = scoredActions.filter(action =>
      action.interactionCount < 2 && // Lower threshold per page
      action.curiosityScore > -10 // Don't select heavily penalized actions
    );

    if (viableActions.length === 0) {
      // No viable elements, try to go back or scroll
      logger.debug('No viable elements for exploration, attempting recovery action');

      // Try going back if we're stuck
      if (consecutiveFailuresOnPage > 2) {
        return {
          type: ActionType.GO_BACK,
          coordinates: { x: 0, y: 0 },
          timestamp: new Date(),
          duration: 0,
          success: true
        };
      }

      // Otherwise scroll to find new content
      return {
        type: ActionType.SCROLL,
        coordinates: { x: 640, y: 360 },
        value: 'down',
        timestamp: new Date(),
        duration: 0,
        success: true
      };
    }

    // Select with exploration-exploitation balance
    const selectedAction = Math.random() < 0.7
      ? viableActions[0]  // Exploit best option
      : viableActions[Math.floor(Math.random() * Math.min(5, viableActions.length))]; // Explore

    logger.debug('Curiosity-driven action selected', {
      category: selectedAction.category,
      curiosityScore: selectedAction.curiosityScore,
      interactionCount: selectedAction.interactionCount,
      actionType: selectedAction.actionType,
      totalViableActions: viableActions.length,
      url: currentUrlKey,
      consecutiveFailures: consecutiveFailuresOnPage
    });

    return {
      type: selectedAction.actionType,
      target: selectedAction.element,
      coordinates: {
        x: selectedAction.element.boundingBox?.centerX || 0,
        y: selectedAction.element.boundingBox?.centerY || 0
      },
      value: selectedAction.value,
      timestamp: new Date(),
      duration: 0,
      success: true
    };
  }

  private computeNovelty(state: ExplorationState): number {
    const countNovelty = this.noveltyEstimator.intrinsicReward(state); // 0..1
    const rndNovelty = this.rnd ? this.normalizeRND(this.rnd.intrinsic(state, true)) : 0; // positive
    const blend = Math.max(0, Math.min(1, this.noveltyBlend));
    return (1 - blend) * countNovelty + blend * rndNovelty;
  }

  private normalizeRND(err: number): number {
    // Map typical MSE to ~0..1 range; clamp
    // Assume err in [0, ~0.5] early on; compress via tanh-like mapping
    const x = err;
    const y = x / (0.25 + x); // smooth saturating
    return Math.max(0, Math.min(1, y));
  }

  /**
   * Task-oriented action selection (infers and pursues goals)
   */
  private async selectTaskOrientedAction(state: ExplorationState, sessionId: string): Promise<ActionData> {
    // Analyze page context to understand potential tasks
    const pageContext = PageContextAnalyzer.analyzePageContext(
      state.url,
      state.domSnapshot.elements,
      undefined
    );

    // Check for contextual action suggestions from PageContextAnalyzer
    const contextualAction = PageContextAnalyzer.suggestContextualAction(
      pageContext,
      state.actionHistory,
      state.domSnapshot.elements
    );

    if (contextualAction) {
      const actionType = this.mapRecommendedActionToType(contextualAction.action);

      logger.debug('Task-oriented contextual action selected', {
        action: contextualAction.action,
        pattern: contextualAction.pattern,
        pageType: pageContext.type
      });

      return {
        type: actionType,
        target: contextualAction.element,
        coordinates: {
          x: contextualAction.element.boundingBox?.centerX || 0,
          y: contextualAction.element.boundingBox?.centerY || 0
        },
        value: contextualAction.value,
        timestamp: new Date(),
        duration: 0,
        success: true
      };
    }

    // Get categorized elements
    const allActions = SmartActionSelector.analyzePageElements(state.domSnapshot.elements);

    // Score actions based on task relevance
    const taskActions = allActions.map(action => {
      let taskScore = action.priority;

      // Prioritize based on page type and likely user goals
      switch (pageContext.type) {
        case PageType.HOMEPAGE:
          if (action.category === ElementCategory.SEARCH) {
            taskScore += 8; // High priority for homepage search
          } else if (action.category === ElementCategory.NAVIGATION) {
            taskScore += 6; // Secondary: explore site structure
          }
          break;

        case PageType.LOGIN:
          if (action.category === ElementCategory.FORM_INPUT) {
            taskScore += 10; // Highest priority: complete login
          } else if (action.category === ElementCategory.BUTTON &&
                     action.element.text?.toLowerCase().includes('login')) {
            taskScore += 8; // Submit login
          }
          break;

        case PageType.SEARCH_RESULTS:
          if (action.category === ElementCategory.LINK &&
              action.element.text && action.element.text.length > 10) {
            taskScore += 7; // Click relevant results
          } else if (action.category === ElementCategory.SEARCH) {
            taskScore += 5; // Refine search
          }
          break;

        case PageType.PRODUCT_LISTING:
          if (action.category === ElementCategory.LINK &&
              action.element.className?.includes('product')) {
            taskScore += 8; // View product details
          } else if (action.category === ElementCategory.DROPDOWN) {
            taskScore += 6; // Use filters
          }
          break;

        case PageType.PRODUCT_DETAIL:
          if (action.element.text?.toLowerCase().includes('cart') ||
              action.element.text?.toLowerCase().includes('buy')) {
            taskScore += 10; // Add to cart/purchase
          } else if (action.category === ElementCategory.DROPDOWN) {
            taskScore += 5; // Select options
          }
          break;

        case PageType.FORM_PAGE:
        case PageType.CONTACT:
          if (action.category === ElementCategory.FORM_INPUT) {
            taskScore += 8; // Fill form fields
          } else if (action.category === ElementCategory.BUTTON &&
                     (action.element.text?.toLowerCase().includes('submit') ||
                      action.element.text?.toLowerCase().includes('send'))) {
            taskScore += 9; // Submit form
          }
          break;
      }

      // General task-oriented priorities
      if (action.category === ElementCategory.BUTTON) {
        const buttonText = action.element.text?.toLowerCase() || '';
        if (buttonText.includes('search') || buttonText.includes('find')) {
          taskScore += 4;
        } else if (buttonText.includes('next') || buttonText.includes('continue')) {
          taskScore += 3;
        }
      }

      // Reduce priority for passive elements in task-oriented mode
      if (action.category === ElementCategory.MEDIA ||
          action.category === ElementCategory.TEXT_CONTENT) {
        taskScore -= 2;
      }

      return { ...action, taskScore };
    }).sort((a, b) => b.taskScore - a.taskScore);

    if (taskActions.length === 0) {
      // Fallback to curiosity-driven
      return await this.selectCuriosityDrivenAction(state, sessionId);
    }

    // Select highest scoring task-relevant action
    const selectedAction = taskActions[0];
    const actionType = this.mapRecommendedActionToType(selectedAction.recommendedAction);

    logger.debug('Task-oriented action selected', {
      category: selectedAction.category,
      taskScore: selectedAction.taskScore,
      pageType: pageContext.type
    });

    return {
      type: actionType,
      target: selectedAction.element,
      coordinates: {
        x: selectedAction.element.boundingBox?.centerX || 0,
        y: selectedAction.element.boundingBox?.centerY || 0
      },
      value: selectedAction.value,
      timestamp: new Date(),
      duration: 0,
      success: true
    };
  }

  /**
   * Coverage-maximizing action selection (explores breadth of site)
   */
  private async selectCoverageMaximizingAction(state: ExplorationState, sessionId: string): Promise<ActionData> {
    // Analyze page context
    const pageContext = PageContextAnalyzer.analyzePageContext(
      state.url,
      state.domSnapshot.elements,
      undefined
    );

    // Get all categorized elements
    const allActions = SmartActionSelector.analyzePageElements(state.domSnapshot.elements);

    // Prioritize actions that lead to new pages for maximum coverage
    const coverageActions = allActions.map(action => {
      let coverageScore = action.priority;

      // Highest priority: Navigation and links to new areas
      if (action.category === ElementCategory.NAVIGATION) {
        coverageScore += 8;
      } else if (action.category === ElementCategory.LINK) {
        // Check if this might lead to unexplored pages
        const href = action.element.attributes?.href;
        if (href && !state.visitedPages?.has(href)) {
          coverageScore += 6;
        } else {
          coverageScore -= 2; // Already visited
        }
      }

      // Second priority: Search functionality (leads to diverse content)
      if (action.category === ElementCategory.SEARCH) {
        coverageScore += 7;
      }

      // Third priority: Buttons that might trigger navigation or reveal content
      if (action.category === ElementCategory.BUTTON) {
        const buttonText = action.element.text?.toLowerCase() || '';
        if (buttonText.includes('more') || buttonText.includes('view') ||
            buttonText.includes('show') || buttonText.includes('load')) {
          coverageScore += 4;
        }
      }

      // Reduce priority for media and social links (less content coverage)
      if (action.category === ElementCategory.MEDIA ||
          action.category === ElementCategory.SOCIAL) {
        coverageScore -= 3;
      }

      // Context-based scoring
      if (pageContext.type === PageType.HOMEPAGE) {
        if (action.category === ElementCategory.NAVIGATION) {
          coverageScore += 3; // Critical for discovering site structure
        }
      } else if (pageContext.type === PageType.PRODUCT_LISTING) {
        if (action.element.text?.toLowerCase().includes('next') ||
            action.element.text?.toLowerCase().includes('page')) {
          coverageScore += 5; // Pagination for coverage
        }
      }

      return { ...action, coverageScore };
    }).sort((a, b) => b.coverageScore - a.coverageScore);

    if (coverageActions.length === 0) {
      // No elements found, scroll to discover more
      return {
        type: ActionType.SCROLL,
        coordinates: { x: 640, y: 360 },
        value: 'down',
        timestamp: new Date(),
        duration: 0,
        success: true
      };
    }

    // Select highest coverage action with slight randomization
    const topActions = coverageActions.slice(0, 3);
    const selectedAction = topActions[Math.floor(Math.random() * topActions.length)];

    const actionType = this.mapRecommendedActionToType(selectedAction.recommendedAction);

    logger.debug('Coverage-maximizing action selected', {
      category: selectedAction.category,
      coverageScore: selectedAction.coverageScore,
      pageType: pageContext.type
    });

    return {
      type: actionType,
      target: selectedAction.element,
      coordinates: {
        x: selectedAction.element.boundingBox?.centerX || 0,
        y: selectedAction.element.boundingBox?.centerY || 0
      },
      value: selectedAction.value,
      timestamp: new Date(),
      duration: 0,
      success: true
    };
  }

  /**
   * Get unique identifier for an element
   */
  private getElementIdentifier(element: InteractiveElement): string {
    // Create a unique identifier based on multiple attributes
    const parts = [
      element.tagName || 'unknown',
      element.selector || '',
      element.text?.substring(0, 50) || '',
      (element as any).className || '',
      element.id || '',
      element.attributes?.href || '',
      element.boundingBox ? `${element.boundingBox.centerX},${element.boundingBox.centerY}` : ''
    ];
    return parts.join('|');
  }

  /**
   * Check if element was already clicked on this page
   */
  private wasElementClicked(sessionId: string, url: string, element: InteractiveElement): boolean {
    const urlKey = this.normalizeUrl(url);
    const sessionClickMap = this.clickedElementsMap.get(sessionId);
    if (!sessionClickMap) return false;

    const pageClickedElements = sessionClickMap.get(urlKey);
    if (!pageClickedElements) return false;

    const elementId = this.getElementIdentifier(element);
    return pageClickedElements.has(elementId);
  }

  /**
   * Record that an element was clicked
   */
  private recordClickedElement(sessionId: string, url: string, element: InteractiveElement): void {
    const urlKey = this.normalizeUrl(url);
    const elementId = this.getElementIdentifier(element);

    if (!this.clickedElementsMap.has(sessionId)) {
      this.clickedElementsMap.set(sessionId, new Map());
    }

    const sessionClickMap = this.clickedElementsMap.get(sessionId)!;
    if (!sessionClickMap.has(urlKey)) {
      sessionClickMap.set(urlKey, new Set());
    }

    sessionClickMap.get(urlKey)!.add(elementId);

    logger.info('Recorded clicked element', {
      sessionId,
      url: urlKey,
      elementId,
      totalClickedOnPage: sessionClickMap.get(urlKey)!.size
    });
  }

  /**
   * Normalize URL for comparison (remove hash and query params)
   */
  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
    } catch {
      return url.split('#')[0].split('?')[0];
    }
  }

  /**
   * Map recommended action string to ActionType
   */
  private mapRecommendedActionToType(action: string): ActionType {
    switch (action) {
      case 'type':
      case 'clear_and_type':
        return ActionType.TYPE;
      case 'click':
      case 'submit':
      case 'toggle':
      case 'check':
        return ActionType.CLICK;
      case 'hover':
        return ActionType.HOVER;
      case 'scroll_to':
        return ActionType.SCROLL;
      default:
        return ActionType.CLICK;
    }
  }

  /**
   * Generate realistic input values for form fields
   */
  private generateRandomInputValue(element: any): string {
    // Use the smart input value generator from ImportantElementFilter
    const filteredElement: FilteredElement = {
      selector: element.selector || '',
      tagName: element.tagName || '',
      type: element.type,
      text: element.text,
      innerHTML: element.innerHTML,
      hasOnClick: false,
      hasText: !!element.text,
      label: element.label,
      placeholder: element.placeholder,
      ariaLabel: element.attributes?.['aria-label'],
      href: element.attributes?.href,
      src: element.attributes?.src,
      alt: element.attributes?.alt,
      boundingBox: element.boundingBox,
      isVisible: true,
      isClickable: element.isClickable || false,
      isInputable: element.isInputable || false,
      elementType: 'input',
      importance: 0
    };

    return ImportantElementFilter.generateSmartInputValue(filteredElement);
  }

  /**
   * Check if exploration session should end
   */
  private shouldEndSession(session: ExplorationSession): boolean {
    const config = session.sessionConfig;
    const duration = Date.now() - session.startTime.getTime();

    return (
      duration >= config.maxSessionDuration ||
      session.actions.length >= config.maxActionsPerSession ||
      session.pagesExplored >= config.maxPagesPerSession ||
      session.failedActions > 20 // Safety limit
    );
  }

  /**
   * Save session data to disk
   */
  private async saveSessionData(session: ExplorationSession): Promise<void> {
    try {
      const sessionPath = path.join(
        this.explorationDataDir,
        'sessions',
        `${session.id}.json`
      );

      // Create lightweight session data (exclude large binary data)
      const sessionData = {
        ...session,
        states: session.states.map(state => ({
          ...state,
          visualFeatures: {
            ...state.visualFeatures,
            screenshot: null as any, // Exclude binary data
            annotatedScreenshot: null as any,
            elementMasks: null as any
          }
        }))
      };

      fs.writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2));

      logger.debug('Session data saved', {
        sessionId: session.id,
        actionsCount: session.actions.length,
        statesCount: session.states.length
      });
    } catch (error: any) {
      logger.error('Failed to save session data', {
        sessionId: session.id,
        error: error.message
      });
    }
  }

  /**
   * Get WebDriver instance from Chrome session
   */
  private getDriverFromSession(sessionId: string): WebDriver {
    const browserSessionId = this.browserSessionMap.get(sessionId);
    if (!browserSessionId) {
      throw new Error(`No browser session found for exploration session ${sessionId}`);
    }

    const browserSession = chromeDriverService.getSession(browserSessionId);
    if (!browserSession) {
      throw new Error(`Browser session ${browserSessionId} not found`);
    }

    return browserSession.driver;
  }

  /**
   * End exploration session and cleanup
   */
  async endExplorationSession(sessionId: string): Promise<ExplorationSession> {
    try {
      const session = this.sessionsMap.get(sessionId);
      if (!session) {
        throw new Error(`Exploration session ${sessionId} not found`);
      }

      session.endTime = new Date();
      session.duration = session.endTime.getTime() - session.startTime.getTime();

      // Save final session data
      await this.saveSessionData(session);

      // Generate trajectory data for RL training
      await this.generateTrajectoryData(session);

      // Cleanup browser session
      const browserSessionId = this.browserSessionMap.get(sessionId);
      if (browserSessionId) {
        await chromeDriverService.closeSession(browserSessionId);
        this.browserSessionMap.delete(sessionId);
      }

      // Cleanup exploration session
      this.sessionsMap.delete(sessionId);

      logger.info('Exploration session ended', {
        sessionId,
        duration: session.duration,
        totalActions: session.actions.length,
        totalReward: session.totalReward,
        pagesExplored: session.pagesExplored
      });

      return session;
    } catch (error: any) {
      logger.error('Failed to end exploration session', {
        sessionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Generate trajectory data for RL training
   */
  private async generateTrajectoryData(session: ExplorationSession): Promise<void> {
    try {
      const trajectory: Trajectory = {
        id: uuidv4(),
        states: session.states,
        actions: session.actions,
        rewards: session.rewards.map(r => r.totalReward),
        values: new Array(session.states.length).fill(0), // Will be computed by value function
        advantages: new Array(session.actions.length).fill(0), // Will be computed during training
        returns: this.computeReturns(session.rewards.map(r => r.totalReward)),
        logProbabilities: new Array(session.actions.length).fill(0) // Will be set by policy network
      };

      session.trajectories.push(trajectory);

      // Save trajectory data
      const trajectoryPath = path.join(
        this.explorationDataDir,
        'trajectories',
        `${trajectory.id}.json`
      );

      fs.writeFileSync(trajectoryPath, JSON.stringify(trajectory, null, 2));

      logger.debug('Trajectory data generated', {
        sessionId: session.id,
        trajectoryId: trajectory.id,
        length: trajectory.actions.length
      });
    } catch (error: any) {
      logger.error('Failed to generate trajectory data', {
        sessionId: session.id,
        error: error.message
      });
    }
  }

  /**
   * Compute discounted returns for trajectory
   */
  private computeReturns(rewards: number[], gamma: number = 0.99): number[] {
    const returns: number[] = new Array(rewards.length);
    let runningReturn = 0;

    for (let i = rewards.length - 1; i >= 0; i--) {
      runningReturn = rewards[i] + gamma * runningReturn;
      returns[i] = runningReturn;
    }

    return returns;
  }

  /**
   * Get exploration session statistics
   */
  getSessionStats(sessionId: string): any {
    const session = this.sessionsMap.get(sessionId);
    if (!session) {
      return null;
    }

    return {
      sessionId: session.id,
      duration: Date.now() - session.startTime.getTime(),
      actionsPerformed: session.actions.length,
      pagesExplored: session.pagesExplored,
      successRate: session.successfulActions / (session.successfulActions + session.failedActions),
      totalReward: session.totalReward,
      currentUrl: session.states[session.states.length - 1]?.url
    };
  }

  /**
   * Build a comprehensive session export including metrics, frontier, and timeline.
   */
  getSessionExport(sessionId: string): any | null {
    const session = this.sessionsMap.get(sessionId);
    if (!session) return null;

    const metrics = this.getSessionMetrics(sessionId);

    // Build timeline from actions/states/rewards
    const timeline: any[] = [];
    let cumulative = 0;
    for (let i = 0; i < session.actions.length; i++) {
      const action = session.actions[i];
      const state = session.states[Math.min(i + 1, session.states.length - 1)];
      const reward = session.rewards[i]?.totalReward ?? 0;
      cumulative += reward;
      const novelty = (() => { try { return this.computeNovelty(state); } catch { return null; } })();
      timeline.push({
        index: i + 1,
        actionType: action.type,
        success: action.success,
        url: state?.url,
        reward,
        cumulativeReward: cumulative,
        novelty
      });
    }

    // Frontier snapshot (same-domain preferred)
    const domain = session.states[session.states.length - 1]?.domain;
    const snapshot = (this.frontier as any).snapshot?.() || [];
    const frontier = snapshot.filter((e: any) => !domain || e.domain === domain).slice(0, 200);

    return {
      session: {
        id: session.id,
        startUrl: session.startUrl,
        startTime: session.startTime,
        duration: Date.now() - session.startTime.getTime(),
        actions: session.actions.length,
        pagesExplored: session.pagesExplored,
        totalReward: session.totalReward,
      },
      metrics,
      frontier,
      timeline,
    };
  }

  /**
   * Compute detailed exploration metrics for API reporting
   */
  getSessionMetrics(sessionId: string): any {
    const session = this.sessionsMap.get(sessionId);
    if (!session) return null;

    const uniquePages = new Set(session.states.map(s => this.normalizeUrl(s.url)));
    const domains = new Set(session.states.map(s => s.domain));
    const actionsTotal = session.actions.length || 1;
    const successes = session.successfulActions || 0;
    const failures = session.failedActions || 0;

    const actionTypeCounts: Record<string, number> = {};
    for (const a of session.actions) {
      actionTypeCounts[a.type] = (actionTypeCounts[a.type] || 0) + 1;
    }
    // Shannon entropy over action type distribution
    let entropy = 0;
    const total = Object.values(actionTypeCounts).reduce((x, y) => x + y, 0) || 1;
    for (const c of Object.values(actionTypeCounts)) {
      const p = c / total;
      entropy += p > 0 ? -p * Math.log2(p) : 0;
    }

    // Novelty average across recent states (post-observation proxy)
    const recentStates = session.states.slice(-10);
    const noveltyValues = recentStates.map(s => {
      try { return this.noveltyEstimator.intrinsicReward(s); } catch { return 0; }
    });
    const noveltyAvg = noveltyValues.length ? (noveltyValues.reduce((a, b) => a + b, 0) / noveltyValues.length) : 0;

    // Forms coverage across session
    let formsCovered = 0;
    const seenFormPages = new Set<string>();
    for (const s of session.states) {
      const key = this.normalizeUrl(s.url);
      if (!seenFormPages.has(key) && (s.domSnapshot?.forms?.length || 0) > 0) {
        formsCovered++;
        seenFormPages.add(key);
      }
    }

    // Element tag diversity (last state proxy)
    const tagSet = new Set((session.states[session.states.length - 1]?.domSnapshot?.elements || []).map(e => e.tagName));

    return {
      coverage: {
        pagesCovered: uniquePages.size,
        domainsCovered: domains.size,
        formsCovered,
        uniqueElementTypes: tagSet.size,
      },
      efficiency: {
        actionsPerPage: actionsTotal / Math.max(1, uniquePages.size),
        successRate: successes / Math.max(1, (successes + failures)),
        errorRate: failures / Math.max(1, (successes + failures)),
        averageSessionDuration: Date.now() - session.startTime.getTime(),
      },
      learning: {
        noveltyAvg,
        explorationEntropy: entropy,
        actionTypeCounts,
      },
      totals: {
        actions: actionsTotal,
        successes,
        failures,
        totalReward: session.totalReward,
      }
    };
  }
}

/**
 * Reward calculation component
 */
class RewardCalculator {
  calculateReward(
    previousState: ExplorationState,
    action: ActionData,
    newState: ExplorationState,
    session: ExplorationSession
  ): RewardComponents {
    const reward: RewardComponents = {
      noveltyReward: this.calculateNoveltyReward(previousState, newState, session),
      coverageReward: this.calculateCoverageReward(newState, session),
      diversityReward: this.calculateDiversityReward(action, session),
      informationGainReward: this.calculateInformationGainReward(previousState, newState),
      taskProgressReward: 0, // TODO: Implement task inference
      goalCompletionReward: 0, // TODO: Implement goal detection
      efficiencyReward: this.calculateEfficiencyReward(session),
      errorPenalty: action.success ? 0 : -1.0,
      inefficiencyPenalty: this.calculateInefficiencyPenalty(action, session),
      destructivePenalty: 0, // TODO: Implement destructive action detection
      totalReward: 0
    };

    // Dynamic reward weighting based on exploration phase (research-backed)
    const explorationProgress = Math.min(session.actions.length / 30, 1.0);

    // Early exploration: Emphasize diversity and novelty
    // Late exploration: Emphasize efficiency and goal completion
    const diversityWeight = 0.3 * (1 - explorationProgress) + 0.1 * explorationProgress;
    const noveltyWeight = 0.4 * (1 - explorationProgress) + 0.2 * explorationProgress;
    const efficiencyWeight = 0.05 * (1 - explorationProgress) + 0.2 * explorationProgress;

    // Calculate total reward with dynamic weighting
    reward.totalReward = (
      noveltyWeight * reward.noveltyReward +
      0.2 * reward.coverageReward +
      diversityWeight * reward.diversityReward +
      0.1 * reward.informationGainReward +
      0.1 * reward.taskProgressReward +
      0.1 * reward.goalCompletionReward +
      efficiencyWeight * reward.efficiencyReward +
      reward.errorPenalty +
      reward.inefficiencyPenalty +
      reward.destructivePenalty
    );

    return reward;
  }

  private calculateNoveltyReward(
    previousState: ExplorationState,
    newState: ExplorationState,
    session: ExplorationSession
  ): number {
    // Reward for discovering new pages
    if (newState.url !== previousState.url && !session.states.some(s => s.url === newState.url)) {
      return 1.0;
    }

    // Reward for discovering new elements
    const newElements = newState.domSnapshot.elements.filter(el =>
      !previousState.domSnapshot.elements.some(prevEl => prevEl.selector === el.selector)
    );

    return Math.min(newElements.length * 0.1, 0.5);
  }

  private calculateCoverageReward(state: ExplorationState, session: ExplorationSession): number {
    // Reward based on site coverage breadth
    const uniquePages = new Set(session.states.map(s => s.url)).size;
    return Math.log(uniquePages + 1) * 0.1;
  }

  private calculateDiversityReward(action: ActionData, session: ExplorationSession): number {
    // Research-backed diversity reward (ICM + Curiosity-driven exploration)
    const recentActions = session.actions.slice(-5);
    const actionTypes = new Set(session.actions.map(a => a.type));

    // Base diversity reward for action type variety
    let diversityReward = Math.min(actionTypes.size * 0.05, 0.3);

    // Intrinsic curiosity bonus: Higher reward for novel action types
    const recentActionTypes = recentActions.map(a => a.type);
    const isNovelActionType = !recentActionTypes.includes(action.type);

    if (isNovelActionType) {
      // Novel action type bonus (intrinsic motivation principle)
      diversityReward += 0.2;
    }

    // Workflow-guided exploration: Penalize repetitive action sequences
    const actionSequence = recentActions.map(a => a.type).join('-');
    const hasRepetitivePattern = this.detectRepetitivePattern(actionSequence);

    if (hasRepetitivePattern) {
      // Apply penalty for repetitive behavior
      diversityReward -= 0.15;
    }

    // Dynamic exploration bonus: Higher early in exploration, lower later
    const explorationProgress = Math.min(session.actions.length / 20, 1.0);
    const explorationBonus = (1 - explorationProgress) * 0.1;

    return Math.max(diversityReward + explorationBonus, -0.2);
  }

  /**
   * Detect repetitive patterns in action sequences (research-backed)
   */
  private detectRepetitivePattern(actionSequence: string): boolean {
    if (actionSequence.length < 6) return false;

    // Check for immediate repetition (click-click-click)
    const actions = actionSequence.split('-');
    if (actions.length >= 3) {
      const lastThree = actions.slice(-3);
      if (lastThree.every(action => action === lastThree[0])) {
        return true;
      }
    }

    // Check for alternating patterns (click-scroll-click-scroll)
    if (actions.length >= 4) {
      const lastFour = actions.slice(-4);
      if (lastFour[0] === lastFour[2] && lastFour[1] === lastFour[3]) {
        return true;
      }
    }

    return false;
  }

  private calculateInformationGainReward(
    previousState: ExplorationState,
    newState: ExplorationState
  ): number {
    // Reward for pages with more interactive elements (more learning potential)
    const newElementCount = newState.domSnapshot.elements.length;
    const prevElementCount = previousState.domSnapshot.elements.length;

    if (newElementCount > prevElementCount) {
      return Math.min((newElementCount - prevElementCount) * 0.01, 0.5);
    }

    return 0;
  }

  private calculateEfficiencyReward(session: ExplorationSession): number {
    // Small reward for achieving exploration with fewer actions
    const actionEfficiency = session.pagesExplored / Math.max(session.actions.length, 1);
    return Math.min(actionEfficiency * 0.1, 0.2);
  }

  private calculateInefficiencyPenalty(action: ActionData, session: ExplorationSession): number {
    // Penalty for repetitive actions on same elements
    const recentActions = session.actions.slice(-5);
    const sameTargetActions = recentActions.filter(a =>
      a.target?.selector === action.target?.selector && a.type === action.type
    );

    return -Math.min(sameTargetActions.length * 0.1, 0.5);
  }
}

/**
 * Action execution component
 */
class ActionExecutor {
  async executeAction(driver: WebDriver, action: ActionData): Promise<void> {
    try {
      switch (action.type) {
        case ActionType.CLICK:
          await this.executeClick(driver, action);
          break;

        case ActionType.TYPE:
          await this.executeType(driver, action);
          break;

        case ActionType.SCROLL:
          await this.executeScroll(driver, action);
          break;

        case ActionType.HOVER:
          await this.executeHover(driver, action);
          break;

        case ActionType.NAVIGATE:
          await this.executeNavigate(driver, action);
          break;

        case ActionType.WAIT:
          await this.executeWait(driver, action);
          break;

        default:
          throw new Error(`Unsupported action type: ${action.type}`);
      }

      action.success = true;
    } catch (error: any) {
      action.success = false;
      action.errorMessage = error.message;
      logger.warn('Action execution failed', {
        actionType: action.type,
        error: error.message
      });
    }
  }

  private async executeClick(driver: WebDriver, action: ActionData): Promise<void> {
    if (action.target) {
      try {
        // Try to find element by selector
        const element = await driver.findElement(By.css(action.target.selector));

        // Check if element is interactable
        const isDisplayed = await element.isDisplayed();
        const isEnabled = await element.isEnabled();

        if (!isDisplayed || !isEnabled) {
          // Try JavaScript click as fallback
          await driver.executeScript(`
            const el = document.querySelector('${action.target.selector}');
            if (el) {
              el.scrollIntoView({behavior: 'smooth', block: 'center'});
              setTimeout(() => el.click(), 500);
            }
          `);
        } else {
          // Normal click
          await driver.executeScript('arguments[0].scrollIntoView({behavior: "smooth", block: "center"});', element);
          await driver.sleep(500);
          await element.click();
        }
      } catch (error: any) {
        // Fallback to JavaScript click if element is stale or not found
        if (error.name === 'StaleElementReferenceError' || error.name === 'NoSuchElementError') {
          await driver.executeScript(`
            const el = document.querySelector('${action.target.selector}');
            if (el) {
              el.scrollIntoView({behavior: 'smooth', block: 'center'});
              setTimeout(() => el.click(), 500);
            }
          `);
        } else {
          throw error;
        }
      }
    } else if (action.coordinates) {
      // Click at coordinates (using JavaScript)
      await driver.executeScript(`
        document.elementFromPoint(${action.coordinates.x}, ${action.coordinates.y})?.click();
      `);
    }
  }

  private async executeType(driver: WebDriver, action: ActionData): Promise<void> {
    if (action.target && action.value) {
      const element = await driver.findElement(By.css(action.target.selector));
      await driver.executeScript('arguments[0].scrollIntoView(true);', element);
      await element.clear();
      await element.sendKeys(action.value);
    }
  }

  private async executeScroll(driver: WebDriver, action: ActionData): Promise<void> {
    const direction = action.value || 'down';
    const scrollAmount = 300;

    switch (direction) {
      case 'down':
        await driver.executeScript(`window.scrollBy(0, ${scrollAmount})`);
        break;
      case 'up':
        await driver.executeScript(`window.scrollBy(0, -${scrollAmount})`);
        break;
      case 'left':
        await driver.executeScript(`window.scrollBy(-${scrollAmount}, 0)`);
        break;
      case 'right':
        await driver.executeScript(`window.scrollBy(${scrollAmount}, 0)`);
        break;
    }
  }

  private async executeHover(driver: WebDriver, action: ActionData): Promise<void> {
    if (action.target) {
      const element = await driver.findElement(By.css(action.target.selector));
      const actions = driver.actions({ async: true });
      await actions.move({ origin: element }).perform();
    }
  }

  private async executeNavigate(driver: WebDriver, action: ActionData): Promise<void> {
    if (action.value) {
      await driver.get(action.value);
    } else {
      // Navigate back or forward
      if (action.value === 'back') {
        await driver.navigate().back();
      } else if (action.value === 'forward') {
        await driver.navigate().forward();
      }
    }
  }

  private async executeWait(driver: WebDriver, action: ActionData): Promise<void> {
    const waitTime = parseInt(action.value || '1000');
    await driver.sleep(waitTime);
  }
}

/**
 * Safety validation component
 */
class SafetyValidator {
  async validateAction(action: ActionData, state: ExplorationState): Promise<boolean> {
    // Check for potentially destructive actions
    if (this.isDestructiveAction(action)) {
      return false;
    }

    // Check rate limiting
    if (this.exceedsRateLimit(state)) {
      return false;
    }

    // Check domain restrictions
    if (this.violatesDomainRestrictions(action, state)) {
      return false;
    }

    return true;
  }

  private isDestructiveAction(action: ActionData): boolean {
    if (!action.target) return false;

    const destructivePatterns = [
      'delete', 'remove', 'cancel', 'unsubscribe',
      'close account', 'deactivate', 'terminate'
    ];

    const elementText = action.target.text.toLowerCase();
    return destructivePatterns.some(pattern => elementText.includes(pattern));
  }

  private exceedsRateLimit(state: ExplorationState): boolean {
    // Simple rate limiting check
    const recentActions = state.actionHistory.slice(-10);
    const recentTimestamps = recentActions.map(a => a.timestamp.getTime());
    const now = Date.now();
    const actionsInLastMinute = recentTimestamps.filter(t => now - t < 60000);

    return actionsInLastMinute.length > 30; // Max 30 actions per minute
  }

  private violatesDomainRestrictions(action: ActionData, state: ExplorationState): boolean {
    // For now, allow all actions within the same domain
    return false;
  }
}

export const explorationRLService = new ExplorationRLService();
