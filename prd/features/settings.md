# PRD: Settings

- **Status:** implemented
- **Last updated:** 2026-08-01
- **Related code:** `app/(tabs)/settings.tsx`, `src/features/settings/`, `src/shared/i18n/`, `DownloadSheet`, `YoutubeDownloadSheet`
- **Screens:** [`../screens/settings.md`](../screens/settings.md)

## Problem

Users need to choose app language and a default download quality without repeating the choice on every download; they also need a clear app version.

## Goals

- Settings tab with language switcher (ru / en), Moti animated control
- App locale is SSOT in SQLite; react to OS language changes (AppState + `getLocales` sync)
- Default download quality (`best` / 1080 / 720 / 480 / 360) pre-selects in movie and YouTube download sheets; user can override per download
- Show app version at the bottom (`expo-constants` → app.json `1.0.0`)

## Non-goals

- Native `AppCompatDelegate.setApplicationLocales` module (JS sync is enough)
- Per-platform separate quality defaults
- Forcing default quality into the online WebView player UI

## User stories

1. As a viewer, I want to switch between Russian and English.
   - **Acceptance:** Switch updates tabs/screens immediately; survives restart; Stack/Tabs re-key on locale.
2. As a viewer, I want the app to follow a system language change.
   - **Acceptance:** After OS language change + resume, app locale updates; resume without OS change does not reset an in-app choice.
3. As a viewer, I want a default download quality.
   - **Acceptance:** Preferred quality seeds DownloadSheet and YoutubeDownloadSheet via `pickPreferredQuality`; sheets still allow changing quality.
4. As a viewer, I want to see the app version.
   - **Acceptance:** Footer shows version from expo config / native / fallback `1.0.0`.

## Edge cases

| Case | Behavior |
|------|----------|
| First install | locale = system; `lastSeenSystemLocale` = system |
| Manual setLocale | Updates locale only |
| OS change while backgrounded | On active: both locale and lastSeen → system |
| System language not `ru` | Mapped to `en` |
| Preferred `best` | Highest available height in sheet |
| Preferred missing exact | Closest ≤ preferred, else highest |
| Empty quality list | Return preferred (`best` → `"720"`) |

## Technical context

- `src/features/settings/` — types + db + Zustand store + `pickPreferredQuality`
- Hydrated first in `app/_layout.tsx`
- Skills: `newdeaf-local-data`, `newdeaf-ui`
- Behavior: [`../behavior/cross-cutting.md`](../behavior/cross-cutting.md)

## Out of scope

- Theme / dark-mode toggle (app is dark by design)

## Acceptance

- Attribution footer with linked kigya GitHub repo is visible on Settings
