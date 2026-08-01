import { Innertube } from 'youtubei.js/react-native';

import { t } from '@/src/i18n';

import type { DownloadMediaKind } from './types';

const PIPED_INSTANCES = [
  'https://pipedapi.r4fo.com',
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://api.piped.private.coffee',
  'https://pipedapi.darkness.services',
];

const INVIDIOUS_INSTANCES = [
  'https://invidious.projectsegfau.lt',
  'https://yewtu.be',
  'https://inv.nadeko.net',
];

type PipedVideoStream = {
  url: string;
  quality?: string;
  height?: number;
  videoOnly?: boolean;
  mimeType?: string;
};

type PipedStreamsResponse = {
  title?: string;
  thumbnailUrl?: string;
  hls?: string | null;
  videoStreams?: PipedVideoStream[];
  error?: string;
};

type InvidiousFormatStream = {
  url?: string;
  qualityLabel?: string;
};

type InvidiousVideoResponse = {
  title?: string;
  videoThumbnails?: { url: string; width?: number }[];
  formatStreams?: InvidiousFormatStream[];
  hlsUrl?: string;
  error?: string;
};

export type ResolvedYoutubeStream = {
  videoId: string;
  title: string;
  posterUrl?: string;
  quality: string;
  mediaKind: DownloadMediaKind;
  streamUrl: string;
  youtubeUrl: string;
};

export type YoutubeQualityOption = {
  quality: string;
  label: string;
};

export type YoutubeProbeResult = {
  videoId: string;
  title: string;
  posterUrl?: string;
  qualities: YoutubeQualityOption[];
  youtubeUrl: string;
};

type MuxedCandidate = {
  height: number;
  streamUrl: string;
};

const VIDEO_ID_RE = /^[\w-]{11}$/;
const PREFERRED_ORDER = [720, 480, 360, 1080, 240, 144, 2160, 1440];

export function extractYoutubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (VIDEO_ID_RE.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, '');

    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return id && VIDEO_ID_RE.test(id) ? id : null;
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      const v = url.searchParams.get('v');
      if (v && VIDEO_ID_RE.test(v)) return v;
    }

    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live') {
      const id = parts[1];
      return id && VIDEO_ID_RE.test(id) ? id : null;
    }
  } catch {
    // not a URL
  }

  return null;
}

function parseQualityHeight(stream: PipedVideoStream): number {
  if (typeof stream.height === 'number' && stream.height > 0) return stream.height;
  const fromQuality = Number(String(stream.quality ?? '').replace(/[^\d]/g, ''));
  return Number.isFinite(fromQuality) ? fromQuality : 0;
}

function uniqueSortedHeights(heights: number[]): number[] {
  const set = new Set(heights.filter((h) => h > 0));
  return [...set].sort((a, b) => b - a);
}

function pickHeight(available: number[], preferred?: number): number | null {
  if (!available.length) return null;
  if (preferred && available.includes(preferred)) return preferred;
  for (const h of PREFERRED_ORDER) {
    if (available.includes(h)) return h;
  }
  return available[0];
}

function qualityOptionsFromHeights(heights: number[]): YoutubeQualityOption[] {
  return uniqueSortedHeights(heights).map((h) => ({
    quality: String(h),
    label: `${h}p`,
  }));
}

function pickMuxedByHeight(candidates: MuxedCandidate[], preferred?: number): MuxedCandidate | null {
  if (!candidates.length) return null;
  const heights = candidates.map((c) => c.height);
  const chosen = pickHeight(heights, preferred);
  if (chosen == null) return null;
  const exact = candidates.find((c) => c.height === chosen);
  return exact ?? candidates[0];
}

async function fetchJson<T>(url: string, timeoutMs = 12000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    if (text.trimStart().startsWith('<')) {
      throw new Error('HTML response');
    }
    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timer);
  }
}

function pipedMuxed(data: PipedStreamsResponse): MuxedCandidate[] {
  return (data.videoStreams ?? [])
    .filter((s) => !s.videoOnly && typeof s.url === 'string' && s.url.length > 0)
    .map((s) => ({
      height: parseQualityHeight(s) || 0,
      streamUrl: s.url,
    }))
    .filter((s) => s.height > 0);
}

async function resolveFromPiped(
  instance: string,
  videoId: string,
  preferredHeight?: number
): Promise<ResolvedYoutubeStream> {
  const data = await fetchJson<PipedStreamsResponse>(`${instance}/streams/${videoId}`);
  if (data.error) {
    throw new Error(data.error);
  }

  const title = (data.title ?? '').trim() || `YouTube ${videoId}`;
  const posterUrl = data.thumbnailUrl || undefined;
  const muxed = pickMuxedByHeight(pipedMuxed(data), preferredHeight);

  if (muxed) {
    return {
      videoId,
      title,
      posterUrl,
      quality: String(muxed.height),
      mediaKind: 'progressive',
      streamUrl: muxed.streamUrl,
      youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
    };
  }

  if (data.hls) {
    return {
      videoId,
      title,
      posterUrl,
      quality: String(preferredHeight && preferredHeight > 0 ? preferredHeight : 720),
      mediaKind: 'hls',
      streamUrl: data.hls,
      youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
    };
  }

  throw new Error(t('youtube.noStream'));
}

async function probeFromPiped(instance: string, videoId: string): Promise<YoutubeProbeResult> {
  const data = await fetchJson<PipedStreamsResponse>(`${instance}/streams/${videoId}`);
  if (data.error) throw new Error(data.error);
  const muxed = pipedMuxed(data);
  const heights = muxed.map((m) => m.height);
  if (!heights.length && data.hls) {
    heights.push(720, 480, 360);
  }
  if (!heights.length) throw new Error(t('youtube.noStream'));
  return {
    videoId,
    title: (data.title ?? '').trim() || `YouTube ${videoId}`,
    posterUrl: data.thumbnailUrl || undefined,
    qualities: qualityOptionsFromHeights(heights),
    youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

function invidiousMuxed(streams: InvidiousFormatStream[]): MuxedCandidate[] {
  return streams
    .filter((s) => typeof s.url === 'string' && s.url.length > 0)
    .map((s) => ({
      height: Number(String(s.qualityLabel ?? '').replace(/[^\d]/g, '')) || 0,
      streamUrl: s.url as string,
    }))
    .filter((s) => s.height > 0);
}

async function resolveFromInvidious(
  instance: string,
  videoId: string,
  preferredHeight?: number
): Promise<ResolvedYoutubeStream> {
  const data = await fetchJson<InvidiousVideoResponse>(`${instance}/api/v1/videos/${videoId}`);
  if (data.error) {
    throw new Error(data.error);
  }

  const title = (data.title ?? '').trim() || `YouTube ${videoId}`;
  const thumbs = [...(data.videoThumbnails ?? [])].sort(
    (a, b) => (b.width ?? 0) - (a.width ?? 0)
  );
  const posterUrl = thumbs[0]?.url;
  const muxed = pickMuxedByHeight(invidiousMuxed(data.formatStreams ?? []), preferredHeight);

  if (muxed) {
    return {
      videoId,
      title,
      posterUrl,
      quality: String(muxed.height),
      mediaKind: 'progressive',
      streamUrl: muxed.streamUrl,
      youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
    };
  }

  if (data.hlsUrl) {
    return {
      videoId,
      title,
      posterUrl,
      quality: String(preferredHeight && preferredHeight > 0 ? preferredHeight : 720),
      mediaKind: 'hls',
      streamUrl: data.hlsUrl,
      youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
    };
  }

  throw new Error(t('youtube.noStream'));
}

async function probeFromInvidious(instance: string, videoId: string): Promise<YoutubeProbeResult> {
  const data = await fetchJson<InvidiousVideoResponse>(`${instance}/api/v1/videos/${videoId}`);
  if (data.error) throw new Error(data.error);
  const muxed = invidiousMuxed(data.formatStreams ?? []);
  const heights = muxed.map((m) => m.height);
  if (!heights.length && data.hlsUrl) {
    heights.push(720, 480, 360);
  }
  if (!heights.length) throw new Error(t('youtube.noStream'));
  const thumbs = [...(data.videoThumbnails ?? [])].sort(
    (a, b) => (b.width ?? 0) - (a.width ?? 0)
  );
  return {
    videoId,
    title: (data.title ?? '').trim() || `YouTube ${videoId}`,
    posterUrl: thumbs[0]?.url,
    qualities: qualityOptionsFromHeights(heights),
    youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

async function resolveFromYoutubei(
  videoId: string,
  preferredHeight?: number
): Promise<ResolvedYoutubeStream> {
  const clients = ['ANDROID', 'MWEB', 'IOS'] as const;
  let lastError: Error | null = null;

  for (const client of clients) {
    try {
      const yt = await Innertube.create({
        generate_session_locally: true,
      });
      const info = await yt.getBasicInfo(videoId, { client });
      const title = info.basic_info?.title?.trim() || `YouTube ${videoId}`;
      const posterUrl = info.basic_info?.thumbnail?.[0]?.url;

      const formats = info.streaming_data?.formats ?? [];
      const withUrl: MuxedCandidate[] = [];
      for (const f of formats) {
        try {
          const streamUrl = f.url || (await f.decipher(yt.session.player));
          if (streamUrl) {
            const height =
              Number(f.height) ||
              Number(String(f.quality_label ?? '').replace(/[^\d]/g, '')) ||
              0;
            if (height > 0) {
              withUrl.push({ height, streamUrl });
            }
          }
        } catch {
          // skip
        }
      }

      const muxed = pickMuxedByHeight(withUrl, preferredHeight);
      if (muxed) {
        return {
          videoId,
          title,
          posterUrl,
          quality: String(muxed.height),
          mediaKind: 'progressive',
          streamUrl: muxed.streamUrl,
          youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
        };
      }

      try {
        const fmt = info.chooseFormat({ type: 'video+audio', quality: 'bestefficiency' });
        const streamUrl = fmt.url || (await fmt.decipher(yt.session.player));
        if (streamUrl) {
          const height =
            Number(String(fmt.quality_label ?? '').replace(/[^\d]/g, '')) ||
            Number(fmt.height) ||
            240;
          return {
            videoId,
            title,
            posterUrl,
            quality: String(height),
            mediaKind: 'progressive',
            streamUrl,
            youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
          };
        }
      } catch {
        // no muxed chooseFormat
      }

      const hls = info.streaming_data?.hls_manifest_url;
      if (hls) {
        return {
          videoId,
          title,
          posterUrl,
          quality: String(preferredHeight && preferredHeight > 0 ? preferredHeight : 720),
          mediaKind: 'hls',
          streamUrl: hls,
          youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
        };
      }

      throw new Error(t('youtube.noStream'));
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  throw lastError ?? new Error(t('youtube.noStream'));
}

async function probeFromYoutubei(videoId: string): Promise<YoutubeProbeResult> {
  const clients = ['ANDROID', 'MWEB', 'IOS'] as const;
  let lastError: Error | null = null;

  for (const client of clients) {
    try {
      const yt = await Innertube.create({ generate_session_locally: true });
      const info = await yt.getBasicInfo(videoId, { client });
      const title = info.basic_info?.title?.trim() || `YouTube ${videoId}`;
      const posterUrl = info.basic_info?.thumbnail?.[0]?.url;
      const heights: number[] = [];
      for (const f of info.streaming_data?.formats ?? []) {
        const height =
          Number(f.height) || Number(String(f.quality_label ?? '').replace(/[^\d]/g, '')) || 0;
        if (height > 0) heights.push(height);
      }
      if (!heights.length && info.streaming_data?.hls_manifest_url) {
        heights.push(720, 480, 360);
      }
      if (!heights.length) throw new Error(t('youtube.noStream'));
      return {
        videoId,
        title,
        posterUrl,
        qualities: qualityOptionsFromHeights(heights),
        youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
      };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  throw lastError ?? new Error(t('youtube.noStream'));
}

export async function probeYoutubeQualities(youtubeUrl: string): Promise<YoutubeProbeResult> {
  const videoId = extractYoutubeVideoId(youtubeUrl);
  if (!videoId) {
    throw new Error(t('youtube.badLink'));
  }

  let lastError: Error | null = null;

  for (const instance of PIPED_INSTANCES) {
    try {
      return await probeFromPiped(instance, videoId);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      return await probeFromInvidious(instance, videoId);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  try {
    return await probeFromYoutubei(videoId);
  } catch (e) {
    lastError = e instanceof Error ? e : new Error(String(e));
  }

  throw new Error(
    lastError?.message
      ? t('youtube.streamFailed', { reason: lastError.message })
      : t('youtube.streamFailedGeneric')
  );
}

export async function resolveYoutubeStream(
  youtubeUrl: string,
  preferredQuality?: string
): Promise<ResolvedYoutubeStream> {
  const videoId = extractYoutubeVideoId(youtubeUrl);
  if (!videoId) {
    throw new Error(t('youtube.badLink'));
  }

  const preferredHeight = preferredQuality
    ? Number(String(preferredQuality).replace(/[^\d]/g, ''))
    : undefined;
  const preferred =
    preferredHeight && Number.isFinite(preferredHeight) && preferredHeight > 0
      ? preferredHeight
      : undefined;

  let lastError: Error | null = null;

  for (const instance of PIPED_INSTANCES) {
    try {
      return await resolveFromPiped(instance, videoId, preferred);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      return await resolveFromInvidious(instance, videoId, preferred);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  try {
    return await resolveFromYoutubei(videoId, preferred);
  } catch (e) {
    lastError = e instanceof Error ? e : new Error(String(e));
  }

  throw new Error(
    lastError?.message
      ? t('youtube.streamFailed', { reason: lastError.message })
      : t('youtube.streamFailedGeneric')
  );
}
