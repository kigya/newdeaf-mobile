# Screen: Movie detail

- **Status:** implemented
- **Last updated:** 2026-08-01
- **Route:** `/movie/[id]`
- **Related code:** `app/movie/[id].tsx`, `src/api/catalog.ts`, `tmdb.ts`, `kinopoisk.ts`, `DownloadSheet`, `StreamResolver`

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
- Poster, ratings (KP/IMDb), plot, cast/facts/awards/similar/related (KP soft sections)
- Serial: season/episode chips; prefer last watch-progress season/episode when valid
- Stream track preview via hidden `StreamResolver`
- Trailer (YouTube) when present
- Sticky Watch / Download bar
- Offline completed copies → `/offline/[downloadId]`
- Similar/related → push another `/movie/[id]`

## Watch flow

1. If resumable progress → ConfirmDialog Continue / Start over
2. Navigate `/player/[id]` with `playerUrl`, `title`, `movieId`, `posterUrl`, `href`, `isSeries`, `season`, `episode`, `startTime`
3. Continue builds player URL with `time` via `buildPlayerUrl`

## Download flow

- Opens `DownloadSheet` with resolved tracks; preferred quality from settings; user override allowed
- Duplicate warnings via download match helpers

## Special: `nativePlayer === false`

- Tracks unavailable; download disabled
- Watch still uses embed URL in WebView

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
