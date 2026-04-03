---
phase: "06.2"
status: completed
started: "2026-04-03"
completed: "2026-04-03"
plans_total: 1
plans_complete: 1
---

# Phase 06.2: Architecture & Maintainability — Summary

## What was built

### Wave 1: Config Centralization
- **`packages/shared/src/config.ts`**: Zod-validated env-driven config module with sections for search, embedding, sync, crawler, cache, retry, coverage
- **Subpath export** `@seeku/shared/config` added to package.json
- All values overridable via `SEEKU_*` env vars with sensible defaults
- API search routes now use `appConfig.search.defaultLimit` / `appConfig.search.maxLimit`

### Wave 2: ErrorBoundary + Cleanup
- **`apps/web/src/components/ErrorBoundary.tsx`**: Class component with friendly Chinese error message ("出了点问题"), retry button, home link, collapsible error details
- **Root layout** wraps children in `<ErrorBoundary>`
- **CandidateCard cleanup**: Removed `console.log` and TODO stub from hover button, connected to `onSelect` callback

### Wave 3: Evidence Pagination
- **`GET /profiles/:personId`** now accepts `?limit=N&offset=M` query params
- Default limit: 50, max: 200, response includes `{ person, evidence, total }`
- Frontend `ProfileResponse` type updated with `total` field

## Files Changed
- `packages/shared/src/config.ts` — New: centralized config
- `packages/shared/src/index.ts` — Export config
- `packages/shared/package.json` — Add /config subpath export
- `apps/api/src/routes/profiles.ts` — Evidence pagination
- `apps/api/src/routes/search.ts` — Use appConfig for limits
- `apps/web/src/components/ErrorBoundary.tsx` — New: error boundary
- `apps/web/src/app/layout.tsx` — Wrap in ErrorBoundary
- `apps/web/src/components/CandidateCard.tsx` — Cleanup
- `apps/web/src/lib/api.ts` — Update ProfileResponse type
