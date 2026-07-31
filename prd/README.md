# Product documentation (`prd/`)

Scalable home for NewDeaf product requirements. Agents and humans read these before changing behavior.

## Layout

| Path | Purpose |
|------|---------|
| [`product-overview.md`](product-overview.md) | Product vision, users, current scope, boundaries |
| [`features/`](features/) | One PRD per product area (baseline + future changes) |
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

When behavior changes, update the feature PRD (or supersede it) in the same change set when practical.

## When to write what

- **Feature PRD** — new user-facing capability, or a material change to an existing area
- **ADR** — cross-cutting technical choice (persistence, player architecture, scraping vs API)
- **ROADMAP** — park ideas without treating them as requirements

## Agent rules

- Before implementing a feature, read `product-overview.md` and the relevant file under `features/`
- Prefer acceptance criteria in PRDs as the checklist for done
- If implementation must deviate, note it in the PRD or an ADR — do not silently diverge
