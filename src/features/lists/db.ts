import * as SQLite from 'expo-sqlite';

import { BUILTIN_LISTS, type ListItemRecord, type ListKind, type ListRecord } from './types';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function ensureBuiltins(db: SQLite.SQLiteDatabase) {
  for (const list of BUILTIN_LISTS) {
    await db.runAsync(
      `INSERT INTO lists (id, name, kind, createdAt, sortIndex)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
      [list.id, list.name, list.kind, list.createdAt, list.sortIndex]
    );
  }
}

async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('newdeaf.db');
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS lists (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          kind TEXT NOT NULL,
          createdAt INTEGER NOT NULL,
          sortIndex INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS list_items (
          listId TEXT NOT NULL,
          movieId TEXT NOT NULL,
          slug TEXT NOT NULL,
          title TEXT NOT NULL,
          year TEXT,
          posterUrl TEXT,
          href TEXT NOT NULL,
          kpRating TEXT,
          imdbRating TEXT,
          isSeries INTEGER NOT NULL DEFAULT 0,
          createdAt INTEGER NOT NULL,
          PRIMARY KEY (listId, movieId)
        );
      `);
      await ensureBuiltins(db);
      return db;
    })();
  }
  return dbPromise;
}

function isKind(value: unknown): value is ListKind {
  return value === 'builtin' || value === 'custom';
}

function rowToList(row: Record<string, unknown>): ListRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    kind: isKind(row.kind) ? row.kind : 'custom',
    createdAt: Number(row.createdAt),
    sortIndex: Number(row.sortIndex ?? 0),
  };
}

function rowToItem(row: Record<string, unknown>): ListItemRecord {
  return {
    listId: String(row.listId),
    id: String(row.movieId),
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

export async function listLists(): Promise<ListRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM lists ORDER BY sortIndex ASC, createdAt ASC'
  );
  return rows.map(rowToList);
}

export async function listItemsFor(listId: string): Promise<ListItemRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM list_items WHERE listId = ? ORDER BY createdAt DESC',
    [listId]
  );
  return rows.map(rowToItem);
}

export async function listAllItems(): Promise<ListItemRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM list_items ORDER BY createdAt DESC'
  );
  return rows.map(rowToItem);
}

export async function insertList(record: ListRecord): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO lists (id, name, kind, createdAt, sortIndex) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, sortIndex=excluded.sortIndex`,
    [record.id, record.name, record.kind, record.createdAt, record.sortIndex]
  );
}

export async function renameListRow(id: string, name: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE lists SET name = ? WHERE id = ? AND kind = ?', [name, id, 'custom']);
}

export async function deleteListRow(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM list_items WHERE listId = ?', [id]);
  await db.runAsync('DELETE FROM lists WHERE id = ? AND kind = ?', [id, 'custom']);
}

export async function upsertListItem(record: ListItemRecord): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO list_items (
      listId, movieId, slug, title, year, posterUrl, href, kpRating, imdbRating, isSeries, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(listId, movieId) DO UPDATE SET
      slug=excluded.slug,
      title=excluded.title,
      year=excluded.year,
      posterUrl=excluded.posterUrl,
      href=excluded.href,
      kpRating=excluded.kpRating,
      imdbRating=excluded.imdbRating,
      isSeries=excluded.isSeries`,
    [
      record.listId,
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

export async function deleteListItemRow(listId: string, movieId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM list_items WHERE listId = ? AND movieId = ?', [listId, movieId]);
}
