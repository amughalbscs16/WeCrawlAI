import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { SecurityTestingService, SecurityFinding } from './SecurityTestingService';
import { PlaywrightService } from './PlaywrightService';
import { WebSocketManager } from './WebSocketManager';

export interface TestExecutionOptions {
  browser?: 'chrome' | 'chromium' | 'firefox' | 'webkit';
  headless?: boolean;
  timeout?: number;
  viewport?: { width: number; height: number };
  enableSecurity?: boolean;
  enableScreenshots?: boolean;
  enableVideo?: boolean;
}

export interface TestStep {
  id: string;
  description: string;
  action: string;
  selector?: string;
  value?: string;
  expected?: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
  duration?: number;
  screenshot?: string;
  error?: string;
  timestamp: string;
}

export interface TestExecution {
  id: string;
  scenario: string;
  url: string;
  options: TestExecutionOptions;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  steps: TestStep[];
  startTime: string;
  endTime?: string;
  duration?: number;
  screenshots: string[];
  videos: string[];
  securityFindings: SecurityFinding[];
  metadata: {
    browser: string;
    viewport: string;
    userAgent: string;
  };
}

export class TestExecutionService {
  private executions: Map<string, TestExecution> = new Map();
  private playwrightService: PlaywrightService;
  private securityService: SecurityTestingService;

  constructor() {
    this.playwrightService = new PlaywrightService();
    this.securityService = new SecurityTestingService();
  }

  async executeScenario(payload: {
    scenario: string;
    url: string;
    options?: TestExecutionOptions;
  }): Promise<string> {
    const executionId = uuidv4();
    const options: TestExecutionOptions = {
      browser: 'chrome',
      headless: false,
      timeout: 30000,
      viewport: { width: 1280, height: 720 },
      enableSecurity: true,
      enableScreenshots: true,
      enableVideo: false,
      ...payload.options,
    };

    const execution: TestExecution = {
      id: executionId,
      scenario: payload.scenario,
      url: payload.url,
      options,
      status: 'running',
      steps: [],
      startTime: new Date().toISOString(),
      screenshots: [],
      videos: [],
      securityFindings: [],
      metadata: {
        browser: options.browser || 'chrome',
        viewport: `${options.viewport?.width}x${options.viewport?.height}`,
        userAgent: 'AI Testing Agent v1.0.0 - Chrome WebDriver v138.0.7204.49',
      },
    };

    this.executions.set(executionId, execution);

    logger.info('Starting test execution', {
      executionId,
      url: payload.url,
      scenario: payload.scenario.substring(0, 100) + '...',
      options,
    });

    // Broadcast test start via WebSocket
    const wsManager = WebSocketManager.getInstance();
    if (wsManager) {
      wsManager.broadcastToAll({
        type: 'test_execution_started',
        payload: {
          executionId,
          url: payload.url,
          scenario: payload.scenario,
          status: 'running'
        }
      });
    }

    // Start execution in background
    this.runExecution(executionId).catch((error) => {
      logger.error('Test execution failed', {
        executionId,
        error: error.message,
      });

      const failedExecution = this.executions.get(executionId);
      if (failedExecution) {
        failedExecution.status = 'failed';
        failedExecution.endTime = new Date().toISOString();
        failedExecution.duration = Date.parse(failedExecution.endTime) - Date.parse(failedExecution.startTime);
      }
    });

    return executionId;
  }

  private async runExecution(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    let browser = null;
    let page = null;

    try {
      // Start browser and page
      const navigationStep = await this.addExecutionStep(execution, 'Initialize browser', 'init');
      try {
        browser = await this.playwrightService.createBrowser({
          browser: execution.options.browser === 'chrome' ? 'chromium' : execution.options.browser || 'chromium',
          headless: execution.options.headless || false,
          viewport: execution.options.viewport,
          timeout: execution.options.timeout
        });
        page = await browser.newPage();

        navigationStep.status = 'passed';
        navigationStep.duration = Date.now() - Date.parse(navigationStep.timestamp);
      } catch (error: any) {
        navigationStep.status = 'failed';
        navigationStep.error = error.message;
        navigationStep.duration = Date.now() - Date.parse(navigationStep.timestamp);
        throw error;
      }

      // Navigate to URL
      const navStep = await this.addExecutionStep(execution, `Navigate to ${execution.url}`, 'navigate', execution.url);
      try {
        await page.goto(execution.url, { waitUntil: 'networkidle' });
        navStep.status = 'passed';
        navStep.duration = Date.now() - Date.parse(navStep.timestamp);
      } catch (error: any) {
        navStep.status = 'failed';
        navStep.error = error.message;
        navStep.duration = Date.now() - Date.parse(navStep.timestamp);
        throw error;
      }

      // Take screenshot if enabled
      if (execution.options.enableScreenshots) {
        const screenshotStep = await this.addExecutionStep(execution, 'Take page screenshot', 'screenshot');
        try {
          const screenshotPath = `backend/screenshots/execution_${executionId}_${Date.now()}.png`;
          await page.screenshot({ path: screenshotPath, fullPage: true });
          execution.screenshots.push(screenshotPath);
          screenshotStep.status = 'passed';
          screenshotStep.duration = Date.now() - Date.parse(screenshotStep.timestamp);
        } catch (error: any) {
          screenshotStep.status = 'failed';
          screenshotStep.error = error.message;
          screenshotStep.duration = Date.now() - Date.parse(screenshotStep.timestamp);
          // Screenshot failure shouldn't stop execution
        }
      }

      // Run security testing if enabled
      if (execution.options.enableSecurity) {
        const securityStep = await this.addExecutionStep(execution, 'Run security analysis', 'security');
        try {
          logger.info('Starting security testing', { executionId, url: execution.url });

          // Add a note step to inform the user
          const noteStep = await this.addExecutionStep(
            execution,
            'Security testing in progress - browser may navigate automatically',
            'info'
          );
          noteStep.status = 'passed';
          noteStep.duration = 0;

          // Create a logging callback for security testing
          const logSecurityStep = async (description: string, action: string, details?: any) => {
            const step = await this.addExecutionStep(execution, description, action);
            step.status = 'passed';
            step.duration = 0;
            if (details) {
              logger.debug('Security test step', { description, action, details });
            }
          };

          const securityFindings = await this.securityService.runSecurityTests(page, execution.url, logSecurityStep);
          execution.securityFindings = securityFindings;

          securityStep.status = 'passed';
          securityStep.duration = Date.now() - Date.parse(securityStep.timestamp);

          logger.info('Security testing completed', {
            executionId,
            findingsCount: securityFindings.length,
            criticalCount: securityFindings.filter(f => f.severity === 'critical').length,
            highCount: securityFindings.filter(f => f.severity === 'high').length,
            mediumCount: securityFindings.filter(f => f.severity === 'medium').length,
            lowCount: securityFindings.filter(f => f.severity === 'low').length
          });

          // Return to original URL after security testing
          const currentUrl = await page.url();
          if (currentUrl !== execution.url) {
            const returnStep = await this.addExecutionStep(
              execution,
              `Returning to original URL after security testing`,
              'navigate'
            );
            try {
              await page.goto(execution.url, { waitUntil: 'networkidle' });
              returnStep.status = 'passed';
              returnStep.duration = Date.now() - Date.parse(returnStep.timestamp);
            } catch (e: any) {
              returnStep.status = 'failed';
              returnStep.error = e.message;
              returnStep.duration = Date.now() - Date.parse(returnStep.timestamp);
            }
          }

        } catch (error: any) {
          securityStep.status = 'failed';
          securityStep.error = error.message;
          securityStep.duration = Date.now() - Date.parse(securityStep.timestamp);
          logger.error('Security testing failed', { executionId, error: error.message });
          // Security failure shouldn't stop execution
        }
      }

      // Execute scenario steps (parse and run BDD steps)
      await this.executeScenarioSteps(execution, page);

      // Mark execution as completed
      execution.status = 'completed';
      execution.endTime = new Date().toISOString();
      execution.duration = Date.parse(execution.endTime) - Date.parse(execution.startTime);

      logger.info('Test execution completed', {
        executionId,
        duration: execution.duration,
        stepsCount: execution.steps.length,
        passedSteps: execution.steps.filter(s => s.status === 'passed').length,
        failedSteps: execution.steps.filter(s => s.status === 'failed').length,
        securityFindings: execution.securityFindings.length,
      });

    } catch (error: any) {
      execution.status = 'failed';
      execution.endTime = new Date().toISOString();
      execution.duration = Date.parse(execution.endTime) - Date.parse(execution.startTime);

      logger.error('Test execution failed completely', {
        executionId,
        error: error.message,
      });

      throw error;
    } finally {
      // Clean up browser resources
      if (page) {
        try {
          await page.close();
        } catch (error) {
          logger.warn('Failed to close page', { executionId, error: error.message });
        }
      }
      if (browser) {
        try {
          await browser.close();
        } catch (error) {
          logger.warn('Failed to close browser', { executionId, error: error.message });
        }
      }
    }
  }

  private async addExecutionStep(execution: TestExecution, description: string, action: string, value?: string): Promise<TestStep> {
    const step: TestStep = {
      id: uuidv4(),
      description,
      action,
      value,
      status: 'running',
      timestamp: new Date().toISOString(),
    };

    execution.steps.push(step);
    logger.info('Executing step', { executionId: execution.id, step: description });

    // Broadcast step update via WebSocket
    const wsManager = WebSocketManager.getInstance();
    if (wsManager) {
      wsManager.broadcastToRoom(`test_${execution.id}`, {
        type: 'test_step_update',
        payload: {
          executionId: execution.id,
          step,
          totalSteps: execution.steps.length,
          status: execution.status
        }
      });
    }

    return step;
  }

  private async executeScenarioSteps(execution: TestExecution, page: any): Promise<void> {
    // Simple BDD step execution
    const scenarioLines = execution.scenario.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('Scenario:') && !line.startsWith('As ') && !line.startsWith('I want') && !line.startsWith('So that'));

    for (const line of scenarioLines) {
      if (execution.status !== 'running') {
        break;
      }

      const step = await this.addExecutionStep(execution, line, 'scenario_step');
      const startTime = Date.now();

      try {
        // Basic BDD step interpretation
        const lowerLine = line.toLowerCase();

        if (lowerLine.includes('navigate') || lowerLine.includes('go to') || lowerLine.includes('visit')) {
          // Already navigated, just wait
          await page.waitForLoadState('networkidle');
        } else if (lowerLine.includes('click')) {
          // Find and click elements
          const selectors = ['button', 'a', '[role="button"]', 'input[type="submit"]'];
          for (const selector of selectors) {
            try {
              const element = page.locator(selector).first();
              if (await element.count() > 0) {
                await element.click();
                break;
              }
            } catch (e) {
              // Try next selector
            }
          }
        } else if (lowerLine.includes('wait')) {
          await page.waitForTimeout(2000);
        } else {
          // Default: wait for page to be stable
          await page.waitForLoadState('domcontentloaded');
        }

        step.status = 'passed';
        step.duration = Date.now() - startTime;

      } catch (error: any) {
        step.status = 'failed';
        step.error = error.message;
        step.duration = Date.now() - startTime;

        logger.error('Scenario step execution failed', {
          executionId: execution.id,
          stepId: step.id,
          step: line,
          error: error.message,
        });
      }

      // Small delay between steps
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  async getExecutionStatus(executionId: string): Promise<TestExecution | null> {
    return this.executions.get(executionId) || null;
  }

  async getExecutionResults(executionId: string): Promise<TestExecution | null> {
    const execution = this.executions.get(executionId);
    if (!execution || execution.status === 'running') {
      return null;
    }
    return execution;
  }

  async stopExecution(executionId: string): Promise<boolean> {
    const execution = this.executions.get(executionId);
    if (!execution || execution.status !== 'running') {
      return false;
    }

    execution.status = 'stopped';
    execution.endTime = new Date().toISOString();
    execution.duration = Date.parse(execution.endTime) - Date.parse(execution.startTime);

    logger.info('Test execution stopped', { executionId });
    return true;
  }

  async getExecutionHistory(params: { page?: number; limit?: number }): Promise<{
    executions: TestExecution[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { page = 1, limit = 10 } = params;
    const executions = Array.from(this.executions.values())
      .sort((a, b) => Date.parse(b.startTime) - Date.parse(a.startTime));

    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedExecutions = executions.slice(start, end);

    return {
      executions: paginatedExecutions,
      total: executions.length,
      page,
      limit,
    };
  }
}