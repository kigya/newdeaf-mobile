import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

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
const mockGetMediaFetchInjectorOwner = jest.fn(() => null);
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
  handleMediaFetchMessage: (...args: unknown[]) => mockHandleMediaFetchMessage(...args),
  registerMediaFetchInjector: (...args: unknown[]) =>
    mockRegisterMediaFetchInjector(...args),
  getMediaFetchInjectorOwner: () => mockGetMediaFetchInjectorOwner(),
  useMediaFetchStore: jest.fn((selector: (s: typeof mockMediaFetchStoreState) => unknown) =>
    selector(mockMediaFetchStoreState)
  ),
}));

const mockPrepareLocalPlaybackUri = jest.fn(async (path: string) => `file://${path}`);

jest.mock('@/src/features/playback/offline/prepareLocalSource', () => ({
  prepareLocalPlaybackUri: (...args: unknown[]) => mockPrepareLocalPlaybackUri(...args),
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
import { MediaFetchHost } from '@/src/features/downloads/MediaFetchHost';
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
});

describe('OfflinePlayer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});

describe('MediaFetchHost', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMediaFetchStoreState.playerUrl = null;
    mockMediaFetchStoreState.generation = 0;
  });

  it('returns null without playerUrl', async () => {
    const { toJSON } = await render(<MediaFetchHost />);
    expect(toJSON()).toBeNull();
  });

  it('renders webview and handles stream message', async () => {
    mockMediaFetchStoreState.playerUrl = 'https://player.example/p';
    await render(<MediaFetchHost />);
    expect(screen.getByTestId('webview')).toBeTruthy();
    expect(mockRegisterMediaFetchInjector).toHaveBeenCalled();
    const onMessage = mockLastWebViewProps.onMessage as (e: {
      nativeEvent: { data: string };
    }) => void;
    onMessage({
      nativeEvent: { data: JSON.stringify({ type: 'stream' }) },
    });
    expect(mockSetReady).toHaveBeenCalledWith(true);
  });
});
