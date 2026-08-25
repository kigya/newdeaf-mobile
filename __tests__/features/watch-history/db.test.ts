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
  const mod =
    require('@/src/features/watch-history/db') as typeof import('@/src/features/watch-history/db');
  return { mod, mockDb, SQLite };
}

describe('watch-history db', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('listWatchHistory maps source/completed and optional fields', async () => {
    const { mod, mockDb } = loadDb();
    mockDb.getAllAsync.mockResolvedValue([
      {
        id: '1',
        movieId: '1',
        season: 1,
        episode: 2,
        title: 'A',
        posterUrl: 'https://p',
        href: '/1.html',
        isSeries: 1,
        source: 'offline',
        positionSec: 40,
        durationSec: 100,
        completed: 1,
        watchedAt: 9,
      },
      {
        id: '2',
        movieId: '2',
        season: null,
        episode: null,
        title: 'B',
        posterUrl: null,
        href: null,
        isSeries: 0,
        source: 'weird',
        positionSec: null,
        durationSec: null,
        completed: 0,
        watchedAt: 8,
      },
      {
        id: '3',
        movieId: '3',
        title: 'C',
        watchedAt: 7,
      },
    ]);
    const rows = await mod.listWatchHistory();
    expect(rows[0]).toMatchObject({
      source: 'offline',
      isSeries: true,
      completed: true,
      season: 1,
      episode: 2,
    });
    expect(rows[1]).toMatchObject({
      source: 'online',
      isSeries: false,
      completed: false,
      posterUrl: undefined,
      positionSec: 0,
    });
    expect(rows[2]).toMatchObject({
      source: 'online',
      isSeries: false,
      completed: false,
    });
  });

  it('upsertWatchHistory infers series from season/episode', async () => {
    const { mod, mockDb } = loadDb();
    const record = await mod.upsertWatchHistory({
      movieId: '10',
      season: 1,
      episode: 2,
      title: 'Ep',
      source: 'online',
      positionSec: 15,
      completed: false,
    });
    expect(record.id).toBe('10_s1e2');
    expect(record.isSeries).toBe(true);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO watch_history'),
      expect.arrayContaining(['10_s1e2', '10', 1, 2, 'Ep'])
    );

    const movie = await mod.upsertWatchHistory({
      movieId: '11',
      title: 'Film',
      source: 'offline',
      positionSec: 1,
      durationSec: 90,
      completed: true,
      isSeries: false,
    });
    expect(movie.id).toBe('11');
    expect(movie.isSeries).toBe(false);
  });

  it('deleteWatchHistoryRow and reuses db', async () => {
    const { mod, mockDb, SQLite } = loadDb();
    await mod.deleteWatchHistoryRow('gone');
    expect(mockDb.runAsync).toHaveBeenCalledWith('DELETE FROM watch_history WHERE id = ?', [
      'gone',
    ]);
    await mod.listWatchHistory();
    expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(1);
  });
});
