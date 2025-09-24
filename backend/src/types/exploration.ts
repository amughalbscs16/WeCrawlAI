/**
 * Multi-Modal Web Exploration Data Types for RL Training
 * Based on state-of-the-art approaches from WebAgent-R1, ScribeAgent, and Mind2Web
 */

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface InteractiveElement {
  id: string;
  tagName: string;
  type?: string;
  role?: string;
  ariaLabel?: string;
  text: string;
  selector: string;
  xpath: string;
  boundingBox: BoundingBox;
  isVisible: boolean;
  isClickable: boolean;
  isInputable: boolean;
  attributes: Record<string, string>;
  computedStyles: Record<string, string>;
  confidence: number; // AI confidence for element detection
}

export interface DOMSnapshot {
  html: string;
  prunedHtml: string; // Simplified HTML without irrelevant elements
  elements: InteractiveElement[];
  forms: FormElement[];
  links: LinkElement[];
  buttons: ButtonElement[];
  inputs: InputElement[];
  metadata: {
    title: string;
    url: string;
    domain: string;
    language: string;
    viewport: { width: number; height: number };
    hasPopups: boolean;
    hasModals: boolean;
    loadTime: number;
  };
}

export interface FormElement {
  id: string;
  action?: string;
  method: string;
  inputs: InputElement[];
  submitButton?: InteractiveElement;
  boundingBox: BoundingBox;
}

export interface LinkElement {
  id: string;
  href: string;
  text: string;
  isExternal: boolean;
  boundingBox: BoundingBox;
}

export interface ButtonElement {
  id: string;
  text: string;
  type: string;
  boundingBox: BoundingBox;
}

export interface InputElement {
  id: string;
  type: string;
  name: string;
  placeholder?: string;
  value: string;
  required: boolean;
  boundingBox: BoundingBox;
}

export interface AccessibilityTree {
  nodes: A11yNode[];
  focusableElements: string[];
  landmarks: LandmarkElement[];
  headingStructure: HeadingElement[];
}

export interface A11yNode {
  id: string;
  role: string;
  name: string;
  description?: string;
  level?: number;
  children: string[];
  parent?: string;
  boundingBox: BoundingBox;
}

export interface LandmarkElement {
  id: string;
  role: 'banner' | 'navigation' | 'main' | 'contentinfo' | 'complementary' | 'search' | 'form';
  name: string;
  boundingBox: BoundingBox;
}

export interface HeadingElement {
  id: string;
  level: number;
  text: string;
  boundingBox: BoundingBox;
}

export interface VisualFeatures {
  screenshot: Buffer;
  annotatedScreenshot: Buffer; // With bounding boxes and labels
  elementMasks: Map<string, Buffer>; // Individual element screenshots
  layoutAnalysis: {
    columns: number;
    rows: number;
    gridStructure: GridCell[];
    visualClusters: VisualCluster[];
  };
  colorAnalysis: {
    dominantColors: string[];
    colorScheme: 'light' | 'dark' | 'mixed';
    contrast: number;
  };
  textAnalysis: {
    readabilityScore: number;
    textDensity: number;
    languageDetection: string;
  };
  cnnFeatures?: {
    colorHistogram: { r: number[]; g: number[]; b: number[] };
    edgeFeatures: { edgeCount: number; edgeDensity: number; averageGradient: number };
    textureFeatures: { roughness: number; uniformity: number; contrast: number };
    spatialDistribution: { hotspots: any[]; gridSize: number; cellSize: { width: number; height: number } };
    regionOfInterest: { regions: any[] };
    layoutPatterns: { gridLike: boolean; symmetrical: boolean; alignment: any };
    visualComplexity: { entropy: number; score: number; diversity: number };
    symmetryFeatures: { horizontal: number; vertical: number; overall: number };
    convolutionalFeatures: Float32Array;
    poolingFeatures: Float32Array;
    dimensions: { width: number; height: number };
    timestamp: number;
  };
}

export interface GridCell {
  id: string;
  row: number;
  column: number;
  boundingBox: BoundingBox;
  elements: string[];
}

export interface VisualCluster {
  id: string;
  elements: string[];
  centroid: { x: number; y: number };
  boundingBox: BoundingBox;
  purpose: 'navigation' | 'content' | 'sidebar' | 'footer' | 'header' | 'form' | 'unknown';
}

export interface PageEmbedding {
  textEmbedding: Float32Array; // Semantic embedding of page text
  visualEmbedding: Float32Array; // CNN features from screenshot
  structuralEmbedding: Float32Array; // DOM structure embedding
  combinedEmbedding: Float32Array; // Fused multi-modal embedding
  similarity: {
    semanticSimilarity: number; // To previous pages
    visualSimilarity: number;
    structuralSimilarity: number;
  };
}

export interface ActionData {
  type: ActionType;
  target?: InteractiveElement;
  coordinates?: { x: number; y: number };
  value?: string;
  modifiers?: string[];
  timestamp: Date;
  duration: number;
  success: boolean;
  errorMessage?: string;
  screenshot?: Buffer; // Screenshot after action
}

export enum ActionType {
  CLICK = 'click',
  TYPE = 'type',
  SCROLL = 'scroll',
  HOVER = 'hover',
  DRAG = 'drag',
  NAVIGATE = 'navigate',
  WAIT = 'wait',
  SCREENSHOT = 'screenshot',
  EXTRACT_DATA = 'extract_data',
  SUBMIT_FORM = 'submit_form',
  SELECT_OPTION = 'select_option',
  UPLOAD_FILE = 'upload_file',
  DOWNLOAD_FILE = 'download_file',
  OPEN_TAB = 'open_tab',
  CLOSE_TAB = 'close_tab',
  SWITCH_TAB = 'switch_tab',
  GO_BACK = 'go_back',
  GO_FORWARD = 'go_forward',
  REFRESH = 'refresh'
}

export interface RewardComponents {
  // Exploration rewards
  noveltyReward: number;        // New page/element discovery
  coverageReward: number;       // Site exploration coverage
  diversityReward: number;      // Action variety
  informationGainReward: number; // Learning value

  // Task completion rewards
  taskProgressReward: number;   // Progress toward inferred goals
  goalCompletionReward: number; // Successful task completion

  // Efficiency rewards
  efficiencyReward: number;     // Achieving goals with fewer actions

  // Safety penalties
  errorPenalty: number;         // Page errors, crashes
  inefficiencyPenalty: number;  // Repetitive/useless actions
  destructivePenalty: number;   // Potentially harmful actions

  // Total combined reward
  totalReward: number;
}

export interface ExplorationState {
  // Current page state
  url: string;
  domain: string;
  pageType: PageType;
  domSnapshot: DOMSnapshot;
  visualFeatures: VisualFeatures;
  accessibilityTree: AccessibilityTree;
  pageEmbedding: PageEmbedding;

  // Session context
  actionHistory: ActionData[];
  visitedPages: Set<string>;
  sessionStartTime: Date;
  currentSessionDuration: number;

  // Exploration metrics
  pagesExplored: number;
  uniqueActionsPerformed: number;
  errorsEncountered: number;
  tasksCompleted: number;

  // AI state
  confidence: number;
  uncertainty: number;
  explorationStrategy: ExplorationStrategy;
  currentGoals: string[];
}

export enum PageType {
  HOMEPAGE = 'homepage',
  PRODUCT_LISTING = 'product_listing',
  PRODUCT_DETAIL = 'product_detail',
  SEARCH_RESULTS = 'search_results',
  LOGIN = 'login',
  SIGNUP = 'signup',
  CHECKOUT = 'checkout',
  CART = 'cart',
  PROFILE = 'profile',
  ARTICLE = 'article',
  BLOG_POST = 'blog_post',
  CONTACT = 'contact',
  ABOUT = 'about',
  FAQ = 'faq',
  FORUM = 'forum',
  DASHBOARD = 'dashboard',
  SETTINGS = 'settings',
  ERROR_404 = 'error_404',
  ERROR_500 = 'error_500',
  UNKNOWN = 'unknown'
}

export enum ExplorationStrategy {
  RANDOM = 'random',
  CURIOSITY_DRIVEN = 'curiosity_driven',
  TASK_ORIENTED = 'task_oriented',
  COVERAGE_MAXIMIZING = 'coverage_maximizing',
  EFFICIENCY_FOCUSED = 'efficiency_focused',
  HYBRID = 'hybrid'
}

export interface ExplorationSession {
  id: string;
  startUrl: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;

  // Session data
  states: ExplorationState[];
  actions: ActionData[];
  rewards: RewardComponents[];

  // Session metrics
  totalReward: number;
  pagesExplored: number;
  uniqueDomainsVisited: number;
  successfulActions: number;
  failedActions: number;

  // Learning data
  trajectories: Trajectory[];
  experiences: Experience[];

  // Metadata
  userAgent: string;
  viewport: { width: number; height: number };
  sessionConfig: ExplorationConfig;
}

export interface Trajectory {
  id: string;
  states: ExplorationState[];
  actions: ActionData[];
  rewards: number[];
  values: number[];
  advantages: number[];
  returns: number[];
  logProbabilities: number[];
}

export interface Experience {
  state: ExplorationState;
  action: ActionData;
  reward: number;
  nextState: ExplorationState;
  done: boolean;
  value: number;
  advantage: number;
  logProbability: number;
}

export interface ExplorationConfig {
  maxSessionDuration: number;
  maxActionsPerSession: number;
  maxPagesPerSession: number;
  enableScreenshots: boolean;
  enableVideoRecording: boolean;
  explorationStrategy: ExplorationStrategy;
  rewardWeights: Partial<RewardComponents>;
  safetyConstraints: SafetyConstraints;
  domains: string[];
  allowedActions: ActionType[];
}

export interface SafetyConstraints {
  respectRobotsTxt: boolean;
  maxRequestsPerMinute: number;
  avoidDestructiveActions: boolean;
  stayWithinDomain: boolean;
  avoidSensitivePages: string[];
  maxFormSubmissions: number;
  requireConfirmationFor: ActionType[];
}

export interface ExplorationMetrics {
  // Coverage metrics
  pagesCovered: number;
  domainsCovered: number;
  uniqueElementTypes: number;
  formsCovered: number;

  // Efficiency metrics
  actionsPerPage: number;
  successRate: number;
  errorRate: number;
  averageSessionDuration: number;

  // Learning metrics
  noveltyScore: number;
  informationGain: number;
  explorationEntropy: number;

  // Quality metrics
  dataQualityScore: number;
  annotationAccuracy: number;
  replayability: number;
}