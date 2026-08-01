# PRD: Movie details and online player

- **Status:** implemented
- **Last updated:** 2026-08-01
- **Related code:** `app/movie/[id].tsx`, `app/player/[id].tsx`, `src/player/`, `src/api/kinopoisk.ts`, `src/components/DownloadSheet.tsx`, `YoutubeDownloadSheet.tsx`

## Problem

Users need title metadata and a way to watch online with the same player capabilities the site exposes (quality, audio, subtitles). Extra encyclopedia data (facts, cast photos, awards, similar titles) improves decide-to-watch without leaving NewDeaf.

## Goals

- Show movie details: description and ratings (KP/IMDb when available)
- Start online playback in the embedded site player (WebView)
- Entry points from details to download flows (movie stream and YouTube when applicable)
- Enrich details via Kinopoisk Unofficial API when a confident title match exists:
  - interesting facts (hide section if empty)
  - cast with photos/roles (fallback to scraped name list)
  - award chips under ratings (hide if empty)
  - similar / related titles resolved only when found in NewDeaf catalog (hide if empty)

## Non-goals

- Rebuilding the site player UI in native controls for online streams
- DRM licensing beyond what the embedded player already supports
- Cloud watch-history sync
- Person biography screens
- Showing KP “where to watch” / box office as primary UI

## User stories

1. As a viewer, I want to open a title’s details, so that I can decide whether to watch or download.
   - **Acceptance:** `movie/[id]` loads metadata; failure/empty states are handled.
2. As a viewer, I want to play online, so that I can watch without downloading.
   - **Acceptance:** `player/[id]` hosts the site player in WebView; back navigation returns to details/tabs cleanly.
3. As a viewer, I want to choose download options from details, so that I can save a title for later.
   - **Acceptance:** Download sheets collect quality/audio/subs (or YouTube options) and hand off to the downloads module.
4. As a viewer, I want trivia, cast photos, awards, and similar NewDeaf titles when available from Kinopoisk.
   - **Acceptance:** Sections appear only with data; soft-fail never blocks the detail screen; similar/related open `movie/[id]` for catalog hits only.

## Edge cases & states

| State | Expected behavior |
|-------|-------------------|
| Loading details | Loading UI until parse completes |
| Missing poster/ratings | UI degrades gracefully |
| Player load failure | Error copy; user can leave the screen |
| WebView patch regressions | Preserve `patches/react-native-webview+…`; verify before upgrading |
| KP miss / empty slices | Hide corresponding sections; keep scraped metadata |
| KP rate limit / network error | Soft-fail; no crash |

## Technical context

- Online path is **WebView-first** (`PlayerWebView`), not expo-video
- Stream resolution helpers live under `src/player/`
- Kinopoisk: `src/api/kinopoisk.ts` + `EXPO_PUBLIC_KINOPOISK_API_KEY`
- Skill: `.cursor/skills/newdeaf-playback`, `.cursor/skills/newdeaf-ui`

## Open questions

- None for baseline

## Out of scope

- Replacing online WebView with a fully native HLS stack for site embeds
