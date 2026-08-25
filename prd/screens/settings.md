# Screen: Settings

- **Status:** implemented
- **Last updated:** 2026-08-25
- **Route:** `/(tabs)/settings`
- **Related code:** `app/(tabs)/settings.tsx` → `src/screens/settings/SettingsScreen.tsx`, `src/features/settings/`, `src/shared/i18n/`

## Purpose

Configure app language and default download quality; show app version and author attribution.

## Options

### Language (ru / en)

- Moti animated flag switcher
- **SSOT:** `useSettingsStore.locale` persisted in SQLite (`settings` row id=1), applied to i18n via `setLocale`
- Changing locale re-keys root Stack + Tabs so titles refresh
- **System sync:** on `AppState` → `active`, if `readSystemLocale() !== lastSeenSystemLocale`, set **both** `locale` and `lastSeenSystemLocale` to system (overwrites manual choice when OS language actually changes)
- Manual `setLocale` updates `locale` only — does **not** update `lastSeenSystemLocale` (so resume without OS change keeps in-app choice)
- First install: locale = system; both fields saved
- System non-`ru` maps to `en`

### Default download quality

- Options: `best` | `1080` | `720` | `480` | `360` (default **`720`**)
- Applied as pre-selection in `DownloadSheet` and `YoutubeDownloadSheet` via `pickPreferredQuality`
- User can still override quality **per download** in the sheet
- Applies to movies the user wants to watch/download only as a **default preference for download sheets** — online WebView player quality remains controlled by the site player UI

### Wi-Fi only + storage cap

- Toggle `downloadsWifiOnly` (expo-network; enqueue rejects unless `force`)
- Cap chips including unlimited (`storageCapMb = 0`); usage via recursive download-dir size

### Attribution footer

- Below the version line: `t('settings.madeBy')` + linked `t('settings.madeByLink')` (`kigya`)
- Link opens `https://github.com/kigya/newdeaf-mobile` via `Linking.openURL`

### Version footer

- Displayed at bottom: `t('settings.version', { version })`
- Version resolution order: `Constants.expoConfig?.version` → `Constants.nativeApplicationVersion` → `'1.0.0'`
- Source of truth for shipping version: `app.json` / `package.json` (`1.1.0`)

## States

Always interactive after root hydrate (no loading/error UI on this screen).

## Acceptance

- Language switch updates UI immediately and survives restart
- OS language change + resume updates app locale; unchanged OS keeps manual choice
- Preferred quality seeds download sheets; sheets still allow override
- Version string is visible and matches app config when available
- Attribution “Made by kigya” is visible; tapping kigya opens the GitHub repository
