import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import SettingsScreen from '@/src/screens/settings/SettingsScreen';
import { t } from '@/src/shared/i18n';

const mockSetLocale = jest.fn(async () => undefined);
const mockSetPreferredDownloadQuality = jest.fn(async () => undefined);

jest.mock('@/src/features/settings/store', () => ({
  useSettingsStore: jest.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      locale: 'en',
      preferredDownloadQuality: '720',
      setLocale: mockSetLocale,
      setPreferredDownloadQuality: mockSetPreferredDownloadQuality,
    })
  ),
}));

describe('SettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
