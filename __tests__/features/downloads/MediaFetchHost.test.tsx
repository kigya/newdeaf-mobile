import React from 'react';
import { render, screen } from '@testing-library/react-native';

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
const mockSetReady = jest.fn();
const mockMediaFetchStoreState = {
  playerUrl: null as string | null,
  generation: 0,
  ready: false,
  setReady: mockSetReady,
  setPlayerUrl: jest.fn(),
};

jest.mock('@/src/features/downloads/mediaFetch', () => ({
  handleMediaFetchMessage: (...args: unknown[]) =>
    (mockHandleMediaFetchMessage as any)(...args),
  registerMediaFetchInjector: (...args: unknown[]) =>
    (mockRegisterMediaFetchInjector as any)(...args),
  getMediaFetchInjectorOwner: () => null,
  useMediaFetchStore: jest.fn((selector: (s: typeof mockMediaFetchStoreState) => unknown) =>
    selector(mockMediaFetchStoreState)
  ),
}));

import { MediaFetchHost } from '@/src/features/downloads/MediaFetchHost';
import { useMediaFetchStore } from '@/src/features/downloads/mediaFetch';

describe('MediaFetchHost', () => {
  beforeEach(() => {
    mockMediaFetchStoreState.playerUrl = null;
    mockMediaFetchStoreState.generation = 0;
    mockLastWebViewProps = {};
    mockInjectJavaScript.mockClear();
    mockRegisterMediaFetchInjector.mockClear();
    mockSetReady.mockClear();
    mockHandleMediaFetchMessage.mockReset();
    mockHandleMediaFetchMessage.mockReturnValue(false);
    (useMediaFetchStore as unknown as jest.Mock).mockImplementation(
      (selector: (s: typeof mockMediaFetchStoreState) => unknown) =>
        selector(mockMediaFetchStoreState)
    );
  });

  it('returns null without playerUrl', async () => {
    const { toJSON } = await render(<MediaFetchHost />);
    expect(toJSON()).toBeNull();
    expect(mockRegisterMediaFetchInjector).toHaveBeenCalledWith(null, 'host');
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

  it('injector posts with and without range', async () => {
    mockMediaFetchStoreState.playerUrl = 'https://player.example/"quoted"';
    const { unmount } = await render(<MediaFetchHost />);
    expect(screen.getByTestId('webview')).toBeTruthy();
    const injectorCall = mockRegisterMediaFetchInjector.mock.calls.find(
      (c) => typeof c[0] === 'function'
    );
    expect(injectorCall).toBeTruthy();
    const injector = injectorCall![0] as (
      id: string,
      url: string,
      mode: string,
      range?: unknown
    ) => void;
    injector('id1', 'https://cdn/x', 'bin', { offset: 0, length: 1 });
    injector('id2', 'https://cdn/y', 'text');
    expect(mockInjectJavaScript).toHaveBeenCalled();
    const onMessage = mockLastWebViewProps.onMessage as (e: {
      nativeEvent: { data: string };
    }) => void;
    mockHandleMediaFetchMessage.mockReturnValueOnce(true);
    onMessage({ nativeEvent: { data: JSON.stringify({ type: 'nd_fetch_result' }) } });
    mockHandleMediaFetchMessage.mockReturnValueOnce(false);
    onMessage({ nativeEvent: { data: JSON.stringify({ type: 'debug' }) } });
    onMessage({ nativeEvent: { data: 'nope' } });
    await unmount();
  });

  it('marks ready on iframe hook_ready for resolvable embeds only', async () => {
    mockMediaFetchStoreState.playerUrl = 'https://fsst.online/playlist_iframe/1/';
    await render(<MediaFetchHost />);
    const onMessage = mockLastWebViewProps.onMessage as (e: {
      nativeEvent: { data: string };
    }) => void;
    onMessage({
      nativeEvent: {
        data: JSON.stringify({ type: 'debug', message: 'hook_ready', url: 'false' }),
      },
    });
    expect(mockSetReady).not.toHaveBeenCalled();
    onMessage({
      nativeEvent: {
        data: JSON.stringify({ type: 'debug', message: 'hook_ready', url: 'true' }),
      },
    });
    expect(mockSetReady).toHaveBeenCalledWith(true);
  });
});
