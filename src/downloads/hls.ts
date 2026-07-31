import * as FileSystem from 'expo-file-system/legacy';

import {
  isMediaFetchReady,
  webViewFetchBinary,
  webViewFetchText,
} from '@/src/downloads/mediaFetch';

const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

function resolveUrl(base: string, relative: string): string {
  if (relative.startsWith('http://') || relative.startsWith('https://')) return relative;
  if (relative.startsWith('//')) return `https:${relative}`;
  try {
    return new URL(relative, base).toString();
  } catch {
    const trimmed = base.replace(/\/[^/]*$/, '/');
    return `${trimmed}${relative.replace(/^\//, '')}`;
  }
}

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

async function downloadWithRetry(
  remoteUrl: string,
  destPath: string,
  headers: Record<string, string>,
  errorLabel: string,
  fallbackHeaders?: Record<string, string>
): Promise<void> {
  // Prefer Chrome WebView fetch when host is ready — OkHttp is fingerprint-blocked
  // on some device networks (vkvideo.cloud → 403). Do not fall back to OkHttp then:
  // a failed WebView transfer would otherwise be reported as a misleading OkHttp 403.
  if (isMediaFetchReady()) {
    let lastStatus = 0;
    let lastError = '';
    for (let attempt = 0; attempt <= SEGMENT_RETRY_BACKOFF_MS.length; attempt++) {
      if (attempt > 0) await sleep(SEGMENT_RETRY_BACKOFF_MS[attempt - 1]);
      try {
        await FileSystem.deleteAsync(destPath, { idempotent: true });
      } catch {
        // ignore
      }
      try {
        const { status, base64 } = await webViewFetchBinary(remoteUrl);
        lastStatus = status;
        if (status >= 200 && status < 300 && base64) {
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
    throw new Error(lastError || `${errorLabel}: ${lastStatus || 'webview'}`);
  }

  const headerSets = fallbackHeaders ? [headers, fallbackHeaders] : [headers];
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
      lastStatus = result.status ?? 0;
      if (lastStatus >= 200 && lastStatus < 300) return;
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
 * Balancer quality entries are sometimes failover pairs:
 * `https://a.../master.m3u8 or https://b.../index`
 * Native players and fetch must receive a single absolute URL.
 */
export function pickPrimaryMediaUrl(url: string): string {
  return mediaUrlCandidates(url)[0] ?? url.trim();
}

/** All absolute candidates from a balancer "a or b" quality string. */
export function mediaUrlCandidates(url: string): string[] {
  const trimmed = url.trim();
  if (!trimmed) return [];
  const parts = trimmed
    .split(/\s+or\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length ? parts : [trimmed];
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
        const msg = e instanceof Error ? e.message : String(e);
        lastError = msg;
        const statusMatch = msg.match(/Failed to fetch playlist: (\d+)/);
        if (statusMatch) lastStatus = Number(statusMatch[1]);
        continue;
      }
    }

    const headers = mediaRequestHeaders(playerUrl);
    const tmpBase = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
    if (!tmpBase) continue;
    const tmpPath = `${tmpBase}playlist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.m3u8`;
    try {
      await FileSystem.deleteAsync(tmpPath, { idempotent: true });
      const result = await FileSystem.downloadAsync(candidate, tmpPath, { headers });
      lastStatus = result.status ?? 0;
      if (lastStatus >= 200 && lastStatus < 300) {
        const text = await FileSystem.readAsStringAsync(tmpPath);
        if (/#EXTM3U|#EXTINF|#EXT-X-/i.test(text)) return text;
        if (/403 Forbidden/i.test(text)) lastStatus = 403;
      }
      lastError = `Failed to fetch playlist: ${lastStatus || 'network'}`;
    } catch (e) {
      lastError = e instanceof Error ? e.message : `Failed to fetch playlist: network`;
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
  const primary = pickPrimaryMediaUrl(m3u8Url);
  const content = await fetchText(primary, playerUrl);
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
    const bandwidth = Number(line.match(/BANDWIDTH=(\d+)/i)?.[1] ?? 0);
    const height = Number(line.match(/RESOLUTION=\d+x(\d+)/i)?.[1] ?? 0);
    variants.push({ bandwidth, height, uri: pickPrimaryMediaUrl(resolveUrl(primary, next)) });
  }

  if (!variants.length) {
    return { url: primary, content };
  }

  variants.sort((a, b) => {
    const da = Math.abs((a.height || preferredHeight) - preferredHeight);
    const db = Math.abs((b.height || preferredHeight) - preferredHeight);
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

export async function downloadHlsToDirectory(
  m3u8Url: string,
  targetDir: string,
  preferredHeight: number,
  onProgress?: (progress: number) => void,
  playerUrl?: string
): Promise<DownloadHlsResult> {
  await FileSystem.makeDirectoryAsync(targetDir, { intermediates: true });

  const headers = mediaSegmentHeaders(playerUrl);
  const playlistHeaders = mediaRequestHeaders(playerUrl);
  const { url: variantUrl, content } = await resolveVariantPlaylist(
    m3u8Url,
    preferredHeight,
    playerUrl
  );
  const lines = parsePlaylistLines(content);

  type Job = { remoteUrl: string; localName: string };
  const jobs: Job[] = [];
  const rewritten: string[] = [];
  let mediaIndex = 0;

  for (const line of lines) {
    if (line.startsWith('#')) {
      const mapUri = line.match(/URI="([^"]+)"/)?.[1];
      if (mapUri && line.includes('EXT-X-MAP')) {
        const abs = pickPrimaryMediaUrl(resolveUrl(variantUrl, mapUri));
        const ext = abs.includes('.mp4') ? 'mp4' : abs.includes('.m4s') ? 'm4s' : 'bin';
        const localName = `init_${mediaIndex}.${ext}`;
        jobs.push({ remoteUrl: abs, localName });
        rewritten.push(line.replace(mapUri, localName));
        mediaIndex += 1;
      } else {
        rewritten.push(line);
      }
      continue;
    }

    const abs = pickPrimaryMediaUrl(resolveUrl(variantUrl, line));
    const ext = abs.includes('.m4s') ? 'm4s' : abs.includes('.mp4') ? 'mp4' : 'ts';
    const localName = `seg_${String(mediaIndex).padStart(5, '0')}.${ext}`;
    jobs.push({ remoteUrl: abs, localName });
    rewritten.push(localName);
    mediaIndex += 1;
  }

  const total = Math.max(jobs.length, 1);
  let doneCount = 0;

  // Skip segments already on disk (partial resume after interrupt).
  // Batch getInfoAsync — sequential scans starve the JS thread on long movies.
  const pending: Job[] = [];
  const scanConcurrency = 16;
  for (let i = 0; i < jobs.length; i += scanConcurrency) {
    const slice = jobs.slice(i, i + scanConcurrency);
    const infos = await Promise.all(
      slice.map(async (job) => {
        const filePath = `${targetDir}${job.localName}`;
        const info = await FileSystem.getInfoAsync(filePath);
        return { job, exists: info.exists && 'size' in info && (info.size ?? 0) > 0 };
      })
    );
    for (const { job, exists } of infos) {
      if (exists) doneCount += 1;
      else pending.push(job);
    }
  }
  onProgress?.(doneCount / (total + 1));

  // WebView bridge is serial/heavy (chunked postMessage); keep concurrency low.
  // OkHttp path can fan out more.
  const concurrency = isMediaFetchReady() ? 1 : 4;
  for (let i = 0; i < pending.length; i += concurrency) {
    const batch = pending.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (job) => {
        const filePath = `${targetDir}${job.localName}`;
        await downloadWithRetry(
          job.remoteUrl,
          filePath,
          headers,
          'Segment download failed',
          playlistHeaders
        );
      })
    );
    doneCount += batch.length;
    onProgress?.(Math.min(doneCount, jobs.length) / (total + 1));
  }

  // targetDir is already a file:// URI from expo-file-system — keep relative names so
  // the playlist stays portable next to the segments.
  const playlistPath = `${targetDir}index.m3u8`;
  await FileSystem.writeAsStringAsync(playlistPath, `${rewritten.join('\n')}\n`);
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
