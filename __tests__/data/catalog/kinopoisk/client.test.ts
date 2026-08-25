const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

const ORIGINAL = process.env.EXPO_PUBLIC_KINOPOISK_API_KEY;

function loadClient(configured = true) {
  jest.resetModules();
  if (configured) process.env.EXPO_PUBLIC_KINOPOISK_API_KEY = 'kp-key';
  else delete process.env.EXPO_PUBLIC_KINOPOISK_API_KEY;
  jest.doMock('@/src/data/catalog/catalog', () => ({
    searchMovies: jest.fn(async () => []),
  }));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@/src/data/catalog/kinopoisk/client') as typeof import('@/src/data/catalog/kinopoisk/client');
}

describe('kinopoisk client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock.mockReset();
  });

  afterAll(() => {
    if (ORIGINAL === undefined) delete process.env.EXPO_PUBLIC_KINOPOISK_API_KEY;
    else process.env.EXPO_PUBLIC_KINOPOISK_API_KEY = ORIGINAL;
  });

  it('isKinopoiskConfigured / getKinopoiskApiKey reflect env', () => {
    const on = loadClient(true);
    expect(on.isKinopoiskConfigured()).toBe(true);
    const off = loadClient(false);
    expect(off.isKinopoiskConfigured()).toBe(false);
  });

  it('kpFetch throws when the key is missing', async () => {
    const { kpFetch } = loadClient(false);
    await expect(kpFetch('/x')).rejects.toThrow('Kinopoisk key missing');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('trips the 402 circuit breaker so a second call does not fetch', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 402, json: async () => ({}) });
    const { kpFetch, isKpQuotaExhausted, KpHttpError } = loadClient();
    await expect(kpFetch('/films/1')).rejects.toBeInstanceOf(KpHttpError);
    expect(isKpQuotaExhausted()).toBe(true);
    fetchMock.mockClear();
    await expect(kpFetch('/films/2')).rejects.toMatchObject({ status: 402 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries 429 then succeeds', async () => {
    jest.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 9 }) });
    const { kpFetch } = loadClient();
    const pending = kpFetch('/films/9');
    const assertion = expect(pending).resolves.toEqual({ id: 9 });
    await jest.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    jest.useRealTimers();
  });

  it('throws after 429 retries are exhausted', async () => {
    jest.useFakeTimers();
    fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    const { kpFetch, KpHttpError } = loadClient();
    const pending = kpFetch('/films/x');
    const assertion = expect(pending).rejects.toBeInstanceOf(KpHttpError);
    await jest.runAllTimersAsync();
    await assertion;
    jest.useRealTimers();
  });

  it('throws on non-retry HTTP errors', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const { kpFetch } = loadClient();
    await expect(kpFetch('/films/y')).rejects.toMatchObject({ status: 500 });
  });

  it('queues a fifth parallel request behind MAX_PARALLEL', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    fetchMock.mockImplementation(async () => {
      await gate;
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    });
    const { kpFetch } = loadClient();
    const pending = Promise.all([
      kpFetch('/a'),
      kpFetch('/b'),
      kpFetch('/c'),
      kpFetch('/d'),
      kpFetch('/e'),
    ]);
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    release();
    await pending;
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
