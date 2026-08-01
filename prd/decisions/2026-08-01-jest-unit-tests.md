# ADR: Jest unit tests for domain logic

- **Status:** accepted
- **Date:** 2026-08-01

## Context

Behavior is intricate (locale sync, resume thresholds, parsers, download interrupt). Regressions are costly. Full E2E (Detox/Maestro) is deferred.

## Decision

Add **Jest + jest-expo** unit tests under `__tests__/` for pure helpers and mocked stores. Definition of done for features includes `npm test` green. Cursor rule `newdeaf-tests-required.mdc` mandates running the suite after behavior changes.

## Consequences

- Agents must update tests when intentionally changing covered behavior
- Falling tests after a feature = investigate regression vs rewrite tests to match new PRD
- E2E / ESLint remain optional/parking lot unless explicitly requested
