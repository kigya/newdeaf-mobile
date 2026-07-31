# Roadmap (themes, not commitments)

Ideas that may matter later. **Nothing here is accepted scope** until it has a feature PRD with status `accepted`.

## Possible themes

| Theme | Notes | Status |
|-------|-------|--------|
| iOS first-class support | Commit/maintain `ios/`, TestFlight path | parking lot |
| EAS Build / Submit | `eas.json`, store signing, CI | parking lot |
| Automated tests | Jest / Maestro / Detox — pick when pain justifies setup | parking lot |
| Lint / format | ESLint + Prettier aligned with Expo | parking lot |
| Observability | Sentry or similar crash reporting | parking lot |
| Offline catalog cache | Reduce scrape dependency when offline browsing | parking lot |
| EAS Update / OTA | Only if release process demands it | parking lot |

## How themes graduate

1. Write or update a feature PRD under `features/` (or a new ADR under `decisions/`)
2. Set status to `accepted`
3. Implement against acceptance criteria
4. Mark PRD `implemented` and trim this table if needed
