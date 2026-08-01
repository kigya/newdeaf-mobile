# NewDeaf

Android app for browsing and downloading movies from [newdeaf.top](https://newdeaf.top/) — catalog, search, genres, the site’s online player, and an offline library.

Agent and product docs: [`AGENTS.md`](AGENTS.md), [`prd/`](prd/).

## Stack

- Expo (React Native) + TypeScript
- Expo Router
- WebView (original stloadi player)
- expo-video + local HLS for offline playback
- SQLite for download metadata
- Moti / Reanimated for animations

## Getting started

```bash
npm install
npm run android
```

`npm run android` installs a debug build for development. It loads JavaScript from Metro, so it will not run on its own if Metro is stopped.

Start Metro for development:

```bash
npm start
```

Unit tests (Jest):

```bash
npm test
```

For a standalone build that includes the JavaScript bundle and does not depend on Metro:

```bash
npm run android:standalone
```

This builds the release variant and installs it on the selected Android device or emulator. The APK is at `android/app/build/outputs/apk/release/app-release.apk`.

The release variant in this project is signed with the local debug key and is intended for personal install and testing, not for Google Play publication.

## Features

- New releases catalog with pagination and Continue Watching
- Search and genre filters
- Movie details: description, KP/IMDb ratings, Kinopoisk/TMDB enrichment
- Online playback with quality / audio track / subtitles (site player)
- Download selected quality and audio track + subtitles (default quality in Settings)
- Offline playback of downloaded movies with subtitles
- Favorites, watch progress, Settings (language ru/en)
- Tablet-friendly layout
