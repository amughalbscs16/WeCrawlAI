import { Builder, WebDriver, By, until, WebElement, Capabilities, Options as ChromeOptions } from 'selenium-webdriver';
import * as chrome from 'selenium-webdriver/chrome';
import { logger } from '../utils/logger';
import { TestExecutionOptions } from './TestExecutionService';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface BrowserConfig extends TestExecutionOptions {
  userAgent?: string;
  extraHTTPHeaders?: Record<string, string>;
  httpCredentials?: {
    username: string;
    password: string;
  };
  ignoreHTTPSErrors?: boolean;
  offline?: boolean;
  recordVideo?: boolean;
  recordHar?: boolean;
  deviceName?: string;
  geolocation?: { latitude: number; longitude: number };
  permissions?: string[];
  colorScheme?: 'dark' | 'light' | 'no-preference';
  reducedMotion?: 'reduce' | 'no-preference';
  sessionStorage?: Record<string, string>;
  localStorage?: Record<string, string>;
  cookies?: Array<{
    name: string;
    value: string;
    domain?: string;
    path?: string;
    httpOnly?: boolean;
    secure?: boolean;
  }>;
}

export interface ElementDiscoveryOptions {
  includeHidden?: boolean;
  maxDepth?: number;
  filterByText?: string;
  filterByRole?: string;
  includeSelectors?: string[];
  excludeSelectors?: string[];
}

export interface PerformanceMetrics {
  navigationTime: number;
  domContentLoaded: number;
  loadComplete: number;
  firstContentfulPaint: number;
  largestContentfulPaint: number;
  firstInputDelay: number;
  cumulativeLayoutShift: number;
  totalBlockingTime: number;
  memoryUsage?: {
    usedJSSize: number;
    totalJSSize: number;
    usedJSMemory: number;
  };
}

export interface VisualComparisonResult {
  matched: boolean;
  difference: number;
  threshold: number;
  diffImage?: Buffer;
  baselineExists: boolean;
}

export interface SmartElementSelector {
  selector: string;
  confidence: number;
  strategy: 'testid' | 'id' | 'role' | 'text' | 'class' | 'xpath' | 'css' | 'ai-visual' | 'ai-semantic';
  element: {
    tagName: string;
    text: string;
    attributes: Record<string, string>;
    position: { x: number; y: number; width: number; height: number };
    isInteractive: boolean;
    accessibilityInfo?: {
      role?: string;
      name?: string;
      description?: string;
      hasKeyboardFocus?: boolean;
    };
  };
}

export interface AccessibilityResult {
  violations: Array<{
    id: string;
    description: string;
    impact: 'minor' | 'moderate' | 'serious' | 'critical';
    tags: string[];
    nodes: Array<{
      html: string;
      target: string[];
      failureSummary?: string;
    }>;
  }>;
  passes: number;
  inapplicable: number;
  incomplete: number;
}

export interface BrowserSession {
  id: string;
  driver: WebDriver;
  createdAt: Date;
  lastUsed: Date;
  config: BrowserConfig;
  isReusable: boolean;
}

export class ChromeDriverService {
  private sessions: Map<string, BrowserSession> = new Map();
  private baselineScreenshots: Map<string, Buffer> = new Map();
  private performanceBaselines: Map<string, PerformanceMetrics> = new Map();
  private screenshotDir: string;
  private baselineDir: string;
  private sessionTimeout: number = 30 * 60 * 1000; // 30 minutes
  private chromeDriverPath: string;

  constructor() {
    this.screenshotDir = path.join(process.cwd(), 'screenshots');
    this.baselineDir = path.join(process.cwd(), 'baselines');

    // Try multiple ChromeDriver paths
    const possiblePaths = [
      'D:\\Claude\\Endeavor_2\\drivers\\chromedriver.exe',
      path.join(process.cwd(), '..', '..', 'drivers', 'chromedriver.exe'),
      path.join(process.cwd(), 'drivers', 'chromedriver.exe')
    ];

    for (const possiblePath of possiblePaths) {
      if (fs.existsSync(possiblePath)) {
        this.chromeDriverPath = possiblePath;
        logger.info('Found ChromeDriver at:', { path: possiblePath });
        break;
      }
    }

    if (!this.chromeDriverPath) {
      this.chromeDriverPath = possiblePaths[0]; // Default to first path
      logger.warn('ChromeDriver not found in expected locations, using default:', { path: this.chromeDriverPath });
    }

    this.ensureDirectories();
    this.startSessionCleanup();
  }

  private ensureDirectories(): void {
    [this.screenshotDir, this.baselineDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  private startSessionCleanup(): void {
    setInterval(() => {
      this.cleanupStaleSessions();
    }, 5 * 60 * 1000); // Check every 5 minutes
  }

  private async cleanupStaleSessions(): Promise<void> {
    const now = Date.now();
    const staleSessions: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastUsed.getTime() > this.sessionTimeout) {
        staleSessions.push(sessionId);
      }
    }

    for (const sessionId of staleSessions) {
      await this.closeSession(sessionId);
      logger.info('Cleaned up stale browser session', { sessionId });
    }
  }

  async createBrowserSession(options: BrowserConfig, reusable: boolean = false): Promise<string> {
    // Check for reusable session first
    if (reusable) {
      const existingSessionId = this.findReusableSession(options);
      if (existingSessionId) {
        const session = this.sessions.get(existingSessionId)!;
        session.lastUsed = new Date();
        logger.info('Reusing existing browser session', { sessionId: existingSessionId });
        return existingSessionId;
      }
    }

    const sessionId = uuidv4();

    logger.info('Creating new Chrome browser session', {
      sessionId,
      headless: options.headless,
      viewport: options.viewport,
      deviceName: options.deviceName,
      reusable
    });

    // Set up Chrome options
    const chromeOptions = new chrome.Options();

    if (options.headless) {
      chromeOptions.addArguments('--headless');
    }

    chromeOptions.addArguments(
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    );

    if (options.viewport) {
      chromeOptions.addArguments(`--window-size=${options.viewport.width},${options.viewport.height}`);
    }

    if (options.userAgent) {
      chromeOptions.addArguments(`--user-agent=${options.userAgent}`);
    }

    if (options.ignoreHTTPSErrors) {
      chromeOptions.addArguments('--ignore-certificate-errors', '--ignore-ssl-errors');
    }

    // Set ChromeDriver service with explicit path
    logger.info('Using ChromeDriver from path:', { path: this.chromeDriverPath });

    // Check if ChromeDriver exists
    if (!fs.existsSync(this.chromeDriverPath)) {
      logger.error('ChromeDriver not found at path:', { path: this.chromeDriverPath });
      throw new Error(`ChromeDriver not found at ${this.chromeDriverPath}`);
    }

    const chromeService = new chrome.ServiceBuilder(this.chromeDriverPath);

    let driver;
    try {
      logger.info('Attempting to build Chrome driver...');
      driver = await new Builder()
        .forBrowser('chrome')
        .setChromeService(chromeService)
        .setChromeOptions(chromeOptions)
        .build();

      logger.info('Chrome driver built successfully');
    } catch (error: any) {
      logger.error('Failed to build Chrome driver:', {
        error: error.message,
        code: error.code,
        chromeDriverPath: this.chromeDriverPath
      });
      throw error;
    }

    const session: BrowserSession = {
      id: sessionId,
      driver,
      createdAt: new Date(),
      lastUsed: new Date(),
      config: options,
      isReusable: reusable
    };

    this.sessions.set(sessionId, session);

    logger.info('Chrome browser session created successfully', {
      sessionId,
      reusable
    });

    return sessionId;
  }

  private findReusableSession(options: BrowserConfig): string | null {
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.isReusable && this.isSessionCompatible(session.config, options)) {
        return sessionId;
      }
    }
    return null;
  }

  private isSessionCompatible(sessionConfig: BrowserConfig, requestedConfig: BrowserConfig): boolean {
    return (
      sessionConfig.headless === requestedConfig.headless &&
      sessionConfig.deviceName === requestedConfig.deviceName &&
      JSON.stringify(sessionConfig.viewport) === JSON.stringify(requestedConfig.viewport)
    );
  }

  async navigateToUrl(sessionId: string, url: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Browser session ${sessionId} not found`);
    }

    session.lastUsed = new Date();
    await session.driver.get(url);

    logger.info('Navigated to URL', { sessionId, url });
  }

  async takeScreenshot(sessionId: string, options?: {
    fullPage?: boolean;
    quality?: number;
    type?: 'png' | 'jpeg';
  }): Promise<Buffer> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Browser session ${sessionId} not found`);
    }

    session.lastUsed = new Date();
    const screenshot = await session.driver.takeScreenshot();
    return Buffer.from(screenshot, 'base64');
  }

  async waitForElement(
    sessionId: string,
    selector: string,
    options?: {
      timeout?: number;
      state?: 'visible' | 'present' | 'clickable';
    }
  ): Promise<WebElement> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Browser session ${sessionId} not found`);
    }

    session.lastUsed = new Date();
    const timeout = options?.timeout || 30000;

    let condition;
    switch (options?.state) {
      case 'visible':
        condition = until.elementLocated(By.css(selector));
        break;
      case 'clickable':
        condition = until.elementLocated(By.css(selector));
        break;
      case 'present':
      default:
        condition = until.elementLocated(By.css(selector));
        break;
    }

    return await session.driver.wait(condition, timeout);
  }

  async smartClick(sessionId: string, selector: string, options?: {
    timeout?: number;
    force?: boolean;
    trial?: boolean;
  }): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Browser session ${sessionId} not found`);
    }

    session.lastUsed = new Date();
    const element = await this.waitForElement(sessionId, selector, {
      state: 'clickable',
      timeout: options?.timeout
    });

    // Scroll element into view
    await session.driver.executeScript('arguments[0].scrollIntoView(true);', element);
    await session.driver.sleep(500);

    await element.click();
    logger.debug('Smart click performed', { sessionId, selector });
  }

  async smartType(sessionId: string, selector: string, text: string, options?: {
    delay?: number;
    timeout?: number;
    clear?: boolean;
  }): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Browser session ${sessionId} not found`);
    }

    session.lastUsed = new Date();
    const element = await this.waitForElement(sessionId, selector, {
      state: 'visible',
      timeout: options?.timeout
    });

    // Scroll element into view
    await session.driver.executeScript('arguments[0].scrollIntoView(true);', element);

    if (options?.clear !== false) {
      await element.clear();
    }

    await element.sendKeys(text);

    if (options?.delay) {
      await session.driver.sleep(options.delay);
    }

    logger.debug('Smart type performed', { sessionId, selector, text: text.substring(0, 50) + '...' });
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      try {
        await session.driver.quit();
      } catch (error) {
        logger.error('Error closing browser', { sessionId, error: error.message });
      }

      this.sessions.delete(sessionId);
      logger.info('Browser session closed', { sessionId });
    }
  }

  async closeAllSessions(): Promise<void> {
    const closingPromises = Array.from(this.sessions.keys()).map(sessionId =>
      this.closeSession(sessionId)
    );

    await Promise.all(closingPromises);
    logger.info('All browser sessions closed');
  }

  async discoverElements(sessionId: string, options: ElementDiscoveryOptions = {}): Promise<SmartElementSelector[]> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Browser session ${sessionId} not found`);
    }

    session.lastUsed = new Date();
    logger.info('Discovering page elements with AI guidance');

    const elements = await session.driver.executeScript(`
      const results = [];
      const maxDepth = arguments[0].maxDepth || 10;

      function getElementDepth(element) {
        let depth = 0;
        let parent = element.parentElement;
        while (parent && depth < maxDepth) {
          depth++;
          parent = parent.parentElement;
        }
        return depth;
      }

      document.querySelectorAll('*').forEach(el => {
        if (getElementDepth(el) > maxDepth) return;

        const rect = el.getBoundingClientRect();
        const isVisible = rect.width > 0 && rect.height > 0 &&
                         window.getComputedStyle(el).visibility !== 'hidden' &&
                         window.getComputedStyle(el).display !== 'none';

        if (!arguments[0].includeHidden && !isVisible) return;

        const text = el.textContent?.trim() || '';
        const tagName = el.tagName.toLowerCase();

        if (arguments[0].filterByText && !text.toLowerCase().includes(arguments[0].filterByText.toLowerCase())) return;
        if (arguments[0].filterByRole && el.getAttribute('role') !== arguments[0].filterByRole) return;

        const attributes = {};
        for (let i = 0; i < el.attributes.length; i++) {
          const attr = el.attributes[i];
          attributes[attr.name] = attr.value;
        }

        results.push({
          tagName,
          text: text.substring(0, 100),
          attributes,
          position: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          isVisible
        });
      });

      return results;
    `, options);

    return this.generateSmartSelectors(elements as any[]);
  }

  private generateSmartSelectors(elements: any[]): SmartElementSelector[] {
    return elements.map(el => {
      let selector = '';
      let confidence = 0;
      let strategy: SmartElementSelector['strategy'] = 'css';

      if (el.attributes['data-testid']) {
        selector = `[data-testid="${el.attributes['data-testid']}"]`;
        confidence = 0.95;
        strategy = 'testid';
      } else if (el.attributes.id) {
        selector = `#${el.attributes.id}`;
        confidence = 0.9;
        strategy = 'id';
      } else if (el.attributes.role) {
        selector = `[role="${el.attributes.role}"]`;
        confidence = 0.8;
        strategy = 'role';
      } else if (el.text && el.text.length < 50 && el.text.length > 3) {
        selector = `//*[contains(text(),"${el.text}")]`;
        confidence = 0.7;
        strategy = 'text';
      } else if (el.attributes.class) {
        const classes = el.attributes.class.split(' ').filter((c: string) => c.length > 0);
        if (classes.length > 0) {
          selector = `.${classes.filter((c: string) => c.length > 0).join('.')}`;
          confidence = 0.6;
          strategy = 'class';
        }
      }

      if (!selector) {
        selector = el.tagName;
        confidence = 0.3;
      }

      return {
        selector,
        confidence,
        strategy,
        element: el
      };
    }).sort((a, b) => b.confidence - a.confidence);
  }

  async measurePerformance(sessionId: string): Promise<PerformanceMetrics> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Browser session ${sessionId} not found`);
    }

    session.lastUsed = new Date();
    logger.info('Measuring page performance');

    const perfMetrics = await session.driver.executeScript(`
      const navigation = performance.getEntriesByType('navigation')[0];
      const paint = performance.getEntriesByType('paint');
      const fcp = paint.find(p => p.name === 'first-contentful-paint')?.startTime || 0;

      return {
        navigationTime: navigation ? navigation.loadEventEnd - navigation.fetchStart : 0,
        domContentLoaded: navigation ? navigation.domContentLoadedEventEnd - navigation.fetchStart : 0,
        loadComplete: navigation ? navigation.loadEventEnd - navigation.fetchStart : 0,
        firstContentfulPaint: fcp,
        largestContentfulPaint: 0,
        firstInputDelay: 0,
        cumulativeLayoutShift: 0,
        totalBlockingTime: 0
      };
    `) as Omit<PerformanceMetrics, 'memoryUsage'>;

    try {
      const memoryInfo = await session.driver.executeScript(`
        const memory = performance.memory;
        if (memory) {
          return {
            usedJSSize: memory.usedJSHeapSize,
            totalJSSize: memory.totalJSHeapSize,
            usedJSMemory: memory.usedJSHeapSize
          };
        }
        return undefined;
      `);

      if (memoryInfo) {
        return { ...perfMetrics, memoryUsage: memoryInfo as { usedJSSize: number; totalJSSize: number; usedJSMemory: number; } };
      }
    } catch (error) {
      logger.debug('Memory metrics not available', { error: error.message });
    }

    return perfMetrics as PerformanceMetrics;
  }

  async performVisualRegression(
    sessionId: string,
    testName: string,
    options: {
      threshold?: number;
      fullPage?: boolean;
      clip?: { x: number; y: number; width: number; height: number };
      updateBaseline?: boolean;
    } = {}
  ): Promise<VisualComparisonResult> {
    logger.info('Performing visual regression test', { sessionId, testName });

    const screenshot = await this.takeScreenshot(sessionId, {
      fullPage: options.fullPage ?? true,
    });

    const baselinePath = path.join(this.baselineDir, `${testName}.png`);
    const currentPath = path.join(this.screenshotDir, `${testName}_current.png`);

    fs.writeFileSync(currentPath, screenshot);

    if (options.updateBaseline || !fs.existsSync(baselinePath)) {
      fs.writeFileSync(baselinePath, screenshot);
      return {
        matched: true,
        difference: 0,
        threshold: options.threshold || 0.1,
        baselineExists: false
      };
    }

    const baseline = fs.readFileSync(baselinePath);
    const difference = await this.compareImages(baseline, screenshot);
    const threshold = options.threshold || 0.1;
    const matched = difference <= threshold;

    if (!matched) {
      const diffPath = path.join(this.screenshotDir, `${testName}_diff.png`);
      fs.writeFileSync(diffPath, screenshot);
    }

    return {
      matched,
      difference,
      threshold,
      baselineExists: true
    };
  }

  private async compareImages(baseline: Buffer, current: Buffer): Promise<number> {
    // Simplified comparison - in production, use a proper image diff library like pixelmatch
    if (baseline.length !== current.length) {
      return 1.0; // 100% different
    }

    let differences = 0;
    for (let i = 0; i < baseline.length; i++) {
      if (baseline[i] !== current[i]) {
        differences++;
      }
    }

    return differences / baseline.length;
  }

  async waitForPageLoad(sessionId: string, options: {
    waitUntil?: 'complete' | 'interactive';
    timeout?: number;
  } = {}): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Browser session ${sessionId} not found`);
    }

    session.lastUsed = new Date();
    const timeout = options.timeout || 30000;
    const waitUntil = options.waitUntil || 'complete';

    logger.debug('Waiting for page load', { sessionId, waitUntil, timeout });

    await session.driver.wait(
      async () => {
        const readyState = await session.driver.executeScript('return document.readyState');
        return readyState === waitUntil;
      },
      timeout
    );

    logger.debug('Page load completed', { sessionId });
  }

  getSessionStats(): {
    activeSessions: number;
    sessionIds: string[];
  } {
    return {
      activeSessions: this.sessions.size,
      sessionIds: Array.from(this.sessions.keys()),
    };
  }

  getSession(sessionId: string): BrowserSession | undefined {
    return this.sessions.get(sessionId);
  }

  async autoScroll(sessionId: string, options: {
    direction?: 'down' | 'up';
    distance?: number;
    speed?: 'slow' | 'medium' | 'fast';
  } = {}): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Browser session ${sessionId} not found`);
    }

    session.lastUsed = new Date();
    const direction = options.direction || 'down';
    const distance = options.distance || 500;
    const speed = options.speed || 'medium';

    const scrollDelay = speed === 'slow' ? 200 : speed === 'medium' ? 100 : 50;

    logger.debug('Auto scrolling page', { sessionId, direction, distance, speed });

    const scrollStep = 50;
    const steps = Math.floor(distance / scrollStep);

    for (let i = 0; i < steps; i++) {
      const scrollY = direction === 'down' ? scrollStep : -scrollStep;

      await session.driver.executeScript(`window.scrollBy(0, ${scrollY})`);
      await session.driver.sleep(scrollDelay);
    }
  }
}

export const chromeDriverService = new ChromeDriverService();
// Updated Chrome flags - restart trigger