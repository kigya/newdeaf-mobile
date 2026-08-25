jest.mock('@/src/data/catalog/client', () => ({
  fetchHtml: jest.fn(),
}));

jest.mock('@/src/data/catalog/parse', () => {
  const actual = jest.requireActual('@/src/data/catalog/parse') as typeof import('@/src/data/catalog/parse');
  return {
    parseCatalogPage: jest.fn(),
    parseMovieDetail: jest.fn(),
    parseMovieList: jest.fn(),
    parsePlayerFileList: jest.fn(),
    parseSearchResults: jest.fn(),
    parseMovieIdFromHref: actual.parseMovieIdFromHref,
  };
});

jest.mock('@/src/data/catalog/tmdb', () => ({
  resolveRussianTitleForSearch: jest.fn(),
}));

jest.mock('@/src/shared/i18n', () => {
  const actual = jest.requireActual('@/src/shared/i18n');
  return {
    ...actual,
    getLocale: jest.fn(() => 'en'),
  };
});

import { fetchHtml } from '@/src/data/catalog/client';
import {
  parseCatalogPage,
  parseMovieDetail,
  parsePlayerFileList,
  parseSearchResults,
} from '@/src/data/catalog/parse';
import { resolveRussianTitleForSearch } from '@/src/data/catalog/tmdb';
import {
  fetchGenreMovies,
  fetchHomeMovies,
  fetchMovieDetail,
  fetchPlayerFileList,
  fetchSitePopular,
  getGenres,
  searchMovies,
} from '@/src/data/catalog/catalog';
import { BASE_URL, GENRES } from '@/src/data/catalog/types';
import { getLocale, t } from '@/src/shared/i18n';

describe('catalog api', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getLocale as jest.Mock).mockReturnValue('en');
  });

  it('fetchHomeMovies uses root or page path', async () => {
    (fetchHtml as jest.Mock).mockResolvedValue('<html/>');
    (parseCatalogPage as jest.Mock).mockReturnValue({ items: [], hasMore: false });

    await fetchHomeMovies();
    expect(fetchHtml).toHaveBeenCalledWith('/');
    expect(parseCatalogPage).toHaveBeenCalledWith('<html/>', 1);

    await fetchHomeMovies(3);
    expect(fetchHtml).toHaveBeenCalledWith('/page/3/');
  });

  it('fetchSitePopular reads homepage carousel', async () => {
    (fetchHtml as jest.Mock).mockResolvedValue('<div id="owl-popular"></div>');
    await fetchSitePopular();
    expect(fetchHtml).toHaveBeenCalledWith('/');
  });

  it('fetchGenreMovies normalizes trailing slash and pages', async () => {
    (fetchHtml as jest.Mock).mockResolvedValue('g');
    (parseCatalogPage as jest.Mock).mockReturnValue({ items: [{ id: '1' }], hasMore: true });

    await fetchGenreMovies('/genre/action');
    expect(fetchHtml).toHaveBeenCalledWith('/genre/action/');

    await fetchGenreMovies('/genre/action/', 2);
    expect(fetchHtml).toHaveBeenCalledWith('/genre/action/page/2/');
  });

  it('searchMovies bridges Latin queries via TMDB', async () => {
    (resolveRussianTitleForSearch as jest.Mock).mockResolvedValue('Матрица');
    (fetchHtml as jest.Mock).mockResolvedValue('ok');
    (parseSearchResults as jest.Mock).mockReturnValue([{ id: '1', title: 'Матрица' }]);

    const results = await searchMovies('Matrix');
    expect(resolveRussianTitleForSearch).toHaveBeenCalledWith('Matrix');
    expect(fetchHtml).toHaveBeenCalledWith(
      `${BASE_URL}/index.php?do=search`,
      expect.objectContaining({ method: 'POST' })
    );
    expect(results).toHaveLength(1);
  });

  it('searchMovies falls back to original query when bridge empty', async () => {
    (resolveRussianTitleForSearch as jest.Mock).mockResolvedValue('Мост');
    (fetchHtml as jest.Mock)
      .mockResolvedValueOnce('empty-bridge')
      .mockResolvedValueOnce('fallback-html');
    (parseSearchResults as jest.Mock)
      .mockReturnValueOnce([])
      .mockReturnValueOnce([{ id: '2', title: 'Matrix' }]);

    const results = await searchMovies('Matrix');
    expect(fetchHtml).toHaveBeenCalledTimes(2);
    expect(results[0].id).toBe('2');
  });

  it('searchMovies throws on min length / suspended HTML', async () => {
    (resolveRussianTitleForSearch as jest.Mock).mockResolvedValue(null);
    (fetchHtml as jest.Mock).mockResolvedValue('поиск менее 4 символов');
    await expect(searchMovies('ab')).rejects.toThrow(t('catalogApi.minSearch'));
  });

  it('searchMovies keeps original when TMDB fails', async () => {
    (getLocale as jest.Mock).mockReturnValue('ru');
    (resolveRussianTitleForSearch as jest.Mock).mockRejectedValue(new Error('net'));
    (fetchHtml as jest.Mock).mockResolvedValue('ok');
    (parseSearchResults as jest.Mock).mockReturnValue([]);
    await searchMovies('Интерстеллар');
    expect(fetchHtml).toHaveBeenCalled();
  });

  it('searchMovies skips bridge for Cyrillic on ru locale', async () => {
    (getLocale as jest.Mock).mockReturnValue('ru');
    (fetchHtml as jest.Mock).mockResolvedValue('ok');
    (parseSearchResults as jest.Mock).mockReturnValue([{ id: '1' }]);
    await searchMovies('Матрица');
    expect(resolveRussianTitleForSearch).not.toHaveBeenCalled();
  });

  it('searchMovies keeps bridge result when fallback HTML is min-length error', async () => {
    (resolveRussianTitleForSearch as jest.Mock).mockResolvedValue('Мост');
    (fetchHtml as jest.Mock)
      .mockResolvedValueOnce('empty-bridge')
      .mockResolvedValueOnce('поиск менее 4 символов');
    (parseSearchResults as jest.Mock).mockReturnValueOnce([]);

    const results = await searchMovies('Matrix');
    expect(results).toEqual([]);
  });

  it('fetchMovieDetail handles html path, relative path, newsid query, and numeric newsid', async () => {
    (fetchHtml as jest.Mock).mockResolvedValue('html');
    (parseMovieDetail as jest.Mock).mockReturnValue({ id: '1', title: 'T' });

    await fetchMovieDetail('/film.html');
    expect(fetchHtml).toHaveBeenCalledWith('/film.html');

    await fetchMovieDetail('film.html');
    expect(fetchHtml).toHaveBeenCalledWith('/film.html');

    await fetchMovieDetail('index.php?newsid=99');
    expect(fetchHtml).toHaveBeenCalledWith('/index.php?newsid=99');

    await fetchMovieDetail('12345');
    expect(fetchHtml).toHaveBeenCalledWith('/www/index.php?newsid=12345');
  });

  it('fetchPlayerFileList returns parsed list or null', async () => {
    jest.useFakeTimers();
    const fetchMock = jest.spyOn(global, 'fetch' as never) as unknown as jest.Mock;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => '<player/>',
    });
    (parsePlayerFileList as jest.Mock).mockReturnValue({ file: [] });
    expect(await fetchPlayerFileList('https://player/x')).toEqual({ file: [] });

    fetchMock.mockResolvedValueOnce({ ok: false, text: async () => '' });
    expect(await fetchPlayerFileList('https://player/x')).toBeNull();

    fetchMock.mockRejectedValueOnce(new Error('net'));
    expect(await fetchPlayerFileList('https://player/x')).toBeNull();

    fetchMock.mockImplementationOnce(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        })
    );
    const pending = fetchPlayerFileList('https://player/slow');
    await jest.advanceTimersByTimeAsync(20000);
    expect(await pending).toBeNull();

    fetchMock.mockRestore();
    jest.useRealTimers();
  });

  it('getGenres returns GENRES', () => {
    expect(getGenres()).toBe(GENRES);
  });
});
