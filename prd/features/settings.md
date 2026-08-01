# PRD: Settings

- **Status:** implemented
- **Last updated:** 2026-08-01
- **Related code:** `app/(tabs)/settings.tsx`, `src/settings/`, `src/i18n/`, `src/components/DownloadSheet.tsx`, `YoutubeDownloadSheet.tsx`

## Problem

Users need to choose app language and a default download quality without repeating the choice on every download.

## Goals

- Settings tab with language switcher (ru / en), Moti animated flag control
- App locale is SSOT in SQLite; react to OS language changes (AppCompat-like AppState + `getLocales` sync)
- Default download quality (`best` / 1080 / 720 / 480 / 360) pre-selects in movie and YouTube download sheets; user can still override per download
- Show app version at the bottom of Settings

## Non-goals

- Native `AppCompatDelegate.setApplicationLocales` module (JS sync is enough for this release)
- Per-platform separate quality defaults

## User stories

1. As a viewer, I want to switch the app between Russian and English, so that UI copy matches my preference.
   - **Acceptance:** Settings switch updates tabs and screens immediately; preference survives restart.
2. As a viewer, I want the app to follow a system language change, so that it stays aligned when I change the phone language.
   - **Acceptance:** After OS language change + resume, app locale and Settings switcher update; resume without OS change does not reset an in-app choice.
3. As a viewer, I want a default download quality, so that download sheets open pre-selected.
   - **Acceptance:** Preferred quality seeds DownloadSheet and YoutubeDownloadSheet; sheets still allow changing quality.

## Technical context

- `src/settings/` — types + db + Zustand store, hydrated in `app/_layout.tsx`
- Skill: `.cursor/skills/newdeaf-local-data`, `.cursor/skills/newdeaf-ui`
