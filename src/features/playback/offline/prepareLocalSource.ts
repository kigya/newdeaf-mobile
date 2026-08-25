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
  const withoutQuery = uri.split('?')[0];
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

function isLocalPlaylistRef(uri: string): boolean {
  if (!uri || uri.startsWith('http://') || uri.startsWith('https://')) return false;
  const bare = uri.split('?')[0].toLowerCase();
  return bare.endsWith('.m3u8');
}

function absolutePlaylistName(fileName: string): string {
  const base = fileName.replace(/^\.\//, '').split('?')[0];
  if (base.endsWith('.absolute.m3u8')) return base;
  if (base.endsWith('.m3u8')) return `${base.slice(0, -'.m3u8'.length)}.absolute.m3u8`;
  return `${base}.absolute.m3u8`;
}

/**
 * Rewrite one HLS playlist to absolute file:// media / URI= refs and ensure ENDLIST.
 * Nested local `.m3u8` refs are prepared recursively first.
 */
async function rewritePlaylistToAbsolute(sourceUri: string, depth = 0): Promise<string> {
  if (depth > 4) return sourceUri;

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
      // Legacy offline copies may still declare BYTERANGE against full files.
      // Sliced downloads strip these at write time; drop them defensively here.
      if (/^#EXT-X-BYTERANGE:/i.test(trimmed)) {
        continue;
      }
      if (trimmed === '#EXT-X-ENDLIST') hasEndList = true;

      const uriMatch = trimmed.match(/URI="([^"]+)"/);
      const isUriTag =
        uriMatch &&
        (trimmed.includes('EXT-X-MAP') ||
          trimmed.includes('EXT-X-KEY') ||
          /EXT-X-MEDIA:/i.test(trimmed));

      if (uriMatch && isUriTag) {
        let target = uriMatch[1];
        if (isLocalPlaylistRef(target)) {
          const childSource = joinFileUri(dir, target.split('?')[0]);
          await rewritePlaylistToAbsolute(childSource, depth + 1);
          target = absolutePlaylistName(target.split('?')[0]);
        }
        const abs = joinFileUri(dir, target);
        const withoutRange = trimmed
          .replace(/,BYTERANGE="[^"]*"/i, '')
          .replace(/BYTERANGE="[^"]*",?/i, '')
          .replace(/,\s*$/, '');
        out.push(withoutRange.replace(`URI="${uriMatch[1]}"`, `URI="${abs}"`));
      } else {
        out.push(trimmed);
      }
      continue;
    }

    if (isLocalPlaylistRef(trimmed)) {
      const childSource = joinFileUri(dir, trimmed.split('?')[0]);
      await rewritePlaylistToAbsolute(childSource, depth + 1);
      out.push(joinFileUri(dir, absolutePlaylistName(trimmed.split('?')[0])));
      continue;
    }

    out.push(joinFileUri(dir, trimmed));
  }

  if (!hasEndList) {
    out.push('#EXT-X-ENDLIST');
  }

  const leaf = sourceUri.split('?')[0].split('/').pop() || 'index.m3u8';
  const absolutePath = `${dir}${absolutePlaylistName(leaf)}`;
  await FileSystem.writeAsStringAsync(absolutePath, `${out.join('\n')}\n`);
  return absolutePath;
}

/**
 * ExoPlayer often stalls after the first HLS segment when the local playlist
 * uses bare relative names. Rewrite media / EXT-X-MAP / EXT-X-MEDIA URIs to
 * absolute file:// (including demuxed child video/audio playlists) and ensure
 * VOD end marker so the player does not wait for a live update.
 */
export async function prepareLocalPlaybackUri(
  path: string,
  mediaKind: 'hls' | 'progressive'
): Promise<string> {
  const sourceUri = ensureFileUri(path);
  if (mediaKind !== 'hls') {
    return sourceUri;
  }
  return rewritePlaylistToAbsolute(sourceUri);
}
