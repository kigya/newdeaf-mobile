export type AppLocale = 'ru' | 'en';

export type PreferredDownloadQuality = 'best' | '1080' | '720' | '480' | '360';

export type SettingsRecord = {
  locale: AppLocale;
  lastSeenSystemLocale: AppLocale;
  preferredDownloadQuality: PreferredDownloadQuality;
};

export const DEFAULT_PREFERRED_QUALITY: PreferredDownloadQuality = '720';

export const QUALITY_OPTIONS: PreferredDownloadQuality[] = [
  'best',
  '1080',
  '720',
  '480',
  '360',
];
