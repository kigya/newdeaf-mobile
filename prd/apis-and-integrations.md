# APIs and integrations

- **Status:** implemented
- **Last updated:** 2026-08-25
- **Related code:** `src/data/catalog/`, `src/features/downloads/youtube.ts`, `src/features/downloads/MediaFetchHost.tsx`, `src/features/playback/`

## Principle

**Catalog source of truth is HTML scraped from newdeaf.top.** Do not invent a first-party REST catalog client. TMDB and Kinopoisk are optional enrichment / search helpers only. YouTube resolution is for download of trailer/YouTube-sourced media, not the main catalog.

---

## 1. newdeaf.top scrape (`BASE_URL`)

| Item | Value |
|------|--------|
| Base URL | `https://newdeaf.top` (`src/data/catalog/types.ts`) |
| Client | `src/data/catalog/client.ts` — `fetchHtml`, `absolutize`, `stripTags` |
| Encoding | Prefer UTF-8 when charset/BOM says so; otherwise **windows-1251** (`src/data/catalog/win1251.ts`) |
| Headers | Mobile Chrome UA; `Accept-Language: ru-RU…`; `Referer: BASE_URL/` |
| Errors | Non-OK HTTP → thrown `Error` with status; callers surface UI errors |

### Catalog endpoints (via scrape)

| Function | Request | Notes |
|----------|---------|-------|
| `fetchHomeMovies(page)` | `GET /` or `/page/N/` | `parseCatalogPage` |
| `fetchSitePopular()` | `GET /` | `parsePopularCarousel` on `#owl-popular`; `[]` if markup missing |
| `fetchGenreMovies(href, page)` | genre path + `/page/N/` | same parser |
| `searchMovies(query)` | `POST /index.php?do=search` | Win1251 form-encoded `story`; min length 4 |
| `fetchMovieDetail(hrefOrId)` | slug HTML or `/www/index.php?newsid=ID` | full detail parse |
| `fetchPlayerFileList(playerUrl)` | GET player HTML (20s abort) | returns `null` on any failure |
| `getGenres()` | static `GENRES` in types | **no network** |

### Parse contract highlights (`src/data/catalog/parse.ts`)

- Catalog: only `.short-cols` cards (ignore sidebar popular). Thin-page fallback if `<4` cards. `hasMore` from `.navigation` or `items.length >= 20`.
- Search: reject site “less than 4 chars” / suspended messages via `t('catalogApi.minSearch')`.
- EN/Latin search: if locale is `en` **or** query has no Cyrillic → `resolveRussianTitleForSearch` (TMDB); if bridged search empty → retry original query.
- Detail: og:title, poster candidates, KP/IMDB, plot `#fltxt`, trailer YouTube embed, player iframe scoring.
- Player pick: score native balancers (`stloadi.live`, `stravers.live`, `biorn-as.*`, `:9443`); demote preroll (−80); prefer `token_movie`, season, stravers > stloadi > biorn. Else third-party embeds. When a native iframe wins, still keep **Venom (embess/namy/domem) or fsst** as `fallbackPlayerUrl` for downloads.
- Non-native **Venom** download resolve: `src/data/catalog/embedStreams.ts` — fetch embed HTML, parse `makePlayer` `source.{hls,audio,cc}` **or VenomPlayer `playlist.seasons[].episodes[]` (per-episode hls/audio/cc)**, fetch master m3u8, map audio names → `HlsSource.audioId` (demuxed audio playlist URI), VTT captions → `tracks`. Hosts: `api.embess.ws`, `api.namy.ws`, `api.domem.ws` (same playlist).
- Soft fallback **fsst** / incvideo: parse progressive `[720p]https://…mp4` (and `_360p` / `_1080p`) into a single `Default` `HlsSource` with `progressive: true`. `pickPlayerUrls` prefers Venom as `playerUrl` and keeps fsst as `fallbackPlayerUrl` when both iframes exist.
- **fsst `playlist_iframe`**: parse Playerjs episode array into multiple `HlsSource` entries (`comment` → label, season/episode from comment); progressive download with incvideo Referer.
- `pickEpisodeEntry`: preferred translation → “Субтитры” / `id_translation === 79` → first.
- CDN host rewrite: `newdeaf.site` → `BASE_URL` in `absolutize` (403 workaround).

---

## 2. TMDB (`src/data/catalog/tmdb/`)

| Item | Detail |
|------|--------|
| Purpose | Localized title/plot/cast; Russian title bridge; extras (backdrops/videos/cast photos); trending/upcoming rails |
| Auth | `EXPO_PUBLIC_TMDB_API_KEY` and/or `EXPO_PUBLIC_TMDB_READ_TOKEN` |
| Failure | Soft: null / miss; **memory cache** for hits and null misses; **transient HTTP errors are not cached** |
| Images | `https://image.tmdb.org/t/p/{size}{path}` |
| Not used for | Direct catalog listing without `resolveInCatalog` |

---

## 3. Kinopoisk Unofficial (`src/data/catalog/kinopoisk/`)

| Item | Detail |
|------|--------|
| Purpose | Facts, staff, awards, similar/related; extras (slogan/age/length, stills, YouTube videos, reviews, seasons, sequels); collection rails |
| Auth | `EXPO_PUBLIC_KINOPOISK_API_KEY` |
| Budget | Parallel cap 4; retry 429 twice; **circuit-breaker on 402** for the session |
| Collections | `GET /api/v2.2/films/collections?type=` (`TOP_250_MOVIES`, `TOP_POPULAR_MOVIES`, …); premieres `year`+`month`; legacy `/films/top` soft-fail |
| Reviews | No spoiler flag from API — client collapses by default |
| Sequels | `GET /api/v2.1/films/{id}/sequels_and_prequels` (not the similars list) |
| Similar/related/sequels | Resolved back into NewDeaf via `resolveInCatalog`; hide rail/section if empty |
| Not used for | Playback URLs |

---

## 4. YouTube resolve (`src/features/downloads/youtube.ts`)

| Item | Detail |
|------|--------|
| Order | Piped instances → Invidious → youtubei.js (`ANDROID` / `MWEB` / `IOS`) |
| Prefer | Muxed progressive MP4; else HLS |
| Quality preference order | `720,480,360,1080,240,144,2160,1440` |
| UI | `YoutubeDownloadSheet` probes for options; download uses resolve |

---

## 5. CDN / media fetch bridge

| Item | Detail |
|------|--------|
| Host | `MediaFetchHost` — hidden iframe under `https://newdeaf.top/` (required for bnsi/Borth session cookies) |
| Store | `useMediaFetchStore` in `src/features/downloads/mediaFetch.ts` (memory only) |
| Why | OkHttp often gets **403** on `vkvideo.cloud`; WebView Chrome fetch preferred for HLS playlists/segments |
| Injector ownership | `host` vs `resolve` — StreamResolver / download jobs register carefully |

---

## 6. Online player stream capture

| Item | Detail |
|------|--------|
| Component | `PlayerWebView` / `StreamResolver` |
| Mechanism | Android native interceptor + iframe hook posts `stream` (`StreamPayload`: `hlsSource[]`, `tracks[]`) |
| Timeout | StreamResolver default **70s** |
| Online watch | Remains in site WebView (site UI for quality/audio/subs) |

---

## Environment keys (optional at runtime)

| Key | Used by |
|-----|---------|
| `EXPO_PUBLIC_TMDB_API_KEY` / `EXPO_PUBLIC_TMDB_READ_TOKEN` | TMDB |
| `EXPO_PUBLIC_KINOPOISK_API_KEY` | Kinopoisk |

Missing keys → enrichment/search-bridge soft-degrades; core scrape catalog still works.
