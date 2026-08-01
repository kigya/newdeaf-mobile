# Screen: Search

- **Status:** implemented
- **Last updated:** 2026-08-01
- **Route:** `/(tabs)/search`
- **Related code:** `app/(tabs)/search.tsx`, `searchMovies`, TMDB bridge in `catalog.ts`

## Purpose

Search the site catalog by title.

## Rules

- **Minimum query length: 4** characters (site contract); shorter → `t('search.minLength')`, clear movies, do not mark a successful search the same way as a real query
- Submit triggers `searchMovies(q)`
- Clear query resets movies / searched / error
- EN locale or Latin-only query may resolve Russian title via TMDB before searching; empty bridge result retries original query

## Actions

| Action | Result |
|--------|--------|
| Submit | Search; show spinner in bar + grid |
| Clear | Reset results to idle empty |
| Tap movie | `/movie/[id]` with standard params |

## States

| State | Behavior |
|-------|----------|
| Idle (never searched) | Empty: start copy |
| Loading | Spinner in search bar + grid loading |
| No results | Empty: none copy |
| Error | Empty title = search error; subtitle = message |
| Race | Request id guard discards stale responses |

## Orientation

Unlocked; same grid breakpoints as catalog.

## Acceptance

- Under-min-length never hits network as a valid search
- Errors and empty states are distinct and i18n’d
