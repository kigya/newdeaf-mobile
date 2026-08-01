const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

const ORIGINAL_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY;
const ORIGINAL_TOKEN = process.env.EXPO_PUBLIC_TMDB_READ_TOKEN;

function loadTmdb(opts?: { key?: string | null; token?: string | null; locale?: string }) {
  jest.resetModules();
  if (opts?.key === null) delete process.env.EXPO_PUBLIC_TMDB_API_KEY;
  else process.env.EXPO_PUBLIC_TMDB_API_KEY = opts?.key ?? 'test-key';
  if (opts?.token) process.env.EXPO_PUBLIC_TMDB_READ_TOKEN = opts.token;
  else delete process.env.EXPO_PUBLIC_TMDB_READ_TOKEN;

  jest.doMock('@/src/shared/i18n', () => ({
    getLocale: () => opts?.locale ?? 'en',
  }));

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@/src/data/catalog/tmdb') as typeof import('@/src/data/catalog/tmdb');
}

describe('tmdb', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock.mockReset();
  });

  afterAll(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.EXPO_PUBLIC_TMDB_API_KEY;
    else process.env.EXPO_PUBLIC_TMDB_API_KEY = ORIGINAL_KEY;
    if (ORIGINAL_TOKEN === undefined) delete process.env.EXPO_PUBLIC_TMDB_READ_TOKEN;
    else process.env.EXPO_PUBLIC_TMDB_READ_TOKEN = ORIGINAL_TOKEN;
  });

  it('isTmdbConfigured reflects env', () => {
    expect(loadTmdb().isTmdbConfigured()).toBe(true);
    expect(loadTmdb({ key: null, token: null }).isTmdbConfigured()).toBe(false);
    expect(loadTmdb({ key: null, token: 'tok' }).isTmdbConfigured()).toBe(true);
  });

  it('enrichMovieMetadata returns null for short query', async () => {
    const { enrichMovieMetadata } = loadTmdb();
    expect(await enrichMovieMetadata({ title: 'a' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('enrichMovieMetadata scores and returns meta', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              id: 42,
              title: 'Inception',
              original_title: 'Inception',
              media_type: 'movie',
              release_date: '2010-07-16',
              poster_path: '/p.jpg',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 42,
          title: 'Inception',
          original_title: 'Inception',
          overview: 'Dreams',
          poster_path: '/p.jpg',
          release_date: '2010-07-16',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cast: [
            { name: 'Leo', order: 0 },
            { name: '', order: 1 },
          ],
          crew: [{ name: 'Nolan', job: 'Director' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          titles: [{ iso_3166_1: 'RU', title: 'Начало' }],
        }),
      });

    const { enrichMovieMetadata } = loadTmdb();
    const meta = await enrichMovieMetadata({
      title: 'Inception',
      year: '2010',
    });
    expect(meta).toMatchObject({
      tmdbId: 42,
      title: 'Inception',
      russianTitle: 'Начало',
      director: 'Nolan',
      actors: ['Leo'],
      year: '2010',
    });

    fetchMock.mockClear();
    expect(await enrichMovieMetadata({ title: 'Inception', year: '2010' })).toEqual(meta);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('enrichMovieMetadata uses movie search fallback and caches miss', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ id: 1, title: 'Other', media_type: 'movie' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      });

    const { enrichMovieMetadata } = loadTmdb();
    expect(
      await enrichMovieMetadata({ title: 'Completely Unique Zzz', year: '1999' })
    ).toBeNull();
    fetchMock.mockClear();
    expect(
      await enrichMovieMetadata({ title: 'Completely Unique Zzz', year: '1999' })
    ).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('enrichMovieMetadata soft-fails on HTTP without sticky cache', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const { enrichMovieMetadata } = loadTmdb();
    expect(await enrichMovieMetadata({ title: 'Transient Film Unique' })).toBeNull();
  });

  it('scores partial / original includes and year proximity', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            { id: 1, media_type: 'person', name: 'Someone' },
            {
              id: 2,
              name: 'Long Show Name Extra',
              original_name: 'Other',
              media_type: 'tv',
              first_air_date: '2011-01-01',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 2,
          name: 'Long Show Name Extra',
          original_name: 'Long Show',
          overview: '  ',
          first_air_date: '2011-01-01',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ cast: [{ order: 2 }, { name: 'A', order: 1 }], crew: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: 'Русское' }),
      });

    const { enrichMovieMetadata } = loadTmdb({ locale: 'ru' });
    const meta = await enrichMovieMetadata({
      title: 'Long Show Name',
      year: '2010',
      isSeries: true,
    });
    expect(meta?.tmdbId).toBe(2);
    expect(meta?.russianTitle).toBe('Русское');
    expect(meta?.actors).toEqual(['A']);
  });

  it('skips movies when isSeries and falls back to movie search hit', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              id: 9,
              title: 'Series Query',
              media_type: 'movie',
              release_date: '2020-01-01',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              id: 10,
              title: 'Series Query',
              original_title: 'Series Query',
              release_date: '2020-05-01',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 10,
          title: 'Series Query',
          release_date: '2020-05-01',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('credits down');
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ titles: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ title: '  ' }),
      });

    const { enrichMovieMetadata } = loadTmdb();
    const meta = await enrichMovieMetadata({
      title: 'Series Query',
      year: '2020',
      isSeries: true,
    });
    expect(meta?.tmdbId).toBe(10);
    expect(meta?.actors).toEqual([]);
    expect(meta?.russianTitle).toBeUndefined();
  });

  it('scores original_title includes branch', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              id: 5,
              title: 'X',
              original_title: 'Unique Original Partial Match Title',
              media_type: 'movie',
              release_date: '2012-01-01',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 5, name: 'From Detail' }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ titles: [{ iso_3166_1: 'US', title: 'No' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ title: 'Рус' }),
      });

    const { enrichMovieMetadata } = loadTmdb();
    const meta = await enrichMovieMetadata({
      title: 'Original Partial Match',
      year: '2012',
    });
    expect(meta?.tmdbId).toBe(5);
    expect(meta?.title).toBe('From Detail');
    expect(meta?.russianTitle).toBe('Рус');
  });

  it('resolveRussianTitleForSearch skips Cyrillic and short queries', async () => {
    const { resolveRussianTitleForSearch } = loadTmdb();
    expect(await resolveRussianTitleForSearch('а')).toBeNull();
    expect(await resolveRussianTitleForSearch('Интерстеллар')).toBeNull();
  });

  it('resolveRussianTitleForSearch bridges Latin titles', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              id: 7,
              title: 'Interstellar',
              original_title: 'Interstellar',
              media_type: 'movie',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          titles: [{ iso_3166_1: 'RU', title: 'Интерстеллар' }],
        }),
      });

    const { resolveRussianTitleForSearch } = loadTmdb();
    expect(await resolveRussianTitleForSearch('Interstellar')).toBe('Интерстеллар');
    fetchMock.mockClear();
    expect(await resolveRussianTitleForSearch('Interstellar')).toBe('Интерстеллар');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resolveRussianTitleForSearch caches miss and uses tv + fallback title', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ id: 1, title: 'Nope', media_type: 'movie' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              id: 8,
              name: 'Showtime',
              original_name: 'Showtime',
              media_type: 'tv',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('ru fail');
        },
      });

    const { resolveRussianTitleForSearch } = loadTmdb();
    expect(await resolveRussianTitleForSearch('zzzzuniqueqq')).toBeNull();
    fetchMock.mockClear();
    // fresh module path for tv success with fallback
    const { resolveRussianTitleForSearch: resolve2 } = loadTmdb();
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              id: 8,
              name: 'Showtime',
              original_name: 'Showtime',
              media_type: 'tv',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('ru fail');
        },
      });
    expect(await resolve2('Showtime')).toBe('Showtime');
  });

  it('resolveRussianTitleForSearch returns null when no title resolved', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ id: 3, media_type: 'movie' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ titles: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ title: '' }),
      });

    const { resolveRussianTitleForSearch } = loadTmdb();
    // scoreMatch returns -1 without titles → miss cached
    expect(await resolveRussianTitleForSearch('BareIdOnlyFilm')).toBeNull();
  });

  it('resolveRussianTitleForSearch soft-fails transient errors', async () => {
    fetchMock.mockRejectedValue(new Error('net'));
    const { resolveRussianTitleForSearch } = loadTmdb();
    expect(await resolveRussianTitleForSearch('Transient Bridge')).toBeNull();
  });

  it('uses bearer token when READ_TOKEN set and appends api_key otherwise', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });
    const { enrichMovieMetadata } = loadTmdb({
      key: null,
      token: 'bearer-token',
      locale: 'ru',
    });
    await enrichMovieMetadata({ title: 'Token Film Unique' });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/search/multi'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer bearer-token' }),
      })
    );
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('api_key=');

    fetchMock.mockClear();
    const { enrichMovieMetadata: enrich2 } = loadTmdb({ key: 'k', locale: 'en' });
    await enrich2({ title: 'Key Film Unique' });
    expect(String(fetchMock.mock.calls[0][0])).toContain('api_key=k');
  });

  it('scores original includes return -1 path via no-match', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 1,
            title: 'Completely Unrelated',
            original_title: 'Also Unrelated',
            media_type: 'movie',
          },
        ],
      }),
    });
    // then movie search also miss
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              id: 1,
              title: 'Completely Unrelated',
              original_title: 'Also Unrelated',
              media_type: 'movie',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              id: 2,
              title: 'Still Wrong',
              original_title: 'Nope',
            },
          ],
        }),
      });
    const { enrichMovieMetadata } = loadTmdb();
    expect(await enrichMovieMetadata({ title: 'Zzzzy Unique Title', year: '2001' })).toBeNull();
  });

  it('throws path when neither key nor token configured', async () => {
    const { enrichMovieMetadata } = loadTmdb({ key: null, token: null });
    expect(await enrichMovieMetadata({ title: 'No Keys Film' })).toBeNull();
  });

  it('covers remaining score and resolveRussianTitle branches', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              id: 99,
              name: 'Partial Name Hit Extended',
              original_name: 'x',
              media_type: 'tv',
              first_air_date: '2010-01-01',
            },
            { id: 100, media_type: 'person' },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 99,
          overview: '  ',
          poster_path: null,
          first_air_date: '2010-05-01',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cast: [{ name: 'A' }, { name: 'B' }],
          crew: [{ job: 'Writer', name: 'W' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: undefined }),
      });

    const { enrichMovieMetadata } = loadTmdb();
    const meta = await enrichMovieMetadata({
      title: 'Partial Name Hit',
      year: '2010',
      isSeries: true,
    });
    expect(meta?.tmdbId).toBe(99);
    expect(meta?.actors).toEqual(['A', 'B']);
    expect(meta?.director).toBeUndefined();
  });

  it('movie search fallback when multi empty; year proximity; cache miss ?? null', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: undefined }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              id: 55,
              title: 'Fallback Movie Title',
              release_date: '2011-01-01',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 55,
          title: 'Fallback Movie Title',
          original_title: 'Fallback Movie Title',
          overview: 'Plot',
          release_date: '2011-01-01',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ cast: [], crew: [{ job: 'Director', name: 'Dir' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ titles: [{ iso_3166_1: 'RU', title: '  ' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ title: undefined }),
      });

    const { enrichMovieMetadata } = loadTmdb();
    const meta = await enrichMovieMetadata({
      title: 'Fallback Movie Title',
      year: '2010',
    });
    expect(meta?.tmdbId).toBe(55);
    expect(meta?.director).toBe('Dir');

    const { enrichMovieMetadata: enrich2 } = loadTmdb();
    await enrich2({ title: 'q' });
    expect(await enrich2({ title: 'q' })).toBeNull();
  });

  it('resolveRussianTitleForSearch skips non-movie/tv results', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            { id: 1, media_type: 'person' },
            {
              id: 2,
              title: 'Bridge Film',
              media_type: 'movie',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ titles: [{ iso_3166_1: 'RU', title: 'Мост' }] }),
      });

    const { resolveRussianTitleForSearch } = loadTmdb();
    expect(await resolveRussianTitleForSearch('Bridge Film')).toBe('Мост');
  });

  it('resolveRussianTitle cache falls back to title when russianTitle missing', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              id: 4,
              name: 'Only Name Field',
              media_type: 'tv',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('no ru');
        },
      });

    const { resolveRussianTitleForSearch } = loadTmdb();
    expect(await resolveRussianTitleForSearch('Only Name Field')).toBe('Only Name Field');
    fetchMock.mockClear();
    // Cache hit: russianTitle undefined → use title
    expect(await resolveRussianTitleForSearch('Only Name Field')).toBe('Only Name Field');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('score year far miss and movieSearch results undefined', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              id: 6,
              title: 'Far Year Film',
              media_type: 'movie',
              release_date: '1990-01-01',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 6, title: 'Far Year Film', release_date: '1990-01-01' }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ cast: [], crew: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ titles: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ title: 'Далёкий' }) });

    const { enrichMovieMetadata } = loadTmdb();
    // year 2010 vs 1990 — exact/proximity miss (else branch)
    const meta = await enrichMovieMetadata({ title: 'Far Year Film', year: '2010' });
    expect(meta?.tmdbId).toBe(6);

    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) }); // movie search no results field
    const { enrichMovieMetadata: e2 } = loadTmdb();
    expect(await e2({ title: 'No Results Anywhere ZZ', year: '2001' })).toBeNull();
  });

  it('resolveRussianTitle uses results ?? [] and name-only fallback chain', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}), // results undefined
      });
    const { resolveRussianTitleForSearch } = loadTmdb();
    expect(await resolveRussianTitleForSearch('NoMultiResults')).toBeNull();

    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              id: 9,
              original_name: 'Orig Name Only Show',
              media_type: 'tv',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('ru fail');
        },
      });
    const { resolveRussianTitleForSearch: r2 } = loadTmdb();
    expect(await r2('Orig Name Only Show')).toBe('Orig Name Only Show');
  });

  it('enrich title falls back to input.title; search cache null hit', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              id: 77,
              original_title: 'Input Fallback Film',
              media_type: 'movie',
              release_date: '2015-01-01',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 77, release_date: '2015-01-01' }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ cast: [], crew: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ titles: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ title: '' }) });

    const { enrichMovieMetadata } = loadTmdb();
    const meta = await enrichMovieMetadata({
      title: 'Input Fallback Film',
      year: '2015',
    });
    expect(meta?.title).toBe('Input Fallback Film');

    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ id: 1, title: 'Nope', media_type: 'movie' }] }),
    });
    const { resolveRussianTitleForSearch } = loadTmdb();
    expect(await resolveRussianTitleForSearch('ZzzzyNoMatchTitle')).toBeNull();
    fetchMock.mockClear();
    expect(await resolveRussianTitleForSearch('ZzzzyNoMatchTitle')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
