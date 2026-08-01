# Cross-cutting behavior

- **Status:** implemented
- **Last updated:** 2026-08-01

Non-obvious runtime rules that span multiple screens. Agents must preserve these unless a PRD explicitly changes them.

---

## Orientation / rotation

- `app.json` `"orientation": "default"`; Android `unspecified`
- **No** `expo-screen-orientation` lock anywhere
- UI reflows via `useWindowDimensions` / `useBreakpoint` (`isLandscape` = width > height)
- Players do not force landscape; StatusBar hidden in player modals

---

## Locale SSOT and system sync

1. Seed i18n from `readSystemLocale()` before hydrate
2. Settings hydrate applies stored locale (SSOT in SQLite)
3. Manual `setLocale(locale)` updates **locale only** (keeps `lastSeenSystemLocale`)
4. On AppState `active`: if system locale ≠ `lastSeenSystemLocale`, set **both** to system (overwrites manual choice)
5. Resume without OS change → keep in-app choice
6. Non-`ru` system language → `en`
7. Root Stack and Tabs remount with `key={locale}`

---

## Default download quality

- Stored as `preferredDownloadQuality` (default `720`)
- Sheets call `pickPreferredQuality(available, preferred)`:
  - `best` → highest numeric height
  - else exact → closest ≤ preferred → else highest
- Empty available: return preferred (`best` falls back to `"720"`)
- Per-download override always allowed in sheet UI
- Online WebView quality is **not** forced by this setting

---

## Downloads: interrupt, resume, retry

| Event | Behavior |
|-------|----------|
| App kill / process death | Hydrate: any `queued` / `downloading` / `resolving` / legacy `paused` → **`failed`** with `t('store.interrupted')`; stop FGS |
| Mid-job same process | HLS skips segments already on disk |
| Movie retry | Cache-bust playerUrl; re-resolve streams; **wipe download dir** (signed CDN URLs expire); rematch audio/quality/subs; re-queue |
| Remove | AbortController; abort errors do **not** mark failed; delete files + row |
| Movie queue | Serialized via `movieJobChain` |
| YouTube enqueue | Not serialized with movie chain |
| Progress | Movie HLS capped ~0.92 until subs finish, then 1.0 |
| CDN 403 | Prefer WebView Chrome fetch via MediaFetchHost; tuned Origin/Referer for playlist vs segment |
| HLS BYTERANGE / fMP4 | Download slices into discrete `init_*` / `seg_*` files; local playlist has no BYTERANGE; verify decoded size |
| Segment integrity | Mismatched byte length vs range/Content-Length → fail download (never completed with truncated media) |

---

## Watch progress / resume

| Rule | Value / behavior |
|------|------------------|
| Resumable | `positionSec >= 30` and not completed |
| Completed ratio | `position/duration >= 0.9` → delete row |
| Near-end | duration ≥ **15 min** AND remaining < **120s** → completed |
| Duration sanitize | Drop if ≤ position+5s or duration < 300s (false WebView buffer lengths) |
| Online save | Throttle 2s + unmount flush; no seed on player mount |
| Offline save | expo-video progress; catalog movie id key |
| Upsert race | Higher `saveGeneration` wins |

---

## Favorites

- Toggle in-flight set (double-tap safe)
- Upsert preserves `createdAt` on conflict, updates metadata
- Ordered `createdAt DESC`
- No remote sync

---

## Catalog / search races

- Request id refs discard stale responses
- Append filters duplicate movie ids
- Search clear resets state; min length 4 enforced client-side

---

## Foreground service (Android)

- `react-native-background-actions` keep-alive + notification progress
- Started at job start; stopped when no `downloading`/`queued`
- Notification permission requested in root layout after hydrate

---

## Storage / I/O errors

- Surface as failed download with error text
- Offline player: missing file → centered error, no crash
