# Screen: Downloads

- **Status:** implemented
- **Last updated:** 2026-08-01
- **Route:** `/(tabs)/downloads`
- **Related code:** `app/(tabs)/downloads.tsx`, `src/downloads/`, `YoutubeDownloadSheet`, `StreamResolver`

## Purpose

Show download queue / library; start YouTube downloads; retry failed movie downloads; play completed offline.

## UI

- YouTube CTA → `YoutubeDownloadSheet`
- `FlatList` of `DownloadRow`
- Resolving banner when a movie download is resolving
- Delete / retry confirm dialogs
- Near-invisible `StreamResolver` kept while movie download is resolving/queued/downloading (CDN session fingerprint-safe)

## Actions

| Action | Result |
|--------|--------|
| Tap completed + `playlistPath` | `/offline/[downloadId]` |
| Failed → retry | Movie: cache-bust playerUrl, status `resolving`, remount resolver; then wipe partial dir and re-queue |
| Delete / long-press | Confirm → abort + delete files + DB row |
| YouTube open/close | Sheet |

## States

| State | Behavior |
|-------|----------|
| Loading | Centered spinner until hydrated |
| Empty | EmptyState; YouTube CTA still visible |
| Resolving | Banner `t('player.resolving')` |
| Failed row | Danger status + refresh affordance |
| Retry error | Confirm-only alert dialog |

## Related edge cases

See [`../features/downloads-and-offline.md`](../features/downloads-and-offline.md) and [`../behavior/cross-cutting.md`](../behavior/cross-cutting.md): interrupt on hydrate → failed; serial movie queue; YouTube not serialized with movie chain; FGS notification.

## Acceptance

- Completed items open offline player
- Interrupted jobs after kill require explicit Retry
- User can always remove a download
