---
name: newdeaf-local-data
description: >-
  NewDeaf local-first data: Zustand stores hydrated from expo-sqlite, feature
  modules (downloads, favorites, watch-progress), and expo-file-system media
  files. Use when adding or changing persistence, stores, DB schema, favorites,
  download metadata, watch progress, or local file storage.
---

# NewDeaf local data

## Architecture

Local-first, no cloud sync. Feature folders own their state:

| Module | Path | Role |
|--------|------|------|
| Downloads | `src/features/downloads/` | Queue, metadata, file paths, FGS hooks |
| Favorites | `src/features/favorites/` | Saved movies |
| Watch progress | `src/features/watch-progress/` | Resume positions |
| Settings | `src/features/settings/` | Locale SSOT, default download quality |

Each feature uses **`types.ts` + `db.ts` + `store.ts`** (settings also has `pickPreferredQuality.ts`). SQLite DB file: `newdeaf.db` via expo-sqlite.

Behavior contracts: `prd/behavior/cross-cutting.md`, `prd/screens/`, `prd/features/`. After changes run `npm test` / `npm run test:coverage`.

## Rules

1. Extend the existing feature module instead of creating a parallel persistence stack.
2. Keep Zod/ORM out unless explicitly requested — match current typed rows + SQL helpers.
3. Zustand: subscribe with **selectors** (`useStore(s => s.field)`), not the whole store, to avoid extra re-renders.
4. Persist mutations through `db.ts` helpers, then update the store (or hydrate from DB) so disk and memory stay aligned.
5. Hydrate stores on app launch (see root layout / existing init paths) — do not assume in-memory state survives process death.
6. Media blobs and HLS segments live under documentDirectory via expo-file-system — never stuff large binaries into SQLite or AsyncStorage.
7. Do not introduce React Query / SWR for server cache: remote catalog is scrape-on-demand via `src/data/catalog/`; durable user data is SQLite.
8. Schema changes: migrate carefully in `db.ts` (versioned ALTER / recreate patterns already used in-module); keep types in `types.ts` in sync.

## Remote vs local

- **Remote catalog**: `src/data/catalog/client.ts`, `catalog.ts`, `parse.ts` — `fetch` + win1251 HTML from `BASE_URL` (`https://newdeaf.top`).
- **User data**: SQLite + filesystem only.

## Anti-patterns

- Redux / Jotai / MMKV as a new source of truth
- Storing download files only as remote URLs without local paths when offline playback is required
- Writing to SQLite from random UI files — go through the feature `db.ts` / `store.ts`
