# Screen: Catalog

- **Status:** implemented
- **Last updated:** 2026-08-01
- **Route:** `/(tabs)` / `/(tabs)/index`
- **Related code:** `app/(tabs)/index.tsx`, `MovieGrid`, `ContinueWatchingRail`, `GenresBanner`, `fetchHomeMovies`

## Purpose

Home catalog of new releases from newdeaf.top, plus Continue Watching and entry to genres.

## UI sections

1. **Continue Watching rail** — horizontal list from watch-progress store (null if empty)
2. **Genres banner** — navigates to hidden `/(tabs)/genres`
3. **Movie grid** — paginated `fetchHomeMovies`

## Actions

| Action | Result |
|--------|--------|
| Tap movie | `/movie/[id]` with `id`, `href`, `title`, `posterUrl` |
| Pull-to-refresh | Reload page 1; replace list |
| End reached | Append next page if `hasMore` and not loading |
| Tap Genres banner | `/(tabs)/genres` |
| Continue → online | Movie detail |
| Continue → offline + valid download | `/offline/[downloadId]` |
| Continue → offline + stale download | Clear progress, open movie detail |
| Long-press continue item | ConfirmDialog → delete progress |

## States

| State | Behavior |
|-------|----------|
| Loading | Grid spinner; header (rail/banner) still shown |
| Empty | Catalog empty i18n |
| Error | Red banner above grid; prior data may remain on refresh fail |
| Append returns 0 new | `hasMore = false` |
| Race | Stale responses discarded via `requestIdRef`; duplicate IDs filtered on append |

## Orientation

Unlocked. Grid columns from `useBreakpoint` (phone 2–3, tablet 4, desktop 6).

## Acceptance

- Pagination does not drop earlier pages incorrectly
- Race-safe refresh/load-more
- Continue Watching respects offline download validity
