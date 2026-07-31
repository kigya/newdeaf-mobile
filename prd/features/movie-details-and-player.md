# PRD: Movie details and online player

- **Status:** implemented
- **Last updated:** 2026-07-31
- **Related code:** `app/movie/[id].tsx`, `app/player/[id].tsx`, `src/player/`, `src/components/DownloadSheet.tsx`, `YoutubeDownloadSheet.tsx`

## Problem

Users need title metadata and a way to watch online with the same player capabilities the site exposes (quality, audio, subtitles).

## Goals

- Show movie details: description and ratings (KP/IMDb when available)
- Start online playback in the embedded site player (WebView)
- Entry points from details to download flows (movie stream and YouTube when applicable)

## Non-goals

- Rebuilding the site player UI in native controls for online streams
- DRM licensing beyond what the embedded player already supports
- Cloud watch-history sync

## User stories

1. As a viewer, I want to open a title’s details, so that I can decide whether to watch or download.
   - **Acceptance:** `movie/[id]` loads metadata; failure/empty states are handled.
2. As a viewer, I want to play online, so that I can watch without downloading.
   - **Acceptance:** `player/[id]` hosts the site player in WebView; back navigation returns to details/tabs cleanly.
3. As a viewer, I want to choose download options from details, so that I can save a title for later.
   - **Acceptance:** Download sheets collect quality/audio/subs (or YouTube options) and hand off to the downloads module.

## Edge cases & states

| State | Expected behavior |
|-------|-------------------|
| Loading details | Loading UI until parse completes |
| Missing poster/ratings | UI degrades gracefully |
| Player load failure | Error copy; user can leave the screen |
| WebView patch regressions | Preserve `patches/react-native-webview+…`; verify before upgrading |

## Technical context

- Online path is **WebView-first** (`PlayerWebView`), not expo-video
- Stream resolution helpers live under `src/player/`
- Skill: `.cursor/skills/newdeaf-playback`

## Open questions

- None for baseline

## Out of scope

- Replacing online WebView with a fully native HLS stack for site embeds
