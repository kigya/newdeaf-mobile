import { isTmdbConfigured, tmdbFetch } from './client';
import { yearFromDate } from './match';
import type { TmdbDiscoverItem } from './types';

type Result = {
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string;
  media_type?: string;
};

type Page = { results?: Result[] };

function mapResults(results: Result[] | undefined, fallbackType: 'movie' | 'tv'): TmdbDiscoverItem[] {
  const out: TmdbDiscoverItem[] = [];
  for (const r of results ?? []) {
    const title = (r.title || r.name || '').trim();
    if (title.length < 2) continue;
    const mediaType: 'movie' | 'tv' =
      r.media_type === 'tv' ? 'tv' : r.media_type === 'movie' ? 'movie' : fallbackType;
    out.push({
      title,
      originalTitle: r.original_title || r.original_name || undefined,
      year: yearFromDate(r.release_date || r.first_air_date),
      posterPath: r.poster_path || undefined,
      mediaType,
    });
  }
  return out;
}

export async function fetchTmdbTrending(): Promise<TmdbDiscoverItem[]> {
  if (!isTmdbConfigured()) return [];
  try {
    const [movies, tv] = await Promise.all([
      tmdbFetch<Page>('/trending/movie/week'),
      tmdbFetch<Page>('/trending/tv/week'),
    ]);
    return [...mapResults(movies.results, 'movie'), ...mapResults(tv.results, 'tv')].slice(0, 24);
  } catch {
    return [];
  }
}

export async function fetchTmdbUpcoming(): Promise<TmdbDiscoverItem[]> {
  if (!isTmdbConfigured()) return [];
  try {
    const data = await tmdbFetch<Page>('/movie/upcoming');
    return mapResults(data.results, 'movie').slice(0, 20);
  } catch {
    return [];
  }
}
