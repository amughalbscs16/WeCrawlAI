export interface TestScenario {
  id?: string;
  title: string;
  content: string;
  url: string;
  description?: string;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
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

export interface TestResult {
  execution: TestExecution;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
  };
  analysis?: {
    confidence: number;
    insights: string[];
    recommendations: string[];
  };
}

export interface SecurityFinding {
  id: string;
  type: 'sql_injection' | 'xss' | 'csrf' | 'auth_bypass' | 'info_disclosure' | 'insecure_transport' | 'weak_password' | 'misconfiguration';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  location: {
    url: string;
    element?: string;
    parameter?: string;
  };
  evidence: {
    request?: string;
    response?: string;
    payload?: string;
    screenshot?: string;
  };
  remediation: string;
  timestamp: string;
}