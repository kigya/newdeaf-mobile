const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

const ORIGINAL_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY;
const ORIGINAL_TOKEN = process.env.EXPO_PUBLIC_TMDB_READ_TOKEN;

function loadClient(opts?: { key?: string | null; token?: string | null }) {
  jest.resetModules();
  if (opts?.key === null) delete process.env.EXPO_PUBLIC_TMDB_API_KEY;
  else process.env.EXPO_PUBLIC_TMDB_API_KEY = opts?.key ?? 'test-key';
  if (opts?.token) process.env.EXPO_PUBLIC_TMDB_READ_TOKEN = opts.token;
  else delete process.env.EXPO_PUBLIC_TMDB_READ_TOKEN;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@/src/data/catalog/tmdb/client') as typeof import('@/src/data/catalog/tmdb/client');
}

describe('tmdb client', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  afterAll(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.EXPO_PUBLIC_TMDB_API_KEY;
    else process.env.EXPO_PUBLIC_TMDB_API_KEY = ORIGINAL_KEY;
    if (ORIGINAL_TOKEN === undefined) delete process.env.EXPO_PUBLIC_TMDB_READ_TOKEN;
    else process.env.EXPO_PUBLIC_TMDB_READ_TOKEN = ORIGINAL_TOKEN;
  });

  it('isTmdbConfigured reflects key or bearer token', () => {
    expect(loadClient({ key: null, token: null }).isTmdbConfigured()).toBe(false);
    expect(loadClient({ key: 'k' }).isTmdbConfigured()).toBe(true);
    expect(loadClient({ key: null, token: 'tok' }).isTmdbConfigured()).toBe(true);
  });

  it('tmdbFetch throws when unconfigured', async () => {
    const { tmdbFetch } = loadClient({ key: null, token: null });
    await expect(tmdbFetch('/x')).rejects.toThrow('TMDB key missing');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('appends api_key when no bearer token', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 1 }) });
    const { tmdbFetch } = loadClient({ key: 'abc' });
    await expect(tmdbFetch('/movie/1')).resolves.toEqual({ id: 1 });
    expect(String(fetchMock.mock.calls[0][0])).toContain('api_key=abc');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('uses bearer token and skips api_key', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
    const { tmdbFetch } = loadClient({ key: null, token: 'tok' });
    await tmdbFetch('/search/movie?query=x');
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).not.toContain('api_key=');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
  });

  it('throws on HTTP errors', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    const { tmdbFetch } = loadClient();
    await expect(tmdbFetch('/fail')).rejects.toThrow('TMDB HTTP 503');
  });
});
