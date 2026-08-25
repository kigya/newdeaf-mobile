import * as SQLite from 'expo-sqlite';

import type { MovieSummary } from '@/src/data/catalog/types';

import { type DiscoveryRailId, type DiscoveryRailRecord } from './types';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('newdeaf.db');
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS discovery_rails (
          railId TEXT PRIMARY KEY NOT NULL,
          itemsJson TEXT NOT NULL,
          updatedAt INTEGER NOT NULL
        );
      `);
      return db;
    })();
  }
  return dbPromise;
}

function parseItems(raw: string): MovieSummary[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is MovieSummary => {
      if (!item || typeof item !== 'object') return false;
      const row = item as MovieSummary;
      return typeof row.id === 'string' && typeof row.title === 'string';
    });
  } catch {
    return [];
  }
}

export async function listDiscoveryRails(): Promise<DiscoveryRailRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>('SELECT * FROM discovery_rails');
  return rows.map((row) => ({
    railId: String(row.railId) as DiscoveryRailId,
    items: parseItems(String(row.itemsJson ?? '[]')),
    updatedAt: Number(row.updatedAt),
  }));
}

export async function upsertDiscoveryRail(record: DiscoveryRailRecord): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO discovery_rails (railId, itemsJson, updatedAt)
     VALUES (?, ?, ?)
     ON CONFLICT(railId) DO UPDATE SET
       itemsJson=excluded.itemsJson,
       updatedAt=excluded.updatedAt`,
    [record.railId, JSON.stringify(record.items), record.updatedAt]
  );
}
