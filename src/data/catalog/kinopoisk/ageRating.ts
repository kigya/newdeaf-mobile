/** Kinopoisk Unofficial API sends `ratingAgeLimits` as `age18`; show `18+`. */
export function formatAgeRating(raw?: string | null): string | undefined {
  if (raw == null) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const prefixed = /^age(\d+)\+?$/i.exec(trimmed);
  if (prefixed) return `${prefixed[1]}+`;
  if (/^\d+$/.test(trimmed)) return `${trimmed}+`;
  return trimmed;
}
