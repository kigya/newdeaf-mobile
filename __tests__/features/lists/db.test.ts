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
  const mod = require('@/src/features/lists/db') as typeof import('@/src/features/lists/db');
  return { mod, mockDb, SQLite };
}

describe('lists db', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('seeds builtins on open and reuses the connection', async () => {
    const { mod, mockDb, SQLite } = loadDb();
    await mod.listLists();
    await mod.listLists();
    expect(mockDb.runAsync.mock.calls.some((c) => c[1]?.[0] === 'queue')).toBe(true);
    expect(mockDb.runAsync.mock.calls.some((c) => c[1]?.[0] === 'rewatch')).toBe(true);
    expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(1);
  });

  it('maps lists and items including fallbacks', async () => {
    const { mod, mockDb } = loadDb();
    mockDb.getAllAsync.mockImplementation(async (sql: string) => {
      if (String(sql).includes('FROM lists')) {
        return [
          { id: 'queue', name: 'queue', kind: 'builtin', createdAt: 0, sortIndex: 0 },
          { id: 'c1', name: 'Custom', kind: 'nope', createdAt: 1, sortIndex: null },
        ];
      }
      return [
        {
          listId: 'queue',
          movieId: '1',
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
          listId: 'queue',
          movieId: '2',
          slug: null,
          title: 'Bare',
          year: null,
          posterUrl: null,
          href: '/2.html',
          kpRating: null,
          imdbRating: null,
          isSeries: null,
          createdAt: 5,
        },
      ];
    });

    const lists = await mod.listLists();
    expect(lists[0].kind).toBe('builtin');
    expect(lists[1].kind).toBe('custom');
    expect(lists[1].sortIndex).toBe(0);

    const items = await mod.listItemsFor('queue');
    expect(items[0].isSeries).toBe(true);
    expect(items[1]).toMatchObject({ slug: '', year: undefined, isSeries: false });

    const all = await mod.listAllItems();
    expect(all).toHaveLength(2);
  });

  it('inserts, renames, deletes lists and items', async () => {
    const { mod, mockDb } = loadDb();
    await mod.insertList({
      id: 'c1',
      name: 'Mine',
      kind: 'custom',
      createdAt: 1,
      sortIndex: 3,
    });
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO lists'),
      ['c1', 'Mine', 'custom', 1, 3]
    );

    await mod.renameListRow('c1', 'Renamed');
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'UPDATE lists SET name = ? WHERE id = ? AND kind = ?',
      ['Renamed', 'c1', 'custom']
    );

    await mod.upsertListItem({
      listId: 'c1',
      id: '9',
      slug: 's',
      title: 'T',
      href: '/9.html',
      isSeries: false,
      createdAt: 2,
    });
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO list_items'),
      expect.arrayContaining(['c1', '9', 's', 'T', null, null, '/9.html', null, null, 0, 2])
    );

    await mod.upsertListItem({
      listId: 'c1',
      id: '10',
      slug: 'show',
      title: 'Show',
      href: '/10.html',
      isSeries: true,
      createdAt: 3,
    });
    expect(mockDb.runAsync).toHaveBeenLastCalledWith(
      expect.stringContaining('INSERT INTO list_items'),
      expect.arrayContaining(['c1', '10', 'show', 'Show', null, null, '/10.html', null, null, 1, 3])
    );

    await mod.deleteListItemRow('c1', '9');
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'DELETE FROM list_items WHERE listId = ? AND movieId = ?',
      ['c1', '9']
    );

    await mod.deleteListRow('c1');
    expect(mockDb.runAsync).toHaveBeenCalledWith('DELETE FROM list_items WHERE listId = ?', ['c1']);
    expect(mockDb.runAsync).toHaveBeenCalledWith('DELETE FROM lists WHERE id = ? AND kind = ?', [
      'c1',
      'custom',
    ]);
  });
});
