/**
 * Simplified RL Exploration Service
 * Single focused approach using minimized HTML for efficient exploration
 */

import { WebDriver, By } from 'selenium-webdriver';
import { logger } from '../utils/logger';
import { multiModalStateCaptureService } from './StateCapture/MultiModalStateCaptureService';
import { ImportantElementFilter, FilteredElement } from './ImportantElementFilter';
import { chromeDriverService } from './ChromeDriverService';
import { reportsService } from './ReportsService';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

interface SimplifiedAction {
  type: 'click' | 'type' | 'scroll' | 'navigate' | 'wait' | 'back' | 'forward';
  element?: FilteredElement;
  selector?: string;
  value?: string;
  timestamp: Date;
  success: boolean;
  elementId?: string;
}

interface ExplorationState {
  url: string;
  minimizedHtml: string;
  elements: FilteredElement[];
  timestamp: Date;
}

interface SimplifiedSession {
  id: string;
  startUrl: string;
  browserSessionId: string;
  reportId?: string; // ID of the associated report
  states: ExplorationState[];
  actions: SimplifiedAction[];
  clickedElements: Map<string, Set<string>>; // URL -> Set of element IDs
  visitedUrls: Set<string>;
  stuckCounter: number;
  lastActionSuccess: boolean;
  consecutiveScrolls: number; // Track consecutive scroll actions
  maxScrollsPerPage: number; // Maximum scrolls allowed per page
}

export class SimplifiedRLExploration {
  private sessions: Map<string, SimplifiedSession> = new Map();
  private explorationDataDir: string;

  constructor() {
    this.explorationDataDir = path.join(process.cwd(), 'exploration_data');
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    const dirs = [
      this.explorationDataDir,
      path.join(this.explorationDataDir, 'simplified_sessions')
    ];
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Start a simplified exploration session
   */
  async startSession(startUrl: string): Promise<string> {
    const sessionId = uuidv4();
    logger.info('Starting simplified exploration session', { sessionId, startUrl });

    const browserSessionId = await chromeDriverService.createBrowserSession({
      headless: false,
      timeout: 300000,
      viewport: { width: 1280, height: 720 },
      enableSecurity: true
    });

    await chromeDriverService.navigateToUrl(browserSessionId, startUrl);

    // Start a new report for this exploration session
    const reportId = reportsService.startReport(sessionId, startUrl);

    const session: SimplifiedSession = {
      id: sessionId,
      startUrl,
      browserSessionId,
      reportId,
      states: [],
      actions: [],
      clickedElements: new Map(),
      visitedUrls: new Set([this.normalizeUrl(startUrl)]),
      stuckCounter: 0,
      lastActionSuccess: true,
      consecutiveScrolls: 0,
      maxScrollsPerPage: 3
    };

    this.sessions.set(sessionId, session);

    // Capture initial state
    await this.captureState(sessionId);

    logger.info('Simplified session started', { sessionId });
    return sessionId;
  }

  /**
   * Perform one exploration step
   */
  async exploreStep(sessionId: string): Promise<{
    action: SimplifiedAction;
    newState: ExplorationState;
    done: boolean;
  }> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const currentState = session.states[session.states.length - 1];
    const driver = this.getDriver(session.browserSessionId);

    // Select next action using simplified logic
    const action = await this.selectNextAction(session, currentState);

    // Execute action
    await this.executeAction(driver, action);
    session.actions.push(action);

    // Track consecutive scrolls
    if (action.type === 'scroll') {
      session.consecutiveScrolls++;
    } else {
      session.consecutiveScrolls = 0;
    }

    // Update stuck counter based on action success and scroll limits
    if (!action.success || session.consecutiveScrolls >= session.maxScrollsPerPage) {
      session.stuckCounter++;
    } else {
      session.stuckCounter = Math.max(0, session.stuckCounter - 1);
    }
    session.lastActionSuccess = action.success;

    // Capture new state
    const newState = await this.captureState(sessionId);

    // Add step to report with screenshot
    if (session.reportId) {
      await reportsService.addStep(
        session.reportId,
        session.browserSessionId,
        {
          action: action.type,
          url: newState.url,
          elementSelector: action.selector,
          elementText: action.element?.text?.substring(0, 50),
          success: action.success
        }
      );
    }

    // Check if we should end
    const done = session.actions.length >= 100 || session.stuckCounter >= 5;

    // Finalize report if exploration is done
    if (done && session.reportId) {
      reportsService.finalizeReport(session.reportId);
    }

    logger.info('Exploration step completed', {
      sessionId,
      actionType: action.type,
      actionSuccess: action.success,
      currentUrl: newState.url,
      stuckCounter: session.stuckCounter,
      totalActions: session.actions.length
    });

    return { action, newState, done };
  }

  /**
   * Select the next action using simplified logic focused on minimized HTML
   */
  private async selectNextAction(session: SimplifiedSession, state: ExplorationState): Promise<SimplifiedAction> {
    const currentUrl = this.normalizeUrl(state.url);

    // Extract domain from start URL and current URL
    const startDomain = this.extractDomain(session.startUrl);
    const currentDomain = this.extractDomain(state.url);

    // CRITICAL: Check if we're on a special URL (data:, about:blank, etc)
    // These URLs appear after going back from the initial page
    // We should navigate to the start URL to return to the actual page
    const isSpecialUrl = state.url.startsWith('data:') ||
                        state.url.startsWith('about:') ||
                        state.url === '' ||
                        state.url === 'about:blank';

    if (isSpecialUrl) {
      logger.info('⚠️ On special URL, navigating to start URL to return to actual page', {
        currentUrl: state.url,
        targetUrl: session.startUrl
      });

      // Navigate directly to the start URL instead of using forward/back
      return {
        type: 'navigate',
        value: session.startUrl,
        timestamp: new Date(),
        success: false
      };
    }

    // Check if we've left the target domain
    // Only go back if:
    // 1. We have valid domains for both URLs
    // 2. Current domain is different from start domain
    // 3. It's not a subdomain of the target domain
    if (startDomain && currentDomain && currentDomain !== startDomain) {
      // Allow subdomains of the same domain
      const isSubdomain = currentDomain.endsWith('.' + startDomain) ||
                         startDomain.endsWith('.' + currentDomain);

      if (!isSubdomain) {
        logger.info('🚫 Left target domain, navigating back', {
          targetDomain: startDomain,
          currentDomain: currentDomain,
          currentUrl: state.url
        });

        return {
          type: 'back',
          timestamp: new Date(),
          success: false
        };
      }
    }

    // Check if we're on a dead-end page (no elements or only scrolled recently)
    const noElementsOnPage = state.elements.length === 0;
    const onlyScrolledRecently = session.consecutiveScrolls >= 2;

    // Check if this is the start page - we should never leave it via back navigation
    const isStartPage = this.normalizeUrl(state.url) === this.normalizeUrl(session.startUrl);

    // If stuck on a real page with no elements or only scrolling, go back
    // BUT: Never go back from the start page to avoid the data:, loop
    if (!isStartPage && (noElementsOnPage || (onlyScrolledRecently && state.elements.length < 3))) {
      logger.info('🔙 Dead-end detected, navigating back', {
        currentUrl,
        elementCount: state.elements.length,
        consecutiveScrolls: session.consecutiveScrolls
      });

      return {
        type: 'back',
        timestamp: new Date(),
        success: false
      };
    }

    // If we're stuck (too many failures), try to navigate away
    if (session.stuckCounter >= 3) {
      logger.info('Stuck detected, attempting recovery', {
        stuckCounter: session.stuckCounter,
        currentUrl
      });

      // Try to find a navigation link to leave the page
      const navElements = state.elements.filter(el =>
        (el.tagName === 'a' && el.href && !el.href.startsWith('#')) ||
        (el.text && (el.text.includes('Home') || el.text.includes('Back')))
      );

      if (navElements.length > 0) {
        const navElement = navElements[Math.floor(Math.random() * navElements.length)];
        return {
          type: 'click',
          element: navElement,
          selector: navElement.selector,
          timestamp: new Date(),
          success: false,
          elementId: this.getElementId(navElement)
        };
      }

      // Otherwise go back
      logger.info('🔙 No navigation links found, going back');
      return {
        type: 'back',
        timestamp: new Date(),
        success: false
      };
    }

    // Get clicked elements for this URL
    const clickedOnPage = session.clickedElements.get(currentUrl) || new Set();

    // Track recent visits (last 10 URLs) - increased to catch more patterns
    const recentUrls = session.states.slice(-10).map(s => this.normalizeUrl(s.url));

    // Count how many times we've visited home and about recently
    const recentHomeCount = recentUrls.filter(url => url === 'https://www.iana.org/').length;
    const recentAboutCount = recentUrls.filter(url => url.includes('/about')).length;

    // If we're stuck in a loop between home and about, try to break out
    const isStuckInLoop = recentHomeCount >= 3 && recentAboutCount >= 3;

    // Filter out already clicked elements and score remaining ones
    const scoredElements = state.elements
      .map(el => {
        const elementId = this.getElementId(el);
        const wasClicked = clickedOnPage.has(elementId);

        let score = 0;

        // Heavily penalize already clicked elements
        if (wasClicked) {
          score -= 100;
        }

        // Check if link leads to a visited URL
        if (el.href) {
          const linkUrl = this.normalizeUrl(el.href);
          const linkDomain = this.extractDomain(el.href);

          // Check if link goes to external domain
          const startDomain = this.extractDomain(session.startUrl);
          const isExternalLink = linkDomain && startDomain && linkDomain !== startDomain;

          // Heavily penalize external links (except for known subdomains)
          if (isExternalLink) {
            // Allow subdomains of the same domain
            const isSubdomain = linkDomain.endsWith('.' + startDomain) || startDomain.endsWith('.' + linkDomain);
            if (!isSubdomain) {
              score -= 100;
              logger.debug('Penalizing external link', {
                href: el.href,
                linkDomain,
                targetDomain: startDomain
              });
            }
          }

          // Check for common navigation patterns that lead back to home or about
          const linkText = (el.text || '').toLowerCase();
          const isHomeLink = linkText.includes('home') || linkText.includes('iana') ||
                            linkUrl.includes('icann.org') || linkText.includes('introduction') ||
                            linkText.includes('news') || linkText.includes('domain names') ||
                            linkText.includes('numbers') || linkText.includes('protocols');
          const isAboutLink = linkText.includes('about') || linkText.includes('archive') ||
                             linkText.includes('contact') || linkText.includes('terms') ||
                             linkText.includes('excellence') || linkText.includes('audits');

          // If we're stuck in a loop, massively penalize links that go back to home/about
          if (isStuckInLoop) {
            if ((currentUrl.includes('/about') && isHomeLink) ||
                (currentUrl === 'https://www.iana.org/' && isAboutLink)) {
              score -= 150;
              logger.info('🚫 LOOP DETECTED - Heavily penalizing navigation link', {
                href: el.href,
                text: el.text?.substring(0, 30),
                currentUrl,
                recentHomeCount,
                recentAboutCount
              });
            }
          }

          // Special handling for links that commonly redirect back
          if (currentUrl.includes('/about') && isHomeLink) {
            // From about page, links like "ICANN" go to home
            const targetUrl = 'https://www.iana.org/';
            if (recentUrls.includes(targetUrl)) {
              score -= 80;
              logger.info('Penalizing link that redirects to recent home', {
                href: el.href,
                text: el.text?.substring(0, 30),
                targetUrl
              });
            }
          } else if (currentUrl === 'https://www.iana.org/' && isAboutLink) {
            // From home page, about-type links go to about
            const targetUrl = 'https://www.iana.org/about';
            if (recentUrls.includes(targetUrl)) {
              score -= 80;
              logger.info('Penalizing link that redirects to recent about', {
                href: el.href,
                text: el.text?.substring(0, 30),
                targetUrl
              });
            }
          }

          // Heavily penalize links to recently visited URLs
          if (recentUrls.includes(linkUrl)) {
            score -= 50;
            logger.info('Penalizing link to recent URL', {
              href: el.href,
              text: el.text?.substring(0, 30)
            });
          }

          // Moderately penalize any previously visited URL
          if (session.visitedUrls.has(linkUrl)) {
            score -= 20;
          }

          // Prefer external links when stuck in loop
          if (isStuckInLoop && !linkUrl.includes('iana.org')) {
            score += 30;
            logger.info('Boosting external link to break loop', {
              href: el.href
            });
          }
        }

        // Score based on element type and properties
        if (el.tagName === 'button' || el.tagName === 'a') {
          score += 5;
        }

        if (el.isClickable) {
          score += 3;
        }

        if (el.tagName === 'input' && el.isInputable) {
          score += 4;
        }

        // Prefer elements with meaningful text
        if (el.text && el.text.length > 2 && el.text.length < 50) {
          score += 2;
        }

        // Check for navigation indicators
        const text = (el.text || '').toLowerCase();
        if (text.includes('next') || text.includes('search') || text.includes('submit')) {
          score += 3;
        }

        // Avoid social media and external links
        if (el.href && (el.href.includes('facebook') || el.href.includes('twitter'))) {
          score -= 5;
        }

        // Add small random factor
        score += Math.random() * 0.5;

        return { element: el, score, wasClicked };
      })
      .filter(item => item.score > -50) // Filter out heavily penalized elements
      .sort((a, b) => b.score - a.score);

    // Log exploration state for debugging
    logger.info('Action selection state', {
      url: currentUrl,
      totalElements: state.elements.length,
      clickedCount: clickedOnPage.size,
      viableElements: scoredElements.filter(s => !s.wasClicked).length,
      recentUrls: recentUrls,
      visitedUrlsCount: session.visitedUrls.size,
      topScores: scoredElements.slice(0, 3).map(s => ({
        score: s.score,
        tagName: s.element.tagName,
        text: s.element.text?.substring(0, 30),
        href: s.element.href?.substring(0, 50),
        wasClicked: s.wasClicked
      }))
    });

    // Select best unclicked element
    const unclickedElements = scoredElements.filter(s => !s.wasClicked);

    if (unclickedElements.length === 0) {
      // Check if we've scrolled too much on this page
      if (session.consecutiveScrolls >= session.maxScrollsPerPage) {
        logger.info('Reached scroll limit on page, attempting to navigate away', {
          consecutiveScrolls: session.consecutiveScrolls,
          currentUrl
        });

        // Try to find any link to navigate away
        const anyLink = state.elements.find(el =>
          el.tagName === 'a' && el.href && !el.href.startsWith('#')
        );

        if (anyLink) {
          return {
            type: 'click',
            element: anyLink,
            selector: anyLink.selector,
            timestamp: new Date(),
            success: false,
            elementId: this.getElementId(anyLink)
          };
        }
      }

      // No unclicked elements, try scrolling if not at limit
      logger.info('No unclicked elements found, scrolling', {
        consecutiveScrolls: session.consecutiveScrolls
      });
      return {
        type: 'scroll',
        value: 'down',
        timestamp: new Date(),
        success: false
      };
    }

    // Pick from top candidates with some randomness
    const topCandidates = unclickedElements.slice(0, 5);
    const selected = topCandidates[Math.floor(Math.random() * topCandidates.length)];
    const element = selected.element;

    // Determine action type
    let actionType: SimplifiedAction['type'] = 'click';
    let value: string | undefined;

    if (element.tagName === 'input' && element.isInputable) {
      actionType = 'type';
      value = this.generateInputValue(element);
    }

    // Record this element as clicked for this URL
    if (!session.clickedElements.has(currentUrl)) {
      session.clickedElements.set(currentUrl, new Set());
    }
    const elementId = this.getElementId(element);
    session.clickedElements.get(currentUrl)!.add(elementId);

    logger.info('🎯 Selected action - Clicking element', {
      type: actionType,
      elementTag: element.tagName,
      elementText: element.text?.substring(0, 50),
      elementSelector: element.selector,
      elementType: element.type || 'no-type',
      elementLabel: element.label || 'no-label',
      elementHref: element.href || 'no-href',
      score: selected.score,
      currentUrl: currentUrl,
      elementIndex: topCandidates.indexOf(selected)
    });

    return {
      type: actionType,
      element,
      selector: element.selector,
      value,
      timestamp: new Date(),
      success: false,
      elementId
    };
  }

  /**
   * Execute an action
   */
  private async executeAction(driver: WebDriver, action: SimplifiedAction): Promise<void> {
    try {
      switch (action.type) {
        case 'click':
          if (action.selector) {
            await driver.executeScript(`
              const el = document.querySelector('${action.selector}');
              if (el) {
                el.scrollIntoView({behavior: 'smooth', block: 'center'});
                setTimeout(() => el.click(), 500);
              }
            `);
            await driver.sleep(1000);
          }
          break;

        case 'type':
          if (action.selector && action.value) {
            await driver.executeScript(`
              const el = document.querySelector('${action.selector}');
              if (el) {
                el.scrollIntoView({behavior: 'smooth', block: 'center'});
                el.value = '${action.value}';
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
              }
            `);
            await driver.sleep(500);
          }
          break;

        case 'scroll':
          const direction = action.value || 'down';
          const scrollAmount = 400;
          if (direction === 'down') {
            await driver.executeScript(`window.scrollBy(0, ${scrollAmount})`);
          } else {
            await driver.executeScript(`window.scrollBy(0, -${scrollAmount})`);
          }
          await driver.sleep(500);
          break;

        case 'navigate':
          if (action.value) {
            await driver.get(action.value);
            await driver.sleep(2000);
          }
          break;

        case 'wait':
          await driver.sleep(parseInt(action.value || '1000'));
          break;

        case 'back':
          await driver.navigate().back();
          await driver.sleep(1000);
          logger.info('🔙 Navigated back');
          break;
        case 'forward':
          await driver.navigate().forward();
          await driver.sleep(1000);
          logger.info('➡️ Navigated forward');
          break;
      }

      action.success = true;
    } catch (error: any) {
      action.success = false;
      logger.warn('Action execution failed', {
        type: action.type,
        error: error.message
      });
    }
  }

  /**
   * Capture current state using minimized HTML
   */
  private async captureState(sessionId: string): Promise<ExplorationState> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const driver = this.getDriver(session.browserSessionId);

    // Get current URL
    const url = await driver.getCurrentUrl();

    // Get page HTML
    const html = await driver.getPageSource();

    // Parse HTML to get interactive elements
    const allElements = await driver.executeScript(`
      const elements = [];
      const interactive = document.querySelectorAll('a, button, input, select, textarea, [onclick], [role="button"]');

      interactive.forEach((el, index) => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight * 2) {
          // Build a unique selector for this element
          let selector = el.tagName.toLowerCase();

          // Prioritize ID if available
          if (el.id) {
            selector = '#' + el.id;
          }
          // For links, use href to make selector unique
          else if (el.tagName.toLowerCase() === 'a' && el.href) {
            selector = 'a[href="' + el.getAttribute('href') + '"]';
          }
          // For buttons with specific text
          else if (el.tagName.toLowerCase() === 'button' && el.textContent) {
            // Use xpath-like selector for button text
            selector = 'button:nth-of-type(' + (Array.from(document.querySelectorAll('button')).indexOf(el) + 1) + ')';
          }
          // For inputs, use name or type
          else if (el.tagName.toLowerCase() === 'input') {
            if (el.name) {
              selector = 'input[name="' + el.name + '"]';
            } else if (el.type) {
              selector = 'input[type="' + el.type + '"]:nth-of-type(' + (Array.from(document.querySelectorAll('input[type="' + el.type + '"]')).indexOf(el) + 1) + ')';
            }
          }
          // Use class if distinctive
          else if (el.className && el.className.split(' ').length <= 3) {
            selector = el.tagName.toLowerCase() + '.' + el.className.split(' ').join('.');
          }
          // Fallback to nth-child
          else {
            const parent = el.parentElement;
            const index = Array.from(parent.children).indexOf(el) + 1;
            selector = el.tagName.toLowerCase() + ':nth-child(' + index + ')';
          }

          elements.push({
            tagName: el.tagName.toLowerCase(),
            text: el.textContent?.trim().substring(0, 100),
            type: el.type,
            href: el.href,
            className: el.className,
            id: el.id,
            selector: selector,
            isClickable: true,
            isInputable: ['input', 'textarea'].includes(el.tagName.toLowerCase()),
            boundingBox: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
              centerX: rect.x + rect.width / 2,
              centerY: rect.y + rect.height / 2
            }
          });
        }
      });

      return elements;
    `) as any[];

    // Filter important elements
    const importantElements = ImportantElementFilter.filterImportantElements(allElements);

    // Create minimized HTML representation
    const minimizedHtml = this.createMinimizedHtml(importantElements);

    // Record URL as visited
    session.visitedUrls.add(this.normalizeUrl(url));

    const state: ExplorationState = {
      url,
      minimizedHtml,
      elements: importantElements,
      timestamp: new Date()
    };

    session.states.push(state);

    logger.debug('State captured', {
      url,
      elementCount: importantElements.length,
      htmlSize: minimizedHtml.length
    });

    return state;
  }

  /**
   * Create minimized HTML representation
   */
  private createMinimizedHtml(elements: FilteredElement[]): string {
    const htmlParts: string[] = [];

    elements.forEach(el => {
      const attrs: string[] = [];
      if (el.href) attrs.push(`href="${el.href}"`);
      if (el.type) attrs.push(`type="${el.type}"`);
      if (el.elementType) attrs.push(`role="${el.elementType}"`);

      const attrString = attrs.length > 0 ? ' ' + attrs.join(' ') : '';
      const text = el.text || '';

      htmlParts.push(`<${el.tagName}${attrString}>${text}</${el.tagName}>`);
    });

    return htmlParts.join('\n');
  }

  /**
   * Generate a unique ID for an element
   */
  private getElementId(element: FilteredElement): string {
    const parts = [
      element.tagName,
      element.selector,
      element.text?.substring(0, 20),
      element.href?.substring(0, 30)
    ].filter(Boolean);

    return parts.join('|');
  }

  /**
   * Generate smart input value
   */
  private generateInputValue(element: FilteredElement): string {
    const type = element.type?.toLowerCase();
    const placeholder = element.placeholder?.toLowerCase();
    const label = element.label?.toLowerCase();
    const ariaLabel = element.ariaLabel?.toLowerCase();

    // Check all text hints
    const hints = [placeholder, label, ariaLabel].filter(Boolean).join(' ');

    if (type === 'email' || hints.includes('email')) {
      return 'test@example.com';
    }
    if (type === 'tel' || hints.includes('phone')) {
      return '555-0123';
    }
    if (type === 'number') {
      return '42';
    }
    if (type === 'date') {
      return '2024-01-15';
    }
    if (type === 'search' || hints.includes('search')) {
      return 'test search query';
    }
    if (hints.includes('name')) {
      return 'Test User';
    }
    if (hints.includes('password')) {
      return 'Test123!';
    }

    return 'test input';
  }

  /**
   * Normalize URL for comparison
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
   * Extract domain from URL
   */
  private extractDomain(url: string): string | null {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return null;
    }
  }

  /**
   * Get driver from session
   */
  private getDriver(browserSessionId: string): WebDriver {
    const browserSession = chromeDriverService.getSession(browserSessionId);
    if (!browserSession) {
      throw new Error(`Browser session ${browserSessionId} not found`);
    }
    return browserSession.driver;
  }

  /**
   * End exploration session
   */
  async endSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Finalize report if it exists
    if (session.reportId) {
      reportsService.finalizeReport(session.reportId);
    }

    // Save session data
    const sessionData = {
      id: session.id,
      startUrl: session.startUrl,
      visitedUrls: Array.from(session.visitedUrls),
      totalActions: session.actions.length,
      successfulActions: session.actions.filter(a => a.success).length,
      states: session.states.map(s => ({
        url: s.url,
        elementCount: s.elements.length,
        timestamp: s.timestamp
      })),
      actions: session.actions.map(a => ({
        type: a.type,
        success: a.success,
        timestamp: a.timestamp
      }))
    };

    const filePath = path.join(this.explorationDataDir, 'simplified_sessions', `${sessionId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(sessionData, null, 2));

    // Close browser
    await chromeDriverService.closeSession(session.browserSessionId);

    // Clean up
    this.sessions.delete(sessionId);

    logger.info('Session ended', {
      sessionId,
      totalActions: session.actions.length,
      visitedUrls: session.visitedUrls.size
    });
  }

  /**
   * Get session statistics
   */
  getSessionStats(sessionId: string): any {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return {
      sessionId: session.id,
      currentUrl: session.states[session.states.length - 1]?.url,
      totalActions: session.actions.length,
      successfulActions: session.actions.filter(a => a.success).length,
      visitedUrls: session.visitedUrls.size,
      stuckCounter: session.stuckCounter,
      clickedElementsOnCurrentPage: session.clickedElements.get(
        this.normalizeUrl(session.states[session.states.length - 1]?.url || '')
      )?.size || 0
    };
  }
}

export const simplifiedRLExploration = new SimplifiedRLExploration();