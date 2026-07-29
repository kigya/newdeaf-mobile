import type { DownloadMediaKind } from './types';

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.nosebs.ru',
  'https://api.piped.private.coffee',
];

type PipedVideoStream = {
  url: string;
  quality?: string;
  height?: number;
  videoOnly?: boolean;
  mimeType?: string;
  format?: string;
};

type PipedStreamsResponse = {
  title?: string;
  thumbnailUrl?: string;
  hls?: string | null;
  videoStreams?: PipedVideoStream[];
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

async function fetchFromInstance(
  instance: string,
  videoId: string
): Promise<PipedStreamsResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`${instance}/streams/${videoId}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`Piped ${res.status}`);
    }
    return (await res.json()) as PipedStreamsResponse;
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveYoutubeStream(youtubeUrl: string): Promise<ResolvedYoutubeStream> {
  const videoId = extractYoutubeVideoId(youtubeUrl);
  if (!videoId) {
    throw new Error('Некорректная ссылка на YouTube');
  }

  let lastError: Error | null = null;

  for (const instance of PIPED_INSTANCES) {
    try {
      const data = await fetchFromInstance(instance, videoId);
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

      throw new Error('Нет доступного потока для скачивания');
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  throw new Error(
    lastError?.message
      ? `Не удалось получить поток: ${lastError.message}`
      : 'Не удалось получить поток, попробуйте позже'
  );
}
