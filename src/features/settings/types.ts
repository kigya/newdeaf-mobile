export type AppLocale = 'ru' | 'en';

export type PreferredDownloadQuality = 'best' | '1080' | '720' | '480' | '360';

export type SettingsRecord = {
  locale: AppLocale;
  lastSeenSystemLocale: AppLocale;
  preferredDownloadQuality: PreferredDownloadQuality;
  downloadsWifiOnly: boolean;
  storageCapMb: number;
};

export const DEFAULT_PREFERRED_QUALITY: PreferredDownloadQuality = '720';

/** 0 = unlimited. */
export const DEFAULT_STORAGE_CAP_MB = 0;

export const QUALITY_OPTIONS: PreferredDownloadQuality[] = [
  'best',
  '1080',
  '720',
  '480',
  '360',
];

export const STORAGE_CAP_OPTIONS_MB: number[] = [0, 1024, 2048, 4096, 8192, 16384];
