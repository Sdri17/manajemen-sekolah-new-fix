import { Settings, defaultSettings } from '../models/settings.model';
import { store } from '../lib/store';

export class SettingsController {
  /**
   * Load system settings with default fallback
   */
  static async getSettings(): Promise<Settings> {
    const saved = await store.settings.getItem('app_settings');
    if (!saved || typeof saved !== 'object') {
      return defaultSettings;
    }
    return { ...defaultSettings, ...(saved as Settings) };
  }

  /**
   * Update system settings
   */
  static async updateSettings(newSettings: Partial<Settings>): Promise<Settings> {
    const current = await this.getSettings();
    const updated = { ...current, ...newSettings };
    await store.settings.setItem('app_settings', updated);
    return updated;
  }
}
