# PRD: Downloads and offline playback

- **Status:** implemented
- **Last updated:** 2026-08-25
- **Related code:** `app/(tabs)/downloads.tsx` → `src/screens/downloads/`, `app/offline/[downloadId].tsx` → `src/screens/offline-player/`, `src/features/downloads/`, `src/features/playback/offline/`, `MediaPlayer`, `plugins/withDownloadForegroundService.js`
- **Screens:** [`../screens/downloads.md`](../screens/downloads.md), [`offline-player.md`](../screens/offline-player.md)

## Problem

Users want to save streams (and optional YouTube sources) and watch them without the site player or a stable network.

## Goals

- Queue downloads with status and progress (`queued` | `resolving` | `downloading` | `completed` | `failed`)
- Support HLS and progressive; movie and YouTube sources
- Persist metadata in SQLite; media under documentDirectory `downloads/{id}/`
- Android FGS + notification permission for long jobs
- Offline playback with VTT when present
- Default quality from Settings; per-download override
- Retry failed movie downloads via StreamResolver rematch (native) or `resolveEmbedStream` (embess/fsst)

## Non-goals

- Multi-device download sync
- Auto-resume after process death (user must Retry)
- Unlimited unconstrained parallel movie downloads (movie jobs are serialized)

## User stories

1. As a viewer, I want to download chosen quality/audio/subs.
   - **Acceptance:** Item appears in Downloads; status progresses to completed or failed with error text. Download sheet **pre-selects original audio** (`Eng.Original` / `Original` / English) when present, not the first dub. Movie-detail audio chips open the sheet pinned to that track.
2. As a viewer, I want offline playback with subtitles.
   - **Acceptance:** Completed item opens `offline/[downloadId]` with expo-video + VTT when present.
3. As a viewer, I want downloads to survive Android backgrounding via FGS.
   - **Acceptance:** FGS + notification permission path wired; progress shown in notification.
4. As a viewer, if a download was interrupted by kill, I want to retry.
   - **Acceptance:** Hydrate marks in-flight as failed/interrupted; Retry re-resolves and wipes partial dir.

## Edge cases & states

| State | Expected behavior |
|-------|-------------------|
| Queued / resolving / downloading | Progress visible; UI usable |
| Failed | Error on record; retry affordance |
| Legacy `paused` on read | Migrated to `failed` |
| Process death | In-flight → failed interrupted; no auto-continue |
| Mid-job segment resume | Skip segments already on disk (same process) |
| Movie retry | Wipe dir; rematch audio/quality/subs; re-queue |
| Remove / abort | AbortController; abort ≠ failed |
| Missing files on disk | Offline player error; no crash |
| Storage / I/O errors | Failed download |
| Duplicate same movie | Sheet warns (exact audio+subs or any same-movie) |
| YouTube vs movie queue | YouTube not on movie serial chain |
| Subtitle default | Russian full → Russian → first (`pickSubtitleTrack`) |
| fMP4 / `#EXT-X-BYTERANGE` | Materialize each range into a standalone local file; strip BYTERANGE from `index.m3u8` |
| Truncated segment body | Reject size mismatch vs range length / Content-Length; fail job (do not mark completed) |
| Embess demuxed HLS | Download selected video variant + `audioId` audio playlist; write local multi-rendition `index.m3u8` |
| Embess CDN fetch | OkHttp with embess Referer; skip bnsi `MediaFetchHost` WebView |
| Fsst progressive / playlist_iframe | Infer `mediaKind: progressive`; episode list from Playerjs `file:[{comment,file}]`; CDN fetch with incvideo Referer (not fsst.online alone). Requires device reachability to `incvideo1.online` (fsst 301 target) |
| Embess `makePlayer` parse | Match call site `makePlayer({…})`, ignore `function makePlayer(opts)` |
| Embess VenomPlayer playlist | Serial `playlist.seasons[].episodes[]` with per-episode `hls` / `audio` / `cc`; resolve selected season/episode |
| Native + embed sibling | Keep embess/namy/domem (VenomPlayer) or fsst as `fallbackPlayerUrl`; download rematch via `resolveEmbedStream` (not bnsi) |
| Default download audio | Prefer `Eng.Original` / Original / English (`pickPreferredAudioIndex`); user can still pick any dub |
| Venom mirrors | `api.embess.ws`, `api.namy.ws`, `api.domem.ws` share the same playlist JSON — treat all as resolvable embeds |
| Progressive URL detect | Do not treat `….mp4/master.m3u8` (embess CDN) as progressive |
| Embed HTML via MediaFetch | Chrome iframe + `__ndFetch` when OkHttp hangs/403s on embess/fsst |
| Soft-fallback playerUrl | Detail stores the embed URL that actually resolved tracks for download headers |
| Offline demux prepare | Absolutize nested `video.m3u8` / `audio.m3u8` + `EXT-X-MEDIA` URIs (avoid ExoPlayer stall after 1–2s) |
| Embed Retry | `resolveEmbedStream` rematch (not bnsi StreamResolver) |
## Technical context

- Module: `src/features/downloads/{types,db,store,hls,hlsPlaylist}.ts` + progressive/youtube/match/mediaFetch
- Embed resolve: `src/data/catalog/embedStreams.ts`
- Offline: `src/features/playback/offline/` + `prepareLocalSource` (absolutize demux children + BYTERANGE strip)
- Skills: `newdeaf-playback`, `newdeaf-local-data`
- Behavior: [`../behavior/cross-cutting.md`](../behavior/cross-cutting.md)

## Out of scope

- iCloud / Google Drive backup of offline library
