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
});
