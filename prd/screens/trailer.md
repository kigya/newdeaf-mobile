# Screen: Trailer

- **Status:** implemented
- **Last updated:** 2026-08-25
- **Route:** `/trailer/[videoId]`
- **Related code:** `app/trailer/[videoId].tsx` → `src/screens/trailer/TrailerScreen.tsx`, `resolveYoutubeStream`, `MediaPlayer`

## Purpose

Play a YouTube trailer in-app (full-screen modal) instead of bouncing to an external browser first.

## Source chain (movie detail)

1. Site `trailerYoutubeId`
2. Kinopoisk `/videos` YouTube ids
3. TMDB `/videos` keys
4. If no YouTube id, keep the existing WebView embed / `trailerUrl` on the detail screen

## UI

- Resolve stream via `resolveYoutubeStream`
- Play in `MediaPlayer`
- “Download trailer” → `enqueueYoutube` with the same Wi-Fi/storage gate as other downloads; ConfirmDialog “Download anyway” uses `force: true`
- Resolve failure → message + open YouTube in `WebBrowser`

## States

| State | Behavior |
|-------|----------|
| Loading | Spinner |
| Stream ready | Native player + download chip |
| Resolve failed | Fallback copy + YouTube button |
| Rotation | Unlocked; player reflows |
