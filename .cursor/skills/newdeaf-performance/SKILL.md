---
name: newdeaf-performance
description: >-
  NewDeaf React Native performance practices: list virtualization, Zustand
  selectors, Reanimated UI-thread animations, image loading, and measurement-
  first optimization. Use when fixing jank, slow lists, re-renders, scroll
  performance, startup cost, memory pressure, or reviewing catalog/grid code.
---

# NewDeaf performance

Adapted from Callstack / Vercel RN guidance for this Expo 57 app. Prefer measuring before speculative memoization.

## Priority checklist

1. **Lists** — Catalog, search, genres, favorites, downloads must use virtualized lists (`FlatList` / existing grid primitives). Never put large movie collections in a plain `ScrollView` + `.map`.
2. **List rows** — Keep row components cheap; pass stable `keyExtractor`; avoid inline object/array props that force re-renders every parent render.
3. **Images** — `expo-image` for posters; sensible recycling / cache as already used in MovieCard/Grid.
4. **Zustand** — Select minimal slices; avoid `useStore()` without a selector in hot list parents.
5. **Animations** — Prefer transform/opacity on the UI thread (Reanimated/Moti); do not block JS thread with heavy work during scroll.
6. **Startup** — Hydrate SQLite stores once; defer non-critical network until after first paint when changing launch flow.
7. **Downloads / FGS** — Heavy I/O stays off the UI path; progress updates should be throttled if they flood re-renders.

## Measurement-first

Before “optimizing”:

- Reproduce the jank (device/emulator, specific screen).
- Note whether the bottleneck is JS re-renders, image decode, list blanking, or native player.
- Apply one targeted fix; re-check the same scenario.

## Key paths to review

- Grids/lists: `src/shared/ui/MovieGrid.tsx`, `MovieCard.tsx`, screen modules under `src/screens/`
- Stores: `src/features/downloads/store.ts`, `src/features/favorites/store.ts`, `src/features/watch-progress/store.ts`
- Motion: Moti usage in components; Reanimated 4 + worklets already in dependencies

## Anti-patterns

- Sprinkling `React.memo` / `useMemo` / `useCallback` everywhere without a proven re-render issue
- Loading full catalog HTML parse on every keystroke without debounce (match existing search behavior)
- Synchronous large file reads on the JS thread during scroll
