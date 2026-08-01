/**
 * Pure URL helpers shared by HLS download / playlist planning.
 * Balancer quality entries may be failover pairs: `https://a... or https://b...`
 */

export function resolveUrl(base: string, relative: string): string {
  if (relative.startsWith('http://') || relative.startsWith('https://')) return relative;
  if (relative.startsWith('//')) return `https:${relative}`;
  try {
    return new URL(relative, base).toString();
  } catch {
    const trimmed = base.replace(/\/[^/]*$/, '/');
    return `${trimmed}${relative.replace(/^\//, '')}`;
  }
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
 * Balancer quality entries are sometimes failover pairs:
 * `https://a.../master.m3u8 or https://b.../index`
 * Native players and fetch must receive a single absolute URL.
 */
export function pickPrimaryMediaUrl(url: string): string {
  return mediaUrlCandidates(url)[0] ?? url.trim();
}
