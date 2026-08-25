# PRD: Library and stats

- **Status:** implemented
- **Last updated:** 2026-08-25
- **Related code:** `src/screens/favorites/FavoritesScreen.tsx`, `src/features/lists/`, `src/features/watch-history/`, `src/features/stats/computeStats.ts`, `src/shared/ui/ListPickerSheet.tsx`
- **Screens:** [`../screens/favorites.md`](../screens/favorites.md)

## Problem

Favorites alone is a weak library. Users need queue, rewatch, history, and a lightweight stats snapshot — still local-only.

## Goals

- Library tab segments: Favorites / Queue / Rewatch / History, plus a chip per custom shelf
- Builtin lists `queue` and `rewatch` plus custom shelves (`lists` + `list_items`)
- Favorites table **unchanged** (virtual list, not migrated into `lists`)
- `watch_history` is separate from `watch_progress`: completed progress rows still delete (Continue Watching stays unfinished-only)
- History is written from watch-progress `upsert`, including the completed branch
- History grid collapses to the latest row per `movieId` (unique keys; series cards keep SxxExx in the title)
- Long-press a title: ConfirmDialog → remove from the active segment
- Custom list chips: tap × (or long-press the chip) → ConfirmDialog → delete the list (builtins stay)
- Stats: hours watched, finished count, favorites count, downloads size as tappable 2×2 KPI tiles (disk usage refreshes on job id+status, not every progress tick)
- Add-to-list from movie detail via `ListPickerSheet`

## Non-goals

- Cloud sync, accounts, collaborative lists
- Showing finished titles on Continue Watching

## Acceptance

| Case | Behavior |
|------|----------|
| Complete ≥90% (or near-end rule) | Progress row deleted; history row `completed=true` |
| Toggle list item twice | Idempotent; last write wins with inFlight guard |
| Kill app | Lists/history hydrate from SQLite; Library grid waits on the active store’s `hydrated` |
| Series history | One card per title (latest `watchedAt`); tap opens the catalog movie id |
| Delete custom list | `deleteList` refuses builtins; items for that id are removed; Library returns to Favorites if that chip was active |
