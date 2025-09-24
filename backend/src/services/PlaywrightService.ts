import { chromium, firefox, webkit, Browser, BrowserContext, Page, Locator, devices, Route } from 'playwright';
import { logger } from '../utils/logger';
import { TestExecutionOptions } from './TestExecutionService';
import * as fs from 'fs';
import * as path from 'path';
import { performance } from 'perf_hooks';
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

export interface NetworkInterception {
  url: string | RegExp;
  method?: string;
  response?: {
    status?: number;
    body?: string | Buffer;
    headers?: Record<string, string>;
  };
  delay?: number;
  abort?: boolean;
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
  browser: Browser;
  contexts: Map<string, BrowserContext>;
  createdAt: Date;
  lastUsed: Date;
  config: BrowserConfig;
  isReusable: boolean;
}

export class PlaywrightService {
  private browsers: Map<string, Browser> = new Map();
  private sessions: Map<string, BrowserSession> = new Map();
  private contexts: Map<string, BrowserContext> = new Map();
  private baselineScreenshots: Map<string, Buffer> = new Map();
  private performanceBaselines: Map<string, PerformanceMetrics> = new Map();
  private networkInterceptions: Map<string, NetworkInterception[]> = new Map();
  private screenshotDir: string;
  private baselineDir: string;
  private sessionTimeout: number = 30 * 60 * 1000; // 30 minutes

  constructor() {
    this.screenshotDir = path.join(process.cwd(), 'screenshots');
    this.baselineDir = path.join(process.cwd(), 'baselines');
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

  async createBrowser(options: BrowserConfig): Promise<Browser> {
    const browserType = options.browser || 'chromium';

    logger.info('Creating browser instance', {
      type: browserType,
      headless: options.headless,
      viewport: options.viewport,
    });

    let browser: Browser;

    const launchOptions = {
      headless: options.headless ?? false,
      slowMo: 100,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
      ],
      timeout: options.timeout || 30000,
    };

    switch (browserType) {
      case 'firefox':
        browser = await firefox.launch(launchOptions);
        break;
      case 'webkit':
        browser = await webkit.launch(launchOptions);
        break;
      case 'chromium':
      default:
        browser = await chromium.launch(launchOptions);
        break;
    }

    const browserId = `browser_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.browsers.set(browserId, browser);

    logger.info('Browser created successfully', {
      browserId,
      type: browserType,
    });

    return browser;
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

    const browserType = options.browser || 'chromium';
    const sessionId = uuidv4();

    logger.info('Creating new browser session', {
      sessionId,
      type: browserType,
      headless: options.headless,
      viewport: options.viewport,
      deviceName: options.deviceName,
      reusable
    });

    const launchOptions = {
      headless: options.headless ?? false,
      slowMo: options.deviceName ? 50 : 100, // Faster for mobile devices
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--enable-features=NetworkService,NetworkServiceLogging',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding'
      ],
      timeout: options.timeout || 30000,
    };

    let browser: Browser;
    switch (browserType) {
      case 'firefox':
        browser = await firefox.launch(launchOptions);
        break;
      case 'webkit':
        browser = await webkit.launch(launchOptions);
        break;
      case 'chromium':
      default:
        browser = await chromium.launch(launchOptions);
        break;
    }

    const session: BrowserSession = {
      id: sessionId,
      browser,
      contexts: new Map(),
      createdAt: new Date(),
      lastUsed: new Date(),
      config: options,
      isReusable: reusable
    };

    this.sessions.set(sessionId, session);
    this.browsers.set(sessionId, browser);

    logger.info('Browser session created successfully', {
      sessionId,
      type: browserType,
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
      sessionConfig.browser === requestedConfig.browser &&
      sessionConfig.headless === requestedConfig.headless &&
      sessionConfig.deviceName === requestedConfig.deviceName &&
      JSON.stringify(sessionConfig.viewport) === JSON.stringify(requestedConfig.viewport)
    );
  }

  async createContext(sessionId: string, options: BrowserConfig = {}): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Browser session ${sessionId} not found`);
    }

    session.lastUsed = new Date();
    const contextId = uuidv4();

    // Device emulation setup
    let contextOptions: any = {
      ignoreHTTPSErrors: options.ignoreHTTPSErrors ?? true,
      userAgent: options.userAgent,
      extraHTTPHeaders: options.extraHTTPHeaders,
      httpCredentials: options.httpCredentials,
      offline: options.offline ?? false,
      colorScheme: options.colorScheme ?? 'light',
      reducedMotion: options.reducedMotion ?? 'no-preference',
      recordVideo: options.recordVideo ? {
        dir: this.screenshotDir,
        size: options.viewport || { width: 1280, height: 720 }
      } : undefined,
      recordHar: options.recordHar ? {
        path: path.join(this.screenshotDir, `${contextId}.har`)
      } : undefined
    };

    // Apply device emulation if specified
    if (options.deviceName && devices[options.deviceName]) {
      const deviceConfig = devices[options.deviceName];
      contextOptions = { ...contextOptions, ...deviceConfig };
      logger.info('Applying device emulation', {
        sessionId,
        contextId,
        device: options.deviceName,
        viewport: deviceConfig.viewport
      });
    } else if (options.viewport) {
      contextOptions.viewport = options.viewport;
    }

    // Set geolocation if specified
    if (options.geolocation) {
      contextOptions.geolocation = options.geolocation;
      contextOptions.permissions = ['geolocation', ...(options.permissions || [])];
    }

    const context = await session.browser.newContext(contextOptions);
    session.contexts.set(contextId, context);
    this.contexts.set(contextId, context);

    // Set cookies if specified
    if (options.cookies && options.cookies.length > 0) {
      await context.addCookies(options.cookies);
    }

    logger.info('Browser context created', {
      sessionId,
      contextId,
      deviceEmulation: !!options.deviceName,
      viewport: contextOptions.viewport
    });

    return contextId;
  }

  async takeScreenshot(page: Page, options?: {
    fullPage?: boolean;
    quality?: number;
    type?: 'png' | 'jpeg';
  }): Promise<Buffer> {
    return await page.screenshot({
      fullPage: options?.fullPage ?? true,
      quality: options?.quality,
      type: options?.type || 'png',
    });
  }

  async waitForElement(
    page: Page,
    selector: string,
    options?: {
      timeout?: number;
      state?: 'attached' | 'detached' | 'visible' | 'hidden';
    }
  ): Promise<void> {
    await page.waitForSelector(selector, {
      timeout: options?.timeout || 30000,
      state: options?.state || 'visible',
    });
  }

  async smartClick(page: Page, selector: string, options?: {
    timeout?: number;
    force?: boolean;
    trial?: boolean;
  }): Promise<void> {
    await this.waitForElement(page, selector, { state: 'visible' });
    await page.locator(selector).scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.click(selector, {
      timeout: options?.timeout || 30000,
    });
    logger.debug('Smart click performed', { selector });
  }

  async smartType(page: Page, selector: string, text: string, options?: {
    delay?: number;
    timeout?: number;
    clear?: boolean;
  }): Promise<void> {
    await this.waitForElement(page, selector, { state: 'visible' });
    await page.locator(selector).scrollIntoViewIfNeeded();

    if (options?.clear !== false) {
      await page.fill(selector, '');
    }

    await page.type(selector, text, {
      delay: options?.delay || 50,
      timeout: options?.timeout || 30000,
    });

    logger.debug('Smart type performed', { selector, text: text.substring(0, 50) + '...' });
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      // Close all contexts in the session
      for (const [contextId, context] of session.contexts.entries()) {
        try {
          await context.close();
          this.contexts.delete(contextId);
        } catch (error) {
          logger.error('Error closing context', { sessionId, contextId, error: error.message });
        }
      }

      // Close the browser
      try {
        await session.browser.close();
      } catch (error) {
        logger.error('Error closing browser', { sessionId, error: error.message });
      }

      this.sessions.delete(sessionId);
      this.browsers.delete(sessionId);
      this.networkInterceptions.delete(sessionId);

      logger.info('Browser session closed', { sessionId });
    }
  }

  async closeContext(contextId: string): Promise<void> {
    const context = this.contexts.get(contextId);
    if (context) {
      await context.close();
      this.contexts.delete(contextId);

      // Remove from session tracking
      for (const session of this.sessions.values()) {
        if (session.contexts.has(contextId)) {
          session.contexts.delete(contextId);
          break;
        }
      }

      logger.info('Browser context closed', { contextId });
    }
  }

  async closeBrowser(browserId: string): Promise<void> {
    // Legacy method - maintain backward compatibility
    await this.closeSession(browserId);
  }

  async closeAllBrowsers(): Promise<void> {
    const closingPromises = Array.from(this.browsers.entries()).map(async ([id, browser]) => {
      try {
        await browser.close();
        this.browsers.delete(id);
        logger.info('Browser closed during cleanup', { browserId: id });
      } catch (error) {
        logger.error('Error closing browser during cleanup', {
          browserId: id,
          error: error.message,
        });
      }
    });

    await Promise.all(closingPromises);
    logger.info('All browsers closed');
  }

  async discoverElements(page: Page, options: ElementDiscoveryOptions = {}): Promise<SmartElementSelector[]> {
    logger.info('Discovering page elements with AI guidance');

    const elements = await page.$$eval('*', (els, opts) => {
      const results: any[] = [];
      const maxDepth = opts.maxDepth || 10;

      function getElementDepth(element: Element): number {
        let depth = 0;
        let parent = element.parentElement;
        while (parent && depth < maxDepth) {
          depth++;
          parent = parent.parentElement;
        }
        return depth;
      }

      els.forEach(el => {
        if (getElementDepth(el) > maxDepth) return;

        const rect = el.getBoundingClientRect();
        const isVisible = rect.width > 0 && rect.height > 0 &&
                         window.getComputedStyle(el).visibility !== 'hidden' &&
                         window.getComputedStyle(el).display !== 'none';

        if (!opts.includeHidden && !isVisible) return;

        const text = el.textContent?.trim() || '';
        const tagName = el.tagName.toLowerCase();

        if (opts.filterByText && !text.toLowerCase().includes(opts.filterByText.toLowerCase())) return;
        if (opts.filterByRole && el.getAttribute('role') !== opts.filterByRole) return;

        const attributes: Record<string, string> = {};
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
    }, options);

    return this.generateSmartSelectors(elements);
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
        selector = `:text("${el.text}")`;
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

  async measurePerformance(page: Page): Promise<PerformanceMetrics> {
    logger.info('Measuring page performance');

    const perfMetrics = await page.evaluate(() => {
      const navigation = (performance as any).getEntriesByType('navigation')[0] as any;
      const paint = (performance as any).getEntriesByType('paint') as any[];
      const fcp = paint.find((p: any) => p.name === 'first-contentful-paint')?.startTime || 0;

      return {
        navigationTime: navigation ? navigation.loadEventEnd - navigation.fetchStart : 0,
        domContentLoaded: navigation ? navigation.domContentLoadedEventEnd - navigation.fetchStart : 0,
        loadComplete: navigation ? navigation.loadEventEnd - navigation.fetchStart : 0,
        firstContentfulPaint: fcp,
        // These would need additional setup for real measurement
        largestContentfulPaint: 0,
        firstInputDelay: 0,
        cumulativeLayoutShift: 0,
        totalBlockingTime: 0
      };
    }) as Omit<PerformanceMetrics, 'memoryUsage'>;

    try {
      const memoryInfo = await page.evaluate(() => {
        const memory = (performance as any).memory;
        if (memory) {
          return {
            usedJSSize: memory.usedJSHeapSize,
            totalJSSize: memory.totalJSHeapSize,
            usedJSMemory: memory.usedJSHeapSize
          };
        }
        return undefined;
      });

      if (memoryInfo) {
        return { ...perfMetrics, memoryUsage: memoryInfo };
      }
    } catch (error) {
      logger.debug('Memory metrics not available', { error: error.message });
    }

    return perfMetrics as PerformanceMetrics;
  }

  async performVisualRegression(
    page: Page,
    testName: string,
    options: {
      threshold?: number;
      fullPage?: boolean;
      clip?: { x: number; y: number; width: number; height: number };
      updateBaseline?: boolean;
    } = {}
  ): Promise<VisualComparisonResult> {
    logger.info('Performing visual regression test', { testName });

    const screenshot = await page.screenshot({
      fullPage: options.fullPage ?? true,
      clip: options.clip,
      type: 'png'
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
      fs.writeFileSync(diffPath, screenshot); // In a real implementation, this would be a diff image
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

  async smartWaitForElement(
    page: Page,
    selector: string,
    options: {
      timeout?: number;
      condition?: 'visible' | 'attached' | 'stable' | 'enabled';
      retryInterval?: number;
      customCondition?: (element: Locator) => Promise<boolean>;
    } = {}
  ): Promise<Locator> {
    const timeout = options.timeout || 30000;
    const retryInterval = options.retryInterval || 500;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const element = page.locator(selector);

        switch (options.condition) {
          case 'visible':
            await element.waitFor({ state: 'visible', timeout: retryInterval });
            break;
          case 'attached':
            await element.waitFor({ state: 'attached', timeout: retryInterval });
            break;
          case 'stable':
            await this.waitForElementStable(element, retryInterval);
            break;
          case 'enabled':
            await element.waitFor({ state: 'visible', timeout: retryInterval });
            if (!(await element.isEnabled())) {
              throw new Error('Element not enabled');
            }
            break;
          default:
            await element.waitFor({ state: 'visible', timeout: retryInterval });
        }

        if (options.customCondition && !(await options.customCondition(element))) {
          throw new Error('Custom condition not met');
        }

        return element;
      } catch (error) {
        if (Date.now() - startTime >= timeout) {
          throw new Error(`Smart wait timeout for selector: ${selector}`);
        }
        await page.waitForTimeout(retryInterval);
      }
    }

    throw new Error(`Smart wait timeout for selector: ${selector}`);
  }

  private async waitForElementStable(element: Locator, timeout: number): Promise<void> {
    let lastPosition: any = null;
    const checkInterval = 100;
    const stableTime = 500;
    let stableStart = 0;

    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const box = await element.boundingBox();

        if (lastPosition &&
            box &&
            Math.abs(box.x - lastPosition.x) < 1 &&
            Math.abs(box.y - lastPosition.y) < 1 &&
            Math.abs(box.width - lastPosition.width) < 1 &&
            Math.abs(box.height - lastPosition.height) < 1) {

          if (stableStart === 0) {
            stableStart = Date.now();
          } else if (Date.now() - stableStart >= stableTime) {
            return; // Element is stable
          }
        } else {
          stableStart = 0;
        }

        lastPosition = box;
        await new Promise(resolve => setTimeout(resolve, checkInterval));
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, checkInterval));
      }
    }
  }

  async autoScroll(page: Page, options: {
    direction?: 'down' | 'up' | 'left' | 'right';
    distance?: number;
    speed?: 'slow' | 'medium' | 'fast';
    waitForImages?: boolean;
  } = {}): Promise<void> {
    const direction = options.direction || 'down';
    const distance = options.distance || 500;
    const speed = options.speed || 'medium';

    const scrollDelay = speed === 'slow' ? 200 : speed === 'medium' ? 100 : 50;

    logger.debug('Auto scrolling page', { direction, distance, speed });

    const scrollStep = 50;
    const steps = Math.floor(distance / scrollStep);

    for (let i = 0; i < steps; i++) {
      let deltaX = 0;
      let deltaY = 0;

      switch (direction) {
        case 'down': deltaY = scrollStep; break;
        case 'up': deltaY = -scrollStep; break;
        case 'right': deltaX = scrollStep; break;
        case 'left': deltaX = -scrollStep; break;
      }

      await page.mouse.wheel(deltaX, deltaY);
      await page.waitForTimeout(scrollDelay);

      if (options.waitForImages) {
        await this.waitForImages(page);
      }
    }
  }

  private async waitForImages(page: Page, timeout: number = 5000): Promise<void> {
    try {
      await page.waitForFunction(
        () => {
          const images = Array.from(document.querySelectorAll('img'));
          return images.every(img => img.complete || img.naturalHeight > 0);
        },
        undefined,
        { timeout }
      );
    } catch (error) {
      logger.debug('Some images may not have loaded within timeout');
    }
  }

  async waitForPageLoad(page: Page, options: {
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
    timeout?: number;
    waitForImages?: boolean;
    waitForFonts?: boolean;
  } = {}): Promise<void> {
    const waitUntil = options.waitUntil || 'networkidle';
    const timeout = options.timeout || 30000;

    logger.debug('Waiting for page load', { waitUntil, timeout });

    await page.waitForLoadState(waitUntil as any, { timeout });

    if (options.waitForImages) {
      await this.waitForImages(page, 10000);
    }

    if (options.waitForFonts) {
      await page.waitForFunction(
        () => document.fonts.ready,
        undefined,
        { timeout: 5000 }
      ).catch(() => {
        logger.debug('Fonts may not have loaded completely');
      });
    }

    logger.debug('Page load completed');
  }

  getContexts(): Map<string, BrowserContext> {
    return this.contexts;
  }

  getBrowserStats(): {
    activeBrowsers: number;
    browserIds: string[];
  } {
    return {
      activeBrowsers: this.browsers.size,
      browserIds: Array.from(this.browsers.keys()),
    };
  }

  async testCrossBrowser(
    url: string,
    testFunction: (page: Page, browserType: string) => Promise<void>,
    browsers: ('chromium' | 'firefox' | 'webkit')[] = ['chromium', 'firefox', 'webkit']
  ): Promise<Record<string, { success: boolean; error?: string; duration: number }>> {
    const results: Record<string, { success: boolean; error?: string; duration: number }> = {};

    for (const browserType of browsers) {
      const startTime = Date.now();

      try {
        logger.info('Starting cross-browser test', { browserType, url });

        const sessionId = await this.createBrowserSession({ browser: browserType });
        const contextId = await this.createContext(sessionId);
        const context = this.contexts.get(contextId)!;
        const page = await context.newPage();

        await page.goto(url);
        await this.waitForPageLoad(page);

        await testFunction(page, browserType);

        await this.closeSession(sessionId);

        results[browserType] = {
          success: true,
          duration: Date.now() - startTime
        };

        logger.info('Cross-browser test completed', { browserType, success: true });

      } catch (error) {
        results[browserType] = {
          success: false,
          error: error.message,
          duration: Date.now() - startTime
        };

        logger.error('Cross-browser test failed', {
          browserType,
          error: error.message
        });
      }
    }

    return results;
  }

  async simulateDeviceConditions(page: Page, conditions: {
    offline?: boolean;
    slowNetwork?: boolean;
    lowCpu?: boolean;
    lowMemory?: boolean;
  }): Promise<void> {
    logger.info('Simulating device conditions', conditions);

    if (conditions.offline) {
      await page.context().setOffline(true);
    }

    if (conditions.slowNetwork) {
      // Simulate 3G network
      await page.route('**/*', (route) => {
        setTimeout(() => {
          route.continue();
        }, Math.random() * 2000 + 500); // 500-2500ms delay
      });
    }

    if (conditions.lowCpu) {
      // Add CPU throttling simulation
      await page.addInitScript(() => {
        const originalSetTimeout = window.setTimeout;
        (window as any).setTimeout = function(callback: TimerHandler, delay?: number, ...args: any[]) {
          return originalSetTimeout(callback, (delay || 0) * 2, ...args); // Double delays
        };
      });
    }

    if (conditions.lowMemory) {
      // Simulate memory pressure
      await page.addInitScript(() => {
        // Override memory-intensive operations
        const originalAddEventListener = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function(type, listener, options) {
          // Limit event listeners to simulate memory constraints
          if (Math.random() > 0.7) {
            return originalAddEventListener.call(this, type, listener, options);
          }
        };
      });
    }
  }
}