# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Setup

- `npm install` — install dependencies (runs `patch-package` via postinstall)
- `npm start` — Metro bundler
- `npm run android` — debug native Android build (needs Metro)
- `npm run android:standalone` — release APK with JS bundled (no Metro)
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — Jest unit tests (`__tests__/`)
- `npm run test:watch` — Jest watch mode

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
| Enrichment | TMDB + Kinopoisk (optional env keys; soft-fail) — not a catalog REST API |
| Online player | Site player in `react-native-webview` |
| Offline player | `expo-video` + local HLS |
| i18n | i18n-js + expo-localization (`src/i18n/`, ru/en) |
| YouTube | youtubei.js (Metro platform resolve) |
| Unit tests | Jest + jest-expo (`__tests__/`) |
| Patches | patch-package (`patches/react-native-webview+…`) |

No BaaS, auth, payments, analytics, or ESLint in this repo.

## NEVER

- NEVER suggest NativeWind, Tailwind, styled-components, or Unistyles — use StyleSheet + `src/theme`
- NEVER hardcode colors, spacing, or radii — use `colors`, `spacing`, `radius`, `fonts`, `typography` from `@/src/theme`
- NEVER hardcode user-facing strings — use `t()` from `@/src/i18n`
- NEVER add React Navigation navigators outside Expo Router file routes
- NEVER introduce Redux, Jotai, React Query, SWR, or Apollo unless the user explicitly asks
- NEVER add auth, BaaS, or analytics SDKs unless the user explicitly asks
- NEVER invent API clients against a REST **catalog** backend — catalog data comes from scraping `newdeaf.top` (TMDB/KP enrichment only)
- NEVER remove or bypass `patches/` / `patch-package` without an explicit request
- NEVER refactor unrelated files when fixing a bug or implementing a scoped feature
- NEVER ship a behavior change without running `npm test` and addressing failures (see `.cursor/rules/newdeaf-tests-required.mdc`)

## Directory map

| Path | Role |
|------|------|
| `app/` | Expo Router screens (tabs + stacks) |
| `app/(tabs)/` | Catalog, search, genres, favorites, downloads, settings |
| `app/movie/`, `player/`, `offline/`, `genre/` | Detail, online player, offline player, genre list |
| `src/api/` | Fetch client, HTML parse, catalog types, TMDB, Kinopoisk (`BASE_URL`) |
| `src/components/` | Shared UI (MovieCard/Grid, sheets, dialogs, Screen) |
| `src/downloads/` | Zustand + SQLite + HLS/progressive/YouTube download |
| `src/favorites/` | Zustand + SQLite favorites |
| `src/watch-progress/` | Zustand + SQLite watch progress |
| `src/settings/` | Zustand + SQLite settings (locale, default quality) |
| `src/player/` | WebView player, MediaPlayer, stream resolve |
| `src/offline/` | Offline playback + VTT |
| `src/theme/` | Design tokens |
| `src/i18n/` | Locales and `t()` |
| `src/hooks/` | e.g. `useBreakpoint` (tablet) |
| `__tests__/` | Jest unit tests |
| `prd/` | Product requirements, screens, behavior, ADRs |
| `plugins/` | Expo config plugins |
| `patches/` | patch-package patches |
| `android/` | Native Android project |

Feature modules follow `store.ts` + `db.ts` + `types.ts`.

## Product & agent docs

- Product requirements live in [`prd/`](prd/) — read overview, `features/`, and `screens/` before implementing or changing a feature
- Cross-cutting behavior: [`prd/behavior/cross-cutting.md`](prd/behavior/cross-cutting.md)
- Project agent skills live in [`.cursor/skills/`](.cursor/skills/)
- Cursor rules: [`.cursor/rules/`](.cursor/rules/) (PRD-first, tests-required, business-behavior)
- Human-oriented run instructions: [`README.md`](README.md)

## Out of scope (unless asked)

- Introducing a new styling, navigation, or state library
- Restructuring the whole app to match a generic Expo template
- EAS / App Store / Play Store shipping setup
- Adding ESLint/Prettier or Detox/Maestro E2E from scratch
