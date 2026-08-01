type MockDb = {
  execAsync: jest.Mock;
  runAsync: jest.Mock;
  getFirstAsync: jest.Mock;
  getAllAsync: jest.Mock;
};

function createMockDb(): MockDb {
  return {
    execAsync: jest.fn(async () => undefined),
    runAsync: jest.fn(async () => undefined),
    getFirstAsync: jest.fn(async () => null),
    getAllAsync: jest.fn(async () => []),
  };
}

function loadDb() {
  jest.resetModules();
  const mockDb = createMockDb();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const SQLite = require('expo-sqlite') as { openDatabaseAsync: jest.Mock };
  SQLite.openDatabaseAsync = jest.fn(async () => mockDb);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@/src/features/settings/db') as typeof import('@/src/features/settings/db');
  return { mod, mockDb, SQLite };
}

describe('settings db', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loadSettings returns null when empty', async () => {
    const { mod, mockDb } = loadDb();
    mockDb.getFirstAsync.mockResolvedValue(null);
    expect(await mod.loadSettings()).toBeNull();
  });

  it('loadSettings maps valid row', async () => {
    const { mod, mockDb } = loadDb();
    mockDb.getFirstAsync.mockResolvedValue({
      locale: 'ru',
      lastSeenSystemLocale: 'en',
      preferredDownloadQuality: '1080',
    });
    expect(await mod.loadSettings()).toEqual({
      locale: 'ru',
      lastSeenSystemLocale: 'en',
      preferredDownloadQuality: '1080',
    });
  });

  it('loadSettings falls back on invalid values', async () => {
    const { mod, mockDb } = loadDb();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DEFAULT_PREFERRED_QUALITY } = require('@/src/features/settings/types');
    mockDb.getFirstAsync.mockResolvedValue({
      locale: 'fr',
      lastSeenSystemLocale: 'xx',
      preferredDownloadQuality: '999',
    });
    expect(await mod.loadSettings()).toEqual({
      locale: 'en',
      lastSeenSystemLocale: 'en',
      preferredDownloadQuality: DEFAULT_PREFERRED_QUALITY,
    });
  });

  it('saveSettings upserts row', async () => {
    const { mod, mockDb } = loadDb();
    await mod.saveSettings({
      locale: 'ru',
      lastSeenSystemLocale: 'ru',
      preferredDownloadQuality: 'best',
    });
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO settings'),
      ['ru', 'ru', 'best']
    );
  });

  it('reuses db connection', async () => {
    const { mod, SQLite } = loadDb();
    await mod.loadSettings();
    await mod.loadSettings();
    expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(1);
  });
});
