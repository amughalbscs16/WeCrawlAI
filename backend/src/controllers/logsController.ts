import { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import apiLogger from '../utils/apiLogger';
import costTracker from '../utils/costTracker';

export const getLogsJSON = async (req: Request, res: Response): Promise<Response> => {
  try {
    const stats = await apiLogger.getStatistics();
    const lifetimeStats = await costTracker.getLifetimeStats();
    const todayCost = await costTracker.getTodayCost();
    const monthCost = await costTracker.getMonthCost();
    let apiLogs = [];

    try {
      apiLogs = JSON.parse(await fs.readFile(path.join(process.cwd(), 'api_logs.json'), 'utf8'));
    } catch {}

    return res.json({
      success: true,
      stats,
      lifetimeStats,
      todayCost,
      monthCost,
      logs: apiLogs,
      totalLogs: apiLogs.length
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getLogsDashboard = async (req: Request, res: Response): Promise<void> => {
  try {
    // Get API statistics and lifetime costs
    const stats = await apiLogger.getStatistics();
    const lifetimeStats = await costTracker.getLifetimeStats();
    const todayCost = await costTracker.getTodayCost();
    const monthCost = await costTracker.getMonthCost();

    // Read log files
    let apiLogs = [];
    let textLogs = '';
    let testLogs = '';

    try {
      apiLogs = JSON.parse(await fs.readFile(path.join(process.cwd(), 'api_logs.json'), 'utf8'));
    } catch {}

    try {
      textLogs = await fs.readFile(path.join(process.cwd(), 'api_actions.log'), 'utf8');
    } catch {}

    try {
      testLogs = await fs.readFile(path.join(process.cwd(), 'logs_code.txt'), 'utf8');
    } catch {}

    // Generate HTML dashboard
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Testing Agent - Logs Dashboard</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
        }

        .header {
            background: white;
            border-radius: 20px;
            padding: 30px;
            margin-bottom: 30px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
        }

        h1 {
            color: #2d3748;
            font-size: 2.5rem;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            gap: 15px;
        }

        .subtitle {
            color: #718096;
            font-size: 1.1rem;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }

        .stat-card {
            background: white;
            border-radius: 15px;
            padding: 25px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
            transition: transform 0.3s ease;
        }

        .stat-card:hover {
            transform: translateY(-5px);
        }

        .stat-label {
            color: #718096;
            font-size: 0.875rem;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 8px;
        }

        .stat-value {
            color: #2d3748;
            font-size: 2rem;
            font-weight: bold;
        }

        .stat-card.success {
            border-left: 4px solid #48bb78;
        }

        .stat-card.error {
            border-left: 4px solid #f56565;
        }

        .stat-card.cost {
            border-left: 4px solid #4299e1;
        }

        .stat-card.tokens {
            border-left: 4px solid #ed8936;
        }

        .tabs {
            background: white;
            border-radius: 20px;
            padding: 10px;
            margin-bottom: 30px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
            display: flex;
            gap: 10px;
        }

        .tab-button {
            padding: 12px 24px;
            border: none;
            background: #f7fafc;
            border-radius: 10px;
            cursor: pointer;
            color: #4a5568;
            font-weight: 500;
            transition: all 0.3s ease;
        }

        .tab-button.active {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
        }

        .tab-button:hover {
            transform: translateY(-2px);
        }

        .content-section {
            background: white;
            border-radius: 20px;
            padding: 30px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
            display: none;
        }

        .content-section.active {
            display: block;
        }

        .log-entry {
            background: #f7fafc;
            border-radius: 10px;
            padding: 20px;
            margin-bottom: 15px;
            border-left: 4px solid #667eea;
            transition: all 0.3s ease;
        }

        .log-entry:hover {
            background: #edf2f7;
            transform: translateX(5px);
        }

        .log-entry.success {
            border-left-color: #48bb78;
        }

        .log-entry.error {
            border-left-color: #f56565;
        }

        .log-time {
            color: #718096;
            font-size: 0.875rem;
            margin-bottom: 5px;
        }

        .log-model {
            display: inline-block;
            background: #667eea;
            color: white;
            padding: 4px 8px;
            border-radius: 5px;
            font-size: 0.75rem;
            margin-right: 10px;
        }

        .log-cost {
            display: inline-block;
            background: #4299e1;
            color: white;
            padding: 4px 8px;
            border-radius: 5px;
            font-size: 0.75rem;
        }

        .log-tokens {
            display: inline-block;
            background: #ed8936;
            color: white;
            padding: 4px 8px;
            border-radius: 5px;
            font-size: 0.75rem;
            margin-left: 10px;
        }

        .code-block {
            background: #2d3748;
            color: #e2e8f0;
            padding: 20px;
            border-radius: 10px;
            overflow-x: auto;
            font-family: 'Consolas', 'Monaco', monospace;
            white-space: pre-wrap;
            margin-top: 15px;
        }

        .filter-bar {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
            flex-wrap: wrap;
        }

        .filter-input {
            padding: 10px 15px;
            border: 2px solid #e2e8f0;
            border-radius: 10px;
            flex: 1;
            min-width: 200px;
        }

        .filter-button {
            padding: 10px 20px;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            font-weight: 500;
            transition: background 0.3s ease;
        }

        .filter-button:hover {
            background: #5a67d8;
        }

        .model-usage {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-top: 20px;
        }

        .model-card {
            background: #f7fafc;
            padding: 15px;
            border-radius: 10px;
            text-align: center;
        }

        .model-name {
            font-weight: bold;
            color: #2d3748;
            margin-bottom: 10px;
        }

        .model-stat {
            color: #718096;
            font-size: 0.875rem;
        }

        .chart-container {
            margin-top: 20px;
            height: 300px;
            background: #f7fafc;
            border-radius: 10px;
            padding: 20px;
            position: relative;
        }

        .empty-state {
            text-align: center;
            padding: 40px;
            color: #718096;
        }

        .refresh-button {
            position: fixed;
            bottom: 30px;
            right: 30px;
            padding: 15px 25px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            border: none;
            border-radius: 50px;
            cursor: pointer;
            font-weight: bold;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            transition: all 0.3s ease;
        }

        .refresh-button:hover {
            transform: scale(1.05);
            box-shadow: 0 15px 40px rgba(0,0,0,0.4);
        }

        .summary-section {
            background: linear-gradient(135deg, #f7fafc, #edf2f7);
            padding: 20px;
            border-radius: 10px;
            margin-bottom: 20px;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .animate-in {
            animation: fadeIn 0.5s ease;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header animate-in">
            <h1>
                🚀 AI Testing Agent - Logs Dashboard
            </h1>
            <p class="subtitle">Real-time monitoring of all API calls, costs, and test generations</p>
        </div>

        <div class="stats-grid animate-in">
            <div class="stat-card cost" style="border-left-color: #9f7aea;">
                <div class="stat-label">💰 LIFETIME COST</div>
                <div class="stat-value" style="color: #9f7aea; font-size: 2.5rem;">$${(lifetimeStats.totalCost || 0).toFixed(4)}</div>
                <div style="font-size: 0.875rem; color: #718096; margin-top: 5px;">
                    Since ${new Date(lifetimeStats.firstUsageDate).toLocaleDateString()}
                </div>
            </div>
            <div class="stat-card cost">
                <div class="stat-label">Today's Cost</div>
                <div class="stat-value">$${todayCost.toFixed(4)}</div>
            </div>
            <div class="stat-card cost" style="border-left-color: #38b2ac;">
                <div class="stat-label">This Month</div>
                <div class="stat-value">$${monthCost.toFixed(4)}</div>
            </div>
            <div class="stat-card tokens">
                <div class="stat-label">Total Tokens</div>
                <div class="stat-value">${(lifetimeStats.totalTokens?.total || 0).toLocaleString()}</div>
            </div>
        </div>

        <div class="stats-grid animate-in" style="margin-top: 20px;">
            <div class="stat-card success">
                <div class="stat-label">Total Requests</div>
                <div class="stat-value">${lifetimeStats.totalRequests || 0}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Success Rate</div>
                <div class="stat-value">${stats.totalRequests > 0 ? Math.round((stats.successfulRequests / stats.totalRequests) * 100) : 0}%</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Avg Cost/Request</div>
                <div class="stat-value">$${lifetimeStats.totalRequests > 0 ? (lifetimeStats.totalCost / lifetimeStats.totalRequests).toFixed(6) : 0}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Avg Daily Cost</div>
                <div class="stat-value">$${(() => {
                    const daysSinceStart = Math.ceil((new Date().getTime() - new Date(lifetimeStats.firstUsageDate).getTime()) / (1000 * 60 * 60 * 24));
                    return (lifetimeStats.totalCost / daysSinceStart).toFixed(4);
                })()}</div>
            </div>
        </div>

        <div class="tabs animate-in">
            <button class="tab-button active" onclick="showTab('recent')">📊 Recent API Calls</button>
            <button class="tab-button" onclick="showTab('costs')">💰 Cost Analysis</button>
            <button class="tab-button" onclick="showTab('models')">🤖 Model Usage</button>
            <button class="tab-button" onclick="showTab('raw')">📝 Raw Logs</button>
            <button class="tab-button" onclick="showTab('tests')">🧪 Generated Tests</button>
        </div>

        <div id="recent" class="content-section active animate-in">
            <h2 style="margin-bottom: 20px;">Recent API Calls</h2>
            <div class="filter-bar">
                <input type="text" class="filter-input" placeholder="Search logs..." id="searchInput" onkeyup="filterLogs()">
                <button class="filter-button" onclick="filterByStatus('success')">✅ Success Only</button>
                <button class="filter-button" onclick="filterByStatus('error')">❌ Errors Only</button>
                <button class="filter-button" onclick="clearFilters()">Clear Filters</button>
            </div>
            <div id="logsList">
                ${apiLogs.length > 0 ? apiLogs.slice(-20).reverse().map((log: any) => `
                    <div class="log-entry ${log.response.success ? 'success' : 'error'}">
                        <div class="log-time">🕐 ${new Date(log.timestamp).toLocaleString()}</div>
                        <div style="margin: 10px 0;">
                            <span class="log-model">${log.model}</span>
                            ${log.response.cost ? `<span class="log-cost">$${log.response.cost.total.toFixed(6)}</span>` : ''}
                            ${log.response.tokensUsed ? `<span class="log-tokens">${log.response.tokensUsed.total} tokens</span>` : ''}
                        </div>
                        <div style="color: #4a5568; margin-top: 10px;">
                            <strong>Action:</strong> ${log.action}<br>
                            ${log.request.summary ? `<strong>Summary:</strong> ${log.request.summary}<br>` : ''}
                            <strong>Duration:</strong> ${log.duration}ms<br>
                            ${log.response.error ? `<strong style="color: #f56565;">Error:</strong> ${log.response.error}` : ''}
                        </div>
                    </div>
                `).join('') : '<div class="empty-state">No API calls logged yet</div>'}
            </div>
        </div>

        <div id="costs" class="content-section animate-in">
            <h2 style="margin-bottom: 20px;">💰 Detailed Cost Analysis</h2>

            <div class="summary-section" style="background: linear-gradient(135deg, #667eea, #764ba2); color: white;">
                <h3>Lifetime Summary</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-top: 20px;">
                    <div>
                        <div style="font-size: 2rem; font-weight: bold;">$${lifetimeStats.totalCost.toFixed(6)}</div>
                        <div style="opacity: 0.9;">Total Spent</div>
                    </div>
                    <div>
                        <div style="font-size: 2rem; font-weight: bold;">${lifetimeStats.totalRequests.toLocaleString()}</div>
                        <div style="opacity: 0.9;">Total Requests</div>
                    </div>
                    <div>
                        <div style="font-size: 2rem; font-weight: bold;">${(lifetimeStats.totalTokens?.total || 0).toLocaleString()}</div>
                        <div style="opacity: 0.9;">Total Tokens</div>
                    </div>
                </div>
            </div>

            <h3 style="margin-top: 30px;">Cost by Model</h3>
            <div class="model-usage">
                ${Object.entries(lifetimeStats.costByModel || {})
                  .sort(([, a], [, b]) => b - a)
                  .map(([model, cost]: [string, any]) => `
                    <div class="model-card">
                        <div class="model-name">${model}</div>
                        <div class="model-stat" style="font-size: 1.2rem; color: #667eea; font-weight: bold;">$${cost.toFixed(6)}</div>
                        <div class="model-stat">${lifetimeStats.requestsByModel[model]} requests</div>
                        <div class="model-stat">${((cost / lifetimeStats.totalCost) * 100).toFixed(1)}% of total</div>
                    </div>
                `).join('')}
            </div>

            <h3 style="margin-top: 30px;">Daily Costs (Last 7 Days)</h3>
            <div style="background: #f7fafc; padding: 20px; border-radius: 10px;">
                ${Object.entries(lifetimeStats.costByDay || {})
                  .slice(-7)
                  .map(([date, cost]: [string, any]) => `
                    <div style="display: flex; justify-content: space-between; padding: 10px; border-bottom: 1px solid #e2e8f0;">
                        <span>${new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                        <span style="font-weight: bold; color: #667eea;">$${cost.toFixed(6)}</span>
                    </div>
                `).join('')}
            </div>

            <h3 style="margin-top: 30px;">Monthly Costs</h3>
            <div style="background: #f7fafc; padding: 20px; border-radius: 10px;">
                ${Object.entries(lifetimeStats.costByMonth || {})
                  .map(([month, cost]: [string, any]) => `
                    <div style="display: flex; justify-content: space-between; padding: 10px; border-bottom: 1px solid #e2e8f0;">
                        <span>${new Date(month + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}</span>
                        <span style="font-weight: bold; color: #667eea;">$${cost.toFixed(6)}</span>
                    </div>
                `).join('')}
            </div>
        </div>

        <div id="models" class="content-section animate-in">
            <h2 style="margin-bottom: 20px;">Model Usage Statistics</h2>
            <div class="summary-section">
                <h3>Summary</h3>
                <p>Total Requests: ${stats.totalRequests || 0} | Average Duration: ${stats.averageDuration || 0}ms</p>
            </div>
            <div class="model-usage">
                ${Object.entries(stats.modelUsage || {}).map(([model, data]: [string, any]) => `
                    <div class="model-card">
                        <div class="model-name">${model}</div>
                        <div class="model-stat">Requests: ${data.count}</div>
                        <div class="model-stat">Tokens: ${data.tokens.toLocaleString()}</div>
                        <div class="model-stat">Cost: $${data.cost.toFixed(4)}</div>
                    </div>
                `).join('')}
            </div>
            <div class="chart-container">
                <canvas id="costChart"></canvas>
            </div>
        </div>

        <div id="raw" class="content-section animate-in">
            <h2 style="margin-bottom: 20px;">Raw API Action Logs</h2>
            <div class="code-block">${textLogs || 'No raw logs available yet'}</div>
        </div>

        <div id="tests" class="content-section animate-in">
            <h2 style="margin-bottom: 20px;">Generated Test Code</h2>
            <div class="code-block">${testLogs || 'No test generations logged yet'}</div>
        </div>
    </div>

    <button class="refresh-button" onclick="location.reload()">🔄 Refresh</button>

    <script>
        function showTab(tabName) {
            // Hide all sections
            document.querySelectorAll('.content-section').forEach(section => {
                section.classList.remove('active');
            });

            // Remove active from all tabs
            document.querySelectorAll('.tab-button').forEach(button => {
                button.classList.remove('active');
            });

            // Show selected section
            document.getElementById(tabName).classList.add('active');

            // Mark tab as active
            event.target.classList.add('active');
        }

        function filterLogs() {
            const searchTerm = document.getElementById('searchInput').value.toLowerCase();
            const entries = document.querySelectorAll('.log-entry');

            entries.forEach(entry => {
                const text = entry.textContent.toLowerCase();
                entry.style.display = text.includes(searchTerm) ? 'block' : 'none';
            });
        }

        function filterByStatus(status) {
            const entries = document.querySelectorAll('.log-entry');
            entries.forEach(entry => {
                if (status === 'success') {
                    entry.style.display = entry.classList.contains('success') ? 'block' : 'none';
                } else if (status === 'error') {
                    entry.style.display = entry.classList.contains('error') ? 'block' : 'none';
                }
            });
        }

        function clearFilters() {
            document.getElementById('searchInput').value = '';
            document.querySelectorAll('.log-entry').forEach(entry => {
                entry.style.display = 'block';
            });
        }

        // Auto-refresh every 30 seconds
        setInterval(() => {
            if (document.visibilityState === 'visible') {
                location.reload();
            }
        }, 30000);
    </script>
</body>
</html>
    `;

    res.send(html);
  } catch (error: any) {
    res.status(500).send(`
      <html>
        <body style="font-family: Arial; padding: 20px;">
          <h1>Error loading logs</h1>
          <p>${error.message}</p>
          <a href="/logs">Try again</a>
        </body>
      </html>
    `);
  }
};