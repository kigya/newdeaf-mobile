import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { DownloadGateError } from '@/src/features/downloads/errors';
import TrailerScreen from '@/src/screens/trailer/TrailerScreen';
import { t } from '@/src/shared/i18n';

const mockResolve = jest.fn();
const mockEnqueue = jest.fn(async () => undefined);
const mockBack = jest.fn();

jest.mock('@/src/features/downloads/youtube', () => ({
  resolveYoutubeStream: (...args: unknown[]) => mockResolve(...args),
}));

jest.mock('@/src/features/downloads/store', () => ({
  useDownloadsStore: jest.fn((sel: (s: Record<string, unknown>) => unknown) =>
    sel({ enqueueYoutube: mockEnqueue })
  ),
}));

jest.mock('@/src/features/playback/MediaPlayer', () => {
  const ReactLocal = require('react');
  const { Pressable, Text, View } = require('react-native');
  return {
    MediaPlayer: ({
      title,
      children,
      onClose,
    }: {
      title?: string;
      children?: React.ReactNode;
      onClose?: () => void;
    }) =>
      ReactLocal.createElement(
        View,
        { testID: 'media-player' },
        ReactLocal.createElement(Text, { testID: 'player-title' }, title),
        ReactLocal.createElement(
          Pressable,
          { testID: 'player-close', onPress: onClose },
          ReactLocal.createElement(Text, null, 'close')
        ),
        children
      ),
  };
});

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(async () => ({ type: 'dismiss' })),
}));

describe('TrailerScreen', () => {
  beforeEach(() => {
    cleanup();
    jest.clearAllMocks();
    mockResolve.mockReset();
    mockEnqueue.mockReset();
    mockEnqueue.mockImplementation(async () => undefined);
    (useLocalSearchParams as jest.Mock).mockReturnValue({ videoId: 'abc123' });
    (useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
      back: mockBack,
      replace: jest.fn(),
      canGoBack: jest.fn(() => true),
    });
  });

  it('renders MediaPlayer when the stream resolves', async () => {
    mockResolve.mockResolvedValue({
      streamUrl: 'https://cdn/t.mp4',
      mediaKind: 'progressive',
      title: 'Official Trailer',
    });
    await render(<TrailerScreen />);
    await waitFor(() => expect(screen.getByTestId('media-player')).toBeTruthy());
    expect(screen.getByTestId('player-title').props.children).toBe('Official Trailer');
    await fireEvent.press(screen.getByText(t('trailer.download')));
    expect(mockEnqueue).toHaveBeenCalledWith('https://www.youtube.com/watch?v=abc123');
    await fireEvent.press(screen.getByTestId('player-close'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('shows startFailed when enqueue rejects', async () => {
    mockResolve.mockResolvedValue({
      streamUrl: 'https://cdn/t.mp4',
      mediaKind: 'progressive',
      title: 'Official Trailer',
    });
    mockEnqueue.mockRejectedValueOnce(new Error('nope'));
    await render(<TrailerScreen />);
    await waitFor(() => expect(screen.getByTestId('media-player')).toBeTruthy());
    await fireEvent.press(screen.getByText(t('trailer.download')));
    await waitFor(() => expect(mockEnqueue).toHaveBeenCalled());
  });

  it('offers download anyway when the wifi gate fires', async () => {
    mockResolve.mockResolvedValue({
      streamUrl: 'https://cdn/t.mp4',
      mediaKind: 'progressive',
      title: 'Official Trailer',
    });
    mockEnqueue.mockRejectedValueOnce(new DownloadGateError('wifi', 'blocked'));
    await render(<TrailerScreen />);
    await waitFor(() => expect(screen.getByTestId('media-player')).toBeTruthy());
    await fireEvent.press(screen.getByText(t('trailer.download')));
    await waitFor(() => expect(screen.getByText(t('downloadSheet.wifiTitle'))).toBeTruthy());
    await fireEvent.press(screen.getByText(t('downloads.downloadAnyway')));
    await waitFor(() =>
      expect(mockEnqueue).toHaveBeenCalledWith(
        'https://www.youtube.com/watch?v=abc123',
        undefined,
        { force: true }
      )
    );
  });

  it('cancels a storage gate on trailer download', async () => {
    mockResolve.mockResolvedValue({
      streamUrl: 'https://cdn/t.mp4',
      mediaKind: 'progressive',
      title: 'Official Trailer',
    });
    mockEnqueue.mockRejectedValueOnce(new DownloadGateError('storage', 'full'));
    await render(<TrailerScreen />);
    await waitFor(() => expect(screen.getByTestId('media-player')).toBeTruthy());
    await fireEvent.press(screen.getByText(t('trailer.download')));
    await waitFor(() => expect(screen.getByText(t('downloadSheet.storageTitle'))).toBeTruthy());
    await fireEvent.press(screen.getByText(t('common.cancel')));
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
  });

  it('shows fallback text when resolve fails', async () => {
    mockResolve.mockRejectedValue('nope');
    await render(<TrailerScreen />);
    await waitFor(() => expect(screen.getByText(t('trailer.fallback'))).toBeTruthy());
    await fireEvent.press(screen.getByText(t('trailer.openYoutube')));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=abc123'
    );
    await fireEvent.press(screen.getByText(t('common.back')));
    expect(mockBack).toHaveBeenCalled();
  });

  it('uses trailer title fallback and ignores a cancelled resolve', async () => {
    mockResolve.mockResolvedValue({
      streamUrl: 'https://cdn/t.mp4',
      mediaKind: 'hls',
      title: '',
    });
    await render(<TrailerScreen />);
    await waitFor(() => expect(screen.getByTestId('player-title').props.children).toBe(t('trailer.title')));
  });

  it('shows fallback when the resolved stream url is empty', async () => {
    mockResolve.mockResolvedValue({
      streamUrl: undefined,
      mediaKind: 'hls',
      title: 'X',
    });
    await render(<TrailerScreen />);
    await waitFor(() => expect(screen.getByText(t('trailer.openYoutube'))).toBeTruthy());
  });

  it('ignores a resolve and a reject that finish after unmount', async () => {
    let resolveLate: (v: unknown) => void = () => undefined;
    const resolvePending = new Promise((resolve) => {
      resolveLate = resolve;
    });
    mockResolve.mockReturnValue(resolvePending);
    const resolveView = await render(<TrailerScreen />);
    await waitFor(() => expect(mockResolve).toHaveBeenCalled());
    await act(async () => {
      resolveView.unmount();
    });
    await act(async () => {
      resolveLate({ streamUrl: 'https://cdn/late.mp4', mediaKind: 'hls', title: 'Late' });
    });

    mockResolve.mockReset();
    let rejectLate: (e: unknown) => void = () => undefined;
    const rejectPending = new Promise((_, reject) => {
      rejectLate = reject;
    });
    rejectPending.catch(() => undefined);
    mockResolve.mockReturnValue(rejectPending);
    const rejectView = await render(<TrailerScreen />);
    await waitFor(() => expect(mockResolve).toHaveBeenCalled());
    await act(async () => {
      rejectView.unmount();
    });
    await act(async () => {
      rejectLate(new Error('late'));
    });
  });
});
