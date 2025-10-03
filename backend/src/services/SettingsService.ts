import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

export interface AppSettings {
  browser: {
    defaultBrowser: 'chrome';
    headless: boolean;
    timeout: number;
    viewport: {
      width: number;
      height: number;
    };
    autoDetectBrowser: boolean;
    customExecutablePath?: string;
  };
  execution: {
    enableSecurity: boolean;
    enableScreenshots: boolean;
    enableVideo: boolean;
    maxConcurrentTests: number;
    defaultLocale: string;
    defaultTimezone: string;
  };
  ui: {
    theme: 'light' | 'dark';
    autoSave: boolean;
    showAdvancedOptions: boolean;
  };
  exploration?: {
    epsilon?: number;                 // scheduler epsilon
    noveltyBlend?: number;            // 0=count-based only, 1=RND only
    noveltyLowThreshold?: number;     // frontier backtrack threshold
    rnd?: { enabled?: boolean; inDim?: number; outDim?: number; lr?: number };
    frontier?: { maxEntries?: number };
  };
  lastUpdated: string;
}

export class SettingsService {
  private settingsFile: string;
  private defaultSettings: AppSettings;

  constructor() {
    this.settingsFile = path.join(process.cwd(), 'user-settings.json');
    this.defaultSettings = {
      browser: {
        defaultBrowser: 'chrome',
        headless: false,
        timeout: 30000,
        viewport: {
          width: 1280,
          height: 720,
        },
        autoDetectBrowser: true,
      },
      execution: {
        enableSecurity: true,
        enableScreenshots: true,
        enableVideo: false,
        maxConcurrentTests: 3,
        defaultLocale: 'en-US',
        defaultTimezone: 'UTC',
      },
      ui: {
        theme: 'light',
        autoSave: true,
        showAdvancedOptions: false,
      },
      exploration: {
        epsilon: 0.15,
        noveltyBlend: 0.3,
        noveltyLowThreshold: 0.4,
        rnd: { enabled: true, inDim: 256, outDim: 64, lr: 0.001 },
        frontier: { maxEntries: 500 },
      },
      lastUpdated: new Date().toISOString(),
    };
  }

  async loadSettings(): Promise<AppSettings> {
    try {
      if (fs.existsSync(this.settingsFile)) {
        const data = fs.readFileSync(this.settingsFile, 'utf8');
        const settings = JSON.parse(data);

        // Merge with defaults to ensure all properties exist
        const mergedSettings = this.mergeWithDefaults(settings);

        logger.info('Settings loaded successfully', {
          service: 'SettingsService',
          settingsFile: this.settingsFile,
        });

        return mergedSettings;
      } else {
        // Create default settings file
        await this.saveSettings(this.defaultSettings);
        logger.info('Created default settings file', {
          service: 'SettingsService',
          settingsFile: this.settingsFile,
        });

        return this.defaultSettings;
      }
    } catch (error: any) {
      logger.error('Failed to load settings, using defaults', {
        service: 'SettingsService',
        error: error.message,
      });

      return this.defaultSettings;
    }
  }

  async saveSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
    try {
      // Load current settings and merge with new ones
      const currentSettings = await this.loadSettings();
      const updatedSettings = {
        ...currentSettings,
        ...settings,
        lastUpdated: new Date().toISOString(),
      };

      fs.writeFileSync(this.settingsFile, JSON.stringify(updatedSettings, null, 2));

      logger.info('Settings saved successfully', {
        service: 'SettingsService',
        settingsFile: this.settingsFile,
      });

      return updatedSettings;
    } catch (error: any) {
      logger.error('Failed to save settings', {
        service: 'SettingsService',
        error: error.message,
      });

      throw new Error(`Failed to save settings: ${error.message}`);
    }
  }

  async resetSettings(): Promise<AppSettings> {
    try {
      if (fs.existsSync(this.settingsFile)) {
        fs.unlinkSync(this.settingsFile);
      }

      return await this.saveSettings(this.defaultSettings);
    } catch (error: any) {
      logger.error('Failed to reset settings', {
        service: 'SettingsService',
        error: error.message,
      });

      throw new Error(`Failed to reset settings: ${error.message}`);
    }
  }

  getDefaultSettings(): AppSettings {
    return { ...this.defaultSettings };
  }

  private mergeWithDefaults(settings: any): AppSettings {
    return {
      browser: {
        ...this.defaultSettings.browser,
        ...settings.browser,
      },
      execution: {
        ...this.defaultSettings.execution,
        ...settings.execution,
      },
      ui: {
        ...this.defaultSettings.ui,
        ...settings.ui,
      },
      exploration: {
        ...this.defaultSettings.exploration,
        ...(settings.exploration || {}),
        rnd: {
          ...(this.defaultSettings.exploration?.rnd || {}),
          ...((settings.exploration && settings.exploration.rnd) || {}),
        },
        frontier: {
          ...(this.defaultSettings.exploration?.frontier || {}),
          ...((settings.exploration && settings.exploration.frontier) || {}),
        }
      },
      lastUpdated: settings.lastUpdated || new Date().toISOString(),
    };
  }
}

export const settingsService = new SettingsService();
