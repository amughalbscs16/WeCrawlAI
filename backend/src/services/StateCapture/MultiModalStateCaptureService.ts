/**
 * Multi-Modal State Capture Service for RL Web Exploration
 * Captures comprehensive state information including visual, structural, and contextual data
 */

import { WebDriver, By, WebElement, until } from 'selenium-webdriver';
import { logger } from '../../utils/logger';
import {
  ExplorationState,
  DOMSnapshot,
  VisualFeatures,
  AccessibilityTree,
  PageEmbedding,
  InteractiveElement,
  BoundingBox,
  A11yNode,
  LandmarkElement,
  HeadingElement,
  FormElement,
  LinkElement,
  ButtonElement,
  InputElement,
  GridCell,
  VisualCluster,
  PageType
} from '../../types/exploration';
import * as fs from 'fs';
import * as path from 'path';
import { createCanvas, loadImage } from 'canvas';

export class MultiModalStateCaptureService {
  private screenshotDir: string;
  private dataDir: string;

  constructor() {
    this.screenshotDir = path.join(process.cwd(), 'exploration_data', 'screenshots');
    this.dataDir = path.join(process.cwd(), 'exploration_data', 'state_captures');
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    [this.screenshotDir, this.dataDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Capture comprehensive multi-modal state from current page
   */
  async captureState(driver: WebDriver, sessionId: string): Promise<ExplorationState> {
    try {
      logger.info('Starting multi-modal state capture', { sessionId });

      const startTime = Date.now();

      // Capture all components in parallel for efficiency
      const [
        domSnapshot,
        visualFeatures,
        accessibilityTree,
        pageEmbedding
      ] = await Promise.all([
        this.captureDOMSnapshot(driver),
        this.captureVisualFeatures(driver, sessionId),
        this.captureAccessibilityTree(driver),
        this.generatePageEmbedding(driver)
      ]);

      const url = await driver.getCurrentUrl();
      const domain = new URL(url).hostname;
      const pageType = await this.classifyPageType(domSnapshot, url);

      const state: ExplorationState = {
        url,
        domain,
        pageType,
        domSnapshot,
        visualFeatures,
        accessibilityTree,
        pageEmbedding,
        actionHistory: [],
        visitedPages: new Set(),
        sessionStartTime: new Date(),
        currentSessionDuration: 0,
        pagesExplored: 0,
        uniqueActionsPerformed: 0,
        errorsEncountered: 0,
        tasksCompleted: 0,
        confidence: 0.8,
        uncertainty: 0.2,
        explorationStrategy: 'curiosity_driven' as any,
        currentGoals: []
      };

      const captureTime = Date.now() - startTime;
      logger.info('Multi-modal state capture completed', {
        sessionId,
        captureTime,
        elementsFound: domSnapshot.elements.length,
        pageType
      });

      return state;
    } catch (error: any) {
      logger.error('Failed to capture multi-modal state', {
        sessionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Capture and analyze DOM structure with pruning
   */
  async captureDOMSnapshot(driver: WebDriver): Promise<DOMSnapshot> {
    try {
      // Get full HTML
      const html = await driver.executeScript('return document.documentElement.outerHTML') as string;

      // Get page metadata
      const [title, viewport, loadTime] = await Promise.all([
        driver.getTitle(),
        driver.executeScript(`
          return {
            width: window.innerWidth,
            height: window.innerHeight
          }
        `) as Promise<{width: number, height: number}>,
        driver.executeScript(`
          return performance.timing.loadEventEnd - performance.timing.navigationStart
        `) as Promise<number>
      ]);

      const url = await driver.getCurrentUrl();
      const domain = new URL(url).hostname;

      // Extract interactive elements with bounding boxes
      const elements = await this.extractInteractiveElements(driver);

      // Extract specific element types
      const [forms, links, buttons, inputs] = await Promise.all([
        this.extractForms(driver, elements),
        this.extractLinks(driver, elements),
        this.extractButtons(driver, elements),
        this.extractInputs(driver, elements)
      ]);

      // Generate pruned HTML (remove scripts, styles, comments)
      const prunedHtml = this.pruneHTML(html);

      // Check for popups and modals
      const [hasPopups, hasModals] = await Promise.all([
        this.detectPopups(driver),
        this.detectModals(driver)
      ]);

      return {
        html,
        prunedHtml,
        elements,
        forms,
        links,
        buttons,
        inputs,
        metadata: {
          title,
          url,
          domain,
          language: await this.detectLanguage(driver),
          viewport,
          hasPopups,
          hasModals,
          loadTime
        }
      };
    } catch (error: any) {
      logger.error('Failed to capture DOM snapshot', { error: error.message });
      throw error;
    }
  }

  /**
   * Extract all interactive elements with their properties and bounding boxes
   */
  private async extractInteractiveElements(driver: WebDriver): Promise<InteractiveElement[]> {
    const elementsData = await driver.executeScript(`
      const elements = [];
      const interactiveSelectors = [
        'a[href]', 'button', 'input', 'select', 'textarea', 'label',
        '[onclick]', '[role="button"]', '[role="link"]', '[role="tab"]',
        '[role="menuitem"]', '[tabindex]', '[contenteditable]',
        'summary', 'details', '[draggable="true"]'
      ];

      const allInteractive = document.querySelectorAll(interactiveSelectors.join(', '));

      allInteractive.forEach((el, index) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);

        // Skip if element is not visible or has no dimensions
        if (rect.width === 0 || rect.height === 0 ||
            style.visibility === 'hidden' || style.display === 'none') {
          return;
        }

        const element = {
          id: el.id || \`generated_\${index}\`,
          tagName: el.tagName.toLowerCase(),
          type: el.type || null,
          role: el.getAttribute('role') || null,
          ariaLabel: el.getAttribute('aria-label') || null,
          text: el.textContent?.trim().substring(0, 100) || '',
          selector: '',  // Will be generated later
          xpath: '',     // Will be generated later
          boundingBox: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            centerX: Math.round(rect.x + rect.width / 2),
            centerY: Math.round(rect.y + rect.height / 2)
          },
          isVisible: rect.x >= 0 && rect.y >= 0 &&
                    rect.x < window.innerWidth && rect.y < window.innerHeight,
          isClickable: el.tagName.toLowerCase() === 'button' ||
                      el.tagName.toLowerCase() === 'a' ||
                      el.getAttribute('onclick') !== null ||
                      el.getAttribute('role') === 'button',
          isInputable: ['input', 'textarea', 'select'].includes(el.tagName.toLowerCase()) ||
                      el.getAttribute('contenteditable') === 'true',
          attributes: {},
          computedStyles: {
            display: style.display,
            visibility: style.visibility,
            position: style.position,
            zIndex: style.zIndex,
            backgroundColor: style.backgroundColor,
            color: style.color,
            fontSize: style.fontSize,
            fontFamily: style.fontFamily
          },
          confidence: 1.0,
          element: el  // Keep reference for further processing
        };

        // Collect important attributes
        ['id', 'class', 'name', 'value', 'href', 'src', 'alt', 'title', 'placeholder'].forEach(attr => {
          const value = el.getAttribute(attr);
          if (value) element.attributes[attr] = value;
        });

        elements.push(element);
      });

      return elements;
    `) as any[];

    // Generate selectors and XPaths for each element
    const processedElements: InteractiveElement[] = [];

    for (let i = 0; i < elementsData.length; i++) {
      try {
        const elementData = elementsData[i];

        // Generate CSS selector and XPath
        const [selector, xpath] = await Promise.all([
          this.generateCSSSelector(driver, i),
          this.generateXPath(driver, i)
        ]);

        processedElements.push({
          ...elementData,
          selector,
          xpath
        });
      } catch (error) {
        // Skip problematic elements
        logger.warn('Failed to process element', { index: i, error: error.message });
      }
    }

    return processedElements;
  }

  /**
   * Generate optimized CSS selector for element
   */
  private async generateCSSSelector(driver: WebDriver, elementIndex: number): Promise<string> {
    return await driver.executeScript(`
      const elements = document.querySelectorAll('a[href], button, input, select, textarea, label, [onclick], [role="button"], [role="link"], [role="tab"], [role="menuitem"], [tabindex], [contenteditable], summary, details, [draggable="true"]');
      const el = elements[${elementIndex}];
      if (!el) return '';

      // Try different selector strategies in order of preference
      if (el.id) return '#' + el.id;
      if (el.getAttribute('data-testid')) return '[data-testid="' + el.getAttribute('data-testid') + '"]';
      if (el.name) return el.tagName.toLowerCase() + '[name="' + el.name + '"]';
      if (el.className) {
        const classes = el.className.split(' ').filter(c => c.length > 0 && !c.includes(' '));
        if (classes.length > 0) return '.' + classes.join('.');
      }

      // Fallback to nth-child selector
      let selector = el.tagName.toLowerCase();
      let parent = el.parentElement;
      while (parent && parent !== document.body) {
        const siblings = Array.from(parent.children).filter(child => child.tagName === el.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(el) + 1;
          selector = parent.tagName.toLowerCase() + ' > ' + el.tagName.toLowerCase() + ':nth-child(' + index + ')';
        }
        parent = parent.parentElement;
      }

      return selector;
    `) as string;
  }

  /**
   * Generate XPath for element
   */
  private async generateXPath(driver: WebDriver, elementIndex: number): Promise<string> {
    return await driver.executeScript(`
      const elements = document.querySelectorAll('a[href], button, input, select, textarea, label, [onclick], [role="button"], [role="link"], [role="tab"], [role="menuitem"], [tabindex], [contenteditable], summary, details, [draggable="true"]');
      const el = elements[${elementIndex}];
      if (!el) return '';

      function getXPath(element) {
        if (element.id) return '//*[@id="' + element.id + '"]';

        let path = '';
        let current = element;

        while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.documentElement) {
          let index = 0;
          let sibling = current.previousSibling;

          while (sibling) {
            if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName === current.tagName) {
              index++;
            }
            sibling = sibling.previousSibling;
          }

          const tagName = current.tagName.toLowerCase();
          const pathIndex = index > 0 ? '[' + (index + 1) + ']' : '';
          path = '/' + tagName + pathIndex + path;

          current = current.parentElement;
        }

        return '/html' + path;
      }

      return getXPath(el);
    `) as string;
  }

  /**
   * Capture visual features including screenshots and layout analysis
   */
  async captureVisualFeatures(driver: WebDriver, sessionId: string): Promise<VisualFeatures> {
    try {
      // Take full page screenshot
      const screenshot = Buffer.from(await driver.takeScreenshot(), 'base64');
      const timestamp = Date.now();
      const screenshotPath = path.join(this.screenshotDir, `${sessionId}_${timestamp}.png`);
      fs.writeFileSync(screenshotPath, screenshot);

      // Create annotated screenshot with bounding boxes
      const annotatedScreenshot = await this.createAnnotatedScreenshot(driver, screenshot);

      // Analyze layout structure
      const layoutAnalysis = await this.analyzeLayout(driver);

      // Analyze colors and visual properties
      const colorAnalysis = await this.analyzeColors(driver);

      // Analyze text properties
      const textAnalysis = await this.analyzeText(driver);

      // Extract CNN-style visual features (temporarily disabled)
      // const cnnFeatures = await this.extractCNNFeatures(screenshot);

      // Generate element masks for interactive elements (temporarily disabled)
      // const elementMasks = await this.generateElementMasks(driver);

      return {
        screenshot,
        annotatedScreenshot,
        elementMasks: new Map<string, Buffer>(), // placeholder
        layoutAnalysis,
        colorAnalysis,
        textAnalysis
        // cnnFeatures // temporarily disabled
      };
    } catch (error: any) {
      logger.error('Failed to capture visual features', { error: error.message });
      throw error;
    }
  }

  /**
   * Create screenshot with element bounding boxes and labels
   */
  private async createAnnotatedScreenshot(driver: WebDriver, originalScreenshot: Buffer): Promise<Buffer> {
    try {
      // Get viewport dimensions
      const viewport = await driver.executeScript(`
        return { width: window.innerWidth, height: window.innerHeight }
      `) as { width: number, height: number };

      // Create canvas and load original screenshot
      const canvas = createCanvas(viewport.width, viewport.height);
      const ctx = canvas.getContext('2d');
      const image = await loadImage(originalScreenshot);

      // Draw original screenshot
      ctx.drawImage(image, 0, 0);

      // Get interactive elements with bounding boxes
      const elements = await driver.executeScript(`
        const elements = [];
        const interactiveElements = document.querySelectorAll('a[href], button, input, select, textarea');

        interactiveElements.forEach((el, index) => {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            elements.push({
              index,
              boundingBox: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height
              },
              tagName: el.tagName.toLowerCase(),
              text: el.textContent?.trim().substring(0, 20) || ''
            });
          }
        });

        return elements;
      `) as any[];

      // Draw bounding boxes and labels
      ctx.strokeStyle = '#FF6B6B';
      ctx.fillStyle = '#FF6B6B';
      ctx.lineWidth = 2;
      ctx.font = '12px Arial';

      elements.forEach((element, index) => {
        const { x, y, width, height } = element.boundingBox;

        // Draw bounding box
        ctx.strokeRect(x, y, width, height);

        // Draw label background
        const label = `${index + 1}: ${element.tagName}`;
        const labelWidth = ctx.measureText(label).width + 6;
        ctx.fillStyle = '#FF6B6B';
        ctx.fillRect(x, y - 20, labelWidth, 18);

        // Draw label text
        ctx.fillStyle = 'white';
        ctx.fillText(label, x + 3, y - 6);
        ctx.fillStyle = '#FF6B6B';
      });

      return canvas.toBuffer('image/png');
    } catch (error: any) {
      logger.error('Failed to create annotated screenshot', { error: error.message });
      return originalScreenshot; // Return original if annotation fails
    }
  }

  /**
   * Additional helper methods for the other components...
   */

  private async extractForms(driver: WebDriver, elements: InteractiveElement[]): Promise<FormElement[]> {
    // Implementation for form extraction
    return [];
  }

  private async extractLinks(driver: WebDriver, elements: InteractiveElement[]): Promise<LinkElement[]> {
    // Implementation for link extraction
    return [];
  }

  private async extractButtons(driver: WebDriver, elements: InteractiveElement[]): Promise<ButtonElement[]> {
    // Implementation for button extraction
    return [];
  }

  private async extractInputs(driver: WebDriver, elements: InteractiveElement[]): Promise<InputElement[]> {
    // Implementation for input extraction
    return [];
  }

  private pruneHTML(html: string): string {
    // Remove scripts, styles, comments, and other non-essential elements
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async detectPopups(driver: WebDriver): Promise<boolean> {
    // Implementation for popup detection
    return false;
  }

  private async detectModals(driver: WebDriver): Promise<boolean> {
    // Implementation for modal detection
    return false;
  }

  private async detectLanguage(driver: WebDriver): Promise<string> {
    try {
      return await driver.executeScript(`
        return document.documentElement.lang ||
               document.querySelector('meta[http-equiv="content-language"]')?.content ||
               'en';
      `) as string;
    } catch {
      return 'en';
    }
  }

  private async captureAccessibilityTree(driver: WebDriver): Promise<AccessibilityTree> {
    try {
      // Extract accessibility information using JavaScript execution
      const accessibilityData = await driver.executeScript(`
        // Function to extract accessibility properties
        function getAccessibilityInfo(element) {
          const computedStyle = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();

          return {
            id: element.id || null,
            tagName: element.tagName.toLowerCase(),
            role: element.getAttribute('role') || element.tagName.toLowerCase(),
            label: element.getAttribute('aria-label') ||
                   element.getAttribute('aria-labelledby') ||
                   element.textContent?.trim().substring(0, 100) || null,
            description: element.getAttribute('aria-describedby') ||
                        element.getAttribute('title') || null,
            level: element.tagName.match(/^H[1-6]$/) ?
                   parseInt(element.tagName.charAt(1)) : null,
            tabIndex: element.tabIndex,
            focusable: element.tabIndex >= 0 ||
                      ['input', 'button', 'select', 'textarea', 'a'].includes(element.tagName.toLowerCase()),
            disabled: element.disabled || element.getAttribute('aria-disabled') === 'true',
            hidden: element.hidden ||
                   element.getAttribute('aria-hidden') === 'true' ||
                   computedStyle.display === 'none' ||
                   computedStyle.visibility === 'hidden',
            expanded: element.getAttribute('aria-expanded'),
            selected: element.getAttribute('aria-selected'),
            checked: element.checked || element.getAttribute('aria-checked'),
            required: element.required || element.getAttribute('aria-required') === 'true',
            invalid: element.getAttribute('aria-invalid') === 'true',
            multiselectable: element.getAttribute('aria-multiselectable') === 'true',
            orientation: element.getAttribute('aria-orientation'),
            valuemin: element.getAttribute('aria-valuemin'),
            valuemax: element.getAttribute('aria-valuemax'),
            valuenow: element.getAttribute('aria-valuenow'),
            valuetext: element.getAttribute('aria-valuetext'),
            owns: element.getAttribute('aria-owns'),
            controls: element.getAttribute('aria-controls'),
            flowto: element.getAttribute('aria-flowto'),
            position: {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            },
            visible: rect.width > 0 && rect.height > 0 && !element.hidden
          };
        }

        // Collect all elements with accessibility significance
        const results = {
          nodes: [],
          focusableElements: [],
          landmarks: [],
          headingStructure: []
        };

        // Get all elements
        const allElements = document.querySelectorAll('*');

        allElements.forEach(element => {
          const info = getAccessibilityInfo(element);

          // Skip hidden or invisible elements unless they have semantic meaning
          if (info.hidden && !info.role && !info.label) return;

          // Add to main nodes collection
          results.nodes.push(info);

          // Collect focusable elements
          if (info.focusable && !info.disabled && !info.hidden) {
            results.focusableElements.push({
              ...info,
              isInteractive: ['button', 'input', 'select', 'textarea', 'a'].includes(info.tagName),
              hasKeyboardHandler: element.onkeydown || element.onkeyup || element.onkeypress
            });
          }

          // Collect landmark elements
          const landmarkRoles = ['banner', 'navigation', 'main', 'region', 'search',
                                'contentinfo', 'complementary', 'form', 'application'];
          if (landmarkRoles.includes(info.role) ||
              ['header', 'nav', 'main', 'aside', 'footer', 'section'].includes(info.tagName)) {
            results.landmarks.push({
              ...info,
              landmark: info.role || info.tagName
            });
          }

          // Collect heading structure
          if (info.tagName.match(/^h[1-6]$/)) {
            results.headingStructure.push({
              ...info,
              level: info.level,
              text: element.textContent?.trim() || '',
              outline: true
            });
          }
        });

        // Sort heading structure by level and document order
        results.headingStructure.sort((a, b) => {
          if (a.level !== b.level) return a.level - b.level;
          return a.position.y - b.position.y;
        });

        // Sort focusable elements by tab order and position
        results.focusableElements.sort((a, b) => {
          if (a.tabIndex !== b.tabIndex) {
            if (a.tabIndex === -1) return 1;
            if (b.tabIndex === -1) return -1;
            if (a.tabIndex === 0 && b.tabIndex > 0) return 1;
            if (b.tabIndex === 0 && a.tabIndex > 0) return -1;
            return a.tabIndex - b.tabIndex;
          }
          return a.position.y - b.position.y;
        });

        return results;
      `) as any;

      logger.debug('Accessibility tree captured', {
        nodeCount: accessibilityData.nodes?.length || 0,
        focusableCount: accessibilityData.focusableElements?.length || 0,
        landmarkCount: accessibilityData.landmarks?.length || 0,
        headingCount: accessibilityData.headingStructure?.length || 0
      });

      return {
        nodes: accessibilityData.nodes || [],
        focusableElements: accessibilityData.focusableElements || [],
        landmarks: accessibilityData.landmarks || [],
        headingStructure: accessibilityData.headingStructure || []
      };

    } catch (error: any) {
      logger.warn('Failed to capture accessibility tree', {
        error: error.message
      });

      // Return minimal fallback structure
      return {
        nodes: [],
        focusableElements: [],
        landmarks: [],
        headingStructure: []
      };
    }
  }

  private async generatePageEmbedding(driver: WebDriver): Promise<PageEmbedding> {
    // Placeholder implementation - will be enhanced with actual ML models
    return {
      textEmbedding: new Float32Array(768),
      visualEmbedding: new Float32Array(2048),
      structuralEmbedding: new Float32Array(512),
      combinedEmbedding: new Float32Array(1024),
      similarity: {
        semanticSimilarity: 0,
        visualSimilarity: 0,
        structuralSimilarity: 0
      }
    };
  }

  private async classifyPageType(domSnapshot: DOMSnapshot, url: string): Promise<PageType> {
    // Simple heuristic-based page type classification
    const urlLower = url.toLowerCase();
    const titleLower = domSnapshot.metadata.title.toLowerCase();

    if (urlLower.includes('login') || titleLower.includes('login') || titleLower.includes('sign in')) {
      return PageType.LOGIN;
    }
    if (urlLower.includes('register') || urlLower.includes('signup') || titleLower.includes('sign up')) {
      return PageType.SIGNUP;
    }
    if (urlLower.includes('product') && urlLower.includes('id=')) {
      return PageType.PRODUCT_DETAIL;
    }
    if (urlLower.includes('search') || urlLower.includes('results')) {
      return PageType.SEARCH_RESULTS;
    }
    if (urlLower.includes('cart') || urlLower.includes('basket')) {
      return PageType.CART;
    }
    if (urlLower.includes('checkout')) {
      return PageType.CHECKOUT;
    }

    return PageType.UNKNOWN;
  }

  private async analyzeLayout(driver: WebDriver): Promise<any> {
    // Placeholder for layout analysis
    return {
      columns: 1,
      rows: 1,
      gridStructure: [],
      visualClusters: []
    };
  }

  private async analyzeColors(driver: WebDriver): Promise<any> {
    // Placeholder for color analysis
    return {
      dominantColors: ['#ffffff'],
      colorScheme: 'light',
      contrast: 1.0
    };
  }

  private async analyzeText(driver: WebDriver): Promise<any> {
    // Placeholder for text analysis
    return {
      readabilityScore: 0.8,
      textDensity: 0.5,
      languageDetection: 'en'
    };
  }

  /**
   * Extract CNN-style visual features from screenshot
   * Simulates convolutional neural network feature extraction
   */
  private async extractCNNFeatures(screenshot: Buffer): Promise<any> {
    try {
      const { createCanvas, loadImage } = require('canvas');
      const image = await loadImage(screenshot);
      const canvas = createCanvas(image.width, image.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);

      // Get image data
      const imageData = ctx.getImageData(0, 0, image.width, image.height);
      const data = imageData.data;

      // Extract various visual features
      const features = {
        // Color-based features (simulating early CNN layers)
        colorHistogram: this.calculateColorHistogram(data),
        edgeFeatures: this.detectEdges(data, image.width, image.height),
        textureFeatures: this.analyzeTexture(data, image.width, image.height),

        // Spatial features (simulating intermediate CNN layers)
        spatialDistribution: this.analyzeSpatialDistribution(data, image.width, image.height),
        regionOfInterest: this.detectRegionsOfInterest(data, image.width, image.height),

        // High-level features (simulating deep CNN layers)
        layoutPatterns: this.analyzeLayoutPatterns(data, image.width, image.height),
        visualComplexity: this.calculateVisualComplexity(data, image.width, image.height),
        symmetryFeatures: this.analyzeSymmetry(data, image.width, image.height),

        // CNN-inspired feature vectors
        convolutionalFeatures: this.extractConvolutionalFeatures(data, image.width, image.height),
        poolingFeatures: this.extractPoolingFeatures(data, image.width, image.height),

        // Meta information
        dimensions: { width: image.width, height: image.height },
        timestamp: Date.now()
      };

      logger.debug('CNN features extracted', {
        featureCount: Object.keys(features).length,
        imageSize: `${image.width}x${image.height}`
      });

      return features;

    } catch (error: any) {
      logger.warn('Failed to extract CNN features', { error: error.message });
      return {
        colorHistogram: { r: [], g: [], b: [] },
        edgeFeatures: { edgeCount: 0, edgeDensity: 0 },
        textureFeatures: { roughness: 0, uniformity: 0 },
        spatialDistribution: { hotspots: [] },
        regionOfInterest: { regions: [] },
        layoutPatterns: { gridLike: false, symmetrical: false },
        visualComplexity: { score: 0, entropy: 0 },
        symmetryFeatures: { horizontal: 0, vertical: 0 },
        convolutionalFeatures: new Float32Array(128),
        poolingFeatures: new Float32Array(64),
        dimensions: { width: 0, height: 0 },
        timestamp: Date.now()
      };
    }
  }

  /**
   * Generate masks for interactive elements for attention-based learning
   */
  private async generateElementMasks(driver: WebDriver): Promise<Map<string, Buffer>> {
    try {
      const elementMasks = new Map<string, Buffer>();

      // Get interactive elements with their positions
      const interactiveElements = await driver.executeScript(`
        const elements = Array.from(document.querySelectorAll(
          'button, input, select, textarea, a, [onclick], [role="button"], [tabindex]'
        ));

        return elements.map(el => {
          const rect = el.getBoundingClientRect();
          return {
            id: el.id || Math.random().toString(36).substr(2, 9),
            tagName: el.tagName.toLowerCase(),
            type: el.type || null,
            role: el.getAttribute('role') || el.tagName.toLowerCase(),
            position: {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            },
            visible: rect.width > 0 && rect.height > 0,
            text: el.textContent?.trim().substring(0, 50) || ''
          };
        }).filter(el => el.visible && el.position.width > 5 && el.position.height > 5);
      `) as any[];

      // Get viewport size
      const viewport = await driver.executeScript(`
        return {
          width: window.innerWidth,
          height: window.innerHeight
        };
      `) as { width: number; height: number };

      // Create masks for each element type
      const elementTypes = ['button', 'input', 'link', 'interactive'];

      for (const elementType of elementTypes) {
        const mask = await this.createElementMask(
          interactiveElements.filter(el =>
            elementType === 'interactive' ||
            el.tagName === elementType ||
            (elementType === 'link' && el.tagName === 'a')
          ),
          viewport.width,
          viewport.height
        );
        elementMasks.set(elementType, mask);
      }

      logger.debug('Element masks generated', {
        maskCount: elementMasks.size,
        elementCount: interactiveElements.length
      });

      return elementMasks;

    } catch (error: any) {
      logger.warn('Failed to generate element masks', { error: error.message });
      return new Map();
    }
  }

  // CNN Feature extraction helper methods
  private calculateColorHistogram(data: Uint8ClampedArray): { r: number[]; g: number[]; b: number[] } {
    const rHist = new Array(256).fill(0);
    const gHist = new Array(256).fill(0);
    const bHist = new Array(256).fill(0);

    for (let i = 0; i < data.length; i += 4) {
      rHist[data[i]]++;
      gHist[data[i + 1]]++;
      bHist[data[i + 2]]++;
    }

    return { r: rHist, g: gHist, b: bHist };
  }

  private detectEdges(data: Uint8ClampedArray, width: number, height: number): any {
    // Simplified edge detection using Sobel operator
    let edgeCount = 0;
    const threshold = 50;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];

        // Simplified gradient calculation
        const gx = Math.abs(data[idx + 4] - data[idx - 4]);
        const gy = Math.abs(data[idx + width * 4] - data[idx - width * 4]);
        const gradient = Math.sqrt(gx * gx + gy * gy);

        if (gradient > threshold) edgeCount++;
      }
    }

    return {
      edgeCount,
      edgeDensity: edgeCount / (width * height),
      averageGradient: edgeCount > 0 ? edgeCount / (width * height) : 0
    };
  }

  private analyzeTexture(data: Uint8ClampedArray, width: number, height: number): any {
    // Simplified texture analysis
    let variance = 0;
    let mean = 0;
    const pixelCount = width * height;

    // Calculate mean
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      mean += gray;
    }
    mean /= pixelCount;

    // Calculate variance
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      variance += Math.pow(gray - mean, 2);
    }
    variance /= pixelCount;

    return {
      roughness: Math.sqrt(variance) / 255,
      uniformity: 1 - (variance / (255 * 255)),
      contrast: variance / (mean + 1)
    };
  }

  private analyzeSpatialDistribution(data: Uint8ClampedArray, width: number, height: number): any {
    // Divide image into grid and analyze distribution
    const gridSize = 8;
    const cellWidth = Math.floor(width / gridSize);
    const cellHeight = Math.floor(height / gridSize);
    const hotspots: any[] = [];

    for (let gy = 0; gy < gridSize; gy++) {
      for (let gx = 0; gx < gridSize; gx++) {
        let intensity = 0;
        let pixels = 0;

        for (let y = gy * cellHeight; y < (gy + 1) * cellHeight && y < height; y++) {
          for (let x = gx * cellWidth; x < (gx + 1) * cellWidth && x < width; x++) {
            const idx = (y * width + x) * 4;
            const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            intensity += gray;
            pixels++;
          }
        }

        const avgIntensity = pixels > 0 ? intensity / pixels : 0;
        if (avgIntensity > 150) { // Threshold for hotspots
          hotspots.push({
            x: gx * cellWidth,
            y: gy * cellHeight,
            width: cellWidth,
            height: cellHeight,
            intensity: avgIntensity
          });
        }
      }
    }

    return { hotspots, gridSize, cellSize: { width: cellWidth, height: cellHeight } };
  }

  private detectRegionsOfInterest(data: Uint8ClampedArray, width: number, height: number): any {
    // Simplified ROI detection based on color variance
    const regions: any[] = [];
    const blockSize = 64;

    for (let y = 0; y < height; y += blockSize) {
      for (let x = 0; x < width; x += blockSize) {
        let variance = 0;
        let mean = 0;
        let pixels = 0;

        // Calculate block statistics
        for (let by = y; by < Math.min(y + blockSize, height); by++) {
          for (let bx = x; bx < Math.min(x + blockSize, width); bx++) {
            const idx = (by * width + bx) * 4;
            const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            mean += gray;
            pixels++;
          }
        }
        mean /= pixels;

        for (let by = y; by < Math.min(y + blockSize, height); by++) {
          for (let bx = x; bx < Math.min(x + blockSize, width); bx++) {
            const idx = (by * width + bx) * 4;
            const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            variance += Math.pow(gray - mean, 2);
          }
        }
        variance /= pixels;

        if (variance > 1000) { // Threshold for interesting regions
          regions.push({
            x, y,
            width: Math.min(blockSize, width - x),
            height: Math.min(blockSize, height - y),
            variance,
            mean,
            interestScore: variance / 10000
          });
        }
      }
    }

    return { regions: regions.slice(0, 10) }; // Top 10 regions
  }

  private analyzeLayoutPatterns(data: Uint8ClampedArray, width: number, height: number): any {
    // Analyze grid-like patterns and symmetry
    return {
      gridLike: this.detectGridPattern(data, width, height),
      symmetrical: this.checkSymmetry(data, width, height),
      alignment: this.analyzeAlignment(data, width, height)
    };
  }

  private calculateVisualComplexity(data: Uint8ClampedArray, width: number, height: number): any {
    // Calculate entropy and complexity measures
    const histogram = new Array(256).fill(0);
    const totalPixels = width * height;

    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.floor(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      histogram[gray]++;
    }

    let entropy = 0;
    for (let i = 0; i < 256; i++) {
      if (histogram[i] > 0) {
        const p = histogram[i] / totalPixels;
        entropy -= p * Math.log2(p);
      }
    }

    return {
      entropy: entropy / 8, // Normalized
      score: Math.min(entropy / 8, 1),
      diversity: histogram.filter(h => h > 0).length / 256
    };
  }

  private analyzeSymmetry(data: Uint8ClampedArray, width: number, height: number): any {
    // Check horizontal and vertical symmetry
    let horizontalSymmetry = 0;
    let verticalSymmetry = 0;
    let comparisons = 0;

    // Check vertical symmetry (left-right)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < Math.floor(width / 2); x++) {
        const leftIdx = (y * width + x) * 4;
        const rightIdx = (y * width + (width - 1 - x)) * 4;

        const leftGray = 0.299 * data[leftIdx] + 0.587 * data[leftIdx + 1] + 0.114 * data[leftIdx + 2];
        const rightGray = 0.299 * data[rightIdx] + 0.587 * data[rightIdx + 1] + 0.114 * data[rightIdx + 2];

        const diff = Math.abs(leftGray - rightGray);
        verticalSymmetry += 1 - (diff / 255);
        comparisons++;
      }
    }

    verticalSymmetry /= comparisons;
    comparisons = 0;

    // Check horizontal symmetry (top-bottom)
    for (let y = 0; y < Math.floor(height / 2); y++) {
      for (let x = 0; x < width; x++) {
        const topIdx = (y * width + x) * 4;
        const bottomIdx = ((height - 1 - y) * width + x) * 4;

        const topGray = 0.299 * data[topIdx] + 0.587 * data[topIdx + 1] + 0.114 * data[topIdx + 2];
        const bottomGray = 0.299 * data[bottomIdx] + 0.587 * data[bottomIdx + 1] + 0.114 * data[bottomIdx + 2];

        const diff = Math.abs(topGray - bottomGray);
        horizontalSymmetry += 1 - (diff / 255);
        comparisons++;
      }
    }

    horizontalSymmetry /= comparisons;

    return {
      horizontal: horizontalSymmetry,
      vertical: verticalSymmetry,
      overall: (horizontalSymmetry + verticalSymmetry) / 2
    };
  }

  private extractConvolutionalFeatures(data: Uint8ClampedArray, width: number, height: number): Float32Array {
    // Simulate convolutional layer features
    const features = new Float32Array(128);
    const kernelSize = 3;

    // Simple convolution kernels
    const kernels = [
      [[-1, -1, -1], [-1, 8, -1], [-1, -1, -1]], // Edge detection
      [[1, 1, 1], [1, 1, 1], [1, 1, 1]], // Blur
      [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], // Vertical edges
      [[-1, -2, -1], [0, 0, 0], [1, 2, 1]]  // Horizontal edges
    ];

    let featureIdx = 0;
    for (const kernel of kernels) {
      for (let y = 1; y < height - 1; y += 8) { // Sample every 8 pixels
        for (let x = 1; x < width - 1; x += 8) {
          let sum = 0;
          for (let ky = 0; ky < kernelSize; ky++) {
            for (let kx = 0; kx < kernelSize; kx++) {
              const idx = ((y + ky - 1) * width + (x + kx - 1)) * 4;
              const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
              sum += gray * kernel[ky][kx];
            }
          }
          if (featureIdx < features.length) {
            features[featureIdx++] = Math.tanh(sum / 255); // Activation function
          }
        }
      }
    }

    return features;
  }

  private extractPoolingFeatures(data: Uint8ClampedArray, width: number, height: number): Float32Array {
    // Simulate pooling layer features (max pooling)
    const features = new Float32Array(64);
    const poolSize = 8;
    let featureIdx = 0;

    for (let y = 0; y < height - poolSize; y += poolSize) {
      for (let x = 0; x < width - poolSize; x += poolSize) {
        let maxValue = 0;
        for (let py = 0; py < poolSize; py++) {
          for (let px = 0; px < poolSize; px++) {
            const idx = ((y + py) * width + (x + px)) * 4;
            const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            maxValue = Math.max(maxValue, gray);
          }
        }
        if (featureIdx < features.length) {
          features[featureIdx++] = maxValue / 255;
        }
      }
    }

    return features;
  }

  private async createElementMask(elements: any[], width: number, height: number): Promise<Buffer> {
    try {
      const { createCanvas } = require('canvas');
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');

      // Create black background
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, width, height);

      // Draw white rectangles for each element
      ctx.fillStyle = 'white';
      elements.forEach(element => {
        ctx.fillRect(
          element.position.x,
          element.position.y,
          element.position.width,
          element.position.height
        );
      });

      return canvas.toBuffer('image/png');
    } catch (error: any) {
      logger.warn('Failed to create element mask', { error: error.message });
      // Return empty buffer
      return Buffer.alloc(0);
    }
  }

  // Additional helper methods for layout analysis
  private detectGridPattern(data: Uint8ClampedArray, width: number, height: number): boolean {
    // Simplified grid detection
    return false; // Placeholder
  }

  private checkSymmetry(data: Uint8ClampedArray, width: number, height: number): boolean {
    // Simplified symmetry check
    return false; // Placeholder
  }

  private analyzeAlignment(data: Uint8ClampedArray, width: number, height: number): any {
    // Simplified alignment analysis
    return { horizontal: 0, vertical: 0 };
  }
}

export const multiModalStateCaptureService = new MultiModalStateCaptureService();