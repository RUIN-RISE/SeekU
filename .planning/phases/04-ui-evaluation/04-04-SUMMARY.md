---
phase: 04-ui-evaluation
plan: 04
subsystem: eval
tags: [evaluation, benchmark, metrics, search-quality]
dependencies:
  requires: [04-02]
  provides: [benchmark-runner]
  affects: [packages/eval]
tech-stack:
  added: []
  patterns: [precision-metrics, benchmark-runner]
key-files:
  created:
    - packages/eval/src/metrics.ts
    - packages/eval/src/benchmark.ts
  modified:
    - packages/eval/src/index.ts
decisions:
  - Pure functions for metrics (no side effects) for easy testing
  - Internal summarizeResults in benchmark.ts to avoid circular dependency
  - Graceful handling of failed API requests (record zeros and continue)
---

# Phase 4 Plan 4: Eval Benchmark Runner Summary

## One-liner

Benchmark runner computes precision@5, precision@10, precision@20 and coverage metrics against the golden set by calling the search API.

## What Was Done

### Task 1: Create metrics computation functions

Created `packages/eval/src/metrics.ts` with:

- **computePrecisionAtK**: Calculates precision at given k (5, 10, 20) by counting matches in top results
- **computeCoverage**: Returns true if any expected candidate is found in results
- **findExpectedPosition**: Returns 1-based position of first expected candidate, or -1 if not found
- **summarizeResults**: Aggregates per-query EvalResults into BenchmarkSummary with average metrics

All functions are pure with no side effects, making them easy to unit test.

### Task 2: Create benchmark runner

Created `packages/eval/src/benchmark.ts` with:

- **runBenchmark**: Main benchmark function that:
  1. Loads queries and golden set from dataset files
  2. Groups golden set entries by queryId for efficient lookup
  3. Calls POST /search API for each query
  4. Computes precision@k and coverage for each result
  5. Returns BenchmarkSummary with aggregate metrics

- **BenchmarkConfig**: Configuration interface for:
  - `apiBaseUrl`: API endpoint (default: http://localhost:3000)
  - `limit`: Maximum results per query (default: 50)
  - `queries`/`goldenSet`: Optional overrides for testing

Updated `packages/eval/src/index.ts` to export all benchmark functions.

## Files Modified

| File | Changes |
|------|---------|
| `packages/eval/src/metrics.ts` | New: metric computation functions |
| `packages/eval/src/benchmark.ts` | New: benchmark runner |
| `packages/eval/src/index.ts` | Added exports for metrics and benchmark |

## API Integration

The benchmark runner calls the search API:

```typescript
POST ${apiBaseUrl}/search
Content-Type: application/json

{ "query": "<query text>", "limit": 50 }
```

Expected response:
```json
{
  "results": [{ "personId": "...", "name": "...", "matchScore": 0.95, ... }],
  "total": 10
}
```

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- [x] Package builds: `pnpm --filter @seeku/eval build` passes
- [x] Functions are exported: `dist/index.js` contains re-exports
- [x] No TypeScript errors

## Success Criteria Met

- [x] computePrecisionAtK calculates precision at given k value
- [x] computeCoverage checks if any expected candidates found
- [x] runBenchmark executes queries against search API
- [x] Returns BenchmarkSummary with avgPrecisionAt5, avgPrecisionAt10, avgPrecisionAt20, coverageRate
- [x] Package exports all benchmark functionality

## Self-Check: PASSED

- All files exist: metrics.ts, benchmark.ts, index.ts
- Commits exist: 35f57cd (Task 1), b562acb (Task 2)

## Next Steps

- Integrate with POST /admin/run-eval endpoint (currently placeholder)
- Add CLI command to run benchmarks: `pnpm eval run`
- Consider adding weighted precision by relevance level (high=1.0, medium=0.5, low=0.25) in future