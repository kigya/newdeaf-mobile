import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockInjectJavaScript = jest.fn();
let mockLastWebViewProps: Record<string, unknown> = {};

jest.mock('react-native-webview', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return {
    WebView: ReactLocal.forwardRef(
      (props: Record<string, unknown>, ref: React.Ref<unknown>) => {
        mockLastWebViewProps = props;
        ReactLocal.useImperativeHandle(ref, () => ({
          injectJavaScript: mockInjectJavaScript,
        }));
        return ReactLocal.createElement(View, { testID: 'webview' });
      }
    ),
  };
});

const mockHandleMediaFetchMessage = jest.fn(() => false);
const mockRegisterMediaFetchInjector = jest.fn();
const mockGetMediaFetchInjectorOwner = jest.fn((): string | null => null);
const mockSetReady = jest.fn();
const mockSetPlayerUrl = jest.fn();
const mockMediaFetchStoreState = {
  playerUrl: null as string | null,
  generation: 0,
  ready: false,
  setReady: mockSetReady,
  setPlayerUrl: mockSetPlayerUrl,
};

jest.mock('@/src/features/downloads/mediaFetch', () => ({
  handleMediaFetchMessage: (...args: unknown[]) =>
    (mockHandleMediaFetchMessage as any)(...args),
  registerMediaFetchInjector: (...args: unknown[]) =>
    (mockRegisterMediaFetchInjector as any)(...args),
  getMediaFetchInjectorOwner: () => mockGetMediaFetchInjectorOwner(),
  useMediaFetchStore: jest.fn((selector: (s: typeof mockMediaFetchStoreState) => unknown) =>
    selector(mockMediaFetchStoreState)
  ),
}));

const mockPrepareLocalPlaybackUri = jest.fn(async (path: string) => `file://${path}`);

jest.mock('@/src/features/playback/offline/prepareLocalSource', () => ({
  prepareLocalPlaybackUri: (...args: unknown[]) =>
    (mockPrepareLocalPlaybackUri as any)(...args),
  ensureFileUri: (p: string) => (p.startsWith('file:') ? p : `file://${p}`),
}));

jest.mock('@/src/features/playback/MediaPlayer', () => ({
  MediaPlayer: (props: { title?: string; onClose?: () => void }) => {
    const ReactLocal = require('react');
    const { Pressable, Text } = require('react-native');
    return ReactLocal.createElement(
      Pressable,
      { testID: 'media-player', onPress: props.onClose },
      ReactLocal.createElement(Text, null, props.title ?? 'media')
    );
  },
}));

import { PlayerWebView } from '@/src/features/playback/PlayerWebView';
import { StreamResolver } from '@/src/features/playback/StreamResolver';
import { OfflinePlayer } from '@/src/features/playback/offline/OfflinePlayer';
import { t } from '@/src/shared/i18n';

describe('PlayerWebView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLastWebViewProps = {};
  });

  it('renders watch mode and handles messages', async () => {
    const onReady = jest.fn();
    const onProgress = jest.fn();
    const onError = jest.fn();
    const onStream = jest.fn();
    const onStatus = jest.fn();
    await render(
      <PlayerWebView
        playerUrl="https://player.example/p"
        mode="watch"
        onReady={onReady}
        onProgress={onProgress}
        onError={onError}
        onStream={onStream}
        onStatus={onStatus}
      />
    );
    expect(screen.getByTestId('webview')).toBeTruthy();
    const onMessage = mockLastWebViewProps.onMessage as (e: {
      nativeEvent: { data: string };
    }) => void;
    onMessage({ nativeEvent: { data: JSON.stringify({ type: 'ready' }) } });
    expect(onReady).toHaveBeenCalled();
    onMessage({
      nativeEvent: {
        data: JSON.stringify({ type: 'progress', currentTime: 12, duration: 100 }),
      },
    });
    expect(onProgress).toHaveBeenCalledWith({ currentTime: 12, duration: 100 });
    onMessage({
      nativeEvent: { data: JSON.stringify({ type: 'debug', message: 'hook_ready' }) },
    });
    expect(onStatus).toHaveBeenCalledWith(t('player.resolving'));
    onMessage({
      nativeEvent: { data: JSON.stringify({ type: 'debug', message: 'bnsi_ok' }) },
    });
    expect(onStatus).toHaveBeenCalledWith(t('player.resolved'));
    onMessage({
      nativeEvent: { data: JSON.stringify({ type: 'error', message: 'fail' }) },
    });
    expect(onError).toHaveBeenCalledWith('fail');
    onMessage({
      nativeEvent: {
        data: JSON.stringify({
          type: 'stream',
          data: { hlsSource: [{ label: 'a', quality: {} }], tracks: [] },
        }),
      },
    });
    expect(onStream).toHaveBeenCalled();
    (mockLastWebViewProps.onLoadEnd as () => void)();
  });

  it('registers media fetch injector in resolve mode', async () => {
    const { unmount } = await render(
      <PlayerWebView playerUrl="https://player.example/p" mode="resolve" mediaFetch />
    );
    expect(mockRegisterMediaFetchInjector).toHaveBeenCalled();
    expect(mockSetPlayerUrl).toHaveBeenCalledWith('https://player.example/p');
    const injector = mockRegisterMediaFetchInjector.mock.calls[0][0] as (
      id: string,
      url: string,
      mode: string
    ) => void;
    injector('1', 'https://cdn/x', 'text');
    expect(mockInjectJavaScript).toHaveBeenCalled();
    await unmount();
  });

  it('resolve mode onLoadEnd sets status and mediaFetch stream sets ready', async () => {
    const onStatus = jest.fn();
    const onStream = jest.fn();
    await render(
      <PlayerWebView
        playerUrl='https://player.example/"p"'
        mode="resolve"
        mediaFetch
        onStatus={onStatus}
        onStream={onStream}
      />
    );
    (mockLastWebViewProps.onLoadEnd as () => void)();
    expect(onStatus).toHaveBeenCalledWith(t('player.resolving'));
    const onMessage = mockLastWebViewProps.onMessage as (e: {
      nativeEvent: { data: string };
    }) => void;
    mockHandleMediaFetchMessage.mockReturnValueOnce(true);
    onMessage({ nativeEvent: { data: JSON.stringify({ type: 'nd_fetch_result' }) } });
    onMessage({ nativeEvent: { data: 'not-json' } });
    onMessage({
      nativeEvent: {
        data: JSON.stringify({
          type: 'stream',
          data: { hlsSource: [{ label: 'a', quality: {} }], tracks: [] },
        }),
      },
    });
    expect(mockSetReady).toHaveBeenCalledWith(true);
    expect(onStream).toHaveBeenCalled();
    // second stream ignored
    onMessage({
      nativeEvent: {
        data: JSON.stringify({
          type: 'stream',
          data: { hlsSource: [{ label: 'a', quality: {} }], tracks: [] },
        }),
      },
    });
    expect(onStream).toHaveBeenCalledTimes(1);
  });

  it('progress ignores non-finite currentTime and error without message', async () => {
    const onProgress = jest.fn();
    const onError = jest.fn();
    await render(
      <PlayerWebView
        playerUrl="https://player"
        mode="watch"
        onProgress={onProgress}
        onError={onError}
      />
    );
    const onMessage = mockLastWebViewProps.onMessage as (e: {
      nativeEvent: { data: string };
    }) => void;
    onMessage({
      nativeEvent: { data: JSON.stringify({ type: 'progress', currentTime: 0 }) },
    });
    expect(onProgress).not.toHaveBeenCalled();
    onMessage({
      nativeEvent: {
        data: JSON.stringify({ type: 'progress', currentTime: 5, duration: null }),
      },
    });
    expect(onProgress).toHaveBeenCalledWith({ currentTime: 5, duration: undefined });
    onMessage({ nativeEvent: { data: JSON.stringify({ type: 'error' }) } });
    expect(onError).toHaveBeenCalledWith(t('player.error'));
  });

  it('unmount clears ready only when injector owner null', async () => {
    mockGetMediaFetchInjectorOwner.mockReturnValue(null);
    const { unmount } = await render(
      <PlayerWebView playerUrl="https://player" mode="resolve" mediaFetch />
    );
    await unmount();
    expect(mockSetReady).toHaveBeenCalledWith(false);
  });

  it('unmount skips setReady when injector owner remains', async () => {
    mockGetMediaFetchInjectorOwner.mockReturnValue('host');
    const { unmount } = await render(
      <PlayerWebView playerUrl="https://player" mode="resolve" mediaFetch />
    );
    mockSetReady.mockClear();
    await unmount();
    expect(mockSetReady).not.toHaveBeenCalled();
  });

  it('uses default watch mode and ignores non-matching stream/debug', async () => {
    const onStream = jest.fn();
    const onStatus = jest.fn();
    await render(
      <PlayerWebView playerUrl="https://player" onStream={onStream} onStatus={onStatus} />
    );
    const onMessage = mockLastWebViewProps.onMessage as (e: {
      nativeEvent: { data: string };
    }) => void;
    onMessage({
      nativeEvent: { data: JSON.stringify({ type: 'debug', message: 'other' }) },
    });
    expect(onStatus).not.toHaveBeenCalled();
    onMessage({
      nativeEvent: {
        data: JSON.stringify({ type: 'stream', data: { hlsSource: [], tracks: [] } }),
      },
    });
    onMessage({
      nativeEvent: {
        data: JSON.stringify({ type: 'stream' }),
      },
    });
    expect(onStream).not.toHaveBeenCalled();
  });
});

describe('StreamResolver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('forwards stream resolve from PlayerWebView', async () => {
    const onResolved = jest.fn();
    await render(
      <StreamResolver playerUrl="https://player" onResolved={onResolved} timeoutMs={5000} />
    );
    expect(screen.getByText(t('player.resolving'))).toBeTruthy();
    const onMessage = mockLastWebViewProps.onMessage as (e: {
      nativeEvent: { data: string };
    }) => void;
    onMessage({ nativeEvent: { data: JSON.stringify({ type: 'ready' }) } });
    onMessage({
      nativeEvent: {
        data: JSON.stringify({
          type: 'stream',
          data: { hlsSource: [{ label: 'a', quality: { '720': 'u' } }], tracks: [] },
        }),
      },
    });
    expect(onResolved).toHaveBeenCalled();
  });

  it('times out when no stream', async () => {
    const onError = jest.fn();
    await render(
      <StreamResolver
        playerUrl="https://player"
        onResolved={jest.fn()}
        onError={onError}
        timeoutMs={1000}
      />
    );
    jest.advanceTimersByTime(1001);
    expect(onError).toHaveBeenCalledWith(t('player.timeout'));
  });

  it('ignores stream and error after done', async () => {
    const onResolved = jest.fn();
    const onError = jest.fn();
    await render(
      <StreamResolver
        playerUrl="https://player"
        onResolved={onResolved}
        onError={onError}
        timeoutMs={5000}
      />
    );
    const onMessage = mockLastWebViewProps.onMessage as (e: {
      nativeEvent: { data: string };
    }) => void;
    onMessage({
      nativeEvent: {
        data: JSON.stringify({
          type: 'stream',
          data: { hlsSource: [{ label: 'a', quality: { '720': 'u' } }], tracks: [] },
        }),
      },
    });
    onMessage({
      nativeEvent: {
        data: JSON.stringify({
          type: 'stream',
          data: { hlsSource: [{ label: 'b', quality: { '720': 'u' } }], tracks: [] },
        }),
      },
    });
    expect(onResolved).toHaveBeenCalledTimes(1);
    onMessage({
      nativeEvent: { data: JSON.stringify({ type: 'error', message: 'late' }) },
    });
    expect(onError).not.toHaveBeenCalled();
  });

  it('forwards PlayerWebView error before done', async () => {
    const onError = jest.fn();
    await render(
      <StreamResolver
        playerUrl="https://player"
        onResolved={jest.fn()}
        onError={onError}
        timeoutMs={5000}
      />
    );
    const onMessage = mockLastWebViewProps.onMessage as (e: {
      nativeEvent: { data: string };
    }) => void;
    onMessage({
      nativeEvent: { data: JSON.stringify({ type: 'error', message: 'boom' }) },
    });
    expect(onError).toHaveBeenCalledWith('boom');
  });

  it('uses default timeout and mediaFetch defaults', async () => {
    const onResolved = jest.fn();
    await render(<StreamResolver playerUrl="https://player" onResolved={onResolved} />);
    expect(screen.getByText(t('player.resolving'))).toBeTruthy();
  });

  it('timeout no-ops when already done', async () => {
    const onError = jest.fn();
    const onResolved = jest.fn();
    await render(
      <StreamResolver
        playerUrl="https://player"
        onResolved={onResolved}
        onError={onError}
        timeoutMs={1000}
      />
    );
    const onMessage = mockLastWebViewProps.onMessage as (e: {
      nativeEvent: { data: string };
    }) => void;
    onMessage({
      nativeEvent: {
        data: JSON.stringify({
          type: 'stream',
          data: { hlsSource: [{ label: 'a', quality: { '720': 'u' } }], tracks: [] },
        }),
      },
    });
    jest.advanceTimersByTime(1001);
    expect(onError).not.toHaveBeenCalled();
  });
});

describe('OfflinePlayer', () => {
  beforeEach(() => {
    mockPrepareLocalPlaybackUri.mockReset();
    mockPrepareLocalPlaybackUri.mockResolvedValue('file:///ready.m3u8');
  });

  it('prepares uri and renders MediaPlayer', async () => {
    await render(
      <OfflinePlayer playlistPath="/local/playlist.m3u8" title="Offline" mediaKind="hls" />
    );
    await waitFor(() => expect(screen.getByText('Offline')).toBeTruthy());
  });

  it('shows prepare error', async () => {
    mockPrepareLocalPlaybackUri.mockRejectedValueOnce(new Error('prep failed'));
    await render(<OfflinePlayer playlistPath="/bad" />);
    await waitFor(() => expect(screen.getByText('prep failed')).toBeTruthy());
  });

  it('ignores prepare result and error after unmount', async () => {
    const lateResolvers: Array<(v: string) => void> = [];
    mockPrepareLocalPlaybackUri.mockImplementation((path: string) => {
      if (path === '/slow' || path === '/slow-err') {
        return new Promise((resolve, reject) => {
          lateResolvers.push((v: string) => {
            if (v.startsWith('err:')) reject(new Error(v.slice(4)));
            else resolve(v);
          });
        });
      }
      return Promise.resolve(`file://${path}`);
    });

    const view = await render(<OfflinePlayer playlistPath="/slow" title="A" />);
    expect(lateResolvers.length).toBeGreaterThan(0);
    const pending = lateResolvers.splice(0);
    // Changing path cancels the in-flight prepare for /slow
    view.rerender(<OfflinePlayer playlistPath="/ready-path" title="B" />);
    await waitFor(() => expect(screen.getByText('B')).toBeTruthy());
    await act(async () => {
      for (const resolve of pending) resolve('file:///late.m3u8');
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByText('A')).toBeNull();

    const errPending: Array<(v: string) => void> = [];
    mockPrepareLocalPlaybackUri.mockImplementation((path: string) => {
      if (path === '/slow-err') {
        return new Promise((_resolve, reject) => {
          errPending.push((v: string) => reject(new Error(v)));
        });
      }
      return Promise.resolve(`file://${path}`);
    });
    view.rerender(<OfflinePlayer playlistPath="/slow-err" title="C" />);
    await waitFor(() => expect(errPending.length).toBeGreaterThan(0));
    const toReject = errPending.splice(0);
    view.rerender(<OfflinePlayer playlistPath="/ready-path-2" title="D" />);
    await waitFor(() => expect(screen.getByText('D')).toBeTruthy());
    await act(async () => {
      for (const reject of toReject) reject('late');
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByText('late')).toBeNull();
  });
});
