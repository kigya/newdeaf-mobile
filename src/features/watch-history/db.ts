import * as SQLite from 'expo-sqlite';

import { makeProgressId, type WatchProgressSource } from '@/src/features/watch-progress/types';

import type { WatchHistoryRecord, WatchHistoryUpsert } from './types';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('newdeaf.db');
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS watch_history (
          id TEXT PRIMARY KEY NOT NULL,
          movieId TEXT NOT NULL,
          season INTEGER,
          episode INTEGER,
          title TEXT NOT NULL,
          posterUrl TEXT,
          href TEXT,
          isSeries INTEGER NOT NULL DEFAULT 0,
          source TEXT NOT NULL,
          positionSec REAL NOT NULL DEFAULT 0,
          durationSec REAL,
          completed INTEGER NOT NULL DEFAULT 0,
          watchedAt INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_watch_history_watched
          ON watch_history(watchedAt DESC);
      `);
      return db;
    })();
  }
  return dbPromise;
}

function rowToRecord(row: Record<string, unknown>): WatchHistoryRecord {
  const sourceRaw = row.source ? String(row.source) : 'online';
  const source: WatchProgressSource = sourceRaw === 'offline' ? 'offline' : 'online';
  return {
    id: String(row.id),
    movieId: String(row.movieId),
    season: row.season != null ? Number(row.season) : undefined,
    episode: row.episode != null ? Number(row.episode) : undefined,
    title: String(row.title),
    posterUrl: row.posterUrl ? String(row.posterUrl) : undefined,
    href: row.href ? String(row.href) : undefined,
    isSeries: Number(row.isSeries ?? 0) === 1,
    source,
    positionSec: Number(row.positionSec ?? 0),
    durationSec: row.durationSec != null ? Number(row.durationSec) : undefined,
    completed: Number(row.completed ?? 0) === 1,
    watchedAt: Number(row.watchedAt),
  };
}

export async function listWatchHistory(): Promise<WatchHistoryRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM watch_history ORDER BY watchedAt DESC'
  );
  return rows.map(rowToRecord);
}

export async function upsertWatchHistory(input: WatchHistoryUpsert): Promise<WatchHistoryRecord> {
  const db = await getDb();
  const id = makeProgressId(input.movieId, input.season, input.episode);
  const watchedAt = Date.now();
  const isSeries = input.isSeries ?? (input.season != null && input.episode != null);
  const record: WatchHistoryRecord = {
    id,
    movieId: input.movieId,
    season: input.season,
    episode: input.episode,
    title: input.title,
    posterUrl: input.posterUrl,
    href: input.href,
    isSeries,
    source: input.source,
    positionSec: input.positionSec,
    durationSec: input.durationSec,
    completed: input.completed,
    watchedAt,
  };
  await db.runAsync(
    `INSERT INTO watch_history (
      id, movieId, season, episode, title, posterUrl, href, isSeries, source,
      positionSec, durationSec, completed, watchedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title,
      posterUrl=excluded.posterUrl,
      href=excluded.href,
      isSeries=excluded.isSeries,
      source=excluded.source,
      positionSec=excluded.positionSec,
      durationSec=excluded.durationSec,
      completed=excluded.completed,
      watchedAt=excluded.watchedAt`,
    [
      record.id,
      record.movieId,
      record.season ?? null,
      record.episode ?? null,
      record.title,
      record.posterUrl ?? null,
      record.href ?? null,
      record.isSeries ? 1 : 0,
      record.source,
      record.positionSec,
      record.durationSec ?? null,
      record.completed ? 1 : 0,
      record.watchedAt,
    ]
  );
  return record;
}

export async function deleteWatchHistoryRow(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM watch_history WHERE id = ?', [id]);
}
