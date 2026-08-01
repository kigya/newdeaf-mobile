type MockDb = {
  execAsync: jest.Mock;
  runAsync: jest.Mock;
  getFirstAsync: jest.Mock;
  getAllAsync: jest.Mock;
};

const ALL_DOWNLOAD_COLS = [
  'id',
  'movieId',
  'title',
  'posterUrl',
  'audioLabel',
  'quality',
  'subtitleLabel',
  'status',
  'progress',
  'error',
  'videoDir',
  'playlistPath',
  'subtitlePath',
  'createdAt',
  'updatedAt',
  'playerUrl',
  'hlsUrl',
  'subtitleUrl',
  'source',
  'mediaKind',
  'youtubeUrl',
  'season',
  'episode',
].map((name) => ({ name }));

function createMockDb(tableCols: { name: string }[] = ALL_DOWNLOAD_COLS): MockDb {
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

function loadDbModule(tableCols?: { name: string }[]) {
  jest.resetModules();
  const mockDb = createMockDb(tableCols);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const SQLite = require('expo-sqlite') as { openDatabaseAsync: jest.Mock };
  SQLite.openDatabaseAsync = jest.fn(async () => mockDb);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@/src/features/downloads/db') as typeof import('@/src/features/downloads/db');
  return { mod, mockDb, SQLite };
}

function sampleRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'd1',
    movieId: '10',
    title: 'Film',
    posterUrl: 'https://p',
    audioLabel: 'RU',
    quality: '720',
    subtitleLabel: 'subs',
    status: 'completed',
    progress: 1,
    error: null,
    videoDir: 'file:///v/',
    playlistPath: 'file:///v/index.m3u8',
    subtitlePath: 'file:///v/subs.vtt',
    createdAt: 100,
    updatedAt: 200,
    playerUrl: 'https://player',
    hlsUrl: 'https://hls',
    subtitleUrl: 'https://subs',
    source: 'movie',
    mediaKind: 'hls',
    youtubeUrl: null,
    season: null,
    episode: null,
    ...overrides,
  };
}

describe('downloads db', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('migrates missing columns on open', async () => {
    const { mod, mockDb } = loadDbModule([{ name: 'id' }, { name: 'movieId' }]);
    await mod.listDownloads();
    const alters = mockDb.execAsync.mock.calls
      .map((c) => String(c[0]))
      .filter((s) => s.includes('ALTER TABLE'));
    expect(alters.some((s) => s.includes('hlsUrl'))).toBe(true);
    expect(alters.some((s) => s.includes('subtitleUrl'))).toBe(true);
    expect(alters.some((s) => s.includes('source'))).toBe(true);
    expect(alters.some((s) => s.includes('mediaKind'))).toBe(true);
    expect(alters.some((s) => s.includes('youtubeUrl'))).toBe(true);
    expect(alters.some((s) => s.includes('season'))).toBe(true);
    expect(alters.some((s) => s.includes('episode'))).toBe(true);
  });

  it('listDownloads maps rows and normalizes legacy status', async () => {
    const { mod, mockDb } = loadDbModule();
    mockDb.getAllAsync.mockImplementation(async (sql: string) => {
      if (String(sql).includes('PRAGMA')) return ALL_DOWNLOAD_COLS;
      return [
        sampleRow({ status: 'paused' }),
        sampleRow({ id: 'd2', status: 'weird', source: 'youtube', mediaKind: 'progressive' }),
        sampleRow({
          id: 'd3',
          posterUrl: null,
          error: 'e',
          youtubeUrl: 'https://yt',
          season: 1,
          episode: 2,
          source: '',
          mediaKind: '',
        }),
        sampleRow({
          id: 'd4',
          status: null,
          progress: null,
          videoDir: null,
          playlistPath: null,
          subtitlePath: null,
          playerUrl: null,
          hlsUrl: null,
          subtitleUrl: null,
          error: null,
          youtubeUrl: null,
          season: null,
          episode: null,
        }),
        sampleRow({ id: 'd5', status: 'resolving' }),
        sampleRow({ id: 'd6', status: 'downloading' }),
        sampleRow({ id: 'd7', status: 'failed' }),
      ];
    });

    const rows = await mod.listDownloads();
    expect(rows[0].status).toBe('failed');
    expect(rows[1].source).toBe('youtube');
    expect(rows[1].mediaKind).toBe('progressive');
    expect(rows[1].status).toBe('failed');
    expect(rows[2].posterUrl).toBeUndefined();
    expect(rows[2].error).toBe('e');
    expect(rows[2].youtubeUrl).toBe('https://yt');
    expect(rows[2].season).toBe(1);
    expect(rows[2].episode).toBe(2);
    expect(rows[2].source).toBe('movie');
    expect(rows[2].mediaKind).toBe('hls');
    expect(rows[3].status).toBe('failed');
    expect(rows[3].progress).toBe(0);
    expect(rows[3].videoDir).toBeUndefined();
    expect(rows[3].playlistPath).toBeUndefined();
    expect(rows[3].subtitlePath).toBeUndefined();
    expect(rows[3].playerUrl).toBeUndefined();
    expect(rows[3].hlsUrl).toBeUndefined();
    expect(rows[3].subtitleUrl).toBeUndefined();
    expect(rows[4].status).toBe('resolving');
    expect(rows[5].status).toBe('downloading');
    expect(rows[6].status).toBe('failed');
  });

  it('getDownload returns null or mapped record', async () => {
    const { mod, mockDb } = loadDbModule();
    mockDb.getFirstAsync.mockResolvedValueOnce(null);
    expect(await mod.getDownload('missing')).toBeNull();

    mockDb.getFirstAsync.mockResolvedValueOnce(sampleRow({ status: 'queued' }));
    const row = await mod.getDownload('d1');
    expect(row?.status).toBe('queued');
    expect(row?.id).toBe('d1');
  });

  it('upsertDownload runs insert with nullables', async () => {
    const { mod, mockDb } = loadDbModule();
    await mod.upsertDownload({
      id: 'x',
      movieId: '1',
      title: 'T',
      audioLabel: 'a',
      quality: '720',
      subtitleLabel: '',
      status: 'queued',
      progress: 0,
      createdAt: 1,
      updatedAt: 2,
      source: 'movie',
      mediaKind: 'hls',
    });
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO downloads'),
      expect.arrayContaining(['x', '1', 'T', null, 'a', '720'])
    );
  });

  it('deleteDownloadRow deletes by id', async () => {
    const { mod, mockDb } = loadDbModule();
    await mod.deleteDownloadRow('gone');
    expect(mockDb.runAsync).toHaveBeenCalledWith('DELETE FROM downloads WHERE id = ?', [
      'gone',
    ]);
  });

  it('reuses opened database promise', async () => {
    const { mod, SQLite } = loadDbModule();
    await mod.listDownloads();
    await mod.listDownloads();
    expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(1);
  });
});
