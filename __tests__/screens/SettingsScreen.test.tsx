import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import Constants from 'expo-constants';

import SettingsScreen from '@/src/screens/settings/SettingsScreen';
import { t } from '@/src/shared/i18n';

const mockSetLocale = jest.fn(async () => undefined);
const mockSetPreferredDownloadQuality = jest.fn(async () => undefined);
let mockLocale: 'en' | 'ru' = 'en';

jest.mock('@/src/features/settings/store', () => ({
  useSettingsStore: jest.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      get locale() {
        return mockLocale;
      },
      preferredDownloadQuality: '720',
      setLocale: mockSetLocale,
      setPreferredDownloadQuality: mockSetPreferredDownloadQuality,
    })
  ),
}));

describe('SettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocale = 'en';
    (Constants as { expoConfig?: { version?: string } | null }).expoConfig = { version: '1.0.0' };
    (Constants as { nativeApplicationVersion?: string | null }).nativeApplicationVersion = '1.0.0';
  });

  afterEach(() => {
    cleanup();
    mockLocale = 'en';
  });

  it('renders and changes language / quality', async () => {
    await render(<SettingsScreen />);
    expect(screen.getByText(t('settings.title'))).toBeTruthy();

    await fireEvent.press(screen.getByText(t('settings.languageRu')));
    expect(mockSetLocale).toHaveBeenCalledWith('ru');

    await fireEvent.press(screen.getByText(t('settings.languageEn')));
    expect(mockSetLocale).toHaveBeenCalledWith('en');

    await fireEvent.press(screen.getByText(t('settings.quality1080')));
    expect(mockSetPreferredDownloadQuality).toHaveBeenCalledWith('1080');

    await fireEvent.press(screen.getByText(t('settings.qualityBest')));
    expect(mockSetPreferredDownloadQuality).toHaveBeenCalledWith('best');

    await fireEvent.press(screen.getByText(t('settings.quality480')));
    expect(mockSetPreferredDownloadQuality).toHaveBeenCalledWith('480');

    await fireEvent.press(screen.getByText(t('settings.quality360')));
    expect(mockSetPreferredDownloadQuality).toHaveBeenCalledWith('360');

    await fireEvent.press(screen.getByText(t('settings.quality720')));
    expect(mockSetPreferredDownloadQuality).toHaveBeenCalledWith('720');
  });

  it('falls back version from nativeApplicationVersion then default', async () => {
    (Constants as { expoConfig?: { version?: string } | null }).expoConfig = null;
    (Constants as { nativeApplicationVersion?: string | null }).nativeApplicationVersion = '9.9.9';
    await render(<SettingsScreen />);
    expect(screen.getByText(t('settings.version', { version: '9.9.9' }))).toBeTruthy();

    (Constants as { nativeApplicationVersion?: string | null }).nativeApplicationVersion = null;
    await render(<SettingsScreen />);
    expect(screen.getByText(t('settings.version', { version: '1.0.0' }))).toBeTruthy();
  });

  it('opens author github link', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);
    await render(<SettingsScreen />);
    await fireEvent.press(screen.getByText(t('settings.madeByLink')));
    await waitFor(() => {
      expect(openURL).toHaveBeenCalledWith('https://github.com/kigya/newdeaf-mobile');
    });
    openURL.mockRestore();
  });

  it('lays out language switcher pill and supports ru locale', async () => {
    mockLocale = 'ru';
    const view = await render(<SettingsScreen />);
    await act(async () => {
      fireEvent(screen.getByTestId('language-switch'), 'layout', {
        nativeEvent: { layout: { width: 320, height: 48, x: 0, y: 0 } },
      });
    });
    mockLocale = 'en';
    view.rerender(<SettingsScreen />);
    await act(async () => {
      fireEvent(screen.getByTestId('language-switch'), 'layout', {
        nativeEvent: { layout: { width: 320, height: 48, x: 0, y: 0 } },
      });
    });
    expect(screen.getByText(t('settings.languageEn'))).toBeTruthy();
  });
});
