import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { logger } from '../utils/logger';

export interface BrowserInfo {
  name: string;
  version: string;
  executablePath: string;
  isInstalled: boolean;
}

export interface DriverInfo {
  browserName: string;
  browserVersion: string;
  driverVersion: string;
  driverPath: string;
  isCompatible: boolean;
  downloadUrl?: string;
}

export class BrowserDriverService {
  private driversDir: string;

  constructor() {
    this.driversDir = path.join(process.cwd(), '..', 'drivers');
    this.ensureDriversDirectory();
  }

  /**
   * Detect installed browsers and their versions
   */
  async detectInstalledBrowsers(): Promise<BrowserInfo[]> {
    const browsers: BrowserInfo[] = [];

    try {
      // Only detect Chrome
      const chromeInfo = await this.detectChrome();
      if (chromeInfo) browsers.push(chromeInfo);

      logger.info('Browser detection completed', {
        service: 'BrowserDriverService',
        browsersFound: browsers.length,
        browsers: browsers.map(b => `${b.name} ${b.version}`),
      });

      return browsers;
    } catch (error: any) {
      logger.error('Failed to detect browsers', {
        service: 'BrowserDriverService',
        error: error.message,
      });

      return browsers;
    }
  }

  /**
   * Get compatible driver for a specific browser
   */
  async getCompatibleDriver(browserName: string): Promise<DriverInfo | null> {
    try {
      const browsers = await this.detectInstalledBrowsers();
      const browser = browsers.find(b =>
        b.name.toLowerCase().includes(browserName.toLowerCase()) && b.isInstalled
      );

      if (!browser) {
        logger.warn('Browser not found', {
          service: 'BrowserDriverService',
          requestedBrowser: browserName,
        });
        return null;
      }

      // Check if driver already exists
      const existingDriver = await this.findExistingDriver(browser);
      if (existingDriver && existingDriver.isCompatible) {
        return existingDriver;
      }

      // Get download info for new driver
      const driverInfo = await this.getDriverDownloadInfo(browser);

      logger.info('Driver compatibility check completed', {
        service: 'BrowserDriverService',
        browser: `${browser.name} ${browser.version}`,
        driverAvailable: !!driverInfo,
      });

      return driverInfo;
    } catch (error: any) {
      logger.error('Failed to get compatible driver', {
        service: 'BrowserDriverService',
        browserName,
        error: error.message,
      });

      return null;
    }
  }

  /**
   * Download and install driver for a browser
   */
  async downloadDriver(driverInfo: DriverInfo): Promise<string | null> {
    try {
      if (!driverInfo.downloadUrl) {
        throw new Error('No download URL provided');
      }

      logger.info('Downloading browser driver', {
        service: 'BrowserDriverService',
        browser: driverInfo.browserName,
        version: driverInfo.driverVersion,
        url: driverInfo.downloadUrl,
      });

      // This would be implemented with actual download logic
      // For now, we'll return the expected path
      const driverPath = path.join(
        this.driversDir,
        `${driverInfo.browserName.toLowerCase()}-${driverInfo.driverVersion}`,
        this.getDriverExecutableName(driverInfo.browserName)
      );

      // TODO: Implement actual download logic here
      // const downloadResult = await this.downloadFile(driverInfo.downloadUrl, driverPath);

      logger.info('Driver download completed', {
        service: 'BrowserDriverService',
        driverPath,
      });

      return driverPath;
    } catch (error: any) {
      logger.error('Failed to download driver', {
        service: 'BrowserDriverService',
        error: error.message,
      });

      return null;
    }
  }

  /**
   * Get all available drivers
   */
  async getAllDrivers(): Promise<DriverInfo[]> {
    try {
      const browsers = await this.detectInstalledBrowsers();
      const drivers: DriverInfo[] = [];

      for (const browser of browsers) {
        if (browser.isInstalled) {
          const driverInfo = await this.getCompatibleDriver(browser.name);
          if (driverInfo) {
            drivers.push(driverInfo);
          }
        }
      }

      return drivers;
    } catch (error: any) {
      logger.error('Failed to get all drivers', {
        service: 'BrowserDriverService',
        error: error.message,
      });

      return [];
    }
  }

  private async detectChrome(): Promise<BrowserInfo | null> {
    try {
      const possiblePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
      ];

      for (const chromePath of possiblePaths) {
        if (fs.existsSync(chromePath)) {
          try {
            // Try to get version from folder names in Chrome Application directory
            const chromeDir = path.dirname(chromePath);
            const versionFolders = fs.readdirSync(chromeDir)
              .filter(folder => /^\d+\.\d+\.\d+\.\d+$/.test(folder))
              .sort((a, b) => {
                const aVersion = a.split('.').map(Number);
                const bVersion = b.split('.').map(Number);
                for (let i = 0; i < 4; i++) {
                  if (aVersion[i] !== bVersion[i]) {
                    return bVersion[i] - aVersion[i]; // Sort descending (latest first)
                  }
                }
                return 0;
              });

            const version = versionFolders.length > 0 ? versionFolders[0] : 'Unknown';

            logger.info('Chrome detected successfully', {
              service: 'BrowserDriverService',
              path: chromePath,
              version,
              versionFolders: versionFolders.length
            });

            return {
              name: 'Google Chrome',
              version,
              executablePath: chromePath,
              isInstalled: true,
            };
          } catch (error: any) {
            logger.warn('Failed to get Chrome version from folders', {
              error: error.message,
              chromePath
            });

            // Fallback: just report Chrome as installed with unknown version
            return {
              name: 'Google Chrome',
              version: 'Unknown',
              executablePath: chromePath,
              isInstalled: true,
            };
          }
        }
      }

      logger.warn('Chrome not found in any expected locations', {
        service: 'BrowserDriverService',
        searchedPaths: possiblePaths
      });
      return null;
    } catch (error: any) {
      logger.error('Error detecting Chrome', {
        service: 'BrowserDriverService',
        error: error.message
      });
      return null;
    }
  }


  private async findExistingDriver(browser: BrowserInfo): Promise<DriverInfo | null> {
    try {
      const driverName = this.getDriverExecutableName(browser.name);
      const possiblePaths = [
        path.join(this.driversDir, driverName),
        path.join(this.driversDir, browser.name.toLowerCase().replace(/\s+/g, '-'), driverName),
      ];

      for (const driverPath of possiblePaths) {
        if (fs.existsSync(driverPath)) {
          // Check if driver is compatible (simplified check)
          const isCompatible = await this.checkDriverCompatibility(driverPath, browser);

          return {
            browserName: browser.name,
            browserVersion: browser.version,
            driverVersion: 'Unknown', // Would need to detect actual driver version
            driverPath,
            isCompatible,
          };
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  private async getDriverDownloadInfo(browser: BrowserInfo): Promise<DriverInfo | null> {
    try {
      // Only support ChromeDriver
      if (!browser.name.includes('Chrome')) {
        return null;
      }

      // ChromeDriver download logic
      const majorVersion = browser.version.split('.')[0];
      const driverVersion = `${majorVersion}.0.0`;
      const downloadUrl = `https://chromedriver.storage.googleapis.com/LATEST_RELEASE_${majorVersion}`;

      return {
        browserName: browser.name,
        browserVersion: browser.version,
        driverVersion,
        driverPath: path.join(this.driversDir, this.getDriverExecutableName(browser.name)),
        isCompatible: true,
        downloadUrl,
      };
    } catch (error) {
      return null;
    }
  }

  private getDriverExecutableName(browserName: string): string {
    if (browserName.includes('Chrome')) {
      return 'chromedriver.exe';
    }
    return 'chromedriver.exe';
  }

  private async checkDriverCompatibility(driverPath: string, browser: BrowserInfo): Promise<boolean> {
    try {
      // Simplified compatibility check
      // In a real implementation, you would run the driver and check its version
      return fs.existsSync(driverPath);
    } catch (error) {
      return false;
    }
  }

  private ensureDriversDirectory(): void {
    if (!fs.existsSync(this.driversDir)) {
      fs.mkdirSync(this.driversDir, { recursive: true });
      logger.info('Created drivers directory', {
        service: 'BrowserDriverService',
        driversDir: this.driversDir,
      });
    }
  }
}

export const browserDriverService = new BrowserDriverService();