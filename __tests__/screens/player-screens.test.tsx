import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import OfflinePlayerScreen from '@/src/screens/offline-player/OfflinePlayerScreen';
import OnlinePlayerScreen from '@/src/screens/online-player/OnlinePlayerScreen';
import { t } from '@/src/shared/i18n';

const mockUpsert = jest.fn(async () => undefined);
const mockClearProgress = jest.fn(async () => undefined);
const mockFetchProgress = jest.fn();
const mockGetDownload = jest.fn();

jest.mock('@/src/features/watch-progress/store', () => ({
  useWatchProgressStore: jest.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({ upsert: mockUpsert, clear: mockClearProgress })
  ),
  fetchProgress: (...args: unknown[]) => mockFetchProgress(...args),
}));

jest.mock('@/src/features/playback/PlayerWebView', () => ({
  PlayerWebView: ({
    onProgress,
  }: {
    onProgress?: (p: { currentTime: number; duration?: number }) => void;
  }) => {
    const ReactLocal = require('react');
    const { Pressable, Text } = require('react-native');
    return ReactLocal.createElement(
      Pressable,
      {
        testID: 'player-webview',
        onPress: () => onProgress?.({ currentTime: 45, duration: 600 }),
      },
      ReactLocal.createElement(Text, null, 'webview')
    );
  },
}));

jest.mock('@/src/features/playback/offline/OfflinePlayer', () => ({
  OfflinePlayer: ({
    onClose,
    onProgress,
    title,
  }: {
    onClose?: () => void;
    onProgress?: (p: { positionSec: number; durationSec?: number }) => void;
    title?: string;
  }) => {
    const ReactLocal = require('react');
    const { Pressable, Text, View } = require('react-native');
    return ReactLocal.createElement(
      View,
      null,
      ReactLocal.createElement(Text, null, title ?? 'offline'),
      ReactLocal.createElement(
        Pressable,
        {
          testID: 'offline-progress',
          onPress: () => onProgress?.({ positionSec: 80, durationSec: 400 }),
        },
        ReactLocal.createElement(Text, null, 'progress')
      ),
      ReactLocal.createElement(
        Pressable,
        { testID: 'offline-close', onPress: onClose },
        ReactLocal.createElement(Text, null, 'close')
      )
    );
  },
}));

jest.mock('@/src/features/downloads/db', () => ({
  getDownload: (...args: unknown[]) => mockGetDownload(...args),
}));

describe('OnlinePlayerScreen', () => {
  const mockBack = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
      back: mockBack,
      replace: jest.fn(),
      canGoBack: jest.fn(() => true),
    });
  });

  it('shows error when playerUrl missing', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
    await render(<OnlinePlayerScreen />);
    expect(screen.getByText(t('movie.noPlayer'))).toBeTruthy();
  });

  it('renders player, saves progress, and closes', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      playerUrl: 'https://player.example',
      title: 'Watch Me',
      movieId: 'm1',
      href: '/m1/',
      isSeries: '1',
      season: '1',
      episode: '2',
      startTime: '30',
    });
    await render(<OnlinePlayerScreen />);
    expect(screen.getByText('Watch Me')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('player-webview'));
    await waitFor(() => expect(mockUpsert).toHaveBeenCalled());
    await fireEvent.press(screen.getByTestId('icon-close'));
    expect(mockBack).toHaveBeenCalled();
  });
});

describe('OfflinePlayerScreen', () => {
  const mockBack = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
      back: mockBack,
      replace: jest.fn(),
      canGoBack: jest.fn(() => true),
    });
    (useLocalSearchParams as jest.Mock).mockReturnValue({ downloadId: 'd1' });
  });

  it('shows error when file missing', async () => {
    mockGetDownload.mockResolvedValue(null);
    await render(<OfflinePlayerScreen />);
    await waitFor(() => expect(screen.getByText(t('offline.fileNotFound'))).toBeTruthy());
  });

  it('starts playing when no resume target', async () => {
    mockGetDownload.mockResolvedValue({
      id: 'd1',
      movieId: 'm1',
      title: 'Local Film',
      playlistPath: 'file:///p.m3u8',
      subtitlePath: undefined,
      mediaKind: 'hls',
      season: undefined,
      episode: undefined,
      posterUrl: undefined,
    });
    mockFetchProgress.mockResolvedValue(null);
    await render(<OfflinePlayerScreen />);
    await waitFor(() => expect(screen.getByText('Local Film')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('offline-progress'));
    await waitFor(() => expect(mockUpsert).toHaveBeenCalled());
    await fireEvent.press(screen.getByTestId('offline-close'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('prompts resume and continues', async () => {
    mockGetDownload.mockResolvedValue({
      id: 'd1',
      movieId: 'm1',
      title: 'Local Film',
      playlistPath: 'file:///p.m3u8',
      mediaKind: 'hls',
      season: 1,
      episode: 1,
    });
    mockFetchProgress.mockResolvedValue({
      id: 'm1_s1e1',
      movieId: 'm1',
      season: 1,
      episode: 1,
      positionSec: 120,
      durationSec: 600,
      title: 'Local Film',
      isSeries: true,
      source: 'offline',
      downloadId: 'd1',
      updatedAt: 1,
    });
    await render(<OfflinePlayerScreen />);
    await waitFor(() => expect(screen.getByText(t('resume.title'))).toBeTruthy());
    await fireEvent.press(screen.getByText(t('resume.continue')));
    await waitFor(() => expect(screen.getByText('Local Film')).toBeTruthy());
  });

  it('start over clears progress', async () => {
    mockGetDownload.mockResolvedValue({
      id: 'd1',
      movieId: 'm1',
      title: 'Local Film',
      playlistPath: 'file:///p.m3u8',
      mediaKind: 'hls',
    });
    mockFetchProgress.mockResolvedValue({
      id: 'm1',
      movieId: 'm1',
      positionSec: 200,
      durationSec: 800,
      title: 'Local Film',
      isSeries: false,
      source: 'offline',
      downloadId: 'd1',
      updatedAt: 1,
    });
    await render(<OfflinePlayerScreen />);
    await waitFor(() => expect(screen.getByText(t('resume.startOver'))).toBeTruthy());
    await act(async () => {
      await fireEvent.press(screen.getByText(t('resume.startOver')));
    });
    await waitFor(() => expect(mockClearProgress).toHaveBeenCalled());
  });
});
