import React from 'react';
import { motion } from 'framer-motion';

const Documentation: React.FC = () => {
  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl font-bold text-secondary-900 mb-2">
          Documentation
        </h1>
        <p className="text-secondary-600">
          Learn how to use the AI Testing Agent effectively
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
      >
        <div className="card hover:shadow-md transition-shadow">
          <div className="text-center">
            <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">🚀</span>
            </div>
            <h3 className="text-lg font-semibold text-secondary-900 mb-2">
              Quick Start Guide
            </h3>
            <p className="text-secondary-600 text-sm mb-4">
              Get up and running with your first AI-powered test in minutes
            </p>
            <button className="btn btn-outline btn-sm w-full">
              View Guide
            </button>
          </div>
        </div>

        <div className="card hover:shadow-md transition-shadow">
          <div className="text-center">
            <div className="w-12 h-12 bg-success-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">📖</span>
            </div>
            <h3 className="text-lg font-semibold text-secondary-900 mb-2">
              BDD Syntax Reference
            </h3>
            <p className="text-secondary-600 text-sm mb-4">
              Complete guide to writing effective test scenarios
            </p>
            <button className="btn btn-outline btn-sm w-full">
              View Reference
            </button>
          </div>
        </div>

        <div className="card hover:shadow-md transition-shadow">
          <div className="text-center">
            <div className="w-12 h-12 bg-warning-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">🔍</span>
            </div>
            <h3 className="text-lg font-semibold text-secondary-900 mb-2">
              Security Testing
            </h3>
            <p className="text-secondary-600 text-sm mb-4">
              Understanding automated vulnerability detection
            </p>
            <button className="btn btn-outline btn-sm w-full">
              Learn More
            </button>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="card"
      >
        <h2 className="text-xl font-semibold text-secondary-900 mb-6">
          📚 Documentation Sections
        </h2>

        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-medium text-secondary-900 mb-3">Getting Started</h3>
            <div className="space-y-2">
              <a href="#" className="block text-primary-600 hover:text-primary-700 text-sm">
                → Installation and Setup
              </a>
              <a href="#" className="block text-primary-600 hover:text-primary-700 text-sm">
                → Your First Test
              </a>
              <a href="#" className="block text-primary-600 hover:text-primary-700 text-sm">
                → Understanding Results
              </a>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-medium text-secondary-900 mb-3">Writing Tests</h3>
            <div className="space-y-2">
              <a href="#" className="block text-primary-600 hover:text-primary-700 text-sm">
                → BDD Syntax Guide
              </a>
              <a href="#" className="block text-primary-600 hover:text-primary-700 text-sm">
                → Common Patterns
              </a>
              <a href="#" className="block text-primary-600 hover:text-primary-700 text-sm">
                → Best Practices
              </a>
              <a href="#" className="block text-primary-600 hover:text-primary-700 text-sm">
                → Troubleshooting
              </a>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-medium text-secondary-900 mb-3">AI Features</h3>
            <div className="space-y-2">
              <a href="#" className="block text-primary-600 hover:text-primary-700 text-sm">
                → How AI Parsing Works
              </a>
              <a href="#" className="block text-primary-600 hover:text-primary-700 text-sm">
                → Model Comparison
              </a>
              <a href="#" className="block text-primary-600 hover:text-primary-700 text-sm">
                → Improving Accuracy
              </a>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-medium text-secondary-900 mb-3">Security Testing</h3>
            <div className="space-y-2">
              <a href="#" className="block text-primary-600 hover:text-primary-700 text-sm">
                → Security Test Types
              </a>
              <a href="#" className="block text-primary-600 hover:text-primary-700 text-sm">
                → Interpreting Findings
              </a>
              <a href="#" className="block text-primary-600 hover:text-primary-700 text-sm">
                → Remediation Guide
              </a>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-medium text-secondary-900 mb-3">Compliance</h3>
            <div className="space-y-2">
              <a href="#" className="block text-primary-600 hover:text-primary-700 text-sm">
                → NIST AI RMF Alignment
              </a>
              <a href="#" className="block text-primary-600 hover:text-primary-700 text-sm">
                → Audit Trail Documentation
              </a>
              <a href="#" className="block text-primary-600 hover:text-primary-700 text-sm">
                → Federal Standards Compliance
              </a>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-medium text-secondary-900 mb-3">API Reference</h3>
            <div className="space-y-2">
              <a href="#" className="block text-primary-600 hover:text-primary-700 text-sm">
                → REST API Endpoints
              </a>
              <a href="#" className="block text-primary-600 hover:text-primary-700 text-sm">
                → WebSocket Events
              </a>
              <a href="#" className="block text-primary-600 hover:text-primary-700 text-sm">
                → SDK Documentation
              </a>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="card"
      >
        <h2 className="text-xl font-semibold text-secondary-900 mb-4">
          🎯 Example Test Scenarios
        </h2>

        <div className="space-y-6">
          <div>
            <h4 className="font-medium text-secondary-900 mb-2">Login Flow</h4>
            <div className="bg-secondary-50 p-4 rounded-lg font-mono text-sm">
              <div className="text-secondary-600">Scenario: User Login</div>
              <div className="text-secondary-800">Given I am on the login page</div>
              <div className="text-secondary-800">When I enter valid credentials</div>
              <div className="text-secondary-800">And I click the login button</div>
              <div className="text-secondary-800">Then I should be logged in successfully</div>
            </div>
          </div>

          <div>
            <h4 className="font-medium text-secondary-900 mb-2">E-commerce Purchase</h4>
            <div className="bg-secondary-50 p-4 rounded-lg font-mono text-sm">
              <div className="text-secondary-600">Scenario: Product Purchase</div>
              <div className="text-secondary-800">Given I am on the product page</div>
              <div className="text-secondary-800">When I add the item to cart</div>
              <div className="text-secondary-800">And I proceed to checkout</div>
              <div className="text-secondary-800">And I enter payment information</div>
              <div className="text-secondary-800">Then I should see order confirmation</div>
            </div>
          </div>

          <div>
            <h4 className="font-medium text-secondary-900 mb-2">Form Validation</h4>
            <div className="bg-secondary-50 p-4 rounded-lg font-mono text-sm">
              <div className="text-secondary-600">Scenario: Contact Form Validation</div>
              <div className="text-secondary-800">Given I am on the contact page</div>
              <div className="text-secondary-800">When I submit the form with invalid email</div>
              <div className="text-secondary-800">Then I should see validation errors</div>
              <div className="text-secondary-800">And the form should not submit</div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default Documentation;