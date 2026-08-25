import * as FileSystem from 'expo-file-system/legacy';

import {
  isMediaFetchReady,
  webViewFetchBinary,
  webViewFetchText,
  type BinaryByteRange,
} from '@/src/features/downloads/mediaFetch';
import {
  base64DecodedLength,
  buildDemuxMasterPlaylist,
  planHlsOfflineDownload,
  type ByteRange,
  type HlsDownloadJob,
} from '@/src/features/downloads/hlsPlaylist';
import {
  mediaUrlCandidates,
  pickPrimaryMediaUrl,
  resolveUrl,
} from '@/src/features/downloads/urlHelpers';
import { errorMessage } from '@/src/shared/lib/errorMessage';
import {
  coalesceSize,
  coalesceStatus,
  matchAttr,
  orPreferred,
} from '@/src/features/downloads/hlsNumbers';

export {
  base64DecodedLength,
  parseByteRangeSpec,
  planHlsOfflineDownload,
  stripByteRangeAttribute,
} from '@/src/features/downloads/hlsPlaylist';

export { mediaUrlCandidates, pickPrimaryMediaUrl } from '@/src/features/downloads/urlHelpers';

const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

export function resolveMediaUrl(base: string, relative: string): string {
  return pickPrimaryMediaUrl(resolveUrl(base, relative));
}

const SEGMENT_RETRY_BACKOFF_MS = [300, 800, 1500] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePlaylistLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/** OkHttp rejects CR/LF in header values (e.g. scraped playerUrl with trailing \\n). */
function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, '');
}

function playerOrigin(playerUrl?: string): string {
  try {
    if (playerUrl) return new URL(playerUrl).origin;
  } catch {
    // keep default
  }
  return 'https://biorn-as.stloadi.live:9443';
}

/** CDN playlists require the player Origin — newdeaf.top Referer alone returns 403. */
export function mediaRequestHeaders(playerUrl?: string): Record<string, string> {
  const origin = playerOrigin(playerUrl);
  let referer = `${origin}/`;
  try {
    if (playerUrl) {
      // Full player URL Referer is accepted more reliably than origin-only on stravers/stloadi.
      // Use parsed.href — raw playerUrl may contain trailing CR/LF from HTML scrape.
      referer = new URL(playerUrl).href;
    }
  } catch {
    // keep origin-only
  }
  return {
    'User-Agent': sanitizeHeaderValue(USER_AGENT),
    Referer: sanitizeHeaderValue(referer),
    Origin: sanitizeHeaderValue(origin),
  };
}

/**
 * Segment / subtitle OkHttp GETs — Origin on vkvideo.cloud often yields 403.
 * Match WebView referrerpolicy="origin": origin-only Referer, no Origin.
 */
export function mediaSegmentHeaders(playerUrl?: string): Record<string, string> {
  const origin = playerOrigin(playerUrl);
  return {
    'User-Agent': sanitizeHeaderValue(USER_AGENT),
    Referer: sanitizeHeaderValue(`${origin}/`),
    Accept: '*/*',
  };
}

function assertBinarySize(
  decodedLen: number,
  expected?: number | null,
  contentLength?: number | null
): void {
  if (expected != null && expected > 0 && decodedLen !== expected) {
    throw new Error(`Segment size mismatch: got ${decodedLen}, expected ${expected}`);
  }
  // Full-body responses: Content-Length must match decoded payload when present.
  if (
    expected == null &&
    contentLength != null &&
    contentLength > 0 &&
    decodedLen !== contentLength
  ) {
    throw new Error(`Segment size mismatch: got ${decodedLen}, Content-Length ${contentLength}`);
  }
}

export async function downloadWithRetry(
  remoteUrl: string,
  destPath: string,
  headers: Record<string, string>,
  errorLabel: string,
  fallbackHeaders?: Record<string, string>,
  byteRange?: ByteRange
): Promise<void> {
  const rangeHeader: BinaryByteRange | undefined = byteRange
    ? { offset: byteRange.offset, length: byteRange.length }
    : undefined;

  // Prefer Chrome WebView fetch when host is ready — OkHttp is fingerprint-blocked
  // on some device networks (vkvideo.cloud → 403). Do not fall back to OkHttp then:
  // a failed WebView transfer would otherwise be reported as a misleading OkHttp 403.
  if (isMediaFetchReady()) {
    let lastStatus = 0;
    let lastError = `${errorLabel}: webview`;
    for (let attempt = 0; attempt <= SEGMENT_RETRY_BACKOFF_MS.length; attempt++) {
      if (attempt > 0) await sleep(SEGMENT_RETRY_BACKOFF_MS[attempt - 1]);
      try {
        await FileSystem.deleteAsync(destPath, { idempotent: true });
      } catch {
        // ignore
      }
      try {
        const { status, base64, byteLength, contentLength } = await webViewFetchBinary(
          remoteUrl,
          120000,
          rangeHeader
        );
        lastStatus = status;
        if (status >= 200 && status < 300 && base64) {
          const decoded = byteLength ?? base64DecodedLength(base64);
          assertBinarySize(decoded, byteRange?.length, contentLength);
          await FileSystem.writeAsStringAsync(destPath, base64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          return;
        }
        lastError = `${errorLabel}: ${status}`;
        if (status === 403 || status === 404) break;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }
    }
    throw new Error(lastError);
  }

  const withRange = (base: Record<string, string>): Record<string, string> =>
    byteRange
      ? {
          ...base,
          Range: `bytes=${byteRange.offset}-${byteRange.offset + byteRange.length - 1}`,
        }
      : base;

  const headerSets = fallbackHeaders
    ? [withRange(headers), withRange(fallbackHeaders)]
    : [withRange(headers)];
  let lastStatus = 0;
  for (const headerSet of headerSets) {
    for (let attempt = 0; attempt <= SEGMENT_RETRY_BACKOFF_MS.length; attempt++) {
      if (attempt > 0) {
        await sleep(SEGMENT_RETRY_BACKOFF_MS[attempt - 1]);
      }
      try {
        await FileSystem.deleteAsync(destPath, { idempotent: true });
      } catch {
        // ignore
      }
      const result = await FileSystem.downloadAsync(remoteUrl, destPath, { headers: headerSet });
      lastStatus = coalesceStatus(result.status);
      if (lastStatus >= 200 && lastStatus < 300) {
        const info = await FileSystem.getInfoAsync(destPath);
        const size = info.exists && 'size' in info ? coalesceSize(info.size) : 0;
        try {
          assertBinarySize(size, byteRange?.length, null);
          return;
        } catch (e) {
          try {
            await FileSystem.deleteAsync(destPath, { idempotent: true });
          } catch {
            // ignore
          }
          throw e;
        }
      }
      try {
        await FileSystem.deleteAsync(destPath, { idempotent: true });
      } catch {
        // ignore
      }
      if (lastStatus === 403) break;
    }
  }
  throw new Error(`${errorLabel}: ${lastStatus}`);
}

export async function downloadRemoteFile(
  remoteUrl: string,
  destPath: string,
  playerUrl?: string
): Promise<void> {
  await downloadWithRetry(
    pickPrimaryMediaUrl(remoteUrl),
    destPath,
    mediaSegmentHeaders(playerUrl),
    'Segment download failed',
    mediaRequestHeaders(playerUrl)
  );
}

/**
 * vkvideo.cloud playlists require Origin; OkHttp is fingerprint-blocked on some
 * device networks. Prefer Chrome WebView iframe fetch, fall back to OkHttp.
 */
async function fetchText(url: string, playerUrl?: string): Promise<string> {
  const candidates = mediaUrlCandidates(url);
  let lastStatus = 0;
  let lastError = '';
  const mediaReady = isMediaFetchReady();

  for (const candidate of candidates) {
    if (mediaReady) {
      try {
        const text = await webViewFetchText(candidate);
        if (/#EXTM3U|#EXTINF|#EXT-X-/i.test(text)) return text;
        if (/403 Forbidden/i.test(text)) lastStatus = 403;
        lastError = `Failed to fetch playlist: ${lastStatus || 'invalid'}`;
        continue;
      } catch (e) {
        lastError = errorMessage(e, String(e));
        const statusMatch = lastError.match(/Failed to fetch playlist: (\d+)/);
        if (statusMatch) lastStatus = Number(statusMatch[1]);
        continue;
      }
    }

    const headers = mediaRequestHeaders(playerUrl);
    const tmpBase = FileSystem.cacheDirectory || FileSystem.documentDirectory;
    if (!tmpBase) continue;
    const tmpPath = `${tmpBase}playlist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.m3u8`;
    try {
      await FileSystem.deleteAsync(tmpPath, { idempotent: true });
      const result = await FileSystem.downloadAsync(candidate, tmpPath, { headers });
      lastStatus = coalesceStatus(result.status);
      if (lastStatus >= 200 && lastStatus < 300) {
        const text = await FileSystem.readAsStringAsync(tmpPath);
        if (/#EXTM3U|#EXTINF|#EXT-X-/i.test(text)) return text;
        if (/403 Forbidden/i.test(text)) lastStatus = 403;
      }
      lastError = `Failed to fetch playlist: ${lastStatus}`;
    } catch (e) {
      lastError = errorMessage(e, `Failed to fetch playlist: network`);
    } finally {
      try {
        await FileSystem.deleteAsync(tmpPath, { idempotent: true });
      } catch {
        // ignore
      }
    }
  }

  throw new Error(lastError || `Failed to fetch playlist: ${lastStatus || 'network'}`);
}

export async function resolveVariantPlaylist(
  m3u8Url: string,
  preferredHeight: number,
  playerUrl?: string
): Promise<{ url: string; content: string }> {
  const content = await fetchText(m3u8Url, playerUrl);
  const primary = pickPrimaryMediaUrl(m3u8Url);
  if (!content.includes('#EXT-X-STREAM-INF')) {
    return { url: primary, content };
  }

  const lines = parsePlaylistLines(content);
  const variants: { bandwidth: number; height: number; uri: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('#EXT-X-STREAM-INF')) continue;
    const next = lines[i + 1];
    if (!next || next.startsWith('#')) continue;
    // Prefer primary AUDIO group over failover mirrors when heights match.
    if (/AUDIO="[^"]*failover/i.test(line)) continue;
    const bandwidth = matchAttr(line, /BANDWIDTH=(\d+)/i);
    const height = matchAttr(line, /RESOLUTION=\d+x(\d+)/i);
    variants.push({ bandwidth, height, uri: pickPrimaryMediaUrl(resolveUrl(primary, next)) });
  }

  if (!variants.length) {
    return { url: primary, content };
  }

  variants.sort((a, b) => {
    const da = Math.abs(orPreferred(a.height, preferredHeight) - preferredHeight);
    const db = Math.abs(orPreferred(b.height, preferredHeight) - preferredHeight);
    if (da !== db) return da - db;
    return b.bandwidth - a.bandwidth;
  });

  const best = variants[0];
  const variantContent = await fetchText(best.uri, playerUrl);
  return { url: pickPrimaryMediaUrl(best.uri), content: variantContent };
}

export type DownloadHlsResult = {
  dir: string;
  playlistPath: string;
};

export type DownloadHlsOptions = {
  audioPlaylistUrl?: string;
  audioLabel?: string;
};

async function materializePlaylistJobs(
  jobs: HlsDownloadJob[],
  targetDir: string,
  headers: Record<string, string>,
  playlistHeaders: Record<string, string>,
  signal: AbortSignal | undefined,
  throwIfAborted: () => void,
  completedBefore: number,
  totalUnits: number,
  onUnitProgress?: (completedUnits: number, totalUnits: number) => void
): Promise<number> {
  let doneCount = completedBefore;
  const pending: HlsDownloadJob[] = [];
  const scanConcurrency = 16;
  for (let i = 0; i < jobs.length; i += scanConcurrency) {
    throwIfAborted();
    const slice = jobs.slice(i, i + scanConcurrency);
    const infos = await Promise.all(
      slice.map(async (job) => {
        const filePath = `${targetDir}${job.localName}`;
        const info = await FileSystem.getInfoAsync(filePath);
        const size = info.exists && 'size' in info ? coalesceSize(info.size) : 0;
        const expected = job.byteRange?.length;
        const ok = size > 0 && (expected == null || size === expected);
        return { job, exists: ok };
      })
    );
    for (const { job, exists } of infos) {
      if (exists) doneCount += 1;
      else pending.push(job);
    }
  }
  onUnitProgress?.(doneCount, Math.max(totalUnits, 1));

  const concurrency = isMediaFetchReady() ? 1 : 4;
  for (let i = 0; i < pending.length; i += concurrency) {
    throwIfAborted();
    const batch = pending.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (job) => {
        throwIfAborted();
        const filePath = `${targetDir}${job.localName}`;
        await downloadWithRetry(
          job.remoteUrl,
          filePath,
          headers,
          'Segment download failed',
          playlistHeaders,
          job.byteRange
        );
      })
    );
    doneCount += batch.length;
    onUnitProgress?.(Math.min(doneCount, totalUnits), Math.max(totalUnits, 1));
  }
  return doneCount;
}

export async function downloadHlsToDirectory(
  m3u8Url: string,
  targetDir: string,
  preferredHeight: number,
  onProgress?: (progress: number) => void,
  playerUrl?: string,
  signal?: AbortSignal,
  options?: DownloadHlsOptions
): Promise<DownloadHlsResult> {
  const throwIfAborted = () => {
    if (signal?.aborted) {
      const err = new Error('Download cancelled');
      err.name = 'AbortError';
      throw err;
    }
  };
  throwIfAborted();
  await FileSystem.makeDirectoryAsync(targetDir, { intermediates: true });

  const headers = mediaSegmentHeaders(playerUrl);
  const playlistHeaders = mediaRequestHeaders(playerUrl);
  const audioPlaylistUrl = options?.audioPlaylistUrl?.trim();
  const demux = Boolean(audioPlaylistUrl);

  const { url: variantUrl, content } = await resolveVariantPlaylist(
    m3u8Url,
    preferredHeight,
    playerUrl
  );
  throwIfAborted();

  const videoPlan = planHlsOfflineDownload(content, variantUrl, demux ? 'v_' : '');
  let audioPlan: { jobs: HlsDownloadJob[]; rewrittenLines: string[] } | null = null;
  if (demux && audioPlaylistUrl) {
    const audioContent = await fetchText(audioPlaylistUrl, playerUrl);
    throwIfAborted();
    audioPlan = planHlsOfflineDownload(audioContent, audioPlaylistUrl, 'a_');
  }

  const allJobs = [...videoPlan.jobs, ...(audioPlan?.jobs ?? [])];
  const total = Math.max(allJobs.length + 1, 1);
  const report = (done: number) => onProgress?.(Math.min(done / total, 0.99));

  let completed = await materializePlaylistJobs(
    videoPlan.jobs,
    targetDir,
    headers,
    playlistHeaders,
    signal,
    throwIfAborted,
    0,
    total,
    report
  );

  if (audioPlan) {
    completed = await materializePlaylistJobs(
      audioPlan.jobs,
      targetDir,
      headers,
      playlistHeaders,
      signal,
      throwIfAborted,
      completed,
      total,
      report
    );
  }

  throwIfAborted();

  if (demux && audioPlan) {
    await FileSystem.writeAsStringAsync(
      `${targetDir}video.m3u8`,
      `${videoPlan.rewrittenLines.join('\n')}\n`
    );
    await FileSystem.writeAsStringAsync(
      `${targetDir}audio.m3u8`,
      `${audioPlan.rewrittenLines.join('\n')}\n`
    );
    const master = buildDemuxMasterPlaylist({
      audioLabel: options?.audioLabel ? options.audioLabel : 'Audio',
      videoPlaylistFile: 'video.m3u8',
      audioPlaylistFile: 'audio.m3u8',
    });
    const playlistPath = `${targetDir}index.m3u8`;
    await FileSystem.writeAsStringAsync(playlistPath, master);
    onProgress?.(1);
    return { dir: targetDir, playlistPath };
  }

  const playlistPath = `${targetDir}index.m3u8`;
  await FileSystem.writeAsStringAsync(playlistPath, `${videoPlan.rewrittenLines.join('\n')}\n`);
  onProgress?.(1);

  return { dir: targetDir, playlistPath };
}

export async function downloadTextFile(
  url: string,
  destPath: string,
  playerUrl?: string
): Promise<string> {
  await downloadWithRetry(
    pickPrimaryMediaUrl(url),
    destPath,
    mediaSegmentHeaders(playerUrl),
    'Subtitle download failed',
    mediaRequestHeaders(playerUrl)
  );
  return destPath;
}

export function pickSubtitleTrack(
  tracks: { label: string; src: string }[]
): { label: string; src: string } | null {
  if (!tracks.length) return null;
  return (
    tracks.find((t) => /рус/i.test(t.label) && /полн/i.test(t.label)) ??
    tracks.find((t) => /russian/i.test(t.label) && /full/i.test(t.label)) ??
    tracks.find((t) => /рус/i.test(t.label)) ??
    tracks.find((t) => /russian/i.test(t.label)) ??
    tracks[0]
  );
}

/** Higher is better. NewDeaf is original-audio + subs — prefer Eng.Original over dubs. */
export function audioPreferenceScore(label: string): number {
  const l = label.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!l || l === '—' || l === '-' || /^delete$/.test(l)) return -100;
  if (/eng\.?\s*original/.test(l) || /english\s*original/.test(l)) return 100;
  if (/оригинал/.test(l) && /англ|eng/.test(l)) return 95;
  if (/^оригинал$/.test(l) || /^original$/.test(l)) return 90;
  if (/\boriginal\b/.test(l) && !/дуб|dub/.test(l)) return 85;
  if (/^english$|^англ/.test(l) || /^\(?english\)?/.test(l)) return 70;
  if (/\beng\b/.test(l) && !/дуб|dub/.test(l)) return 60;
  return 0;
}

export function pickPreferredAudioIndex(sources: { label: string }[]): number {
  if (!sources.length) return 0;
  let best = 0;
  let bestScore = audioPreferenceScore(sources[0].label);
  for (let i = 1; i < sources.length; i++) {
    const score = audioPreferenceScore(sources[i].label);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/** Move the preferred original track to the front for download UI. */
export function orderAudioSources<T extends { label: string }>(sources: T[]): T[] {
  if (sources.length < 2) return sources;
  const idx = pickPreferredAudioIndex(sources);
  if (idx <= 0) return sources;
  return [sources[idx], ...sources.filter((_, i) => i !== idx)];
}
