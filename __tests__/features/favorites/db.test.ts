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
  const mod = require('@/src/features/favorites/db') as typeof import('@/src/features/favorites/db');
  return { mod, mockDb, SQLite };
}

describe('favorites db', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('listFavorites maps rows', async () => {
    const { mod, mockDb } = loadDb();
    mockDb.getAllAsync.mockResolvedValue([
      {
        id: '1',
        slug: 'film',
        title: 'Film',
        year: '2020',
        posterUrl: 'https://p',
        href: '/1.html',
        kpRating: '8',
        imdbRating: '7',
        isSeries: 1,
        createdAt: 10,
      },
      {
        id: '2',
        slug: null,
        title: 'B',
        year: null,
        posterUrl: null,
        href: '/2.html',
        kpRating: null,
        imdbRating: null,
        isSeries: 0,
        createdAt: 5,
      },
    ]);

    const rows = await mod.listFavorites();
    expect(rows[0]).toMatchObject({
      id: '1',
      isSeries: true,
      year: '2020',
      kpRating: '8',
    });
    expect(rows[1]).toMatchObject({
      id: '2',
      slug: '',
      isSeries: false,
      year: undefined,
      posterUrl: undefined,
    });
  });

  it('hasFavorite checks presence', async () => {
    const { mod, mockDb } = loadDb();
    mockDb.getFirstAsync.mockResolvedValueOnce({ id: '1' });
    expect(await mod.hasFavorite('1')).toBe(true);
    mockDb.getFirstAsync.mockResolvedValueOnce(null);
    expect(await mod.hasFavorite('2')).toBe(false);
  });

  it('upsertFavorite and deleteFavoriteRow', async () => {
    const { mod, mockDb } = loadDb();
    await mod.upsertFavorite({
      id: '9',
      slug: 's',
      title: 'T',
      href: '/9.html',
      isSeries: false,
      createdAt: 1,
    });
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO favorites'),
      expect.arrayContaining(['9', 's', 'T', null, null, '/9.html', null, null, 0, 1])
    );

    await mod.upsertFavorite({
      id: '10',
      slug: 's2',
      title: 'Series',
      href: '/10.html',
      isSeries: true,
      createdAt: 2,
    });
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO favorites'),
      expect.arrayContaining(['10', 's2', 'Series', null, null, '/10.html', null, null, 1, 2])
    );

    await mod.deleteFavoriteRow('9');
    expect(mockDb.runAsync).toHaveBeenCalledWith('DELETE FROM favorites WHERE id = ?', ['9']);
  });

  it('maps null isSeries via default', async () => {
    const { mod, mockDb } = loadDb();
    mockDb.getAllAsync.mockResolvedValue([
      {
        id: '3',
        slug: 'x',
        title: 'X',
        href: '/3.html',
        isSeries: null,
        createdAt: 1,
      },
    ]);
    const rows = await mod.listFavorites();
    expect(rows[0].isSeries).toBe(false);
  });

  it('creates table on first open and reuses db', async () => {
    const { mod, mockDb, SQLite } = loadDb();
    await mod.listFavorites();
    await mod.listFavorites();
    expect(mockDb.execAsync).toHaveBeenCalledWith(expect.stringContaining('favorites'));
    expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(1);
  });
});
