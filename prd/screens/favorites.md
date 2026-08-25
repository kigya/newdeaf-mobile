# Screen: Favorites

- **Status:** implemented
- **Last updated:** 2026-08-25
- **Route:** `/(tabs)/favorites`
- **Related code:** `app/(tabs)/favorites.tsx` → `src/screens/favorites/`, `src/features/favorites/`

## Purpose

Local library: favorites, queue, rewatch, history, and a 2×2 stats snapshot. No cloud sync.

## Actions

| Action | Result |
|--------|--------|
| Tap | `/movie/[id]` (history uses catalog `movieId`, not episode row id) |
| Tap stats Hours / Finished | Switch to History segment |
| Tap stats Saved | Switch to Favorites segment |
| Tap stats Offline | Open Downloads tab |
| Long-press title | ConfirmDialog → remove from the active segment |
| Tap × / long-press custom chip | ConfirmDialog → delete that custom list; active segment falls back to Favorites |

## UI extras

- Segmented Favorites / Queue / Rewatch / History plus custom list chips (chip row does not expand into leftover height). Custom chips have a delete control; builtins do not.
- Stats: 2×2 KPI tiles (hours, finished, saved, offline size). Tap hours/finished → History; saved → Favorites; offline → Downloads tab
- Empty copy sits under the chips (compact empty, not vertically centered in leftover space)
- Download badges via `isMovieDownloaded`
- Watch progress overlays when present

## States

| State | Behavior |
|-------|----------|
| Loading | `loading={!hydrated}` for the active segment (favorites / lists / history) |
| Empty | Favorites empty i18n |
| Error | No dedicated error surface (local only) |

## Acceptance

- Survives kill/relaunch after hydrate
- Double-tap favorite toggle on detail is in-flight guarded (store)
- Ordered `createdAt DESC`
