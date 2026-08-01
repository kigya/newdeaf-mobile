# Screen: Not found

- **Status:** implemented
- **Last updated:** 2026-08-01
- **Route:** `+not-found`
- **Related code:** `app/+not-found.tsx`

## Purpose

Handle unmatched Expo Router paths.

## UI

- Title + body copy
- `Link` to `/` (home / catalog)

## Acceptance

- Deep links to unknown paths show this screen instead of crashing
- User can return home

## Note

`app/+html.tsx` is web-only HTML shell — not a native screen; not covered as product UX.
