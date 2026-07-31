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

const VIDEO_ID_RE = /^[\w-]{11}$/;

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

      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live') {
        const id = parts[1];
        return id && VIDEO_ID_RE.test(id) ? id : null;
      }
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

function pickMuxedStream(streams: PipedVideoStream[]): PipedVideoStream | null {
  const muxed = streams.filter((s) => !s.videoOnly && typeof s.url === 'string' && s.url.length > 0);
  if (!muxed.length) return null;

  const preferred = [720, 480, 360, 1080, 240];
  muxed.sort((a, b) => {
    const ha = parseQualityHeight(a);
    const hb = parseQualityHeight(b);
    const ra = preferred.findIndex((h) => h === ha);
    const rb = preferred.findIndex((h) => h === hb);
    const sa = ra === -1 ? 100 + Math.abs(720 - ha) : ra;
    const sb = rb === -1 ? 100 + Math.abs(720 - hb) : rb;
    return sa - sb;
  });
  return muxed[0];
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

async function resolveFromPiped(instance: string, videoId: string): Promise<ResolvedYoutubeStream> {
  const data = await fetchJson<PipedStreamsResponse>(`${instance}/streams/${videoId}`);
  if (data.error) {
    throw new Error(data.error);
  }

  const title = (data.title ?? '').trim() || `YouTube ${videoId}`;
  const posterUrl = data.thumbnailUrl || undefined;
  const muxed = pickMuxedStream(data.videoStreams ?? []);

  if (muxed) {
    const height = parseQualityHeight(muxed) || 720;
    return {
      videoId,
      title,
      posterUrl,
      quality: String(height),
      mediaKind: 'progressive',
      streamUrl: muxed.url,
      youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
    };
  }

  if (data.hls) {
    return {
      videoId,
      title,
      posterUrl,
      quality: '720',
      mediaKind: 'hls',
      streamUrl: data.hls,
      youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
    };
  }

  throw new Error(t('youtube.noStream'));
}

function pickInvidiousMuxed(streams: InvidiousFormatStream[]): InvidiousFormatStream | null {
  const usable = streams.filter((s) => typeof s.url === 'string' && s.url.length > 0);
  if (!usable.length) return null;
  const preferred = ['720p', '480p', '360p', '1080p', '240p'];
  usable.sort((a, b) => {
    const la = preferred.indexOf(a.qualityLabel ?? '');
    const lb = preferred.indexOf(b.qualityLabel ?? '');
    return (la === -1 ? 99 : la) - (lb === -1 ? 99 : lb);
  });
  return usable[0];
}

async function resolveFromInvidious(
  instance: string,
  videoId: string
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
  const muxed = pickInvidiousMuxed(data.formatStreams ?? []);

  if (muxed?.url) {
    const height = Number(String(muxed.qualityLabel ?? '').replace(/[^\d]/g, '')) || 720;
    return {
      videoId,
      title,
      posterUrl,
      quality: String(height),
      mediaKind: 'progressive',
      streamUrl: muxed.url,
      youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
    };
  }

  if (data.hlsUrl) {
    return {
      videoId,
      title,
      posterUrl,
      quality: '720',
      mediaKind: 'hls',
      streamUrl: data.hlsUrl,
      youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
    };
  }

  throw new Error(t('youtube.noStream'));
}

async function resolveFromYoutubei(videoId: string): Promise<ResolvedYoutubeStream> {
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
      const withUrl: { qualityLabel?: string; height?: number; streamUrl: string }[] = [];
      for (const f of formats) {
        try {
          const streamUrl = f.url || (await f.decipher(yt.session.player));
          if (streamUrl) {
            withUrl.push({
              qualityLabel: f.quality_label,
              height: f.height,
              streamUrl,
            });
          }
        } catch {
          // skip
        }
      }

      if (withUrl.length) {
        withUrl.sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
        const best = withUrl[0];
        const height =
          Number(String(best.qualityLabel ?? '').replace(/[^\d]/g, '')) ||
          Number(best.height) ||
          240;
        return {
          videoId,
          title,
          posterUrl,
          quality: String(height),
          mediaKind: 'progressive',
          streamUrl: best.streamUrl,
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
          quality: '720',
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

export async function resolveYoutubeStream(youtubeUrl: string): Promise<ResolvedYoutubeStream> {
  const videoId = extractYoutubeVideoId(youtubeUrl);
  if (!videoId) {
    throw new Error(t('youtube.badLink'));
  }

  let lastError: Error | null = null;

  for (const instance of PIPED_INSTANCES) {
    try {
      return await resolveFromPiped(instance, videoId);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      return await resolveFromInvidious(instance, videoId);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  try {
    return await resolveFromYoutubei(videoId);
  } catch (e) {
    lastError = e instanceof Error ? e : new Error(String(e));
  }

  throw new Error(
    lastError?.message
      ? t('youtube.streamFailed', { reason: lastError.message })
      : t('youtube.streamFailedGeneric')
  );
}
