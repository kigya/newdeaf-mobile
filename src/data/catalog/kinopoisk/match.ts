import { kpFetch } from './client';

export function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[«»""']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strip episode badges / trailing season index for better KP search. */
export function titleForSearch(title: string): string {
  return title
    .replace(/\s*[—–-]\s*S\d+E\d+\s*$/i, '')
    .replace(/\s*\(\d{4}\)\s*$/, '')
    .replace(/\s+\d{1,2}\s*$/, '')
    .trim();
}

export function scoreMatch(
  candidate: {
    nameRu?: string | null;
    nameEn?: string | null;
    nameOriginal?: string | null;
    year?: number | string | null;
    type?: string | null;
  },
  title: string,
  year?: string,
  isSeries?: boolean
): number {
  const candTitle = normalizeTitle(candidate.nameRu || '');
  const candEn = normalizeTitle(candidate.nameEn || candidate.nameOriginal || '');
  const want = normalizeTitle(titleForSearch(title));
  let score = 0;
  if (candTitle === want || candEn === want) score += 100;
  else if (candTitle && (candTitle.includes(want) || want.includes(candTitle))) score += 40;
  else if (candEn && (candEn.includes(want) || want.includes(candEn))) score += 35;
  else return -1;

  if (year) {
    const cy = String(candidate.year ?? '').slice(0, 4);
    if (cy === year) score += 50;
    else if (cy && Math.abs(Number(cy) - Number(year)) <= 1) score += 20;
    else if (isSeries && cy && Math.abs(Number(cy) - Number(year)) <= 15) score += 5;
  }

  const type = (candidate.type || '').toUpperCase();
  if (isSeries && (type === 'TV_SERIES' || type === 'MINI_SERIES' || type === 'TV_SHOW')) {
    score += 25;
  }
  if (!isSeries && type === 'FILM') {
    score += 10;
  }
  return score;
}

type SearchFilm = {
  filmId?: number;
  kinopoiskId?: number;
  nameRu?: string | null;
  nameEn?: string | null;
  nameOriginal?: string | null;
  year?: string | number | null;
  type?: string;
};

type SearchResponse = {
  films?: SearchFilm[];
  items?: SearchFilm[];
};

const idCache = new Map<string, number | null>();

export async function resolveKinopoiskId(input: {
  title: string;
  originalTitle?: string;
  year?: string;
  isSeries?: boolean;
}): Promise<number | null> {
  const query = titleForSearch(input.title.trim());
  const key = `${normalizeTitle(query)}|${input.year ?? ''}|${input.isSeries ? 's' : 'm'}`;
  if (idCache.has(key)) {
    return idCache.get(key) ?? null;
  }
  if (query.length < 2) {
    idCache.set(key, null);
    return null;
  }

  try {
    const data = await kpFetch<SearchResponse>(
      `/api/v2.1/films/search-by-keyword?keyword=${encodeURIComponent(query)}&page=1`
    );
    const list = data.films ?? data.items ?? [];
    let best: SearchFilm | null = null;
    let bestScore = -1;
    for (const film of list) {
      const score = scoreMatch(film, query, input.year, input.isSeries);
      if (score > bestScore) {
        bestScore = score;
        best = film;
      }
    }

    if ((!best || bestScore < 40) && input.originalTitle) {
      const altQuery = titleForSearch(input.originalTitle);
      if (altQuery && normalizeTitle(altQuery) !== normalizeTitle(query)) {
        const alt = await kpFetch<SearchResponse>(
          `/api/v2.1/films/search-by-keyword?keyword=${encodeURIComponent(altQuery)}&page=1`
        );
        for (const film of alt.films ?? alt.items ?? []) {
          const score = scoreMatch(film, altQuery, input.year, input.isSeries);
          if (score > bestScore) {
            bestScore = score;
            best = film;
          }
        }
      }
    }

    if (!best || bestScore < 40) {
      idCache.set(key, null);
      return null;
    }
    const id = best.filmId ?? best.kinopoiskId ?? null;
    idCache.set(key, id);
    return id;
  } catch {
    return null;
  }
}
