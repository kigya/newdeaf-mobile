# PRD: Downloads and offline playback

- **Status:** implemented
- **Last updated:** 2026-07-31
- **Related code:** `app/(tabs)/downloads.tsx`, `app/offline/[downloadId].tsx`, `src/downloads/`, `src/offline/`, `src/player/MediaPlayer.tsx`, `plugins/withDownloadForegroundService.js`

## Problem

Users want to save streams (and optional YouTube sources) and watch them without relying on the site player or a stable network.

## Goals

- Queue downloads with status and progress
- Support HLS and progressive media kinds; movie and YouTube sources
- Persist metadata in SQLite; store media under app document storage
- Run Android downloads with foreground/background affordances (FGS + notifications permissions)
- Play completed downloads offline with subtitles when available
- Pause / fail / retry semantics consistent with `DownloadStatus` in `src/downloads/types.ts`

## Non-goals

- Multi-device download sync
- Official Play Store distribution / production signing (personal debug/release key today)
- Unlimited parallel unconstrained downloads without existing queue behavior

## User stories

1. As a viewer, I want to download a chosen quality and audio track, so that I can watch later.
   - **Acceptance:** Download appears in Downloads tab; status moves through resolving/downloading to completed or failed with error text.
2. As a viewer, I want offline playback with subtitles, so that I can watch without network.
   - **Acceptance:** Opening a completed item launches `offline/[downloadId]` with `expo-video` and VTT when present.
3. As a viewer, I want downloads to continue with Android foreground notification behavior, so that the OS does not silently kill long jobs.
   - **Acceptance:** FGS plugin + notification permission request path remain wired (see root layout).

## Edge cases & states

| State | Expected behavior |
|-------|-------------------|
| Queued / resolving / downloading | Progress visible; UI remains usable |
| Failed | Error stored on record; user can understand failure |
| Paused | Status reflected; resume follows existing store logic |
| Missing files on disk | Fail gracefully in offline player; do not crash app |
| Storage full / I/O errors | Surface as failed download |

## Technical context

- Feature module pattern: `src/downloads/{types,db,store}.ts` plus HLS/progressive/YouTube helpers
- Offline player: `expo-video` + `src/offline/`
- Skill: `.cursor/skills/newdeaf-playback`, `.cursor/skills/newdeaf-local-data`

## Open questions

- None for baseline

## Out of scope

- iCloud / Google Drive backup of the offline library
