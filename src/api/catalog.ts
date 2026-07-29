import { fetchHtml } from './client';
import { parseMovieDetail, parseMovieList, parseSearchResults } from './parse';
import { BASE_URL, GENRES, type Genre, type MovieDetail, type MovieSummary } from './types';
import { encodeWin1251FormValue } from './win1251';

export async function fetchHomeMovies(page = 1): Promise<MovieSummary[]> {
  const path = page <= 1 ? '/' : `/page/${page}/`;
  const html = await fetchHtml(path);
  return parseMovieList(html);
}

export async function fetchGenreMovies(genreHref: string, page = 1): Promise<MovieSummary[]> {
  const base = genreHref.endsWith('/') ? genreHref : `${genreHref}/`;
  const path = page <= 1 ? base : `${base}page/${page}/`;
  const html = await fetchHtml(path);
  return parseMovieList(html);
}

export async function searchMovies(query: string): Promise<MovieSummary[]> {
  // Site expects windows-1251 form body; URLSearchParams would send UTF-8.
  const body = [
    'do=search',
    'subaction=search',
    `story=${encodeWin1251FormValue(query)}`,
    'titleonly=3',
  ].join('&');

  const html = await fetchHtml(`${BASE_URL}/index.php?do=search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  // DLE engine pauses search when the query is shorter than 4 characters.
  if (/менее\s+4\s+символ/i.test(html) || /поиск был приостановлен/i.test(html)) {
    throw new Error('Введите минимум 4 символа');
  }

  return parseSearchResults(html);
}

export async function fetchMovieDetail(hrefOrId: string): Promise<MovieDetail> {
  const href = hrefOrId.includes('.html') || hrefOrId.includes('newsid=')
    ? hrefOrId.startsWith('/') || hrefOrId.startsWith('http')
      ? hrefOrId
      : `/${hrefOrId}`
    : `/${hrefOrId}`;

  // Prefer pretty URL if we only have id
  const path = /^\d+$/.test(hrefOrId) ? undefined : href;
  if (path) {
    const html = await fetchHtml(path);
    return parseMovieDetail(html, path);
  }

  // id only — try newsid fallback
  const newsPath = `/www/index.php?newsid=${hrefOrId}`;
  const html = await fetchHtml(newsPath);
  return parseMovieDetail(html, newsPath);
}

export function getGenres(): Genre[] {
  return GENRES;
}

export { BASE_URL };
