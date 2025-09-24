import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { createError } from './errorHandler';

// Test scenario validation schema
const testScenarioSchema = Joi.object({
  scenario: Joi.string().min(10).max(10000).required()
    .messages({
      'string.min': 'Scenario must be at least 10 characters long',
      'string.max': 'Scenario must be less than 10000 characters',
      'any.required': 'Test scenario is required'
    }),
  url: Joi.string().uri().required()
    .messages({
      'string.uri': 'URL must be a valid URI',
      'any.required': 'Target URL is required'
    }),
  options: Joi.object({
    browser: Joi.string().valid('chrome').default('chrome'),
    headless: Joi.boolean().default(false),
    timeout: Joi.number().min(5000).max(300000).default(30000),
    viewport: Joi.object({
      width: Joi.number().min(320).max(2560).default(1280),
      height: Joi.number().min(240).max(1440).default(720)
    }).default(),
    device: Joi.string().optional(),
    locale: Joi.string().default('en-US'),
    timezone: Joi.string().default('UTC'),
    enableSecurity: Joi.boolean().default(true),
    enableScreenshots: Joi.boolean().default(true),
    enableVideo: Joi.boolean().default(false)
  }).default()
});

// AI request validation schema
const aiRequestSchema = Joi.object({
  scenario: Joi.string().min(1).max(10000).optional(),
  instruction: Joi.string().min(1).max(1000).optional(),
  context: Joi.object().optional(),
  pageContext: Joi.object().optional(),
  previousActions: Joi.array().items(Joi.object()).optional()
}).or('scenario', 'instruction');

// Generic validation middleware
const validate = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      allowUnknown: false,
      stripUnknown: true
    });

    if (error) {
      const errorMessage = error.details
        .map(detail => detail.message)
        .join(', ');

      throw createError(`Validation error: ${errorMessage}`, 400);
    }

    req.body = value;
    next();
  };
};

export const validateTestScenario = validate(testScenarioSchema);
export const validateAIRequest = validate(aiRequestSchema);

// URL validation helper
export const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

// BDD scenario validation helper
export const validateBDDScenario = (scenario: string): {
  isValid: boolean;
  errors: string[];
  structure: {
    hasTitle: boolean;
    hasGiven: boolean;
    hasWhen: boolean;
    hasThen: boolean;
  };
} => {
  const errors: string[] = [];
  const lines = scenario.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  const structure = {
    hasTitle: false,
    hasGiven: false,
    hasWhen: false,
    hasThen: false
  };

  // Check for scenario title
  const titlePattern = /^(Scenario|Feature):/i;
  if (lines.some(line => titlePattern.test(line))) {
    structure.hasTitle = true;
  } else {
    errors.push('Scenario should have a title (e.g., "Scenario: User login")');
  }

  // Check for Given statements
  if (lines.some(line => /^(Given|And)\s+/i.test(line))) {
    structure.hasGiven = true;
  } else {
    errors.push('Scenario should have at least one Given statement');
  }

  // Check for When statements
  if (lines.some(line => /^(When|And)\s+/i.test(line))) {
    structure.hasWhen = true;
  } else {
    errors.push('Scenario should have at least one When statement');
  }

  // Check for Then statements
  if (lines.some(line => /^(Then|And)\s+/i.test(line))) {
    structure.hasThen = true;
  } else {
    errors.push('Scenario should have at least one Then statement');
  }

  return {
    isValid: errors.length === 0,
    errors,
    structure
  };
};