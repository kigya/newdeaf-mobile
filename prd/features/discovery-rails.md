# PRD: Discovery rails

- **Status:** implemented
- **Last updated:** 2026-08-25
- **Related code:** `src/features/discovery/`, `src/screens/catalog/CatalogRails.tsx`, `src/data/catalog/parsePopular.ts`, Kinopoisk collections, TMDB trending
- **Screens:** [`../screens/catalog.md`](../screens/catalog.md)

## Problem

Home was a single new-releases grid. Users need curated discovery without leaving the NewDeaf catalog.

## Goals

- Multi-rail home: Continue Watching → site popular (`#owl-popular`) → because you watched → KP Top 250 → premieres → TMDB trending → genre rails (Fantastic, Series) → Новинки grid
- “I’m feeling lucky” picks a random catalog title
- Foreign catalogs never show unresolved posters: KP/TMDB stubs resolve via `searchMovies` (`resolveInCatalog`)
- Hide a rail when fewer than 3 resolved items
- Cache rails in SQLite (`discovery_rails`) with 24h TTL; refresh only stale/empty rails
- KP 402 circuit-breaker: hide KP rails, keep scrape data

## Non-goals

- Person pages, year/rating filters
- Full offline catalog cache (rail cache is enough for last home paint)
- Showing KP/TMDB titles that do not exist on newdeaf.top

## Acceptance

| Case | Behavior |
|------|----------|
| Site popular markup missing | Rail hidden; Новинки grid still loads |
| Resolve hits &lt; 3 | Rail hidden |
| TTL fresh | Serve SQLite; no extra scrape/KP |
| KP quota 402 | KP rails empty/hidden; site rails intact |
| Lucky | `pickRandom` over `fetchHomeMovies`; open movie detail; empty pick shows `catalog.luckyEmpty` |
| Because you watched | Waits for `watch_history` hydrate, then KP similar resolved into catalog |
