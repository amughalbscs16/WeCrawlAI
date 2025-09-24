/**
 * Important Element Filter for Efficient Web Exploration
 * Filters and maps only essential interactive elements to reduce noise and improve exploration efficiency
 */

import { logger } from '../utils/logger';

export interface FilteredElement {
  selector: string;
  tagName: string;
  type?: string;
  text?: string;
  innerHTML?: string;
  hasOnClick: boolean;
  hasText: boolean;
  label?: string;
  placeholder?: string;
  ariaLabel?: string;
  href?: string;
  src?: string;
  alt?: string;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
  };
  isVisible: boolean;
  isClickable: boolean;
  isInputable: boolean;
  elementType: 'link' | 'image' | 'input' | 'button' | 'clickable' | 'text-container';
  importance: number;
}

export class ImportantElementFilter {

  /**
   * Filter DOM elements to only include important interactive ones
   */
  static filterImportantElements(elements: any[]): FilteredElement[] {
    const filteredElements: FilteredElement[] = [];

    for (const element of elements) {
      const filtered = this.evaluateElement(element);
      if (filtered) {
        filteredElements.push(filtered);
      }
    }

    // Sort by importance
    return filteredElements.sort((a, b) => b.importance - a.importance);
  }

  /**
   * Evaluate if an element is important enough to include
   */
  private static evaluateElement(element: any): FilteredElement | null {
    const tag = element.tagName?.toLowerCase();
    const hasOnClick = element.attributes?.onclick || element.eventListeners?.click;
    const hasText = !!(element.text?.trim() || element.innerHTML?.trim());
    const isVisible = element.isVisible !== false;

    // Skip invisible elements (but be less strict)
    if (isVisible === false && !hasText) {
      return null;
    }

    let elementType: FilteredElement['elementType'] | null = null;
    let importance = 0;

    // 1. Links (<a> tags with href)
    const href = element.href || element.attributes?.href;
    if (tag === 'a' && href) {
      elementType = 'link';
      importance = 10;

      // Internal links are more important than external
      if (!href.startsWith('http') ||
          href.includes(element.url?.hostname)) {
        importance = 12;
      }
    }

    // 2. Images (<img> tags)
    else if (tag === 'img') {
      elementType = 'image';
      importance = 3;

      // Clickable images are more important
      if (hasOnClick || element.isClickable) {
        importance = 8;
      }
    }

    // 3. Input fields (<input>, <textarea>, <select>)
    else if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      elementType = 'input';
      importance = 9;

      // Text/email/password inputs are highest priority
      const type = element.type?.toLowerCase();
      if (type === 'text' || type === 'email' || type === 'password' ||
          type === 'search' || type === 'tel' || type === 'url') {
        importance = 11;
      }

      // Skip hidden inputs
      if (type === 'hidden') {
        return null;
      }
    }

    // 4. Buttons (<button> or elements with button role)
    else if (tag === 'button' ||
             element.type === 'button' ||
             element.type === 'submit' ||
             element.role === 'button') {
      elementType = 'button';
      importance = 10;

      // Submit buttons are highest priority
      if (element.type === 'submit') {
        importance = 12;
      }
    }

    // 5. Elements with onClick handlers
    else if (hasOnClick) {
      elementType = 'clickable';
      importance = 8;

      // Clickable elements with meaningful text are more important
      if (hasText) {
        importance = 9;
      }
    }

    // 6. Elements with text content (divs, spans, etc.)
    else if (hasText && (tag === 'div' || tag === 'span' || tag === 'p' ||
                         tag === 'h1' || tag === 'h2' || tag === 'h3' ||
                         tag === 'h4' || tag === 'h5' || tag === 'h6' ||
                         tag === 'li' || tag === 'td' || tag === 'label')) {
      // Only include if it's clickable or has meaningful text
      const textLength = element.text?.trim().length || 0;
      if (element.isClickable || textLength > 5) {
        elementType = 'text-container';
        importance = element.isClickable ? 6 : 2;
      }
    }

    // Skip if no important element type was identified
    if (!elementType) {
      return null;
    }

    // Extract label information for input fields
    let label: string | undefined;
    if (elementType === 'input') {
      label = this.findInputLabel(element);
    }

    return {
      selector: element.selector || '',
      tagName: tag || '',
      type: element.type,
      text: element.text?.trim().substring(0, 100), // Limit text length
      innerHTML: element.innerHTML?.trim().substring(0, 200), // Limit innerHTML
      hasOnClick,
      hasText,
      label,
      placeholder: element.placeholder,
      ariaLabel: element.attributes?.['aria-label'],
      href: element.href || element.attributes?.href,
      src: element.attributes?.src,
      alt: element.attributes?.alt,
      boundingBox: element.boundingBox,
      isVisible,
      isClickable: element.isClickable || false,
      isInputable: element.isInputable || false,
      elementType,
      importance
    };
  }

  /**
   * Find label for input field
   */
  private static findInputLabel(element: any): string | undefined {
    // Check for aria-label
    if (element.attributes?.['aria-label']) {
      return element.attributes['aria-label'];
    }

    // Check for placeholder
    if (element.placeholder) {
      return element.placeholder;
    }

    // Check for associated label via id
    if (element.id && element.label) {
      return element.label;
    }

    // Check name attribute
    if (element.name) {
      // Convert name to readable format (e.g., first_name -> First Name)
      return element.name.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
    }

    return undefined;
  }

  /**
   * Generate smart input value based on field type and label
   */
  static generateSmartInputValue(element: FilteredElement): string {
    const label = (element.label || element.placeholder || element.ariaLabel || '').toLowerCase();
    const type = element.type?.toLowerCase();

    // Email fields
    if (type === 'email' || label.includes('email') || label.includes('e-mail')) {
      return `test${Math.floor(Math.random() * 1000)}@example.com`;
    }

    // Name fields
    if (label.includes('first name') || label.includes('firstname')) {
      const firstNames = ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Emily'];
      return firstNames[Math.floor(Math.random() * firstNames.length)];
    }
    if (label.includes('last name') || label.includes('lastname') || label.includes('surname')) {
      const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia'];
      return lastNames[Math.floor(Math.random() * lastNames.length)];
    }
    if (label.includes('full name') || label.includes('name')) {
      const firstNames = ['John', 'Jane', 'Michael', 'Sarah'];
      const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown'];
      return `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`;
    }

    // Phone fields
    if (type === 'tel' || label.includes('phone') || label.includes('mobile') || label.includes('tel')) {
      return `555-${Math.floor(Math.random() * 900 + 100)}-${Math.floor(Math.random() * 9000 + 1000)}`;
    }

    // Address fields
    if (label.includes('address') || label.includes('street')) {
      const streetNumbers = Math.floor(Math.random() * 9000 + 100);
      const streetNames = ['Main St', 'Oak Ave', 'Elm St', 'Park Rd', 'First Ave'];
      return `${streetNumbers} ${streetNames[Math.floor(Math.random() * streetNames.length)]}`;
    }
    if (label.includes('city')) {
      const cities = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix'];
      return cities[Math.floor(Math.random() * cities.length)];
    }
    if (label.includes('zip') || label.includes('postal')) {
      return Math.floor(Math.random() * 90000 + 10000).toString();
    }
    if (label.includes('state')) {
      const states = ['CA', 'NY', 'TX', 'FL', 'IL'];
      return states[Math.floor(Math.random() * states.length)];
    }

    // Date fields
    if (type === 'date' || label.includes('date')) {
      const date = new Date();
      date.setDate(date.getDate() + Math.floor(Math.random() * 30));
      return date.toISOString().split('T')[0];
    }

    // Age fields
    if (label.includes('age')) {
      return Math.floor(Math.random() * 50 + 18).toString();
    }

    // Password fields
    if (type === 'password' || label.includes('password')) {
      return 'TestPass123!@#';
    }

    // Search fields
    if (type === 'search' || label.includes('search')) {
      const searches = ['hotels', 'restaurants', 'flights', 'weather', 'news', 'shopping'];
      return searches[Math.floor(Math.random() * searches.length)];
    }

    // URL fields
    if (type === 'url' || label.includes('url') || label.includes('website')) {
      return 'https://example.com';
    }

    // Message/Comment fields
    if (label.includes('message') || label.includes('comment') || label.includes('description')) {
      return 'This is a test message for exploration purposes.';
    }

    // Number fields
    if (type === 'number') {
      return Math.floor(Math.random() * 100 + 1).toString();
    }

    // Default for any other text field
    return `Test input ${Math.floor(Math.random() * 1000)}`;
  }

  /**
   * Get statistics about filtered elements
   */
  static getElementStatistics(elements: FilteredElement[]): {
    total: number;
    byType: Record<string, number>;
    clickable: number;
    inputable: number;
    withText: number;
  } {
    const stats = {
      total: elements.length,
      byType: {} as Record<string, number>,
      clickable: 0,
      inputable: 0,
      withText: 0
    };

    for (const element of elements) {
      // Count by type
      stats.byType[element.elementType] = (stats.byType[element.elementType] || 0) + 1;

      // Count properties
      if (element.isClickable) stats.clickable++;
      if (element.isInputable) stats.inputable++;
      if (element.hasText) stats.withText++;
    }

    return stats;
  }

  /**
   * Log element mapping for debugging
   */
  static logElementMapping(elements: FilteredElement[], url: string): void {
    const stats = this.getElementStatistics(elements);

    logger.info('Page element mapping completed', {
      url,
      totalElements: stats.total,
      byType: stats.byType,
      clickableElements: stats.clickable,
      inputableElements: stats.inputable,
      elementsWithText: stats.withText
    });

    // Log top 5 most important elements
    const topElements = elements.slice(0, 5);
    logger.debug('Top important elements', {
      elements: topElements.map(e => ({
        type: e.elementType,
        selector: e.selector,
        text: e.text?.substring(0, 30),
        importance: e.importance
      }))
    });
  }
}

export default ImportantElementFilter;