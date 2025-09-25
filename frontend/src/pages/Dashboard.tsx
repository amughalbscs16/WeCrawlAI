import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import ReportsModal from '../components/ReportsModal';

const Dashboard: React.FC = () => {
  const [reportsModalOpen, setReportsModalOpen] = useState(false);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <h1 className="text-3xl font-bold text-secondary-900 mb-4">
          Welcome to AI Testing Agent
          <span className="text-sm font-normal text-secondary-500 block mt-1">Human Supervised</span>
        </h1>
        <p className="text-lg text-secondary-600 max-w-2xl mx-auto">
          Create intelligent tests using natural language. Our human-supervised AI converts your test scenarios
          into automated browser tests with built-in security scanning.
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
              <span className="text-2xl">✏️</span>
            </div>
            <h3 className="text-lg font-semibold text-secondary-900 mb-2">
              Create New Test
            </h3>
            <p className="text-secondary-600 mb-4">
              Write test scenarios in plain English and let AI handle the automation
            </p>
            <Link
              to="/test-editor"
              className="btn btn-primary w-full"
            >
              Start Testing
            </Link>
          </div>
        </div>

        <div className="card hover:shadow-md transition-shadow">
          <div className="text-center">
            <div className="w-12 h-12 bg-success-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">🔍</span>
            </div>
            <h3 className="text-lg font-semibold text-secondary-900 mb-2">
              Security Testing
            </h3>
            <p className="text-secondary-600 mb-4">
              Automated vulnerability scanning with SQL injection, XSS, CSRF, and more - now fully integrated!
            </p>
            <Link
              to="/test-editor"
              className="btn btn-success w-full"
            >
              Run Security Tests
            </Link>
          </div>
        </div>

        <div className="card hover:shadow-md transition-shadow">
          <div className="text-center">
            <div className="w-12 h-12 bg-warning-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">📊</span>
            </div>
            <h3 className="text-lg font-semibold text-secondary-900 mb-2">
              Test Results
            </h3>
            <p className="text-secondary-600 mb-4">
              View detailed reports with AI-powered insights and recommendations
            </p>
            <button
              className="btn btn-warning w-full"
              onClick={() => setReportsModalOpen(true)}
            >
              View Reports
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
        <h2 className="text-xl font-semibold text-secondary-900 mb-4">
          🚀 Quick Start Guide
        </h2>
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <div className="w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center text-sm font-medium text-primary-700">
              1
            </div>
            <div>
              <h4 className="font-medium text-secondary-900">Write a Test Scenario</h4>
              <p className="text-secondary-600 text-sm">
                Describe what you want to test in plain English using BDD syntax (Given, When, Then)
              </p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <div className="w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center text-sm font-medium text-primary-700">
              2
            </div>
            <div>
              <h4 className="font-medium text-secondary-900">Specify Target URL</h4>
              <p className="text-secondary-600 text-sm">
                Enter the website URL you want to test
              </p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <div className="w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center text-sm font-medium text-primary-700">
              3
            </div>
            <div>
              <h4 className="font-medium text-secondary-900">Run & Watch</h4>
              <p className="text-secondary-600 text-sm">
                Watch AI execute your tests live with real-time browser automation and security scanning
              </p>
            </div>
          </div>
        </div>
        <div className="mt-6">
          <Link
            to="/test-editor"
            className="btn btn-primary"
          >
            Get Started →
          </Link>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="grid grid-cols-1 md:grid-cols-2 gap-6"
      >
        <div className="card">
          <h3 className="text-lg font-semibold text-secondary-900 mb-3">
            🤖 AI-Powered Features
          </h3>
          <ul className="space-y-2 text-sm text-secondary-600">
            <li className="flex items-center">
              <span className="w-1.5 h-1.5 bg-primary-500 rounded-full mr-2"></span>
              Natural language test scenarios
            </li>
            <li className="flex items-center">
              <span className="w-1.5 h-1.5 bg-primary-500 rounded-full mr-2"></span>
              Intelligent element detection
            </li>
            <li className="flex items-center">
              <span className="w-1.5 h-1.5 bg-primary-500 rounded-full mr-2"></span>
              Automated security testing
            </li>
            <li className="flex items-center">
              <span className="w-1.5 h-1.5 bg-primary-500 rounded-full mr-2"></span>
              Real-time execution monitoring
            </li>
          </ul>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold text-secondary-900 mb-3">
            🔒 Compliance & Security
          </h3>
          <ul className="space-y-2 text-sm text-secondary-600">
            <li className="flex items-center">
              <span className="w-1.5 h-1.5 bg-success-500 rounded-full mr-2"></span>
              NIST AI Risk Management Framework
            </li>
            <li className="flex items-center">
              <span className="w-1.5 h-1.5 bg-success-500 rounded-full mr-2"></span>
              Local-first architecture
            </li>
            <li className="flex items-center">
              <span className="w-1.5 h-1.5 bg-success-500 rounded-full mr-2"></span>
              Complete audit trails
            </li>
            <li className="flex items-center">
              <span className="w-1.5 h-1.5 bg-success-500 rounded-full mr-2"></span>
              No cloud dependencies
            </li>
          </ul>
        </div>
      </motion.div>

      {/* Reports Modal */}
      <ReportsModal open={reportsModalOpen} onClose={() => setReportsModalOpen(false)} />
    </div>
  );
};

export default Dashboard;