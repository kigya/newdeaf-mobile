import * as SQLite from 'expo-sqlite';

import type { TitlePrefsRecord } from './types';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('newdeaf.db');
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS title_prefs (
          movieId TEXT PRIMARY KEY NOT NULL,
          audioLabel TEXT,
          subtitleLabel TEXT,
          introSkipSec REAL,
          updatedAt INTEGER NOT NULL
        );
      `);
      return db;
    })();
  }
  return dbPromise;
}

function rowToRecord(row: Record<string, unknown>): TitlePrefsRecord {
  const intro = row.introSkipSec != null ? Number(row.introSkipSec) : undefined;
  return {
    movieId: String(row.movieId),
    audioLabel: row.audioLabel ? String(row.audioLabel) : undefined,
    subtitleLabel: row.subtitleLabel ? String(row.subtitleLabel) : undefined,
    introSkipSec: intro != null && Number.isFinite(intro) ? intro : undefined,
    updatedAt: Number(row.updatedAt),
  };
}

export async function listTitlePrefs(): Promise<TitlePrefsRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM title_prefs ORDER BY updatedAt DESC'
  );
  return rows.map(rowToRecord);
}

export async function getTitlePrefs(movieId: string): Promise<TitlePrefsRecord | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM title_prefs WHERE movieId = ?',
    [movieId]
  );
  return row ? rowToRecord(row) : null;
}

export async function upsertTitlePrefs(record: TitlePrefsRecord): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO title_prefs (movieId, audioLabel, subtitleLabel, introSkipSec, updatedAt)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(movieId) DO UPDATE SET
       audioLabel=excluded.audioLabel,
       subtitleLabel=excluded.subtitleLabel,
       introSkipSec=excluded.introSkipSec,
       updatedAt=excluded.updatedAt`,
    [
      record.movieId,
      record.audioLabel ?? null,
      record.subtitleLabel ?? null,
      record.introSkipSec ?? null,
      record.updatedAt,
    ]
  );
}
