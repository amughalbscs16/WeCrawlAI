import express from 'express';
import { settingsService, AppSettings } from '../services/SettingsService';
import { browserDriverService } from '../services/BrowserDriverService';
import { logger } from '../utils/logger';

const router = express.Router();

/**
 * GET /api/settings
 * Get current application settings
 */
router.get('/', async (req, res) => {
  try {
    const settings = await settingsService.loadSettings();

    res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error: any) {
    logger.error('Failed to load settings', {
      service: 'settings-api',
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to load settings',
      details: error.message,
    });
  }
});

/**
 * PUT /api/settings
 * Update application settings
 */
router.put('/', async (req, res) => {
  try {
    const updatedSettings = await settingsService.saveSettings(req.body);

    logger.info('Settings updated via API', {
      service: 'settings-api',
      updatedFields: Object.keys(req.body),
    });

    res.status(200).json({
      success: true,
      data: updatedSettings,
      message: 'Settings saved successfully',
    });
  } catch (error: any) {
    logger.error('Failed to save settings', {
      service: 'settings-api',
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to save settings',
      details: error.message,
    });
  }
});

/**
 * POST /api/settings/reset
 * Reset settings to defaults
 */
router.post('/reset', async (req, res) => {
  try {
    const defaultSettings = await settingsService.resetSettings();

    logger.info('Settings reset to defaults', {
      service: 'settings-api',
    });

    res.status(200).json({
      success: true,
      data: defaultSettings,
      message: 'Settings reset to defaults',
    });
  } catch (error: any) {
    logger.error('Failed to reset settings', {
      service: 'settings-api',
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to reset settings',
      details: error.message,
    });
  }
});

/**
 * GET /api/settings/browsers
 * Get detected browsers
 */
router.get('/browsers', async (req, res) => {
  try {
    const browsers = await browserDriverService.detectInstalledBrowsers();

    res.status(200).json({
      success: true,
      data: browsers,
    });
  } catch (error: any) {
    logger.error('Failed to detect browsers', {
      service: 'settings-api',
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to detect browsers',
      details: error.message,
    });
  }
});

/**
 * GET /api/settings/drivers
 * Get available drivers
 */
router.get('/drivers', async (req, res) => {
  try {
    const drivers = await browserDriverService.getAllDrivers();

    res.status(200).json({
      success: true,
      data: drivers,
    });
  } catch (error: any) {
    logger.error('Failed to get drivers', {
      service: 'settings-api',
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get drivers',
      details: error.message,
    });
  }
});

/**
 * GET /api/settings/drivers/:browserName
 * Get compatible driver for specific browser
 */
router.get('/drivers/:browserName', async (req, res) => {
  try {
    const { browserName } = req.params;
    const driver = await browserDriverService.getCompatibleDriver(browserName);

    if (!driver) {
      return res.status(404).json({
        success: false,
        error: 'No compatible driver found',
        details: `No driver found for browser: ${browserName}`,
      });
    }

    return res.status(200).json({
      success: true,
      data: driver,
    });
  } catch (error: any) {
    logger.error('Failed to get driver for browser', {
      service: 'settings-api',
      browserName: req.params.browserName,
      error: error.message,
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to get driver',
      details: error.message,
    });
  }
});

/**
 * POST /api/settings/drivers/:browserName/download
 * Download driver for specific browser
 */
router.post('/drivers/:browserName/download', async (req, res) => {
  try {
    const { browserName } = req.params;
    const driverInfo = await browserDriverService.getCompatibleDriver(browserName);

    if (!driverInfo) {
      return res.status(404).json({
        success: false,
        error: 'No driver info found',
        details: `No driver information for browser: ${browserName}`,
      });
    }

    const driverPath = await browserDriverService.downloadDriver(driverInfo);

    if (!driverPath) {
      return res.status(500).json({
        success: false,
        error: 'Failed to download driver',
        details: 'Driver download process failed',
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        driverPath,
        browserName: driverInfo.browserName,
        driverVersion: driverInfo.driverVersion,
      },
      message: 'Driver downloaded successfully',
    });
  } catch (error: any) {
    logger.error('Failed to download driver', {
      service: 'settings-api',
      browserName: req.params.browserName,
      error: error.message,
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to download driver',
      details: error.message,
    });
  }
});

export default router;