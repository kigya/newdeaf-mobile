import {
  ensureMediaFetchPlayer,
  getMediaFetchInjectorOwner,
  handleMediaFetchMessage,
  isMediaFetchReady,
  registerMediaFetchInjector,
  useMediaFetchStore,
  waitUntilReady,
  webViewFetchBinary,
  webViewFetchText,
  withMediaFetchPlayer,
} from '@/src/features/downloads/mediaFetch';

describe('mediaFetch', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    registerMediaFetchInjector(null, getMediaFetchInjectorOwner() ?? 'default');
    useMediaFetchStore.setState({ playerUrl: null, ready: false, generation: 0 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('registerMediaFetchInjector respects owner', () => {
    const a = jest.fn();
    const b = jest.fn();
    registerMediaFetchInjector(a, 'sheet');
    expect(getMediaFetchInjectorOwner()).toBe('sheet');
    registerMediaFetchInjector(null, 'other');
    expect(getMediaFetchInjectorOwner()).toBe('sheet');
    registerMediaFetchInjector(b, 'host');
    expect(getMediaFetchInjectorOwner()).toBe('host');
    registerMediaFetchInjector(null, 'host');
    expect(getMediaFetchInjectorOwner()).toBeNull();
  });

  it('store setters and bumpGeneration', () => {
    useMediaFetchStore.getState().setPlayerUrl('https://p');
    expect(useMediaFetchStore.getState()).toMatchObject({
      playerUrl: 'https://p',
      ready: false,
    });
    useMediaFetchStore.getState().setReady(true);
    expect(useMediaFetchStore.getState().ready).toBe(true);
    useMediaFetchStore.getState().bumpGeneration();
    expect(useMediaFetchStore.getState().generation).toBe(1);
    expect(useMediaFetchStore.getState().ready).toBe(false);
  });

  it('handleMediaFetchMessage ignores non-result messages', () => {
    expect(handleMediaFetchMessage({ type: 'other' })).toBe(false);
    expect(handleMediaFetchMessage({ type: 'nd_fetch_result' })).toBe(false);
  });

  it('handleMediaFetchMessage resolves single chunk and rejects errors', async () => {
    const inject = jest.fn((id: string) => {
      setTimeout(() => {
        handleMediaFetchMessage({
          type: 'nd_fetch_result',
          id,
          status: 200,
          body: 'ok',
        });
      }, 0);
    });
    registerMediaFetchInjector(inject, 'host');
    useMediaFetchStore.setState({ playerUrl: 'https://p', ready: true });

    const p = webViewFetchText('https://cdn/x.m3u8', 5000);
    await jest.runOnlyPendingTimersAsync();
    await expect(p).resolves.toBe('ok');

    const injectErr = jest.fn((id: string) => {
      handleMediaFetchMessage({
        type: 'nd_fetch_result',
        id,
        error: 'boom',
      });
    });
    registerMediaFetchInjector(injectErr, 'host');
    await expect(webViewFetchText('https://cdn/y.m3u8', 5000)).rejects.toThrow('boom');
  });

  it('handleMediaFetchMessage joins multi-chunk bodies', async () => {
    jest.useRealTimers();
    const inject = jest.fn((id: string) => {
      handleMediaFetchMessage({
        type: 'nd_fetch_result',
        id,
        status: 200,
        body: 'aa',
        index: 0,
        count: 2,
        encoding: 'base64',
        contentLength: 4,
        byteLength: 3,
      });
      handleMediaFetchMessage({
        type: 'nd_fetch_result',
        id,
        status: 200,
        body: 'bb',
        index: 1,
        count: 2,
      });
    });
    registerMediaFetchInjector(inject, 'host');
    useMediaFetchStore.setState({ playerUrl: 'https://p', ready: true });

    const result = await webViewFetchBinary('https://cdn/seg', 5000);
    expect(result).toEqual({
      status: 200,
      base64: 'aabb',
      contentLength: 4,
      byteLength: 3,
    });
    jest.useFakeTimers();
  });

  it('handleMediaFetchMessage returns true for unknown pending id', () => {
    expect(
      handleMediaFetchMessage({ type: 'nd_fetch_result', id: 'missing', body: 'x' })
    ).toBe(true);
  });

  it('webViewFetchText throws on non-2xx', async () => {
    registerMediaFetchInjector((id) => {
      handleMediaFetchMessage({ type: 'nd_fetch_result', id, status: 403, body: '' });
    }, 'host');
    useMediaFetchStore.setState({ playerUrl: 'https://p', ready: true });
    await expect(webViewFetchText('https://x')).rejects.toThrow('Failed to fetch playlist: 403');
  });

  it('isMediaFetchReady checks injector and optional url', () => {
    expect(isMediaFetchReady()).toBe(false);
    registerMediaFetchInjector(jest.fn(), 'host');
    useMediaFetchStore.setState({ playerUrl: 'https://p', ready: true });
    expect(isMediaFetchReady()).toBe(true);
    expect(isMediaFetchReady('https://other')).toBe(false);
    expect(isMediaFetchReady('https://p')).toBe(true);
  });

  it('ensureMediaFetchPlayer waits until ready', async () => {
    registerMediaFetchInjector(jest.fn(), 'host');
    const p = ensureMediaFetchPlayer('https://player');
    expect(useMediaFetchStore.getState().playerUrl).toBe('https://player');
    useMediaFetchStore.getState().setReady(true);
    await jest.advanceTimersByTimeAsync(150);
    await expect(p).resolves.toBeUndefined();
  });

  it('ensureMediaFetchPlayer remounts when injector cleared for same url', async () => {
    registerMediaFetchInjector(jest.fn(), 'host');
    useMediaFetchStore.setState({ playerUrl: 'https://p', ready: true, generation: 0 });
    registerMediaFetchInjector(null, 'host');
    const p = ensureMediaFetchPlayer('https://p');
    expect(useMediaFetchStore.getState().generation).toBe(1);
    registerMediaFetchInjector(jest.fn(), 'host');
    useMediaFetchStore.setState({ playerUrl: 'https://p', ready: true });
    await jest.advanceTimersByTimeAsync(150);
    await expect(p).resolves.toBeUndefined();
  });

  it('withMediaFetchPlayer runs task when ready', async () => {
    registerMediaFetchInjector(jest.fn(), 'host');
    useMediaFetchStore.setState({ playerUrl: 'https://p', ready: true });
    const result = await withMediaFetchPlayer('https://p', async () => 42);
    expect(result).toBe(42);
  });

  it('times out when media fetch never becomes ready', async () => {
    const p = ensureMediaFetchPlayer('https://never');
    const assertion = expect(p).rejects.toThrow('WebView media fetch not ready');
    await jest.advanceTimersByTimeAsync(46000);
    await assertion;
  });

  it('webViewFetch times out when result never arrives', async () => {
    registerMediaFetchInjector(jest.fn(), 'host');
    useMediaFetchStore.setState({ playerUrl: 'https://p', ready: true });
    const p = webViewFetchText('https://cdn/slow', 1000);
    const assertion = expect(p).rejects.toThrow('WebView fetch timeout');
    await jest.advanceTimersByTimeAsync(1001);
    await assertion;
  });

  it('ensureMediaFetchPlayer returns immediately when already ready', async () => {
    registerMediaFetchInjector(jest.fn(), 'host');
    useMediaFetchStore.setState({ playerUrl: 'https://p', ready: true });
    await expect(ensureMediaFetchPlayer('https://p')).resolves.toBeUndefined();
  });

  it('withMediaFetchPlayer waits when already ready for url', async () => {
    registerMediaFetchInjector(jest.fn(), 'host');
    useMediaFetchStore.setState({ playerUrl: 'https://p', ready: true });
    await expect(withMediaFetchPlayer('https://p', async () => 'ok')).resolves.toBe('ok');
  });

  it('handleMediaFetchMessage ignores out-of-range chunk index', async () => {
    jest.useRealTimers();
    const inject = jest.fn((id: string) => {
      handleMediaFetchMessage({
        type: 'nd_fetch_result',
        id,
        status: 200,
        body: 'aa',
        index: -1,
        count: 2,
      });
      handleMediaFetchMessage({
        type: 'nd_fetch_result',
        id,
        status: 200,
        body: 'aa',
        index: 0,
        count: 2,
      });
      handleMediaFetchMessage({
        type: 'nd_fetch_result',
        id,
        status: 200,
        body: 'bb',
        index: 1,
        count: 2,
      });
    });
    registerMediaFetchInjector(inject, 'host');
    useMediaFetchStore.setState({ playerUrl: 'https://p', ready: true });
    const result = await webViewFetchBinary('https://cdn/seg', 5000);
    expect(result.base64).toBe('aabb');
    jest.useFakeTimers();
  });

  it('handleMediaFetchMessage defaults for missing status/body/index', async () => {
    jest.useRealTimers();
    registerMediaFetchInjector((id) => {
      handleMediaFetchMessage({
        type: 'nd_fetch_result',
        id,
        status: 200,
        // no body
      });
    }, 'host');
    useMediaFetchStore.setState({ playerUrl: 'https://p', ready: true });
    await expect(webViewFetchText('https://x')).resolves.toBe('');
    jest.useFakeTimers();
  });

  it('registerMediaFetchInjector default owner', () => {
    registerMediaFetchInjector(jest.fn());
    expect(getMediaFetchInjectorOwner()).toBe('default');
    registerMediaFetchInjector(null);
  });

  it('requestFetch throws when injector cleared after ready wait', async () => {
    jest.useRealTimers();
    registerMediaFetchInjector(jest.fn(), 'host');
    useMediaFetchStore.setState({ playerUrl: 'https://p', ready: true });
    const p = webViewFetchText('https://cdn/x');
    registerMediaFetchInjector(null, 'host');
    await expect(p).rejects.toThrow('WebView media fetch not ready');
    jest.useFakeTimers();
  });

  it('waitUntilReady rejects when expectedUrl mismatches', async () => {
    registerMediaFetchInjector(jest.fn(), 'host');
    useMediaFetchStore.setState({ playerUrl: 'https://other', ready: true });
    const p = ensureMediaFetchPlayer('https://wanted');
    const assertion = expect(p).rejects.toThrow('WebView media fetch not ready');
    await jest.advanceTimersByTimeAsync(46000);
    await assertion;
  });

  it('withMediaFetchPlayer ensures player when not ready', async () => {
    registerMediaFetchInjector(jest.fn(), 'host');
    useMediaFetchStore.setState({ playerUrl: null, ready: false });
    const p = withMediaFetchPlayer('https://new', async () => 'done');
    useMediaFetchStore.setState({ playerUrl: 'https://new', ready: true });
    await jest.advanceTimersByTimeAsync(150);
    await expect(p).resolves.toBe('done');
  });

  it('handleMediaFetchMessage defaults missing status to 0 for single and multi chunk', async () => {
    jest.useRealTimers();
    registerMediaFetchInjector((id) => {
      handleMediaFetchMessage({
        type: 'nd_fetch_result',
        id,
        // status omitted → ?? 0 (binary allows non-2xx status passthrough)
        body: 'solo',
      });
    }, 'host');
    useMediaFetchStore.setState({ playerUrl: 'https://p', ready: true });
    await expect(webViewFetchBinary('https://solo')).resolves.toMatchObject({
      status: 0,
      base64: 'solo',
    });

    const inject = jest.fn((id: string) => {
      handleMediaFetchMessage({
        type: 'nd_fetch_result',
        id,
        body: undefined, // ?? ''
        index: 0,
        count: 2,
      });
      handleMediaFetchMessage({
        type: 'nd_fetch_result',
        id,
        body: 'b',
        index: 1,
        count: 2,
      });
    });
    registerMediaFetchInjector(inject, 'host');
    const bin = await webViewFetchBinary('https://cdn/multi');
    expect(bin).toEqual({
      status: 0,
      base64: 'b',
      contentLength: undefined,
      byteLength: undefined,
    });
    jest.useFakeTimers();
  });

  it('waitUntilReady returns false while expectedUrl mismatches mid-wait', async () => {
    registerMediaFetchInjector(jest.fn(), 'host');
    useMediaFetchStore.setState({ playerUrl: null, ready: false });
    const p = ensureMediaFetchPlayer('https://wanted');
    // Mid-wait: ready for a different URL → L157 return false
    useMediaFetchStore.setState({ playerUrl: 'https://other', ready: true });
    await jest.advanceTimersByTimeAsync(250);
    useMediaFetchStore.setState({ playerUrl: 'https://wanted', ready: true });
    await jest.advanceTimersByTimeAsync(150);
    await expect(p).resolves.toBeUndefined();
  });

  it('webViewFetchBinary uses default timeout when omitted', async () => {
    jest.useRealTimers();
    registerMediaFetchInjector((id) => {
      handleMediaFetchMessage({
        type: 'nd_fetch_result',
        id,
        status: 200,
        body: 'bin',
        encoding: 'base64',
      });
    }, 'host');
    useMediaFetchStore.setState({ playerUrl: 'https://p', ready: true });
    await expect(webViewFetchBinary('https://cdn/default-timeout')).resolves.toMatchObject({
      status: 200,
      base64: 'bin',
    });
    jest.useFakeTimers();
  });

  it('waitUntilReady expectedUrl mismatch returns false until matched', async () => {
    registerMediaFetchInjector(jest.fn(), 'host');
    useMediaFetchStore.setState({ playerUrl: 'https://other', ready: true });
    const p = waitUntilReady(5000, 'https://wanted');
    await jest.advanceTimersByTimeAsync(250);
    useMediaFetchStore.setState({ playerUrl: 'https://wanted', ready: true });
    await jest.advanceTimersByTimeAsync(150);
    await expect(p).resolves.toBeUndefined();
  });
});
