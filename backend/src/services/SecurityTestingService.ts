import { WebDriver, By, until } from 'selenium-webdriver';
import { logger } from '../utils/logger';

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

export interface SecurityTestConfig {
  enableSqlInjection: boolean;
  enableXss: boolean;
  enableCsrf: boolean;
  enableAuthBypass: boolean;
  enableInfoDisclosure: boolean;
  enableTransportSecurity: boolean;
  enableWeakPasswords: boolean;
  enableMisconfiguration: boolean;
  maxTestsPerType: number;
  timeout: number;
}

export class SecurityTestingService {
  private config: SecurityTestConfig;
  private logStep?: (description: string, action: string, details?: any) => Promise<void>;

  constructor(config?: Partial<SecurityTestConfig>) {
    this.config = {
      enableSqlInjection: true,
      enableXss: true,
      enableCsrf: true,
      enableAuthBypass: true,
      enableInfoDisclosure: true,
      enableTransportSecurity: true,
      enableWeakPasswords: true,
      enableMisconfiguration: true,
      maxTestsPerType: 10,
      timeout: 5000,
      ...config,
    };
  }

  async runSecurityTests(
    driver: any,
    baseUrl: string,
    logStep?: (description: string, action: string, details?: any) => Promise<void>
  ): Promise<SecurityFinding[]> {
    this.logStep = logStep;
    const findings: SecurityFinding[] = [];

    logger.info('Starting security tests', {
      url: baseUrl,
      config: this.config,
    });

    try {
      // SQL Injection Tests
      if (this.config.enableSqlInjection) {
        const sqlFindings = await this.testSqlInjection(driver, baseUrl);
        findings.push(...sqlFindings);
      }

      // XSS Tests
      if (this.config.enableXss) {
        const xssFindings = await this.testXss(driver, baseUrl);
        findings.push(...xssFindings);
      }

      // CSRF Tests
      if (this.config.enableCsrf) {
        const csrfFindings = await this.testCsrf(driver, baseUrl);
        findings.push(...csrfFindings);
      }

      // Authentication Bypass Tests
      if (this.config.enableAuthBypass) {
        const authFindings = await this.testAuthBypass(driver, baseUrl);
        findings.push(...authFindings);
      }

      // Information Disclosure Tests
      if (this.config.enableInfoDisclosure) {
        const infoFindings = await this.testInfoDisclosure(driver, baseUrl);
        findings.push(...infoFindings);
      }

      // Transport Security Tests
      if (this.config.enableTransportSecurity) {
        const transportFindings = await this.testTransportSecurity(driver, baseUrl);
        findings.push(...transportFindings);
      }

      // Weak Password Tests
      if (this.config.enableWeakPasswords) {
        const passwordFindings = await this.testWeakPasswords(driver, baseUrl);
        findings.push(...passwordFindings);
      }

      // Misconfiguration Tests
      if (this.config.enableMisconfiguration) {
        const misconfigFindings = await this.testMisconfiguration(driver, baseUrl);
        findings.push(...misconfigFindings);
      }

      logger.info('Security tests completed', {
        url: baseUrl,
        findingsCount: findings.length,
        criticalCount: findings.filter(f => f.severity === 'critical').length,
        highCount: findings.filter(f => f.severity === 'high').length,
      });

      return findings;
    } catch (error) {
      logger.error('Security testing failed', {
        error: error.message,
        url: baseUrl,
      });
      throw error;
    }
  }

  private async testSqlInjection(page: any, baseUrl: string): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];
    const sqlPayloads = [
      "' OR '1'='1",
      "' OR 1=1--",
      "'; DROP TABLE users; --",
      "' UNION SELECT NULL--",
      "admin'--",
      "' OR 'x'='x",
      "1; SELECT * FROM information_schema.tables--",
      "' OR 1=1#",
    ];

    logger.debug('Testing SQL injection vulnerabilities');

    if (this.logStep) {
      await this.logStep('Starting SQL injection tests', 'security_test', { test: 'sql_injection' });
    }

    try {
      // Find input fields
      const inputs = await page.locator('input[type="text"], input[type="email"], input[type="search"], textarea').all();

      if (this.logStep && inputs.length > 0) {
        await this.logStep(`Found ${inputs.length} input fields to test`, 'info', { count: inputs.length });
      }

      for (const input of inputs.slice(0, this.config.maxTestsPerType)) {
        for (const payload of sqlPayloads.slice(0, 3)) { // Limit payloads per input
          try {
            const inputName = await input.getAttribute('name') || await input.getAttribute('id') || 'unknown';

            if (this.logStep) {
              await this.logStep(`Testing SQL injection in field: ${inputName}`, 'type', {
                field: inputName,
                payload: payload
              });
            }

            await input.fill(payload);

            // Submit form if available
            const form = page.locator('form').first();
            if (await form.count() > 0) {
              const submitButton = form.locator('button[type="submit"], input[type="submit"]').first();
              if (await submitButton.count() > 0) {
                if (this.logStep) {
                  await this.logStep('Submitting form with SQL payload', 'click', {
                    element: 'submit button',
                    currentUrl: page.url()
                  });
                }
                await submitButton.click();
                await page.waitForTimeout(1000);

                // Check for SQL error messages
                const content = await page.content();
                const sqlErrorIndicators = [
                  'mysql_fetch_array',
                  'ORA-01756',
                  'Microsoft Access Driver',
                  'Microsoft JET Database',
                  'PostgreSQL query failed',
                  'Warning: mysql_',
                  'valid MySQL result',
                  'MySqlClient.',
                  'SQLException',
                  'OleDbException',
                ];

                for (const indicator of sqlErrorIndicators) {
                  if (content.toLowerCase().includes(indicator.toLowerCase())) {
                    findings.push({
                      id: `sql_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                      type: 'sql_injection',
                      severity: 'high',
                      title: 'Potential SQL Injection Vulnerability',
                      description: `SQL injection vulnerability detected. Application appears to be vulnerable to SQL injection attacks via input field.`,
                      location: {
                        url: page.url(),
                        element: await input.getAttribute('name') || await input.getAttribute('id') || 'unknown',
                      },
                      evidence: {
                        payload,
                        response: content.substring(0, 500),
                      },
                      remediation: 'Use parameterized queries or prepared statements. Implement input validation and sanitization.',
                      timestamp: new Date().toISOString(),
                    });
                    break;
                  }
                }
              }
            }
          } catch (error) {
            // Silent error handling for security tests
            logger.debug('SQL injection test error', { payload, error: error.message });
          }
        }
      }
    } catch (error) {
      logger.error('SQL injection testing failed', { error: error.message });
    }

    return findings;
  }

  private async testXss(page: any, baseUrl: string): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];
    const xssPayloads = [
      '<script>alert("XSS")</script>',
      '<img src="x" onerror="alert(1)">',
      '"><script>alert(document.domain)</script>',
      'javascript:alert("XSS")',
      '<svg onload="alert(1)">',
      '<iframe src="javascript:alert(1)"></iframe>',
      '\'><script>alert(String.fromCharCode(88,83,83))</script>',
    ];

    logger.debug('Testing XSS vulnerabilities');

    try {
      // Find input fields
      const inputs = await page.locator('input[type="text"], input[type="search"], textarea').all();

      for (const input of inputs.slice(0, this.config.maxTestsPerType)) {
        for (const payload of xssPayloads.slice(0, 3)) {
          try {
            await input.fill(payload);

            // Submit form if available
            const form = page.locator('form').first();
            if (await form.count() > 0) {
              const submitButton = form.locator('button[type="submit"], input[type="submit"]').first();
              if (await submitButton.count() > 0) {
                await submitButton.click();
                await page.waitForTimeout(1000);

                // Check if payload is reflected in response
                const content = await page.content();
                if (content.includes(payload)) {
                  findings.push({
                    id: `xss_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    type: 'xss',
                    severity: 'medium',
                    title: 'Potential Cross-Site Scripting (XSS) Vulnerability',
                    description: 'User input is reflected in the response without proper encoding, potentially allowing XSS attacks.',
                    location: {
                      url: page.url(),
                      element: await input.getAttribute('name') || await input.getAttribute('id') || 'unknown',
                    },
                    evidence: {
                      payload,
                      response: content.substring(0, 500),
                    },
                    remediation: 'Implement proper input validation and output encoding. Use Content Security Policy (CSP).',
                    timestamp: new Date().toISOString(),
                  });
                }
              }
            }
          } catch (error) {
            logger.debug('XSS test error', { payload, error: error.message });
          }
        }
      }
    } catch (error) {
      logger.error('XSS testing failed', { error: error.message });
    }

    return findings;
  }

  private async testCsrf(page: any, baseUrl: string): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];

    logger.debug('Testing CSRF vulnerabilities');

    try {
      // Check for CSRF tokens in forms
      const forms = await page.locator('form').all();

      for (const form of forms) {
        const csrfTokens = await form.locator('input[name*="csrf"], input[name*="token"], input[name*="_token"]').count();

        if (csrfTokens === 0) {
          findings.push({
            id: `csrf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'csrf',
            severity: 'medium',
            title: 'Missing CSRF Protection',
            description: 'Form does not appear to have CSRF protection tokens.',
            location: {
              url: page.url(),
              element: 'form',
            },
            evidence: {
              response: await form.innerHTML(),
            },
            remediation: 'Implement CSRF tokens in all forms. Use SameSite cookie attributes.',
            timestamp: new Date().toISOString(),
          });
        }
      }
    } catch (error) {
      logger.error('CSRF testing failed', { error: error.message });
    }

    return findings;
  }

  private async testAuthBypass(page: any, baseUrl: string): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];

    logger.debug('Testing authentication bypass vulnerabilities');

    try {
      // Test for admin/administrative paths
      const adminPaths = [
        '/admin',
        '/administrator',
        '/admin.php',
        '/admin/',
        '/wp-admin',
        '/management',
        '/manager',
        '/dashboard',
      ];

      for (const path of adminPaths) {
        try {
          const response = await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });

          if (response && response.status() === 200) {
            const content = await page.content();
            if (!content.toLowerCase().includes('login') && !content.toLowerCase().includes('unauthorized')) {
              findings.push({
                id: `auth_bypass_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                type: 'auth_bypass',
                severity: 'high',
                title: 'Potential Authentication Bypass',
                description: `Administrative path "${path}" is accessible without authentication.`,
                location: {
                  url: `${baseUrl}${path}`,
                },
                evidence: {
                  response: content.substring(0, 500),
                },
                remediation: 'Implement proper authentication checks for administrative areas.',
                timestamp: new Date().toISOString(),
              });
            }
          }
        } catch (error) {
          // Silent error handling
        }
      }
    } catch (error) {
      logger.error('Authentication bypass testing failed', { error: error.message });
    }

    return findings;
  }

  private async testInfoDisclosure(page: any, baseUrl: string): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];

    logger.debug('Testing information disclosure vulnerabilities');

    try {
      // Check for sensitive information in page source
      const content = await page.content();
      const sensitivePatterns = [
        { pattern: /password\s*[:=]\s*["']([^"']+)["']/gi, type: 'password' },
        { pattern: /api[_-]?key\s*[:=]\s*["']([^"']+)["']/gi, type: 'api_key' },
        { pattern: /secret\s*[:=]\s*["']([^"']+)["']/gi, type: 'secret' },
        { pattern: /token\s*[:=]\s*["']([^"']+)["']/gi, type: 'token' },
        { pattern: /database.*password/gi, type: 'db_password' },
        { pattern: /mysql.*password/gi, type: 'mysql_password' },
      ];

      for (const { pattern, type } of sensitivePatterns) {
        const matches = content.match(pattern);
        if (matches) {
          findings.push({
            id: `info_disclosure_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'info_disclosure',
            severity: 'medium',
            title: `Sensitive Information Disclosure - ${type}`,
            description: `Sensitive ${type} information found in page source.`,
            location: {
              url: page.url(),
            },
            evidence: {
              response: matches.join(', '),
            },
            remediation: 'Remove sensitive information from client-side code. Use environment variables for secrets.',
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Check for debug information
      if (content.includes('debug') || content.includes('DEBUG') || content.includes('stack trace')) {
        findings.push({
          id: `debug_info_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'info_disclosure',
          severity: 'low',
          title: 'Debug Information Disclosure',
          description: 'Debug information found in page source.',
          location: {
            url: page.url(),
          },
          evidence: {
            response: content.substring(0, 500),
          },
          remediation: 'Disable debug mode in production. Remove debug information from responses.',
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.error('Information disclosure testing failed', { error: error.message });
    }

    return findings;
  }

  private async testTransportSecurity(page: any, baseUrl: string): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];

    logger.debug('Testing transport security');

    try {
      // Check if HTTPS is used
      if (!baseUrl.startsWith('https://')) {
        findings.push({
          id: `insecure_transport_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'insecure_transport',
          severity: 'medium',
          title: 'Insecure Transport',
          description: 'Website is not using HTTPS encryption.',
          location: {
            url: baseUrl,
          },
          evidence: {
            response: 'HTTP protocol detected',
          },
          remediation: 'Implement HTTPS with valid SSL/TLS certificates. Use HSTS headers.',
          timestamp: new Date().toISOString(),
        });
      }

      // Check for mixed content
      const response = await page.goto(baseUrl);
      if (response) {
        const securityState = await page.evaluate(() => {
          return {
            protocol: location.protocol,
            hasInsecureContent: document.querySelectorAll('img[src^="http:"], script[src^="http:"], link[href^="http:"]').length > 0,
          };
        });

        if (securityState.protocol === 'https:' && securityState.hasInsecureContent) {
          findings.push({
            id: `mixed_content_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'insecure_transport',
            severity: 'medium',
            title: 'Mixed Content',
            description: 'HTTPS page contains insecure HTTP resources.',
            location: {
              url: page.url(),
            },
            evidence: {
              response: 'HTTP resources found on HTTPS page',
            },
            remediation: 'Ensure all resources are loaded over HTTPS.',
            timestamp: new Date().toISOString(),
          });
        }
      }
    } catch (error) {
      logger.error('Transport security testing failed', { error: error.message });
    }

    return findings;
  }

  private async testWeakPasswords(page: any, baseUrl: string): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];

    logger.debug('Testing weak password policies');

    try {
      // Find password fields
      const passwordFields = await page.locator('input[type="password"]').all();

      for (const field of passwordFields) {
        // Test weak passwords
        const weakPasswords = ['123', 'password', 'admin', '123456'];

        for (const weakPassword of weakPasswords) {
          try {
            await field.fill(weakPassword);

            // Check if there's any client-side validation
            const validationMessage = await page.locator('.error, .invalid, [role="alert"]').textContent();

            if (!validationMessage) {
              findings.push({
                id: `weak_password_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                type: 'weak_password',
                severity: 'low',
                title: 'Weak Password Policy',
                description: 'Application may accept weak passwords without validation.',
                location: {
                  url: page.url(),
                  element: await field.getAttribute('name') || 'password field',
                },
                evidence: {
                  payload: weakPassword,
                },
                remediation: 'Implement strong password policies with minimum length, complexity requirements.',
                timestamp: new Date().toISOString(),
              });
              break; // One finding per field is enough
            }
          } catch (error) {
            // Silent error handling
          }
        }
      }
    } catch (error) {
      logger.error('Weak password testing failed', { error: error.message });
    }

    return findings;
  }

  private async testMisconfiguration(page: any, baseUrl: string): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];

    logger.debug('Testing security misconfigurations');

    try {
      // Check security headers
      const response = await page.goto(baseUrl);
      if (response) {
        const headers = response.headers();

        // Check for missing security headers
        const securityHeaders = [
          { name: 'x-frame-options', description: 'X-Frame-Options header prevents clickjacking attacks' },
          { name: 'x-content-type-options', description: 'X-Content-Type-Options header prevents MIME type sniffing' },
          { name: 'x-xss-protection', description: 'X-XSS-Protection header enables browser XSS filtering' },
          { name: 'strict-transport-security', description: 'HSTS header enforces HTTPS connections' },
          { name: 'content-security-policy', description: 'CSP header prevents XSS and data injection attacks' },
        ];

        for (const header of securityHeaders) {
          if (!headers[header.name]) {
            findings.push({
              id: `missing_header_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              type: 'misconfiguration',
              severity: 'low',
              title: `Missing Security Header: ${header.name}`,
              description: header.description,
              location: {
                url: baseUrl,
              },
              evidence: {
                response: `Missing ${header.name} header`,
              },
              remediation: `Configure ${header.name} header in web server or application.`,
              timestamp: new Date().toISOString(),
            });
          }
        }

        // Check for server information disclosure
        if (headers.server) {
          findings.push({
            id: `server_disclosure_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'info_disclosure',
            severity: 'low',
            title: 'Server Information Disclosure',
            description: 'Server header reveals server software and version information.',
            location: {
              url: baseUrl,
            },
            evidence: {
              response: `Server: ${headers.server}`,
            },
            remediation: 'Configure web server to hide or minimize server information in headers.',
            timestamp: new Date().toISOString(),
          });
        }
      }
    } catch (error) {
      logger.error('Misconfiguration testing failed', { error: error.message });
    }

    return findings;
  }

  getConfig(): SecurityTestConfig {
    return this.config;
  }

  updateConfig(config: Partial<SecurityTestConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('Security testing configuration updated', { config: this.config });
  }
}