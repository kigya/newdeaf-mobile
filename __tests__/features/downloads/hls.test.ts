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
    jest.clearAllMocks();
    (isMediaFetchReady as jest.Mock).mockReturnValue(false);
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
});

describe('downloadHlsToDirectory / downloadWithRetry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isMediaFetchReady as jest.Mock).mockReturnValue(false);
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });
    (FileSystem.makeDirectoryAsync as jest.Mock).mockResolvedValue(undefined);
    (FileSystem.writeAsStringAsync as jest.Mock).mockResolvedValue(undefined);
    (FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);
    (FileSystem.downloadAsync as jest.Mock).mockResolvedValue({ status: 200, uri: 'file://x' });
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
});
