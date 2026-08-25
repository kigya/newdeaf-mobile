import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

const LONG_HTML =
  '<html><body>file:[{"comment":"x","file":"[360p]https://cdn/x.mp4"}] makePlayer</body></html>';

const mockEnsure = jest.fn(async () => {});
const mockWebViewFetchText = jest.fn(async () => LONG_HTML);

jest.mock('@/src/features/downloads/mediaFetch', () => ({
  ensureMediaFetchPlayer: (playerUrl: string) => (mockEnsure as jest.Mock)(playerUrl),
  webViewFetchText: (url: string, timeoutMs?: number) =>
    (mockWebViewFetchText as jest.Mock)(url, timeoutMs),
}));

import { EmbedHtmlFetchHost } from '@/src/features/downloads/EmbedHtmlFetchHost';
import {
  fetchHtmlViaWebView,
  isWebViewHtmlFetcherReady,
  registerWebViewHtmlFetcher,
} from '@/src/shared/lib/webviewHtmlFetch';

describe('EmbedHtmlFetchHost', () => {
  beforeEach(() => {
    registerWebViewHtmlFetcher(null);
    mockEnsure.mockReset();
    mockWebViewFetchText.mockReset();
    mockEnsure.mockResolvedValue(undefined);
    mockWebViewFetchText.mockResolvedValue(LONG_HTML);
  });

  afterEach(() => {
    registerWebViewHtmlFetcher(null);
  });

  it('registers MediaFetch-backed HTML fetcher and resolves HTML', async () => {
    await render(<EmbedHtmlFetchHost />);
    await waitFor(() => expect(isWebViewHtmlFetcherReady()).toBe(true));
    await expect(
      fetchHtmlViaWebView('https://fsst.online/playlist_iframe/1/', 'https://newdeaf.top/', {
        playerUrl: 'https://fsst.online/playlist_iframe/1/',
      })
    ).resolves.toContain('file:');
    expect(mockEnsure).toHaveBeenCalledWith('https://fsst.online/playlist_iframe/1/');
    expect(mockWebViewFetchText).toHaveBeenCalled();
  });

  it('retries short HTML then reports error', async () => {
    mockWebViewFetchText
      .mockResolvedValueOnce('tiny')
      .mockResolvedValueOnce('tiny')
      .mockResolvedValueOnce('tiny');
    await render(<EmbedHtmlFetchHost />);
    await waitFor(() => expect(isWebViewHtmlFetcherReady()).toBe(true));
    await expect(
      fetchHtmlViaWebView('https://api.embess.ws/x', 'https://r/', { timeoutMs: 20000 })
    ).rejects.toThrow(/too short/);
  });

  it('surfaces ensureMediaFetchPlayer failures', async () => {
    mockEnsure.mockRejectedValueOnce(new Error('not ready'));
    await render(<EmbedHtmlFetchHost />);
    await waitFor(() => expect(isWebViewHtmlFetcherReady()).toBe(true));
    await expect(fetchHtmlViaWebView('https://x', 'https://r/')).rejects.toThrow('not ready');
  });

  it('retries after webViewFetchText throws', async () => {
    jest.useFakeTimers();
    mockWebViewFetchText
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce(LONG_HTML);
    await render(<EmbedHtmlFetchHost />);
    await waitFor(() => expect(isWebViewHtmlFetcherReady()).toBe(true));
    const pending = fetchHtmlViaWebView('https://x', 'https://r/', { timeoutMs: 20000 });
    await jest.advanceTimersByTimeAsync(2000);
    await expect(pending).resolves.toContain('file:');
    jest.useRealTimers();
  });

  it('stringifies non-Error fetch failures', async () => {
    mockWebViewFetchText
      .mockRejectedValueOnce('nope')
      .mockRejectedValueOnce('nope')
      .mockRejectedValueOnce('nope');
    await render(<EmbedHtmlFetchHost />);
    await waitFor(() => expect(isWebViewHtmlFetcherReady()).toBe(true));
    await expect(
      fetchHtmlViaWebView('https://x', 'https://r/', { timeoutMs: 30000 })
    ).rejects.toThrow('nope');
  }, 35000);

  it('covers optional playerUrl and empty html length branch', async () => {
    mockWebViewFetchText.mockResolvedValueOnce('');
    mockWebViewFetchText.mockResolvedValueOnce(LONG_HTML);
    await render(<EmbedHtmlFetchHost />);
    await waitFor(() => expect(isWebViewHtmlFetcherReady()).toBe(true));
    await expect(fetchHtmlViaWebView('https://cdn/master.m3u8', 'https://r/')).resolves.toContain(
      'file:'
    );
    expect(mockEnsure).toHaveBeenCalledWith('https://cdn/master.m3u8');
  });

  it('treats empty playerUrl as missing and null html as short', async () => {
    mockWebViewFetchText.mockResolvedValueOnce(null as unknown as string);
    mockWebViewFetchText.mockResolvedValueOnce(LONG_HTML);
    await render(<EmbedHtmlFetchHost />);
    await waitFor(() => expect(isWebViewHtmlFetcherReady()).toBe(true));
    await expect(
      fetchHtmlViaWebView('https://cdn/x', 'https://r/', { playerUrl: '' })
    ).resolves.toContain('file:');
    expect(mockEnsure).toHaveBeenCalledWith('https://cdn/x');
  });

  it('stringifies non-Error ensure failures', async () => {
    mockEnsure.mockRejectedValueOnce(404);
    await render(<EmbedHtmlFetchHost />);
    await waitFor(() => expect(isWebViewHtmlFetcherReady()).toBe(true));
    await expect(fetchHtmlViaWebView('https://x', 'https://r/')).rejects.toThrow('404');
  });
});
