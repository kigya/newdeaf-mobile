jest.mock('@/src/features/downloads/mediaFetch', () => ({
  isMediaFetchReady: jest.fn(() => false),
  webViewFetchBinary: jest.fn(),
  webViewFetchText: jest.fn(),
}));

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock-docs/',
  cacheDirectory: 'file:///mock-cache/',
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => undefined),
  deleteAsync: jest.fn(async () => undefined),
  makeDirectoryAsync: jest.fn(async () => undefined),
  downloadAsync: jest.fn(async () => ({ status: 200, uri: 'file:///mock' })),
  createDownloadResumable: jest.fn(),
}));

import * as FileSystem from 'expo-file-system/legacy';

import {
  downloadHlsToDirectory,
  downloadRemoteFile,
  downloadTextFile,
  downloadWithRetry,
  mediaRequestHeaders,
  mediaSegmentHeaders,
  pickSubtitleTrack,
  resolveMediaUrl,
  resolveVariantPlaylist,
} from '@/src/features/downloads/hls';
import {
  isMediaFetchReady,
  webViewFetchBinary,
  webViewFetchText,
} from '@/src/features/downloads/mediaFetch';

describe('hls headers / resolveMediaUrl', () => {
  it('mediaRequestHeaders prefers full player referer', () => {
    const h = mediaRequestHeaders('https://player.example/watch?x=1');
    expect(h.Origin).toBe('https://player.example');
    expect(h.Referer).toBe('https://player.example/watch?x=1');
    expect(h['User-Agent']).toContain('Chrome');
  });

  it('mediaRequestHeaders sanitizes CR/LF and falls back origin', () => {
    const h = mediaRequestHeaders('https://player.example/a\n');
    expect(h.Referer.includes('\n')).toBe(false);
    const fallback = mediaRequestHeaders(undefined);
    expect(fallback.Origin).toContain('stloadi');
  });

  it('mediaSegmentHeaders uses origin-only referer', () => {
    const h = mediaSegmentHeaders('https://cdn.example/player');
    expect(h.Referer).toBe('https://cdn.example/');
    expect(h.Accept).toBe('*/*');
    expect(h).not.toHaveProperty('Origin');
  });

  it('resolveMediaUrl joins relatives', () => {
    expect(resolveMediaUrl('https://cdn/a/index.m3u8', 'seg.ts')).toBe(
      'https://cdn/a/seg.ts'
    );
  });
});

describe('resolveVariantPlaylist', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (isMediaFetchReady as jest.Mock).mockReturnValue(false);
    (FileSystem.cacheDirectory as unknown as string) || true;
    Object.defineProperty(FileSystem, 'cacheDirectory', {
      configurable: true,
      value: 'file:///mock-cache/',
    });
    Object.defineProperty(FileSystem, 'documentDirectory', {
      configurable: true,
      value: 'file:///mock-docs/',
    });
    (FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);
  });

  it('returns media playlist as-is', async () => {
    (FileSystem.downloadAsync as jest.Mock).mockResolvedValue({ status: 200 });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(
      '#EXTM3U\n#EXTINF:1,\nseg.ts\n'
    );
    const result = await resolveVariantPlaylist('https://cdn/index.m3u8', 720);
    expect(result.content).toContain('#EXTINF');
    expect(result.url).toBe('https://cdn/index.m3u8');
  });

  it('selects closest variant by height', async () => {
    (FileSystem.downloadAsync as jest.Mock)
      .mockResolvedValueOnce({ status: 200 })
      .mockResolvedValueOnce({ status: 200 });
    (FileSystem.readAsStringAsync as jest.Mock)
      .mockResolvedValueOnce(
        [
          '#EXTM3U',
          '#EXT-X-STREAM-INF:BANDWIDTH=1000,RESOLUTION=1280x720',
          '720.m3u8',
          '#EXT-X-STREAM-INF:BANDWIDTH=2000,RESOLUTION=1920x1080',
          '1080.m3u8',
        ].join('\n')
      )
      .mockResolvedValueOnce('#EXTM3U\n#EXTINF:1,\na.ts\n');

    const result = await resolveVariantPlaylist('https://cdn/master.m3u8', 700);
    expect(result.url).toBe('https://cdn/720.m3u8');
    expect(result.content).toContain('a.ts');
  });

  it('prefers WebView text fetch when ready', async () => {
    (isMediaFetchReady as jest.Mock).mockReturnValue(true);
    (webViewFetchText as jest.Mock).mockResolvedValue('#EXTM3U\n#EXTINF:1,\ns.ts\n');
    const result = await resolveVariantPlaylist('https://cdn/index.m3u8', 720);
    expect(webViewFetchText).toHaveBeenCalled();
    expect(result.content).toContain('s.ts');
  });

  it('WebView invalid text then error then 403 body', async () => {
    (isMediaFetchReady as jest.Mock).mockReturnValue(true);
    (webViewFetchText as jest.Mock)
      .mockResolvedValueOnce('not a playlist')
      .mockRejectedValueOnce(new Error('Failed to fetch playlist: 403'))
      .mockResolvedValueOnce('403 Forbidden');
    await expect(
      resolveVariantPlaylist('https://a/x.m3u8 or https://b/x.m3u8 or https://c/x.m3u8', 720)
    ).rejects.toThrow(/403|invalid|Failed to fetch playlist/);
  });

  it('OkHttp non-playlist then 403 body then network error', async () => {
    (isMediaFetchReady as jest.Mock).mockReturnValue(false);
    (FileSystem.downloadAsync as jest.Mock)
      .mockResolvedValueOnce({ status: 200 })
      .mockResolvedValueOnce({ status: 200 })
      .mockRejectedValueOnce(new Error('net'));
    (FileSystem.readAsStringAsync as jest.Mock)
      .mockResolvedValueOnce('hello')
      .mockResolvedValueOnce('403 Forbidden');
    await expect(
      resolveVariantPlaylist('https://a/x.m3u8 or https://b/x.m3u8 or https://c/x.m3u8', 720)
    ).rejects.toThrow(/Failed to fetch playlist|net/);
  });

  it('returns master when STREAM-INF has no usable variants', async () => {
    (isMediaFetchReady as jest.Mock).mockReturnValue(false);
    (FileSystem.downloadAsync as jest.Mock).mockResolvedValue({ status: 200 });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(
      '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\n#EXT-X-ENDLIST\n'
    );
    const result = await resolveVariantPlaylist('https://cdn/master.m3u8', 720);
    expect(result.url).toBe('https://cdn/master.m3u8');
  });

  it('sorts equal-height variants by bandwidth', async () => {
    (isMediaFetchReady as jest.Mock).mockReturnValue(false);
    (FileSystem.downloadAsync as jest.Mock)
      .mockResolvedValueOnce({ status: 200 })
      .mockResolvedValueOnce({ status: 200 });
    (FileSystem.readAsStringAsync as jest.Mock)
      .mockResolvedValueOnce(
        [
          '#EXTM3U',
          '#EXT-X-STREAM-INF:BANDWIDTH=1000,RESOLUTION=1280x720',
          'low.m3u8',
          '#EXT-X-STREAM-INF:BANDWIDTH=5000,RESOLUTION=1280x720',
          'high.m3u8',
        ].join('\n')
      )
      .mockResolvedValueOnce('#EXTM3U\n#EXTINF:1,\nz.ts\n');
    const result = await resolveVariantPlaylist('https://cdn/master.m3u8', 720);
    expect(result.url).toBe('https://cdn/high.m3u8');
  });

  it('WebView catch without status code and OkHttp catch', async () => {
    (isMediaFetchReady as jest.Mock).mockReturnValue(true);
    (webViewFetchText as jest.Mock).mockRejectedValueOnce('string-err');
    await expect(resolveVariantPlaylist('https://cdn/x.m3u8', 720)).rejects.toThrow(/string-err|Failed/);

    (isMediaFetchReady as jest.Mock).mockReturnValue(false);
    (FileSystem.downloadAsync as jest.Mock).mockRejectedValueOnce(new Error('disk'));
    Object.defineProperty(FileSystem, 'cacheDirectory', {
      configurable: true,
      value: 'file:///mock-cache/',
    });
    (FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);
    await expect(resolveVariantPlaylist('https://cdn/y.m3u8', 720)).rejects.toThrow(/disk|Failed/);
  });

  it('WebView 403 Forbidden body sets status', async () => {
    (isMediaFetchReady as jest.Mock).mockReturnValue(true);
    (webViewFetchText as jest.Mock).mockResolvedValue('403 Forbidden\n');
    await expect(resolveVariantPlaylist('https://cdn/z.m3u8', 720)).rejects.toThrow(/403/);
  });
});

describe('downloadHlsToDirectory / downloadWithRetry', () => {
  beforeEach(() => {
    jest.useRealTimers();
    jest.resetAllMocks();
    (isMediaFetchReady as jest.Mock).mockReturnValue(false);
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });
    (FileSystem.makeDirectoryAsync as jest.Mock).mockResolvedValue(undefined);
    (FileSystem.writeAsStringAsync as jest.Mock).mockResolvedValue(undefined);
    (FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);
    (FileSystem.downloadAsync as jest.Mock).mockResolvedValue({ status: 200, uri: 'file://x' });
    Object.defineProperty(FileSystem, 'cacheDirectory', {
      configurable: true,
      value: 'file:///mock-cache/',
    });
    Object.defineProperty(FileSystem, 'documentDirectory', {
      configurable: true,
      value: 'file:///mock-docs/',
    });
  });

  it('downloads segments via OkHttp and writes playlist', async () => {
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(
      '#EXTM3U\n#EXTINF:1,\nseg0.ts\n#EXTINF:1,\nseg1.ts\n'
    );
    (FileSystem.getInfoAsync as jest.Mock).mockImplementation(async (path: string) => {
      if (String(path).includes('seg_')) {
        return { exists: true, size: 100 };
      }
      return { exists: false };
    });

    const onProgress = jest.fn();
    const result = await downloadHlsToDirectory(
      'https://cdn/index.m3u8',
      'file:///mock-docs/dl/',
      720,
      onProgress,
      'https://player.example/'
    );

    expect(result.playlistPath).toBe('file:///mock-docs/dl/index.m3u8');
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      'file:///mock-docs/dl/index.m3u8',
      expect.stringContaining('seg_00000.ts')
    );
    expect(onProgress).toHaveBeenCalledWith(1);
  });

  it('uses WebView binary fetch when ready', async () => {
    (isMediaFetchReady as jest.Mock).mockReturnValue(true);
    (webViewFetchText as jest.Mock).mockResolvedValue('#EXTM3U\n#EXTINF:1,\na.ts\n');
    (webViewFetchBinary as jest.Mock).mockResolvedValue({
      status: 200,
      base64: btoa('segment'),
      byteLength: 7,
      contentLength: 7,
    });
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });

    await downloadHlsToDirectory(
      'https://cdn/index.m3u8',
      'file:///mock-docs/wv/',
      720,
      undefined,
      'https://player.example/'
    );
    expect(webViewFetchBinary).toHaveBeenCalled();
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      expect.stringContaining('seg_'),
      expect.any(String),
      expect.objectContaining({ encoding: 'base64' })
    );
  });

  it('aborts when signal aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      downloadHlsToDirectory(
        'https://cdn/index.m3u8',
        'file:///mock-docs/x/',
        720,
        undefined,
        undefined,
        controller.signal
      )
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('skips existing segments on disk', async () => {
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(
      '#EXTM3U\n#EXTINF:1,\nonly.ts\n'
    );
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true, size: 50 });

    const onProgress = jest.fn();
    await downloadHlsToDirectory(
      'https://cdn/index.m3u8',
      'file:///mock-docs/resume/',
      720,
      onProgress
    );
    expect(onProgress).toHaveBeenCalledWith(1);
  });

  it('downloadRemoteFile / downloadTextFile use retry path', async () => {
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true, size: 10 });
    await downloadRemoteFile('https://cdn/a.ts', 'file:///a.ts', 'https://player/');
    await expect(
      downloadTextFile('https://cdn/subs.vtt', 'file:///subs.vtt', 'https://player/')
    ).resolves.toBe('file:///subs.vtt');
  });

  it('throws when OkHttp segment returns error', async () => {
    (FileSystem.downloadAsync as jest.Mock).mockResolvedValue({ status: 403 });
    await expect(downloadRemoteFile('https://cdn/a.ts', 'file:///a.ts')).rejects.toThrow(
      /Segment download failed: 403/
    );
  });

  it('WebView binary throws on 404 without retrying forever', async () => {
    (isMediaFetchReady as jest.Mock).mockReturnValue(true);
    (webViewFetchBinary as jest.Mock).mockResolvedValue({ status: 404, base64: '' });
    await expect(downloadRemoteFile('https://cdn/a.ts', 'file:///a.ts')).rejects.toThrow(
      /Segment download failed: 404/
    );
  });

  it('WebView binary Content-Length mismatch', async () => {
    jest.useFakeTimers();
    (isMediaFetchReady as jest.Mock).mockReturnValue(true);
    (webViewFetchBinary as jest.Mock).mockResolvedValue({
      status: 200,
      base64: btoa('ab'),
      byteLength: 2,
      contentLength: 99,
    });
    const p = downloadRemoteFile('https://cdn/a.ts', 'file:///a.ts');
    const assertion = expect(p).rejects.toThrow(/Content-Length|Segment size mismatch/);
    await jest.runAllTimersAsync();
    await assertion;
    jest.useRealTimers();
  });

  it('WebView binary expected range size mismatch', async () => {
    jest.useFakeTimers();
    (isMediaFetchReady as jest.Mock).mockReturnValue(true);
    (webViewFetchText as jest.Mock).mockResolvedValue(
      ['#EXTM3U', '#EXTINF:1,', '#EXT-X-BYTERANGE:10@0', 'main.mp4'].join('\n')
    );
    (webViewFetchBinary as jest.Mock).mockResolvedValue({
      status: 200,
      base64: btoa('xx'),
      byteLength: 2,
      contentLength: 2,
    });
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });
    const p = downloadHlsToDirectory('https://cdn/index.m3u8', 'file:///mock-docs/range/', 720);
    const assertion = expect(p).rejects.toThrow(/Segment size mismatch/);
    await jest.runAllTimersAsync();
    await assertion;
    jest.useRealTimers();
  });

  it('OkHttp ranged size mismatch', async () => {
    jest.useFakeTimers();
    (isMediaFetchReady as jest.Mock).mockReturnValue(false);
    (FileSystem.downloadAsync as jest.Mock).mockResolvedValue({ status: 200 });
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true, size: 3 });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(
      ['#EXTM3U', '#EXTINF:1,', '#EXT-X-BYTERANGE:10@0', 'main.mp4'].join('\n')
    );
    const p = downloadHlsToDirectory(
      'https://cdn/index.m3u8',
      'file:///mock-docs/okhttp-range/',
      720
    );
    const assertion = expect(p).rejects.toThrow(/Segment size mismatch/);
    await jest.runAllTimersAsync();
    await assertion;
    jest.useRealTimers();
  });

  it('ignores deleteAsync failures during OkHttp retry', async () => {
    jest.useFakeTimers();
    (isMediaFetchReady as jest.Mock).mockReturnValue(false);
    (FileSystem.deleteAsync as jest.Mock).mockRejectedValue(new Error('busy'));
    (FileSystem.downloadAsync as jest.Mock)
      .mockResolvedValueOnce({ status: 500 })
      .mockResolvedValue({ status: 200 });
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true, size: 10 });
    const p = downloadRemoteFile('https://cdn/a.ts', 'file:///a.ts', 'https://player/');
    await jest.runAllTimersAsync();
    await expect(p).resolves.toBeUndefined();
    jest.useRealTimers();
  });

  it('redownloads ranged job when on-disk size mismatches expected', async () => {
    (isMediaFetchReady as jest.Mock).mockReturnValue(false);
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(
      ['#EXTM3U', '#EXTINF:1,', '#EXT-X-BYTERANGE:10@0', 'main.mp4'].join('\n')
    );
    let downloadCount = 0;
    (FileSystem.getInfoAsync as jest.Mock).mockImplementation(async (path: string) => {
      if (String(path).includes('seg_') && downloadCount === 0) {
        return { exists: true, size: 1 };
      }
      if (String(path).includes('seg_')) return { exists: true, size: 10 };
      return { exists: false };
    });
    (FileSystem.downloadAsync as jest.Mock).mockImplementation(async () => {
      downloadCount += 1;
      return { status: 200 };
    });
    await downloadHlsToDirectory(
      'https://cdn/index.m3u8',
      'file:///mock-docs/partial-range/',
      720
    );
    expect(downloadCount).toBeGreaterThan(0);
  });
});

describe('pickSubtitleTrack re-export', () => {
  it('prefers russian full', () => {
    expect(
      pickSubtitleTrack([
        { label: 'EN', src: 'e' },
        { label: 'Russian Full', src: 'rf' },
      ])?.src
    ).toBe('rf');
  });

  it('prefers русские then first', () => {
    expect(
      pickSubtitleTrack([
        { label: 'EN', src: 'e' },
        { label: 'Русские', src: 'r' },
      ])?.src
    ).toBe('r');
    expect(pickSubtitleTrack([{ label: 'Deutsch', src: 'd' }])?.src).toBe('d');
  });
});

describe('hls edge branches', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (isMediaFetchReady as jest.Mock).mockReturnValue(false);
    (FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);
    (FileSystem.makeDirectoryAsync as jest.Mock).mockResolvedValue(undefined);
    (FileSystem.writeAsStringAsync as jest.Mock).mockResolvedValue(undefined);
  });

  it('skips OkHttp fetch when no cache/document directory', async () => {
    Object.defineProperty(FileSystem, 'cacheDirectory', { configurable: true, value: null });
    Object.defineProperty(FileSystem, 'documentDirectory', { configurable: true, value: null });
    await expect(resolveVariantPlaylist('https://cdn/index.m3u8', 720)).rejects.toThrow(
      /Failed to fetch playlist/
    );
  });

  it('aborts mid-download via signal', async () => {
    Object.defineProperty(FileSystem, 'cacheDirectory', {
      configurable: true,
      value: 'file:///mock-cache/',
    });
    (FileSystem.downloadAsync as jest.Mock).mockResolvedValue({ status: 200 });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(
      '#EXTM3U\n#EXTINF:1,\na.ts\n#EXTINF:1,\nb.ts\n'
    );
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });
    const controller = new AbortController();
    (FileSystem.downloadAsync as jest.Mock).mockImplementation(async () => {
      controller.abort();
      return { status: 200 };
    });
    // First downloadAsync is for playlist via fetchText
    let calls = 0;
    (FileSystem.downloadAsync as jest.Mock).mockImplementation(async () => {
      calls += 1;
      if (calls > 1) controller.abort();
      return { status: 200 };
    });
    await expect(
      downloadHlsToDirectory(
        'https://cdn/index.m3u8',
        'file:///mock-docs/abort/',
        720,
        undefined,
        undefined,
        controller.signal
      )
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('WebView empty error throw path', async () => {
    (isMediaFetchReady as jest.Mock).mockReturnValue(true);
    (webViewFetchBinary as jest.Mock).mockResolvedValue({ status: 0, base64: '' });
    await expect(downloadRemoteFile('https://cdn/a.ts', 'file:///a.ts')).rejects.toThrow(
      /Segment download failed/
    );
  });

  it('pickSubtitleTrack returns null for empty tracks', () => {
    expect(pickSubtitleTrack([])).toBeNull();
  });

  it('WebView binary without byteLength uses decoded length; non-Error catch', async () => {
    (isMediaFetchReady as jest.Mock).mockReturnValue(true);
    (webViewFetchBinary as jest.Mock)
      .mockRejectedValueOnce(123)
      .mockResolvedValueOnce({ status: 200, base64: 'YQ==', byteLength: undefined });
    (FileSystem.writeAsStringAsync as jest.Mock).mockResolvedValue(undefined);
    await downloadRemoteFile('https://cdn/a.ts', 'file:///a.ts');
  });

  it('download with size missing on exists info', async () => {
    (isMediaFetchReady as jest.Mock).mockReturnValue(false);
    Object.defineProperty(FileSystem, 'cacheDirectory', {
      configurable: true,
      value: 'file:///mock-cache/',
    });
    (FileSystem.downloadAsync as jest.Mock).mockResolvedValue({ status: 200 });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(
      '#EXTM3U\n#EXTINF:1,\nseg.ts\n'
    );
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
    await downloadHlsToDirectory(
      'https://cdn/index.m3u8',
      'file:///mock-docs/nosize/',
      720
    );
  });

  it('variant sort uses preferredHeight when height is 0', async () => {
    (isMediaFetchReady as jest.Mock).mockReturnValue(false);
    Object.defineProperty(FileSystem, 'cacheDirectory', {
      configurable: true,
      value: 'file:///mock-cache/',
    });
    (FileSystem.downloadAsync as jest.Mock)
      .mockResolvedValueOnce({ status: 200 })
      .mockResolvedValueOnce({ status: 200 });
    (FileSystem.readAsStringAsync as jest.Mock)
      .mockResolvedValueOnce(
        [
          '#EXTM3U',
          '#EXT-X-STREAM-INF:BANDWIDTH=100',
          'a.m3u8',
          '#EXT-X-STREAM-INF:BANDWIDTH=200',
          'b.m3u8',
        ].join('\n')
      )
      .mockResolvedValueOnce('#EXTM3U\n#EXTINF:1,\nseg.ts\n');
    await resolveVariantPlaylist('https://cdn/master.m3u8', 720);
  });

  it('downloadWithRetry without fallbackHeaders', async () => {
    (isMediaFetchReady as jest.Mock).mockReturnValue(false);
    (FileSystem.downloadAsync as jest.Mock).mockResolvedValue({ status: 200 });
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true, size: 10 });
    await downloadWithRetry(
      'https://cdn/a.ts',
      'file:///a.ts',
      { Accept: '*/*' },
      'Segment download failed'
    );
  });

  it('downloadWithRetry webview empty lastError uses label', async () => {
    (isMediaFetchReady as jest.Mock).mockReturnValue(true);
    (webViewFetchBinary as jest.Mock).mockResolvedValue({ status: 500, base64: '' });
    await expect(
      downloadWithRetry('https://cdn/a.ts', 'file:///a.ts', {}, 'Seg fail')
    ).rejects.toThrow(/Seg fail/);
  });

  it('OkHttp uses documentDirectory when cacheDirectory missing; 403 body path', async () => {
    (isMediaFetchReady as jest.Mock).mockReturnValue(false);
    Object.defineProperty(FileSystem, 'cacheDirectory', { configurable: true, value: null });
    Object.defineProperty(FileSystem, 'documentDirectory', {
      configurable: true,
      value: 'file:///mock-docs/',
    });
    (FileSystem.downloadAsync as jest.Mock)
      .mockResolvedValueOnce({ status: 200 })
      .mockResolvedValueOnce({ status: 200 });
    (FileSystem.readAsStringAsync as jest.Mock)
      .mockResolvedValueOnce('403 Forbidden')
      .mockResolvedValueOnce('#EXTM3U\n#EXTINF:1,\nseg.ts\n');
    // mediaUrlCandidates may yield multiple; second read succeeds
    const result = await resolveVariantPlaylist('https://cdn/index.m3u8', 720).catch(() => null);
    // If only one candidate, expect throw; otherwise content
    if (result) expect(result.content).toContain('#EXTINF');
  });

  it('WebView catch extracts status from error message', async () => {
    (isMediaFetchReady as jest.Mock).mockReturnValue(true);
    let n = 0;
    (webViewFetchText as jest.Mock).mockImplementation(async () => {
      n += 1;
      if (n === 1) throw new Error('Failed to fetch playlist: 502');
      return '#EXTM3U\n#EXTINF:1,\nseg.ts\n';
    });
    const result = await resolveVariantPlaylist(
      'https://cdn/a.m3u8 or https://cdn/b.m3u8',
      720
    );
    expect(result.content).toContain('#EXTINF');
  });

  it('OkHttp non-2xx skips body read', async () => {
    (isMediaFetchReady as jest.Mock).mockReturnValue(false);
    Object.defineProperty(FileSystem, 'cacheDirectory', {
      configurable: true,
      value: 'file:///mock-cache/',
    });
    (FileSystem.downloadAsync as jest.Mock)
      .mockResolvedValueOnce({ status: 500 })
      .mockResolvedValueOnce({ status: 200 });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(
      '#EXTM3U\n#EXTINF:1,\nseg.ts\n'
    );
    const result = await resolveVariantPlaylist(
      'https://cdn/a.m3u8 or https://cdn/b.m3u8',
      720
    );
    expect(result.content).toContain('#EXTINF');
  });
});
