# ADR: Curated rails resolve into the NewDeaf catalog

- **Status:** accepted
- **Date:** 2026-08-25

## Context

Kinopoisk collections and TMDB trending would otherwise show posters that cannot play in this app. The catalog SSOT is scrape of newdeaf.top.

## Decision

Every foreign rail item is resolved through `searchMovies` / `resolveInCatalog`. Misses below the match threshold are dropped. A rail with fewer than 3 resolved titles is hidden. Site `#owl-popular` is already catalog-native and skips resolve.

## Consequences

- Extra search POSTs per rail refresh, mitigated by 24h SQLite TTL and KP circuit-breaker on HTTP 402
- Users never tap a dead poster from a foreign catalog
