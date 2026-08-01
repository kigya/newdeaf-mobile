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
    require('@/src/features/watch-progress/db') as typeof import('@/src/features/watch-progress/db');
  return { mod, mockDb, SQLite };
}

function sampleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '10',
    movieId: '10',
    season: null,
    episode: null,
    positionSec: 40,
    durationSec: 1000,
    title: 'Film',
    posterUrl: 'https://p',
    href: '/10.html',
    isSeries: 0,
    source: 'online',
    downloadId: null,
    updatedAt: 99,
    ...overrides,
  };
}

describe('watch-progress db', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('listWatchProgress maps rows including offline source', async () => {
    const { mod, mockDb } = loadDb();
    mockDb.getAllAsync.mockResolvedValue([
      sampleRow(),
      sampleRow({
        id: '10_s1e2',
        season: 1,
        episode: 2,
        isSeries: 1,
        source: 'offline',
        downloadId: 'd1',
        posterUrl: null,
        href: null,
        durationSec: null,
      }),
      sampleRow({ id: 'x', source: '', positionSec: null }),
    ]);

    const rows = await mod.listWatchProgress();
    expect(rows[0].source).toBe('online');
    expect(rows[1]).toMatchObject({
      season: 1,
      episode: 2,
      isSeries: true,
      source: 'offline',
      downloadId: 'd1',
      posterUrl: undefined,
      href: undefined,
      durationSec: undefined,
    });
    expect(rows[2].source).toBe('online');
    expect(rows[2].positionSec).toBe(0);
  });

  it('getWatchProgress uses makeProgressId', async () => {
    const { mod, mockDb } = loadDb();
    mockDb.getFirstAsync.mockResolvedValueOnce(null);
    expect(await mod.getWatchProgress('10', 1, 2)).toBeNull();
    expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id = ?'),
      ['10_s1e2']
    );

    mockDb.getFirstAsync.mockResolvedValueOnce(sampleRow());
    expect(await mod.getWatchProgress('10')).toMatchObject({ id: '10' });
  });

  it('getLatestWatchProgressForMovie queries by movieId', async () => {
    const { mod, mockDb } = loadDb();
    mockDb.getFirstAsync.mockResolvedValueOnce(sampleRow({ id: 'latest' }));
    const row = await mod.getLatestWatchProgressForMovie('10');
    expect(row?.id).toBe('latest');
    expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY updatedAt DESC LIMIT 1'),
      ['10']
    );
    mockDb.getFirstAsync.mockResolvedValueOnce(null);
    expect(await mod.getLatestWatchProgressForMovie('missing')).toBeNull();
  });

  it('upsertWatchProgress persists and returns record', async () => {
    const { mod, mockDb } = loadDb();
    const record = await mod.upsertWatchProgress({
      movieId: '10',
      season: 1,
      episode: 3,
      positionSec: 50,
      durationSec: 900,
      title: 'Ep',
      source: 'online',
    });
    expect(record.id).toBe('10_s1e3');
    expect(record.isSeries).toBe(true);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO watch_progress'),
      expect.arrayContaining(['10_s1e3', '10', 1, 3, 50, 900])
    );
  });

  it('upsertWatchProgress respects explicit isSeries false', async () => {
    const { mod } = loadDb();
    const record = await mod.upsertWatchProgress({
      movieId: '10',
      season: 1,
      episode: 1,
      positionSec: 10,
      title: 'T',
      source: 'online',
      isSeries: false,
    });
    expect(record.isSeries).toBe(false);
  });

  it('deleteWatchProgress and deleteWatchProgressForEpisode', async () => {
    const { mod, mockDb } = loadDb();
    await mod.deleteWatchProgress('abc');
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'DELETE FROM watch_progress WHERE id = ?',
      ['abc']
    );
    await mod.deleteWatchProgressForEpisode('10', 2, 4);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'DELETE FROM watch_progress WHERE id = ?',
      ['10_s2e4']
    );
  });
});
