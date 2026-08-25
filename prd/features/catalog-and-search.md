# PRD: Catalog, search, and genres

- **Status:** implemented
- **Last updated:** 2026-08-25
- **Related code:** `app/(tabs)/index.tsx` → `src/screens/catalog/`, `search.tsx`, `genres.tsx`, `app/genre/[slug].tsx`, `src/data/catalog/`, `MovieGrid`, `MovieCard`, `ContinueWatchingRail`, `GenresBanner`
- **Screens:** [`../screens/catalog.md`](../screens/catalog.md), [`search.md`](../screens/search.md), [`genres.md`](../screens/genres.md), [`genre-list.md`](../screens/genre-list.md)

## Problem

Users need to discover titles from newdeaf.top inside the app without opening a browser.

## Goals

- Browse new releases with pull-to-refresh and infinite pagination
- Curated discovery rails (site popular, KP/TMDB resolved into catalog, genre rails)
- “I’m feeling lucky” random catalog title
- Continue Watching rail with online/offline routing
- Search by query (min 4 chars; TMDB RU bridge for Latin/EN)
- Browse by genre (hidden tab + genre list)
- Navigate from a poster/card to movie details

## Non-goals

- Personalized recommendations beyond “because you watched” (KP similars of last history title)
- Server-side user history sync
- Offline catalog cache (rail cache 24h is in [`discovery-rails.md`](discovery-rails.md))
- Replacing the site’s catalog taxonomy

## User stories

1. As a viewer, I want to scroll new releases, so that I can find something recent.
   - **Acceptance:** Catalog loads a grid; further pages append; refresh replaces page 1; races discarded.
2. As a viewer, I want to search by title, so that I can find a known movie.
   - **Acceptance:** Submit shows results or empty/error; under 4 chars shows min-length error without treating as success.
3. As a viewer, I want to open a genre, so that I can browse that category.
   - **Acceptance:** Genres list from local `GENRES`; selecting opens `genre/[slug]` with paginated grid; `serialy` forces `isSeries`.

## Edge cases & states

| State | Expected behavior |
|-------|-------------------|
| Loading | Grid spinner; catalog header still shown |
| Empty | EmptyState via `t()` |
| Error / offline | Error banner/message; retry via refresh where supported |
| Race / stale response | Discarded via request id |
| Duplicate ids on append | Filtered |
| Genre error | Banner; pagination blocked while error set |
| Continue stale offline | Clear progress; open movie detail |
| Bad HTML / parse failure | Surface failure; do not crash tab root |
| EN/Latin search | TMDB bridge → RU title; empty → retry original |

## Technical context

- Remote: `src/data/catalog/client.ts`, `catalog.ts`, `parse.ts` — scrape `BASE_URL`
- Encoding: win1251 preserved
- UI: virtualized MovieGrid; theme + i18n
- Skills: `.cursor/skills/newdeaf-ui`, `newdeaf-performance`
- APIs: [`../apis-and-integrations.md`](../apis-and-integrations.md)

## Out of scope

- NativeWind / React Query
- Caching layer beyond in-screen state
