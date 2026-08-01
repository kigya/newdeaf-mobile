jest.mock('@/src/data/catalog/catalog', () => ({
  searchMovies: jest.fn(async () => []),
}));

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
  return require('@/src/data/catalog/kinopoisk') as typeof import('@/src/data/catalog/kinopoisk');
}

describe('kinopoisk', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock.mockReset();
  });

  afterAll(() => {
    if (ORIGINAL === undefined) delete process.env.EXPO_PUBLIC_KINOPOISK_API_KEY;
    else process.env.EXPO_PUBLIC_KINOPOISK_API_KEY = ORIGINAL;
  });

  it('isKinopoiskConfigured reflects env', () => {
    expect(loadKp(true).isKinopoiskConfigured()).toBe(true);
    expect(loadKp(false).isKinopoiskConfigured()).toBe(false);
  });

  it('returns null when unconfigured', async () => {
    const { enrichFromKinopoisk } = loadKp(false);
    expect(await enrichFromKinopoisk({ newdeafId: '1', title: 'Film' })).toBeNull();
  });

  it('returns null when no confident match', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ films: [{ filmId: 1, nameRu: 'zzz', year: 1900 }] }),
    });
    const { enrichFromKinopoisk } = loadKp();
    expect(
      await enrichFromKinopoisk({
        newdeafId: 'nd-miss',
        title: 'Completely Different Title Unique',
        year: '2020',
      })
    ).toBeNull();
  });

  it('enriches facts/staff/awards and related via searchMovies', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const catalog = require('@/src/data/catalog/catalog') as {
      searchMovies: jest.Mock;
    };
    catalog.searchMovies.mockImplementation(async (q: string) => [
      { id: '99', title: q, year: '2010', href: '/99.html', slug: 'x' },
    ]);

    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('search-by-keyword')) {
        return {
          ok: true,
          json: async () => ({
            films: [
              {
                filmId: 555,
                nameRu: 'Начало',
                nameEn: 'Inception',
                year: 2010,
                type: 'FILM',
              },
            ],
          }),
        };
      }
      if (u.includes('/facts')) {
        return {
          ok: true,
          json: async () => ({
            items: [
              { text: '<b>Fact one</b>', type: 'FACT', spoiler: false },
              { text: 'Blooper', type: 'BLOOPER', spoiler: true },
            ],
          }),
        };
      }
      if (u.includes('/staff')) {
        return {
          ok: true,
          json: async () => [
            { staffId: 1, nameRu: 'Актёр', professionKey: 'ACTOR' },
            { staffId: 2, nameEn: 'Extra', professionKey: 'OTHER' },
          ],
        };
      }
      if (u.includes('/awards')) {
        return {
          ok: true,
          json: async () => ({
            items: [
              { name: 'Oscar', win: true },
              { name: 'Oscar', win: true },
              { name: 'Nom', win: false },
            ],
          }),
        };
      }
      if (u.includes('/similars') || u.includes('/relations')) {
        return {
          ok: true,
          json: async () => ({
            items: [
              {
                nameRu: 'Похожий фильм длинный',
                year: 2010,
                relationType: 'SIMILAR',
              },
            ],
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const partials: unknown[] = [];
    const { enrichFromKinopoisk } = loadKp();
    // re-bind search mock after resetModules
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const catalogAfter = require('@/src/data/catalog/catalog') as {
      searchMovies: jest.Mock;
    };
    catalogAfter.searchMovies.mockImplementation(async (q: string) => [
      { id: '99', title: q, year: '2010', href: '/99.html', slug: 'x' },
    ]);

    const result = await enrichFromKinopoisk(
      {
        newdeafId: 'nd-1',
        title: 'Начало',
        originalTitle: 'Inception',
        year: '2010',
      },
      (p) => partials.push(p)
    );

    expect(result?.kinopoiskId).toBe(555);
    expect(result?.facts[0].text).toContain('Fact one');
    expect(result?.staff[0].nameRu).toBe('Актёр');
    expect(result?.awards).toEqual([{ name: 'Oscar' }]);
    expect(result?.similar.length).toBeGreaterThan(0);
    expect(partials.length).toBeGreaterThanOrEqual(2);

    fetchMock.mockClear();
    const cached = await enrichFromKinopoisk({
      newdeafId: 'nd-1',
      title: 'Начало',
      originalTitle: 'Inception',
      year: '2010',
    });
    expect(cached?.kinopoiskId).toBe(555);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('soft-fails section fetches', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('search-by-keyword')) {
        return {
          ok: true,
          json: async () => ({
            films: [
              {
                filmId: 9,
                nameRu: 'Soft Fail Film Unique',
                year: 2021,
                type: 'FILM',
              },
            ],
          }),
        };
      }
      throw new Error('section down');
    });

    const { enrichFromKinopoisk } = loadKp();
    const result = await enrichFromKinopoisk({
      newdeafId: 'nd-soft',
      title: 'Soft Fail Film Unique',
      year: '2021',
    });
    expect(result?.kinopoiskId).toBe(9);
    expect(result?.facts).toEqual([]);
    expect(result?.staff).toEqual([]);
  });
});
