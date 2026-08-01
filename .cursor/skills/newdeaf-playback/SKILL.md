---
name: newdeaf-playback
description: >-
  NewDeaf playback and downloads: site WebView player, expo-video offline HLS,
  stream resolution, subtitles, YouTube via youtubei.js, and Android foreground
  download service. Use when working on player screens, StreamResolver,
  WebView, offline playback, downloads, HLS, progressive, or YouTube fetch.
---

# NewDeaf playback

## Dual playback paths

1. **Online** — site stloadi (or equivalent) player inside `react-native-webview` (`src/features/playback/PlayerWebView.tsx`, route `app/player/[id].tsx` → `src/screens/online-player/`). Quality / audio / subs are controlled by the site player UI.
2. **Offline** — local media via `expo-video` (`src/features/playback/MediaPlayer.tsx`, `src/features/playback/offline/`, route `app/offline/[downloadId].tsx` → `src/screens/offline-player/`) with downloaded HLS/progressive + VTT subs.

Do not collapse these into one player without an explicit product decision.

## Stream & download pipeline

- Resolve playable URLs through existing player helpers (`src/features/playback/StreamResolver.tsx` and related).
- Downloads: `src/features/downloads/` — quality + audio track selection, HLS and progressive paths, YouTube via `youtubei.js` (`src/features/downloads/youtube.ts`).
- Android background work: `react-native-background-actions` + config plugin `plugins/withDownloadForegroundService.js` + notification permissions (`expo-notifications`).
- WebView has a **patch-package** patch under `patches/` — do not upgrade webview casually or drop the patch.
- CDN: prefer `MediaFetchHost` WebView Chrome fetch (OkHttp often 403 on vkvideo.cloud).
- Interrupt: hydrate marks in-flight downloads `failed` + interrupted; movie Retry re-resolves and **wipes** partial dir (signed URLs expire). Movie jobs are serialized; YouTube is not on that chain.
- Settings `preferredDownloadQuality` seeds sheets only; online WebView quality stays site-controlled.

## Rules

1. Preserve referer / headers expectations when fetching from `newdeaf.top` (see `src/data/catalog/client.ts`).
2. Offline playback must work without Metro and without network for already-downloaded assets.
3. Keep subtitle (VTT) handling in the offline path; do not assume WebView and expo-video share the same subtitle API.
4. Metro already special-cases youtubei.js platform entry — follow `metro.config.js` if changing YouTube imports.
5. Movie detail entry: `app/movie/[id].tsx` → `src/screens/movie-detail/` — wire play/download actions through existing sheets (`DownloadSheet`, `YoutubeDownloadSheet` in `src/shared/ui/`).
6. Read `prd/screens/online-player.md`, `offline-player.md`, `downloads.md` and `prd/behavior/cross-cutting.md` before changing playback/download behavior; run `npm test` after.

## Key paths

- Online player route: `app/player/[id].tsx` / `src/screens/online-player/`
- Offline player route: `app/offline/[downloadId].tsx` / `src/screens/offline-player/`
- Player components: `src/features/playback/`
- Offline helpers: `src/features/playback/offline/`
- Downloads: `src/features/downloads/`
- Patch: `patches/react-native-webview+13.16.1.patch`

## Anti-patterns

- Replacing WebView online player with expo-video for site streams without verifying DRM/embed constraints
- Removing FGS / notification setup on Android downloads
- Fetching YouTube through ad-hoc HTML scrape instead of the existing youtubei.js path
