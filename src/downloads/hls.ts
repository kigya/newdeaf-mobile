import * as FileSystem from 'expo-file-system/legacy';

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

function parsePlaylistLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/** CDN playlists require the player Origin — newdeaf.top Referer alone returns 403. */
export function mediaRequestHeaders(playerUrl?: string): Record<string, string> {
  let origin = 'https://biorn-as.stloadi.live:9443';
  try {
    if (playerUrl) origin = new URL(playerUrl).origin;
  } catch {
    // keep default
  }
  return {
    'User-Agent': USER_AGENT,
    Referer: `${origin}/`,
    Origin: origin,
  };
}

async function fetchText(url: string, playerUrl?: string): Promise<string> {
  const res = await fetch(url, {
    headers: mediaRequestHeaders(playerUrl),
  });
  if (!res.ok) throw new Error(`Failed to fetch playlist: ${res.status}`);
  return res.text();
}

export async function resolveVariantPlaylist(
  m3u8Url: string,
  preferredHeight: number,
  playerUrl?: string
): Promise<{ url: string; content: string }> {
  const content = await fetchText(m3u8Url, playerUrl);
  if (!content.includes('#EXT-X-STREAM-INF')) {
    return { url: m3u8Url, content };
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
    variants.push({ bandwidth, height, uri: resolveUrl(m3u8Url, next) });
  }

  if (!variants.length) {
    return { url: m3u8Url, content };
  }

  variants.sort((a, b) => {
    const da = Math.abs((a.height || preferredHeight) - preferredHeight);
    const db = Math.abs((b.height || preferredHeight) - preferredHeight);
    if (da !== db) return da - db;
    return b.bandwidth - a.bandwidth;
  });

  const best = variants[0];
  const variantContent = await fetchText(best.uri, playerUrl);
  return { url: best.uri, content: variantContent };
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

  const headers = mediaRequestHeaders(playerUrl);
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
        const abs = resolveUrl(variantUrl, mapUri);
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

    const abs = resolveUrl(variantUrl, line);
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

  // Download segments in parallel — sequential is too slow for long movies.
  const concurrency = 4;
  for (let i = 0; i < pending.length; i += concurrency) {
    const batch = pending.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (job) => {
        const filePath = `${targetDir}${job.localName}`;
        const result = await FileSystem.downloadAsync(job.remoteUrl, filePath, { headers });
        if (result.status && result.status >= 400) {
          throw new Error(`Segment download failed: ${result.status}`);
        }
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
  const result = await FileSystem.downloadAsync(url, destPath, {
    headers: mediaRequestHeaders(playerUrl),
  });
  if (result.status && result.status >= 400) {
    throw new Error(`Subtitle download failed: ${result.status}`);
  }
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
