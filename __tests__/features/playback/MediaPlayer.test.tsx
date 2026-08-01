import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockPlay = jest.fn();
const mockReplaceAsync = jest.fn(async () => undefined);
const mockEventHandlers: Record<string, (payload: unknown) => void> = {};

const mockPlayerState = {
  loop: false,
  timeUpdateEventInterval: 0.25,
  staysActiveInBackground: false,
  currentTime: 10,
  duration: 100,
  play: mockPlay,
  replaceAsync: mockReplaceAsync,
};

jest.mock('expo-video', () => ({
  useVideoPlayer: jest.fn((_source: unknown, setup?: (p: typeof mockPlayerState) => void) => {
    setup?.(mockPlayerState);
    return mockPlayerState;
  }),
  VideoView: ({ testID }: { testID?: string }) => {
    const ReactLocal = require('react');
    const { View } = require('react-native');
    return ReactLocal.createElement(View, { testID: testID ?? 'video-view' });
  },
}));

jest.mock('expo', () => ({
  useEventListener: jest.fn(
    (_player: unknown, event: string, handler: (p: unknown) => void) => {
      mockEventHandlers[event] = handler;
    }
  ),
}));

jest.mock('@/src/features/playback/offline/vtt', () => ({
  parseVtt: jest.fn(() => [{ start: 0, end: 20, text: 'Hello sub' }]),
  cueAtTime: jest.fn(() => ({ start: 0, end: 20, text: 'Hello sub' })),
}));

import { MediaPlayer } from '@/src/features/playback/MediaPlayer';
import * as FileSystem from 'expo-file-system/legacy';
import { t } from '@/src/shared/i18n';

describe('MediaPlayer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockEventHandlers).forEach((k) => delete mockEventHandlers[k]);
    mockPlayerState.currentTime = 10;
    mockPlayerState.duration = 100;
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(
      'WEBVTT\n\n00:00.000 --> 00:20.000\nHello sub\n'
    );
  });

  it('renders title and closes with progress', async () => {
    const onClose = jest.fn();
    const onProgress = jest.fn();
    await render(
      <MediaPlayer
        uri="file:///video.m3u8"
        title="Local"
        subtitlePath="file:///subs.vtt"
        onClose={onClose}
        onProgress={onProgress}
        initialPositionSec={5}
        enableBackgroundPlayback
      />
    );
    expect(screen.getByText('Local')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Hello sub')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('icon-text'));
    await fireEvent.press(screen.getByTestId('icon-chevron-back'));
    expect(onClose).toHaveBeenCalled();
    expect(onProgress).toHaveBeenCalled();
  });

  it('handles status error and uri swap', async () => {
    const { rerender } = await render(
      <MediaPlayer
        uri="https://cdn/a.m3u8"
        contentType="hls"
        title="Remote"
        headers={{ Origin: 'x' }}
      />
    );
    await act(async () => {
      mockEventHandlers.statusChange?.({ status: 'error', error: { message: 'boom' } });
    });
    await waitFor(() => expect(screen.getByText('boom')).toBeTruthy());

    await act(async () => {
      mockEventHandlers.statusChange?.({ status: 'readyToPlay' });
      mockEventHandlers.playingChange?.({ isPlaying: true });
      mockEventHandlers.playingChange?.({ isPlaying: false });
      mockEventHandlers.timeUpdate?.({ currentTime: 12 });
    });

    await rerender(
      <MediaPlayer uri="https://cdn/b.m3u8" contentType="progressive" title="Remote" />
    );
    await waitFor(() => expect(mockReplaceAsync).toHaveBeenCalled());
  });

  it('loads remote subtitle uri', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      text: async () => 'WEBVTT',
    })) as unknown as typeof fetch;
    await render(
      <MediaPlayer
        uri="https://cdn/a.m3u8"
        subtitleUri="https://cdn/subs.vtt"
        title="Subs"
      />
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  });

  it('shows default title when omitted', async () => {
    await render(<MediaPlayer uri="file:///x.mp4" contentType="progressive" />);
    expect(screen.getByText(t('common.player'))).toBeTruthy();
  });
});
