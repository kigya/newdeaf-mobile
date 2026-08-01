const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

const mockCreate = jest.fn();

jest.mock('youtubei.js/react-native', () => ({
  Innertube: { create: (...args: unknown[]) => mockCreate(...args) },
}));

import {
  extractYoutubeVideoId,
  probeYoutubeQualities,
  resolveYoutubeStream,
} from '@/src/features/downloads/youtube';
import { t } from '@/src/shared/i18n';

describe('extractYoutubeVideoId', () => {
  it('parses more URL shapes', () => {
    expect(extractYoutubeVideoId('  dQw4w9WgXcQ  ')).toBe('dQw4w9WgXcQ');
    expect(extractYoutubeVideoId('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ'
    );
    expect(extractYoutubeVideoId('https://music.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ'
    );
    expect(extractYoutubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ'
    );
    expect(extractYoutubeVideoId('https://www.youtube.com/live/dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ'
    );
    expect(extractYoutubeVideoId('https://youtu.be/bad')).toBeNull();
    expect(extractYoutubeVideoId('https://youtube.com/watch?v=short')).toBeNull();
  });
});

describe('resolveYoutubeStream / probeYoutubeQualities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockReset();
  });

  it('rejects bad links', async () => {
    await expect(resolveYoutubeStream('not-a-link')).rejects.toThrow(t('youtube.badLink'));
    await expect(probeYoutubeQualities('')).rejects.toThrow(t('youtube.badLink'));
  });

  it('resolves muxed progressive from Piped', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          title: 'Song',
          thumbnailUrl: 'https://thumb',
          videoStreams: [
            { url: 'https://cdn/360.mp4', quality: '360p', height: 360, videoOnly: false },
            { url: 'https://cdn/720.mp4', quality: '720p', height: 720, videoOnly: false },
            { url: 'https://cdn/vo.mp4', quality: '1080p', height: 1080, videoOnly: true },
          ],
        }),
    });

    const resolved = await resolveYoutubeStream(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      '720'
    );
    expect(resolved).toMatchObject({
      videoId: 'dQw4w9WgXcQ',
      title: 'Song',
      quality: '720',
      mediaKind: 'progressive',
      streamUrl: 'https://cdn/720.mp4',
    });
  });

  it('falls back to Piped HLS when no muxed streams', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          title: 'Live',
          hls: 'https://cdn/master.m3u8',
          videoStreams: [],
        }),
    });
    const resolved = await resolveYoutubeStream('dQw4w9WgXcQ');
    expect(resolved.mediaKind).toBe('hls');
    expect(resolved.streamUrl).toBe('https://cdn/master.m3u8');
    expect(resolved.quality).toBe('720');
  });

  it('probes qualities from Piped muxed heights', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          title: 'Song',
          videoStreams: [
            { url: 'https://a', quality: '480p', height: 480, videoOnly: false },
            { url: 'https://b', quality: '720p', height: 720, videoOnly: false },
          ],
        }),
    });
    const probe = await probeYoutubeQualities('dQw4w9WgXcQ');
    expect(probe.qualities.map((q) => q.quality)).toEqual(['720', '480']);
  });

  it('falls through Piped failures to Invidious', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/streams/')) {
        return { ok: false, status: 502, text: async () => 'err' };
      }
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            title: 'Inv',
            videoThumbnails: [
              { url: 'https://small', width: 100 },
              { url: 'https://big', width: 800 },
            ],
            formatStreams: [{ url: 'https://inv/720.mp4', qualityLabel: '720p' }],
          }),
      };
    });

    const resolved = await resolveYoutubeStream('dQw4w9WgXcQ', '720');
    expect(resolved.streamUrl).toBe('https://inv/720.mp4');
    expect(resolved.posterUrl).toBe('https://big');
  });

  it('uses Invidious HLS when formatStreams empty', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/streams/')) {
        return { ok: true, text: async () => JSON.stringify({ error: 'down' }) };
      }
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            title: 'HLS',
            hlsUrl: 'https://inv/hls.m3u8',
            formatStreams: [],
          }),
      };
    });
    const resolved = await resolveYoutubeStream('dQw4w9WgXcQ', '480');
    expect(resolved).toMatchObject({
      mediaKind: 'hls',
      streamUrl: 'https://inv/hls.m3u8',
      quality: '480',
    });
  });

  it('probes via Invidious when Piped fails', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/streams/')) {
        throw new Error('piped down');
      }
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            title: 'P',
            formatStreams: [{ url: 'https://x', qualityLabel: '360p' }],
            videoThumbnails: [],
          }),
      };
    });
    const probe = await probeYoutubeQualities('dQw4w9WgXcQ');
    expect(probe.qualities[0].quality).toBe('360');
  });

  it('falls back to youtubei when Piped and Invidious fail', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'no',
    });
    mockCreate.mockResolvedValue({
      getBasicInfo: async () => ({
        basic_info: { title: 'YT', thumbnail: [{ url: 'https://t' }] },
        streaming_data: {
          formats: [{ url: 'https://yt/720.mp4', height: 720, quality_label: '720p' }],
        },
        chooseFormat: () => {
          throw new Error('no');
        },
      }),
      session: { player: {} },
    });

    const resolved = await resolveYoutubeStream('dQw4w9WgXcQ', '720');
    expect(resolved.streamUrl).toBe('https://yt/720.mp4');
    expect(resolved.title).toBe('YT');
  });

  it('youtubei probe returns heights or HLS defaults', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'no',
    });
    mockCreate.mockResolvedValue({
      getBasicInfo: async () => ({
        basic_info: { title: 'YT' },
        streaming_data: {
          formats: [],
          hls_manifest_url: 'https://yt/hls.m3u8',
        },
      }),
    });
    const probe = await probeYoutubeQualities('dQw4w9WgXcQ');
    expect(probe.qualities.map((q) => q.quality)).toEqual(['720', '480', '360']);
  });

  it('surfaces aggregated failure when all backends fail', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'no',
    });
    mockCreate.mockRejectedValue(new Error('innertube down'));
    await expect(resolveYoutubeStream('dQw4w9WgXcQ')).rejects.toThrow(
      /innertube down|streamFailed/
    );
  });

  it('parses Piped quality from quality string when height missing', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          title: 'Q',
          videoStreams: [{ url: 'https://cdn/q.mp4', quality: '480p', videoOnly: false }],
        }),
    });
    const resolved = await resolveYoutubeStream('dQw4w9WgXcQ', '999');
    expect(resolved.quality).toBe('480');
  });

  it('rejects HTML Piped responses and falls through to Invidious', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/streams/')) {
        return { ok: true, text: async () => '<html>nope</html>' };
      }
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            title: '',
            formatStreams: [],
            hlsUrl: 'https://inv/h.m3u8',
            videoThumbnails: [],
          }),
      };
    });
    const resolved = await resolveYoutubeStream('dQw4w9WgXcQ');
    expect(resolved.mediaKind).toBe('hls');
  });

  it('probes Piped HLS defaults when no muxed', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({ title: 'L', hls: 'https://cdn/h.m3u8', videoStreams: [] }),
    });
    const probe = await probeYoutubeQualities('dQw4w9WgXcQ');
    expect(probe.qualities.map((q) => q.quality)).toEqual(['720', '480', '360']);
  });

  it('probes Invidious HLS defaults and youtubei formats', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/streams/')) {
        return { ok: true, text: async () => JSON.stringify({ error: 'x' }) };
      }
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            title: 'I',
            hlsUrl: 'https://inv/h.m3u8',
            formatStreams: [],
            videoThumbnails: [{ url: 'https://t', width: 10 }],
          }),
      };
    });
    const probe = await probeYoutubeQualities('dQw4w9WgXcQ');
    expect(probe.qualities[0].quality).toBe('720');
  });

  it('youtubei chooseFormat and HLS fallback paths', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'no' });
    mockCreate.mockResolvedValue({
      getBasicInfo: async () => ({
        basic_info: { title: '  ', thumbnail: [] },
        streaming_data: {
          formats: [
            {
              url: '',
              height: 0,
              quality_label: '360p',
              decipher: async () => 'https://yt/360.mp4',
            },
          ],
        },
        chooseFormat: () => ({
          url: '',
          quality_label: '240p',
          height: 0,
          decipher: async () => 'https://yt/choose.mp4',
        }),
      }),
      session: { player: {} },
    });
    // formats with decipher should win first
    const resolved = await resolveYoutubeStream('dQw4w9WgXcQ');
    expect(resolved.streamUrl).toBe('https://yt/360.mp4');
  });

  it('youtubei uses chooseFormat when formats empty then HLS', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'no' });
    let clientN = 0;
    mockCreate.mockImplementation(async () => {
      clientN += 1;
      if (clientN === 1) {
        return {
          getBasicInfo: async () => ({
            basic_info: { title: 'T' },
            streaming_data: { formats: [] },
            chooseFormat: () => ({
              url: 'https://yt/best.mp4',
              quality_label: 'best',
              height: 0,
            }),
          }),
          session: { player: {} },
        };
      }
      return {
        getBasicInfo: async () => ({
          basic_info: { title: 'T2' },
          streaming_data: { formats: [], hls_manifest_url: 'https://yt/hls.m3u8' },
          chooseFormat: () => {
            throw new Error('no');
          },
        }),
        session: { player: {} },
      };
    });
    const resolved = await resolveYoutubeStream('dQw4w9WgXcQ', '1080');
    expect(resolved.streamUrl).toBe('https://yt/best.mp4');
  });

  it('youtubei HLS when chooseFormat fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'no' });
    mockCreate.mockResolvedValue({
      getBasicInfo: async () => ({
        basic_info: { title: 'H' },
        streaming_data: { formats: [], hls_manifest_url: 'https://yt/live.m3u8' },
        chooseFormat: () => {
          throw new Error('no mux');
        },
      }),
      session: { player: {} },
    });
    const resolved = await resolveYoutubeStream('dQw4w9WgXcQ', '480');
    expect(resolved).toMatchObject({ mediaKind: 'hls', streamUrl: 'https://yt/live.m3u8', quality: '480' });
  });

  it('youtubei probe aggregates format heights', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'no' });
    mockCreate.mockResolvedValue({
      getBasicInfo: async () => ({
        basic_info: { title: 'P', thumbnail: [{ url: 'https://t' }] },
        streaming_data: {
          formats: [
            { height: 720, quality_label: '720p' },
            { height: 0, quality_label: '480p' },
          ],
        },
      }),
    });
    const probe = await probeYoutubeQualities('dQw4w9WgXcQ');
    expect(probe.qualities.map((q) => q.quality).sort()).toEqual(['480', '720']);
  });

  it('probe fails with generic message when lastError empty', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'no' });
    mockCreate.mockRejectedValue('string-fail');
    await expect(probeYoutubeQualities('dQw4w9WgXcQ')).rejects.toThrow();
  });

  it('Invidious throws when no streams', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/streams/')) {
        return { ok: true, text: async () => JSON.stringify({ error: 'x' }) };
      }
      return {
        ok: true,
        text: async () =>
          JSON.stringify({ title: 'N', formatStreams: [], videoThumbnails: [] }),
      };
    });
    mockCreate.mockRejectedValue(new Error('yt down'));
    await expect(resolveYoutubeStream('dQw4w9WgXcQ')).rejects.toThrow();
  });

  it('pickHeight falls back to first available non-preferred', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          title: 'Odd',
          videoStreams: [
            { url: 'https://cdn/900.mp4', quality: '900p', height: 900, videoOnly: false },
          ],
        }),
    });
    const resolved = await resolveYoutubeStream('dQw4w9WgXcQ', '720');
    expect(resolved.quality).toBe('900');
  });

  it('Piped throws noStream when empty', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ title: 'E', videoStreams: [] }),
    });
    mockCreate.mockRejectedValue(new Error('no'));
    await expect(resolveYoutubeStream('dQw4w9WgXcQ')).rejects.toThrow();
  });

  it('Invidious error field propagates into fallback chain', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/streams/')) {
        return { ok: true, text: async () => JSON.stringify({ error: 'piped' }) };
      }
      return { ok: true, text: async () => JSON.stringify({ error: 'inv down' }) };
    });
    mockCreate.mockResolvedValue({
      getBasicInfo: async () => ({
        basic_info: { title: 'Y' },
        streaming_data: { formats: [] },
        chooseFormat: () => {
          throw new Error('no');
        },
      }),
      session: { player: {} },
    });
    await expect(resolveYoutubeStream('dQw4w9WgXcQ')).rejects.toThrow();
  });

  it('youtubei throws noStream when all clients empty', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'no' });
    mockCreate.mockResolvedValue({
      getBasicInfo: async () => ({
        basic_info: { title: 'E' },
        streaming_data: { formats: [] },
        chooseFormat: () => {
          throw new Error('no');
        },
      }),
      session: { player: {} },
    });
    await expect(resolveYoutubeStream('dQw4w9WgXcQ')).rejects.toThrow();
  });

  it('probe Invidious with missing thumbnail widths', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/streams/')) {
        return { ok: true, text: async () => JSON.stringify({ error: 'p' }) };
      }
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            title: 'T',
            formatStreams: [{ url: 'https://x', qualityLabel: '720p' }],
            videoThumbnails: [{ url: 'https://a' }, { url: 'https://b', width: 50 }],
          }),
      };
    });
    const probe = await probeYoutubeQualities('dQw4w9WgXcQ');
    expect(probe.posterUrl).toBe('https://b');
  });

  it('uses empty-title fallbacks and preferredHeight 0 for HLS', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          title: '   ',
          hls: 'https://cdn/h.m3u8',
          videoStreams: [{ url: 'https://vo', quality: 'x', videoOnly: true }],
        }),
    });
    const resolved = await resolveYoutubeStream('dQw4w9WgXcQ', '0');
    expect(resolved.title).toBe('YouTube dQw4w9WgXcQ');
    expect(resolved.quality).toBe('720');
  });

  it('surfaces streamFailedGeneric when error message empty', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'no' });
    mockCreate.mockRejectedValue(new Error(''));
    await expect(probeYoutubeQualities('dQw4w9WgXcQ')).rejects.toThrow(/Failed to get stream/);
  });

  it('parseQualityHeight from quality string and zero height skipped', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          title: 'Q',
          videoStreams: [
            { url: 'https://cdn/bad.mp4', quality: 'nope', height: 0, videoOnly: false },
            { url: 'https://cdn/ok.mp4', quality: '360p', videoOnly: false },
          ],
        }),
    });
    const resolved = await resolveYoutubeStream('dQw4w9WgXcQ');
    expect(resolved.streamUrl).toBe('https://cdn/ok.mp4');
  });

  it('aborts fetchJson on timeout', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        })
    );
    mockCreate.mockRejectedValue(new Error('no'));
    const p = resolveYoutubeStream('dQw4w9WgXcQ');
    const assertion = expect(p).rejects.toThrow();
    await jest.advanceTimersByTimeAsync(13000);
    // Advance through all Piped + Invidious timeouts
    for (let i = 0; i < 20; i++) {
      await jest.advanceTimersByTimeAsync(13000);
    }
    await assertion;
    jest.useRealTimers();
  }, 60000);

  it('youtubei decipher skip and non-Error catch', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'no' });
    mockCreate.mockResolvedValue({
      getBasicInfo: async () => ({
        basic_info: { title: 'T', thumbnail: [{ url: 'https://t' }] },
        streaming_data: {
          formats: [
            {
              url: '',
              height: 720,
              quality_label: '720p',
              decipher: async () => {
                throw new Error('decipher fail');
              },
            },
            { url: 'https://yt/480.mp4', height: 480, quality_label: '480p' },
          ],
        },
        chooseFormat: () => {
          throw 'string';
        },
      }),
      session: { player: {} },
    });
    const resolved = await resolveYoutubeStream('dQw4w9WgXcQ', '480');
    expect(resolved.streamUrl).toBe('https://yt/480.mp4');
  });

  it('youtubei chooseFormat with height and quality_label fallbacks', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'no' });
    mockCreate.mockResolvedValue({
      getBasicInfo: async () => ({
        basic_info: {},
        streaming_data: { formats: [] },
        chooseFormat: () => ({
          url: 'https://yt/c.mp4',
          quality_label: undefined,
          height: 360,
        }),
      }),
      session: { player: {} },
    });
    const resolved = await resolveYoutubeStream('dQw4w9WgXcQ');
    expect(resolved.quality).toBe('360');
  });

  it('Invidious empty title and formatStreams with empty url skipped', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/streams/')) {
        return { ok: true, text: async () => JSON.stringify({ error: 'p' }) };
      }
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            title: null,
            formatStreams: [{ url: '', qualityLabel: '720p' }, { url: 'https://inv/360.mp4', qualityLabel: '360p' }],
            videoThumbnails: null,
          }),
      };
    });
    const resolved = await resolveYoutubeStream('dQw4w9WgXcQ');
    expect(resolved.title).toMatch(/YouTube/);
    expect(resolved.streamUrl).toBe('https://inv/360.mp4');
  });

  it('probe Piped empty title and resolve non-Error catch', async () => {
    fetchMock.mockRejectedValue('piped-string-fail');
    mockCreate.mockRejectedValue('yt-string-fail');
    await expect(resolveYoutubeStream('dQw4w9WgXcQ')).rejects.toThrow(/yt-string-fail|streamFailed/);
  });

  it('extractYoutubeVideoId covers youtu.be valid and non-youtube shorts host', () => {
    expect(extractYoutubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYoutubeVideoId('https://www.youtube.com/shorts/bad')).toBeNull();
    expect(extractYoutubeVideoId('https://example.com/shorts/dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ'
    );
  });

  it('piped HLS uses preferred height when provided', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          title: '  ',
          hls: 'https://cdn/master.m3u8',
          videoStreams: undefined,
        }),
    });
    const resolved = await resolveYoutubeStream('dQw4w9WgXcQ', '1080');
    expect(resolved.quality).toBe('1080');
    expect(resolved.title).toMatch(/YouTube/);
  });

  it('piped parseQualityHeight falls back for non-numeric quality', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          title: 'T',
          videoStreams: [
            { url: 'https://cdn/a.mp4', quality: 'hd', videoOnly: false },
            { url: 'https://cdn/b.mp4', quality: '720p', videoOnly: false },
          ],
        }),
    });
    const resolved = await resolveYoutubeStream('dQw4w9WgXcQ');
    expect(resolved.streamUrl).toBe('https://cdn/b.mp4');
  });

  it('probe Piped throws when no streams and no hls', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ title: 'Empty', videoStreams: [] }),
    });
    // All piped instances return same; then invidious/youtubei
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/streams/')) {
        return { ok: true, text: async () => JSON.stringify({ title: 'Empty', videoStreams: [] }) };
      }
      if (String(url).includes('/api/v1/videos/')) {
        return {
          ok: true,
          text: async () => JSON.stringify({ error: 'inv down' }),
        };
      }
      return { ok: false, status: 500, text: async () => 'no' };
    });
    mockCreate.mockRejectedValue(new Error('yt down'));
    await expect(probeYoutubeQualities('dQw4w9WgXcQ')).rejects.toThrow();
  });

  it('probe Invidious error and empty streams throw', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/streams/')) {
        return { ok: false, status: 500, text: async () => 'no' };
      }
      return {
        ok: true,
        text: async () => JSON.stringify({ error: 'inv error' }),
      };
    });
    mockCreate.mockRejectedValue(new Error('yt'));
    await expect(probeYoutubeQualities('dQw4w9WgXcQ')).rejects.toThrow();
  });

  it('probe Invidious no formats no hls throws then youtubei empty throws', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/streams/')) {
        return { ok: false, status: 500, text: async () => 'no' };
      }
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            title: '  ',
            formatStreams: undefined,
            videoThumbnails: [{ url: 'https://t', width: undefined }],
          }),
      };
    });
    mockCreate.mockResolvedValue({
      getBasicInfo: async () => ({
        basic_info: { title: '  ', thumbnail: [] },
        streaming_data: { formats: [{ height: 0, quality_label: 'x' }] },
      }),
    });
    await expect(probeYoutubeQualities('dQw4w9WgXcQ')).rejects.toThrow();
  });

  it('youtubei format without url skips; height from quality_label; chooseFormat decipher', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'no' });
    mockCreate.mockResolvedValue({
      getBasicInfo: async () => ({
        basic_info: { title: undefined, thumbnail: undefined },
        streaming_data: {
          formats: [
            { url: '', height: 0, quality_label: '', decipher: async () => '' },
            {
              url: undefined,
              height: undefined,
              quality_label: '480p',
              decipher: async () => 'https://yt/480.mp4',
            },
            { url: 'https://yt/0.mp4', height: 0, quality_label: 'bad' },
          ],
        },
        chooseFormat: () => ({
          url: '',
          quality_label: undefined,
          height: undefined,
          decipher: async () => 'https://yt/chosen.mp4',
        }),
      }),
      session: { player: {} },
    });
    const resolved = await resolveYoutubeStream('dQw4w9WgXcQ');
    expect(resolved.streamUrl).toMatch(/480|chosen/);
  });

  it('youtubei HLS with preferred height and probe non-Error catch', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'no' });
    mockCreate.mockResolvedValue({
      getBasicInfo: async () => ({
        basic_info: { title: 'H', thumbnail: [{ url: 'https://t' }] },
        streaming_data: {
          formats: [],
          hls_manifest_url: 'https://yt/hls.m3u8',
        },
        chooseFormat: () => {
          throw new Error('no');
        },
      }),
      session: { player: {} },
    });
    const resolved = await resolveYoutubeStream('dQw4w9WgXcQ', '360');
    expect(resolved).toMatchObject({ mediaKind: 'hls', quality: '360' });

    mockCreate.mockRejectedValue('string-fail');
    await expect(probeYoutubeQualities('dQw4w9WgXcQ')).rejects.toThrow(/string-fail|streamFailed/);
  });

  it('youtubei chooseFormat decipher throw leaves empty then HLS', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'no' });
    mockCreate.mockResolvedValue({
      getBasicInfo: async () => ({
        basic_info: { title: 'T' },
        streaming_data: {
          formats: [],
          hls_manifest_url: 'https://yt/hls.m3u8',
        },
        chooseFormat: () => ({
          url: '',
          quality_label: '720p',
          height: 720,
          decipher: async () => {
            throw new Error('decipher fail');
          },
        }),
      }),
      session: { player: {} },
    });
    const resolved = await resolveYoutubeStream('dQw4w9WgXcQ');
    expect(resolved.streamUrl).toBe('https://yt/hls.m3u8');
  });

  it('youtubei chooseFormat empty url uses successful decipher', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'no' });
    mockCreate.mockResolvedValue({
      getBasicInfo: async () => ({
        basic_info: { title: 'Chosen' },
        streaming_data: { formats: [] },
        chooseFormat: () => ({
          url: '',
          quality_label: '360p',
          height: 0,
          decipher: async () => 'https://yt/deciphered.mp4',
        }),
      }),
      session: { player: {} },
    });
    const resolved = await resolveYoutubeStream('dQw4w9WgXcQ');
    expect(resolved).toMatchObject({
      streamUrl: 'https://yt/deciphered.mp4',
      mediaKind: 'progressive',
      quality: '360',
    });
  });
});
