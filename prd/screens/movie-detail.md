# Screen: Movie detail

- **Status:** implemented
- **Last updated:** 2026-08-25
- **Route:** `/movie/[id]`
- **Related code:** `app/movie/[id].tsx` → `src/screens/movie-detail/`, `src/data/catalog/catalog.ts`, `src/data/catalog/tmdb/`, `src/data/catalog/kinopoisk/`, `DownloadSheet`, `StreamResolver`

## Params

| Param | Required | Role |
|-------|----------|------|
| `id` | yes | Movie id / fallback fetch key |
| `href` | no | Detail path; fetch uses `href \|\| id` |
| `title` | no | Header/title before load |
| `posterUrl` | no | Poster fallback until scrape |

## Purpose

Full title page: scraped metadata, optional TMDB (EN) + Kinopoisk enrichment, season/episode selection, watch/download CTAs, offline copies list.

## Major sections / flows

- Favorite heart in header (optimistic busy guard; works with params before full load)
- Poster, ratings (KP/IMDb), slogan/age/length, plot, gallery, spoiler-gated reviews, cast/facts/awards/similar/related/sequels (KP soft sections)
- Kinopoisk `ratingAgeLimits` (`age18`) is shown as `18+`
- Serial: season/episode chips; prefer last watch-progress season/episode when valid
- Stream track preview via hidden `StreamResolver` (1×1, unmounted when the route is not `/movie/*`)
- Trailer → `/trailer/[videoId]` when a YouTube id exists; WebView embed otherwise
- Sticky Watch / Download / Add to list
- Offline completed copies → `/offline/[downloadId]`
- Similar/related → push another `/movie/[id]`

## Watch flow

1. If resumable progress → ConfirmDialog Continue / Start over
2. Navigate `/player/[id]` with `playerUrl`, `title`, `movieId`, `posterUrl`, `href`, `isSeries`, `season`, `episode`, `startTime`
3. Continue builds player URL with `time` via `buildPlayerUrl`

## Download flow

- Opens `DownloadSheet` with resolved tracks; **original audio pre-selected** when present (`Eng.Original`); preferred quality from settings; user override allowed
- Series: **Whole season** CTA enqueues missing episodes from the current payload; primary Download is still the selected episode
- Tapping an audio chip on the detail page opens the same sheet pinned to that track
- Duplicate warnings via download match helpers

## Special: `nativePlayer === false`

- Watch still uses embed URL in WebView
- If player is **embess** (resolvable embed): scrape `makePlayer` + master HLS via `resolveEmbedStream` → show audio/sub chips; Download enabled with pre-resolved `StreamPayload`
- If embess resolve fails and page has **fsst** sibling embed (`fallbackPlayerUrl`): soft-fallback to progressive MP4 qualities; **`resolvedPlayerUrl` switches to the winning embed** for download headers
- If player is **fsst `playlist_iframe`**: parse episode list from Playerjs `file:[{comment,file}]`; each episode is a selectable source with progressive qualities; season/episode parsed from comments
- If player is another non-native embed without a resolvable URL: show `tracksUnavailable` / `downloadUnavailable`
- Other third-party embeds (kodik, etc.): tracks unavailable; download disabled
- Embess demuxed audio: download stores `audioId` (audio media playlist) and writes a local multi-rendition master
- **Native balancer + embess/namy/domem/fsst sibling:** Watch still uses native player URL; download tracks resolve from `fallbackPlayerUrl` (VenomPlayer `playlist.seasons[].episodes[]` or `source.hls`) so collaps/vkvideo playlist 404s do not block offline

## States

| State | Behavior |
|-------|----------|
| Loading | Full-screen spinner |
| Error / no movie | Centered error / not-found |
| KP loading | Small spinner + extras hint |
| Stream loading | Spinner + hidden resolver |
| Stream error | Hint; watch may still work |
| No playerUrl | Error; Watch disabled |
| Resume prompt | Modal before player |

## Orientation

Unlocked; larger poster on tablet (`isTablet`).

## Acceptance

- Soft-fail KP/TMDB never blocks scraped detail
- Resume dialog only when `isResumable`
- Favorite toggle survives rapid taps
