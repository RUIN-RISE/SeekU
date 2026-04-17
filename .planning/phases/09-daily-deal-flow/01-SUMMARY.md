# 01-SUMMARY: Goal Model And Candidate Direction Foundation

## Outcome

Completed the first daily-deal-flow foundation slice:

- added a shared direction taxonomy in `packages/search`
- added candidate public-expression direction profiling
- added a reusable user goal model builder
- added a worker-side adapter from existing agent session state into the goal model
- stored namespaced direction tags in search-document `facetTags` for downstream scorer reuse

## What Changed

### Shared deal-flow modeling layer

- Added `packages/search/src/daily-deal-flow.ts`
- Introduced:
  - `CandidateDirectionProfile`
  - `CandidateDirectionSignal`
  - `UserGoalModel`
  - reusable direction-tag extraction utilities
- Kept the first version heuristic and inspectable rather than model-heavy

### Search indexing integration

- Updated `packages/search/src/index-builder.ts`
- Candidate direction tags now flow into `facetTags` as:
  - `direction:ai_agents`
  - `direction:developer_tools`
  - and other namespaced direction tags

### Existing runtime adapter

- Added `apps/worker/src/cli/deal-flow-goal-model.ts`
- Existing session state can now be mapped into the deal-flow goal model through:
  - `userGoal`
  - `currentConditions`
  - `searchHistory`

## Validation

- `pnpm --filter @seeku/search build`
- `pnpm exec vitest run packages/search/src/__tests__/daily-deal-flow.test.ts packages/search/src/__tests__/index-builder.test.ts`
- `pnpm exec vitest run apps/worker/src/cli/__tests__/deal-flow-goal-model.test.ts`
- `pnpm exec tsc -p packages/search/tsconfig.json --noEmit`
- `pnpm exec tsc -p apps/worker/tsconfig.json --noEmit`

## Notes

- This slice intentionally does not persist user-goal state in the database yet.
- The first version stores direction evidence in code and reuses existing `facetTags` instead of introducing a new search-document column or schema migration.
- The next plan should consume these outputs in an `OpportunityScorer` and daily curation pipeline.
