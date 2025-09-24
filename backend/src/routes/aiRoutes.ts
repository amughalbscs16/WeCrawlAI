import { Router, Request, Response } from 'express';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { AIService } from '../services/AIService';
import { validateAIRequest } from '../middleware/validation';
import { logger } from '../utils/logger';

const router = Router();
const aiService = new AIService();

// Parse test scenario into structured steps
router.post('/parse-scenario', validateAIRequest, asyncHandler(async (req: Request, res: Response) => {
  const { scenario, context } = req.body;

  logger.info('AI scenario parsing requested', {
    scenarioLength: scenario.length,
    hasContext: !!context
  });

  try {
    const parsedSteps = await aiService.parseScenario(scenario, context);

    res.status(200).json({
      success: true,
      data: {
        originalScenario: scenario,
        parsedSteps,
        stepCount: parsedSteps.length
      }
    });
  } catch (error) {
    logger.error('AI scenario parsing failed', { error: error.message });
    throw createError('Failed to parse scenario with AI', 500);
  }
}));

// Generate test actions from natural language
router.post('/generate-actions', validateAIRequest, asyncHandler(async (req: Request, res: Response) => {
  const { instruction, pageContext, previousActions = [] } = req.body;

  logger.info('AI action generation requested', {
    instruction,
    hasPageContext: !!pageContext,
    previousActionsCount: previousActions.length
  });

  try {
    const actions = await aiService.generateActions({
      instruction,
      pageContext,
      previousActions
    });

    res.status(200).json({
      success: true,
      data: {
        instruction,
        generatedActions: actions,
        actionCount: actions.length
      }
    });
  } catch (error) {
    logger.error('AI action generation failed', { error: error.message });
    throw createError('Failed to generate actions with AI', 500);
  }
}));

// Analyze test results and provide insights
router.post('/analyze-results', asyncHandler(async (req: Request, res: Response) => {
  const { testResults, scenario, expectations } = req.body;

  if (!testResults || !scenario) {
    throw createError('Test results and scenario are required', 400);
  }

  logger.info('AI result analysis requested', {
    hasResults: !!testResults,
    scenarioLength: scenario.length,
    hasExpectations: !!expectations
  });

  try {
    const analysis = await aiService.analyzeResults({
      testResults,
      scenario,
      expectations
    });

    res.status(200).json({
      success: true,
      data: {
        analysis,
        confidence: analysis.confidence || 0.85,
        recommendations: analysis.recommendations || []
      }
    });
  } catch (error) {
    logger.error('AI result analysis failed', { error: error.message });
    throw createError('Failed to analyze results with AI', 500);
  }
}));

// Convert English text to executable code
router.post('/convert-to-code', asyncHandler(async (req: Request, res: Response) => {
  const { englishText, targetLanguage = 'selenium-webdriver', framework = 'nodejs' } = req.body;

  if (!englishText || englishText.trim().length < 5) {
    throw createError('English text is required and must be at least 5 characters long', 400);
  }

  logger.info('AI code conversion requested', {
    textLength: englishText.length,
    targetLanguage,
    framework
  });

  try {
    const convertedCode = await aiService.convertToCode({
      englishText: englishText.trim(),
      targetLanguage,
      framework,
      browserType: 'chrome'
    });

    res.status(200).json({
      success: true,
      data: {
        originalText: englishText,
        convertedCode,
        targetLanguage,
        framework,
        browserType: 'chrome'
      }
    });
  } catch (error) {
    logger.error('AI code conversion failed', { error: error.message });

    // Fallback to simple rule-based conversion
    const fallbackCode = generateFallbackCode(englishText, targetLanguage, framework);

    res.status(200).json({
      success: true,
      data: {
        originalText: englishText,
        convertedCode: fallbackCode,
        targetLanguage,
        framework,
        browserType: 'chrome',
        fallback: true
      }
    });
  }
}));

// Simple fallback function for code generation
function generateFallbackCode(englishText: string, targetLanguage: string, framework: string): string {
  const lines = englishText.split('\n').filter(line => line.trim());
  const codeLines: string[] = [];

  codeLines.push('// Auto-generated Chrome WebDriver code (Fallback)');
  codeLines.push('const { Builder, By, until } = require("selenium-webdriver");');
  codeLines.push('const chrome = require("selenium-webdriver/chrome");');
  codeLines.push('const path = require("path");');
  codeLines.push('');
  codeLines.push('async function runTest() {');
  codeLines.push('  const chromeDriverPath = path.join(__dirname, "drivers", "chromedriver.exe");');
  codeLines.push('  const service = new chrome.ServiceBuilder(chromeDriverPath);');
  codeLines.push('  const options = new chrome.Options();');
  codeLines.push('  options.addArguments("--no-sandbox", "--disable-dev-shm-usage");');
  codeLines.push('');
  codeLines.push('  const driver = await new Builder()');
  codeLines.push('    .forBrowser("chrome")');
  codeLines.push('    .setChromeService(service)');
  codeLines.push('    .setChromeOptions(options)');
  codeLines.push('    .build();');
  codeLines.push('');
  codeLines.push('  try {');

  for (const line of lines) {
    const trimmedLine = line.trim().toLowerCase();

    if (trimmedLine.includes('navigate') || trimmedLine.includes('go to') || trimmedLine.includes('visit') || trimmedLine.includes('open')) {
      const urlMatch = trimmedLine.match(/to\s+"([^"]+)"|to\s+([^\s,]+)|open\s+"([^"]+)"|open\s+([^\s,]+)/);
      if (urlMatch) {
        const url = urlMatch[1] || urlMatch[2] || urlMatch[3] || urlMatch[4];
        codeLines.push(`    // ${line}`);
        codeLines.push(`    await driver.get("${url}");`);
        codeLines.push(`    await driver.sleep(2000);`);
      }
    } else if (trimmedLine.includes('click')) {
      const elementMatch = trimmedLine.match(/"([^"]+)"|'([^']+)'|click\s+([^\s,]+)|on\s+([^\s,]+)/);
      if (elementMatch) {
        const element = elementMatch[1] || elementMatch[2] || elementMatch[3] || elementMatch[4];
        codeLines.push(`    // ${line}`);
        codeLines.push(`    const clickElement = await driver.wait(until.elementLocated(`);
        codeLines.push(`      By.css('[data-testid="${element}"], #${element}, .${element}, [name="${element}"]')`);
        codeLines.push(`    ), 10000);`);
        codeLines.push(`    await clickElement.click();`);
        codeLines.push(`    await driver.sleep(1000);`);
      }
    } else if (trimmedLine.includes('type') || trimmedLine.includes('fill') || trimmedLine.includes('enter')) {
      const fieldMatch = trimmedLine.match(/"([^"]+)"|'([^']+)'/g);
      if (fieldMatch && fieldMatch.length >= 2) {
        const field = fieldMatch[0].replace(/['"]/g, '');
        const value = fieldMatch[1].replace(/['"]/g, '');
        codeLines.push(`    // ${line}`);
        codeLines.push(`    const inputField = await driver.wait(until.elementLocated(`);
        codeLines.push(`      By.css('[name="${field}"], #${field}, [data-testid="${field}"]')`);
        codeLines.push(`    ), 10000);`);
        codeLines.push(`    await inputField.clear();`);
        codeLines.push(`    await inputField.sendKeys("${value}");`);
        codeLines.push(`    await driver.sleep(500);`);
      }
    } else if (trimmedLine.includes('wait') || trimmedLine.includes('should see')) {
      const elementMatch = trimmedLine.match(/"([^"]+)"|'([^']+)'/);
      if (elementMatch) {
        const element = elementMatch[1] || elementMatch[2];
        codeLines.push(`    // ${line}`);
        codeLines.push(`    await driver.wait(until.elementLocated(`);
        codeLines.push(`      By.xpath("//*[contains(text(), '${element}')]")`);
        codeLines.push(`    ), 10000);`);
        codeLines.push(`    console.log("✓ Found element: ${element}");`);
      }
    } else if (trimmedLine.includes('assert') || trimmedLine.includes('verify') || trimmedLine.includes('should')) {
      codeLines.push(`    // ${line}`);
      codeLines.push(`    // Add your assertion logic here`);
      codeLines.push(`    console.log("✓ Assertion: ${line}");`);
    } else if (line.trim()) {
      codeLines.push(`    // ${line}`);
    }

    if (line.trim()) {
      codeLines.push('');
    }
  }

  codeLines.push('    console.log("✅ Test completed successfully!");');
  codeLines.push('  } catch (error) {');
  codeLines.push('    console.error("❌ Test failed:", error);');
  codeLines.push('    throw error;');
  codeLines.push('  } finally {');
  codeLines.push('    await driver.quit();');
  codeLines.push('  }');
  codeLines.push('}');
  codeLines.push('');
  codeLines.push('// Run the test');
  codeLines.push('runTest().catch(console.error);');

  return codeLines.join('\n');
}

// Get AI model information and capabilities
router.get('/models', asyncHandler(async (req: Request, res: Response) => {
  const models = await aiService.getAvailableModels();

  res.status(200).json({
    success: true,
    data: {
      models,
      currentModel: aiService.getCurrentModel(),
      capabilities: aiService.getCapabilities()
    }
  });
}));

// Switch AI model
router.post('/models/switch', asyncHandler(async (req: Request, res: Response) => {
  const { modelId } = req.body;

  if (!modelId) {
    throw createError('Model ID is required', 400);
  }

  logger.info('AI model switch requested', { modelId });

  try {
    await aiService.switchModel(modelId);

    res.status(200).json({
      success: true,
      data: {
        message: 'Model switched successfully',
        currentModel: aiService.getCurrentModel()
      }
    });
  } catch (error) {
    logger.error('AI model switch failed', { error: error.message, modelId });
    throw createError('Failed to switch AI model', 500);
  }
}));

export { router as aiRoutes };