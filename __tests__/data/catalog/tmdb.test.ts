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
  });

  it('enrichMovieMetadata soft-fails on HTTP without sticky cache', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const { enrichMovieMetadata } = loadTmdb();
    expect(await enrichMovieMetadata({ title: 'Transient Film Unique' })).toBeNull();
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
  });

  it('uses bearer token when READ_TOKEN set', async () => {
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
  });
});
