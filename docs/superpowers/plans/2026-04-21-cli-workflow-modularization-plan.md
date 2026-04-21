# CLI Workflow Modularization Plan

Date: 2026-04-21
Project: Seeku
Status: Ready for implementation
Depends on: `docs/superpowers/specs/2026-04-21-cli-workflow-modularization-design.md`

## Goal

Refactor `apps/worker/src/cli/workflow.ts` from a monolithic workflow implementation into an orchestration core plus focused modules, without changing the CLI’s intended behavior.

## Scope

- introduce a thin workflow runtime adapter
- extract shared condition/query helpers
- collapse duplicate comparison-building logic into one canonical source
- extract profile, comparison, search, revision, recovery, and shortlist responsibilities into focused modules
- remove hidden workflow-local search diagnostics state
- preserve current CLI interaction, recovery, shortlist, and compare behavior

## Out Of Scope

- retriever or reranker redesign
- planner prompt changes for product reasons
- large renderer/TUI UX redesign
- replacing `agent-tools.ts` comparison builder with a brand-new framework
- refactoring unrelated Bonjour or web-side code

## Preconditions

Before implementation starts:

- leave unrelated worktree changes alone, especially `apps/web/next-env.d.ts`
- treat the current test suite as behavior lock, not as a side cleanup task
- do not combine multiple extraction phases into one commit

## Commit Plan

### Commit 1: Extract Runtime And Condition Utilities

Suggested commit message:

- `refactor(cli): extract workflow runtime and condition utilities`

Files:

- `apps/worker/src/cli/workflow.ts`
- `apps/worker/src/cli/workflow-runtime.ts`
- `apps/worker/src/cli/search-conditions.ts`
- tests only if import surfaces change

Tasks:

1. Add `WorkflowRuntime` and any supporting runtime types.
2. Move pure condition/query helpers out of `workflow.ts`:
   - `normalizeConditions`
   - `buildEffectiveQuery`
   - `formatConditionsAsPrompt`
3. Update `SearchWorkflow` to consume the extracted helpers instead of class-local implementations.
4. Keep behavior identical; no control-flow changes in this commit.

Validation:

- `pnpm -C /Users/rosscai/seeku exec vitest run apps/worker/src/cli/__tests__/workflow.test.ts apps/worker/src/cli/__tests__/workflow-session-events.test.ts apps/worker/src/cli/__tests__/workflow-ledger.test.ts`

Exit criteria:

- workflow still compiles and runs through the same top-level flow
- runtime adapter exists as a narrow contract
- pure condition logic is no longer embedded in the workflow class

### Commit 2: Canonicalize Comparison Builder Logic

Suggested commit message:

- `refactor(cli): dedupe comparison builder logic`

Files:

- `apps/worker/src/cli/workflow.ts`
- `apps/worker/src/cli/agent-tools.ts`
- `apps/worker/src/cli/comparison-formatters.ts`

Tasks:

1. Remove workflow-local duplication of comparison-building rules by making workflow rely on the canonical `agent-tools.ts` builder exports.
2. Delete or reduce these workflow-local methods where safe:
   - `buildComparisonEntries`
   - `buildComparisonResult`
   - `computeComparisonDecisionScore`
   - `buildComparisonRecommendation`
   - `buildComparisonNextStep`
3. Move shared comparison-formatting helpers into `comparison-formatters.ts` so both workflow-adjacent code and `agent-tools.ts` can consume one implementation:
   - `buildComparisonEvidence`
   - `buildEvidenceHeadline`
   - `describeRelativeDate`
   - `truncateForDisplay`
4. Do not extract `presentComparison()` yet.

Validation:

- `pnpm -C /Users/rosscai/seeku exec vitest run apps/worker/src/cli/__tests__/agent-tools.test.ts apps/worker/src/cli/__tests__/agent-eval.test.ts apps/worker/src/cli/__tests__/workflow.test.ts`

Exit criteria:

- there is one canonical comparison-building source
- workflow no longer maintains a competing comparison-construction implementation

### Commit 3: Extract Profile Manager

Suggested commit message:

- `refactor(cli): extract profile manager`

Files:

- `apps/worker/src/cli/workflow.ts`
- `apps/worker/src/cli/profile-manager.ts`

Tasks:

1. Move profile cache-key, generation, preload, and concurrency logic into `ProfileManager`.
2. Move these methods out of workflow:
   - `buildProfileCacheKey`
   - `ensureProfiles`
   - `loadProfileForCandidate`
   - `getOrGenerateProfile`
   - `preloadProfiles`
   - `promisePool`
   - `shouldPreloadProfiles`
3. Move processing-in-flight state ownership into `ProfileManager`.
4. Update workflow call sites to delegate through the new manager.

Validation:

- `pnpm -C /Users/rosscai/seeku exec vitest run apps/worker/src/cli/__tests__/profile-generator.test.ts apps/worker/src/cli/__tests__/workflow.test.ts`

Exit criteria:

- workflow no longer owns profile generation internals
- profile concurrency state is local to the manager

### Commit 4: Extract Comparison Controller

Suggested commit message:

- `refactor(cli): extract comparison controller`

Files:

- `apps/worker/src/cli/workflow.ts`
- `apps/worker/src/cli/comparison-controller.ts`
- `apps/worker/src/cli/comparison-controller-types.ts`

Tasks:

1. Move `presentComparison()` into `ComparisonController`.
2. Keep compare action-loop behavior identical:
   - `back`
   - `clear`
   - `quit`
   - `refine`
3. Inject `ProfileManager`, renderer access, and compare-preparation tools into the controller.
4. Keep recovery-boundary augmentation out of the controller.
   Use an injected decoration callback supplied by workflow/recovery wiring.

Validation:

- `pnpm -C /Users/rosscai/seeku exec vitest run apps/worker/src/cli/__tests__/workflow.test.ts apps/worker/src/cli/__tests__/renderer.test.ts apps/worker/src/cli/__tests__/tui.test.ts`

Exit criteria:

- compare interaction flow is no longer implemented inside workflow
- compare construction remains delegated to the canonical builder path

### Commit 5: Extract Search Executor

Suggested commit message:

- `refactor(cli): extract search executor`

Files:

- `apps/worker/src/cli/workflow.ts`
- `apps/worker/src/cli/search-executor.ts`
- `apps/worker/src/cli/search-executor-types.ts`

Tasks:

1. Move search execution and fallback logic into `SearchExecutor`:
   - `performSearch`
   - `performFallbackSearch`
   - `mergeIntentWithConditions`
   - `computeFallbackScore`
   - `matchesSearchState`
   - `evaluateSearchStateFilters`
   - `buildFilterDropoffDiagnostics`
   - `buildSearchStateContext`
   - `buildQueryMatchExplanation`
   - `refreshCandidateQueryExplanation`
   - `applySearchStateOrdering`
   - `computeSearchStateOrderingScore`
2. Introduce `SearchExecutionResult` and return diagnostics explicitly.
3. Remove workflow-local hidden diagnostics handoff such as `lastSearchDiagnostics`.
4. Do not move shortlist-only sort/rerank methods in this commit.

Validation:

- `pnpm -C /Users/rosscai/seeku exec vitest run apps/worker/src/cli/__tests__/workflow.test.ts apps/worker/src/cli/__tests__/honesty.test.ts apps/worker/src/cli/__tests__/rerank.test.ts`

Exit criteria:

- recovery can later consume explicit search execution output
- workflow no longer relies on hidden mutable search-diagnostics state

### Commit 6: Extract Condition Revision Service

Suggested commit message:

- `refactor(cli): extract condition revision service`

Files:

- `apps/worker/src/cli/workflow.ts`
- `apps/worker/src/cli/condition-revision-service.ts`

Tasks:

1. Move `reviseSessionConditions()` into a dedicated service.
2. Keep its responsibilities focused:
   - call `tools.reviseQuery`
   - record clarification/revision history
   - reset recovery state
   - clear stale uncertainty
3. Replace workflow-local session mutation with service-driven updates through the runtime adapter.
4. Confirm all callers still route through the same behavior:
   - recovery retry
   - stop refine
   - compare refine
   - shortlist refine

Validation:

- `pnpm -C /Users/rosscai/seeku exec vitest run apps/worker/src/cli/__tests__/chat.test.ts apps/worker/src/cli/__tests__/workflow.test.ts apps/worker/src/cli/__tests__/workflow-ledger.test.ts`

Exit criteria:

- query revision/session mutation is no longer embedded in workflow
- `SearchExecutor` remains free of cross-scenario session mutation concerns

### Commit 7: Extract Recovery Handler

Suggested commit message:

- `refactor(cli): extract recovery handler`

Files:

- `apps/worker/src/cli/workflow.ts`
- `apps/worker/src/cli/recovery-handler.ts`
- `apps/worker/src/cli/recovery-handler-types.ts`

Tasks:

1. Move recovery analysis and recovery execution into `RecoveryHandler`:
   - `analyzeSearchRecovery`
   - `buildAttemptRetrievalDiagnostics`
   - `resolveAnchorResolution`
   - recovery prompt builders
   - `rewriteConditionsForRecovery`
   - `applyRecoveryStateWithUncertainty`
   - `transitionRecoveryPhase`
   - `handleSearchRecovery`
   - `applyBoundaryContextToComparisonResult`
2. Change recovery input shape to consume `SearchExecutionResult` rather than hidden workflow state.
3. Keep existing bounded recovery semantics intact.
4. Preserve recovery-state transitions and current policy wiring.

Validation:

- `pnpm -C /Users/rosscai/seeku exec vitest run apps/worker/src/cli/__tests__/agent-policy.test.ts apps/worker/src/cli/__tests__/search-attempt-report.test.ts apps/worker/src/cli/__tests__/search-failure-report.test.ts apps/worker/src/cli/__tests__/workflow.test.ts apps/worker/src/cli/__tests__/agent-session-transitions.test.ts`

Exit criteria:

- recovery logic is no longer entangled with general workflow internals
- search diagnostics now reach recovery only through explicit structured inputs

### Commit 8: Extract Shortlist Controller

Suggested commit message:

- `refactor(cli): extract shortlist controller`

Files:

- `apps/worker/src/cli/workflow.ts`
- `apps/worker/src/cli/shortlist-controller.ts`
- `apps/worker/src/cli/shortlist-controller-types.ts`

Tasks:

1. Move shortlist interaction behavior into `ShortlistController`:
   - `runShortlistLoop`
   - `handleShortlistCommand`
   - `showCandidateDetail`
   - `getSortModeLabel`
   - `addCandidatesToPool`
   - `removeCandidatesFromPool`
   - `buildCompareNeedsMoreCandidatesMessage`
   - `openCandidateInBrowser`
   - `pickCandidates`
   - `sortCandidates`
   - `isRerankOnlySortMode`
   - `compareRerankOnlyCandidates`
   - `buildRerankSignals`
2. Keep shortlist-local sorting and reranking inside this controller, not in `SearchExecutor`.
3. Wire the controller to `ComparisonController`, `ProfileManager`, exporter, and any query-explanation refresh dependency.
4. Preserve existing shortlist outcomes:
   - `quit`
   - `restart`
   - `restore`
   - `refine`

Validation:

- `pnpm -C /Users/rosscai/seeku exec vitest run apps/worker/src/cli/__tests__/workflow.test.ts apps/worker/src/cli/__tests__/tui.test.ts apps/worker/src/cli/__tests__/renderer.test.ts apps/worker/src/cli/__tests__/workflow-ledger.test.ts`

Exit criteria:

- workflow no longer owns shortlist interaction internals
- shortlist-local sort/rerank behavior remains stable and correctly bounded

### Commit 9: Final Workflow Cleanup And Full Regression

Suggested commit message:

- `refactor(cli): finalize workflow modularization`

Files:

- `apps/worker/src/cli/workflow.ts`
- any extracted module touched only for final cleanup

Tasks:

1. Remove dead methods and leftover transitional wrappers from workflow.
2. Verify `SearchWorkflow` is now mostly orchestration and session lifecycle.
3. Tighten imports and delete redundant compatibility shims if they are no longer needed.
4. Run the broader CLI test suite before considering the refactor complete.

Validation:

- `pnpm -C /Users/rosscai/seeku exec vitest run apps/worker/src/cli/__tests__`

Exit criteria:

- `workflow.ts` is materially smaller and orchestration-focused
- extracted modules own their intended responsibilities cleanly
- CLI test suite passes as a full regression gate

## Cross-Phase Guardrails

- Never pass the full `SearchWorkflow` object into extracted modules.
- Do not move shortlist-only sort/rerank behavior into `SearchExecutor`.
- Do not move `reviseSessionConditions` into `SearchExecutor`.
- Do not move `applyBoundaryContextToComparisonResult` into `ComparisonController`.
- Do not introduce a new comparison-builder file until duplicate truth has already been removed.
- Do not touch unrelated worktree files.

## Review Checklist For Each Commit

- The extracted module has one clear responsibility.
- Data now flows through explicit inputs/outputs instead of hidden mutable workflow state.
- The runtime adapter did not grow unnecessary surface area.
- No duplicate implementation was introduced during the move.
- Targeted tests passed before the next commit started.

## Final Verification

Before handing implementation to another coding agent, verify all of the following:

- `workflow.ts` is reduced to orchestration, not implementation sprawl
- search diagnostics are explicit return data, not hidden workflow state
- comparison-building logic has one canonical source
- profile-generation concurrency state sits with `ProfileManager`
- query revision/session mutation sits with `ConditionRevisionService`
- recovery semantics sit with `RecoveryHandler`
- shortlist-local interaction and sorting sit with `ShortlistController`
- the full CLI test suite passes
