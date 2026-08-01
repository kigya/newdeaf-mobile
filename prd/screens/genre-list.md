# Screen: Genre movie list

- **Status:** implemented
- **Last updated:** 2026-08-01
- **Route:** `/genre/[slug]`
- **Related code:** `app/genre/[slug].tsx`, `fetchGenreMovies`

## Params

| Param | Required | Role |
|-------|----------|------|
| `slug` | yes | Genre id / special cases |
| `href` | no | Site path for fetch |
| `name` | no | Stack header title |

## Special case

- `slug === 'serialy'` → force `isSeries` on listed items

## Behavior

Same pagination / refresh / race patterns as catalog. **No** `Screen` wrapper — raw `View` + `Stack.Screen` title.

| State | Behavior |
|-------|----------|
| Loading | Grid spinner |
| Empty | Genres empty i18n |
| Error | Red banner; empty subtitle = error; **pagination stops while error set** |

## Navigation

Tap movie → `/movie/[id]` via `MovieGrid`.

## Acceptance

- Serial genre flags series correctly
- Error does not keep loading more pages until cleared/refreshed
