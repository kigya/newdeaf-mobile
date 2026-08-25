import {
  fetchHtmlViaWebView,
  handleWebViewHtmlFetchMessage,
  isWebViewHtmlFetcherReady,
  registerWebViewHtmlFetcher,
} from '@/src/shared/lib/webviewHtmlFetch';

describe('webviewHtmlFetch', () => {
  afterEach(() => {
    registerWebViewHtmlFetcher(null);
  });

  it('rejects when injector missing', async () => {
    expect(isWebViewHtmlFetcherReady()).toBe(false);
    await expect(fetchHtmlViaWebView('https://x', 'https://r/')).rejects.toThrow(
      'WebView HTML fetcher not ready'
    );
  });

  it('resolves HTML from injector message', async () => {
    registerWebViewHtmlFetcher((id) => {
      handleWebViewHtmlFetchMessage(
        JSON.stringify({ type: 'nd_html_fetch_result', id, html: '<html>ok</html>' })
      );
    });
    expect(isWebViewHtmlFetcherReady()).toBe(true);
    await expect(fetchHtmlViaWebView('https://x', 'https://r/')).resolves.toBe(
      '<html>ok</html>'
    );
  });

  it('rejects on injector error message and ignores foreign messages', async () => {
    expect(handleWebViewHtmlFetchMessage('not-json')).toBe(false);
    expect(
      handleWebViewHtmlFetchMessage(JSON.stringify({ type: 'other', id: '1' }))
    ).toBe(false);

    registerWebViewHtmlFetcher((id) => {
      handleWebViewHtmlFetchMessage(
        JSON.stringify({ type: 'nd_html_fetch_result', id, error: 'boom' })
      );
    });
    await expect(fetchHtmlViaWebView('https://x', 'https://r/')).rejects.toThrow('boom');
  });

  it('times out when injector never replies', async () => {
    jest.useFakeTimers();
    registerWebViewHtmlFetcher(() => {});
    const pending = expect(
      fetchHtmlViaWebView('https://x', 'https://r/', 1000)
    ).rejects.toThrow('WebView HTML fetch timeout');
    await jest.advanceTimersByTimeAsync(1000);
    await pending;
    jest.useRealTimers();
  });

  it('rejects when injector throws synchronously', async () => {
    registerWebViewHtmlFetcher(() => {
      throw new Error('inject fail');
    });
    await expect(fetchHtmlViaWebView('https://x', 'https://r/')).rejects.toThrow(
      'inject fail'
    );
  });

  it('passes playerUrl through to the injector', async () => {
    const seen: string[] = [];
    registerWebViewHtmlFetcher((id, url, referer, playerUrl) => {
      seen.push(url, referer, playerUrl);
      handleWebViewHtmlFetchMessage(
        JSON.stringify({ type: 'nd_html_fetch_result', id, html: 'ok' })
      );
    });
    await expect(
      fetchHtmlViaWebView('https://cdn/master.m3u8', 'https://r/', {
        playerUrl: 'https://api.embess.ws/embed/1',
      })
    ).resolves.toBe('ok');
    expect(seen).toEqual([
      'https://cdn/master.m3u8',
      'https://r/',
      'https://api.embess.ws/embed/1',
    ]);
  });

  it('assembles chunked HTML payloads', async () => {
    registerWebViewHtmlFetcher((id) => {
      expect(
        handleWebViewHtmlFetchMessage(
          JSON.stringify({ type: 'nd_html_fetch_status', id, phase: 'boot' })
        )
      ).toBe(false);
      expect(
        handleWebViewHtmlFetchMessage(
          JSON.stringify({
            type: 'nd_html_fetch_chunk',
            id,
            index: 0,
            count: 2,
            data: '<html>',
          })
        )
      ).toBe(false);
      expect(
        handleWebViewHtmlFetchMessage(
          JSON.stringify({
            type: 'nd_html_fetch_chunk',
            id,
            index: 1,
            count: 2,
            data: 'ok</html>',
          })
        )
      ).toBe(true);
    });
    await expect(fetchHtmlViaWebView('https://x', 'https://r/')).resolves.toBe(
      '<html>ok</html>'
    );
  });

  it('ignores chunk/result for unknown ids and missing fields', () => {
    expect(
      handleWebViewHtmlFetchMessage(JSON.stringify({ type: 'nd_html_fetch_chunk', id: 'missing' }))
    ).toBe(false);
    expect(
      handleWebViewHtmlFetchMessage(JSON.stringify({ type: 'nd_html_fetch_result' }))
    ).toBe(false);
    expect(
      handleWebViewHtmlFetchMessage(
        JSON.stringify({ type: 'nd_html_fetch_result', id: 'gone', html: 'x' })
      )
    ).toBe(false);
  });

  it('rejects non-Error injector throws', async () => {
    registerWebViewHtmlFetcher(() => {
      throw 'string-fail';
    });
    await expect(fetchHtmlViaWebView('https://x', 'https://r/')).rejects.toThrow('string-fail');
  });

  it('covers chunk/result default fields', async () => {
    registerWebViewHtmlFetcher((id) => {
      handleWebViewHtmlFetchMessage(
        JSON.stringify({ type: 'nd_html_fetch_chunk', id, count: 1 })
      );
    });
    await expect(fetchHtmlViaWebView('https://x', 'https://r/')).resolves.toBe('');

    registerWebViewHtmlFetcher((id) => {
      handleWebViewHtmlFetchMessage(
        JSON.stringify({ type: 'nd_html_fetch_result', id })
      );
    });
    await expect(fetchHtmlViaWebView('https://y', 'https://r/')).resolves.toBe('');
  });

  it('covers chunk data nullish coalescing both sides', async () => {
    registerWebViewHtmlFetcher((id) => {
      // omit count → defaults to 0 → chunk does not settle (returns false)
      expect(
        handleWebViewHtmlFetchMessage(
          JSON.stringify({
            type: 'nd_html_fetch_chunk',
            id,
            index: 0,
            data: 'orphan',
          })
        )
      ).toBe(false);
      handleWebViewHtmlFetchMessage(
        JSON.stringify({
          type: 'nd_html_fetch_chunk',
          id,
          index: 0,
          count: 1,
          data: 'present',
        })
      );
    });
    await expect(fetchHtmlViaWebView('https://u2', 'https://r/')).resolves.toBe('present');
  });

  it('fills missing chunk indices with empty strings when assembling', async () => {
    registerWebViewHtmlFetcher((id) => {
      handleWebViewHtmlFetchMessage(
        JSON.stringify({ type: 'nd_html_fetch_chunk', id, index: 0, count: 2, data: 'A' })
      );
      handleWebViewHtmlFetchMessage(
        JSON.stringify({ type: 'nd_html_fetch_chunk', id, index: 2, count: 2, data: 'C' })
      );
    });
    await expect(fetchHtmlViaWebView('https://gap', 'https://r/')).resolves.toBe('A');
  });
});
