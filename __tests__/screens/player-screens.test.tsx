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
    const { Pressable, Text, View } = require('react-native');
    return ReactLocal.createElement(
      View,
      null,
      ReactLocal.createElement(
        Pressable,
        {
          testID: 'player-webview',
          onPress: () => onProgress?.({ currentTime: 45, duration: 600 }),
        },
        ReactLocal.createElement(Text, null, 'webview')
      ),
      ReactLocal.createElement(
        Pressable,
        {
          testID: 'player-webview-nodur',
          onPress: () => onProgress?.({ currentTime: 50 }),
        },
        ReactLocal.createElement(Text, null, 'nodur')
      )
    );
  },
}));

jest.mock('@/src/features/playback/offline/OfflinePlayer', () => ({
  OfflinePlayer: ({
    onClose,
    onProgress,
    title,
    introSkip,
    onMarkIntroSkip,
  }: {
    onClose?: () => void;
    onProgress?: (p: { positionSec: number; durationSec?: number }) => void;
    title?: string;
    introSkip?: { startSec: number; endSec: number };
    onMarkIntroSkip?: (positionSec: number) => void;
  }) => {
    const ReactLocal = require('react');
    const { Pressable, Text, View } = require('react-native');
    return ReactLocal.createElement(
      View,
      null,
      ReactLocal.createElement(Text, null, title ?? 'offline'),
      introSkip
        ? ReactLocal.createElement(
            Text,
            { testID: 'intro-skip-window' },
            `${introSkip.startSec}-${introSkip.endSec}`
          )
        : null,
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
        {
          testID: 'offline-mark-skip',
          onPress: () => onMarkIntroSkip?.(45),
        },
        ReactLocal.createElement(Text, null, 'mark-skip')
      ),
      ReactLocal.createElement(
        Pressable,
        {
          testID: 'offline-mark-skip-short',
          onPress: () => onMarkIntroSkip?.(5),
        },
        ReactLocal.createElement(Text, null, 'mark-skip-short')
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

const mockSetIntroSkipSec = jest.fn(async () => undefined);
let mockTitlePrefs: Record<string, { introSkipSec?: number }> = {};

jest.mock('@/src/features/title-prefs/store', () => ({
  useTitlePrefsStore: jest.fn((sel: (s: Record<string, unknown>) => unknown) =>
    sel({
      setIntroSkipSec: mockSetIntroSkipSec,
      byId: mockTitlePrefs,
    })
  ),
}));

describe('OnlinePlayerScreen', () => {
  const mockBack = jest.fn();
  let now = 1_000_000;

  beforeEach(() => {
    jest.clearAllMocks();
    now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    (useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
      back: mockBack,
      replace: jest.fn(),
      canGoBack: jest.fn(() => true),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
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
    now += 3000;
    await fireEvent.press(screen.getByTestId('player-webview'));
    await fireEvent.press(screen.getByTestId('icon-close'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('throttles progress and skips save without movieId', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      playerUrl: 'https://player.example',
      season: 'nope',
      episode: '',
      startTime: '',
    });
    const { unmount } = await render(<OnlinePlayerScreen />);
    expect(screen.getByTestId('player-webview')).toBeTruthy();
    expect(screen.getByText(t('common.player'))).toBeTruthy();
    await fireEvent.press(screen.getByTestId('player-webview'));
    await fireEvent.press(screen.getByTestId('player-webview'));
    expect(mockUpsert).not.toHaveBeenCalled();
    unmount();
  });

  it('throttles rapid progress updates when movieId is set', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      playerUrl: 'https://player.example',
      movieId: 'm-throttle',
      title: 'Throttle',
    });
    await render(<OnlinePlayerScreen />);
    await fireEvent.press(screen.getByTestId('player-webview'));
    await waitFor(() => expect(mockUpsert).toHaveBeenCalledTimes(1));
    // Same Date.now — within PROGRESS_THROTTLE_MS
    await fireEvent.press(screen.getByTestId('player-webview'));
    expect(mockUpsert).toHaveBeenCalledTimes(1);
  });

  it('force-saves on close when movieId present', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      playerUrl: 'https://player.example',
      movieId: 'm9',
      posterUrl: 'https://p',
      isSeries: '0',
    });
    await render(<OnlinePlayerScreen />);
    await fireEvent.press(screen.getByTestId('player-webview'));
    await waitFor(() => expect(mockUpsert).toHaveBeenCalled());
    const callsBefore = mockUpsert.mock.calls.length;
    now += 3000;
    await fireEvent.press(screen.getByTestId('icon-close'));
    expect(mockUpsert.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(mockBack).toHaveBeenCalled();
  });

  it('reuses last duration when progress omits duration', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      playerUrl: 'https://player.example',
      movieId: 'm3',
      title: 'Dur',
      isSeries: '1',
      season: '2',
      episode: '3',
    });
    await render(<OnlinePlayerScreen />);
    await fireEvent.press(screen.getByTestId('player-webview'));
    await waitFor(() => expect(mockUpsert).toHaveBeenCalled());
    now += 3000;
    await fireEvent.press(screen.getByTestId('player-webview-nodur'));
    await waitFor(() =>
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          season: 2,
          episode: 3,
          durationSec: expect.any(Number),
        })
      )
    );
  });
});

describe('OfflinePlayerScreen', () => {
  const mockBack = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockTitlePrefs = {};
    mockGetDownload.mockReset();
    mockFetchProgress.mockReset();
    mockFetchProgress.mockResolvedValue(null);
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

  it('shows error when getDownload throws', async () => {
    mockGetDownload.mockRejectedValueOnce(new Error('db boom'));
    await render(<OfflinePlayerScreen />);
    await waitFor(() => expect(screen.getByText('db boom')).toBeTruthy());
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
    await render(<OfflinePlayerScreen />);
    await waitFor(() => expect(screen.getByText('Local Film')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('offline-progress'));
    await waitFor(() => expect(mockUpsert).toHaveBeenCalled());
    await fireEvent.press(screen.getByTestId('offline-close'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('passes download intro markers and remembers a skip point', async () => {
    mockGetDownload.mockResolvedValue({
      id: 'd1',
      movieId: 'm1',
      title: 'Local Film',
      playlistPath: 'file:///p.m3u8',
      mediaKind: 'hls',
      skipTimeSec: 10,
      removeTimeSec: 90,
    });
    await render(<OfflinePlayerScreen />);
    await waitFor(() => expect(screen.getByTestId('intro-skip-window')).toBeTruthy());
    expect(screen.getByText('10-90')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('offline-mark-skip'));
    expect(mockSetIntroSkipSec).toHaveBeenCalledWith('m1', 45);
    mockSetIntroSkipSec.mockClear();
    await fireEvent.press(screen.getByTestId('offline-mark-skip-short'));
    expect(mockSetIntroSkipSec).not.toHaveBeenCalled();
  });

  it('uses manual title-pref skip when download has no markers', async () => {
    mockTitlePrefs = { m1: { introSkipSec: 40 } };
    mockGetDownload.mockResolvedValue({
      id: 'd1',
      movieId: 'm1',
      title: 'Local Film',
      playlistPath: 'file:///p.m3u8',
      mediaKind: 'hls',
    });
    await render(<OfflinePlayerScreen />);
    await waitFor(() => expect(screen.getByText('0-40')).toBeTruthy());
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
      posterUrl: 'https://p',
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
    await fireEvent.press(screen.getByTestId('offline-progress'));
    await waitFor(() =>
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ isSeries: true, posterUrl: 'https://p' })
      )
    );
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

  it('resume with undefined positionSec uses zero', async () => {
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
      positionSec: undefined as unknown as number,
      durationSec: 800,
      title: 'Local Film',
      isSeries: false,
      source: 'offline',
      downloadId: 'd1',
      updatedAt: 1,
    });
    await render(<OfflinePlayerScreen />);
    await waitFor(() => expect(screen.getByText(t('resume.continue'))).toBeTruthy());
    await fireEvent.press(screen.getByText(t('resume.continue')));
    await waitFor(() => expect(screen.getByText('Local Film')).toBeTruthy());
  });

  it('cancels after download loads when downloadId changes during progress fetch', async () => {
    mockGetDownload.mockResolvedValue({
      id: 'd1',
      movieId: 'm1',
      title: 'First Film',
      playlistPath: 'file:///p.m3u8',
      mediaKind: 'hls',
    });
    let resolveProgress: (v: unknown) => void = () => undefined;
    mockFetchProgress.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveProgress = resolve;
        })
    );
    const view = await render(<OfflinePlayerScreen />);
    await waitFor(() => expect(mockFetchProgress).toHaveBeenCalled());
    mockGetDownload.mockResolvedValue({
      id: 'd2',
      movieId: 'm2',
      title: 'Second Film',
      playlistPath: 'file:///p2.m3u8',
      mediaKind: 'hls',
    });
    mockFetchProgress.mockResolvedValue(null);
    (useLocalSearchParams as jest.Mock).mockReturnValue({ downloadId: 'd2' });
    view.rerender(<OfflinePlayerScreen />);
    await waitFor(() => expect(screen.getByText('Second Film')).toBeTruthy());
    await act(async () => {
      resolveProgress({
        id: 'm1',
        movieId: 'm1',
        positionSec: 200,
        durationSec: 800,
        title: 'First Film',
        isSeries: false,
        source: 'offline',
        downloadId: 'd1',
        updatedAt: 1,
      });
    });
    expect(screen.queryByText(t('resume.title'))).toBeNull();
  });

  it('cancels in-flight load when downloadId changes', async () => {
    let resolveFirst: (v: unknown) => void = () => undefined;
    mockGetDownload
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          })
      )
      .mockResolvedValue({
        id: 'd2',
        movieId: 'm2',
        title: 'Second Film',
        playlistPath: 'file:///p2.m3u8',
        mediaKind: 'hls',
      });

    const view = await render(<OfflinePlayerScreen />);
    await waitFor(() => expect(mockGetDownload).toHaveBeenCalled());

    (useLocalSearchParams as jest.Mock).mockReturnValue({ downloadId: 'd2' });
    view.rerender(<OfflinePlayerScreen />);
    await waitFor(() => expect(screen.getByText('Second Film')).toBeTruthy());

    await act(async () => {
      resolveFirst({
        id: 'd1',
        movieId: 'm1',
        title: 'First Film',
        playlistPath: 'file:///p.m3u8',
        mediaKind: 'hls',
      });
    });
    expect(screen.queryByText('First Film')).toBeNull();
  });

  it('ignores late getDownload rejection after cancel', async () => {
    let rejectFirst: (reason?: unknown) => void = () => undefined;
    mockGetDownload
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectFirst = reject;
          })
      )
      .mockResolvedValue({
        id: 'd2',
        movieId: 'm2',
        title: 'Second Film',
        playlistPath: 'file:///p2.m3u8',
        mediaKind: 'hls',
      });

    const view = await render(<OfflinePlayerScreen />);
    await waitFor(() => expect(mockGetDownload).toHaveBeenCalled());
    (useLocalSearchParams as jest.Mock).mockReturnValue({ downloadId: 'd2' });
    view.rerender(<OfflinePlayerScreen />);
    await waitFor(() => expect(screen.getByText('Second Film')).toBeTruthy());
    await act(async () => {
      rejectFirst(new Error('late db boom'));
    });
    expect(screen.queryByText('late db boom')).toBeNull();
    expect(screen.getByText('Second Film')).toBeTruthy();
  });
});
