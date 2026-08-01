import * as FileSystem from 'expo-file-system/legacy';

/** Ensure a local filesystem path is a usable `file://` URI for expo-video. */
export function ensureFileUri(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('file://')) return trimmed;
  if (trimmed.startsWith('/')) return `file://${trimmed}`;
  return trimmed;
}

function playlistDirectory(playlistUri: string): string {
  const uri = ensureFileUri(playlistUri);
  const withoutQuery = uri.split('?')[0] ?? uri;
  const idx = withoutQuery.lastIndexOf('/');
  return idx >= 0 ? withoutQuery.slice(0, idx + 1) : withoutQuery;
}

function joinFileUri(dirUri: string, name: string): string {
  if (name.startsWith('file://') || name.startsWith('http://') || name.startsWith('https://')) {
    return name;
  }
  const clean = name.replace(/^\.\//, '');
  const base = dirUri.endsWith('/') ? dirUri : `${dirUri}/`;
  return `${base}${clean}`;
}

/**
 * ExoPlayer often stalls after the first HLS segment when the local playlist
 * uses bare relative names. Rewrite media / EXT-X-MAP URIs to absolute file://
 * and ensure VOD end marker so the player does not wait for a live update.
 */
export async function prepareLocalPlaybackUri(
  path: string,
  mediaKind: 'hls' | 'progressive'
): Promise<string> {
  const sourceUri = ensureFileUri(path);
  if (mediaKind !== 'hls') {
    return sourceUri;
  }

  const info = await FileSystem.getInfoAsync(sourceUri);
  if (!info.exists) {
    return sourceUri;
  }

  const raw = await FileSystem.readAsStringAsync(sourceUri);
  const dir = playlistDirectory(sourceUri);
  const lines = raw.split(/\r?\n/);
  const out: string[] = [];
  let hasEndList = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      out.push(line);
      continue;
    }

    if (trimmed.startsWith('#')) {
      if (trimmed === '#EXT-X-ENDLIST') hasEndList = true;
      const mapMatch = trimmed.match(/URI="([^"]+)"/);
      if (mapMatch && (trimmed.includes('EXT-X-MAP') || trimmed.includes('EXT-X-KEY'))) {
        const abs = joinFileUri(dir, mapMatch[1]);
        out.push(trimmed.replace(`URI="${mapMatch[1]}"`, `URI="${abs}"`));
      } else {
        out.push(trimmed);
      }
      continue;
    }

    out.push(joinFileUri(dir, trimmed));
  }

  if (!hasEndList) {
    out.push('#EXT-X-ENDLIST');
  }

  const absolutePath = `${dir}index.absolute.m3u8`;
  await FileSystem.writeAsStringAsync(absolutePath, `${out.join('\n')}\n`);
  return absolutePath;
}
