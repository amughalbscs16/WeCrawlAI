/**
 * Simplified RL Exploration Page
 * Interface for the new simplified exploration system with minimized HTML
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';

interface ExplorationSession {
  sessionId: string;
  startUrl: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  stats: {
    currentUrl: string;
    totalActions: number;
    successfulActions: number;
    visitedUrls: number;
    stuckCounter: number;
    clickedElementsOnCurrentPage: number;
  };
}

interface ExplorationStep {
  step: number;
  action: string;
  success: boolean;
  url: string;
  elements: number;
}

const RLExploration: React.FC = () => {
  const [sessions, setSessions] = useState<ExplorationSession[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [explorationSteps, setExplorationSteps] = useState<ExplorationStep[]>([]);
  const [autoRunning, setAutoRunning] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Form state - simplified
  const [startUrl, setStartUrl] = useState('https://example.com');
  const [maxSteps, setMaxSteps] = useState(50);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const connectWebSocket = () => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.hostname}:15000/ws`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleWebSocketMessage(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setWsConnected(false);
        // Reconnect after 3 seconds
        setTimeout(connectWebSocket, 3000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
    }
  };

  const handleWebSocketMessage = (message: any) => {
    if (message.type === 'exploration_step') {
      const { sessionId, step, totalSteps, done } = message.payload;

      // Update exploration steps in real-time
      setExplorationSteps(prev => [...prev, step]);

      // Update session stats
      setSessions(prev => prev.map(session =>
        session.sessionId === sessionId
          ? {
              ...session,
              status: done ? 'completed' : 'running',
              stats: {
                ...session.stats,
                totalActions: totalSteps
              }
            }
          : session
      ));

      if (done) {
        toast.success(`Exploration completed! ${totalSteps} steps performed.`);
        setAutoRunning(false);
      }
    }
  };

  const startExploration = async () => {
    if (!startUrl.trim()) {
      toast.error('Please enter a valid URL');
      return;
    }

    setIsStarting(true);
    try {
      const response = await fetch('/api/simplified-exploration/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startUrl
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Get initial stats
        const statsResponse = await fetch(`/api/simplified-exploration/${data.data.sessionId}/stats`);
        const statsData = await statsResponse.json();

        const newSession: ExplorationSession = {
          sessionId: data.data.sessionId,
          startUrl,
          status: 'running',
          stats: statsData.data || {
            currentUrl: startUrl,
            totalActions: 0,
            successfulActions: 0,
            visitedUrls: 1,
            stuckCounter: 0,
            clickedElementsOnCurrentPage: 0
          }
        };

        setSessions(prev => [newSession, ...prev]);
        setActiveSessionId(data.data.sessionId);
        setExplorationSteps([]);

        // Subscribe to WebSocket room for this session
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'subscribe',
            payload: { room: `exploration_${data.data.sessionId}` }
          }));
        }

        toast.success('Simplified exploration session started!');
      } else {
        toast.error(data.error || 'Failed to start exploration');
      }
    } catch (error: any) {
      toast.error('Network error: ' + error.message);
    } finally {
      setIsStarting(false);
    }
  };

  const runAutonomousExploration = async (sessionId: string) => {
    if (autoRunning) {
      toast('Autonomous exploration already running', { icon: '⚠️' });
      return;
    }

    setAutoRunning(true);
    try {
      const response = await fetch(`/api/simplified-exploration/${sessionId}/auto`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          maxSteps: maxSteps
        }),
      });

      const data = await response.json();

      if (data.success) {
        setExplorationSteps(data.data.results);

        // Update session status
        setSessions(prev => prev.map(session =>
          session.sessionId === sessionId
            ? {
                ...session,
                status: 'completed',
                stats: data.data.summary
              }
            : session
        ));

        toast.success(`Exploration completed! ${data.data.summary.stepsCompleted} steps performed.`);
      } else {
        toast.error(data.error || 'Failed to run autonomous exploration');
      }
    } catch (error: any) {
      toast.error('Network error: ' + error.message);
    } finally {
      setAutoRunning(false);
    }
  };

  const performSingleStep = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/simplified-exploration/${sessionId}/step`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (data.success) {
        const newStep: ExplorationStep = {
          step: explorationSteps.length + 1,
          action: data.data.action.type,
          success: data.data.action.success,
          url: data.data.newState.url,
          elements: data.data.newState.elementCount
        };

        setExplorationSteps(prev => [...prev, newStep]);

        // Update session stats
        const statsResponse = await fetch(`/api/simplified-exploration/${sessionId}/stats`);
        const statsData = await statsResponse.json();

        if (statsData.success) {
          setSessions(prev => prev.map(session =>
            session.sessionId === sessionId
              ? {
                  ...session,
                  stats: statsData.data
                }
              : session
          ));
        }

        if (data.data.done) {
          setSessions(prev => prev.map(session =>
            session.sessionId === sessionId ? { ...session, status: 'completed' } : session
          ));
          toast('Exploration session completed', { icon: 'ℹ️' });
        }
      } else {
        toast.error(data.error || 'Failed to perform exploration step');
      }
    } catch (error: any) {
      toast.error('Network error: ' + error.message);
    }
  };

  const endSession = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/simplified-exploration/${sessionId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        setSessions(prev => prev.map(session =>
          session.sessionId === sessionId ? { ...session, status: 'completed' } : session
        ));

        if (activeSessionId === sessionId) {
          setActiveSessionId(null);
        }

        toast.success('Session ended successfully');
      } else {
        toast.error(data.error || 'Failed to end session');
      }
    } catch (error: any) {
      toast.error('Network error: ' + error.message);
    }
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl font-bold text-secondary-900 mb-2">
          🎯 Simplified Web Exploration
        </h1>
        <p className="text-secondary-600">
          Smart AI agent with minimized HTML approach - No repeated actions!
        </p>
      </motion.div>

      {/* Configuration Panel */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="card"
      >
        <h2 className="text-lg font-semibold text-secondary-900 mb-4">
          🚀 Start New Exploration Session
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="label">Target URL</label>
              <input
                type="url"
                value={startUrl}
                onChange={(e) => setStartUrl(e.target.value)}
                className="input"
                placeholder="https://example.com"
              />
            </div>

            <div>
              <label className="label">Max Steps</label>
              <input
                type="number"
                value={maxSteps}
                onChange={(e) => setMaxSteps(parseInt(e.target.value))}
                className="input"
                min="1"
                max="200"
              />
              <p className="text-sm text-secondary-600 mt-1">
                Number of exploration steps to perform
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 mb-2">✨ Features</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>✓ No repeated actions on same elements</li>
                <li>✓ Smart stuck detection and recovery</li>
                <li>✓ Minimized HTML state representation</li>
                <li>✓ Per-URL element tracking</li>
                <li>✓ Automatic navigation when stuck</li>
              </ul>
            </div>

            <button
              onClick={startExploration}
              disabled={isStarting || !startUrl.trim()}
              className="btn btn-primary w-full"
            >
              {isStarting ? 'Starting...' : '🚀 Start Simplified Exploration'}
            </button>
          </div>
        </div>
      </motion.div>

      {/* Active Sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sessions List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card"
        >
          <h2 className="text-lg font-semibold text-secondary-900 mb-4">
            📊 Exploration Sessions
          </h2>

          {sessions.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-secondary-400 text-2xl mb-2">🤖</div>
              <p className="text-secondary-600">No active sessions</p>
              <p className="text-sm text-secondary-500">Start an exploration to see results here</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {sessions.map((session) => (
                <div
                  key={session.sessionId}
                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                    activeSessionId === session.sessionId
                      ? 'border-primary-300 bg-primary-50'
                      : 'border-secondary-200 hover:border-secondary-300'
                  }`}
                  onClick={() => setActiveSessionId(session.sessionId)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm truncate">
                      {new URL(session.startUrl).hostname}
                    </span>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      session.status === 'running' ? 'bg-green-100 text-green-800' :
                      session.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                      session.status === 'error' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {session.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-secondary-600">
                    <div>Actions: {session.stats.totalActions}</div>
                    <div>Success: {session.stats.successfulActions}</div>
                    <div>URLs: {session.stats.visitedUrls}</div>
                    <div className={session.stats.stuckCounter > 0 ? 'text-orange-600' : ''}>
                      Stuck: {session.stats.stuckCounter}
                    </div>
                  </div>

                  <div className="mt-1 text-xs text-secondary-500 truncate">
                    Current: {session.stats.currentUrl}
                  </div>

                  {session.status === 'running' && (
                    <div className="mt-2 flex space-x-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          performSingleStep(session.sessionId);
                        }}
                        className="btn btn-sm btn-outline flex-1"
                      >
                        Step
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          runAutonomousExploration(session.sessionId);
                        }}
                        disabled={autoRunning}
                        className="btn btn-sm btn-primary flex-1"
                      >
                        {autoRunning ? 'Running...' : 'Auto'}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          endSession(session.sessionId);
                        }}
                        className="btn btn-sm btn-outline btn-red"
                      >
                        End
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Exploration Steps */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="card"
        >
          <h2 className="text-lg font-semibold text-secondary-900 mb-4">
            🎯 Exploration Steps
          </h2>

          {explorationSteps.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-secondary-400 text-2xl mb-2">📝</div>
              <p className="text-secondary-600">No steps recorded</p>
              <p className="text-sm text-secondary-500">Perform actions to see step history</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {explorationSteps.map((step: any) => (
                <div
                  key={step.step}
                  className="p-3 border border-secondary-200 rounded text-sm hover:bg-secondary-50"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium flex items-center gap-2">
                      <span className="text-secondary-500">Step {step.step}:</span>
                      <span className="text-primary-600">
                        {step.action === 'scroll'
                          ? `📜 Scroll ${step.scrollDirection || 'down'}`
                          : step.action === 'type'
                          ? `⌨️ Type`
                          : step.action === 'back'
                          ? `⬅️ Go Back`
                          : `👆 Click`}
                      </span>
                    </span>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      step.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {step.success ? '✓ Success' : '✗ Failed'}
                    </span>
                  </div>

                  {/* Element Details for Click/Type Actions */}
                  {step.elementDetails && step.action !== 'back' && (
                    <div className="bg-secondary-100 rounded p-2 mb-2 text-xs space-y-1">
                      <div className="font-medium text-secondary-700">Element Details:</div>
                      {step.elementDetails.tagName && (
                        <div className="flex">
                          <span className="text-secondary-500 w-20">Tag:</span>
                          <span className="font-mono text-secondary-700">&lt;{step.elementDetails.tagName}&gt;</span>
                        </div>
                      )}
                      {step.elementDetails.selector && (
                        <div className="flex">
                          <span className="text-secondary-500 w-20">Selector:</span>
                          <span className="font-mono text-secondary-700 break-all">{step.elementDetails.selector}</span>
                        </div>
                      )}
                      {step.elementDetails.text && (
                        <div className="flex">
                          <span className="text-secondary-500 w-20">Text:</span>
                          <span className="text-secondary-700">"{step.elementDetails.text}"</span>
                        </div>
                      )}
                      {step.elementDetails.type && (
                        <div className="flex">
                          <span className="text-secondary-500 w-20">Type:</span>
                          <span className="font-mono text-secondary-700">{step.elementDetails.type}</span>
                        </div>
                      )}
                      {step.elementDetails.label && (
                        <div className="flex">
                          <span className="text-secondary-500 w-20">Label:</span>
                          <span className="text-secondary-700">{step.elementDetails.label}</span>
                        </div>
                      )}
                      {step.elementDetails.ariaLabel && (
                        <div className="flex">
                          <span className="text-secondary-500 w-20">Aria Label:</span>
                          <span className="text-secondary-700">{step.elementDetails.ariaLabel}</span>
                        </div>
                      )}
                      {step.elementDetails.href && (
                        <div className="flex">
                          <span className="text-secondary-500 w-20">Href:</span>
                          <span className="font-mono text-blue-600 break-all">{step.elementDetails.href}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="text-xs text-secondary-600 space-y-1">
                    <div className="flex">
                      <span className="text-secondary-500 w-20">URL:</span>
                      <span className="break-all">{step.url}</span>
                    </div>
                    <div className="flex">
                      <span className="text-secondary-500 w-20">Elements:</span>
                      <span>{step.elements} found on page</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Instructions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="card"
      >
        <h2 className="text-lg font-semibold text-secondary-900 mb-4">
          📖 How It Works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium text-secondary-900 mb-2">🧠 Smart Exploration</h4>
            <div className="space-y-2 text-sm text-secondary-600">
              <p><strong>Element Tracking:</strong> Each element is tracked per URL to avoid repeats</p>
              <p><strong>Stuck Detection:</strong> Automatically detects when stuck and navigates away</p>
              <p><strong>Priority Scoring:</strong> Elements scored by type, text, and interaction potential</p>
              <p><strong>Recovery Actions:</strong> Smart fallback to scrolling or navigation when needed</p>
            </div>
          </div>
          <div>
            <h4 className="font-medium text-secondary-900 mb-2">🎯 Minimized HTML Approach</h4>
            <div className="space-y-2 text-sm text-secondary-600">
              <p><strong>Filtered Elements:</strong> Only important interactive elements are considered</p>
              <p><strong>Compact State:</strong> Minimized HTML representation for efficiency</p>
              <p><strong>Smart Input:</strong> Contextual input generation based on field types</p>
              <p><strong>URL Normalization:</strong> Proper tracking across different URL states</p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default RLExploration;