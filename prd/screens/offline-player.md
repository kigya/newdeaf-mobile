# Screen: Offline player

- **Status:** implemented
- **Last updated:** 2026-08-01
- **Route:** `/offline/[downloadId]` — fullScreenModal, fade, no header
- **Related code:** `app/offline/[downloadId].tsx`, `OfflinePlayer`, `prepareLocalSource`, `MediaPlayer`, VTT

## Params

| Param | Role |
|-------|------|
| `downloadId` | SQLite download row id |

## Play modes

`checking` → `prompt` (if resumable) → `playing`

## Behavior

1. Load download record; verify playlist/file exists
2. If resumable progress for catalog movie id → Continue / Start over dialog
3. `OfflinePlayer` prepares local URI (HLS relative → absolute `file://`, ensure `#EXT-X-ENDLIST`; progressive passthrough)
4. `MediaPlayer` (expo-video) with optional local VTT overlay
5. Progress keyed by catalog movie id (`catalogMovieIdFromDownloadMovieId`); close → `router.back()` + flush

## States

| State | Behavior |
|-------|----------|
| Checking | Spinner |
| File missing / error | Centered `offline.fileNotFound` or message |
| Resume prompt | Dialog over spinner backdrop |
| Playing | Native player |

## Orientation

Unlocked; StatusBar hidden while playing.

## Acceptance

- Missing files fail gracefully (no crash)
- Subtitles show when `subtitlePath` present
- Resume uses same thresholds as online
