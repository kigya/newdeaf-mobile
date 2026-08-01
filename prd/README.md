# Product documentation (`prd/`)

Scalable home for NewDeaf product requirements. Agents and humans read these before changing behavior.

## Layout

| Path | Purpose |
|------|---------|
| [`product-overview.md`](product-overview.md) | Product vision, users, current scope, boundaries, definition of done |
| [`apis-and-integrations.md`](apis-and-integrations.md) | Scrape + TMDB + Kinopoisk + YouTube + CDN bridge |
| [`features/`](features/) | One PRD per product area (baseline + future changes) |
| [`screens/`](screens/) | Per-route behavioral contracts (UI, params, edge cases) |
| [`behavior/`](behavior/) | Cross-cutting runtime rules (rotation, interrupt, locale sync) |
| [`decisions/`](decisions/) | Architecture Decision Records (ADRs) |
| [`ROADMAP.md`](ROADMAP.md) | Future themes — not commitments |
| [`_template.md`](_template.md) | Copy this for a new feature PRD |

## Naming

- Files: **kebab-case** (e.g. `catalog-and-search.md`)
- One primary feature (or tightly related cluster) per PRD
- ADRs: `YYYY-MM-DD-short-title.md` (e.g. `2026-07-31-local-sqlite-over-cloud.md`)

## Lifecycle

Status field at the top of each PRD:

1. **draft** — proposed, still changing
2. **accepted** — agreed direction; implement against this
3. **implemented** — shipped; keep as living baseline of current behavior
4. **superseded** — replaced by another PRD/ADR; link to the successor

When behavior changes, update the feature PRD and/or screen PRD (or supersede it) in the same change set when practical.

## When to write what

- **Feature PRD** — new user-facing capability, or a material change to an existing area
- **Screen PRD** — route-level UX contract (params, empty/error, navigation)
- **Behavior doc** — cross-cutting rules that span multiple screens
- **ADR** — cross-cutting technical choice (persistence, player architecture, scraping vs API)
- **ROADMAP** — park ideas without treating them as requirements

## Agent rules

- Before implementing a feature, read `product-overview.md`, the relevant file under `features/`, and any matching file under `screens/`
- Prefer acceptance criteria in PRDs as the checklist for done
- After implementation, run **`npm test`** and fix or intentionally update tests — see `.cursor/rules/newdeaf-tests-required.mdc`
- If implementation must deviate, note it in the PRD or an ADR — do not silently diverge
- Definition of done for features includes a **green unit suite**
