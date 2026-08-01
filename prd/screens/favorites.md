# Screen: Favorites

- **Status:** implemented
- **Last updated:** 2026-08-01
- **Route:** `/(tabs)/favorites`
- **Related code:** `app/(tabs)/favorites.tsx`, `src/favorites/`

## Purpose

Local shortlist of saved titles (SQLite + Zustand). No cloud sync.

## Actions

| Action | Result |
|--------|--------|
| Tap | `/movie/[id]` |
| Long-press | ConfirmDialog → remove favorite |

## UI extras

- Download badges via `isMovieDownloaded`
- Watch progress overlays when present

## States

| State | Behavior |
|-------|----------|
| Loading | `loading={!hydrated}` on grid |
| Empty | Favorites empty i18n |
| Error | No dedicated error surface (local only) |

## Acceptance

- Survives kill/relaunch after hydrate
- Double-tap favorite toggle on detail is in-flight guarded (store)
- Ordered `createdAt DESC`
