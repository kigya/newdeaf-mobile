import { getLocale } from '@/src/shared/i18n';

const TMDB_API = 'https://api.themoviedb.org/3';
const API_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY ?? '';
const READ_TOKEN = process.env.EXPO_PUBLIC_TMDB_READ_TOKEN ?? '';

export type TmdbLocalizedMeta = {
  tmdbId: number;
  title: string;
  originalTitle?: string;
  overview?: string;
  actors: string[];
  director?: string;
  posterPath?: string;
  /** Russian title for newdeaf search bridging. */
  russianTitle?: string;
  year?: string;
};

type CacheEntry = TmdbLocalizedMeta;
const memoryCache = new Map<string, CacheEntry | null>();

function tmdbLanguage(): string {
  return getLocale() === 'ru' ? 'ru-RU' : 'en-US';
}

function authHeaders(): Record<string, string> {
  if (READ_TOKEN) {
    return {
      Accept: 'application/json',
      Authorization: `Bearer ${READ_TOKEN}`,
    };
  }
  return { Accept: 'application/json' };
}

function withKey(url: string): string {
  if (READ_TOKEN) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}api_key=${encodeURIComponent(API_KEY)}`;
}

async function tmdbFetch<T>(pathAndQuery: string): Promise<T> {
  if (!API_KEY && !READ_TOKEN) {
    throw new Error('TMDB key missing');
  }
  const res = await fetch(withKey(`${TMDB_API}${pathAndQuery}`), {
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(`TMDB HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[«»""']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function yearFromDate(date?: string): string | undefined {
  if (!date || date.length < 4) return undefined;
  return date.slice(0, 4);
}

type TmdbSearchResult = {
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

type TmdbSearchResponse = { results?: TmdbSearchResult[] };

type TmdbCredits = {
  cast?: { name?: string; order?: number }[];
  crew?: { name?: string; job?: string; department?: string }[];
};

type TmdbAltTitles = {
  titles?: { iso_3166_1?: string; title?: string; type?: string }[];
};

function cacheKey(title: string, year: string | undefined, locale: string): string {
  return `${locale}|${normalizeTitle(title)}|${year ?? ''}`;
}

function scoreMatch(candidate: TmdbSearchResult, title: string, year?: string): number {
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

async function fetchRussianTitle(tmdbId: number, mediaType: 'movie' | 'tv'): Promise<string | undefined> {
  try {
    if (mediaType === 'movie') {
      const alts = await tmdbFetch<TmdbAltTitles>(`/movie/${tmdbId}/alternative_titles`);
      const ru = alts.titles?.find((t) => t.iso_3166_1 === 'RU' && t.title);
      if (ru?.title) return ru.title.trim();
      const localized = await tmdbFetch<{ title?: string }>(`/movie/${tmdbId}?language=ru-RU`);
      return localized.title?.trim() || undefined;
    }
    const localized = await tmdbFetch<{ name?: string }>(`/tv/${tmdbId}?language=ru-RU`);
    return localized.name?.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function fetchCredits(
  tmdbId: number,
  mediaType: 'movie' | 'tv'
): Promise<{ actors: string[]; director?: string }> {
  try {
    const credits = await tmdbFetch<TmdbCredits>(`/${mediaType}/${tmdbId}/credits`);
    const actors = (credits.cast ?? [])
      .slice()
      .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
      .map((c) => (c.name ?? '').trim())
      .filter(Boolean)
      .slice(0, 12);
    const director = (credits.crew ?? [])
      .find((c) => c.job === 'Director' && c.name)
      ?.name?.trim();
    return { actors, director };
  } catch {
    return { actors: [] };
  }
}

/**
 * Enrich scraped newdeaf metadata with TMDB localized title/plot/cast.
 * Returns null when no confident match (caller keeps scrape fields).
 * Transient HTTP errors are not cached as null so the next open can retry.
 */
export async function enrichMovieMetadata(input: {
  title: string;
  originalTitle?: string;
  year?: string;
  isSeries?: boolean;
}): Promise<TmdbLocalizedMeta | null> {
  const locale = tmdbLanguage();
  const key = cacheKey(input.originalTitle || input.title, input.year, locale);
  if (memoryCache.has(key)) {
    return memoryCache.get(key) ?? null;
  }

  try {
    const query = (input.originalTitle || input.title).trim();
    if (query.length < 2) {
      // Definite miss — safe to cache.
      memoryCache.set(key, null);
      return null;
    }

    const lang = locale;
    const yearParam = input.year ? `&year=${encodeURIComponent(input.year)}` : '';
    const multi = await tmdbFetch<TmdbSearchResponse>(
      `/search/multi?query=${encodeURIComponent(query)}&language=${lang}&include_adult=false`
    );

    let best: TmdbSearchResult | null = null;
    let bestScore = -1;
    for (const r of multi.results ?? []) {
      const media = r.media_type;
      if (media !== 'movie' && media !== 'tv') continue;
      if (input.isSeries && media === 'movie') continue;
      const score = scoreMatch(r, query, input.year);
      if (score > bestScore) {
        bestScore = score;
        best = r;
      }
    }

    // Fallback: dedicated movie search with year.
    if (!best || bestScore < 40) {
      const movieSearch = await tmdbFetch<TmdbSearchResponse>(
        `/search/movie?query=${encodeURIComponent(query)}&language=${lang}${yearParam}`
      );
      for (const r of movieSearch.results ?? []) {
        const score = scoreMatch({ ...r, media_type: 'movie' }, query, input.year);
        if (score > bestScore) {
          bestScore = score;
          best = { ...r, media_type: 'movie' };
        }
      }
    }

    if (!best || bestScore < 40) {
      // Confident no-match — cache null.
      memoryCache.set(key, null);
      return null;
    }

    const mediaType: 'movie' | 'tv' = best.media_type === 'tv' ? 'tv' : 'movie';
    const detail = await tmdbFetch<{
      id: number;
      title?: string;
      name?: string;
      original_title?: string;
      original_name?: string;
      overview?: string;
      poster_path?: string;
      release_date?: string;
      first_air_date?: string;
    }>(`/${mediaType}/${best.id}?language=${lang}`);

    const { actors, director } = await fetchCredits(best.id, mediaType);
    const russianTitle = await fetchRussianTitle(best.id, mediaType);

    const meta: TmdbLocalizedMeta = {
      tmdbId: detail.id,
      title: (detail.title || detail.name || best.title || best.name || input.title).trim(),
      originalTitle: detail.original_title || detail.original_name || undefined,
      overview: detail.overview?.trim() || undefined,
      actors,
      director,
      posterPath: detail.poster_path || best.poster_path || undefined,
      russianTitle,
      year: yearFromDate(detail.release_date || detail.first_air_date),
    };

    memoryCache.set(key, meta);
    return meta;
  } catch {
    // Transient failure — do not sticky-cache null.
    return null;
  }
}

/** For English (Latin) search queries — resolve a Russian title for newdeaf. */
export async function resolveRussianTitleForSearch(query: string): Promise<string | null> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return null;

  // Already Cyrillic-heavy — no bridge needed.
  const cyrillic = (trimmed.match(/[\u0400-\u04FF]/g) ?? []).length;
  if (cyrillic >= Math.max(2, trimmed.length * 0.3)) {
    return null;
  }

  const key = `search-ru|${normalizeTitle(trimmed)}`;
  if (memoryCache.has(key)) {
    const cached = memoryCache.get(key);
    return cached?.russianTitle || cached?.title || null;
  }

  try {
    const multi = await tmdbFetch<TmdbSearchResponse>(
      `/search/multi?query=${encodeURIComponent(trimmed)}&language=en-US&include_adult=false`
    );
    let best: TmdbSearchResult | null = null;
    let bestScore = -1;
    for (const r of multi.results ?? []) {
      if (r.media_type !== 'movie' && r.media_type !== 'tv') continue;
      const score = scoreMatch(r, trimmed);
      if (score > bestScore) {
        bestScore = score;
        best = r;
      }
    }
    if (!best || bestScore < 40) {
      memoryCache.set(key, null);
      return null;
    }
    const mediaType: 'movie' | 'tv' = best.media_type === 'tv' ? 'tv' : 'movie';
    const russianTitle = await fetchRussianTitle(best.id, mediaType);
    let fallbackTitle = trimmed;
    for (const s of [best.original_title, best.original_name, best.title, best.name]) {
      const t = (s ?? '').trim();
      if (t) {
        fallbackTitle = t;
        break;
      }
    }
    const resolved = (russianTitle && russianTitle.trim()) || fallbackTitle;
    memoryCache.set(key, {
      tmdbId: best.id,
      title: resolved,
      russianTitle: russianTitle || undefined,
      actors: [],
    });
    return resolved;
  } catch {
    // Transient — allow retry on next search.
    return null;
  }
}

export function isTmdbConfigured(): boolean {
  return Boolean(API_KEY || READ_TOKEN);
}
