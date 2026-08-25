export function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[«»""']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function yearFromDate(date?: string): string | undefined {
  if (!date || date.length < 4) return undefined;
  return date.slice(0, 4);
}

export type TmdbSearchResult = {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string;
  media_type?: string;
};

export function scoreMatch(candidate: TmdbSearchResult, title: string, year?: string): number {
  const candTitle = normalizeTitle(candidate.title || candidate.name || '');
  const candOriginal = normalizeTitle(candidate.original_title || candidate.original_name || '');
  const want = normalizeTitle(title);
  let score = 0;
  if (candTitle === want || candOriginal === want) score += 100;
  else if (candTitle && (candTitle.includes(want) || want.includes(candTitle))) score += 40;
  else if (candOriginal && (candOriginal.includes(want) || want.includes(candOriginal))) score += 35;
  else return -1;

  if (year) {
    const cy = yearFromDate(candidate.release_date || candidate.first_air_date);
    if (cy === year) score += 50;
    else if (cy && Math.abs(Number(cy) - Number(year)) <= 1) score += 20;
  }
  return score;
}

export function cacheKey(title: string, year: string | undefined, locale: string): string {
  return `${locale}|${normalizeTitle(title)}|${year ?? ''}`;
}
