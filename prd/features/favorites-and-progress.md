# PRD: Favorites and watch progress

- **Status:** implemented
- **Last updated:** 2026-07-31
- **Related code:** `app/(tabs)/favorites.tsx`, `src/favorites/`, `src/watch-progress/`, hydration in `app/_layout.tsx`

## Problem

Users need a local shortlist of titles and the ability to resume where they left off without creating an account.

## Goals

- Add/remove favorites; list them on the Favorites tab
- Persist favorites across app restarts (SQLite)
- Record and restore watch progress for supported playback paths
- Hydrate favorites and watch-progress stores at launch with downloads

## Non-goals

- Cross-device sync or cloud backup of favorites/progress
- Social sharing of lists
- Accurate progress for arbitrary third-party WebView internal state beyond what the app already records

## User stories

1. As a viewer, I want to favorite a title, so that I can find it quickly later.
   - **Acceptance:** Favorite state persists after kill/relaunch; Favorites tab shows saved items.
2. As a viewer, I want watch progress saved, so that I can resume.
   - **Acceptance:** Progress is written via `src/watch-progress/` and available after relaunch for flows that already integrate it.

## Edge cases & states

| State | Expected behavior |
|-------|-------------------|
| Empty favorites | EmptyState with i18n copy |
| Duplicate favorite | Idempotent add (no duplicate rows / stable UX) |
| Progress for missing movie | Ignore or clear stale rows without crashing |
| Hydration race | UI waits on store hydrate; no false empty flash if already handled |

## Technical context

- Modules: `src/favorites/{types,db,store}.ts`, `src/watch-progress/{types,db,store}.ts`
- Launch hydrate: `app/_layout.tsx` calls `hydrate` on downloads, favorites, watch-progress after fonts load
- Skill: `.cursor/skills/newdeaf-local-data`

## Open questions

- None for baseline

## Out of scope

- Account-linked continue-watching rails
