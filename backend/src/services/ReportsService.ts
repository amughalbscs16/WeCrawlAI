/**
 * Reports Service
 * Handles exploration report generation with screenshots
 */

import { WebDriver } from 'selenium-webdriver';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';
import { chromeDriverService } from './ChromeDriverService';

interface ExplorationStep {
  stepNumber: number;
  action: string;
  url: string;
  elementSelector?: string;
  elementText?: string;
  success: boolean;
  timestamp: Date;
  screenshotPath?: string;
}

interface ExplorationReport {
  id: string;
  sessionId: string;
  startUrl: string;
  startTime: Date;
  endTime: Date;
  totalSteps: number;
  uniqueUrlsVisited: number;
  steps: ExplorationStep[];
  summary: {
    clickActions: number;
    scrollActions: number;
    typeActions: number;
    backActions: number;
    successRate: number;
  };
}

class ReportsService {
  private reports: Map<string, ExplorationReport> = new Map();
  private reportsDir: string;
  private screenshotsDir: string;
  private maxReports: number = 10;

  constructor() {
    // Create directories for reports and screenshots
    this.reportsDir = path.join(process.cwd(), 'reports');
    this.screenshotsDir = path.join(this.reportsDir, 'screenshots');

    this.ensureDirectories();
    this.loadExistingReports();
  }

  /**
   * Ensure reports directories exist
   */
  private ensureDirectories(): void {
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
    if (!fs.existsSync(this.screenshotsDir)) {
      fs.mkdirSync(this.screenshotsDir, { recursive: true });
    }
  }

  /**
   * Load existing reports from disk
   */
  private loadExistingReports(): void {
    try {
      const reportsFile = path.join(this.reportsDir, 'reports.json');
      if (fs.existsSync(reportsFile)) {
        const data = fs.readFileSync(reportsFile, 'utf-8');
        const reportsArray = JSON.parse(data);

        // Load only the most recent reports (up to maxReports)
        const sortedReports = reportsArray
          .sort((a: any, b: any) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime())
          .slice(0, this.maxReports);

        sortedReports.forEach((report: ExplorationReport) => {
          this.reports.set(report.id, report);
        });

        logger.info(`Loaded ${this.reports.size} existing reports`);
      }
    } catch (error) {
      logger.error('Failed to load existing reports', { error });
    }
  }

  /**
   * Save reports to disk
   */
  private saveReports(): void {
    try {
      const reportsFile = path.join(this.reportsDir, 'reports.json');
      const reportsArray = Array.from(this.reports.values())
        .sort((a, b) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime())
        .slice(0, this.maxReports);

      fs.writeFileSync(reportsFile, JSON.stringify(reportsArray, null, 2));
      logger.info(`Saved ${reportsArray.length} reports to disk`);
    } catch (error) {
      logger.error('Failed to save reports', { error });
    }
  }

  /**
   * Capture screenshot for current page
   */
  async captureScreenshot(driver: WebDriver, sessionId: string, stepNumber: number): Promise<string | undefined> {
    try {
      const screenshot = await driver.takeScreenshot();
      const filename = `${sessionId}_step_${stepNumber}_${Date.now()}.png`;
      const filepath = path.join(this.screenshotsDir, filename);

      // Save screenshot as base64 decoded PNG
      fs.writeFileSync(filepath, screenshot, 'base64');

      logger.info(`Screenshot captured for step ${stepNumber}`, {
        sessionId,
        filename
      });

      // Return relative path for storage
      return `screenshots/${filename}`;
    } catch (error) {
      logger.error('Failed to capture screenshot', {
        error,
        sessionId,
        stepNumber
      });
      return undefined;
    }
  }

  /**
   * Start a new report for an exploration session
   */
  startReport(sessionId: string, startUrl: string): string {
    const reportId = uuidv4();
    const report: ExplorationReport = {
      id: reportId,
      sessionId,
      startUrl,
      startTime: new Date(),
      endTime: new Date(),
      totalSteps: 0,
      uniqueUrlsVisited: 0,
      steps: [],
      summary: {
        clickActions: 0,
        scrollActions: 0,
        typeActions: 0,
        backActions: 0,
        successRate: 0
      }
    };

    this.reports.set(reportId, report);
    logger.info('Started new exploration report', { reportId, sessionId });
    return reportId;
  }

  /**
   * Add a step to the report with screenshot
   */
  async addStep(
    reportId: string,
    browserSessionId: string,
    stepData: {
      action: string;
      url: string;
      elementSelector?: string;
      elementText?: string;
      success: boolean;
    }
  ): Promise<void> {
    const report = this.reports.get(reportId);
    if (!report) {
      logger.warn('Report not found', { reportId });
      return;
    }

    const stepNumber = report.steps.length + 1;

    // Capture screenshot
    let screenshotPath: string | undefined;
    try {
      const browserSession = chromeDriverService.getSession(browserSessionId);
      if (browserSession) {
        screenshotPath = await this.captureScreenshot(
          browserSession.driver,
          report.sessionId,
          stepNumber
        );
      }
    } catch (error) {
      logger.error('Failed to capture screenshot for step', {
        error,
        reportId,
        stepNumber
      });
    }

    // Create step entry
    const step: ExplorationStep = {
      stepNumber,
      action: stepData.action,
      url: stepData.url,
      elementSelector: stepData.elementSelector,
      elementText: stepData.elementText,
      success: stepData.success,
      timestamp: new Date(),
      screenshotPath
    };

    // Add step to report
    report.steps.push(step);
    report.totalSteps = report.steps.length;

    // Update summary
    switch (stepData.action.toLowerCase()) {
      case 'click':
        report.summary.clickActions++;
        break;
      case 'scroll':
        report.summary.scrollActions++;
        break;
      case 'type':
        report.summary.typeActions++;
        break;
      case 'back':
        report.summary.backActions++;
        break;
    }

    // Calculate unique URLs
    const uniqueUrls = new Set(report.steps.map(s => s.url));
    report.uniqueUrlsVisited = uniqueUrls.size;

    // Calculate success rate
    const successfulSteps = report.steps.filter(s => s.success).length;
    report.summary.successRate = report.totalSteps > 0
      ? (successfulSteps / report.totalSteps) * 100
      : 0;

    logger.info('Added step to report', {
      reportId,
      stepNumber,
      action: stepData.action
    });
  }

  /**
   * Finalize a report
   */
  finalizeReport(reportId: string): void {
    const report = this.reports.get(reportId);
    if (!report) {
      logger.warn('Report not found', { reportId });
      return;
    }

    report.endTime = new Date();

    // Keep only the most recent reports
    if (this.reports.size > this.maxReports) {
      const sortedReports = Array.from(this.reports.entries())
        .sort((a, b) => new Date(b[1].endTime).getTime() - new Date(a[1].endTime).getTime());

      // Remove oldest reports
      const toRemove = sortedReports.slice(this.maxReports);
      toRemove.forEach(([id]) => {
        const oldReport = this.reports.get(id);
        if (oldReport) {
          // Clean up old screenshots
          this.cleanupScreenshots(oldReport);
        }
        this.reports.delete(id);
      });
    }

    this.saveReports();
    logger.info('Finalized exploration report', {
      reportId,
      totalSteps: report.totalSteps,
      duration: (report.endTime.getTime() - report.startTime.getTime()) / 1000
    });
  }

  /**
   * Clean up screenshots for a report
   */
  private cleanupScreenshots(report: ExplorationReport): void {
    report.steps.forEach(step => {
      if (step.screenshotPath) {
        const fullPath = path.join(this.reportsDir, step.screenshotPath);
        try {
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            logger.debug('Deleted old screenshot', { path: step.screenshotPath });
          }
        } catch (error) {
          logger.error('Failed to delete screenshot', { error, path: step.screenshotPath });
        }
      }
    });
  }

  /**
   * Get all reports
   */
  getAllReports(): ExplorationReport[] {
    return Array.from(this.reports.values())
      .sort((a, b) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime());
  }

  /**
   * Get a specific report
   */
  getReport(reportId: string): ExplorationReport | undefined {
    return this.reports.get(reportId);
  }

  /**
   * Get screenshot path
   */
  getScreenshotPath(filename: string): string {
    return path.join(this.reportsDir, filename);
  }

  /**
   * Delete a report
   */
  deleteReport(reportId: string): boolean {
    const report = this.reports.get(reportId);
    if (report) {
      this.cleanupScreenshots(report);
      this.reports.delete(reportId);
      this.saveReports();
      logger.info('Deleted report', { reportId });
      return true;
    }
    return false;
  }
}

export const reportsService = new ReportsService();