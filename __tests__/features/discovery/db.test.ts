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
  const mod = require('@/src/features/discovery/db') as typeof import('@/src/features/discovery/db');
  return { mod, mockDb, SQLite };
}

describe('discovery db', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('parses items and skips invalid JSON / rows', async () => {
    const { mod, mockDb } = loadDb();
    mockDb.getAllAsync.mockResolvedValue([
      {
        railId: 'site-popular',
        itemsJson: JSON.stringify([
          { id: '1', title: 'A', href: '/1.html', slug: 'a' },
          { id: 2, title: 'bad' },
          null,
          { title: 'no id' },
        ]),
        updatedAt: 10,
      },
      { railId: 'kp-top-250', itemsJson: '{', updatedAt: 11 },
      { railId: 'tmdb-trending', itemsJson: '{"x":1}', updatedAt: 12 },
      { railId: 'kp-premieres', itemsJson: null, updatedAt: 13 },
    ]);
    const rows = await mod.listDiscoveryRails();
    expect(rows[0].items).toHaveLength(1);
    expect(rows[0].items[0].id).toBe('1');
    expect(rows[1].items).toEqual([]);
    expect(rows[2].items).toEqual([]);
    expect(rows[3].items).toEqual([]);
  });

  it('upserts JSON and reuses the db', async () => {
    const { mod, mockDb, SQLite } = loadDb();
    await mod.upsertDiscoveryRail({
      railId: 'site-popular',
      items: [{ id: '1', slug: 'a', title: 'A', href: '/1.html' }],
      updatedAt: 5,
    });
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO discovery_rails'),
      ['site-popular', expect.stringContaining('"id":"1"'), 5]
    );
    await mod.listDiscoveryRails();
    expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(1);
  });
});
