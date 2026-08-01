import * as SQLite from 'expo-sqlite';

import type { FavoriteRecord } from './types';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('newdeaf.db');
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS favorites (
          id TEXT PRIMARY KEY NOT NULL,
          slug TEXT NOT NULL,
          title TEXT NOT NULL,
          year TEXT,
          posterUrl TEXT,
          href TEXT NOT NULL,
          kpRating TEXT,
          imdbRating TEXT,
          isSeries INTEGER NOT NULL DEFAULT 0,
          createdAt INTEGER NOT NULL
        );
      `);
      return db;
    })();
  }
  return dbPromise;
}

function rowToRecord(row: Record<string, unknown>): FavoriteRecord {
  return {
    id: String(row.id),
    slug: String(row.slug ?? ''),
    title: String(row.title),
    year: row.year ? String(row.year) : undefined,
    posterUrl: row.posterUrl ? String(row.posterUrl) : undefined,
    href: String(row.href),
    kpRating: row.kpRating ? String(row.kpRating) : undefined,
    imdbRating: row.imdbRating ? String(row.imdbRating) : undefined,
    isSeries: Number(row.isSeries ?? 0) === 1,
    createdAt: Number(row.createdAt),
  };
}

export async function listFavorites(): Promise<FavoriteRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM favorites ORDER BY createdAt DESC'
  );
  return rows.map(rowToRecord);
}

export async function hasFavorite(id: string): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM favorites WHERE id = ?',
    [id]
  );
  return Boolean(row);
}

export async function upsertFavorite(record: FavoriteRecord): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO favorites (
      id, slug, title, year, posterUrl, href, kpRating, imdbRating, isSeries, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      slug=excluded.slug,
      title=excluded.title,
      year=excluded.year,
      posterUrl=excluded.posterUrl,
      href=excluded.href,
      kpRating=excluded.kpRating,
      imdbRating=excluded.imdbRating,
      isSeries=excluded.isSeries
    `,
    [
      record.id,
      record.slug,
      record.title,
      record.year ?? null,
      record.posterUrl ?? null,
      record.href,
      record.kpRating ?? null,
      record.imdbRating ?? null,
      record.isSeries ? 1 : 0,
      record.createdAt,
    ]
  );
}

export async function deleteFavoriteRow(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM favorites WHERE id = ?', [id]);
}
