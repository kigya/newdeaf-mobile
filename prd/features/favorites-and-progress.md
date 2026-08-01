# PRD: Favorites and watch progress

- **Status:** implemented
- **Last updated:** 2026-08-01
- **Related code:** `app/(tabs)/favorites.tsx` → `src/screens/favorites/`, `src/features/favorites/`, `src/features/watch-progress/`, Continue Watching on catalog, hydration in `app/_layout.tsx`
- **Screens:** [`../screens/favorites.md`](../screens/favorites.md), catalog/player screens for progress UX

## Problem

Users need a local shortlist and resume-where-left-off without an account.

## Goals

- Add/remove favorites; list on Favorites tab; persist SQLite
- Record and restore watch progress for online WebView and offline expo-video
- Continue Watching rail on catalog
- Hydrate favorites and watch-progress at launch (after settings)

## Non-goals

- Cross-device sync
- Social sharing
- Perfect progress for arbitrary third-party WebView internals beyond hooked progress

## User stories

1. As a viewer, I want to favorite a title.
   - **Acceptance:** Persists after kill; Favorites tab shows items; double-tap safe.
2. As a viewer, I want watch progress saved.
   - **Acceptance:** Written via `src/features/watch-progress/`; resume dialogs on movie detail and offline player when resumable.
3. As a viewer, I want finished titles to leave Continue Watching.
   - **Acceptance:** Completed upsert deletes the row.

## Edge cases & states

| State | Expected behavior |
|-------|-------------------|
| Empty favorites | EmptyState i18n |
| Duplicate favorite | Idempotent upsert; preserve `createdAt` |
| Hydration race | `mutationGeneration` / UI waits on hydrate |
| position &lt; 30s | Not resumable |
| ≥90% or near-end (≥15min &amp; &lt;120s left) | Completed → delete |
| Bad short duration from WebView | `sanitizeDurationSec` drops it |
| Offline episode movieId | Strip `_sN_eM` for catalog key |
| Stale offline continue | Clear progress; open detail |
| saveGeneration | Higher wins; stale async ignored |

## Technical context

- `src/features/favorites/{types,db,store}.ts`, `src/features/watch-progress/{types,db,store,format}.ts`
- Constants and pure helpers in `watch-progress/types.ts` are unit-tested
- Skill: `newdeaf-local-data`
- Behavior: [`../behavior/cross-cutting.md`](../behavior/cross-cutting.md)

## Out of scope

- Account-linked continue-watching cloud rails
