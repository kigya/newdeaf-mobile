jest.mock('@/src/features/settings/db', () => ({
  loadSettings: jest.fn(),
  saveSettings: jest.fn(async () => undefined),
}));

jest.mock('@/src/shared/i18n', () => {
  const actual = jest.requireActual('@/src/shared/i18n') as typeof import('@/src/shared/i18n');
  return {
    ...actual,
    readSystemLocale: jest.fn(() => 'en'),
    setLocale: jest.fn(),
  };
});

import { loadSettings, saveSettings } from '@/src/features/settings/db';
import { readSystemLocale, setLocale as applyI18nLocale } from '@/src/shared/i18n';
import { useSettingsStore } from '@/src/features/settings/store';

describe('settings store', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSettingsStore.setState({
      locale: 'en',
      lastSeenSystemLocale: 'en',
      preferredDownloadQuality: '720',
      downloadsWifiOnly: false,
      storageCapMb: 0,
      hydrated: false,
    });
    (readSystemLocale as jest.Mock).mockReturnValue('en');
  });

  it('hydrates from stored settings', async () => {
    (loadSettings as jest.Mock).mockResolvedValue({
      locale: 'ru',
      lastSeenSystemLocale: 'en',
      preferredDownloadQuality: '1080',
      downloadsWifiOnly: true,
      storageCapMb: 2048,
    });
    await useSettingsStore.getState().hydrate();
    expect(useSettingsStore.getState().locale).toBe('ru');
    expect(useSettingsStore.getState().preferredDownloadQuality).toBe('1080');
    expect(useSettingsStore.getState().hydrated).toBe(true);
    expect(applyI18nLocale).toHaveBeenCalledWith('ru');
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it('seeds from system on first install', async () => {
    (loadSettings as jest.Mock).mockResolvedValue(null);
    (readSystemLocale as jest.Mock).mockReturnValue('ru');
    await useSettingsStore.getState().hydrate();
    expect(useSettingsStore.getState().locale).toBe('ru');
    expect(useSettingsStore.getState().lastSeenSystemLocale).toBe('ru');
    expect(saveSettings).toHaveBeenCalled();
  });

  it('setLocale updates locale only', async () => {
    useSettingsStore.setState({
      locale: 'en',
      lastSeenSystemLocale: 'en',
      preferredDownloadQuality: '720',
      downloadsWifiOnly: false,
      storageCapMb: 0,
      hydrated: true,
    });
    await useSettingsStore.getState().setLocale('ru');
    expect(useSettingsStore.getState().locale).toBe('ru');
    expect(useSettingsStore.getState().lastSeenSystemLocale).toBe('en');
    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ locale: 'ru', lastSeenSystemLocale: 'en' })
    );
  });

  it('syncFromSystemIfChanged no-ops when system unchanged', async () => {
    useSettingsStore.setState({
      locale: 'ru',
      lastSeenSystemLocale: 'en',
      preferredDownloadQuality: '720',
      downloadsWifiOnly: false,
      storageCapMb: 0,
      hydrated: true,
    });
    (readSystemLocale as jest.Mock).mockReturnValue('en');
    await useSettingsStore.getState().syncFromSystemIfChanged();
    expect(useSettingsStore.getState().locale).toBe('ru');
  });

  it('syncFromSystemIfChanged overwrites when OS locale code changed', async () => {
    useSettingsStore.setState({
      locale: 'ru',
      lastSeenSystemLocale: 'en',
      preferredDownloadQuality: '720',
      downloadsWifiOnly: false,
      storageCapMb: 0,
      hydrated: true,
    });
    (readSystemLocale as jest.Mock).mockReturnValue('ru');
    await useSettingsStore.getState().syncFromSystemIfChanged();
    expect(useSettingsStore.getState().locale).toBe('ru');
    expect(useSettingsStore.getState().lastSeenSystemLocale).toBe('ru');
  });

  it('syncFromSystemIfChanged no-ops before hydrate', async () => {
    useSettingsStore.setState({ hydrated: false });
    (readSystemLocale as jest.Mock).mockReturnValue('ru');
    await useSettingsStore.getState().syncFromSystemIfChanged();
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it('setPreferredDownloadQuality persists', async () => {
    useSettingsStore.setState({
      locale: 'en',
      lastSeenSystemLocale: 'en',
      preferredDownloadQuality: '720',
      downloadsWifiOnly: false,
      storageCapMb: 0,
      hydrated: true,
    });
    await useSettingsStore.getState().setPreferredDownloadQuality('best');
    expect(useSettingsStore.getState().preferredDownloadQuality).toBe('best');
    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ preferredDownloadQuality: 'best' })
    );
  });

  it('setDownloadsWifiOnly and setStorageCapMb persist', async () => {
    useSettingsStore.setState({
      locale: 'en',
      lastSeenSystemLocale: 'en',
      preferredDownloadQuality: '720',
      downloadsWifiOnly: false,
      storageCapMb: 0,
      hydrated: true,
    });
    await useSettingsStore.getState().setDownloadsWifiOnly(true);
    expect(useSettingsStore.getState().downloadsWifiOnly).toBe(true);
    expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({ downloadsWifiOnly: true }));

    await useSettingsStore.getState().setStorageCapMb(2048.9);
    expect(useSettingsStore.getState().storageCapMb).toBe(2048);
    await useSettingsStore.getState().setStorageCapMb(-1);
    expect(useSettingsStore.getState().storageCapMb).toBe(0);
  });
});
