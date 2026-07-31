# PRD: Catalog, search, and genres

- **Status:** implemented
- **Last updated:** 2026-07-31
- **Related code:** `app/(tabs)/index.tsx`, `search.tsx`, `genres.tsx`, `app/genre/[slug].tsx`, `src/api/`, `src/components/MovieGrid.tsx`, `MovieCard.tsx`

## Problem

Users need to discover titles from newdeaf.top inside the app without opening a browser.

## Goals

- Browse new releases with pagination
- Search by query against the site
- Browse by genre and open a genre list
- Navigate from a poster/card to movie details

## Non-goals

- Personalized recommendations
- Server-side user history sync
- Replacing the site’s catalog taxonomy

## User stories

1. As a viewer, I want to scroll new releases, so that I can find something recent.
   - **Acceptance:** Catalog tab loads a grid; further pages load on demand without losing prior items incorrectly.
2. As a viewer, I want to search by title, so that I can find a known movie.
   - **Acceptance:** Search tab submits a query and shows results or an empty state; errors are visible.
3. As a viewer, I want to open a genre, so that I can browse that category.
   - **Acceptance:** Genres tab lists genres; selecting one opens `genre/[slug]` with a movie grid.

## Edge cases & states

| State | Expected behavior |
|-------|-------------------|
| Loading | Non-blocking loading indicator / skeleton consistent with existing screens |
| Empty | EmptyState with clear copy via `t()` |
| Error / offline | Error message; user can retry where the screen already supports it |
| Bad HTML / parse failure | Surface failure; do not crash the tab root |

## Technical context

- Remote data: `src/api/client.ts`, `catalog.ts`, `parse.ts` — `fetch` + HTML parse, `BASE_URL = https://newdeaf.top`
- Encoding: win1251 handling in the API layer must be preserved
- UI: virtualized grid via shared MovieGrid/MovieCard; theme + i18n
- See skill: `.cursor/skills/newdeaf-ui`, `.cursor/skills/newdeaf-performance`

## Open questions

- None for baseline (document new ones when changing scrape contract)

## Out of scope

- NativeWind / React Query introduction
- Caching layer beyond what the screens already do
