# NewDeaf — product overview

- **Status:** implemented (baseline)
- **Last updated:** 2026-07-31
- **Platform:** Android-first Expo / React Native app (`top.newdeaf.app`)

## Vision

Give users a fast native client to browse [newdeaf.top](https://newdeaf.top), play titles in the site’s online player, and download selected streams for offline viewing — without accounts or cloud sync.

## Users

- People who already use newdeaf.top and want a mobile-native catalog, search, and offline library
- Primary locale: Russian UI with English fallback (`src/i18n/`)

## Current capabilities

- New-releases catalog with pagination
- Search and genre browsing
- Movie details (description, KP/IMDb ratings when present)
- Online playback via embedded site player (quality / audio / subtitles in-player)
- Download selected quality + audio track + subtitles (HLS / progressive; YouTube path supported)
- Offline playback of downloads with subtitles
- Favorites and watch-progress persisted locally
- Tablet-friendly layout

## Product boundaries

- **No** user accounts, auth, or multi-device sync
- **No** payments or subscriptions
- **No** first-party analytics / crash SDK in-repo today
- Catalog data is **scraped** from newdeaf.top (not a private REST API)
- Shipping target today is **Android**; iOS project tree is not the primary deliverable

## Feature PRDs

| Area | Doc |
|------|-----|
| Catalog, search, genres | [`features/catalog-and-search.md`](features/catalog-and-search.md) |
| Details & online player | [`features/movie-details-and-player.md`](features/movie-details-and-player.md) |
| Downloads & offline | [`features/downloads-and-offline.md`](features/downloads-and-offline.md) |
| Favorites & progress | [`features/favorites-and-progress.md`](features/favorites-and-progress.md) |

## Stack pointer

Agent/engineering constraints: root [`AGENTS.md`](../AGENTS.md).
