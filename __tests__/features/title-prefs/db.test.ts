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
  const mod = require('@/src/features/title-prefs/db') as typeof import('@/src/features/title-prefs/db');
  return { mod, mockDb, SQLite };
}

describe('title-prefs db', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('listTitlePrefs maps optional fields and skips invalid introSkipSec', async () => {
    const { mod, mockDb } = loadDb();
    mockDb.getAllAsync.mockResolvedValue([
      {
        movieId: '1',
        audioLabel: 'RU',
        subtitleLabel: 'EN',
        introSkipSec: 90,
        updatedAt: 10,
      },
      {
        movieId: '2',
        audioLabel: '',
        subtitleLabel: null,
        introSkipSec: 'nope',
        updatedAt: 5,
      },
      {
        movieId: '3',
        introSkipSec: null,
        updatedAt: 4,
      },
    ]);
    const rows = await mod.listTitlePrefs();
    expect(rows[0]).toMatchObject({
      movieId: '1',
      audioLabel: 'RU',
      introSkipSec: 90,
    });
    expect(rows[1].audioLabel).toBeUndefined();
    expect(rows[1].introSkipSec).toBeUndefined();
    expect(rows[2].introSkipSec).toBeUndefined();
  });

  it('getTitlePrefs returns null or a mapped row', async () => {
    const { mod, mockDb } = loadDb();
    mockDb.getFirstAsync.mockResolvedValueOnce(null);
    expect(await mod.getTitlePrefs('missing')).toBeNull();
    mockDb.getFirstAsync.mockResolvedValueOnce({
      movieId: '9',
      introSkipSec: 0,
      updatedAt: 1,
    });
    expect(await mod.getTitlePrefs('9')).toMatchObject({ movieId: '9', introSkipSec: 0 });
  });

  it('upsertTitlePrefs binds nullables and reuses the db', async () => {
    const { mod, mockDb, SQLite } = loadDb();
    await mod.upsertTitlePrefs({ movieId: '1', updatedAt: 2 });
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO title_prefs'),
      ['1', null, null, null, 2]
    );
    await mod.upsertTitlePrefs({
      movieId: '1',
      audioLabel: 'A',
      subtitleLabel: 'S',
      introSkipSec: 12,
      updatedAt: 3,
    });
    expect(mockDb.runAsync).toHaveBeenLastCalledWith(
      expect.stringContaining('INSERT INTO title_prefs'),
      ['1', 'A', 'S', 12, 3]
    );
    expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(1);
  });
});
