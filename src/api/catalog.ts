import { fetchHtml } from './client';
import {
  parseCatalogPage,
  parseMovieDetail,
  parseMovieList,
  parsePlayerFileList,
  parseSearchResults,
} from './parse';
import {
  BASE_URL,
  GENRES,
  type Genre,
  type MovieDetail,
  type MovieSummary,
  type PlayerFileList,
} from './types';
import { encodeWin1251FormValue } from './win1251';
import { resolveRussianTitleForSearch } from './tmdb';
import { getLocale, t } from '@/src/i18n';

export type CatalogPageResult = {
  items: MovieSummary[];
  hasMore: boolean;
};

export async function fetchHomeMovies(page = 1): Promise<CatalogPageResult> {
  const path = page <= 1 ? '/' : `/page/${page}/`;
  const html = await fetchHtml(path);
  return parseCatalogPage(html, page);
}

export async function fetchGenreMovies(genreHref: string, page = 1): Promise<CatalogPageResult> {
  const base = genreHref.endsWith('/') ? genreHref : `${genreHref}/`;
  const path = page <= 1 ? base : `${base}page/${page}/`;
  const html = await fetchHtml(path);
  return parseCatalogPage(html, page);
}

export async function searchMovies(query: string): Promise<MovieSummary[]> {
  const trimmed = query.trim();
  let story = trimmed;

  // newdeaf search works best with Russian titles — bridge EN/Latin queries via TMDB.
  if (getLocale() === 'en' || !/[\u0400-\u04FF]/.test(trimmed)) {
    try {
      const ruTitle = await resolveRussianTitleForSearch(trimmed);
      if (ruTitle && ruTitle.trim().length >= 2) {
        story = ruTitle.trim();
      }
    } catch {
      // keep original query
    }
  }

  const body = [
    'do=search',
    'subaction=search',
    `story=${encodeWin1251FormValue(story)}`,
    'titleonly=3',
  ].join('&');

  const html = await fetchHtml(`${BASE_URL}/index.php?do=search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (/менее\s+4\s+символ/i.test(html) || /поиск был приостановлен/i.test(html)) {
    throw new Error(t('catalogApi.minSearch'));
  }

  const results = parseSearchResults(html);

  // If bridged search returned nothing, retry with the original user query.
  if (!results.length && story !== trimmed) {
    const fallbackBody = [
      'do=search',
      'subaction=search',
      `story=${encodeWin1251FormValue(trimmed)}`,
      'titleonly=3',
    ].join('&');
    const fallbackHtml = await fetchHtml(`${BASE_URL}/index.php?do=search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: fallbackBody,
    });
    if (!/менее\s+4\s+символ/i.test(fallbackHtml) && !/поиск был приостановлен/i.test(fallbackHtml)) {
      return parseSearchResults(fallbackHtml);
    }
  }

  return results;
}

export async function fetchMovieDetail(hrefOrId: string): Promise<MovieDetail> {
  const href =
    hrefOrId.includes('.html') || hrefOrId.includes('newsid=')
      ? hrefOrId.startsWith('/') || hrefOrId.startsWith('http')
        ? hrefOrId
        : `/${hrefOrId}`
      : `/${hrefOrId}`;

  const path = /^\d+$/.test(hrefOrId) ? undefined : href;
  if (path) {
    const html = await fetchHtml(path);
    return parseMovieDetail(html, path);
  }

  const newsPath = `/www/index.php?newsid=${hrefOrId}`;
  const html = await fetchHtml(newsPath);
  return parseMovieDetail(html, newsPath);
}

export async function fetchPlayerFileList(playerUrl: string): Promise<PlayerFileList | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(playerUrl, {
      signal: controller.signal,
      headers: {
        Accept: 'text/html',
        Referer: `${BASE_URL}/`,
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    return parsePlayerFileList(html);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function getGenres(): Genre[] {
  return GENRES;
}

export { BASE_URL, parseMovieList };
