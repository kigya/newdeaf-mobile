/**
 * Pure HLS playlist helpers for offline materialization.
 * Byte ranges are sliced into standalone local files so ExoPlayer never seeks
 * past EOF on fMP4/CMAF segments.
 */

import { pickPrimaryMediaUrl, resolveUrl } from '@/src/features/downloads/urlHelpers';

export type ByteRange = { offset: number; length: number };

export type HlsDownloadJob = {
  remoteUrl: string;
  localName: string;
  byteRange?: ByteRange;
};

export type PlannedHlsOffline = {
  jobs: HlsDownloadJob[];
  rewrittenLines: string[];
};

/** Parse `len` or `len@offset` (HLS BYTERANGE). */
export function parseByteRangeSpec(spec: string): ByteRange | null {
  const trimmed = spec.trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^(\d+)(?:@(\d+))?$/);
  if (!m) return null;
  const length = Number(m[1]);
  const offset = m[2] != null ? Number(m[2]) : 0;
  if (!Number.isFinite(length) || length <= 0 || !Number.isFinite(offset) || offset < 0) {
    return null;
  }
  return { offset, length };
}

/** Strip BYTERANGE="..." attribute from an EXT-X-MAP / EXT-X-KEY line. */
export function stripByteRangeAttribute(line: string): string {
  return line
    .replace(/,BYTERANGE="[^"]*"/i, '')
    .replace(/BYTERANGE="[^"]*",?/i, '')
    .replace(/,\s*$/, '');
}

/** Drop standalone #EXT-X-BYTERANGE lines (legacy playlists). */
export function isByteRangeTag(line: string): boolean {
  return /^#EXT-X-BYTERANGE:/i.test(line.trim());
}

function mediaExt(abs: string, isKey: boolean): string {
  if (isKey) return 'key';
  if (abs.includes('.mp4')) return 'mp4';
  if (abs.includes('.m4s')) return 'm4s';
  if (abs.includes('.ts')) return 'ts';
  return isKey ? 'key' : 'bin';
}

/**
 * Plan offline jobs from a media playlist: materialize BYTERANGE into discrete
 * local files and emit a playlist without BYTERANGE tags.
 */
export function planHlsOfflineDownload(
  playlistContent: string,
  variantUrl: string
): PlannedHlsOffline {
  const lines = playlistContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const jobs: HlsDownloadJob[] = [];
  const rewritten: string[] = [];
  let mediaIndex = 0;
  let pendingRange: ByteRange | null = null;

  for (const line of lines) {
    if (/^#EXT-X-BYTERANGE:/i.test(line)) {
      const spec = line.replace(/^#EXT-X-BYTERANGE:/i, '').trim();
      pendingRange = parseByteRangeSpec(spec);
      continue;
    }

    if (line.startsWith('#')) {
      const mapUri = line.match(/URI="([^"]+)"/)?.[1];
      if (mapUri && (line.includes('EXT-X-MAP') || line.includes('EXT-X-KEY'))) {
        const abs = pickPrimaryMediaUrl(resolveUrl(variantUrl, mapUri));
        const isKey = line.includes('EXT-X-KEY');
        const attrRange = line.match(/BYTERANGE="([^"]+)"/i)?.[1];
        const byteRange = attrRange ? parseByteRangeSpec(attrRange) : null;
        const ext = mediaExt(abs, isKey);
        const localName = isKey ? `key_${mediaIndex}.${ext}` : `init_${mediaIndex}.${ext}`;
        jobs.push({
          remoteUrl: abs,
          localName,
          ...(byteRange ? { byteRange } : {}),
        });
        let next = stripByteRangeAttribute(line).replace(mapUri, localName);
        rewritten.push(next);
        mediaIndex += 1;
      } else {
        rewritten.push(line);
      }
      continue;
    }

    const abs = pickPrimaryMediaUrl(resolveUrl(variantUrl, line));
    const ext = abs.includes('.m4s') ? 'm4s' : abs.includes('.mp4') ? 'mp4' : 'ts';
    const localName = `seg_${String(mediaIndex).padStart(5, '0')}.${ext}`;
    jobs.push({
      remoteUrl: abs,
      localName,
      ...(pendingRange ? { byteRange: pendingRange } : {}),
    });
    rewritten.push(localName);
    mediaIndex += 1;
    pendingRange = null;
  }

  if (!rewritten.some((l) => l.trim() === '#EXT-X-ENDLIST')) {
    rewritten.push('#EXT-X-ENDLIST');
  }

  return { jobs, rewrittenLines: rewritten };
}

/** Expected decoded byte length of a standard base64 string. */
export function base64DecodedLength(b64: string): number {
  const trimmed = b64.replace(/\s+/g, '');
  if (!trimmed) return 0;
  let padding = 0;
  if (trimmed.endsWith('==')) padding = 2;
  else if (trimmed.endsWith('=')) padding = 1;
  return Math.floor((trimmed.length * 3) / 4) - padding;
}
