# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Setup

- `npm install` — install dependencies (runs `patch-package` via postinstall)
- `npm start` — Metro bundler
- `npm run android` — debug native Android build (needs Metro)
- `npm run android:standalone` — release APK with JS bundled (no Metro)
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — Jest unit tests (`__tests__/`)
- `npm run test:coverage` — Jest with **100%** coverage gate on `src/**`
- `npm run test:watch` — Jest watch mode

## Tech stack (locked)

| Layer | Choice |
|-------|--------|
| Framework | Expo **57**, React Native **0.86**, React **19** |
| Language | TypeScript strict (`@/*` → project root) |
| Routing | Expo Router (file-based, typed routes) |
| Styling | RN `StyleSheet` + tokens in `src/shared/theme/` (Montserrat) |
| Motion | Moti + Reanimated |
| Client state | Zustand |
| Persistence | expo-sqlite (`newdeaf.db`), expo-file-system for media |
| Remote data | Plain `fetch` + HTML scrape of `https://newdeaf.top` (`src/data/catalog/`) |
| Enrichment | TMDB + Kinopoisk (optional env keys; soft-fail) — not a catalog REST API |
| Online player | Site player in `react-native-webview` |
| Offline player | `expo-video` + local HLS |
| i18n | i18n-js + expo-localization (`src/shared/i18n/`, ru/en) |
| YouTube | youtubei.js (Metro platform resolve) |
| Unit tests | Jest + jest-expo (`__tests__/`), 100% coverage on `src/**` |
| Patches | patch-package (`patches/react-native-webview+…`) |

No BaaS, auth, payments, analytics, or ESLint in this repo.

## Layered architecture

```
app/                    # thin Expo Router route shells (re-export screens)
src/shared/             # theme, i18n, ui, hooks, lib
src/data/catalog/       # scrape client, parse, TMDB, Kinopoisk
src/features/           # downloads, favorites, watch-progress, settings, playback
src/screens/            # screen implementations consumed by app/
```

Dependency direction: `app` → `screens` → `features` → `data` → `shared`. Do not import features from `shared` or `data`.

## NEVER

- NEVER suggest NativeWind, Tailwind, styled-components, or Unistyles — use StyleSheet + `src/shared/theme`
- NEVER hardcode colors, spacing, or radii — use `colors`, `spacing`, `radius`, `fonts`, `typography` from `@/src/shared/theme`
- NEVER hardcode user-facing strings — use `t()` from `@/src/shared/i18n`
- NEVER add React Navigation navigators outside Expo Router file routes
- NEVER introduce Redux, Jotai, React Query, SWR, or Apollo unless the user explicitly asks
- NEVER add auth, BaaS, or analytics SDKs unless the user explicitly asks
- NEVER invent API clients against a REST **catalog** backend — catalog data comes from scraping `newdeaf.top` (TMDB/KP enrichment only)
- NEVER remove or bypass `patches/` / `patch-package` without an explicit request
- NEVER refactor unrelated files when fixing a bug or implementing a scoped feature
- NEVER ship a behavior change without running `npm test` / `npm run test:coverage` and addressing failures (see `.cursor/rules/newdeaf-tests-required.mdc`)

## Directory map

| Path | Role |
|------|------|
| `app/` | Thin Expo Router route shells |
| `app/(tabs)/` | Catalog, search, genres, favorites, downloads, settings routes |
| `app/movie/`, `player/`, `offline/`, `genre/` | Detail, online player, offline player, genre list routes |
| `src/screens/` | Screen implementations (movie-detail, catalog, downloads, …) |
| `src/data/catalog/` | Fetch client, HTML parse, catalog types, TMDB, Kinopoisk (`BASE_URL`) |
| `src/shared/ui/` | Shared UI (MovieCard/Grid, sheets, dialogs, Screen) |
| `src/shared/theme/` | Design tokens |
| `src/shared/i18n/` | Locales and `t()` |
| `src/shared/hooks/` | e.g. `useBreakpoint` (tablet) |
| `src/shared/lib/` | Small shared helpers (`errorMessage`, UA, pagination hook) |
| `src/features/downloads/` | Zustand + SQLite + HLS/progressive/YouTube download |
| `src/features/favorites/` | Zustand + SQLite favorites |
| `src/features/watch-progress/` | Zustand + SQLite watch progress |
| `src/features/settings/` | Zustand + SQLite settings (locale, default quality) |
| `src/features/playback/` | WebView player, MediaPlayer, stream resolve |
| `src/features/playback/offline/` | Offline playback + VTT |
| `__tests__/` | Jest unit tests (mirrors layered `src/`) |
| `prd/` | Product requirements, screens, behavior, ADRs |
| `plugins/` | Expo config plugins |
| `patches/` | patch-package patches |
| `android/` | Native Android project |

Feature modules follow `store.ts` + `db.ts` + `types.ts` under `src/features/*`.

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

## Cursor Cloud specific instructions

Durable notes for agents running in the Cursor Cloud VM (deps already installed by the startup update script).

- **Install needs `--legacy-peer-deps`.** Plain `npm install` / `npm ci` fail with `ERESOLVE`: `jest-expo@57.0.3` needs peer `@react-native/jest-preset@^0.86.2`, but `react-native@0.86.0` pins it to exactly `0.86.0`. Use `npm ci --legacy-peer-deps` (or `npm install --legacy-peer-deps`). Do not "fix" this by editing `package.json` versions.
- **What runs here:** `npm run typecheck` and `npm test` (Jest, `__tests__/`) both pass and are the primary gates. Full JS build is verified with `npx expo export --platform android` (produces a Hermes `.hbc` bundle in `dist/`, which is gitignored).
- **Optional enrichment secrets:** `EXPO_PUBLIC_TMDB_API_KEY`, `EXPO_PUBLIC_TMDB_READ_TOKEN`, `EXPO_PUBLIC_KINOPOISK_API_KEY` soft-fail if missing. When present in the Cloud Agent env, Expo picks them up as `EXPO_PUBLIC_*` — do **not** commit a `.env` with real keys.
- **Android emulator (software / TCG only).** `/dev/kvm` is **not** available in this VM (no nested KVM / no `modprobe`). SDK lives at `~/Android/Sdk` (also exported from `~/.bashrc`). AVD name: `NewDeaf_API35` (`system-images;android-35;google_apis;x86_64`). Boot with:
  ```bash
  export DISPLAY=:1
  emulator -avd NewDeaf_API35 -accel off -gpu guest -no-snapshot -no-audio -no-boot-anim -memory 2048 -cores 2 -skin 1080x2400
  ```
  Prefer **`-gpu guest`** (SwiftShader host window was ~1×21 and `screencap` stayed black). Cold boot on TCG takes several minutes; wait for `adb shell getprop sys.boot_completed` → `1`. Native `android/` is still generated on demand by `expo run:android` / `expo prebuild` (not committed).
- **Expo web is not a substitute.** `expo-sqlite`'s web build imports `wa-sqlite/wa-sqlite.wasm`, which is not shipped here, so `expo export --platform web` fails at `src/downloads/db.ts`.
- **Exercise core functionality without a device.** The scraper in `src/api/` (`client.ts`, `parse.ts`, `types.ts`, `win1251.ts`) is pure TypeScript with no native imports and can be run in Node (e.g. via `npx tsx`) against the live site `https://newdeaf.top` (egress works) to verify catalog / search / detail parsing end-to-end. Avoid importing `src/api/catalog.ts` directly in Node — it pulls in `@/src/i18n` → `expo-localization` (native).
