const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

const ORIGINAL = process.env.EXPO_PUBLIC_KINOPOISK_API_KEY;

function loadKp(configured = true) {
  jest.resetModules();
  if (configured) process.env.EXPO_PUBLIC_KINOPOISK_API_KEY = 'kp-key';
  else delete process.env.EXPO_PUBLIC_KINOPOISK_API_KEY;
  jest.doMock('@/src/data/catalog/catalog', () => ({
    searchMovies: jest.fn(async () => []),
  }));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@/src/data/catalog/kinopoisk/collections') as typeof import('@/src/data/catalog/kinopoisk/collections');
}

describe('kinopoisk collections', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock.mockReset();
  });

  afterAll(() => {
    if (ORIGINAL === undefined) delete process.env.EXPO_PUBLIC_KINOPOISK_API_KEY;
    else process.env.EXPO_PUBLIC_KINOPOISK_API_KEY = ORIGINAL;
  });

  it('returns empty collections when unconfigured or HTTP fails', async () => {
    const off = loadKp(false);
    expect(await off.fetchKpCollection('TOP_250_MOVIES')).toEqual([]);
    expect(await off.fetchKpPremieres()).toEqual([]);
    expect(await off.fetchKpTop('TOP_AWAIT_FILMS')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    const on = loadKp();
    expect(await on.fetchKpCollection('TOP_POPULAR_ALL')).toEqual([]);
    expect(await on.fetchKpPremieres(2026, 'JANUARY')).toEqual([]);
    expect(await on.fetchKpTop('TOP_AWAIT_FILMS', 2)).toEqual([]);
  });

  it('maps collection items and skips short names', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          { nameRu: 'A' },
          {
            nameRu: 'Dune',
            nameEn: 'Dune',
            nameOriginal: 'Dune',
            year: 2021,
            posterUrlPreview: 'https://p/preview.jpg',
          },
          {
            nameOriginal: 'Only Original',
            year: '2022',
            posterUrl: 'https://p/full.jpg',
          },
          {},
        ],
      }),
    });
    const { fetchKpCollection, KP_COLLECTION_TYPES } = loadKp();
    expect(KP_COLLECTION_TYPES).toContain('TOP_250_MOVIES');
    const items = await fetchKpCollection('TOP_250_MOVIES');
    expect(items).toHaveLength(2);
    expect(items[0].posterUrl).toBe('https://p/preview.jpg');
    expect(items[1].posterUrl).toBe('https://p/full.jpg');

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    expect(await fetchKpCollection('TOP_POPULAR_MOVIES')).toEqual([]);
  });

  it('fetchKpTop maps items on HTTP success', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items: [{ nameRu: 'Awaited Film Title', year: 2026 }],
      }),
    });
    const { fetchKpTop } = loadKp();
    const items = await fetchKpTop('TOP_AWAIT_FILMS');
    expect(items[0].nameRu).toBe('Awaited Film Title');
  });

  it('fetchKpPremieres uses the current month and premiereMonth fallback', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: [{ nameEn: 'Premiere Film', year: 2026 }] }),
    });
    const { fetchKpPremieres, premiereMonth } = loadKp();
    expect(premiereMonth(new Date('2026-03-15T00:00:00Z'))).toBe('MARCH');
    expect(premiereMonth(new Date(Number.NaN))).toBe('JANUARY');
    const items = await fetchKpPremieres();
    expect(items[0].nameEn).toBe('Premiere Film');
    expect(String(fetchMock.mock.calls[0][0])).toContain('/films/premieres?year=');
  });
});
