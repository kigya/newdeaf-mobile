# ADR: Wi-Fi download gate via expo-network

- **Status:** accepted
- **Date:** 2026-08-25

## Context

Users on metered cellular need a Wi-Fi-only option. Process-death download statuses must stay the existing set (`queued` / `resolving` / `downloading` / `completed` / `failed`).

## Decision

Add `expo-network` (`getNetworkStateAsync` / `NetworkStateType.WIFI`). `enqueue` / `enqueueYoutube` refuse unless `force: true` when Wi-Fi-only is on and the network is not Wi-Fi, or when a storage cap is already reached. No new download status.

## Consequences

- Native rebuild required after adding the module
- Sheet shows “Download anyway” which retries with `force: true`
