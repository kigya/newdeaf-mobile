# NewDeaf

Android app for browsing and downloading movies from [newdeaf.top](https://newdeaf.top/) — catalog, search, genres, the site’s online player, and an offline library.

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

For a standalone build that includes the JavaScript bundle and does not depend on Metro:

```bash
npm run android:standalone
```

This builds the release variant and installs it on the selected Android device or emulator. The APK is at `android/app/build/outputs/apk/release/app-release.apk`.

The release variant in this project is signed with the local debug key and is intended for personal install and testing, not for Google Play publication.

## Features

- New releases catalog with pagination
- Search and genre filters
- Movie details: description, KP/IMDb ratings
- Online playback with quality / audio track / subtitles (site player)
- Download selected quality and audio track + subtitles
- Offline playback of downloaded movies with subtitles
- Tablet-friendly layout
