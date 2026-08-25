import * as SQLite from 'expo-sqlite';

import {
  DEFAULT_PREFERRED_QUALITY,
  DEFAULT_STORAGE_CAP_MB,
  type AppLocale,
  type PreferredDownloadQuality,
  type SettingsRecord,
} from './types';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function migrate(db: SQLite.SQLiteDatabase) {
  const cols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(settings)');
  const names = new Set(cols.map((c) => c.name));
  if (!names.has('downloadsWifiOnly')) {
    await db.execAsync(
      'ALTER TABLE settings ADD COLUMN downloadsWifiOnly INTEGER NOT NULL DEFAULT 0'
    );
  }
  if (!names.has('storageCapMb')) {
    await db.execAsync(
      `ALTER TABLE settings ADD COLUMN storageCapMb INTEGER NOT NULL DEFAULT ${DEFAULT_STORAGE_CAP_MB}`
    );
  }
}

async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('newdeaf.db');
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS settings (
          id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
          locale TEXT NOT NULL,
          lastSeenSystemLocale TEXT NOT NULL,
          preferredDownloadQuality TEXT NOT NULL,
          downloadsWifiOnly INTEGER NOT NULL DEFAULT 0,
          storageCapMb INTEGER NOT NULL DEFAULT 0
        );
      `);
      await migrate(db);
      return db;
    })();
  }
  return dbPromise;
}

function isLocale(value: unknown): value is AppLocale {
  return value === 'ru' || value === 'en';
}

function isQuality(value: unknown): value is PreferredDownloadQuality {
  return (
    value === 'best' ||
    value === '1080' ||
    value === '720' ||
    value === '480' ||
    value === '360'
  );
}

function rowToRecord(row: Record<string, unknown>): SettingsRecord {
  const cap = Number(row.storageCapMb);
  return {
    locale: isLocale(row.locale) ? row.locale : 'en',
    lastSeenSystemLocale: isLocale(row.lastSeenSystemLocale)
      ? row.lastSeenSystemLocale
      : 'en',
    preferredDownloadQuality: isQuality(row.preferredDownloadQuality)
      ? row.preferredDownloadQuality
      : DEFAULT_PREFERRED_QUALITY,
    downloadsWifiOnly: Number(row.downloadsWifiOnly ?? 0) === 1,
    storageCapMb: Number.isFinite(cap) && cap >= 0 ? cap : DEFAULT_STORAGE_CAP_MB,
  };
}

export async function loadSettings(): Promise<SettingsRecord | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT locale, lastSeenSystemLocale, preferredDownloadQuality,
            downloadsWifiOnly, storageCapMb
     FROM settings WHERE id = 1`
  );
  if (!row) return null;
  return rowToRecord(row);
}

export async function saveSettings(record: SettingsRecord): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO settings (
      id, locale, lastSeenSystemLocale, preferredDownloadQuality,
      downloadsWifiOnly, storageCapMb
    ) VALUES (1, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       locale=excluded.locale,
       lastSeenSystemLocale=excluded.lastSeenSystemLocale,
       preferredDownloadQuality=excluded.preferredDownloadQuality,
       downloadsWifiOnly=excluded.downloadsWifiOnly,
       storageCapMb=excluded.storageCapMb`,
    [
      record.locale,
      record.lastSeenSystemLocale,
      record.preferredDownloadQuality,
      record.downloadsWifiOnly ? 1 : 0,
      record.storageCapMb,
    ]
  );
}
