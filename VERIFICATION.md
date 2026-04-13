# Phase 05.6 Verification

Date: 2026-03-31
Phase: 05.6 Coverage Repair
Status: Passed

## Task Status

| Task | Status | Notes |
| --- | --- | --- |
| C1a Full rebuild semantics | Passed | `rebuild-search` now rebuilds all active persons instead of one limited batch. |
| C2 Coverage command | Passed | Added `coverage` CLI command with active/indexed/embedded/multi-source/GitHub-covered metrics. |
| C1b Search index gap repair | Passed | Ran full rebuild after C1a and closed the document/embedding gap to `0`. |
| C3 GitHub breadth | Passed | Expanded GitHub-covered active persons from `5` to `107`, exceeding the `>=50` target. |
| B4 Source hard filter | Passed | Restored hard `facetSource` filtering, removed workflow source relaxation, and verified CLI/API source filtering on live data. |

## Commands Run

### Task-level validation

```bash
pnpm vitest run packages/workers/src/search-index-worker.test.ts
pnpm --filter @seeku/db build && pnpm --filter @seeku/db typecheck && pnpm --filter @seeku/workers typecheck

pnpm vitest run apps/worker/src/cli/coverage.test.ts
pnpm --filter @seeku/worker typecheck
pnpm --filter @seeku/worker exec tsx src/cli.ts coverage

pnpm vitest run packages/workers/src/github-sync.test.ts packages/workers/src/evidence-storage.test.ts packages/identity/src/matcher.test.ts
pnpm --filter @seeku/db build && pnpm --filter @seeku/identity typecheck && pnpm --filter @seeku/workers typecheck

pnpm vitest run packages/search/src/__tests__/source-filter.test.ts apps/worker/src/cli/__tests__/workflow.test.ts apps/worker/src/cli/__tests__/renderer.test.ts apps/worker/src/search-cli.test.ts apps/api/src/server.test.ts
pnpm --filter @seeku/search typecheck && pnpm --filter @seeku/worker typecheck && pnpm --filter @seeku/api typecheck
```

### Live repair execution

```bash
pnpm --filter @seeku/worker exec tsx src/cli.ts rebuild-search
pnpm --filter @seeku/worker exec tsx src/cli.ts sync-github --limit 150
pnpm --filter @seeku/worker exec tsx src/cli.ts resolve-identities
pnpm --filter @seeku/worker exec tsx src/cli.ts store-evidence
pnpm --filter @seeku/worker exec tsx src/cli.ts rebuild-search
pnpm --filter @seeku/worker exec tsx src/cli.ts coverage
```

### Final verification

```bash
pnpm typecheck
pnpm test
pnpm --filter @seeku/worker exec tsx src/cli.ts coverage
```

## Final Coverage Snapshot

```text
Seeku Coverage
active persons   902
indexed          902 / 902  100.0%  缺口 0
embedded         902 / 902  100.0%  缺口 0
multi-source      17 / 902    1.9%  缺口 885
github-covered   107 / 902   11.9%  缺口 795
```

## Live Data Notes

- Baseline before 05.6 execution:
  - active persons: `787`
  - indexed: `352`
  - embedded: `352`
  - multi-source: `11`
  - GitHub-covered: `5`
- Final active persons became `902` after `resolve-identities` created new person records for newly synced GitHub profiles.
- Search index and embeddings were rebuilt again after identity/evidence expansion, so the final `indexed` and `embedded` ratios are both computed against the new active-person denominator.

## Source Filter Acceptance

- CLI acceptance:
  - Query: `github python`
  - Top 5 returned results were all `GitHub` source candidates.
- CLI acceptance:
  - Query: `bonjour python`
  - Top 5 returned results were all `Bonjour` source candidates.
- API acceptance:
  - Request body included `filters.sources = ["github"]`
  - Returned `personId`s were checked in `search_documents`, and all had `facet_source = {github}`.

## Final Results

- `pnpm typecheck`: passed
- `pnpm test`: passed
- Test files: 18 passed
- Tests: 78 passed
