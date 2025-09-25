import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import SecurityResults from '../components/SecurityResults';

interface TestExecution {
  id: string;
  scenario: string;
  url: string;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  steps: any[];
  startTime: string;
  endTime?: string;
  duration?: number;
  screenshots: string[];
  videos: string[];
  securityFindings: any[];
  metadata: {
    browser: string;
    viewport: string;
    userAgent: string;
  };
}

const TestResults: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [execution, setExecution] = useState<TestExecution | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'security' | 'steps'>('overview');

  useEffect(() => {
    if (id) {
      fetchExecutionResults();
    }
  }, [id]);

  const fetchExecutionResults = async () => {
    try {
      const response = await fetch(`http://localhost:15000/api/tests/execution/${id}/results`);
      if (response.ok) {
        const data = await response.json();
        setExecution(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch execution results:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="card">
          <div className="flex items-center space-x-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
            <span>Loading test results...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!execution) {
    return (
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-2xl font-bold text-secondary-900 mb-2">
            Test Results
          </h1>
          <p className="text-secondary-600">
            Execution ID: {id || 'N/A'}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card text-center py-12"
        >
          <div className="w-16 h-16 bg-secondary-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">❓</span>
          </div>
          <h2 className="text-xl font-semibold text-secondary-900 mb-2">
            Test Results Not Found
          </h2>
          <p className="text-secondary-600 mb-6 max-w-md mx-auto">
            The test execution with ID "{id}" was not found or has not completed yet.
          </p>
        </motion.div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-700 bg-green-100';
      case 'failed': return 'text-red-700 bg-red-100';
      case 'running': return 'text-blue-700 bg-blue-100';
      case 'stopped': return 'text-yellow-700 bg-yellow-100';
      default: return 'text-gray-700 bg-gray-100';
    }
  };

  const passedSteps = execution.steps.filter(step => step.status === 'passed').length;
  const failedSteps = execution.steps.filter(step => step.status === 'failed').length;

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl font-bold text-secondary-900 mb-2">
          Test Results
        </h1>
        <p className="text-secondary-600">
          Execution ID: {execution.id}
        </p>
      </motion.div>

      {/* Status Summary */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="card"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-secondary-900">
            Execution Summary
          </h2>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(execution.status)}`}>
            {execution.status.toUpperCase()}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{passedSteps}</div>
            <div className="text-sm text-secondary-600">Passed Steps</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{failedSteps}</div>
            <div className="text-sm text-secondary-600">Failed Steps</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{execution.securityFindings.length}</div>
            <div className="text-sm text-secondary-600">Security Findings</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{execution.screenshots.length}</div>
            <div className="text-sm text-secondary-600">Screenshots</div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-secondary-200 text-sm text-secondary-600">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <span className="font-medium">URL:</span> {execution.url}
            </div>
            <div>
              <span className="font-medium">Duration:</span> {execution.duration ? `${Math.round(execution.duration / 1000)}s` : 'N/A'}
            </div>
            <div>
              <span className="font-medium">Browser:</span> {execution.metadata.browser}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Tab Navigation */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="card"
      >
        <div className="flex space-x-1 mb-6">
          {[
            { key: 'overview', label: 'Overview', icon: '📊' },
            { key: 'security', label: 'Security', icon: '🔒' },
            { key: 'steps', label: 'Steps', icon: '📋' }
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === tab.key
                  ? 'bg-primary-100 text-primary-700'
                  : 'text-secondary-600 hover:text-secondary-900 hover:bg-secondary-100'
              }`}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
              {tab.key === 'security' && execution.securityFindings.length > 0 && (
                <span className="ml-2 bg-red-100 text-red-700 text-xs px-2 py-1 rounded-full">
                  {execution.securityFindings.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            <div>
              <h3 className="font-medium text-secondary-900 mb-2">Test Scenario</h3>
              <pre className="bg-secondary-50 p-4 rounded-lg text-sm whitespace-pre-wrap">
                {execution.scenario}
              </pre>
            </div>
          </div>
        )}

        {activeTab === 'security' && (
          <SecurityResults findings={execution.securityFindings} />
        )}

        {activeTab === 'steps' && (
          <div className="space-y-3">
            {execution.steps.map((step, index) => (
              <div key={step.id || index} className="border border-secondary-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-secondary-900">{step.description}</h4>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    step.status === 'passed' ? 'bg-green-100 text-green-700' :
                    step.status === 'failed' ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {step.status}
                  </span>
                </div>
                <div className="text-sm text-secondary-600">
                  Action: {step.action} • Duration: {step.duration ? `${step.duration}ms` : 'N/A'}
                </div>
                {step.error && (
                  <div className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded">
                    Error: {step.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default TestResults;