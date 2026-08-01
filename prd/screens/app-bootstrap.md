# Screen: App bootstrap (`app/_layout.tsx`)

- **Status:** implemented
- **Last updated:** 2026-08-01
- **Route:** root Stack (not a content screen)
- **Related code:** `app/_layout.tsx`, `src/features/downloads/MediaFetchHost.tsx`, all Zustand stores

## Purpose

Boot the app: load fonts, hydrate local stores, sync locale from OS when appropriate, mount global download CDN host, then render the root navigator.

## Startup sequence

1. Load Montserrat fonts via `expo-font`
2. Hydrate **settings** first (applies i18n locale)
3. Hydrate **downloads**, **favorites**, **watch-progress** (order after settings)
4. Hide splash when fonts + settings are ready
5. Until ready: render `null` (blank; splash still covering)
6. Mount root `Stack` with `key={locale}` so titles remount on language change
7. Always mount `MediaFetchHost` (hidden WebView for CDN session)
8. Android: request notification permissions after hydrate (download FGS)
9. Subscribe to `AppState` → on `active`, call `syncFromSystemIfChanged()` on settings store
10. Export Expo Router `ErrorBoundary`

## Root stack screens

| Name | Presentation |
|------|----------------|
| `(tabs)` | `headerShown: false` |
| `movie/[id]` | stack header + back |
| `player/[id]` | `fullScreenModal`, fade, no header |
| `offline/[downloadId]` | `fullScreenModal`, fade, no header |
| `genre/[slug]` | stack header + back |

## Edge cases

| Case | Behavior |
|------|----------|
| Font load failure | ErrorBoundary |
| Settings hydrate slow | Splash stays until settings ready |
| Process death with in-flight downloads | Downloads hydrate marks them `failed` + interrupted message (see downloads feature) |
| OS language changed while backgrounded | On resume, locale overwrites in-app choice when system locale code changed |
| OS language unchanged | In-app manual locale preserved |

## Acceptance

- No flash of wrong locale after hydrate
- Tab/stack titles update when locale changes (re-key)
- MediaFetchHost is available before movie downloads need CDN fetch
