import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useDispatch, useSelector } from 'react-redux';
import { executeTest, setCurrentScenario } from '../store/slices/testSlice';
import { RootState, AppDispatch } from '../store/store';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { aiService } from '../services/testService';

const TestEditor: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { loading } = useSelector((state: RootState) => state.test);

  const [scenario, setScenario] = useState(`Scenario: User Login Test
As a user
I want to log in to the application
So that I can access my account

Given I am on the login page
When I enter my username and password
And I click the login button
Then I should be logged in successfully
And I should see the dashboard`);

  const [url, setUrl] = useState('https://example.com');
  const [browser, setBrowser] = useState<'chrome'>('chrome');
  const [enableSecurity, setEnableSecurity] = useState(true);
  const [enableScreenshots, setEnableScreenshots] = useState(true);
  const [isValidUrl, setIsValidUrl] = useState(true);
  const [convertedCode, setConvertedCode] = useState('');
  const [isConverting, setIsConverting] = useState(false);

  const validateUrl = (urlString: string) => {
    try {
      new URL(urlString);
      return true;
    } catch {
      return false;
    }
  };

  const convertEnglishToCode = useCallback(async (englishText: string) => {
    if (!englishText.trim() || englishText.length < 10) {
      setConvertedCode('');
      return;
    }

    setIsConverting(true);
    try {
      const response = await aiService.convertToCode({
        englishText,
        targetLanguage: 'selenium-webdriver',
        framework: 'nodejs'
      });

      setConvertedCode(response.data.data.convertedCode);
    } catch (error) {
      console.error('Error converting text to code:', error);
      // Fallback to simple rule-based conversion
      const simpleConversion = convertEnglishToCodeLocally(englishText);
      setConvertedCode(simpleConversion);
    } finally {
      setIsConverting(false);
    }
  }, []);

  const convertEnglishToCodeLocally = (englishText: string): string => {
    const lines = englishText.split('\n').filter(line => line.trim());
    const codeLines: string[] = [];

    codeLines.push('// Auto-generated Selenium WebDriver code');
    codeLines.push('const { Builder, By, until } = require("selenium-webdriver");');
    codeLines.push('const chrome = require("selenium-webdriver/chrome");');
    codeLines.push('');
    codeLines.push('async function runTest() {');
    codeLines.push('  const options = new chrome.Options();');
    codeLines.push('  const driver = await new Builder()');
    codeLines.push('    .forBrowser("chrome")');
    codeLines.push('    .setChromeOptions(options)');
    codeLines.push('    .build();');
    codeLines.push('');
    codeLines.push('  try {');

    for (const line of lines) {
      const trimmedLine = line.trim().toLowerCase();

      if (trimmedLine.includes('navigate') || trimmedLine.includes('go to') || trimmedLine.includes('visit')) {
        const urlMatch = trimmedLine.match(/to\s+"([^"]+)"|to\s+([^\s]+)/);
        if (urlMatch) {
          const url = urlMatch[1] || urlMatch[2];
          codeLines.push(`    // ${line}`);
          codeLines.push(`    await driver.get("${url}");`);
        }
      } else if (trimmedLine.includes('click')) {
        const elementMatch = trimmedLine.match(/"([^"]+)"|'([^']+)'|on\s+([^\s]+)/);
        if (elementMatch) {
          const element = elementMatch[1] || elementMatch[2] || elementMatch[3];
          codeLines.push(`    // ${line}`);
          codeLines.push(`    const element = await driver.findElement(By.css('[data-testid="${element}"], #${element}, .${element}'));`);
          codeLines.push(`    await element.click();`);
        }
      } else if (trimmedLine.includes('type') || trimmedLine.includes('fill') || trimmedLine.includes('enter')) {
        const fieldMatch = trimmedLine.match(/"([^"]+)"|'([^']+)'/g);
        if (fieldMatch && fieldMatch.length >= 2) {
          const field = fieldMatch[0].replace(/['"]/g, '');
          const value = fieldMatch[1].replace(/['"]/g, '');
          codeLines.push(`    // ${line}`);
          codeLines.push(`    const inputField = await driver.findElement(By.css('[name="${field}"], #${field}'));`);
          codeLines.push(`    await inputField.clear();`);
          codeLines.push(`    await inputField.sendKeys("${value}");`);
        }
      } else if (trimmedLine.includes('wait') || trimmedLine.includes('should see')) {
        const elementMatch = trimmedLine.match(/"([^"]+)"|'([^']+)'/);
        if (elementMatch) {
          const element = elementMatch[1] || elementMatch[2];
          codeLines.push(`    // ${line}`);
          codeLines.push(`    await driver.wait(until.elementLocated(By.css(':contains("${element}")')), 10000);`);
        }
      } else if (trimmedLine.includes('assert') || trimmedLine.includes('verify') || trimmedLine.includes('should')) {
        codeLines.push(`    // ${line}`);
        codeLines.push(`    // Add assertion logic here`);
      } else {
        codeLines.push(`    // ${line}`);
      }

      codeLines.push('');
    }

    codeLines.push('  } finally {');
    codeLines.push('    await driver.quit();');
    codeLines.push('  }');
    codeLines.push('}');
    codeLines.push('');
    codeLines.push('runTest().catch(console.error);');

    return codeLines.join('\n');
  };

  // Debounced conversion effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      convertEnglishToCode(scenario);
    }, 1000); // Convert after 1 second of no typing

    return () => clearTimeout(timeoutId);
  }, [scenario, convertEnglishToCode]);

  // Tab change detection to stop running tests
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && loading.executing) {
        // Tab is no longer visible and test is running - warn user
        toast.error('Test execution may be affected - tab is no longer active');
      }
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (loading.executing) {
        e.preventDefault();
        e.returnValue = 'Test is currently running. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    const handlePageHide = () => {
      if (loading.executing) {
        toast.error('Page is being hidden while test is running');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [loading.executing]);

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value;
    setUrl(newUrl);
    setIsValidUrl(validateUrl(newUrl));
  };

  const handleRunTest = async () => {
    if (!scenario.trim()) {
      toast.error('Please enter a test scenario');
      return;
    }

    if (!isValidUrl) {
      toast.error('Please enter a valid URL');
      return;
    }

    // Create scenario object and save to Redux state
    const scenarioObj = {
      title: 'Test Scenario',
      content: scenario,
      url: url
    };

    dispatch(setCurrentScenario(scenarioObj));

    try {
      toast.loading('Starting test execution...', { id: 'test-execution' });

      const result = await dispatch(executeTest({
        scenario,
        url,
        options: {
          browser: 'chrome',
          enableSecurity,
          enableScreenshots,
          headless: false,
          timeout: 30000,
          viewport: { width: 1280, height: 720 }
        }
      })).unwrap();

      toast.success('Test started successfully!', { id: 'test-execution' });

      // Navigate to execution monitoring page
      navigate(`/executions/${result.executionId}`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to start test execution', { id: 'test-execution' });
    }
  };

  const handleSaveScenario = () => {
    // For now, just save to localStorage
    const scenarios = JSON.parse(localStorage.getItem('savedScenarios') || '[]');
    const newScenario = {
      id: Date.now().toString(),
      title: 'Test Scenario',
      content: scenario,
      url: url,
      createdAt: new Date().toISOString()
    };
    scenarios.push(newScenario);
    localStorage.setItem('savedScenarios', JSON.stringify(scenarios));
    toast.success('Scenario saved successfully!');
  };

  const handleValidateSyntax = () => {
    // Basic BDD syntax validation
    const lines = scenario.toLowerCase().split('\n').filter(line => line.trim());
    const hasGiven = lines.some(line => line.includes('given'));
    const hasWhen = lines.some(line => line.includes('when'));
    const hasThen = lines.some(line => line.includes('then'));

    if (hasGiven && hasWhen && hasThen) {
      toast.success('Scenario syntax looks good!');
    } else {
      toast.error('Scenario should include Given, When, and Then statements');
    }
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl font-bold text-secondary-900 mb-2">
          Test Scenario Editor
        </h1>
        <p className="text-secondary-600">
          Write your test scenario in plain English using BDD syntax
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
      >
        <div className="space-y-6">
          <div className="card">
            <h2 className="text-lg font-semibold text-secondary-900 mb-4">
              Test Configuration
            </h2>

            <div className="space-y-4">
              <div>
                <label className="label">Target URL</label>
                <input
                  type="url"
                  value={url}
                  onChange={handleUrlChange}
                  className={`input ${!isValidUrl && url ? 'border-red-500 focus:border-red-500' : ''}`}
                  placeholder="https://example.com"
                />
                {!isValidUrl && url && (
                  <p className="text-red-500 text-sm mt-1">Please enter a valid URL</p>
                )}
              </div>

              <div>
                <label className="label">Browser</label>
                <div className="input bg-gray-50 flex items-center">
                  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                  Chrome (ChromeDriver v138.0.7204.49)
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    className="mr-2"
                    checked={enableSecurity}
                    onChange={(e) => setEnableSecurity(e.target.checked)}
                  />
                  <span className="text-sm">Security Testing</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    className="mr-2"
                    checked={enableScreenshots}
                    onChange={(e) => setEnableScreenshots(e.target.checked)}
                  />
                  <span className="text-sm">Screenshots</span>
                </label>
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="text-lg font-semibold text-secondary-900 mb-4">
              Quick Actions
            </h2>
            <div className="space-y-3">
              <button
                className="btn btn-primary w-full transition-all duration-200 hover:transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                onClick={handleRunTest}
                disabled={loading.executing || !scenario.trim() || !isValidUrl}
              >
                {loading.executing ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Starting Test...
                  </>
                ) : (
                  '🚀 Run Test'
                )}
              </button>
              <button
                className="btn btn-outline w-full transition-all duration-200 hover:transform hover:scale-[1.02]"
                onClick={handleSaveScenario}
                disabled={!scenario.trim()}
              >
                📝 Save Scenario
              </button>
              <button
                className="btn btn-outline w-full transition-all duration-200 hover:transform hover:scale-[1.02]"
                onClick={handleValidateSyntax}
                disabled={!scenario.trim()}
              >
                🔍 Validate Syntax
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card">
            <h2 className="text-lg font-semibold text-secondary-900 mb-4">
              Test Scenario (Natural Language)
            </h2>
            <textarea
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              className="input h-48 font-mono text-sm"
              placeholder="Write your test scenario in plain English..."
            />
            <div className="mt-4 p-3 bg-primary-50 rounded-lg">
              <p className="text-sm text-primary-700">
                💡 <strong>Tip:</strong> Write in plain English! The AI automatically converts to executable code below.
              </p>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-secondary-900">
                Generated Selenium Code
              </h2>
              {isConverting && (
                <div className="flex items-center text-sm text-primary-600">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Converting...
                </div>
              )}
            </div>
            <div className="relative">
              <pre className="bg-gray-900 text-green-400 p-4 rounded-lg h-48 overflow-auto text-sm font-mono">
                {convertedCode || '// Selenium WebDriver code will appear here as you type...'}
              </pre>
              <button
                className="absolute top-2 right-2 bg-gray-700 hover:bg-gray-600 text-white text-xs px-2 py-1 rounded"
                onClick={() => navigator.clipboard.writeText(convertedCode)}
                disabled={!convertedCode}
              >
                Copy
              </button>
            </div>
            <div className="mt-4 p-3 bg-green-50 rounded-lg">
              <p className="text-sm text-green-700">
                🚀 <strong>Real-time Code Generation:</strong> This code is automatically generated from your English text above and uses Chrome WebDriver v138.0.7204.49.
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="card"
      >
        <h2 className="text-lg font-semibold text-secondary-900 mb-4">
          BDD Syntax Examples
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium text-secondary-900 mb-2">Navigation</h4>
            <div className="bg-secondary-50 p-3 rounded text-sm font-mono">
              Given I am on the homepage<br/>
              When I navigate to "/login"<br/>
              Then I should see the login form
            </div>
          </div>
          <div>
            <h4 className="font-medium text-secondary-900 mb-2">Form Interaction</h4>
            <div className="bg-secondary-50 p-3 rounded text-sm font-mono">
              When I fill in "email" with "test@example.com"<br/>
              And I fill in "password" with "password123"<br/>
              And I click "Login"
            </div>
          </div>
          <div>
            <h4 className="font-medium text-secondary-900 mb-2">Assertions</h4>
            <div className="bg-secondary-50 p-3 rounded text-sm font-mono">
              Then I should see "Welcome"<br/>
              And I should be on "/dashboard"<br/>
              And the page title should be "Dashboard"
            </div>
          </div>
          <div>
            <h4 className="font-medium text-secondary-900 mb-2">Waiting</h4>
            <div className="bg-secondary-50 p-3 rounded text-sm font-mono">
              When I click "Submit"<br/>
              And I wait for the loading spinner to disappear<br/>
              Then I should see the success message
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default TestEditor;