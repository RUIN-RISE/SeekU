# CLI Agent Recovery Loop Review Brief

Date: 2026-04-21  
Target reviewer: Claude Code  
Scope: `apps/worker/src/cli/`

## Summary

This change turns CLI search recovery into a report-driven loop.

- `SearchAttemptReport` captures the full attempt state.
- `SearchFailureReport` classifies actionable, diagnostic, and terminal failures.
- `decideRecoveryActionV2()` consumes those reports to choose `clarify`, `rewrite`, `low_confidence_shortlist`, or `stop`.
- The workflow now preserves boundary hints and compare refinement instead of collapsing them into generic "evidence insufficient" output.

## In Scope

- `apps/worker/src/cli/search-attempt-report.ts`
- `apps/worker/src/cli/search-failure-report.ts`
- `apps/worker/src/cli/agent-policy.ts`
- `apps/worker/src/cli/workflow.ts`
- `apps/worker/src/cli/tui.ts`
- `apps/worker/src/cli/agent-state.ts`
- `apps/worker/src/cli/agent-session-events.ts`
- `apps/worker/src/cli/agent-session-transitions.ts`
- `apps/worker/src/cli/types.ts`

## Review Checklist

Please verify:

1. `SearchAttemptReport` field mapping is complete and stable.
2. `SearchFailureReport` rule coverage matches the intended failure taxonomy across 12 rules and 6 layers.
3. Primary failure selection is correct when multiple actionable rules match, including the hard-coded overrides for `intent_anchor_missing` and `role > skill` before the configurable priority array runs.
4. Diagnostic failures stay diagnostic and do not override recovery policy.
5. `recovery_budget_exhausted` behaves as a terminal overlay, not a root cause in the failure report, while still short-circuiting action selection in the policy layer by design.
6. `compareSuggestedRefinement` is cleared on recovery transitions and preserved where intended.
7. Low-confidence shortlist paths only trigger when the attempt still has usable fallback candidates.
8. Compare/detail/stop prompts keep boundary-aware wording instead of generic fallback text.

## What Changed

- Structured attempt/failure reporting now covers intent, retrieval, ranking, evidence, constraints, and recovery budget.
- Recovery policy now uses report-based diagnosis instead of the old legacy summary.
- Boundary diagnostics such as `filter_too_strict`, `source_bias_conflict`, `query_too_broad`, and `source_coverage_gap` are preserved as separate signals.
- The workflow now supports compare-driven refine guidance without forcing a back-to-shortlist hop.

## Validation Already Run

- `pnpm -C /Users/rosscai/seeku --filter @seeku/worker build`
- `pnpm -C /Users/rosscai/seeku --filter @seeku/worker typecheck`
- `pnpm -C /Users/rosscai/seeku exec vitest run apps/worker/src/cli/__tests__`

Last full run passed:

- 22 files
- 128 tests

## Notes

- Ignore the unrelated local change in `apps/web/next-env.d.ts` during review.
- This brief is for code inspection, not implementation planning.
