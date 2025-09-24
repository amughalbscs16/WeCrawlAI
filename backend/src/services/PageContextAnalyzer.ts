/**
 * Page Context Analyzer for RL Web Exploration
 * Detects page type and suggests appropriate action patterns
 */

import { logger } from '../utils/logger';

export enum PageType {
  HOMEPAGE = 'homepage',
  LOGIN = 'login',
  REGISTRATION = 'registration',
  SEARCH_RESULTS = 'search_results',
  PRODUCT_LISTING = 'product_listing',
  PRODUCT_DETAIL = 'product_detail',
  SHOPPING_CART = 'shopping_cart',
  CHECKOUT = 'checkout',
  BLOG_ARTICLE = 'blog_article',
  CONTACT = 'contact',
  ABOUT = 'about',
  FORM_PAGE = 'form_page',
  DASHBOARD = 'dashboard',
  SETTINGS = 'settings',
  PROFILE = 'profile',
  GALLERY = 'gallery',
  VIDEO_PAGE = 'video_page',
  ERROR_PAGE = 'error_page',
  UNKNOWN = 'unknown'
}

export interface PageContext {
  type: PageType;
  confidence: number;
  features: {
    hasSearchBox: boolean;
    hasLoginForm: boolean;
    hasRegistrationForm: boolean;
    hasNavigation: boolean;
    hasProducts: boolean;
    hasArticleContent: boolean;
    hasMediaGallery: boolean;
    hasCheckoutFlow: boolean;
    hasDashboard: boolean;
    hasDataTables: boolean;
    formCount: number;
    linkCount: number;
    imageCount: number;
    buttonCount: number;
    inputCount: number;
  };
  suggestedActions: string[];
  urlPatterns: {
    isHomepage: boolean;
    hasAuthPath: boolean;
    hasProductPath: boolean;
    hasCheckoutPath: boolean;
    hasBlogPath: boolean;
    hasSearchParams: boolean;
  };
}

export interface ActionPattern {
  name: string;
  steps: Array<{
    action: string;
    target: string;
    value?: string;
  }>;
  applicablePages: PageType[];
}

export class PageContextAnalyzer {

  /**
   * Analyze page and determine its type and context
   */
  static analyzePageContext(
    url: string,
    elements: any[],
    pageTitle?: string,
    pageText?: string
  ): PageContext {
    const features = this.extractPageFeatures(elements);
    const urlPatterns = this.analyzeUrl(url);
    const pageType = this.detectPageType(url, features, urlPatterns, pageTitle, pageText);
    const suggestedActions = this.getSuggestedActions(pageType, features);

    return {
      type: pageType,
      confidence: this.calculateConfidence(pageType, features, urlPatterns),
      features,
      suggestedActions,
      urlPatterns
    };
  }

  /**
   * Extract feature indicators from page elements
   */
  private static extractPageFeatures(elements: any[]): PageContext['features'] {
    const features = {
      hasSearchBox: false,
      hasLoginForm: false,
      hasRegistrationForm: false,
      hasNavigation: false,
      hasProducts: false,
      hasArticleContent: false,
      hasMediaGallery: false,
      hasCheckoutFlow: false,
      hasDashboard: false,
      hasDataTables: false,
      formCount: 0,
      linkCount: 0,
      imageCount: 0,
      buttonCount: 0,
      inputCount: 0
    };

    const forms = new Set<string>();

    for (const element of elements) {
      const tag = element.tagName?.toLowerCase();
      const type = element.type?.toLowerCase();
      const text = element.text?.toLowerCase() || '';
      const className = element.className?.toLowerCase() || '';
      const id = element.id?.toLowerCase() || '';
      const placeholder = element.placeholder?.toLowerCase() || '';

      // Count basic elements
      if (tag === 'a') features.linkCount++;
      if (tag === 'img') features.imageCount++;
      if (tag === 'button' || type === 'button' || type === 'submit') features.buttonCount++;
      if (tag === 'input' || tag === 'textarea') features.inputCount++;
      if (tag === 'form') forms.add(element.id || element.className || 'form');

      // Search box detection
      if ((type === 'search' || type === 'text') &&
          (id.includes('search') || className.includes('search') ||
           placeholder.includes('search'))) {
        features.hasSearchBox = true;
      }

      // Login form detection
      if ((type === 'password' || type === 'email') &&
          (text.includes('login') || text.includes('sign in') ||
           className.includes('login') || id.includes('login'))) {
        features.hasLoginForm = true;
      }

      // Registration form detection
      if ((text.includes('register') || text.includes('sign up') ||
           text.includes('create account')) &&
          (tag === 'button' || tag === 'a' || tag === 'form')) {
        features.hasRegistrationForm = true;
      }

      // Navigation detection
      if (tag === 'nav' || className.includes('nav') ||
          className.includes('menu') || element.role === 'navigation') {
        features.hasNavigation = true;
      }

      // Product detection
      if (className.includes('product') || className.includes('item') ||
          className.includes('card') || id.includes('product')) {
        features.hasProducts = true;
      }

      // Article content detection
      if (tag === 'article' || className.includes('article') ||
          className.includes('post') || className.includes('content')) {
        features.hasArticleContent = true;
      }

      // Gallery detection
      if (className.includes('gallery') || className.includes('carousel') ||
          className.includes('slider')) {
        features.hasMediaGallery = true;
      }

      // Checkout flow detection
      if (text.includes('checkout') || text.includes('payment') ||
          text.includes('shipping') || className.includes('checkout')) {
        features.hasCheckoutFlow = true;
      }

      // Dashboard detection
      if (className.includes('dashboard') || className.includes('chart') ||
          className.includes('metric') || className.includes('widget')) {
        features.hasDashboard = true;
      }

      // Data table detection
      if (tag === 'table' || className.includes('table') ||
          className.includes('grid')) {
        features.hasDataTables = true;
      }
    }

    features.formCount = forms.size;

    return features;
  }

  /**
   * Analyze URL patterns
   */
  private static analyzeUrl(url: string): PageContext['urlPatterns'] {
    const urlLower = url.toLowerCase();

    return {
      isHomepage: url === '/' || url.endsWith('.com') || url.endsWith('.com/'),
      hasAuthPath: urlLower.includes('login') || urlLower.includes('signin') ||
                   urlLower.includes('register') || urlLower.includes('signup'),
      hasProductPath: urlLower.includes('product') || urlLower.includes('item') ||
                      urlLower.includes('shop') || urlLower.includes('store'),
      hasCheckoutPath: urlLower.includes('checkout') || urlLower.includes('cart') ||
                       urlLower.includes('payment') || urlLower.includes('order'),
      hasBlogPath: urlLower.includes('blog') || urlLower.includes('article') ||
                   urlLower.includes('post') || urlLower.includes('news'),
      hasSearchParams: url.includes('?search=') || url.includes('?q=') ||
                       url.includes('&search=') || url.includes('&q=')
    };
  }

  /**
   * Detect page type based on features and URL
   */
  private static detectPageType(
    url: string,
    features: PageContext['features'],
    urlPatterns: PageContext['urlPatterns'],
    pageTitle?: string,
    pageText?: string
  ): PageType {
    const title = pageTitle?.toLowerCase() || '';
    const text = pageText?.toLowerCase() || '';

    // Error page detection
    if (title.includes('404') || title.includes('error') ||
        text.includes('page not found') || text.includes('error')) {
      return PageType.ERROR_PAGE;
    }

    // Homepage detection
    if (urlPatterns.isHomepage && features.hasNavigation) {
      return PageType.HOMEPAGE;
    }

    // Login page detection
    if (features.hasLoginForm || (urlPatterns.hasAuthPath && features.inputCount >= 2)) {
      return PageType.LOGIN;
    }

    // Registration page detection
    if (features.hasRegistrationForm ||
        (urlPatterns.hasAuthPath && features.inputCount >= 4)) {
      return PageType.REGISTRATION;
    }

    // Search results detection
    if (urlPatterns.hasSearchParams ||
        (features.hasSearchBox && features.hasProducts)) {
      return PageType.SEARCH_RESULTS;
    }

    // Product listing detection
    if (features.hasProducts && features.linkCount > 10) {
      return PageType.PRODUCT_LISTING;
    }

    // Product detail detection
    if (urlPatterns.hasProductPath && features.imageCount > 0 &&
        features.buttonCount > 0) {
      return PageType.PRODUCT_DETAIL;
    }

    // Shopping cart detection
    if (urlPatterns.hasCheckoutPath && features.hasDataTables) {
      return PageType.SHOPPING_CART;
    }

    // Checkout detection
    if (features.hasCheckoutFlow ||
        (urlPatterns.hasCheckoutPath && features.formCount > 0)) {
      return PageType.CHECKOUT;
    }

    // Blog article detection
    if (features.hasArticleContent || urlPatterns.hasBlogPath) {
      return PageType.BLOG_ARTICLE;
    }

    // Dashboard detection
    if (features.hasDashboard || features.hasDataTables && features.linkCount > 5) {
      return PageType.DASHBOARD;
    }

    // Form page detection
    if (features.formCount > 0 && features.inputCount > 3) {
      return PageType.FORM_PAGE;
    }

    // Gallery detection
    if (features.hasMediaGallery || features.imageCount > 10) {
      return PageType.GALLERY;
    }

    // Contact page detection
    if (title.includes('contact') || url.includes('contact')) {
      return PageType.CONTACT;
    }

    // About page detection
    if (title.includes('about') || url.includes('about')) {
      return PageType.ABOUT;
    }

    return PageType.UNKNOWN;
  }

  /**
   * Calculate confidence score for page type detection
   */
  private static calculateConfidence(
    pageType: PageType,
    features: PageContext['features'],
    urlPatterns: PageContext['urlPatterns']
  ): number {
    let confidence = 0.5; // Base confidence

    switch (pageType) {
      case PageType.LOGIN:
        if (features.hasLoginForm) confidence += 0.3;
        if (urlPatterns.hasAuthPath) confidence += 0.2;
        break;

      case PageType.PRODUCT_LISTING:
        if (features.hasProducts) confidence += 0.2;
        if (urlPatterns.hasProductPath) confidence += 0.2;
        if (features.linkCount > 10) confidence += 0.1;
        break;

      case PageType.HOMEPAGE:
        if (urlPatterns.isHomepage) confidence += 0.3;
        if (features.hasNavigation) confidence += 0.2;
        break;

      // Add more confidence calculations for other page types
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Get suggested actions based on page type
   */
  private static getSuggestedActions(
    pageType: PageType,
    features: PageContext['features']
  ): string[] {
    const actions: string[] = [];

    switch (pageType) {
      case PageType.HOMEPAGE:
        if (features.hasSearchBox) actions.push('search_for_content');
        if (features.hasNavigation) actions.push('explore_navigation');
        if (features.hasProducts) actions.push('browse_products');
        break;

      case PageType.LOGIN:
        actions.push('attempt_login');
        actions.push('find_registration_link');
        actions.push('check_forgot_password');
        break;

      case PageType.REGISTRATION:
        actions.push('fill_registration_form');
        actions.push('check_required_fields');
        break;

      case PageType.PRODUCT_LISTING:
        actions.push('filter_products');
        actions.push('sort_products');
        actions.push('view_product_details');
        actions.push('paginate');
        break;

      case PageType.PRODUCT_DETAIL:
        actions.push('add_to_cart');
        actions.push('view_images');
        actions.push('read_reviews');
        actions.push('check_specifications');
        break;

      case PageType.SEARCH_RESULTS:
        actions.push('refine_search');
        actions.push('click_result');
        actions.push('change_filters');
        break;

      case PageType.FORM_PAGE:
        actions.push('fill_form_fields');
        actions.push('validate_inputs');
        actions.push('submit_form');
        break;

      default:
        if (features.hasSearchBox) actions.push('use_search');
        if (features.hasNavigation) actions.push('explore_links');
        if (features.formCount > 0) actions.push('interact_with_forms');
    }

    return actions;
  }

  /**
   * Get common action patterns for workflows
   */
  static getActionPatterns(): ActionPattern[] {
    return [
      {
        name: 'search_and_explore',
        steps: [
          { action: 'type', target: 'search', value: 'travel destinations' },
          { action: 'submit', target: 'search_form' },
          { action: 'click', target: 'first_result' }
        ],
        applicablePages: [PageType.HOMEPAGE, PageType.SEARCH_RESULTS]
      },
      {
        name: 'navigate_menu',
        steps: [
          { action: 'hover', target: 'menu_item' },
          { action: 'click', target: 'submenu_item' }
        ],
        applicablePages: [PageType.HOMEPAGE, PageType.PRODUCT_LISTING]
      },
      {
        name: 'fill_contact_form',
        steps: [
          { action: 'type', target: 'name', value: 'John Doe' },
          { action: 'type', target: 'email', value: 'test@example.com' },
          { action: 'type', target: 'message', value: 'Test message' },
          { action: 'click', target: 'submit' }
        ],
        applicablePages: [PageType.CONTACT, PageType.FORM_PAGE]
      },
      {
        name: 'browse_products',
        steps: [
          { action: 'click', target: 'category' },
          { action: 'click', target: 'filter' },
          { action: 'click', target: 'product_card' },
          { action: 'click', target: 'add_to_cart' }
        ],
        applicablePages: [PageType.PRODUCT_LISTING, PageType.PRODUCT_DETAIL]
      }
    ];
  }

  /**
   * Suggest next action based on page context and history
   */
  static suggestContextualAction(
    context: PageContext,
    actionHistory: any[],
    elements: any[]
  ): any {
    // Get patterns applicable to current page
    const patterns = this.getActionPatterns().filter(p =>
      p.applicablePages.includes(context.type)
    );

    // Check if we're in the middle of a pattern
    for (const pattern of patterns) {
      const matchingSteps = this.findMatchingPatternProgress(pattern, actionHistory);
      if (matchingSteps > 0 && matchingSteps < pattern.steps.length) {
        // Continue with next step in pattern
        const nextStep = pattern.steps[matchingSteps];
        const targetElement = this.findElementByDescription(elements, nextStep.target);
        if (targetElement) {
          return {
            action: nextStep.action,
            element: targetElement,
            value: nextStep.value,
            pattern: pattern.name
          };
        }
      }
    }

    // Otherwise, use page-specific suggestions
    const suggestedAction = context.suggestedActions[0];
    if (suggestedAction) {
      return this.mapSuggestedActionToElement(suggestedAction, elements);
    }

    return null;
  }

  /**
   * Find how far we've progressed in a pattern
   */
  private static findMatchingPatternProgress(
    pattern: ActionPattern,
    actionHistory: any[]
  ): number {
    if (actionHistory.length === 0) return 0;

    const recentActions = actionHistory.slice(-pattern.steps.length);
    let matchCount = 0;

    for (let i = 0; i < Math.min(recentActions.length, pattern.steps.length); i++) {
      const action = recentActions[i];
      const step = pattern.steps[i];

      if (action.type?.toLowerCase() === step.action) {
        matchCount++;
      } else {
        break;
      }
    }

    return matchCount;
  }

  /**
   * Find element by description
   */
  private static findElementByDescription(elements: any[], description: string): any {
    const desc = description.toLowerCase();

    return elements.find(el => {
      const tag = el.tagName?.toLowerCase() || '';
      const type = el.type?.toLowerCase() || '';
      const className = el.className?.toLowerCase() || '';
      const id = el.id?.toLowerCase() || '';
      const text = el.text?.toLowerCase() || '';

      if (desc.includes('search') && (type === 'search' || id.includes('search'))) return true;
      if (desc.includes('submit') && (type === 'submit' || text.includes('submit'))) return true;
      if (desc.includes('name') && (id.includes('name') || className.includes('name'))) return true;
      if (desc.includes('email') && (type === 'email' || id.includes('email'))) return true;
      if (desc.includes('menu') && (className.includes('menu') || tag === 'nav')) return true;
      if (desc.includes('product') && className.includes('product')) return true;
      if (desc.includes('cart') && (text.includes('cart') || className.includes('cart'))) return true;

      return false;
    });
  }

  /**
   * Map suggested action to actual element
   */
  private static mapSuggestedActionToElement(suggestion: string, elements: any[]): any {
    switch (suggestion) {
      case 'search_for_content':
        return this.findElementByDescription(elements, 'search');
      case 'explore_navigation':
        return this.findElementByDescription(elements, 'menu');
      case 'browse_products':
        return this.findElementByDescription(elements, 'product');
      default:
        return null;
    }
  }
}

export default PageContextAnalyzer;