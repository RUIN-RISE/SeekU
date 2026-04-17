# 02-SUMMARY: Opportunity Scoring And Daily Curation Pipeline

## Outcome

Completed the second daily-deal-flow foundation slice:

- added an interpretable `OpportunityScorer`
- added a dated `DailyDealFlowCurator`
- enforced direction-first ranking so secondary factors cannot dominate obvious mismatches
- generated complete opportunity payloads with:
  - `whyMatched`
  - `whyNow`
  - `approachPath`
  - `confidence`
  - `whyUncertain`
  - `bucket`

## What Changed

### Shared opportunity scoring

- Extended `packages/search/src/daily-deal-flow.ts`
- Added:
  - `OpportunityCandidateInput`
  - `OpportunityScoreResult`
  - `OpportunityScoreBreakdown`
  - `OpportunityScorer`
  - `DailyDealFlowArtifact`
  - `DailyDealFlowCurator`

### Ranking semantics

- Primary score remains `direction match`
- Secondary tuning now uses:
  - freshness
  - reachability
  - engagement fit
  - revisit pressure
- Added a low-direction cap so secondary factors cannot push weak-direction candidates to the top purely through recency or engagement

### Daily artifact shape

- Added a dated artifact output with:
  - `generatedForDate`
  - `topToday`
  - `moreOpportunities`
  - `bucketCounts`
- Added suppression rules for:
  - already-contacted candidates
  - stale `not interested` candidates unless new score is unusually strong
  - overly recent resurfacing without revisit intent

## Validation

- `pnpm exec vitest run packages/search/src/__tests__/daily-deal-flow.test.ts packages/search/src/__tests__/daily-deal-flow-ranking.test.ts packages/search/src/__tests__/index-builder.test.ts`
- `pnpm exec tsc -p packages/search/tsconfig.json --noEmit`

## Notes

- The scorer and curator remain pure domain-layer code; they do not yet wire into API routes or web surfaces.
- Reachability is still heuristic and source-driven in this slice; richer relationship-path logic is deferred.
- The next plan should expose the daily artifact through a dedicated web surface and collect explicit / implicit feedback.
