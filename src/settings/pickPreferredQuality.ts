import type { PreferredDownloadQuality } from './types';

/**
 * Pick from available height keys (e.g. "1080","720") using settings preference.
 * - best → highest available
 * - otherwise exact match, else closest height ≤ preferred, else highest
 */
export function pickPreferredQuality(
  available: string[],
  preferred: PreferredDownloadQuality
): string {
  if (!available.length) return preferred === 'best' ? '720' : preferred;

  const heights = available
    .map((q) => ({ key: q, n: Number.parseInt(q, 10) }))
    .filter((x) => Number.isFinite(x.n) && x.n > 0)
    .sort((a, b) => b.n - a.n);

  if (!heights.length) return available[0];

  if (preferred === 'best') {
    return heights[0].key;
  }

  const want = Number.parseInt(preferred, 10);
  const exact = heights.find((h) => h.n === want);
  if (exact) return exact.key;

  const atOrBelow = heights.find((h) => h.n <= want);
  if (atOrBelow) return atOrBelow.key;

  return heights[0].key;
}
