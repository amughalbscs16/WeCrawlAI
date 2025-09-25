import React from 'react';
import { motion } from 'framer-motion';

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

interface SecurityResultsProps {
  findings: SecurityFinding[];
  isLoading?: boolean;
}

const SecurityResults: React.FC<SecurityResultsProps> = ({ findings, isLoading = false }) => {
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-700 bg-red-100 border-red-200';
      case 'high': return 'text-red-600 bg-red-50 border-red-200';
      case 'medium': return 'text-yellow-700 bg-yellow-100 border-yellow-200';
      case 'low': return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'info': return 'text-gray-600 bg-gray-50 border-gray-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return '🚨';
      case 'high': return '⚠️';
      case 'medium': return '⚡';
      case 'low': return 'ℹ️';
      case 'info': return '📋';
      default: return '🔍';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'sql_injection': return 'SQL Injection';
      case 'xss': return 'Cross-Site Scripting';
      case 'csrf': return 'CSRF';
      case 'auth_bypass': return 'Authentication Bypass';
      case 'info_disclosure': return 'Information Disclosure';
      case 'insecure_transport': return 'Insecure Transport';
      case 'weak_password': return 'Weak Password';
      case 'misconfiguration': return 'Security Misconfiguration';
      default: return type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
  };

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="card"
      >
        <div className="flex items-center space-x-3">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
          <span className="text-secondary-600">Running security analysis...</span>
        </div>
      </motion.div>
    );
  }

  if (!findings || findings.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card"
      >
        <div className="text-center py-8">
          <div className="text-4xl mb-4">🛡️</div>
          <h3 className="text-lg font-medium text-secondary-900 mb-2">No Security Issues Found</h3>
          <p className="text-secondary-600">
            The security scan completed successfully with no vulnerabilities detected.
          </p>
        </div>
      </motion.div>
    );
  }

  const severityCounts = findings.reduce((acc, finding) => {
    acc[finding.severity] = (acc[finding.severity] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card"
      >
        <h3 className="text-lg font-semibold text-secondary-900 mb-4">
          🔒 Security Analysis Summary
        </h3>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {['critical', 'high', 'medium', 'low', 'info'].map((severity) => (
            <div key={severity} className="text-center">
              <div className={`text-2xl font-bold ${getSeverityColor(severity).split(' ')[0]}`}>
                {severityCounts[severity] || 0}
              </div>
              <div className="text-sm text-secondary-600 capitalize">{severity}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-secondary-200">
          <div className="text-sm text-secondary-600">
            Total findings: <span className="font-medium">{findings.length}</span> •
            Scan completed: <span className="font-medium">{new Date().toLocaleString()}</span>
          </div>
        </div>
      </motion.div>

      {/* Findings List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="space-y-4"
      >
        {findings.map((finding, index) => (
          <motion.div
            key={finding.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className={`card border-l-4 ${getSeverityColor(finding.severity).split(' ')[2]} ${getSeverityColor(finding.severity).split(' ')[1]}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-4 flex-1">
                <div className="text-2xl">
                  {getSeverityIcon(finding.severity)}
                </div>

                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h4 className="font-medium text-secondary-900">
                      {finding.title}
                    </h4>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getSeverityColor(finding.severity)}`}>
                      {finding.severity.toUpperCase()}
                    </span>
                    <span className="px-2 py-1 text-xs bg-secondary-100 text-secondary-700 rounded-full">
                      {getTypeLabel(finding.type)}
                    </span>
                  </div>

                  <p className="text-secondary-600 text-sm mb-3">
                    {finding.description}
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <h5 className="font-medium text-secondary-900 mb-1">Location</h5>
                      <p className="text-secondary-600 break-all">{finding.location.url}</p>
                      {finding.location.element && (
                        <p className="text-secondary-500">Element: {finding.location.element}</p>
                      )}
                    </div>

                    {finding.evidence.payload && (
                      <div>
                        <h5 className="font-medium text-secondary-900 mb-1">Evidence</h5>
                        <code className="text-xs bg-secondary-100 px-2 py-1 rounded break-all">
                          {finding.evidence.payload}
                        </code>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 pt-4 border-t border-secondary-200">
                    <h5 className="font-medium text-secondary-900 mb-1">Recommended Fix</h5>
                    <p className="text-secondary-600 text-sm">
                      {finding.remediation}
                    </p>
                  </div>

                  <div className="mt-2 text-xs text-secondary-500">
                    Found at: {new Date(finding.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Disclaimer */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="card bg-blue-50 border-blue-200"
      >
        <div className="flex items-start space-x-3">
          <div className="text-blue-600 text-lg">ℹ️</div>
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">Security Scan Disclaimer</p>
            <p>
              This automated security scan provides initial vulnerability detection.
              For comprehensive security assessment, consider professional penetration testing
              and security audits. Always verify findings in a safe testing environment.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default SecurityResults;