import { create } from 'zustand';

import {
  mapSystemLanguageCode,
  readSystemLocale,
  setLocale as applyI18nLocale,
} from '@/src/shared/i18n';
import { loadSettings, saveSettings } from './db';
import {
  DEFAULT_PREFERRED_QUALITY,
  DEFAULT_STORAGE_CAP_MB,
  type AppLocale,
  type PreferredDownloadQuality,
  type SettingsRecord,
} from './types';

type SettingsState = SettingsRecord & {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setLocale: (locale: AppLocale) => Promise<void>;
  syncFromSystemIfChanged: () => Promise<void>;
  setPreferredDownloadQuality: (quality: PreferredDownloadQuality) => Promise<void>;
  setDownloadsWifiOnly: (value: boolean) => Promise<void>;
  setStorageCapMb: (value: number) => Promise<void>;
};

function snapshot(state: SettingsState): SettingsRecord {
  return {
    locale: state.locale,
    lastSeenSystemLocale: state.lastSeenSystemLocale,
    preferredDownloadQuality: state.preferredDownloadQuality,
    downloadsWifiOnly: state.downloadsWifiOnly,
    storageCapMb: state.storageCapMb,
  };
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  locale: 'en',
  lastSeenSystemLocale: 'en',
  preferredDownloadQuality: DEFAULT_PREFERRED_QUALITY,
  downloadsWifiOnly: false,
  storageCapMb: DEFAULT_STORAGE_CAP_MB,
  hydrated: false,

  hydrate: async () => {
    const system = readSystemLocale();
    const stored = await loadSettings();
    const record: SettingsRecord = stored ?? {
      locale: system,
      lastSeenSystemLocale: system,
      preferredDownloadQuality: DEFAULT_PREFERRED_QUALITY,
      downloadsWifiOnly: false,
      storageCapMb: DEFAULT_STORAGE_CAP_MB,
    };
    if (!stored) {
      await saveSettings(record);
    }
    applyI18nLocale(record.locale);
    set({ ...record, hydrated: true });
  },

  setLocale: async (locale) => {
    const next: SettingsRecord = {
      ...snapshot(get()),
      locale,
    };
    applyI18nLocale(locale);
    set(next);
    await saveSettings(next);
  },

  syncFromSystemIfChanged: async () => {
    if (!get().hydrated) return;
    const system = readSystemLocale();
    const { lastSeenSystemLocale } = get();
    if (system === lastSeenSystemLocale) return;

    const next: SettingsRecord = {
      ...snapshot(get()),
      locale: system,
      lastSeenSystemLocale: system,
    };
    applyI18nLocale(system);
    set(next);
    await saveSettings(next);
  },

  setPreferredDownloadQuality: async (quality) => {
    const next: SettingsRecord = {
      ...snapshot(get()),
      preferredDownloadQuality: quality,
    };
    set(next);
    await saveSettings(next);
  },

  setDownloadsWifiOnly: async (value) => {
    const next: SettingsRecord = {
      ...snapshot(get()),
      downloadsWifiOnly: value,
    };
    set(next);
    await saveSettings(next);
  },

  setStorageCapMb: async (value) => {
    const cap = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    const next: SettingsRecord = {
      ...snapshot(get()),
      storageCapMb: cap,
    };
    set(next);
    await saveSettings(next);
  },
}));
