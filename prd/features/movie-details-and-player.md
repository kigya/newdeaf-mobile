# PRD: Movie details and online player

- **Status:** implemented
- **Last updated:** 2026-08-01
- **Related code:** `app/movie/[id].tsx` → `src/screens/movie-detail/`, `app/player/[id].tsx`, `src/features/playback/`, `src/data/catalog/kinopoisk.ts`, `src/data/catalog/tmdb.ts`, `DownloadSheet`, `YoutubeDownloadSheet`
- **Screens:** [`../screens/movie-detail.md`](../screens/movie-detail.md), [`online-player.md`](../screens/online-player.md)

## Problem

Users need title metadata and a way to watch online with the site player (quality, audio, subtitles in-player). Encyclopedia enrichment improves decide-to-watch.

## Goals

- Show movie details from scrape; optional TMDB localization; KP ratings when present
- Enrich via Kinopoisk when matched: facts, cast photos, awards, similar/related (NewDeaf-resolved only)
- Online playback in embedded site player (WebView)
- Entry points to download sheets (movie stream + YouTube when applicable)
- Resume dialog when watch progress is resumable
- Season/episode selection for serials; prefer last progress episode when valid

## Non-goals

- Rebuilding site player UI in native controls for online streams
- Cloud watch-history sync
- Person biography screens
- Forcing Settings download quality onto the online WebView player

## User stories

1. As a viewer, I want title details, so that I can decide to watch or download.
   - **Acceptance:** `movie/[id]` loads metadata; failure/empty handled; KP/TMDB soft-fail.
2. As a viewer, I want to play online.
   - **Acceptance:** `player/[id]` hosts WebView; progress throttled 2s + flush on close; back returns cleanly.
3. As a viewer, I want download options from details.
   - **Acceptance:** Sheets collect quality/audio/subs (or YouTube); preferred quality pre-selected; override allowed.
4. As a viewer, I want resume when I left off.
   - **Acceptance:** Dialog Continue / Start over when `isResumable`; player URL may include `time`.

## Edge cases & states

| State | Expected behavior |
|-------|-------------------|
| Loading details | Full-screen spinner |
| Missing poster/ratings | Graceful degrade |
| `nativePlayer === false` (embess) | Resolve embed streams; download enabled when payload non-empty |
| Embess fail + fsst sibling | Soft-fallback to progressive fsst qualities via `fallbackPlayerUrl` |
| `nativePlayer === false` (other) | Download disabled; watch via embed still |
| No playerUrl | Watch disabled; error copy |
| Player load failure | Error copy; user can leave |
| WebView patch regressions | Preserve `patches/react-native-webview+…` |
| KP/TMDB miss | Hide sections; keep scrape |
| Duration false positives | `sanitizeDurationSec` before upsert |
| Completed watch | Progress row deleted |

## Technical context

- Online path is **WebView-first** (`PlayerWebView`), not expo-video
- Stream resolve: `StreamResolver` (70s timeout) for native balancers; `resolveEmbedStream` for embess embeds (then fsst `fallbackPlayerUrl` if embess fails)
- `streamPick.qualityOptions`
- Skills: `newdeaf-playback`, `newdeaf-ui`
- Behavior: [`../behavior/cross-cutting.md`](../behavior/cross-cutting.md)

## Out of scope

- Replacing online WebView with fully native HLS for site embeds
