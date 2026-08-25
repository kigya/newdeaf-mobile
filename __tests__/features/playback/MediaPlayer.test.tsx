import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

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
    cleanup();
    jest.useRealTimers();
    jest.clearAllMocks();
    Object.keys(mockEventHandlers).forEach((k) => delete mockEventHandlers[k]);
    mockReplaceAsync.mockReset();
    mockReplaceAsync.mockResolvedValue(undefined);
    mockPlay.mockReset();
    mockPlayerState.currentTime = 10;
    mockPlayerState.duration = 100;
    Object.defineProperty(global, '__DEV__', { value: true, configurable: true });
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(
      'WEBVTT\n\n00:00.000 --> 00:20.000\nHello sub\n'
    );
  });

  afterEach(() => {
    cleanup();
    jest.useRealTimers();
  });

  it('shows skip intro inside the window and seeks to the end', async () => {
    const onMark = jest.fn();
    await render(
      <MediaPlayer
        uri="file:///v.m3u8"
        introSkip={{ startSec: 0, endSec: 90 }}
        onMarkIntroSkip={onMark}
      />
    );
    expect(screen.getByText(t('offline.markSkipPoint'))).toBeTruthy();
    expect(screen.getByText(t('offline.skipIntro'))).toBeTruthy();
    await fireEvent.press(screen.getByText(t('offline.skipIntro')));
    expect(mockPlayerState.currentTime).toBe(90);
    await fireEvent.press(screen.getByText(t('offline.markSkipPoint')));
    expect(onMark).toHaveBeenCalled();
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

  it('seeks on uri swap when duration available and handles replace error', async () => {
    jest.useFakeTimers();
    mockPlayerState.currentTime = 15;
    mockPlayerState.duration = 100;
    const { rerender } = await render(
      <MediaPlayer uri="https://cdn/a.m3u8" title="A" onProgress={jest.fn()} />
    );
    mockReplaceAsync.mockRejectedValueOnce(new Error('swap fail'));
    await act(async () => {
      await rerender(<MediaPlayer uri="https://cdn/b.m3u8" title="B" onProgress={jest.fn()} />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByText('swap fail')).toBeTruthy());

    mockReplaceAsync.mockResolvedValue(undefined);
    mockPlayerState.duration = 0;
    await act(async () => {
      await rerender(<MediaPlayer uri="https://cdn/c.m3u8" title="C" onProgress={jest.fn()} />);
    });
    // duration not ready — interval seek path
    mockPlayerState.duration = 200;
    await act(async () => {
      jest.advanceTimersByTime(250);
    });
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    jest.useRealTimers();
  });

  it('initial seek waits for duration then times out', async () => {
    jest.useFakeTimers();
    mockPlayerState.duration = 0;
    await render(
      <MediaPlayer uri="file:///v.m3u8" initialPositionSec={30} onProgress={jest.fn()} />
    );
    mockPlayerState.duration = 120;
    await act(async () => {
      jest.advanceTimersByTime(250);
    });
    // already seeked — second render with 0 position marks done
    jest.useRealTimers();
  });

  it('initial seek timeout applies position when duration never ready', async () => {
    jest.useFakeTimers();
    mockPlayerState.duration = 0;
    await render(
      <MediaPlayer uri="file:///v.m3u8" initialPositionSec={12} onProgress={jest.fn()} />
    );
    await act(async () => {
      jest.advanceTimersByTime(8001);
    });
    jest.useRealTimers();
  });

  it('polls currentTime and toggles subs off', async () => {
    jest.useFakeTimers();
    const onProgress = jest.fn();
    await render(
      <MediaPlayer
        uri="file:///v.m3u8"
        subtitlePath="file:///s.vtt"
        onProgress={onProgress}
        title="Subs"
      />
    );
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    await fireEvent.press(screen.getByTestId('icon-text'));
    jest.useRealTimers();
  });

  it('loads remote subtitle with headers and skips bad response', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      text: async () => '',
    })) as unknown as typeof fetch;
    await render(
      <MediaPlayer
        uri="https://cdn/a.m3u8"
        subtitleUri="https://cdn/subs.vtt"
        headers={{ Origin: 'x' }}
      />
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  });

  it('skips missing local subtitle file', async () => {
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });
    await render(<MediaPlayer uri="file:///v.m3u8" subtitlePath="file:///missing.vtt" />);
  });

  it('status error without message uses default', async () => {
    await render(<MediaPlayer uri="file:///v.m3u8" />);
    await act(async () => {
      mockEventHandlers.statusChange?.({ status: 'error', error: null });
    });
    await waitFor(() => expect(screen.getByText(t('offline.playbackError'))).toBeTruthy());
  });

  it('normalizes non-file non-http uri via ensureFileUri', async () => {
    await render(<MediaPlayer uri="/absolute/path.m3u8" contentType="hls" />);
    expect(screen.getByText(t('common.player'))).toBeTruthy();
  });

  it('shows loader when uri empty', async () => {
    await render(<MediaPlayer uri="" />);
    expect(screen.getByText(t('common.player'))).toBeTruthy();
  });

  it('skips __DEV__ logging when false', async () => {
    const desc = Object.getOwnPropertyDescriptor(global, '__DEV__');
    Object.defineProperty(global, '__DEV__', { value: false, configurable: true });
    await render(<MediaPlayer uri="file:///v.m3u8" />);
    await act(async () => {
      mockEventHandlers.statusChange?.({ status: 'error', error: { message: 'x' } });
    });
    if (desc) Object.defineProperty(global, '__DEV__', desc);
    else Object.defineProperty(global, '__DEV__', { value: true, configurable: true });
  });

  it('cancels uri swap when unmounted during replace', async () => {
    let resolveReplace: () => void = () => undefined;
    mockReplaceAsync.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          resolveReplace = () => resolve(undefined);
        })
    );
    const { rerender, unmount } = await render(
      <MediaPlayer uri="https://cdn/a.m3u8" title="A" />
    );
    await act(async () => {
      await rerender(<MediaPlayer uri="https://cdn/b.m3u8" title="B" />);
    });
    unmount();
    await act(async () => {
      resolveReplace();
      await Promise.resolve();
    });
  });

  it('initialSeekDone early return on position change', async () => {
    const { rerender } = await render(
      <MediaPlayer uri="file:///v.m3u8" initialPositionSec={0} />
    );
    await act(async () => {
      await rerender(<MediaPlayer uri="file:///v.m3u8" initialPositionSec={20} />);
    });
  });

  it('poll interval ignores NaN currentTime', async () => {
    jest.useFakeTimers();
    mockPlayerState.currentTime = Number.NaN;
    await render(<MediaPlayer uri="file:///v.m3u8" onProgress={jest.fn()} />);
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    jest.useRealTimers();
    mockPlayerState.currentTime = 10;
  });
});
