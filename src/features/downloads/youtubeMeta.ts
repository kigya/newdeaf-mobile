/** Pure YouTube metadata helpers (kept separate for focused unit coverage). */

export function resolveVideoTitle(title: string | undefined | null, videoId: string): string {
  const trimmed = typeof title === 'string' ? title.trim() : '';
  return trimmed.length > 0 ? trimmed : `YouTube ${videoId}`;
}

export function parseHeightLabel(label: string | undefined | null): number {
  const n = Number(String(label || '').replace(/[^\d]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function qualityOrDefault(preferredHeight: number | undefined, fallback = 720): string {
  return String(preferredHeight && preferredHeight > 0 ? preferredHeight : fallback);
}

export function pickLargestThumbUrl(
  thumbs: { url: string; width?: number }[] | undefined | null
): string | undefined {
  if (!thumbs?.length) return undefined;
  const sorted = [...thumbs].sort((a, b) => (b.width || 0) - (a.width || 0));
  return sorted[0]?.url;
}

export function pickYoutubeiPoster(info: {
  basic_info?: { thumbnail?: { url?: string }[] };
}): string | undefined {
  return info.basic_info?.thumbnail?.[0]?.url;
}

export function youtubeiFormats(info: {
  streaming_data?: { formats?: unknown[] };
}): unknown[] {
  return info.streaming_data?.formats || [];
}

export function youtubeiHls(info: {
  streaming_data?: { hls_manifest_url?: string };
}): string | undefined {
  return info.streaming_data?.hls_manifest_url;
}

export function firstStreamUrl(url: string | undefined, deciphered: string): string {
  return url || deciphered;
}

/** Decipher a chooseFormat result when the direct url is empty. */
export async function decipherStreamUrl(
  decipher: () => Promise<string | undefined>
): Promise<string> {
  try {
    return firstStreamUrl(undefined, (await decipher()) || '');
  } catch {
    return '';
  }
}
