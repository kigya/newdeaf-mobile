# Screen: Genres (hidden tab)

- **Status:** implemented
- **Last updated:** 2026-08-01
- **Route:** `/(tabs)/genres` — **not in tab bar** (`href: null`)
- **Related code:** `app/(tabs)/genres.tsx`, `getGenres()`

## Purpose

Show the static genre list from local `GENRES` data (no network).

## Entry

- Catalog `GenresBanner` → `/(tabs)/genres`

## Actions

| Action | Result |
|--------|--------|
| Back | `router.back()`, or `replace('/(tabs)')` if no history |
| Tap genre | `/genre/[slug]` with `slug`, `href`, `name` |

## UI

- Custom back chevron
- Responsive `FlatList` (≤3 columns via `useBreakpoint`)
- Moti fade-in cards

## States

No loading/error/empty network states — sync local list always renders.

## Acceptance

- Not visible as a tab icon
- Reachable from catalog banner only (plus deep link if used)
- Back never leaves the user stranded
