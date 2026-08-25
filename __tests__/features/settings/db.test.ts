type MockDb = {
  execAsync: jest.Mock;
  runAsync: jest.Mock;
  getFirstAsync: jest.Mock;
  getAllAsync: jest.Mock;
};

const ALL_SETTINGS_COLS = [
  { name: 'id' },
  { name: 'locale' },
  { name: 'lastSeenSystemLocale' },
  { name: 'preferredDownloadQuality' },
  { name: 'downloadsWifiOnly' },
  { name: 'storageCapMb' },
];

function createMockDb(tableCols: { name: string }[] = ALL_SETTINGS_COLS): MockDb {
  return {
    execAsync: jest.fn(async () => undefined),
    runAsync: jest.fn(async () => undefined),
    getFirstAsync: jest.fn(async () => null),
    getAllAsync: jest.fn(async (sql: string) => {
      if (String(sql).includes('PRAGMA table_info')) return tableCols;
      return [];
    }),
  };
}

function loadDb(tableCols?: { name: string }[]) {
  jest.resetModules();
  const mockDb = createMockDb(tableCols);
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
      downloadsWifiOnly: 1,
      storageCapMb: 2048,
    });
    expect(await mod.loadSettings()).toEqual({
      locale: 'ru',
      lastSeenSystemLocale: 'en',
      preferredDownloadQuality: '1080',
      downloadsWifiOnly: true,
      storageCapMb: 2048,
    });
  });

  it('loadSettings falls back on invalid values', async () => {
    const { mod, mockDb } = loadDb();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DEFAULT_PREFERRED_QUALITY, DEFAULT_STORAGE_CAP_MB } =
      require('@/src/features/settings/types') as typeof import('@/src/features/settings/types');
    mockDb.getFirstAsync.mockResolvedValue({
      locale: 'fr',
      lastSeenSystemLocale: 'xx',
      preferredDownloadQuality: '999',
      storageCapMb: 'nope',
    });
    expect(await mod.loadSettings()).toEqual({
      locale: 'en',
      lastSeenSystemLocale: 'en',
      preferredDownloadQuality: DEFAULT_PREFERRED_QUALITY,
      downloadsWifiOnly: false,
      storageCapMb: DEFAULT_STORAGE_CAP_MB,
    });
  });

  it('saveSettings upserts row with wifi flag and cap', async () => {
    const { mod, mockDb } = loadDb();
    await mod.saveSettings({
      locale: 'ru',
      lastSeenSystemLocale: 'ru',
      preferredDownloadQuality: 'best',
      downloadsWifiOnly: true,
      storageCapMb: 1024,
    });
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO settings'),
      ['ru', 'ru', 'best', 1, 1024]
    );

    await mod.saveSettings({
      locale: 'en',
      lastSeenSystemLocale: 'en',
      preferredDownloadQuality: '720',
      downloadsWifiOnly: false,
      storageCapMb: 0,
    });
    expect(mockDb.runAsync).toHaveBeenLastCalledWith(
      expect.stringContaining('INSERT INTO settings'),
      ['en', 'en', '720', 0, 0]
    );
  });

  it('migrates missing wifi/cap columns via PRAGMA table_info', async () => {
    const { mod, mockDb } = loadDb([{ name: 'id' }, { name: 'locale' }]);
    await mod.loadSettings();
    const alters = mockDb.execAsync.mock.calls
      .map((c) => String(c[0]))
      .filter((s) => s.includes('ALTER TABLE'));
    expect(alters.some((s) => s.includes('downloadsWifiOnly'))).toBe(true);
    expect(alters.some((s) => s.includes('storageCapMb'))).toBe(true);
  });

  it('reuses db connection', async () => {
    const { mod, SQLite } = loadDb();
    await mod.loadSettings();
    await mod.loadSettings();
    expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(1);
  });
});
