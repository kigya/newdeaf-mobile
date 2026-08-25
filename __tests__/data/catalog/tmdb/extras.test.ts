const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

import { fetchTmdbExtras, pickTmdbTrailerKey } from '@/src/data/catalog/tmdb/extras';

const ORIGINAL_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY;
const ORIGINAL_TOKEN = process.env.EXPO_PUBLIC_TMDB_READ_TOKEN;

function ok(data: unknown) {
  return { ok: true, status: 200, json: async () => data };
}

describe('tmdb extras', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock.mockReset();
    process.env.EXPO_PUBLIC_TMDB_API_KEY = 'test-key';
    delete process.env.EXPO_PUBLIC_TMDB_READ_TOKEN;
  });

  afterAll(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.EXPO_PUBLIC_TMDB_API_KEY;
    else process.env.EXPO_PUBLIC_TMDB_API_KEY = ORIGINAL_KEY;
    if (ORIGINAL_TOKEN === undefined) delete process.env.EXPO_PUBLIC_TMDB_READ_TOKEN;
    else process.env.EXPO_PUBLIC_TMDB_READ_TOKEN = ORIGINAL_TOKEN;
  });

  it('returns null for a short query, low score, or search HTTP failure', async () => {
    expect(await fetchTmdbExtras({ title: 'a' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue(
      ok({
        results: [
          {
            id: 1,
            title: 'Unrelated Zzz',
            media_type: 'movie',
            release_date: '1990-01-01',
          },
        ],
      })
    );
    expect(await fetchTmdbExtras({ title: 'Completely Different Title' })).toBeNull();
    expect(await fetchTmdbExtras({ title: 'Completely Different Title' })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockRejectedValue(new Error('down'));
    expect(await fetchTmdbExtras({ title: 'Crash Search Title' })).toBeNull();
  });

  it('resolves a movie, maps stills/videos/cast, caches, and picks a trailer key', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('/search/multi')) {
        return ok({
          results: [
            { id: 9, title: 'Person', media_type: 'person' },
            {
              id: 42,
              title: 'Inception',
              original_title: 'Inception',
              media_type: 'movie',
              release_date: '2010-07-16',
            },
          ],
        });
      }
      if (u.includes('/images')) {
        return ok({
          backdrops: [
            { file_path: '/b1.jpg' },
            ...Array.from({ length: 12 }, (_, i) => ({ file_path: `/b${i}.jpg` })),
          ],
          stills: [{ file_path: '/s1.jpg' }],
        });
      }
      if (u.includes('/videos')) {
        return ok({
          results: [
            { name: 'No key', type: 'Trailer', site: 'YouTube' },
            { key: 'vimeo1', name: 'Vimeo', type: 'Trailer', site: 'Vimeo' },
            { key: 'tea1', name: 'Teaser', type: 'Teaser', site: 'YouTube' },
            { key: 'tr1', name: 'Official Trailer', type: 'Trailer', site: 'YouTube' },
            { key: 'k2', site: '' },
            { key: 'k3' },
            { key: 'k4' },
            { key: 'k5' },
          ],
        });
      }
      if (u.includes('/credits')) {
        return ok({
          cast: [
            { name: 'Late', order: 5, profile_path: '/p.jpg', character: ' X ' },
            { name: '  ', order: 0 },
            { name: 'Lead', order: 0, character: 'Cobb' },
          ],
        });
      }
      return ok({});
    });

    const extras = await fetchTmdbExtras({
      title: 'Inception',
      year: '2010',
    });
    expect(extras?.tmdbId).toBe(42);
    expect(extras?.mediaType).toBe('movie');
    expect(extras?.stills).toHaveLength(12);
    expect(extras?.videos).toHaveLength(6);
    expect(extras?.cast[0].name).toBe('Lead');
    expect(extras?.cast.some((c) => c.name === 'Late')).toBe(true);
    expect(pickTmdbTrailerKey(extras)).toBe('tr1');
    expect(pickTmdbTrailerKey(null)).toBeUndefined();
    expect(pickTmdbTrailerKey({ ...extras!, videos: [] })).toBeUndefined();
    expect(
      pickTmdbTrailerKey({
        ...extras!,
        videos: [{ key: 'yt', name: 'X', type: 'Featurette', site: 'YouTube' }],
      })
    ).toBe('yt');
    expect(
      pickTmdbTrailerKey({
        ...extras!,
        videos: [{ key: 'clip', name: 'Clip', type: 'Clip', site: 'Vimeo' }],
      })
    ).toBe('clip');

    fetchMock.mockClear();
    const cached = await fetchTmdbExtras({ title: 'Inception', year: '2010' });
    expect(cached?.tmdbId).toBe(42);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses a provided tmdbId, skips movies when isSeries, and soft-fails sections', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('/search/multi')) {
        return ok({
          results: [
            {
              id: 1,
              name: 'Show Name',
              media_type: 'movie',
              release_date: '2020-01-01',
            },
            {
              id: 7,
              name: 'Show Name',
              original_name: 'Show Name',
              media_type: 'tv',
              first_air_date: '2020-01-01',
            },
          ],
        });
      }
      if (u.includes('/tv/7/images') || u.includes('/tv/3/images')) throw new Error('img');
      if (u.includes('/videos')) throw new Error('vid');
      if (u.includes('/credits')) throw new Error('cast');
      return ok({});
    });

    const series = await fetchTmdbExtras({
      title: 'Show Name',
      year: '2020',
      isSeries: true,
    });
    expect(series?.tmdbId).toBe(7);
    expect(series?.mediaType).toBe('tv');
    expect(series?.stills).toEqual([]);
    expect(series?.videos).toEqual([]);
    expect(series?.cast).toEqual([]);

    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/tv/3/')) throw new Error('section');
      return ok({ results: [] });
    });
    const byId = await fetchTmdbExtras({
      title: 'Ignored',
      tmdbId: 3,
      isSeries: true,
    });
    expect(byId?.tmdbId).toBe(3);
    expect(byId?.mediaType).toBe('tv');
  });

  it('uses tmdbId as a movie, skips stills without file_path, and defaults empty sections', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('/images')) {
        return ok({ backdrops: [{}], stills: [{ file_path: '' }] });
      }
      if (u.includes('/videos')) return ok({});
      if (u.includes('/credits')) {
        return ok({
          cast: [{ name: 'Lead' }, { name: '  ', character: '   ' }],
        });
      }
      return ok({});
    });
    const extras = await fetchTmdbExtras({ title: 'Ignored', tmdbId: 11 });
    expect(extras?.tmdbId).toBe(11);
    expect(extras?.mediaType).toBe('movie');
    expect(extras?.stills).toEqual([]);
    expect(extras?.videos).toEqual([]);
    expect(extras?.cast).toEqual([{ name: 'Lead', character: undefined, profileUrl: undefined }]);
  });

  it('returns null for empty search pages and drops nameless cast', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/search/multi')) return ok({});
      return ok({});
    });
    expect(await fetchTmdbExtras({ title: 'Empty Results Title Unique' })).toBeNull();

    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('/credits')) {
        return ok({
          cast: [{ character: 'Ghost' }, { name: 'Lead', type: undefined }],
        });
      }
      if (u.includes('/videos')) {
        return ok({
          results: [{ key: 'plain' }, { key: 'other', site: 'Vimeo', type: 'Clip' }],
        });
      }
      return ok({});
    });
    const extras = await fetchTmdbExtras({ title: 'Nameless Cast', tmdbId: 15 });
    expect(extras?.cast.map((c) => c.name)).toEqual(['Lead']);
    expect(extras?.videos[0]).toEqual({
      key: 'plain',
      name: 'Trailer',
      type: 'Trailer',
      site: 'YouTube',
    });

    fetchMock.mockImplementation(async () => ok({}));
    const emptyCast = await fetchTmdbExtras({ title: 'No Cast', tmdbId: 16 });
    expect(emptyCast?.cast).toEqual([]);
  });
});
