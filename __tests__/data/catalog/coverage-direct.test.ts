const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

jest.mock('@/src/data/catalog/resolveInCatalog', () => ({
  resolveInCatalog: jest.fn(async () => []),
}));

import { scoreMatch as kpScoreMatch } from '@/src/data/catalog/kinopoisk/match';
import { fetchKinopoiskExtras } from '@/src/data/catalog/kinopoisk/extras';
import { fetchKpCollection, fetchKpTop } from '@/src/data/catalog/kinopoisk/collections';
import { fetchTmdbExtras, pickTmdbTrailerKey } from '@/src/data/catalog/tmdb/extras';
import { fetchTmdbTrending, fetchTmdbUpcoming } from '@/src/data/catalog/tmdb/discover';

function ok(data: unknown) {
  return { ok: true, status: 200, json: async () => data };
}

describe('direct extras/collections/discover coverage', () => {
  const prevKp = process.env.EXPO_PUBLIC_KINOPOISK_API_KEY;
  const prevTmdb = process.env.EXPO_PUBLIC_TMDB_API_KEY;
  const prevTok = process.env.EXPO_PUBLIC_TMDB_READ_TOKEN;

  beforeEach(() => {
    fetchMock.mockReset();
    process.env.EXPO_PUBLIC_KINOPOISK_API_KEY = 'kp-key';
    process.env.EXPO_PUBLIC_TMDB_API_KEY = 'tmdb-key';
    delete process.env.EXPO_PUBLIC_TMDB_READ_TOKEN;
  });

  afterAll(() => {
    if (prevKp === undefined) delete process.env.EXPO_PUBLIC_KINOPOISK_API_KEY;
    else process.env.EXPO_PUBLIC_KINOPOISK_API_KEY = prevKp;
    if (prevTmdb === undefined) delete process.env.EXPO_PUBLIC_TMDB_API_KEY;
    else process.env.EXPO_PUBLIC_TMDB_API_KEY = prevTmdb;
    if (prevTok === undefined) delete process.env.EXPO_PUBLIC_TMDB_READ_TOKEN;
    else process.env.EXPO_PUBLIC_TMDB_READ_TOKEN = prevTok;
  });

  it('fetchKpTop and collections map items or empty lists', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ items: [{ nameRu: 'Top Film Title', year: 2024 }] })
    );
    const top = await fetchKpTop('TOP_AWAIT_FILMS');
    expect(top[0].nameRu).toBe('Top Film Title');

    fetchMock.mockResolvedValueOnce(ok({}));
    expect(await fetchKpCollection('TOP_250_MOVIES')).toEqual([]);
  });

  it('fetchKinopoiskExtras soft-fails section fetches', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.match(/\/films\/901$/)) throw new Error('detail');
      if (u.includes('/images?type=STILL')) throw new Error('stills');
      if (u.includes('/images?type=WALLPAPER')) throw new Error('walls');
      if (u.includes('/videos')) {
        return ok({
          items: [
            { url: 'https://vimeo.com/1', site: 'VIMEO', name: 'Skip' },
            {
              url: 'https://www.youtube.com/watch?v=abc123XYZ',
              site: 'OTHER',
              name: 'Via url',
            },
            { url: 'https://example.com/watch', site: 'YOUTUBE', name: 'No id' },
          ],
        });
      }
      if (u.includes('/reviews')) return ok({});
      if (u.includes('/seasons')) throw new Error('seasons');
      if (u.includes('/sequels_and_prequels')) throw new Error('sequels');
      return ok({});
    });
    const extras = await fetchKinopoiskExtras({
      kinopoiskId: 901,
      title: 'Direct Throws',
      isSeries: true,
    });
    expect(extras?.kinopoiskId).toBe(901);
    expect(extras?.images).toEqual([]);
    expect(extras?.youtubeVideos[0].youtubeId).toBe('abc123XYZ');
    expect(extras?.reviews).toEqual([]);
    expect(extras?.countries).toEqual([]);
  });

  it('fetchKinopoiskExtras maps sparse payloads and caches', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('/images')) return ok({});
      if (u.includes('/videos')) {
        return ok({
          items: [{ url: 'https://www.youtube.com/embed/zzzzzzYYYY' }],
        });
      }
      if (u.includes('/reviews')) {
        return ok({ reviews: [{ description: 'Anonymous take' }] });
      }
      if (u.includes('/seasons')) return ok({});
      if (u.includes('/sequels_and_prequels')) return ok({});
      if (u.match(/\/films\/902$/)) return ok({});
      return ok({});
    });
    const extras = await fetchKinopoiskExtras({
      kinopoiskId: 902,
      title: 'Sparse Direct',
      isSeries: true,
    });
    expect(extras?.reviews[0].description).toBe('Anonymous take');
    expect(extras?.youtubeVideos[0].youtubeId).toBe('zzzzzzYYYY');
    fetchMock.mockClear();
    const cached = await fetchKinopoiskExtras({ kinopoiskId: 902, title: 'Sparse Direct' });
    expect(cached?.kinopoiskId).toBe(902);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetchTmdbExtras maps a movie by id and picks trailer fallbacks', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('/images')) return ok({ backdrops: [{}], stills: [{ file_path: '' }] });
      if (u.includes('/videos')) return ok({});
      if (u.includes('/credits')) {
        return ok({
          cast: [
            { name: 'Lead', character: ' Cobb ', order: 0 },
            { name: 'Extra' },
          ],
        });
      }
      if (u.includes('/search/multi')) {
        return ok({
          results: [
            { id: 9, title: 'Person', media_type: 'person' },
            {
              id: 8,
              name: 'Direct Film TV',
              media_type: 'tv',
              first_air_date: '2009-01-01',
            },
            {
              id: 42,
              title: 'Direct Film',
              original_title: 'Direct Film',
              media_type: 'movie',
              release_date: '2010-01-01',
            },
          ],
        });
      }
      return ok({});
    });
    const extras = await fetchTmdbExtras({ title: 'Direct Film', year: '2010' });
    expect(extras?.tmdbId).toBe(42);
    expect(pickTmdbTrailerKey(extras)).toBeUndefined();
    expect(
      pickTmdbTrailerKey({
        ...extras!,
        videos: [{ key: 'clip', name: 'Clip', type: 'Clip', site: 'Vimeo' }],
      })
    ).toBe('clip');

    fetchMock.mockClear();
    expect(await fetchTmdbExtras({ title: 'Direct Film', year: '2010' })).toEqual(extras);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/search/multi')) {
        return ok({ results: [{ id: 1, title: 'Nope', media_type: 'movie' }] });
      }
      return ok({});
    });
    expect(await fetchTmdbExtras({ title: 'Completely Different Direct' })).toBeNull();
    expect(await fetchTmdbExtras({ title: 'Completely Different Direct' })).toBeNull();

    const byId = await fetchTmdbExtras({ title: 'Ignored', tmdbId: 77 });
    expect(byId?.mediaType).toBe('movie');
  });

  it('discover maps empty pages and name-only titles', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/trending/movie')) return ok({});
      if (String(url).includes('/trending/tv')) {
        return ok({
          results: [{ name: 'Named Show', media_type: 'tv' }, { title: '', name: '' }],
        });
      }
      return ok({});
    });
    const trending = await fetchTmdbTrending();
    expect(trending.some((i) => i.title === 'Named Show')).toBe(true);
    expect(await fetchTmdbUpcoming()).toEqual([]);
  });

  it('covers kinopoisk scoreMatch type arms on the instrumented module', () => {
    expect(
      kpScoreMatch({ nameRu: 'Night Show', year: 2020, type: 'TV_SHOW' }, 'Night Show', undefined, true)
    ).toBe(125);
    expect(
      kpScoreMatch({ nameRu: 'Series Film', year: 2020, type: 'FILM' }, 'Series Film', '2020', true)
    ).toBe(150);
    expect(
      kpScoreMatch({ nameEn: 'Partial English Extra', year: 2020 }, 'English Extra')
    ).toBe(35);
  });
});
