/**
 * Reports API Routes
 * Handles exploration reports with screenshots
 */

import express from 'express';
import { reportsService } from '../services/ReportsService';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

const router = express.Router();

/**
 * GET /api/reports
 * Get all exploration reports
 */
router.get('/', async (req, res): Promise<void> => {
  try {
    const reports = reportsService.getAllReports();

    // Return summary information for each report
    const summaries = reports.map(report => ({
      id: report.id,
      sessionId: report.sessionId,
      startUrl: report.startUrl,
      startTime: report.startTime,
      endTime: report.endTime,
      totalSteps: report.totalSteps,
      uniqueUrlsVisited: report.uniqueUrlsVisited,
      summary: report.summary,
      duration: Math.round((new Date(report.endTime).getTime() - new Date(report.startTime).getTime()) / 1000)
    }));

    res.status(200).json({
      success: true,
      data: {
        reports: summaries,
        total: summaries.length
      }
    });
  } catch (error: any) {
    logger.error('Failed to get reports', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve reports',
      details: error.message
    });
  }
});

/**
 * GET /api/reports/:reportId
 * Get detailed report with all steps
 */
router.get('/:reportId', async (req, res): Promise<void> => {
  try {
    const { reportId } = req.params;
    const report = reportsService.getReport(reportId);

    if (!report) {
      res.status(404).json({
        success: false,
        error: 'Report not found'
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: report
    });
  } catch (error: any) {
    logger.error('Failed to get report', {
      reportId: req.params.reportId,
      error: error.message
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve report',
      details: error.message
    });
  }
});

/**
 * GET /api/reports/:reportId/screenshot/:filename
 * Get screenshot for a specific step
 */
router.get('/:reportId/screenshot/:filename', async (req, res): Promise<void> => {
  try {
    const { reportId, filename } = req.params;

    // Validate report exists
    const report = reportsService.getReport(reportId);
    if (!report) {
      res.status(404).json({
        success: false,
        error: 'Report not found'
      });
      return;
    }

    // Construct screenshot path
    const screenshotPath = reportsService.getScreenshotPath(`screenshots/${filename}`);

    // Check if file exists
    if (!fs.existsSync(screenshotPath)) {
      res.status(404).json({
        success: false,
        error: 'Screenshot not found'
      });
      return;
    }

    // Send the image file
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    const imageStream = fs.createReadStream(screenshotPath);
    imageStream.pipe(res);
  } catch (error: any) {
    logger.error('Failed to get screenshot', {
      reportId: req.params.reportId,
      filename: req.params.filename,
      error: error.message
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve screenshot',
      details: error.message
    });
  }
});

/**
 * DELETE /api/reports/:reportId
 * Delete a specific report
 */
router.delete('/:reportId', async (req, res): Promise<void> => {
  try {
    const { reportId } = req.params;
    const success = reportsService.deleteReport(reportId);

    if (!success) {
      res.status(404).json({
        success: false,
        error: 'Report not found'
      });
      return;
    }

    logger.info('Report deleted', { reportId });

    res.status(200).json({
      success: true,
      data: {
        message: 'Report deleted successfully',
        reportId
      }
    });
  } catch (error: any) {
    logger.error('Failed to delete report', {
      reportId: req.params.reportId,
      error: error.message
    });
    res.status(500).json({
      success: false,
      error: 'Failed to delete report',
      details: error.message
    });
  }
});

/**
 * POST /api/reports/export/:reportId
 * Export report as JSON or HTML
 */
router.post('/export/:reportId', async (req, res): Promise<void> => {
  try {
    const { reportId } = req.params;
    const { format = 'json' } = req.body;

    const report = reportsService.getReport(reportId);
    if (!report) {
      res.status(404).json({
        success: false,
        error: 'Report not found'
      });
      return;
    }

    if (format === 'json') {
      // Return report as JSON download
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="report_${reportId}.json"`);
      res.json(report);
    } else if (format === 'html') {
      // Generate HTML report
      const html = generateHTMLReport(report);
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Disposition', `attachment; filename="report_${reportId}.html"`);
      res.send(html);
    } else {
      res.status(400).json({
        success: false,
        error: 'Invalid export format. Supported formats: json, html'
      });
    }
  } catch (error: any) {
    logger.error('Failed to export report', {
      reportId: req.params.reportId,
      error: error.message
    });
    res.status(500).json({
      success: false,
      error: 'Failed to export report',
      details: error.message
    });
  }
});

/**
 * Generate HTML report with embedded screenshots
 */
function generateHTMLReport(report: any): string {
  // Helper function to read and encode screenshot
  const getScreenshotBase64 = (screenshotPath: string | undefined): string => {
    if (!screenshotPath) return '';

    try {
      const fullPath = path.join(process.cwd(), 'reports', screenshotPath);
      if (fs.existsSync(fullPath)) {
        const imageBuffer = fs.readFileSync(fullPath);
        const base64Image = imageBuffer.toString('base64');
        return `data:image/png;base64,${base64Image}`;
      }
    } catch (error) {
      logger.warn('Failed to read screenshot', { screenshotPath, error });
    }
    return '';
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <title>Exploration Report - ${report.id}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
    .header { background: #2196F3; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .summary { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .step { background: white; padding: 15px; border-radius: 8px; margin-bottom: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .step-header { display: flex; justify-content: space-between; margin-bottom: 10px; }
    .step-number { font-weight: bold; color: #2196F3; }
    .success { color: #4CAF50; }
    .failure { color: #F44336; }
    .screenshot {
      max-width: 100%;
      margin-top: 10px;
      border: 1px solid #ddd;
      border-radius: 4px;
      cursor: pointer;
      transition: transform 0.2s;
    }
    .screenshot:hover {
      transform: scale(1.02);
    }
    .screenshot-container {
      margin-top: 15px;
      text-align: center;
    }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }
    .stat { background: #f8f9fa; padding: 10px; border-radius: 4px; }
    .stat-label { font-size: 0.9em; color: #666; }
    .stat-value { font-size: 1.5em; font-weight: bold; color: #333; }
    .modal {
      display: none;
      position: fixed;
      z-index: 1000;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0,0,0,0.9);
      cursor: pointer;
    }
    .modal-content {
      margin: auto;
      display: block;
      max-width: 90%;
      max-height: 90%;
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
    }
    .close {
      position: absolute;
      top: 15px;
      right: 35px;
      color: #f1f1f1;
      font-size: 40px;
      font-weight: bold;
      cursor: pointer;
    }
    .close:hover { color: #bbb; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Exploration Report</h1>
    <p>Session ID: ${report.sessionId}</p>
    <p>Start URL: ${report.startUrl}</p>
    <p>Date: ${new Date(report.startTime).toLocaleString()}</p>
  </div>

  <div class="summary">
    <h2>Summary</h2>
    <div class="stats">
      <div class="stat">
        <div class="stat-label">Total Steps</div>
        <div class="stat-value">${report.totalSteps}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Unique URLs</div>
        <div class="stat-value">${report.uniqueUrlsVisited}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Success Rate</div>
        <div class="stat-value">${report.summary.successRate.toFixed(1)}%</div>
      </div>
      <div class="stat">
        <div class="stat-label">Duration</div>
        <div class="stat-value">${Math.round((new Date(report.endTime).getTime() - new Date(report.startTime).getTime()) / 1000)}s</div>
      </div>
      <div class="stat">
        <div class="stat-label">Click Actions</div>
        <div class="stat-value">${report.summary.clickActions}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Scroll Actions</div>
        <div class="stat-value">${report.summary.scrollActions}</div>
      </div>
    </div>
  </div>

  <h2>Exploration Steps</h2>
  ${report.steps.map((step: any, index: number) => {
    const screenshotData = getScreenshotBase64(step.screenshotPath);
    return `
    <div class="step">
      <div class="step-header">
        <span class="step-number">Step ${step.stepNumber}</span>
        <span class="${step.success ? 'success' : 'failure'}">${step.success ? '✓ Success' : '✗ Failed'}</span>
      </div>
      <p><strong>Action:</strong> ${step.action}</p>
      <p><strong>URL:</strong> ${step.url}</p>
      ${step.elementSelector ? `<p><strong>Element:</strong> ${step.elementSelector}</p>` : ''}
      ${step.elementText ? `<p><strong>Text:</strong> ${step.elementText}</p>` : ''}
      <p><strong>Time:</strong> ${new Date(step.timestamp).toLocaleTimeString()}</p>
      ${screenshotData ? `
        <div class="screenshot-container">
          <img class="screenshot" src="${screenshotData}" alt="Step ${step.stepNumber} Screenshot" onclick="openModal('modal-${index}')" />
        </div>
      ` : ''}
    </div>
    `;
  }).join('')}

  <!-- Modals for full-size screenshots -->
  ${report.steps.map((step: any, index: number) => {
    const screenshotData = getScreenshotBase64(step.screenshotPath);
    return screenshotData ? `
    <div id="modal-${index}" class="modal" onclick="closeModal('modal-${index}')">
      <span class="close">&times;</span>
      <img class="modal-content" src="${screenshotData}" />
    </div>
    ` : '';
  }).join('')}

  <script>
    function openModal(modalId) {
      document.getElementById(modalId).style.display = 'block';
    }

    function closeModal(modalId) {
      document.getElementById(modalId).style.display = 'none';
    }

    // Close modal on Escape key
    document.addEventListener('keydown', function(event) {
      if (event.key === 'Escape') {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => modal.style.display = 'none');
      }
    });
  </script>
</body>
</html>
  `;
}

export default router;