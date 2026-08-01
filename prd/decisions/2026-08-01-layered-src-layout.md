# ADR: Layered `src/` layout

- **Status:** accepted
- **Date:** 2026-08-01

## Context

Feature code lived in a flat `src/{api,components,downloads,player,...}` tree. Screens accumulated orchestration in Expo Router files (especially movie detail). Agent docs referenced those paths.

## Decision

Organize application code as:

- `app/` — thin Expo Router shells only
- `src/screens/` — screen implementations
- `src/features/` — downloads, favorites, watch-progress, settings, playback (+ offline)
- `src/data/catalog/` — scrape + enrichment clients
- `src/shared/` — theme, i18n, ui, hooks, lib

Dependency direction: `app` → `screens` → `features` → `data` → `shared`.

Keep feature triad (`types` + `db` + `store`) inside `src/features/*`. Require Jest **100%** coverage on `src/**` (`npm run test:coverage`). Project skills under `.cursor/skills/` remain the coding SSOT and must cite the new paths.

## Consequences

- Larger refactors touch import paths and PRD `Related code` lines together
- Route files stay re-exports — behavior changes belong in `src/screens` / features
- Tests mirror the layered tree under `__tests__/`
