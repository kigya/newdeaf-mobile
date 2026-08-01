# NewDeaf — product overview

- **Status:** implemented (baseline)
- **Last updated:** 2026-08-01
- **Platform:** Android-first Expo / React Native app (`top.newdeaf.app`), version `1.0.0`

## Idea

NewDeaf is a native mobile client for [newdeaf.top](https://newdeaf.top). Users browse the site catalog inside the app, watch titles in the site’s online player, download selected streams (and optional YouTube sources) for offline viewing, keep local favorites, and resume watch progress — without accounts, cloud sync, payments, or analytics.

## Users

- People who already use newdeaf.top and want a mobile-native catalog, search, downloads, and offline library
- Primary locale: Russian UI with English fallback (`src/i18n/`, Settings SSOT)

## Current capabilities

- New-releases catalog with pull-to-refresh and infinite pagination
- Continue Watching rail (online + offline-aware)
- Search (min 4 characters; EN→RU title bridge via TMDB when needed)
- Genre browsing (hidden tab + genre list screens)
- Movie details (scrape + optional TMDB localization + Kinopoisk enrichment)
- Online playback via embedded site player (WebView)
- Download selected quality + audio + subtitles (HLS / progressive); YouTube download path
- Offline playback with local VTT subtitles
- Favorites and watch progress persisted in SQLite
- Settings: language (ru/en), default download quality, app version footer
- Tablet-friendly layout via `useBreakpoint` / window dimensions

## Product boundaries

- **No** user accounts, auth, or multi-device sync
- **No** payments or subscriptions
- **No** first-party analytics / crash SDK in-repo today
- Catalog data is **scraped** from newdeaf.top (not a private REST catalog API)
- TMDB and Kinopoisk are **enrichment / search-bridge** only — see [`apis-and-integrations.md`](apis-and-integrations.md)
- Shipping target today is **Android**; iOS is not the primary deliverable

## Feature PRDs

| Area | Doc |
|------|-----|
| Catalog, search, genres | [`features/catalog-and-search.md`](features/catalog-and-search.md) |
| Details & online player | [`features/movie-details-and-player.md`](features/movie-details-and-player.md) |
| Downloads & offline | [`features/downloads-and-offline.md`](features/downloads-and-offline.md) |
| Favorites & progress | [`features/favorites-and-progress.md`](features/favorites-and-progress.md) |
| Settings | [`features/settings.md`](features/settings.md) |

## Screen PRDs

Detailed per-route behavior lives under [`screens/`](screens/). Cross-cutting rules: [`behavior/cross-cutting.md`](behavior/cross-cutting.md).

## APIs & integrations

[`apis-and-integrations.md`](apis-and-integrations.md)

## Definition of done (features)

1. Behavior matches the relevant PRDs under `features/` and `screens/`
2. User-facing copy goes through `t()`; styling uses `src/theme`
3. **`npm test` passes** (unit suite under `__tests__/`)
4. `npm run typecheck` passes
5. If behavior changed intentionally, update the PRD in the same change set

## Stack pointer

Agent/engineering constraints: root [`AGENTS.md`](../AGENTS.md).
