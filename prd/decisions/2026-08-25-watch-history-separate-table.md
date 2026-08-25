# ADR: Watch history is a separate table

- **Status:** accepted
- **Date:** 2026-08-25

## Context

Continue Watching must not show finished titles. The existing rule deletes `watch_progress` rows on completion. Users still need a History segment in the library.

## Decision

Add `watch_history` and record from watch-progress `upsert` (including the completed branch) **before** deleting the progress row. Do not change the completion-delete rule.

## Consequences

- Two tables to hydrate
- History can show completed titles; Continue Watching cannot
