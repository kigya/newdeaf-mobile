# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Setup

- `npm install` — install dependencies (runs `patch-package` via postinstall)
- `npm start` — Metro bundler
- `npm run android` — debug native Android build (needs Metro)
- `npm run android:standalone` — release APK with JS bundled (no Metro)
- `npm run typecheck` — `tsc --noEmit`

## Tech stack (locked)

| Layer | Choice |
|-------|--------|
| Framework | Expo **57**, React Native **0.86**, React **19** |
| Language | TypeScript strict (`@/*` → project root) |
| Routing | Expo Router (file-based, typed routes) |
| Styling | RN `StyleSheet` + tokens in `src/theme/` (Montserrat) |
| Motion | Moti + Reanimated |
| Client state | Zustand |
| Persistence | expo-sqlite (`newdeaf.db`), expo-file-system for media |
| Remote data | Plain `fetch` + HTML scrape of `https://newdeaf.top` (`src/api/`) |
| Online player | Site player in `react-native-webview` |
| Offline player | `expo-video` + local HLS |
| i18n | i18n-js + expo-localization (`src/i18n/`, ru/en) |
| YouTube | youtubei.js (Metro platform resolve) |
| Patches | patch-package (`patches/react-native-webview+…`) |

No BaaS, auth, payments, analytics, ESLint, or test runner in this repo.

## NEVER

- NEVER suggest NativeWind, Tailwind, styled-components, or Unistyles — use StyleSheet + `src/theme`
- NEVER hardcode colors, spacing, or radii — use `colors`, `spacing`, `radius`, `fonts`, `typography` from `@/src/theme`
- NEVER hardcode user-facing strings — use `t()` from `@/src/i18n`
- NEVER add React Navigation navigators outside Expo Router file routes
- NEVER introduce Redux, Jotai, React Query, SWR, or Apollo unless the user explicitly asks
- NEVER add auth, BaaS, or analytics SDKs unless the user explicitly asks
- NEVER invent API clients against a REST backend — catalog data comes from scraping `newdeaf.top`
- NEVER remove or bypass `patches/` / `patch-package` without an explicit request
- NEVER refactor unrelated files when fixing a bug or implementing a scoped feature

## Directory map

| Path | Role |
|------|------|
| `app/` | Expo Router screens (tabs + stacks) |
| `app/(tabs)/` | Catalog, search, genres, favorites, downloads |
| `app/movie/`, `player/`, `offline/`, `genre/` | Detail, online player, offline player, genre list |
| `src/api/` | Fetch client, HTML parse, catalog types (`BASE_URL`) |
| `src/components/` | Shared UI (MovieCard/Grid, sheets, dialogs, Screen) |
| `src/downloads/` | Zustand + SQLite + HLS/progressive/YouTube download |
| `src/favorites/` | Zustand + SQLite favorites |
| `src/watch-progress/` | Zustand + SQLite watch progress |
| `src/player/` | WebView player, MediaPlayer, stream resolve |
| `src/offline/` | Offline playback + VTT |
| `src/theme/` | Design tokens |
| `src/i18n/` | Locales and `t()` |
| `src/hooks/` | e.g. `useBreakpoint` (tablet) |
| `plugins/` | Expo config plugins |
| `patches/` | patch-package patches |
| `android/` | Native Android project |

Feature modules follow `store.ts` + `db.ts` + `types.ts`.

## Product & agent docs

- Product requirements live in [`prd/`](prd/) — read the relevant file under `prd/features/` before implementing or changing a feature
- Project agent skills live in [`.cursor/skills/`](.cursor/skills/) — use them for UI, local data, playback, and performance work
- Human-oriented run instructions: [`README.md`](README.md)

## Out of scope (unless asked)

- Introducing a new styling, navigation, or state library
- Restructuring the whole app to match a generic Expo template
- EAS / App Store / Play Store shipping setup
- Adding a test or lint toolchain from scratch
