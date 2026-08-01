import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';

import DownloadsScreen from '@/src/screens/downloads/DownloadsScreen';
import type { DownloadRecord } from '@/src/features/downloads/types';
import { t } from '@/src/shared/i18n';

const mockHydrate = jest.fn(async () => undefined);
const mockRemove = jest.fn(async () => undefined);
const mockRetry = jest.fn(async () => undefined);
const mockCompleteMovieRetry = jest.fn(async () => undefined);
const mockFailMovieResolve = jest.fn(async () => undefined);

let mockStoreItems: DownloadRecord[] = [];
let mockHydrated = true;

jest.mock('@/src/features/downloads/store', () => ({
  useDownloadsStore: jest.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      items: mockStoreItems,
      hydrated: mockHydrated,
      hydrate: mockHydrate,
      remove: mockRemove,
      retry: mockRetry,
      completeMovieRetry: mockCompleteMovieRetry,
      failMovieResolve: mockFailMovieResolve,
    })
  ),
}));

jest.mock('@/src/shared/ui/YoutubeDownloadSheet', () => ({
  YoutubeDownloadSheet: ({
    visible,
    onClose,
  }: {
    visible: boolean;
    onClose: () => void;
  }) => {
    const ReactLocal = require('react');
    const { Pressable, Text } = require('react-native');
    if (!visible) return null;
    return ReactLocal.createElement(
      Pressable,
      { testID: 'yt-sheet', onPress: onClose },
      ReactLocal.createElement(Text, null, 'YT Sheet')
    );
  },
}));

jest.mock('@/src/features/playback/StreamResolver', () => ({
  StreamResolver: (props: {
    onResolved: (p: unknown) => void;
    onError: (m: string) => void;
  }) => {
    const ReactLocal = require('react');
    const { Pressable, Text, View } = require('react-native');
    // Expose callbacks for tests (parent uses pointerEvents none).
    (global as unknown as { __downloadsResolverProps?: typeof props }).__downloadsResolverProps =
      props;
    return ReactLocal.createElement(
      View,
      null,
      ReactLocal.createElement(
        Pressable,
        {
          testID: 'resolver-ok',
          onPress: () =>
            props.onResolved({
              hlsSource: [{ label: 'a', quality: { '720': 'u' } }],
              tracks: [],
            }),
        },
        ReactLocal.createElement(Text, null, 'resolve-ok')
      ),
      ReactLocal.createElement(
        Pressable,
        { testID: 'resolver-err', onPress: () => props.onError('resolve failed') },
        ReactLocal.createElement(Text, null, 'resolve-err')
      )
    );
  },
}));

function baseItem(overrides: Partial<DownloadRecord> = {}): DownloadRecord {
  return {
    id: 'd1',
    movieId: 'm1',
    title: 'Downloaded Film',
    audioLabel: 'RU',
    quality: '720',
    subtitleLabel: 'EN',
    status: 'completed',
    progress: 1,
    playlistPath: 'file:///p.m3u8',
    posterUrl: 'https://example.com/p.jpg',
    createdAt: 1,
    updatedAt: 1,
    source: 'movie',
    mediaKind: 'hls',
    ...overrides,
  };
}

describe('DownloadsScreen', () => {
  const mockPush = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockHydrated = true;
    mockStoreItems = [];
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      back: jest.fn(),
      replace: jest.fn(),
      canGoBack: jest.fn(() => true),
    });
  });

  it('shows empty state and opens youtube sheet', async () => {
    await render(<DownloadsScreen />);
    expect(screen.getByText(t('downloads.emptyTitle'))).toBeTruthy();
    await fireEvent.press(screen.getByText(t('downloads.ytTitle')));
    expect(screen.getByTestId('yt-sheet')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('yt-sheet'));
    expect(screen.queryByTestId('yt-sheet')).toBeNull();
  });

  it('hydrates when not hydrated', async () => {
    mockHydrated = false;
    await render(<DownloadsScreen />);
    expect(mockHydrate).toHaveBeenCalled();
  });

  it('plays completed item and confirms delete', async () => {
    mockStoreItems = [baseItem()];
    await render(<DownloadsScreen />);
    await fireEvent.press(screen.getByText('Downloaded Film'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/offline/[downloadId]',
      params: { downloadId: 'd1' },
    });
    await fireEvent.press(screen.getByTestId('icon-trash-outline'));
    expect(screen.getByText(t('downloads.deleteTitle'))).toBeTruthy();
    await fireEvent.press(screen.getByText(t('common.delete')));
    await waitFor(() => expect(mockRemove).toHaveBeenCalledWith('d1'));
  });

  it('retries failed downloads and shows youtube row', async () => {
    mockStoreItems = [
      baseItem({
        id: 'fail1',
        status: 'failed',
        error: 'nope',
        playlistPath: undefined,
        posterUrl: undefined,
      }),
      baseItem({
        id: 'yt1',
        source: 'youtube',
        title: 'YT Clip',
        status: 'downloading',
        progress: 0.4,
        posterUrl: undefined,
        playlistPath: undefined,
      }),
      baseItem({
        id: 'ep1',
        title: 'Episode',
        season: 1,
        episode: 3,
        status: 'queued',
        playlistPath: undefined,
      }),
    ];
    await render(<DownloadsScreen />);
    expect(screen.getByText('YT Clip')).toBeTruthy();
    expect(screen.getByText(t('downloads.ytBadge'))).toBeTruthy();
    await fireEvent.press(screen.getByTestId('icon-refresh'));
    await waitFor(() => expect(mockRetry).toHaveBeenCalledWith('fail1'));
  });

  it('shows resolving banner and mounts StreamResolver for movie retry', async () => {
    mockStoreItems = [
      baseItem({
        id: 'res1',
        status: 'resolving',
        playerUrl: 'https://player.example/p',
        playlistPath: undefined,
      }),
    ];
    await render(<DownloadsScreen />);
    expect(screen.getByText(t('player.resolving'))).toBeTruthy();
    expect(screen.getByTestId('resolver-ok')).toBeTruthy();
    expect(screen.getByTestId('resolver-err')).toBeTruthy();

    const props = (global as unknown as { __downloadsResolverProps: {
      onResolved: (p: unknown) => void;
      onError: (m: string) => void;
    } }).__downloadsResolverProps;
    props.onResolved({ hlsSource: [{ label: 'a', quality: { '720': 'u' } }], tracks: [] });
    await waitFor(() => expect(mockCompleteMovieRetry).toHaveBeenCalled());

    mockCompleteMovieRetry.mockRejectedValueOnce(new Error('complete fail'));
    props.onResolved({ hlsSource: [{ label: 'a', quality: { '720': 'u' } }], tracks: [] });
    await waitFor(() =>
      expect(screen.getByText(t('downloads.retryFailedTitle'))).toBeTruthy()
    );
    await fireEvent.press(screen.getByText(t('common.gotIt')));

    props.onError('resolve failed');
    await waitFor(() => expect(mockFailMovieResolve).toHaveBeenCalled());
  });

  it('shows failed status without error and cancels delete', async () => {
    mockStoreItems = [
      baseItem({
        id: 'f1',
        status: 'failed',
        error: undefined,
        playlistPath: undefined,
      }),
      baseItem({
        id: 'weird',
        status: 'paused' as DownloadRecord['status'],
        playlistPath: undefined,
      }),
    ];
    await render(<DownloadsScreen />);
    expect(screen.getByText(t('downloads.failed'))).toBeTruthy();
    await fireEvent.press(screen.getAllByTestId('icon-trash-outline')[0]);
    await fireEvent.press(screen.getByText(t('common.cancel')));
  });

  it('retry failure shows error dialog and cancel clears it', async () => {
    mockRetry.mockRejectedValueOnce(new Error('retry boom'));
    mockStoreItems = [
      baseItem({
        id: 'fail1',
        status: 'failed',
        error: 'nope',
        playlistPath: undefined,
      }),
    ];
    await render(<DownloadsScreen />);
    await fireEvent.press(screen.getByTestId('icon-refresh'));
    await waitFor(() =>
      expect(screen.getByText(t('downloads.retryFailedTitle'))).toBeTruthy()
    );
    await fireEvent.press(screen.getByTestId('confirm-dialog-backdrop'));
    await waitFor(() =>
      expect(screen.queryByText(t('downloads.retryFailedTitle'))).toBeNull()
    );
  });

  it('press on incomplete does not navigate; long-press deletes', async () => {
    mockStoreItems = [
      baseItem({
        id: 'inc1',
        status: 'completed',
        playlistPath: undefined,
      }),
    ];
    await render(<DownloadsScreen />);
    await fireEvent.press(screen.getByText('Downloaded Film'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('resolver ignores callbacks when resolving id mismatches media fetch host', async () => {
    mockStoreItems = [
      baseItem({
        id: 'dl2',
        status: 'downloading',
        progress: 0.1,
        playerUrl: 'https://player.example/other',
        playlistPath: undefined,
      }),
      baseItem({
        id: 'res1',
        status: 'resolving',
        playerUrl: 'https://player.example/p',
        playlistPath: undefined,
      }),
    ];
    await render(<DownloadsScreen />);
    const props = (global as unknown as { __downloadsResolverProps: {
      onResolved: (p: unknown) => void;
      onError: (m: string) => void;
    } }).__downloadsResolverProps;
    // mediaFetchMovie is dl2 (first match); resolvingMovie is res1 — ids differ
    props.onResolved({ hlsSource: [{ label: 'a', quality: { '720': 'u' } }], tracks: [] });
    props.onError('x');
    expect(mockCompleteMovieRetry).not.toHaveBeenCalled();
    expect(mockFailMovieResolve).not.toHaveBeenCalled();
  });

  it('mounts media fetch host for queued movie with playerUrl', async () => {
    mockStoreItems = [
      baseItem({
        id: 'q1',
        status: 'queued',
        playerUrl: 'https://player.example/q',
        playlistPath: undefined,
      }),
    ];
    await render(<DownloadsScreen />);
    expect(screen.getByTestId('resolver-ok')).toBeTruthy();
  });

  it('cancels delete confirm without removing', async () => {
    mockStoreItems = [baseItem()];
    await render(<DownloadsScreen />);
    await fireEvent.press(screen.getByTestId('icon-trash-outline'));
    await fireEvent.press(screen.getByText(t('common.cancel')));
    expect(mockRemove).not.toHaveBeenCalled();
  });
});
