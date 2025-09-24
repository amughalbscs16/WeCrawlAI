/**
 * Smart Action Selector for RL Web Exploration
 * Maps appropriate actions to different element types based on their properties
 */

import { WebDriver, WebElement } from 'selenium-webdriver';
import { logger } from '../utils/logger';

export enum ElementCategory {
  NAVIGATION = 'navigation',
  FORM_INPUT = 'form_input',
  BUTTON = 'button',
  DROPDOWN = 'dropdown',
  CHECKBOX_RADIO = 'checkbox_radio',
  LINK = 'link',
  MEDIA = 'media',
  TEXT_CONTENT = 'text_content',
  MODAL_POPUP = 'modal_popup',
  SEARCH = 'search',
  SOCIAL = 'social',
  INTERACTIVE = 'interactive'
}

export interface ElementAction {
  element: any;
  category: ElementCategory;
  priority: number;
  possibleActions: string[];
  recommendedAction: string;
  value?: string;
}

export class SmartActionSelector {

  /**
   * Analyze page and categorize all important elements
   */
  static analyzePageElements(elements: any[]): ElementAction[] {
    const categorizedElements: ElementAction[] = [];

    for (const element of elements) {
      const category = this.categorizeElement(element);
      if (category) {
        const elementAction = this.createElementAction(element, category);
        if (elementAction) {
          categorizedElements.push(elementAction);
        }
      }
    }

    // Sort by priority
    return categorizedElements.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Categorize an element based on its properties
   */
  private static categorizeElement(element: any): ElementCategory | null {
    const tag = element.tagName?.toLowerCase();
    const type = element.type?.toLowerCase();
    const role = element.role?.toLowerCase();
    const text = element.text?.toLowerCase() || '';
    const className = element.className?.toLowerCase() || '';
    const id = element.id?.toLowerCase() || '';
    const href = element.attributes?.href || '';

    // Navigation elements
    if (tag === 'nav' || role === 'navigation' ||
        className.includes('nav') || className.includes('menu')) {
      return ElementCategory.NAVIGATION;
    }

    // Search inputs
    if ((type === 'search' || type === 'text') &&
        (id.includes('search') || className.includes('search') ||
         element.placeholder?.toLowerCase().includes('search'))) {
      return ElementCategory.SEARCH;
    }

    // Form inputs
    if (tag === 'input' || tag === 'textarea') {
      if (type === 'checkbox' || type === 'radio') {
        return ElementCategory.CHECKBOX_RADIO;
      }
      return ElementCategory.FORM_INPUT;
    }

    // Dropdowns/Selects
    if (tag === 'select' || role === 'combobox' ||
        className.includes('dropdown') || className.includes('select')) {
      return ElementCategory.DROPDOWN;
    }

    // Buttons
    if (tag === 'button' || type === 'button' || type === 'submit' ||
        role === 'button' || className.includes('btn')) {
      return ElementCategory.BUTTON;
    }

    // Links
    if (tag === 'a' && href) {
      // Check for social links
      if (href.includes('facebook') || href.includes('twitter') ||
          href.includes('instagram') || href.includes('linkedin') ||
          href.includes('youtube')) {
        return ElementCategory.SOCIAL;
      }
      return ElementCategory.LINK;
    }

    // Media elements
    if (tag === 'img' || tag === 'video' || tag === 'audio' ||
        tag === 'iframe' || tag === 'embed') {
      return ElementCategory.MEDIA;
    }

    // Modal/Popup triggers
    if (className.includes('modal') || className.includes('popup') ||
        className.includes('dialog') || element.attributes?.['data-toggle'] === 'modal') {
      return ElementCategory.MODAL_POPUP;
    }

    // Interactive elements
    if (element.isClickable && !element.isInputable) {
      return ElementCategory.INTERACTIVE;
    }

    // Text content
    if (tag === 'p' || tag === 'div' || tag === 'span' ||
        tag === 'h1' || tag === 'h2' || tag === 'h3') {
      return ElementCategory.TEXT_CONTENT;
    }

    return null;
  }

  /**
   * Create action mapping for categorized element
   */
  private static createElementAction(element: any, category: ElementCategory): ElementAction | null {
    let priority = 0;
    let possibleActions: string[] = [];
    let recommendedAction = '';
    let value: string | undefined;

    switch (category) {
      case ElementCategory.SEARCH:
        priority = 10;
        possibleActions = ['type', 'clear_and_type', 'submit'];
        recommendedAction = 'type';
        value = this.generateSearchQuery();
        break;

      case ElementCategory.NAVIGATION:
        priority = 8;
        possibleActions = ['click', 'hover'];
        recommendedAction = 'click';
        break;

      case ElementCategory.BUTTON:
        priority = 7;
        possibleActions = ['click', 'hover'];
        recommendedAction = 'click';
        // Skip destructive buttons
        if (this.isDestructiveButton(element)) {
          priority = 0;
        }
        break;

      case ElementCategory.LINK:
        priority = 6;
        possibleActions = ['click', 'hover', 'open_new_tab'];
        recommendedAction = 'click';
        // External links have lower priority
        if (element.attributes?.target === '_blank') {
          priority = 3;
        }
        break;

      case ElementCategory.FORM_INPUT:
        priority = 5;
        possibleActions = ['type', 'clear', 'focus'];
        recommendedAction = 'type';
        value = this.generateInputValue(element);
        break;

      case ElementCategory.DROPDOWN:
        priority = 4;
        possibleActions = ['select_option', 'open'];
        recommendedAction = 'select_option';
        break;

      case ElementCategory.CHECKBOX_RADIO:
        priority = 3;
        possibleActions = ['toggle', 'check', 'uncheck'];
        recommendedAction = 'toggle';
        break;

      case ElementCategory.MODAL_POPUP:
        priority = 2;
        possibleActions = ['click', 'close'];
        recommendedAction = 'click';
        break;

      case ElementCategory.MEDIA:
        priority = 1;
        possibleActions = ['click', 'hover', 'scroll_to'];
        recommendedAction = 'hover';
        break;

      case ElementCategory.SOCIAL:
        priority = 1;
        possibleActions = ['click', 'hover'];
        recommendedAction = 'hover';
        break;

      case ElementCategory.INTERACTIVE:
        priority = 2;
        possibleActions = ['click', 'hover'];
        recommendedAction = 'click';
        break;

      case ElementCategory.TEXT_CONTENT:
        priority = 0;
        possibleActions = ['scroll_to', 'highlight'];
        recommendedAction = 'scroll_to';
        break;
    }

    // Filter out non-visible or disabled elements
    if (!element.isVisible || element.disabled) {
      return null;
    }

    return {
      element,
      category,
      priority,
      possibleActions,
      recommendedAction,
      value
    };
  }

  /**
   * Check if button is destructive
   */
  private static isDestructiveButton(element: any): boolean {
    const text = (element.text || '').toLowerCase();
    const destructiveKeywords = [
      'delete', 'remove', 'cancel', 'close', 'logout', 'signout',
      'deactivate', 'unsubscribe', 'clear', 'reset', 'discard'
    ];

    return destructiveKeywords.some(keyword => text.includes(keyword));
  }

  /**
   * Generate appropriate search queries
   */
  private static generateSearchQuery(): string {
    const queries = [
      'travel destinations',
      'best restaurants',
      'tourist attractions',
      'hotels near me',
      'things to do',
      'local events',
      'weather forecast',
      'flight deals',
      'vacation packages',
      'city guides'
    ];

    return queries[Math.floor(Math.random() * queries.length)];
  }

  /**
   * Generate context-appropriate input values
   */
  private static generateInputValue(element: any): string {
    const type = element.type?.toLowerCase();
    const name = element.name?.toLowerCase() || '';
    const placeholder = element.placeholder?.toLowerCase() || '';
    const id = element.id?.toLowerCase() || '';

    // Email inputs
    if (type === 'email' || name.includes('email') || placeholder.includes('email')) {
      return `test${Math.floor(Math.random() * 1000)}@example.com`;
    }

    // Name inputs
    if (name.includes('name') || placeholder.includes('name') || id.includes('name')) {
      if (name.includes('first') || placeholder.includes('first')) {
        return 'John';
      }
      if (name.includes('last') || placeholder.includes('last')) {
        return 'Doe';
      }
      return 'John Doe';
    }

    // Phone inputs
    if (type === 'tel' || name.includes('phone') || placeholder.includes('phone')) {
      return '555-123-' + Math.floor(Math.random() * 9000 + 1000);
    }

    // Date inputs
    if (type === 'date') {
      const date = new Date();
      date.setDate(date.getDate() + Math.floor(Math.random() * 30));
      return date.toISOString().split('T')[0];
    }

    // Number inputs
    if (type === 'number') {
      const min = parseInt(element.min) || 1;
      const max = parseInt(element.max) || 100;
      return String(Math.floor(Math.random() * (max - min + 1) + min));
    }

    // Password inputs
    if (type === 'password') {
      return 'TestPass123!';
    }

    // URL inputs
    if (type === 'url' || name.includes('url') || placeholder.includes('url')) {
      return 'https://example.com';
    }

    // Default text input
    return 'Test input ' + Math.floor(Math.random() * 100);
  }

  /**
   * Select best action for current state
   */
  static selectSmartAction(elements: any[], previousActions: any[] = []): ElementAction | null {
    const elementActions = this.analyzePageElements(elements);

    // Research-based improvement: Action type diversity tracking (Mughal et al.)
    const recentActionTypes = previousActions
      .slice(-3)
      .map(a => a.type)
      .filter(t => t);

    // Filter out elements we've recently interacted with
    const recentSelectors = previousActions
      .slice(-5)
      .map(a => a.target?.selector)
      .filter(s => s);

    // Intrinsic curiosity-driven filtering: Prioritize unexplored action types
    let availableActions = elementActions.filter(ea =>
      !recentSelectors.includes(ea.element.selector)
    );

    // Apply diversity bonus: Prefer actions not recently performed
    const diverseActions = availableActions.filter(ea =>
      !recentActionTypes.includes(ea.recommendedAction)
    );

    // Use diverse actions if available, otherwise fall back to all available
    const candidateActions = diverseActions.length > 0 ? diverseActions : availableActions;

    if (candidateActions.length === 0) {
      // If all elements were recently interacted with, force exploration with scroll
      return this.createScrollAction();
    }

    // Dynamic exploration-exploitation balance (research-backed)
    const explorationRate = Math.max(0.1, 0.5 - (previousActions.length * 0.02));
    const topActions = candidateActions.slice(0, 5);

    if (topActions.length > 0) {
      if (Math.random() < explorationRate) {
        // Exploration: Random selection from top candidates
        return topActions[Math.floor(Math.random() * topActions.length)];
      } else {
        // Exploitation: Select highest priority with diversity bonus
        return topActions[0];
      }
    }

    return candidateActions[0] || this.createScrollAction();
  }

  /**
   * Create a scroll action when no other actions are suitable
   */
  private static createScrollAction(): ElementAction {
    return {
      element: { selector: 'body', tagName: 'body' },
      category: ElementCategory.INTERACTIVE,
      priority: 1,
      possibleActions: ['scroll'],
      recommendedAction: 'scroll',
      value: Math.random() > 0.5 ? 'down' : 'up'
    };
  }

  /**
   * Get action distribution statistics
   */
  static getActionDistribution(elements: any[]): Map<ElementCategory, number> {
    const distribution = new Map<ElementCategory, number>();
    const elementActions = this.analyzePageElements(elements);

    for (const ea of elementActions) {
      const count = distribution.get(ea.category) || 0;
      distribution.set(ea.category, count + 1);
    }

    return distribution;
  }
}

export default SmartActionSelector;