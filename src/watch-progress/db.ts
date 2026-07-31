import * as SQLite from 'expo-sqlite';

import {
  makeProgressId,
  type WatchProgressRecord,
  type WatchProgressSource,
  type WatchProgressUpsert,
} from './types';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('newdeaf.db');
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS watch_progress (
          id TEXT PRIMARY KEY NOT NULL,
          movieId TEXT NOT NULL,
          season INTEGER,
          episode INTEGER,
          positionSec REAL NOT NULL DEFAULT 0,
          durationSec REAL,
          title TEXT NOT NULL,
          posterUrl TEXT,
          href TEXT,
          isSeries INTEGER NOT NULL DEFAULT 0,
          source TEXT NOT NULL,
          downloadId TEXT,
          updatedAt INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_watch_progress_movie
          ON watch_progress(movieId, updatedAt DESC);
      `);
      return db;
    })();
  }
  return dbPromise;
}

function rowToRecord(row: Record<string, unknown>): WatchProgressRecord {
  const sourceRaw = row.source ? String(row.source) : 'online';
  const source: WatchProgressSource = sourceRaw === 'offline' ? 'offline' : 'online';
  return {
    id: String(row.id),
    movieId: String(row.movieId),
    season: row.season != null ? Number(row.season) : undefined,
    episode: row.episode != null ? Number(row.episode) : undefined,
    positionSec: Number(row.positionSec ?? 0),
    durationSec: row.durationSec != null ? Number(row.durationSec) : undefined,
    title: String(row.title),
    posterUrl: row.posterUrl ? String(row.posterUrl) : undefined,
    href: row.href ? String(row.href) : undefined,
    isSeries: Number(row.isSeries ?? 0) === 1,
    source,
    downloadId: row.downloadId ? String(row.downloadId) : undefined,
    updatedAt: Number(row.updatedAt),
  };
}

export async function listWatchProgress(): Promise<WatchProgressRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM watch_progress ORDER BY updatedAt DESC'
  );
  return rows.map(rowToRecord);
}

export async function getWatchProgress(
  movieId: string,
  season?: number,
  episode?: number
): Promise<WatchProgressRecord | null> {
  const db = await getDb();
  const id = makeProgressId(movieId, season, episode);
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM watch_progress WHERE id = ?',
    [id]
  );
  return row ? rowToRecord(row) : null;
}

export async function getLatestWatchProgressForMovie(
  movieId: string
): Promise<WatchProgressRecord | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM watch_progress WHERE movieId = ? ORDER BY updatedAt DESC LIMIT 1',
    [movieId]
  );
  return row ? rowToRecord(row) : null;
}

export async function upsertWatchProgress(input: WatchProgressUpsert): Promise<WatchProgressRecord> {
  const db = await getDb();
  const id = makeProgressId(input.movieId, input.season, input.episode);
  const updatedAt = Date.now();
  const isSeries =
    input.isSeries ?? (input.season != null && input.episode != null);
  const record: WatchProgressRecord = {
    id,
    movieId: input.movieId,
    season: input.season,
    episode: input.episode,
    positionSec: input.positionSec,
    durationSec: input.durationSec,
    title: input.title,
    posterUrl: input.posterUrl,
    href: input.href,
    isSeries,
    source: input.source,
    downloadId: input.downloadId,
    updatedAt,
  };

  await db.runAsync(
    `INSERT INTO watch_progress (
      id, movieId, season, episode, positionSec, durationSec,
      title, posterUrl, href, isSeries, source, downloadId, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      movieId=excluded.movieId,
      season=excluded.season,
      episode=excluded.episode,
      positionSec=excluded.positionSec,
      durationSec=excluded.durationSec,
      title=excluded.title,
      posterUrl=excluded.posterUrl,
      href=excluded.href,
      isSeries=excluded.isSeries,
      source=excluded.source,
      downloadId=excluded.downloadId,
      updatedAt=excluded.updatedAt
    `,
    [
      record.id,
      record.movieId,
      record.season ?? null,
      record.episode ?? null,
      record.positionSec,
      record.durationSec ?? null,
      record.title,
      record.posterUrl ?? null,
      record.href ?? null,
      record.isSeries ? 1 : 0,
      record.source,
      record.downloadId ?? null,
      record.updatedAt,
    ]
  );

  return record;
}

export async function deleteWatchProgress(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM watch_progress WHERE id = ?', [id]);
}

export async function deleteWatchProgressForEpisode(
  movieId: string,
  season?: number,
  episode?: number
): Promise<void> {
  await deleteWatchProgress(makeProgressId(movieId, season, episode));
}
