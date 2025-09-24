import { logger } from '../utils/logger';
import axios from 'axios';
import { config } from 'dotenv';

config();

export interface ParsedTestStep {
  description: string;
  action: string;
  selector?: string;
  value?: string;
  expected?: string;
  type: 'navigation' | 'interaction' | 'assertion' | 'wait';
}

export interface AIModelConfig {
  provider: 'anthropic' | 'openai';
  model: string;
  temperature: number;
  maxTokens: number;
  timeout: number;
}

export interface ActionGenerationContext {
  instruction: string;
  pageContext?: {
    url: string;
    title: string;
    elements: any[];
    currentState: string;
  };
  previousActions: any[];
}

export interface TestResultAnalysis {
  summary: string;
  passed: number;
  failed: number;
  confidence: number;
  insights: string[];
  recommendations: string[];
  securityIssues: any[];
  performanceMetrics: any;
}

export class AIService {
  private currentConfig: AIModelConfig;
  private anthropicApiKey: string;
  private openaiApiKey: string;

  constructor() {
    this.currentConfig = {
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      temperature: 0.1,
      maxTokens: 4000,
      timeout: 30000,
    };

    this.anthropicApiKey = process.env.ANTHROPIC_API_KEY || '';
    this.openaiApiKey = process.env.OPENAI_API_KEY || '';

    if (!this.anthropicApiKey && !this.openaiApiKey) {
      logger.warn('No AI API keys configured. Using mock implementation.');
    }
  }

  async parseScenario(scenario: string, context?: any): Promise<ParsedTestStep[]> {
    logger.info('Parsing test scenario with AI', {
      scenarioLength: scenario.length,
      hasContext: !!context,
      provider: this.currentConfig.provider
    });

    // If no API keys available, fall back to mock
    if (!this.anthropicApiKey && !this.openaiApiKey) {
      return this.mockParseScenario(scenario);
    }

    try {
      const prompt = this.buildScenarioParsingPrompt(scenario, context);
      const response = await this.callAI(prompt);
      const steps = this.parseAIResponse(response);

      logger.info('Scenario parsed successfully with AI', {
        inputLength: scenario.length,
        outputSteps: steps.length,
        provider: this.currentConfig.provider
      });

      return steps;
    } catch (error) {
      logger.error('AI parsing failed, falling back to mock', { error: error.message });
      return this.mockParseScenario(scenario);
    }
  }

  async generateActions(context: ActionGenerationContext): Promise<any[]> {
    logger.info('Generating actions with AI', {
      instruction: context.instruction,
      hasPageContext: !!context.pageContext,
      previousActionsCount: context.previousActions.length,
    });

    if (!this.anthropicApiKey && !this.openaiApiKey) {
      return this.mockGenerateActions(context);
    }

    try {
      const prompt = this.buildActionGenerationPrompt(context);
      const response = await this.callAI(prompt);
      const actions = this.parseActionsResponse(response);

      logger.info('Actions generated successfully with AI', {
        actionsCount: actions.length,
        provider: this.currentConfig.provider
      });

      return actions;
    } catch (error) {
      logger.error('AI action generation failed, falling back to mock', { error: error.message });
      return this.mockGenerateActions(context);
    }
  }

  async analyzeResults(data: {
    testResults: any;
    scenario: string;
    expectations?: string;
  }): Promise<TestResultAnalysis> {
    logger.info('Analyzing test results with AI', {
      hasResults: !!data.testResults,
      scenarioLength: data.scenario.length,
    });

    if (!this.anthropicApiKey && !this.openaiApiKey) {
      return this.mockAnalyzeResults(data);
    }

    try {
      const prompt = this.buildResultAnalysisPrompt(data);
      const response = await this.callAI(prompt);
      const analysis = this.parseAnalysisResponse(response);

      logger.info('Results analyzed successfully with AI', {
        confidence: analysis.confidence,
        provider: this.currentConfig.provider
      });

      return analysis;
    } catch (error) {
      logger.error('AI result analysis failed, falling back to mock', { error: error.message });
      return this.mockAnalyzeResults(data);
    }
  }

  async convertToCode(data: {
    englishText: string;
    targetLanguage: string;
    framework: string;
    browserType: string;
  }): Promise<string> {
    logger.info('Converting English text to code with AI', {
      textLength: data.englishText.length,
      targetLanguage: data.targetLanguage,
      framework: data.framework,
      browserType: data.browserType
    });

    if (!this.anthropicApiKey && !this.openaiApiKey) {
      throw new Error('AI code conversion requires API key configuration');
    }

    try {
      const prompt = this.buildCodeConversionPrompt(data);
      const response = await this.callAI(prompt);
      const convertedCode = this.parseCodeResponse(response);

      logger.info('Code conversion completed successfully with AI', {
        codeLength: convertedCode.length,
        provider: this.currentConfig.provider
      });

      return convertedCode;
    } catch (error) {
      logger.error('AI code conversion failed', { error: error.message });
      throw error;
    }
  }

  private buildCodeConversionPrompt(data: {
    englishText: string;
    targetLanguage: string;
    framework: string;
    browserType: string;
  }): string {
    return `You are an expert in test automation and code generation. Convert this natural language description into executable ${data.targetLanguage} code using ${data.framework} framework for ${data.browserType} browser.

Natural Language Description:
${data.englishText}

Requirements:
- Generate clean, executable ${data.targetLanguage} code
- Use ChromeDriver version 138.0.7204.49 (path: drivers/chromedriver.exe)
- Include proper error handling and try/catch blocks
- Add appropriate waits and timeouts
- Use modern async/await syntax
- Include helpful comments
- Make the code production-ready

Code Structure:
- Import required modules
- Set up ChromeDriver with proper path
- Configure Chrome options
- Create test function with proper error handling
- Clean up resources in finally block

Return only the complete, executable code without any markdown formatting or explanations.`;
  }

  private parseCodeResponse(response: string): string {
    // Remove markdown code blocks if present
    let code = response.replace(/```[\w]*\n?/g, '').trim();

    // If response contains explanations, try to extract just the code
    const codeBlockMatch = response.match(/```[\w]*\n([\s\S]*?)\n```/);
    if (codeBlockMatch) {
      code = codeBlockMatch[1].trim();
    }

    // Remove leading/trailing explanations
    const lines = code.split('\n');
    let startIndex = 0;
    let endIndex = lines.length - 1;

    // Find first line that looks like code (import, const, function, etc.)
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(/^(const|import|function|async|\/\/)/)) {
        startIndex = i;
        break;
      }
    }

    // Find last line that looks like code
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim() && !lines[i].match(/^(Note:|Important:|Explanation:)/i)) {
        endIndex = i;
        break;
      }
    }

    return lines.slice(startIndex, endIndex + 1).join('\n');
  }

  async getAvailableModels(): Promise<{ provider: string; models: string[] }[]> {
    return [
      {
        provider: 'anthropic',
        models: [
          'claude-3-5-sonnet-20241022',
          'claude-3-5-haiku-20241022',
          'claude-3-opus-20240229',
          'claude-3-sonnet-20240229',
          'claude-3-haiku-20240307',
        ],
      },
      {
        provider: 'openai',
        models: [
          'gpt-4o',
          'gpt-4o-mini',
          'gpt-4-turbo',
          'gpt-4',
          'gpt-3.5-turbo',
        ],
      },
    ];
  }

  getCurrentModel(): AIModelConfig {
    return this.currentConfig;
  }

  async switchModel(modelId: string): Promise<void> {
    const [provider, model] = modelId.split(':');

    if (!provider || !model) {
      throw new Error('Invalid model ID format. Use "provider:model"');
    }

    this.currentConfig = {
      ...this.currentConfig,
      provider: provider as 'anthropic' | 'openai',
      model,
    };

    logger.info('AI model switched', {
      provider,
      model,
    });
  }

  getCapabilities(): {
    scenarioParsing: boolean;
    actionGeneration: boolean;
    resultAnalysis: boolean;
    multiModel: boolean;
  } {
    return {
      scenarioParsing: true,
      actionGeneration: true,
      resultAnalysis: true,
      multiModel: true,
    };
  }

  private buildScenarioParsingPrompt(scenario: string, context?: any): string {
    return `You are an AI testing expert. Parse this BDD scenario into precise, executable test steps.

Scenario:
${scenario}

${context ? `Context: ${JSON.stringify(context, null, 2)}` : ''}

Return a JSON array of test steps with this exact structure:
[
  {
    "description": "human readable step description",
    "action": "navigate|click|type|wait|assert|hover|select|scroll",
    "selector": "CSS selector or null for navigation",
    "value": "text to type or expected value for assertions",
    "expected": "expected result for assertions",
    "type": "navigation|interaction|assertion|wait"
  }
]

Important:
- Use smart CSS selectors (prefer data-testid, then id, then meaningful classes)
- For navigation steps, set selector to null
- For typing steps, extract the actual text to type
- For assertions, specify what should be verified
- Make each step atomic and executable
- Infer missing details intelligently

Return only the JSON array, no other text.`;
  }

  private async callAI(prompt: string): Promise<string> {
    if (this.currentConfig.provider === 'anthropic' && this.anthropicApiKey) {
      return this.callAnthropic(prompt);
    } else if (this.currentConfig.provider === 'openai' && this.openaiApiKey) {
      return this.callOpenAI(prompt);
    } else {
      throw new Error('No valid AI provider configured');
    }
  }

  private async callAnthropic(prompt: string): Promise<string> {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: this.currentConfig.model,
        max_tokens: this.currentConfig.maxTokens,
        temperature: this.currentConfig.temperature,
        messages: [{
          role: 'user',
          content: prompt
        }]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.anthropicApiKey,
          'anthropic-version': '2023-06-01'
        },
        timeout: this.currentConfig.timeout
      }
    );

    return response.data.content[0].text;
  }

  private async callOpenAI(prompt: string): Promise<string> {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: this.currentConfig.model,
        max_tokens: this.currentConfig.maxTokens,
        temperature: this.currentConfig.temperature,
        messages: [{
          role: 'user',
          content: prompt
        }]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.openaiApiKey}`
        },
        timeout: this.currentConfig.timeout
      }
    );

    return response.data.choices[0].message.content;
  }

  private parseAIResponse(response: string): ParsedTestStep[] {
    try {
      // Extract JSON from response if wrapped in markdown or other text
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      const jsonStr = jsonMatch ? jsonMatch[0] : response;

      const steps = JSON.parse(jsonStr);

      // Validate and clean up the steps
      return steps.map((step: any) => ({
        description: step.description || 'Unknown step',
        action: step.action || 'wait',
        selector: step.selector || null,
        value: step.value || null,
        expected: step.expected || null,
        type: step.type || 'interaction'
      }));
    } catch (error) {
      logger.error('Failed to parse AI response as JSON', { error: error.message, response });
      throw new Error('Invalid AI response format');
    }
  }

  private buildActionGenerationPrompt(context: ActionGenerationContext): string {
    return `You are an AI testing expert. Generate precise browser automation actions for this instruction.

Instruction: ${context.instruction}

${context.pageContext ? `
Page Context:
- URL: ${context.pageContext.url}
- Title: ${context.pageContext.title}
- Current State: ${context.pageContext.currentState}
- Available Elements: ${JSON.stringify(context.pageContext.elements, null, 2)}
` : ''}

${context.previousActions.length > 0 ? `
Previous Actions:
${JSON.stringify(context.previousActions, null, 2)}
` : ''}

Return a JSON array of actions with this structure:
[
  {
    "type": "click|type|navigate|wait|hover|scroll|select",
    "selector": "CSS selector or null for navigation",
    "value": "text to type or option to select",
    "description": "human readable action description",
    "waitFor": "optional selector to wait for after action",
    "timeout": 5000
  }
]

Make actions specific, reliable, and executable. Return only the JSON array.`;
  }

  private buildResultAnalysisPrompt(data: {
    testResults: any;
    scenario: string;
    expectations?: string;
  }): string {
    return `You are an AI testing expert. Analyze these test execution results comprehensively.

Original Scenario:
${data.scenario}

${data.expectations ? `
Expected Outcomes:
${data.expectations}
` : ''}

Test Results:
${JSON.stringify(data.testResults, null, 2)}

Provide a comprehensive analysis in this JSON format:
{
  "summary": "Brief executive summary of test results",
  "passed": number_of_passed_tests,
  "failed": number_of_failed_tests,
  "confidence": 0.0_to_1.0_confidence_score,
  "insights": ["key insight 1", "key insight 2"],
  "recommendations": ["specific recommendation 1", "specific recommendation 2"],
  "securityIssues": [{"type": "issue_type", "severity": "low|medium|high", "description": "issue_description"}],
  "performanceMetrics": {
    "loadTime": milliseconds,
    "issues": ["performance issue 1"]
  }
}

Focus on actionable insights and specific recommendations. Return only the JSON object.`;
  }

  private parseActionsResponse(response: string): any[] {
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      const jsonStr = jsonMatch ? jsonMatch[0] : response;
      return JSON.parse(jsonStr);
    } catch (error) {
      logger.error('Failed to parse AI actions response', { error: error.message, response });
      throw new Error('Invalid AI actions response format');
    }
  }

  private parseAnalysisResponse(response: string): TestResultAnalysis {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : response;
      const analysis = JSON.parse(jsonStr);

      return {
        summary: analysis.summary || 'Analysis completed',
        passed: analysis.passed || 0,
        failed: analysis.failed || 0,
        confidence: analysis.confidence || 0.5,
        insights: analysis.insights || [],
        recommendations: analysis.recommendations || [],
        securityIssues: analysis.securityIssues || [],
        performanceMetrics: analysis.performanceMetrics || { loadTime: 0, issues: [] }
      };
    } catch (error) {
      logger.error('Failed to parse AI analysis response', { error: error.message, response });
      throw new Error('Invalid AI analysis response format');
    }
  }

  private mockGenerateActions(context: ActionGenerationContext): any[] {
    return [{
      type: 'click',
      selector: 'button',
      description: `Mock action for: ${context.instruction}`,
    }];
  }

  private mockAnalyzeResults(data: any): TestResultAnalysis {
    return {
      summary: 'Mock analysis completed',
      passed: 3,
      failed: 1,
      confidence: 0.85,
      insights: ['Test execution completed', 'Basic functionality verified'],
      recommendations: ['Consider adding more assertions', 'Review failed test cases'],
      securityIssues: [],
      performanceMetrics: {
        loadTime: 1200,
        issues: []
      }
    };
  }

  private mockParseScenario(scenario: string): ParsedTestStep[] {
    const steps: ParsedTestStep[] = [];
    const lines = scenario.split('\n').filter(line => line.trim());

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.match(/^(Given|When|Then|And)\s+/i)) {
        const description = trimmed.replace(/^(Given|When|Then|And)\s+/i, '');
        let action = 'wait';
        let type: ParsedTestStep['type'] = 'interaction';

        if (description.toLowerCase().includes('navigate') || description.toLowerCase().includes('go to') || description.toLowerCase().includes('on the')) {
          action = 'navigate';
          type = 'navigation';
        } else if (description.toLowerCase().includes('click')) {
          action = 'click';
        } else if (description.toLowerCase().includes('type') || description.toLowerCase().includes('enter') || description.toLowerCase().includes('fill')) {
          action = 'type';
        } else if (description.toLowerCase().includes('should') || description.toLowerCase().includes('verify') || description.toLowerCase().includes('see')) {
          action = 'assert';
          type = 'assertion';
        }

        steps.push({
          description,
          action,
          type,
          selector: action === 'navigate' ? undefined : 'body',
          value: action === 'type' ? 'test-value' : undefined,
          expected: type === 'assertion' ? 'success' : undefined,
        });
      }
    }

    return steps;
  }
}