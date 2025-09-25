import React, { useState, useEffect } from 'react';
import { aiService } from '../services/testService';
import './GenerationLogs.css';

interface GenerationLogIndex {
  id: string;
  timestamp: string;
  summary: string;
  model: string;
  cost: string;
}

interface GenerationLogDetail {
  id: string;
  timestamp: string;
  model: string;
  scenario: {
    summary: string;
    actions: string[];
  };
  input: {
    prompt: string;
  };
  output: {
    code: string;
    annotations: string[];
    tokenInfo: {
      input: number;
      output: number;
      total: number;
    } | null;
    estimatedCost: string | null;
  };
}

const GenerationLogs: React.FC = () => {
  const [logs, setLogs] = useState<GenerationLogIndex[]>([]);
  const [selectedLog, setSelectedLog] = useState<GenerationLogDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const response = await aiService.getGenerationLogs();
      setLogs(response.data.data || []);
      setError(null);
    } catch (err: any) {
      setError('Failed to fetch generation logs');
      console.error('Error fetching logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const viewLogDetails = async (logId: string) => {
    try {
      setLoading(true);
      const response = await aiService.getGenerationLog(logId);
      setSelectedLog(response.data.data);
      setError(null);
    } catch (err: any) {
      setError('Failed to fetch log details');
      console.error('Error fetching log details:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const closeDetails = () => {
    setSelectedLog(null);
  };

  if (loading && !selectedLog) {
    return (
      <div className="generation-logs-container">
        <div className="loading">Loading generation logs...</div>
      </div>
    );
  }

  return (
    <div className="generation-logs-container">
      <h2>Test Generation History</h2>

      {error && (
        <div className="error-message">{error}</div>
      )}

      {!selectedLog ? (
        <div className="logs-list">
          {logs.length === 0 ? (
            <div className="no-logs">No generation logs available</div>
          ) : (
            <table className="logs-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Summary</th>
                  <th>Model</th>
                  <th>Cost</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>{formatTimestamp(log.timestamp)}</td>
                    <td>{log.summary}</td>
                    <td>{log.model}</td>
                    <td>${log.cost || 'N/A'}</td>
                    <td>
                      <button
                        className="view-btn"
                        onClick={() => viewLogDetails(log.id)}
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="log-details">
          <div className="details-header">
            <h3>Generation Details: {selectedLog.id}</h3>
            <button className="close-btn" onClick={closeDetails}>
              ✕ Close
            </button>
          </div>

          <div className="details-content">
            <div className="detail-section">
              <h4>Basic Information</h4>
              <div className="info-grid">
                <div className="info-item">
                  <label>Timestamp:</label>
                  <span>{formatTimestamp(selectedLog.timestamp)}</span>
                </div>
                <div className="info-item">
                  <label>Model:</label>
                  <span>{selectedLog.model}</span>
                </div>
                <div className="info-item">
                  <label>Cost:</label>
                  <span>${selectedLog.output.estimatedCost || 'N/A'}</span>
                </div>
              </div>
            </div>

            <div className="detail-section">
              <h4>Scenario</h4>
              <div className="scenario-info">
                <p><strong>Summary:</strong> {selectedLog.scenario.summary}</p>
                <p><strong>Actions:</strong></p>
                <ol>
                  {selectedLog.scenario.actions.map((action, idx) => (
                    <li key={idx}>{action}</li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="detail-section">
              <h4>Input Prompt</h4>
              <pre className="code-block">{selectedLog.input.prompt}</pre>
            </div>

            {selectedLog.output.tokenInfo && (
              <div className="detail-section">
                <h4>Token Usage</h4>
                <div className="info-grid">
                  <div className="info-item">
                    <label>Input Tokens:</label>
                    <span>{selectedLog.output.tokenInfo.input}</span>
                  </div>
                  <div className="info-item">
                    <label>Output Tokens:</label>
                    <span>{selectedLog.output.tokenInfo.output}</span>
                  </div>
                  <div className="info-item">
                    <label>Total Tokens:</label>
                    <span>{selectedLog.output.tokenInfo.total}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="detail-section">
              <h4>Generated Code</h4>
              <pre className="code-block">{selectedLog.output.code}</pre>
            </div>

            {selectedLog.output.annotations && selectedLog.output.annotations.length > 0 && (
              <div className="detail-section">
                <h4>Annotations</h4>
                <ul className="annotations-list">
                  {selectedLog.output.annotations.map((ann, idx) => (
                    <li key={idx}>{ann}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="refresh-container">
        <button className="refresh-btn" onClick={fetchLogs}>
          🔄 Refresh Logs
        </button>
      </div>
    </div>
  );
};

export default GenerationLogs;