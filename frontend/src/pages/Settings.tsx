import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';

interface BrowserInfo {
  name: string;
  version: string;
  executablePath: string;
  isInstalled: boolean;
}

interface AppSettings {
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
  lastUpdated: string;
}

const Settings: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [browsers, setBrowsers] = useState<BrowserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [detectingBrowsers, setDetectingBrowsers] = useState(false);

  useEffect(() => {
    loadSettings();
    detectBrowsers();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/settings');
      const result = await response.json();

      if (result.success) {
        setSettings(result.data);
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      toast.error(`Failed to load settings: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const detectBrowsers = async () => {
    setDetectingBrowsers(true);
    try {
      const response = await fetch('/api/settings/browsers');
      const result = await response.json();

      if (result.success) {
        setBrowsers(result.data);
        toast.success(`Detected ${result.data.length} browsers`);
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      toast.error(`Failed to detect browsers: ${error.message}`);
    } finally {
      setDetectingBrowsers(false);
    }
  };

  const saveSettings = async () => {
    if (!settings) return;

    setSaving(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });

      const result = await response.json();

      if (result.success) {
        setSettings(result.data);
        toast.success('Settings saved successfully!');
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      toast.error(`Failed to save settings: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const resetSettings = async () => {
    if (!window.confirm('Are you sure you want to reset all settings to defaults?')) {
      return;
    }

    try {
      const response = await fetch('/api/settings/reset', { method: 'POST' });
      const result = await response.json();

      if (result.success) {
        setSettings(result.data);
        toast.success('Settings reset to defaults');
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      toast.error(`Failed to reset settings: ${error.message}`);
    }
  };

  const updateSettings = (path: string, value: any) => {
    if (!settings) return;

    const newSettings = { ...settings };
    const keys = path.split('.');
    let current = newSettings as any;

    for (let i = 0; i < keys.length - 1; i++) {
      current = current[keys[i]];
    }

    current[keys[keys.length - 1]] = value;
    setSettings(newSettings);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-secondary-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="text-center py-12">
        <div className="text-red-500 text-xl mb-4">❌</div>
        <h3 className="text-lg font-medium text-secondary-900 mb-2">Failed to Load Settings</h3>
        <p className="text-secondary-600 mb-6">Could not load application settings.</p>
        <button onClick={loadSettings} className="btn btn-primary">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold text-secondary-900">Settings</h1>
          <p className="text-secondary-600">Configure your AI Testing Agent preferences</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={resetSettings}
            className="btn btn-outline btn-red"
          >
            Reset to Defaults
          </button>
          <button
            onClick={saveSettings}
            disabled={saving}
            className="btn btn-primary"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Browser Settings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-secondary-900">Browser Settings</h2>
            <button
              onClick={detectBrowsers}
              disabled={detectingBrowsers}
              className="btn btn-sm btn-outline"
            >
              {detectingBrowsers ? 'Detecting...' : '🔍 Detect Browsers'}
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="label">Default Browser</label>
              <select
                className="input"
                value={settings.browser.defaultBrowser}
                onChange={(e) => updateSettings('browser.defaultBrowser', e.target.value)}
              >
                <option value="chrome">Chrome</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <label className="label">Headless Mode</label>
              <input
                type="checkbox"
                className="toggle"
                checked={settings.browser.headless}
                onChange={(e) => updateSettings('browser.headless', e.target.checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="label">Auto-detect Browser</label>
              <input
                type="checkbox"
                className="toggle"
                checked={settings.browser.autoDetectBrowser}
                onChange={(e) => updateSettings('browser.autoDetectBrowser', e.target.checked)}
              />
            </div>

            <div>
              <label className="label">Timeout (ms)</label>
              <input
                type="number"
                className="input"
                value={settings.browser.timeout}
                onChange={(e) => updateSettings('browser.timeout', parseInt(e.target.value))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Viewport Width</label>
                <input
                  type="number"
                  className="input"
                  value={settings.browser.viewport.width}
                  onChange={(e) => updateSettings('browser.viewport.width', parseInt(e.target.value))}
                />
              </div>
              <div>
                <label className="label">Viewport Height</label>
                <input
                  type="number"
                  className="input"
                  value={settings.browser.viewport.height}
                  onChange={(e) => updateSettings('browser.viewport.height', parseInt(e.target.value))}
                />
              </div>
            </div>

            {settings.browser.customExecutablePath && (
              <div>
                <label className="label">Custom Executable Path</label>
                <input
                  type="text"
                  className="input"
                  value={settings.browser.customExecutablePath}
                  onChange={(e) => updateSettings('browser.customExecutablePath', e.target.value)}
                  placeholder="Path to browser executable"
                />
              </div>
            )}
          </div>
        </motion.div>

        {/* Execution Settings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card"
        >
          <h2 className="text-lg font-semibold text-secondary-900 mb-4">Execution Settings</h2>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="label">Enable Security Scanning</label>
              <input
                type="checkbox"
                className="toggle"
                checked={settings.execution.enableSecurity}
                onChange={(e) => updateSettings('execution.enableSecurity', e.target.checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="label">Enable Screenshots</label>
              <input
                type="checkbox"
                className="toggle"
                checked={settings.execution.enableScreenshots}
                onChange={(e) => updateSettings('execution.enableScreenshots', e.target.checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="label">Enable Video Recording</label>
              <input
                type="checkbox"
                className="toggle"
                checked={settings.execution.enableVideo}
                onChange={(e) => updateSettings('execution.enableVideo', e.target.checked)}
              />
            </div>

            <div>
              <label className="label">Max Concurrent Tests</label>
              <input
                type="number"
                className="input"
                min="1"
                max="10"
                value={settings.execution.maxConcurrentTests}
                onChange={(e) => updateSettings('execution.maxConcurrentTests', parseInt(e.target.value))}
              />
            </div>

            <div>
              <label className="label">Default Locale</label>
              <select
                className="input"
                value={settings.execution.defaultLocale}
                onChange={(e) => updateSettings('execution.defaultLocale', e.target.value)}
              >
                <option value="en-US">English (US)</option>
                <option value="en-GB">English (UK)</option>
                <option value="es-ES">Spanish</option>
                <option value="fr-FR">French</option>
                <option value="de-DE">German</option>
                <option value="ja-JP">Japanese</option>
                <option value="zh-CN">Chinese (Simplified)</option>
              </select>
            </div>

            <div>
              <label className="label">Default Timezone</label>
              <select
                className="input"
                value={settings.execution.defaultTimezone}
                onChange={(e) => updateSettings('execution.defaultTimezone', e.target.value)}
              >
                <option value="UTC">UTC</option>
                <option value="America/New_York">Eastern Time</option>
                <option value="America/Los_Angeles">Pacific Time</option>
                <option value="Europe/London">London</option>
                <option value="Europe/Paris">Paris</option>
                <option value="Asia/Tokyo">Tokyo</option>
              </select>
            </div>
          </div>
        </motion.div>

        {/* UI Settings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="card"
        >
          <h2 className="text-lg font-semibold text-secondary-900 mb-4">UI Settings</h2>

          <div className="space-y-4">
            <div>
              <label className="label">Theme</label>
              <select
                className="input"
                value={settings.ui.theme}
                onChange={(e) => updateSettings('ui.theme', e.target.value)}
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <label className="label">Auto-save</label>
              <input
                type="checkbox"
                className="toggle"
                checked={settings.ui.autoSave}
                onChange={(e) => updateSettings('ui.autoSave', e.target.checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="label">Show Advanced Options</label>
              <input
                type="checkbox"
                className="toggle"
                checked={settings.ui.showAdvancedOptions}
                onChange={(e) => updateSettings('ui.showAdvancedOptions', e.target.checked)}
              />
            </div>
          </div>
        </motion.div>

        {/* Detected Browsers */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="card"
        >
          <h2 className="text-lg font-semibold text-secondary-900 mb-4">Detected Browsers</h2>

          {browsers.length === 0 ? (
            <div className="text-center py-6">
              <div className="text-secondary-400 text-xl mb-2">🔍</div>
              <p className="text-secondary-600">No browsers detected</p>
              <button
                onClick={detectBrowsers}
                className="btn btn-sm btn-primary mt-3"
              >
                Detect Browsers
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {browsers.filter(browser => browser.name.toLowerCase().includes('chrome')).map((browser, index) => (
                <div
                  key={index}
                  className="p-3 border border-secondary-200 rounded-lg"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-secondary-900">{browser.name}</h4>
                      <p className="text-sm text-secondary-600">Version: {browser.version}</p>
                    </div>
                    <div className={`px-2 py-1 rounded text-xs font-medium ${
                      browser.isInstalled
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {browser.isInstalled ? 'Installed' : 'Not Found'}
                    </div>
                  </div>
                  <p className="text-xs text-secondary-500 mt-1 truncate">
                    {browser.executablePath}
                  </p>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Settings Info */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="card"
      >
        <h2 className="text-lg font-semibold text-secondary-900 mb-4">Settings Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-secondary-500">Last Updated:</span>
            <p className="font-medium">{new Date(settings.lastUpdated).toLocaleString()}</p>
          </div>
          <div>
            <span className="text-secondary-500">Settings File:</span>
            <p className="font-medium font-mono">user-settings.json</p>
          </div>
          <div>
            <span className="text-secondary-500">Auto-save:</span>
            <p className="font-medium">{settings.ui.autoSave ? 'Enabled' : 'Disabled'}</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default Settings;