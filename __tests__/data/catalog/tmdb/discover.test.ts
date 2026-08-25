const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

const ORIGINAL_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY;
const ORIGINAL_TOKEN = process.env.EXPO_PUBLIC_TMDB_READ_TOKEN;

function loadTmdb(opts?: { key?: string | null; token?: string | null }) {
  jest.resetModules();
  if (opts?.key === null) delete process.env.EXPO_PUBLIC_TMDB_API_KEY;
  else process.env.EXPO_PUBLIC_TMDB_API_KEY = opts?.key ?? 'test-key';
  if (opts?.token) process.env.EXPO_PUBLIC_TMDB_READ_TOKEN = opts.token;
  else delete process.env.EXPO_PUBLIC_TMDB_READ_TOKEN;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@/src/data/catalog/tmdb/discover') as typeof import('@/src/data/catalog/tmdb/discover');
}

function ok(data: unknown) {
  return { ok: true, status: 200, json: async () => data };
}

describe('tmdb discover', () => {
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

  it('returns [] when unconfigured or HTTP fails', async () => {
    const off = loadTmdb({ key: null, token: null });
    expect(await off.fetchTmdbTrending()).toEqual([]);
    expect(await off.fetchTmdbUpcoming()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockRejectedValue(new Error('down'));
    const on = loadTmdb();
    expect(await on.fetchTmdbTrending()).toEqual([]);
    expect(await on.fetchTmdbUpcoming()).toEqual([]);
  });

  it('maps trending movies+tv and caps at 24', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/trending/movie')) {
        return ok({
          results: [
            { title: 'A' },
            {
              title: 'Movie One',
              original_title: 'Movie One',
              release_date: '2024-01-01',
              poster_path: '/m.jpg',
              media_type: 'movie',
            },
            ...Array.from({ length: 20 }, (_, i) => ({
              title: `M${i}`,
              media_type: 'movie',
              release_date: '2024-02-02',
            })),
          ],
        });
      }
      return ok({
        results: [
          {
            name: 'Show One',
            original_name: 'Show One',
            first_air_date: '2023-05-05',
            media_type: 'tv',
          },
          ...Array.from({ length: 10 }, (_, i) => ({
            name: `T${i}`,
            media_type: 'tv',
          })),
        ],
      });
    });
    const { fetchTmdbTrending } = loadTmdb();
    const items = await fetchTmdbTrending();
    expect(items.length).toBe(24);
    expect(items[0].mediaType).toBe('movie');
    expect(items.some((i) => i.mediaType === 'tv')).toBe(true);
    expect(items.find((i) => i.title === 'Show One')?.year).toBe('2023');
  });

  it('maps upcoming with fallback media type and caps at 20', async () => {
    fetchMock.mockResolvedValue(
      ok({
        results: [
          { title: 'U' },
          { name: 'Named Upcoming', original_name: 'Named Upcoming' },
          ...Array.from({ length: 22 }, (_, i) => ({
            title: `Upcoming ${i}`,
            release_date: 'xx',
          })),
        ],
      })
    );
    const { fetchTmdbUpcoming } = loadTmdb();
    const items = await fetchTmdbUpcoming();
    expect(items).toHaveLength(20);
    expect(items[0].mediaType).toBe('movie');
    expect(items[0].year).toBeUndefined();
  });

  it('maps empty result pages via results ?? []', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/trending/movie')) return ok({});
      if (String(url).includes('/trending/tv')) return ok({ results: undefined });
      return ok({});
    });
    const { fetchTmdbTrending, fetchTmdbUpcoming } = loadTmdb();
    expect(await fetchTmdbTrending()).toEqual([]);
    expect(await fetchTmdbUpcoming()).toEqual([]);
  });
});
