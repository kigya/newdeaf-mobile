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

function searchJson(films: unknown[]) {
  return { ok: true, json: async () => ({ films }) };
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

  it('returns null for short query and caches id miss', async () => {
    const { enrichFromKinopoisk } = loadKp();
    expect(await enrichFromKinopoisk({ newdeafId: 'short', title: 'A' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await enrichFromKinopoisk({ newdeafId: 'short', title: 'A' })).toBeNull();
  });

  it('returns null when no confident match', async () => {
    fetchMock.mockResolvedValue(
      searchJson([{ filmId: 1, nameRu: 'zzz', year: 1900 }])
    );
    const { enrichFromKinopoisk } = loadKp();
    expect(
      await enrichFromKinopoisk({
        newdeafId: 'nd-miss',
        title: 'Completely Different Title Unique',
        year: '2020',
      })
    ).toBeNull();
  });

  it('scores partial title / en title / year proximity / series type', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('search-by-keyword')) {
        return searchJson([
          {
            kinopoiskId: 77,
            nameRu: 'Long Series Title Extra',
            nameEn: 'Other',
            year: 2011,
            type: 'TV_SERIES',
          },
        ]);
      }
      if (u.includes('/facts')) {
        return {
          ok: true,
          json: async () => ({
            items: [
              { text: '  ', type: 'FACT', spoiler: false },
              { text: 'Only blooper', type: 'BLOOPER', spoiler: false },
            ],
          }),
        };
      }
      if (u.includes('/staff')) {
        return {
          ok: true,
          json: async () => ({
            items: [
              { staffId: 1, nameRu: 'Director', professionKey: 'DIRECTOR' },
              { staffId: 2, nameEn: 'Extra', professionText: 'актриса' },
            ],
          }),
        };
      }
      if (u.includes('/awards')) {
        return {
          ok: true,
          json: async () => ({
            items: [
              { name: '  ', win: true },
              { name: 'A1', win: true },
              { name: 'A2', win: true },
              { name: 'A3', win: true },
              { name: 'A4', win: true },
              { name: 'A5', win: true },
              { name: 'A6', win: true },
              { name: 'A7', win: true },
            ],
          }),
        };
      }
      if (u.includes('/similars') || u.includes('/relations')) {
        return { ok: true, json: async () => ({ items: [{ nameRu: 'ab' }] }) };
      }
      return { ok: false, status: 500, json: async () => ({}) };
    });

    const { enrichFromKinopoisk } = loadKp();
    const result = await enrichFromKinopoisk({
      newdeafId: 'series-1',
      title: 'Long Series Title',
      year: '2010',
      isSeries: true,
    });
    expect(result?.kinopoiskId).toBe(77);
    expect(result?.facts[0].text).toBe('Only blooper');
    expect(result?.staff.some((s) => s.professionText === 'актриса')).toBe(true);
    expect(result?.awards).toHaveLength(6);
  });

  it('uses originalTitle alt search and nameOriginal scoring', async () => {
    let keywordCalls = 0;
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('search-by-keyword')) {
        keywordCalls += 1;
        if (keywordCalls === 1) {
          // Low score vs query "Different Query Title"
          return searchJson([
            { filmId: 1, nameRu: 'Wrong', nameOriginal: 'Wrong', year: 2000, type: 'FILM' },
          ]);
        }
        return searchJson([
          {
            filmId: 88,
            nameRu: 'Ru Name',
            nameOriginal: 'Alt English Title',
            year: 2015,
            type: 'MINI_SERIES',
          },
        ]);
      }
      return { ok: true, json: async () => ({ items: [] }) };
    });

    const { enrichFromKinopoisk } = loadKp();
    const result = await enrichFromKinopoisk({
      newdeafId: 'alt-1',
      title: 'Different Query Title',
      originalTitle: 'Alt English Title',
      year: '2015',
      isSeries: true,
    });
    expect(result?.kinopoiskId).toBe(88);
    expect(keywordCalls).toBeGreaterThanOrEqual(2);
  });

  it('returns cached enrichment with onPartial and skips network', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('search-by-keyword')) {
        return searchJson([
          { filmId: 555, nameRu: 'Начало', nameEn: 'Inception', year: 2010, type: 'FILM' },
        ]);
      }
      return { ok: true, json: async () => ({ items: [] }) };
    });
    const { enrichFromKinopoisk } = loadKp();
    const first = await enrichFromKinopoisk({
      newdeafId: 'cache-1',
      title: 'Начало',
      year: '2010',
    });
    expect(first?.kinopoiskId).toBe(555);
    fetchMock.mockClear();
    const partials: unknown[] = [];
    const cached = await enrichFromKinopoisk(
      { newdeafId: 'cache-1', title: 'Начало', year: '2010' },
      (p) => partials.push(p)
    );
    expect(cached?.kinopoiskId).toBe(555);
    expect(partials).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('enriches facts/staff/awards and related via searchMovies', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('search-by-keyword')) {
        return searchJson([
          {
            filmId: 555,
            nameRu: 'Начало',
            nameEn: 'Inception',
            year: 2010,
            type: 'FILM',
          },
        ]);
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
              {
                nameEn: 'English Only Long Name',
                year: 2011,
                relationType: 'RELATED',
              },
              {
                nameOriginal: 'Original Only Long',
                year: null,
              },
            ],
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const { enrichFromKinopoisk } = loadKp();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const catalogAfter = require('@/src/data/catalog/catalog') as {
      searchMovies: jest.Mock;
    };
    catalogAfter.searchMovies.mockImplementation(async (q: string) => {
      if (q.includes('English')) {
        return [
          { id: 'e0', title: 'English Only Long Name Wrong Year', year: '1990', href: '/e0.html', slug: 'e0' },
          { id: 'e1', title: 'English Only Long Name', year: '2011', href: '/e.html', slug: 'e' },
          { id: 'e2', title: 'English Only Long Name Remake', year: '2012', href: '/e2.html', slug: 'e2' },
        ];
      }
      if (q.includes('Original')) {
        return [];
      }
      return [{ id: '99', title: q, year: '2010', href: '/99.html', slug: 'x' }];
    });

    const partials: unknown[] = [];
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
  });

  it('resolveInNewDeaf skips low scores and search errors', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('search-by-keyword')) {
        return searchJson([
          { filmId: 9, nameRu: 'Resolve Soft Film', year: 2021, type: 'FILM' },
        ]);
      }
      if (u.includes('/similars')) {
        return {
          ok: true,
          json: async () => ({
            items: [
              { nameRu: 'No Match Long Title Here', year: 1990 },
              { nameRu: 'Throws Long Title Here', year: 2021 },
            ],
          }),
        };
      }
      return { ok: true, json: async () => ({ items: [] }) };
    });

    const { enrichFromKinopoisk } = loadKp();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const catalog = require('@/src/data/catalog/catalog') as { searchMovies: jest.Mock };
    catalog.searchMovies.mockImplementation(async (q: string) => {
      if (q.includes('Throws')) throw new Error('search down');
      return [{ id: 'x', title: 'Totally Different', year: '2000', href: '/x.html', slug: 'x' }];
    });

    const result = await enrichFromKinopoisk({
      newdeafId: 'nd-resolve',
      title: 'Resolve Soft Film',
      year: '2021',
    });
    expect(result?.kinopoiskId).toBe(9);
    expect(result?.similar).toEqual([]);
  });

  it('soft-fails section fetches and id resolve HTTP errors', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('search-by-keyword')) {
        return searchJson([
          {
            filmId: 9,
            nameRu: 'Soft Fail Film Unique',
            year: 2021,
            type: 'FILM',
          },
        ]);
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

  it('returns null when search HTTP fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    const { enrichFromKinopoisk } = loadKp();
    expect(
      await enrichFromKinopoisk({
        newdeafId: 'http-fail',
        title: 'Http Fail Film Title',
        year: '2019',
      })
    ).toBeNull();
  });

  it('reuses id cache and items[] search payload', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('search-by-keyword')) {
        return {
          ok: true,
          json: async () => ({
            items: [
              {
                kinopoiskId: 42,
                nameEn: 'Cached Film Title',
                year: '2018',
                type: 'FILM',
              },
            ],
          }),
        };
      }
      return { ok: true, json: async () => ({ items: [] }) };
    });
    const { enrichFromKinopoisk } = loadKp();
    await enrichFromKinopoisk({
      newdeafId: 'id-cache-a',
      title: 'Cached Film Title',
      year: '2018',
    });
    fetchMock.mockClear();
    await enrichFromKinopoisk({
      newdeafId: 'id-cache-b',
      title: 'Cached Film Title',
      year: '2018',
    });
    // second resolve hits id cache; still fetches enrichment endpoints
    expect(
      fetchMock.mock.calls.some((c) => String(c[0]).includes('search-by-keyword'))
    ).toBe(false);
  });

  it('scores en-includes and year exact / far series year', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('search-by-keyword')) {
        return searchJson([
          {
            filmId: 3,
            nameRu: 'X',
            nameEn: 'The Matrix Reloaded Extended',
            year: 2003,
            type: 'TV_SHOW',
          },
        ]);
      }
      return { ok: true, json: async () => ({ items: [] }) };
    });
    const { enrichFromKinopoisk } = loadKp();
    const result = await enrichFromKinopoisk({
      newdeafId: 'en-score',
      title: 'Matrix Reloaded',
      year: '1999',
      isSeries: true,
    });
    expect(result?.kinopoiskId).toBe(3);
  });

  it('returns null when enrichment crashes unexpectedly', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('search-by-keyword')) {
        return searchJson([
          { filmId: 1, nameRu: 'Crash Film Title', year: 2020, type: 'FILM' },
        ]);
      }
      if (String(url).includes('/facts')) {
        return {
          ok: true,
          json: async () => {
            throw new Error('bad json');
          },
        };
      }
      return { ok: true, json: async () => ({ items: [] }) };
    });
    // Promise.all section catches return empty — need outer catch via resolveKinopoiskId throwing after match
    // Force memory path: make Promise.all itself throw by rejecting non-caught
    const { enrichFromKinopoisk } = loadKp();
    // Corrupt by making films endpoint throw before catch wrappers — use Object.assign on Promise.all
    const spy = jest.spyOn(Promise, 'all').mockRejectedValueOnce(new Error('boom'));
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('search-by-keyword')) {
        return searchJson([
          { filmId: 1, nameRu: 'Crash Film Title', year: 2020, type: 'FILM' },
        ]);
      }
      return { ok: true, json: async () => ({ items: [] }) };
    });
    const result = await enrichFromKinopoisk({
      newdeafId: 'crash',
      title: 'Crash Film Title',
      year: '2020',
    });
    expect(result).toBeNull();
    spy.mockRestore();
  });

  it('strips season badge from title for search', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('search-by-keyword')) {
        expect(String(url)).toContain(encodeURIComponent('Show Name'));
        return searchJson([
          { filmId: 11, nameRu: 'Show Name', year: 2020, type: 'TV_SERIES' },
        ]);
      }
      return { ok: true, json: async () => ({ items: [] }) };
    });
    const { enrichFromKinopoisk } = loadKp();
    await enrichFromKinopoisk({
      newdeafId: 'badge',
      title: 'Show Name — S01E02',
      year: '2020',
      isSeries: true,
    });
  });

  it('hits idCache null via different newdeafId and covers staff/facts fallbacks', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('search-by-keyword')) {
        // Empty films and items → final []
        return { ok: true, json: async () => ({}) };
      }
      return { ok: true, json: async () => ({ items: [] }) };
    });
    const { enrichFromKinopoisk } = loadKp();
    expect(
      await enrichFromKinopoisk({ newdeafId: 'id-null-a', title: 'Zz' })
    ).toBeNull();
    // Same title/year/series → idCache hit with null (memory key differs by newdeafId)
    expect(
      await enrichFromKinopoisk({ newdeafId: 'id-null-b', title: 'Zz' })
    ).toBeNull();
  });

  it('alt search uses items[] and film with only kinopoiskId; takeStaff name fallback', async () => {
    let keywordCalls = 0;
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('search-by-keyword')) {
        keywordCalls += 1;
        if (keywordCalls === 1) {
          return searchJson([
            { nameRu: 'Completely Unrelated Zzz', year: 2000, type: 'FILM' },
          ]);
        }
        return {
          ok: true,
          json: async () => ({
            items: [
              {
                kinopoiskId: 91,
                nameRu: 'Alt Only Title Long',
                year: 2015,
                type: 'FILM',
              },
            ],
          }),
        };
      }
      if (u.includes('/staff')) {
        return {
          ok: true,
          json: async () => ({
            items: [
              { staffId: 1, professionKey: 'DIRECTOR' },
              { staffId: 2, nameRu: 'Named', professionKey: 'WRITER' },
              { staffId: 3, nameEn: 'English Only', professionKey: 'PRODUCER' },
            ],
          }),
        };
      }
      if (u.includes('/facts')) {
        return { ok: true, json: async () => ({}) };
      }
      if (u.includes('/awards')) {
        return { ok: true, json: async () => ({}) };
      }
      if (u.includes('/similars') || u.includes('/relations')) {
        return { ok: true, json: async () => ({}) };
      }
      return { ok: true, json: async () => ({ items: [] }) };
    });

    const { enrichFromKinopoisk } = loadKp();
    const result = await enrichFromKinopoisk({
      newdeafId: 'staff-fallback',
      title: 'Primary Query Title Unique',
      originalTitle: 'Alt Only Title Long',
      year: '2015',
    });
    expect(keywordCalls).toBeGreaterThanOrEqual(2);
    expect(result?.kinopoiskId).toBe(91);
    expect(result?.staff.some((s) => s.nameRu === 'Named')).toBe(true);
    expect(result?.staff.some((s) => s.nameEn === 'English Only')).toBe(true);
  });

  it('resolveInNewDeaf dedupes ids, respects limit, and year null stubs', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('search-by-keyword')) {
        return searchJson([
          { filmId: 12, nameRu: 'Dedup Host Film', year: 2020, type: 'FILM' },
        ]);
      }
      if (u.includes('/similars')) {
        return {
          ok: true,
          json: async () => ({
            items: Array.from({ length: 8 }, (_, i) => ({
              nameRu: `Similar Movie Title ${i} Long`,
              year: i === 0 ? null : 2020,
            })),
          }),
        };
      }
      return { ok: true, json: async () => ({ items: [] }) };
    });

    const { enrichFromKinopoisk } = loadKp();
    const catalog = require('@/src/data/catalog/catalog') as { searchMovies: jest.Mock };
    catalog.searchMovies.mockImplementation(async (q: string) => {
      // Same id for first two queries → seen.has skip; unique after
      if (q.includes('0') || q.includes('1')) {
        return [
          { id: 'same', title: q, year: '2020', href: '/same.html', slug: 'same' },
        ];
      }
      return [{ id: q, title: q, year: '2020', href: `/${q}.html`, slug: q }];
    });

    const result = await enrichFromKinopoisk({
      newdeafId: 'dedup',
      title: 'Dedup Host Film',
      year: '2020',
    });
    expect(result?.similar.length).toBeLessThanOrEqual(6);
    expect(result?.similar.length).toBeGreaterThan(0);
  });

  it('match with score but missing film ids returns null id', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('search-by-keyword')) {
        return searchJson([
          {
            nameRu: 'No Id Film Title',
            year: 2020,
            type: 'FILM',
            // filmId and kinopoiskId both missing
          },
        ]);
      }
      return { ok: true, json: async () => ({ items: [] }) };
    });
    const { enrichFromKinopoisk } = loadKp();
    expect(
      await enrichFromKinopoisk({
        newdeafId: 'no-id',
        title: 'No Id Film Title',
        year: '2020',
      })
    ).toBeNull();
  });

  it('scores en-includes when ru title does not match', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('search-by-keyword')) {
        return searchJson([
          {
            filmId: 61,
            nameRu: 'Другое',
            nameEn: 'Partial English Match Extended',
            year: 2012,
            type: 'FILM',
          },
        ]);
      }
      return { ok: true, json: async () => ({ items: [] }) };
    });
    const { enrichFromKinopoisk } = loadKp();
    const result = await enrichFromKinopoisk({
      newdeafId: 'en-includes',
      title: 'English Match',
      year: '2012',
    });
    expect(result?.kinopoiskId).toBe(61);
  });

  it('skips alt search when originalTitle normalizes equal; staff items undefined', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('search-by-keyword')) {
        return searchJson([
          { filmId: 70, nameRu: 'Same Title Film', year: 2019, type: 'FILM' },
        ]);
      }
      if (u.includes('/staff')) {
        // Not an array — items missing → ?? []
        return { ok: true, json: async () => ({}) };
      }
      return { ok: true, json: async () => ({ items: [] }) };
    });
    const { enrichFromKinopoisk } = loadKp();
    const result = await enrichFromKinopoisk({
      newdeafId: 'same-orig',
      title: 'Same Title Film',
      originalTitle: 'Same Title Film',
      year: '2019',
    });
    expect(result?.kinopoiskId).toBe(70);
    expect(result?.staff).toEqual([]);
  });

  it('alt search with empty films/items and non-improving scores', async () => {
    let keywordCalls = 0;
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('search-by-keyword')) {
        keywordCalls += 1;
        if (keywordCalls === 1) {
          return searchJson([
            { nameRu: 'No Match Alpha Beta', year: 1990, type: 'FILM' },
          ]);
        }
        return {
          ok: true,
          json: async () => ({
            films: undefined,
            items: [
              { nameRu: 'Still Wrong Gamma', year: 1991, type: 'FILM' },
              {
                kinopoiskId: 72,
                nameRu: 'Alt Query Title Unique',
                year: 2018,
                type: 'FILM',
              },
            ],
          }),
        };
      }
      return { ok: true, json: async () => ({ items: [] }) };
    });
    const { enrichFromKinopoisk } = loadKp();
    const result = await enrichFromKinopoisk({
      newdeafId: 'alt-empty',
      title: 'Primary Query Title Unique',
      originalTitle: 'Alt Query Title Unique',
      year: '2018',
    });
    expect(keywordCalls).toBe(2);
    expect(result?.kinopoiskId).toBe(72);
  });

  it('resolveInNewDeaf filters stubs with empty names', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('search-by-keyword')) {
        return searchJson([
          { filmId: 80, nameRu: 'Empty Stub Host', year: 2020, type: 'FILM' },
        ]);
      }
      if (u.includes('/similars')) {
        return {
          ok: true,
          json: async () => ({
            items: [
              { nameRu: null, nameEn: null, nameOriginal: null },
              { nameRu: 'Valid Similar Title Long', year: 2020 },
            ],
          }),
        };
      }
      return { ok: true, json: async () => ({ items: [] }) };
    });
    const { enrichFromKinopoisk } = loadKp();
    const catalog = require('@/src/data/catalog/catalog') as { searchMovies: jest.Mock };
    catalog.searchMovies.mockResolvedValue([
      { id: 'v', title: 'Valid Similar Title Long', year: '2020', href: '/v.html', slug: 'v' },
    ]);
    const result = await enrichFromKinopoisk({
      newdeafId: 'empty-stub',
      title: 'Empty Stub Host',
      year: '2020',
    });
    expect(result?.similar.length).toBeGreaterThan(0);
  });

  it('scores year nullish coalescing and skips equal-normalize alt query', async () => {
    let keywordCalls = 0;
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('search-by-keyword')) {
        keywordCalls += 1;
        if (keywordCalls === 1) {
          return searchJson([
            {
              filmId: 44,
              nameRu: 'Year Null Film',
              year: null,
              type: 'FILM',
            },
          ]);
        }
        return { ok: true, json: async () => ({ films: null, items: null }) };
      }
      return { ok: true, json: async () => ({ items: [] }) };
    });
    const { enrichFromKinopoisk } = loadKp();
    const hit = await enrichFromKinopoisk({
      newdeafId: 'year-null',
      title: 'Year Null Film',
      year: '2020',
    });
    expect(hit?.kinopoiskId).toBe(44);

    keywordCalls = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('search-by-keyword')) {
        keywordCalls += 1;
        return searchJson([
          { nameRu: 'Unrelated Zzz Title', year: 1990, type: 'FILM' },
        ]);
      }
      return { ok: true, json: async () => ({ items: [] }) };
    });
    // Low first score + originalTitle that normalizes equal → skip alt body, no second keyword
    const miss = await enrichFromKinopoisk({
      newdeafId: 'eq-norm-alt',
      title: 'Foo Bar Film',
      originalTitle: 'foo  bar film',
      year: '2020',
    });
    expect(miss).toBeNull();
    expect(keywordCalls).toBe(1);
  });

  it('alt search with both films and items null uses empty list', async () => {
    let keywordCalls = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('search-by-keyword')) {
        keywordCalls += 1;
        if (keywordCalls === 1) {
          return searchJson([
            { nameRu: 'No Match Alpha Beta', year: 1990, type: 'FILM' },
          ]);
        }
        return { ok: true, json: async () => ({ films: null, items: null }) };
      }
      return { ok: true, json: async () => ({ items: [] }) };
    });
    const { enrichFromKinopoisk } = loadKp();
    expect(
      await enrichFromKinopoisk({
        newdeafId: 'alt-null-lists',
        title: 'Primary Query Title Unique',
        originalTitle: 'Different Alt Title Unique',
        year: '2018',
      })
    ).toBeNull();
    expect(keywordCalls).toBe(2);
  });
});
