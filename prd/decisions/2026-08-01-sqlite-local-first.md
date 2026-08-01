# ADR: SQLite local-first user data

- **Status:** accepted
- **Date:** 2026-08-01

## Context

No accounts or cloud sync. User data: favorites, downloads metadata, watch progress, settings.

## Decision

Single `newdeaf.db` via expo-sqlite; feature modules `types.ts` + `db.ts` + `store.ts` (Zustand). Media blobs on filesystem, not in SQLite.

## Consequences

- Hydrate on launch; process death resets in-memory state
- Schema migrations live in each module’s `db.ts`
- Do not introduce Redux/MMKV/React Query as a parallel SSOT
