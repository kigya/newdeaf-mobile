import * as SQLite from 'expo-sqlite';

import type { DownloadMediaKind, DownloadRecord, DownloadSource, DownloadStatus } from './types';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function migrate(db: SQLite.SQLiteDatabase) {
  const cols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(downloads)');
  const names = new Set(cols.map((c) => c.name));
  if (!names.has('hlsUrl')) {
    await db.execAsync('ALTER TABLE downloads ADD COLUMN hlsUrl TEXT');
  }
  if (!names.has('subtitleUrl')) {
    await db.execAsync('ALTER TABLE downloads ADD COLUMN subtitleUrl TEXT');
  }
  if (!names.has('source')) {
    await db.execAsync(`ALTER TABLE downloads ADD COLUMN source TEXT NOT NULL DEFAULT 'movie'`);
  }
  if (!names.has('mediaKind')) {
    await db.execAsync(`ALTER TABLE downloads ADD COLUMN mediaKind TEXT NOT NULL DEFAULT 'hls'`);
  }
  if (!names.has('youtubeUrl')) {
    await db.execAsync('ALTER TABLE downloads ADD COLUMN youtubeUrl TEXT');
  }
}

async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('newdeaf.db');
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS downloads (
          id TEXT PRIMARY KEY NOT NULL,
          movieId TEXT NOT NULL,
          title TEXT NOT NULL,
          posterUrl TEXT,
          audioLabel TEXT NOT NULL,
          quality TEXT NOT NULL,
          subtitleLabel TEXT NOT NULL,
          status TEXT NOT NULL,
          progress REAL NOT NULL DEFAULT 0,
          error TEXT,
          videoDir TEXT,
          playlistPath TEXT,
          subtitlePath TEXT,
          createdAt INTEGER NOT NULL,
          updatedAt INTEGER NOT NULL,
          playerUrl TEXT,
          hlsUrl TEXT,
          subtitleUrl TEXT,
          source TEXT NOT NULL DEFAULT 'movie',
          mediaKind TEXT NOT NULL DEFAULT 'hls',
          youtubeUrl TEXT
        );
      `);
      await migrate(db);
      return db;
    })();
  }
  return dbPromise;
}

function rowToRecord(row: Record<string, unknown>): DownloadRecord {
  const sourceRaw = row.source ? String(row.source) : 'movie';
  const source: DownloadSource = sourceRaw === 'youtube' ? 'youtube' : 'movie';
  const mediaKindRaw = row.mediaKind ? String(row.mediaKind) : 'hls';
  const mediaKind: DownloadMediaKind = mediaKindRaw === 'progressive' ? 'progressive' : 'hls';

  return {
    id: String(row.id),
    movieId: String(row.movieId),
    title: String(row.title),
    posterUrl: row.posterUrl ? String(row.posterUrl) : undefined,
    audioLabel: String(row.audioLabel),
    quality: String(row.quality),
    subtitleLabel: String(row.subtitleLabel),
    status: row.status as DownloadStatus,
    progress: Number(row.progress ?? 0),
    error: row.error ? String(row.error) : undefined,
    videoDir: row.videoDir ? String(row.videoDir) : undefined,
    playlistPath: row.playlistPath ? String(row.playlistPath) : undefined,
    subtitlePath: row.subtitlePath ? String(row.subtitlePath) : undefined,
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
    playerUrl: row.playerUrl ? String(row.playerUrl) : undefined,
    hlsUrl: row.hlsUrl ? String(row.hlsUrl) : undefined,
    subtitleUrl: row.subtitleUrl ? String(row.subtitleUrl) : undefined,
    source,
    mediaKind,
    youtubeUrl: row.youtubeUrl ? String(row.youtubeUrl) : undefined,
  };
}

export async function listDownloads(): Promise<DownloadRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM downloads ORDER BY updatedAt DESC'
  );
  return rows.map(rowToRecord);
}

export async function getDownload(id: string): Promise<DownloadRecord | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM downloads WHERE id = ?',
    [id]
  );
  return row ? rowToRecord(row) : null;
}

export async function upsertDownload(record: DownloadRecord): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO downloads (
      id, movieId, title, posterUrl, audioLabel, quality, subtitleLabel,
      status, progress, error, videoDir, playlistPath, subtitlePath,
      createdAt, updatedAt, playerUrl, hlsUrl, subtitleUrl,
      source, mediaKind, youtubeUrl
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title,
      posterUrl=excluded.posterUrl,
      audioLabel=excluded.audioLabel,
      quality=excluded.quality,
      subtitleLabel=excluded.subtitleLabel,
      status=excluded.status,
      progress=excluded.progress,
      error=excluded.error,
      videoDir=excluded.videoDir,
      playlistPath=excluded.playlistPath,
      subtitlePath=excluded.subtitlePath,
      updatedAt=excluded.updatedAt,
      playerUrl=excluded.playerUrl,
      hlsUrl=excluded.hlsUrl,
      subtitleUrl=excluded.subtitleUrl,
      source=excluded.source,
      mediaKind=excluded.mediaKind,
      youtubeUrl=excluded.youtubeUrl
    `,
    [
      record.id,
      record.movieId,
      record.title,
      record.posterUrl ?? null,
      record.audioLabel,
      record.quality,
      record.subtitleLabel,
      record.status,
      record.progress,
      record.error ?? null,
      record.videoDir ?? null,
      record.playlistPath ?? null,
      record.subtitlePath ?? null,
      record.createdAt,
      record.updatedAt,
      record.playerUrl ?? null,
      record.hlsUrl ?? null,
      record.subtitleUrl ?? null,
      record.source,
      record.mediaKind,
      record.youtubeUrl ?? null,
    ]
  );
}

export async function deleteDownloadRow(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM downloads WHERE id = ?', [id]);
}
