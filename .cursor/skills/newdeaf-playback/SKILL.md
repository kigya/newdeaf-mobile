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

1. **Online** — site stloadi (or equivalent) player inside `react-native-webview` (`src/player/PlayerWebView.tsx`, route `app/player/[id].tsx`). Quality / audio / subs are controlled by the site player UI.
2. **Offline** — local media via `expo-video` (`src/player/MediaPlayer.tsx`, `src/offline/`, route `app/offline/[downloadId].tsx`) with downloaded HLS/progressive + VTT subs.

Do not collapse these into one player without an explicit product decision.

## Stream & download pipeline

- Resolve playable URLs through existing player helpers (`src/player/StreamResolver.tsx` and related).
- Downloads: `src/downloads/` — quality + audio track selection, HLS and progressive paths, YouTube via `youtubei.js` (`src/downloads/youtube.ts`).
- Android background work: `react-native-background-actions` + config plugin `plugins/withDownloadForegroundService.js` + notification permissions (`expo-notifications`).
- WebView has a **patch-package** patch under `patches/` — do not upgrade webview casually or drop the patch.

## Rules

1. Preserve referer / headers expectations when fetching from `newdeaf.top` (see `src/api/client.ts`).
2. Offline playback must work without Metro and without network for already-downloaded assets.
3. Keep subtitle (VTT) handling in the offline path; do not assume WebView and expo-video share the same subtitle API.
4. Metro already special-cases youtubei.js platform entry — follow `metro.config.js` if changing YouTube imports.
5. Movie detail entry: `app/movie/[id].tsx` — wire play/download actions through existing sheets (`DownloadSheet`, `YoutubeDownloadSheet`).

## Key paths

- Online player route: `app/player/[id].tsx`
- Offline player route: `app/offline/[downloadId].tsx`
- Player components: `src/player/`
- Offline helpers: `src/offline/`
- Downloads: `src/downloads/`
- Patch: `patches/react-native-webview+13.16.1.patch`

## Anti-patterns

- Replacing WebView online player with expo-video for site streams without verifying DRM/embed constraints
- Removing FGS / notification setup on Android downloads
- Fetching YouTube through ad-hoc HTML scrape instead of the existing youtubei.js path
