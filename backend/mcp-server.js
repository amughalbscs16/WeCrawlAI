#!/usr/bin/env node

/**
 * MCP Server for Test Generation
 * This server provides direct access to test generation capabilities via MCP
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import apiLogger from './apiLoggerModule.js';

// Load environment variables
dotenv.config();

// Load model configuration
let modelConfig;
try {
  modelConfig = JSON.parse(readFileSync('./backend/model-config.json', 'utf8'));
} catch {
  modelConfig = { models: { cheapest: { name: 'gpt-3.5-turbo' } }, defaultModel: 'cheapest' };
}

class TestGenerationMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'test-generation-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize OpenAI
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === 'your_openai_api_key_here') {
      console.error('Warning: OpenAI API key not configured');
      this.openai = null;
    } else {
      this.openai = new OpenAI({ apiKey });
    }

    this.logFilePath = path.join(process.cwd(), 'logs_code.txt');
    this.setupHandlers();
  }

  setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'generate_test',
          description: 'Generate test code from a scenario description using GPT-4o-mini',
          inputSchema: {
            type: 'object',
            properties: {
              summary: {
                type: 'string',
                description: 'Brief summary of what to test',
              },
              actions: {
                type: 'array',
                items: {
                  type: 'string',
                },
                description: 'List of actions to perform in the test',
              },
              format: {
                type: 'string',
                enum: ['full', 'code_only', 'annotated'],
                description: 'Output format: full (with metadata), code_only (just code), annotated (code with inline comments)',
                default: 'code_only',
              },
            },
            required: ['summary', 'actions'],
          },
        },
        {
          name: 'get_test_history',
          description: 'Retrieve previously generated tests from the log file',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Number of recent tests to retrieve',
                default: 5,
              },
              format: {
                type: 'string',
                enum: ['full', 'summary'],
                description: 'Output format for history',
                default: 'summary',
              },
            },
          },
        },
        {
          name: 'extract_last_test',
          description: 'Extract the last generated test code in a clean format ready for use',
          inputSchema: {
            type: 'object',
            properties: {
              include_annotations: {
                type: 'boolean',
                description: 'Include inline annotations in the extracted code',
                default: false,
              },
            },
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'generate_test':
          return await this.generateTest(request.params.arguments);
        case 'get_test_history':
          return await this.getTestHistory(request.params.arguments);
        case 'extract_last_test':
          return await this.extractLastTest(request.params.arguments);
        default:
          throw new Error(`Unknown tool: ${request.params.name}`);
      }
    });
  }

  async generateTest(args) {
    if (!this.openai) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: OpenAI API key not configured. Please set OPENAI_API_KEY in your .env file.',
          },
        ],
      };
    }

    try {
      const { summary, actions, format = 'code_only' } = args;

      // Build the prompt
      const prompt = `Generate test code for the following scenario:

Summary: ${summary}

Actions to perform:
${actions.map((action, i) => `${i + 1}. ${action}`).join('\n')}

Requirements:
1. Generate complete, production-ready test code
2. Use modern JavaScript/TypeScript syntax
3. Include proper error handling
4. Add clear comments explaining each step
5. Make it compatible with common testing frameworks (Jest/Mocha/Playwright)
${format === 'annotated' ? '6. Include detailed inline comments and annotations' : ''}`;

      // Use the cheapest configured model with fallback
      const modelName = modelConfig.models[modelConfig.defaultModel].name;
      const modelPricing = modelConfig.models[modelConfig.defaultModel].pricing;

      console.error(`Using model: ${modelName} ($${modelPricing.input_per_1M}/1M input tokens)`);

      // Start timer and log request
      const startTime = Date.now();
      const requestId = await apiLogger.logRequest(
        'mcp_generate_test',
        modelName,
        { summary, actions, format, prompt },
        startTime
      );

      let completion;
      let actualModel = modelName;
      try {
        // GPT-5-nano might have different parameter requirements
        const baseParams = {
          model: modelName,
          messages: [
            {
              role: 'system',
              content: 'You are an expert test automation engineer. Generate clean, well-structured test code.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          max_tokens: 2000,
        };

        // Only add temperature for models that support it
        // GPT-5-nano may not support temperature parameter
        if (!modelName.includes('gpt-5-nano')) {
          baseParams.temperature = 0.3;
        }

        completion = await this.openai.chat.completions.create(baseParams);
      } catch (error) {
        // Fallback to gpt-3.5-turbo if GPT-5 nano fails
        if (error.code === 'model_not_found' || error.message?.includes('model')) {
          console.error('GPT-5 nano not available, falling back to gpt-3.5-turbo');
          actualModel = 'gpt-3.5-turbo';
          completion = await this.openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
              {
                role: 'system',
                content: 'You are an expert test automation engineer. Generate clean, well-structured test code.',
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            temperature: 0.3,
            max_tokens: 2000,
          });
        } else {
          // Log error and rethrow
          await apiLogger.logResponse(requestId, 'mcp_generate_test', modelName, { summary, actions }, null, startTime, error);
          throw error;
        }
      }

      const generatedCode = completion.choices[0]?.message?.content || '';

      // Log successful response
      await apiLogger.logResponse(
        requestId,
        'mcp_generate_test',
        actualModel,
        { summary, actions, format },
        completion,
        startTime
      );

      // Log to file
      await this.logGeneratedTest(summary, actions, generatedCode);

      // Format output based on requested format
      if (format === 'code_only') {
        // Extract just the code blocks
        const codeMatch = generatedCode.match(/```(?:javascript|typescript|js|ts)?\n([\s\S]*?)```/);
        const cleanCode = codeMatch ? codeMatch[1] : generatedCode;

        return {
          content: [
            {
              type: 'text',
              text: cleanCode.trim(),
            },
          ],
        };
      } else if (format === 'annotated') {
        return {
          content: [
            {
              type: 'text',
              text: generatedCode,
            },
          ],
        };
      } else {
        // Full format with metadata
        return {
          content: [
            {
              type: 'text',
              text: `## Generated Test for: ${summary}\n\n### Actions:\n${actions.map((a, i) => `${i + 1}. ${a}`).join('\n')}\n\n### Generated Code:\n\`\`\`javascript\n${generatedCode}\n\`\`\`\n\n✅ Test logged to: logs_code.txt`,
            },
          ],
        };
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error generating test: ${error.message}`,
          },
        ],
      };
    }
  }

  async getTestHistory(args) {
    try {
      const { limit = 5, format = 'summary' } = args;

      const logContent = await fs.readFile(this.logFilePath, 'utf8').catch(() => '');
      const entries = logContent.split('='.repeat(80)).filter(entry => entry.trim());
      const recentEntries = entries.slice(-limit);

      if (format === 'summary') {
        // Extract just summaries
        const summaries = recentEntries.map((entry, i) => {
          const scenarioMatch = entry.match(/SCENARIO: (.+)/);
          const timestampMatch = entry.match(/TIMESTAMP: (.+)/);
          return `${i + 1}. ${scenarioMatch ? scenarioMatch[1] : 'Unknown'} (${timestampMatch ? timestampMatch[1] : 'Unknown time'})`;
        });

        return {
          content: [
            {
              type: 'text',
              text: `## Recent Test Generation History:\n\n${summaries.join('\n')}`,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: recentEntries.join('\n' + '='.repeat(80) + '\n'),
            },
          ],
        };
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error retrieving history: ${error.message}`,
          },
        ],
      };
    }
  }

  async extractLastTest(args) {
    try {
      const { include_annotations = false } = args;

      const logContent = await fs.readFile(this.logFilePath, 'utf8').catch(() => '');
      const entries = logContent.split('='.repeat(80)).filter(entry => entry.trim());

      if (entries.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No tests found in history.',
            },
          ],
        };
      }

      const lastEntry = entries[entries.length - 1];
      const codeMatch = lastEntry.match(/GENERATED CODE:\n([\s\S]+?)(?:\n={80}|$)/);

      if (!codeMatch) {
        return {
          content: [
            {
              type: 'text',
              text: 'Could not extract code from last test entry.',
            },
          ],
        };
      }

      let code = codeMatch[1].trim();

      // Clean up the code
      if (!include_annotations) {
        // Remove excessive comments if not requested
        code = code.replace(/\/\/ Step \d+:.*/g, '');
        code = code.replace(/\/\*[\s\S]*?\*\//g, '');
        code = code.replace(/\n\s*\n\s*\n/g, '\n\n'); // Remove excessive blank lines
      }

      // Extract code from markdown code blocks if present
      const cleanCodeMatch = code.match(/```(?:javascript|typescript|js|ts)?\n([\s\S]*?)```/);
      if (cleanCodeMatch) {
        code = cleanCodeMatch[1];
      }

      return {
        content: [
          {
            type: 'text',
            text: code.trim(),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error extracting test: ${error.message}`,
          },
        ],
      };
    }
  }

  async logGeneratedTest(summary, actions, code) {
    const timestamp = new Date().toISOString();
    const separator = '='.repeat(80);

    const logEntry = `
${separator}
TIMESTAMP: ${timestamp}
SCENARIO: ${summary}

ACTIONS:
${actions.map((action, i) => `  ${i + 1}. ${action}`).join('\n')}

GENERATED CODE:
${code}

${separator}

`;

    try {
      await fs.appendFile(this.logFilePath, logEntry, 'utf8');
    } catch (error) {
      console.error('Failed to log test:', error);
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Test Generation MCP Server running...');
  }
}

// Run the server
const server = new TestGenerationMCPServer();
server.run().catch(console.error);