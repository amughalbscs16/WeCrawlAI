import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { fetchExecutionStatus, stopExecution } from '../store/slices/testSlice';
import { RootState, AppDispatch } from '../store/store';
import { toast } from 'react-hot-toast';
import BrowserPreview from '../components/BrowserPreview';

const ExecutionMonitor: React.FC = () => {
  const { executionId } = useParams<{ executionId: string }>();
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const { currentExecution, loading, error } = useSelector((state: RootState) => state.test);
  const [refreshInterval, setRefreshInterval] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!executionId) {
      navigate('/test-editor');
      return;
    }

    // Fetch initial status
    dispatch(fetchExecutionStatus(executionId));

    // Set up polling for status updates
    const interval = setInterval(() => {
      dispatch(fetchExecutionStatus(executionId));
    }, 2000);

    setRefreshInterval(interval);

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [executionId, dispatch, navigate]);

  useEffect(() => {
    // Stop polling if execution is completed
    if (currentExecution && ['completed', 'failed', 'stopped'].includes(currentExecution.status)) {
      if (refreshInterval) {
        clearInterval(refreshInterval);
        setRefreshInterval(null);
      }
    }
  }, [currentExecution?.status, refreshInterval]);

  const handleStopExecution = async () => {
    if (!executionId) return;

    try {
      await dispatch(stopExecution(executionId)).unwrap();
      toast.success('Test execution stopped');
    } catch (error: any) {
      toast.error(error.message || 'Failed to stop execution');
    }
  };

  const handleGoBack = () => {
    navigate('/test-editor');
  };

  const handleViewResults = () => {
    navigate(`/test-results/${executionId}`);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      running: { color: 'bg-blue-100 text-blue-800', icon: '🔄' },
      completed: { color: 'bg-green-100 text-green-800', icon: '✅' },
      failed: { color: 'bg-red-100 text-red-800', icon: '❌' },
      stopped: { color: 'bg-gray-100 text-gray-800', icon: '⏹️' },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.running;
    const displayStatus = status || 'running';

    return (
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${config.color}`}>
        <span className="mr-2">{config.icon}</span>
        {displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1)}
      </span>
    );
  };

  const getStepStatusIcon = (status: string) => {
    switch (status) {
      case 'passed': return '✅';
      case 'failed': return '❌';
      case 'running': return '🔄';
      case 'pending': return '⏳';
      case 'skipped': return '⏭️';
      default: return '⏳';
    }
  };

  if (loading.fetching && !currentExecution) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-secondary-600">Loading execution details...</p>
        </div>
      </div>
    );
  }

  if (error && !currentExecution) {
    return (
      <div className="text-center py-12">
        <div className="text-red-500 text-xl mb-4">❌</div>
        <h3 className="text-lg font-medium text-secondary-900 mb-2">Error Loading Execution</h3>
        <p className="text-secondary-600 mb-6">{error}</p>
        <button onClick={handleGoBack} className="btn btn-primary">
          Back to Test Editor
        </button>
      </div>
    );
  }

  if (!currentExecution) {
    return (
      <div className="text-center py-12">
        <div className="text-secondary-400 text-xl mb-4">🔍</div>
        <h3 className="text-lg font-medium text-secondary-900 mb-2">Execution Not Found</h3>
        <p className="text-secondary-600 mb-6">The requested test execution could not be found.</p>
        <button onClick={handleGoBack} className="btn btn-primary">
          Back to Test Editor
        </button>
      </div>
    );
  }

  const isRunning = currentExecution.status === 'running';
  const isCompleted = ['completed', 'failed', 'stopped'].includes(currentExecution.status);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold text-secondary-900">Test Execution Monitor</h1>
          <p className="text-secondary-600">Real-time monitoring of test execution</p>
        </div>
        <div className="flex space-x-3">
          {isRunning && (
            <button
              onClick={handleStopExecution}
              className="btn btn-outline btn-red"
              disabled={loading.stopping}
            >
              {loading.stopping ? 'Stopping...' : '⏹️ Stop Test'}
            </button>
          )}
          {isCompleted && (
            <button onClick={handleViewResults} className="btn btn-primary">
              📊 View Results
            </button>
          )}
          <button onClick={handleGoBack} className="btn btn-outline">
            ← Back to Editor
          </button>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 xl:grid-cols-5 gap-6"
      >
        <div className="xl:col-span-2 space-y-6">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-secondary-900">Execution Details</h2>
              {getStatusBadge(currentExecution.status)}
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-secondary-500">Execution ID:</span>
                <p className="font-mono text-secondary-900">{currentExecution.id}</p>
              </div>
              <div>
                <span className="text-secondary-500">Target URL:</span>
                <p className="text-secondary-900 break-all">{currentExecution.url}</p>
              </div>
              <div>
                <span className="text-secondary-500">Browser:</span>
                <p className="text-secondary-900">{currentExecution.metadata.browser}</p>
              </div>
              <div>
                <span className="text-secondary-500">Viewport:</span>
                <p className="text-secondary-900">{currentExecution.metadata.viewport}</p>
              </div>
              <div>
                <span className="text-secondary-500">Start Time:</span>
                <p className="text-secondary-900">{new Date(currentExecution.startTime).toLocaleString()}</p>
              </div>
              {currentExecution.endTime && (
                <div>
                  <span className="text-secondary-500">End Time:</span>
                  <p className="text-secondary-900">{new Date(currentExecution.endTime).toLocaleString()}</p>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <h2 className="text-lg font-semibold text-secondary-900 mb-4">Test Steps</h2>

            {currentExecution.steps.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-secondary-400 text-xl mb-2">⏳</div>
                <p className="text-secondary-600">Waiting for test steps to be generated...</p>
              </div>
            ) : (
              <div className="space-y-3">
                {currentExecution.steps.map((step: any, index: number) => (
                  <motion.div
                    key={step.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      step.status === 'running'
                        ? 'border-blue-200 bg-blue-50'
                        : step.status === 'passed'
                        ? 'border-green-200 bg-green-50'
                        : step.status === 'failed'
                        ? 'border-red-200 bg-red-50'
                        : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start space-x-3">
                      <span className="text-lg">{getStepStatusIcon(step.status)}</span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium text-secondary-900">Step {index + 1}</h4>
                          {step.duration && (
                            <span className="text-xs text-secondary-500">
                              {step.duration}ms
                            </span>
                          )}
                        </div>
                        <p className="text-secondary-700 mt-1">{step.description}</p>
                        {step.action && (
                          <p className="text-xs text-secondary-500 mt-1">
                            Action: {step.action}
                            {step.selector && ` | Selector: ${step.selector}`}
                          </p>
                        )}
                        {step.error && (
                          <div className="mt-2 p-2 bg-red-100 border border-red-200 rounded text-sm text-red-700">
                            {step.error}
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Browser Preview */}
        <div className="xl:col-span-2">
          <BrowserPreview
            url={currentExecution.url}
            isRunning={isRunning}
          />
        </div>

        <div className="xl:col-span-1 space-y-6">
          <div className="card">
            <h3 className="text-lg font-semibold text-secondary-900 mb-4">Progress</h3>

            {currentExecution.steps.length > 0 ? (
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span>Completed Steps</span>
                  <span>
                    {currentExecution.steps.filter((s: any) => s.status === 'passed').length} / {currentExecution.steps.length}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-primary-600 h-2 rounded-full transition-all duration-500"
                    style={{
                      width: `${(currentExecution.steps.filter((s: any) => s.status === 'passed').length / currentExecution.steps.length) * 100}%`
                    }}
                  ></div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
                  <div className="text-center">
                    <div className="text-green-600 font-semibold text-lg">
                      {currentExecution.steps.filter((s: any) => s.status === 'passed').length}
                    </div>
                    <div className="text-secondary-500">Passed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-red-600 font-semibold text-lg">
                      {currentExecution.steps.filter((s: any) => s.status === 'failed').length}
                    </div>
                    <div className="text-secondary-500">Failed</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mx-auto mb-2"></div>
                  <div className="h-2 bg-gray-200 rounded w-full mb-4"></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="h-8 bg-gray-200 rounded"></div>
                    <div className="h-8 bg-gray-200 rounded"></div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {currentExecution.screenshots.length > 0 && (
            <div className="card">
              <h3 className="text-lg font-semibold text-secondary-900 mb-4">Screenshots</h3>
              <div className="space-y-2">
                {currentExecution.screenshots.slice(-3).map((screenshot: string, index: number) => (
                  <div key={index} className="text-sm">
                    <a href={screenshot} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:text-primary-700">
                      Screenshot {index + 1}
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentExecution.securityFindings.length > 0 && (
            <div className="card">
              <h3 className="text-lg font-semibold text-secondary-900 mb-4">Security Findings</h3>
              <div className="text-center">
                <div className="text-orange-600 font-semibold text-lg">
                  {currentExecution.securityFindings.length}
                </div>
                <div className="text-secondary-500 text-sm">Issues Found</div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default ExecutionMonitor;