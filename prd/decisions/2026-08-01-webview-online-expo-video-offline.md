# ADR: WebView online player vs expo-video offline

- **Status:** accepted
- **Date:** 2026-08-01

## Context

Site streams use proprietary balancers, tokens, and player UIs (quality/audio/subs). Offline copies are local HLS/progressive files we control.

## Decision

- **Online:** site player in `react-native-webview` (`PlayerWebView`), with stream capture for downloads
- **Offline:** `expo-video` + local playlists/files (`MediaPlayer`, `src/offline/`)

## Consequences

- Online quality UX stays in the site player (Settings default quality applies to downloads)
- WebView patch (`patches/`) is load-bearing — do not remove casually
- Dual progress paths (WebView hook vs expo-video events) share watch-progress store rules
