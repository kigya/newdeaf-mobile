# Screen: Online player

- **Status:** implemented
- **Last updated:** 2026-08-01
- **Route:** `/player/[id]` — `presentation: 'fullScreenModal'`, fade, no header
- **Related code:** `app/player/[id].tsx`, `PlayerWebView`, `src/watch-progress/`

## Params

| Param | Role |
|-------|------|
| `id` | Route segment |
| `playerUrl` | Required WebView URL |
| `title` | Overlay title |
| `movieId` | Progress key |
| `posterUrl`, `href` | Progress metadata |
| `isSeries` | `'1'` / `'0'` |
| `season`, `episode` | Optional ints as strings |
| `startTime` | Resume seconds (URL may already include `time`) |

## Purpose

Play the site player in a WebView; persist watch progress.

## Behavior

- StatusBar hidden
- Progress upsert throttled every **2s** from WebView hook
- Force-save on close / unmount
- Does **not** seed DB on mount (avoids race with resume dialog)
- Duration sanitized via `sanitizeDurationSec` before upsert
- Completed progress (≥90% or near-end rules) → row deleted (clears Continue Watching)

## States

| State | Behavior |
|-------|----------|
| Missing `playerUrl` | Centered `t('movie.noPlayer')` |
| Stream load inside WebView | Handled by `PlayerWebView` |

## Orientation

Unlocked; no forced landscape. Fullscreen options available inside player chrome where applicable.

## Acceptance

- Back/close flushes latest progress
- Missing URL does not crash
- Progress generation guards ignore stale async writes
