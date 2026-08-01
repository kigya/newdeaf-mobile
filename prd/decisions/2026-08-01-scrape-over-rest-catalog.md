# ADR: Scrape newdeaf.top instead of a first-party REST catalog

- **Status:** accepted
- **Date:** 2026-08-01

## Context

NewDeaf needs catalog, search, and detail data. There is no official public NewDeaf REST API for the mobile client.

## Decision

Use `fetch` + HTML parsing (`src/api/`) against `https://newdeaf.top`. Preserve windows-1251 handling and site search form encoding.

## Consequences

- Parsers must be updated when site HTML changes
- TMDB/Kinopoisk may enrich but must not replace the catalog scrape
- Agents must not invent a fake REST catalog client
