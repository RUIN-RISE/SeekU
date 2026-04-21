# Seeku CLI Workflow Modularization Design

Date: 2026-04-21
Project: Seeku
Status: Approved for implementation planning
Owner: Codex + Ross Cai

## Summary

`apps/worker/src/cli/workflow.ts` has grown into a 4316-line `SearchWorkflow` class with roughly 60 methods spanning orchestration, recovery, shortlist interaction, comparison presentation, search execution, reranking, and profile generation.

The immediate problem is not that the CLI workflow lacks capability. It is that too many responsibilities now live inside one class, which makes behavior changes expensive, review difficult, and future recovery-loop work harder to validate.

The goal of this design is to split `SearchWorkflow` into a small orchestration core plus a set of focused modules with explicit boundaries:

- control-flow modules stay stateful and class-based
- pure construction and helper logic stays function-based
- hidden mutable workflow state is reduced
- comparison-building logic has one canonical source

The result should preserve current CLI behavior while making the workflow understandable, testable, and safer to extend.

## Why This Exists

The current `SearchWorkflow` class owns all of the following at once:

- session and transcript state
- search loop orchestration
- recovery analysis and recovery execution
- shortlist navigation and command handling
- comparison flow control
- search execution and fallback search
- query explanation and search-state diagnostics
- candidate profile generation and caching

That creates three concrete problems:

1. The class is too large to reason about safely.
   A reviewer cannot hold the whole object model in working memory, especially when recovery, shortlist, and compare logic cross-call each other.

2. Some responsibilities are mixed at the wrong level.
   For example, `presentComparison()` is an interaction controller, while `buildComparison*()` methods are mostly pure construction logic. They should not share the same abstraction boundary.

3. Hidden mutable workflow state has started to leak across features.
   The most important example is search diagnostics being written into workflow-local mutable state and then read back later by recovery logic. That makes the real data flow harder to follow and test.

This design addresses maintainability first. It does not attempt to redesign CLI product behavior.

## Product Goal

Restructure the CLI workflow so the main `SearchWorkflow` class becomes an orchestrator rather than the implementation site for every behavior.

The first version is successful if it does all of the following:

- reduces `SearchWorkflow` to orchestration, session management, and entry-point flow
- extracts the largest cohesive responsibilities into focused modules
- introduces a thin runtime adapter instead of passing the full workflow object around
- removes workflow-local hidden mutable state for search diagnostics
- makes comparison-building logic canonical instead of duplicated
- preserves current user-visible behavior and current test expectations

## Non-Goals

This refactor will not:

- redesign planner, retriever, reranker, or scorer behavior
- change the CLI’s product posture or copy unless required by mechanical refactor
- alter recovery-loop semantics beyond dependency rewiring
- replace existing renderer, TUI, or chat contracts wholesale
- attempt a full dependency-injection framework
- optimize for maximal abstraction over practical readability

## Design Principles

### Orchestrator First

`SearchWorkflow` should remain the top-level coordinator for mission bootstrap, search-loop progression, and session lifecycle.

It should not continue to own every operational detail.

### Thin Runtime Adapter

New stateful modules should not receive the entire `SearchWorkflow` instance.

Instead they should depend on a thin workflow runtime adapter that exposes only the minimum needed capabilities:

- current session state read access
- session state write access
- session status transitions
- session event emission
- `chat`
- `tui`
- `spinner`
- `tools`

This keeps modularity real without introducing a heavyweight abstraction layer.

### Class Controllers, Functional Builders

The design deliberately uses two forms of extraction:

- class-based modules for control flow and stateful interaction
- function-based modules for pure builders and formatting logic

This avoids wrapping pure logic in unnecessary controller classes.

### Remove Hidden Mutable Coupling

Cross-step information should flow through explicit return values instead of workflow-local side channels whenever practical.

The most important change is that search execution should return a structured `SearchExecutionResult` rather than mutating `workflow.lastSearchDiagnostics` and relying on later readers.

### One Canonical Truth Per Behavior

The refactor should not create a third copy of comparison-building logic.

The current duplication between `workflow.ts` and `agent-tools.ts` must be collapsed before introducing any new comparison module boundary.

## Current State

The current `SearchWorkflow` contains these major responsibility bands:

- constructor and session/state management
- clarify loop
- recovery analysis and recovery execution
- search-loop orchestration
- shortlist loop and command handling
- comparison presentation
- search execution and fallback
- search-state diagnostics and query explanation
- condition revision and rerank/sort helpers
- profile generation, caching, and preloading

This is already beyond the point where one class is a useful unit of understanding.

## Target Architecture

### `SearchWorkflow`

Keep as orchestrator.

Responsibilities:

- dependency wiring
- session and ledger lifecycle
- top-level entry points
- `execute()`
- `bootstrapMission()`
- `runClarifyLoop()`
- `runSearchLoop()` skeleton
- high-level delegation between modules

Target size:

- roughly 1200 to 1600 lines

### `workflow-runtime.ts`

Introduce a thin adapter type for stateful modules.

Responsibilities:

- expose narrow workflow capabilities
- avoid full workflow reference sharing
- centralize the minimum contract modules rely on

Illustrative shape:

```ts
type WorkflowRuntime = {
  getSessionState(): AgentSessionSnapshot;
  applySessionState(next: AgentSessionSnapshot): void;
  setSessionStatus(status: AgentSessionStatus, summary?: string | null): void;
  emitSessionEvent(...args: unknown[]): void;
  chat: SearchChat;
  tui: TerminalUI;
  spinner: SpinnerLike;
  tools: WorkflowTools;
};
```

### `search-conditions.ts`

Pure condition and query helpers.

Responsibilities:

- `normalizeConditions`
- `buildEffectiveQuery`
- `formatConditionsAsPrompt`

These functions are cross-cutting but not stateful.

### `ProfileManager`

Stateful class for profile cache, generation, and preload concurrency.

Responsibilities:

- profile cache-key generation
- `ensureProfiles`
- `loadProfileForCandidate`
- `getOrGenerateProfile`
- `preloadProfiles`
- local concurrency control and promise pooling

This module owns processing-in-flight state instead of leaving it on `SearchWorkflow`.

### `ComparisonController`

Stateful compare interaction controller.

Responsibilities:

- `presentComparison`
- compare action loop (`back`, `clear`, `quit`, `refine`)
- compare preparation flow
- compare rendering handoff

Non-responsibilities:

- pure comparison scoring/building rules
- recovery-boundary augmentation logic

### Canonical Comparison Builder

For the first refactor phase, comparison-building logic should stay canonical in `agent-tools.ts`.

That file already exports:

- `prepareComparisonEntries`
- `prepareComparisonResult`

The first refactor step is to remove duplicate workflow-local comparison-building logic and make workflow/controller code delegate to the canonical builder.

This is intentionally not a new file yet. The important decision is to eliminate multiple truths before introducing another module.

### `SearchExecutor`

Stateful search execution module.

Responsibilities:

- `performSearch`
- `performFallbackSearch`
- merge parsed intent with explicit conditions
- build search-state diagnostics
- build query-aware explanation data
- search-state ordering for post-search output

Return contract:

- return `SearchExecutionResult`
- do not mutate workflow-local hidden diagnostics state

Illustrative shape:

```ts
type SearchExecutionResult = {
  candidates: HydratedCandidate[];
  diagnostics?: SearchExecutionDiagnostics;
};
```

Non-responsibilities:

- shortlist-only sorting and reranking controls
- session mutation during query revision

### `ConditionRevisionService`

Small stateful service for cross-scenario query revision and session mutation.

Responsibilities:

- `reviseSessionConditions`
- invoke `tools.reviseQuery`
- record clarification/revision history
- reset recovery state after accepted revision
- clear stale uncertainty after revision

This stays separate because it is shared by:

- recovery clarify/retry
- stop-state refine
- compare refine
- shortlist refine

It is not a search-execution concern.

### `RecoveryHandler`

Stateful recovery analysis and recovery execution module.

Responsibilities:

- `analyzeSearchRecovery`
- `buildAttemptRetrievalDiagnostics`
- `resolveAnchorResolution`
- recovery prompt builders
- `rewriteConditionsForRecovery`
- recovery phase transitions
- `handleSearchRecovery`
- `applyBoundaryContextToComparisonResult`

This module owns recovery semantics because it depends on recovery state, not just on candidate lists.

### `ShortlistController`

Stateful shortlist interaction controller.

Responsibilities:

- `runShortlistLoop`
- `handleShortlistCommand`
- `showCandidateDetail`
- compare-pool operations
- shortlist-local sorting and reranking
- browser open behavior
- pool/export/detail flow control

This is intentionally last because it is the broadest interactive surface and therefore the highest regression risk.

## Key Boundary Decisions

### 1. `reviseSessionConditions` Does Not Belong In `SearchExecutor`

Reason:

- it is used across recovery, shortlist, stop-refine, and compare-refine flows
- it mutates session state
- it is not part of retrieval or ranking itself

Correct home:

- `ConditionRevisionService`

### 2. Shortlist Sort/Rerank Does Not Belong In `SearchExecutor`

Reason:

- it only occurs inside shortlist interaction
- it mixes UI state, ordering intent, and profile availability
- it is a shortlist behavior, not a search behavior

Correct home:

- `ShortlistController`

### 3. `presentComparison()` And `buildComparison*()` Must Be Separated

Reason:

- one is an interactive control loop
- the other is mostly pure comparison construction logic

Correct split:

- `ComparisonController` for interaction
- canonical comparison builder functions for comparison construction

### 4. `applyBoundaryContextToComparisonResult()` Belongs To Recovery

Reason:

- it reads recovery state and boundary-diagnostic context
- it augments compare output only when recovery semantics require it

Correct home:

- `RecoveryHandler`

### 5. Stateful Modules Use A Thin Runtime Adapter

Reason:

- passing the whole workflow instance would preserve hidden coupling
- a full interface hierarchy is unnecessary overhead for this refactor

Correct compromise:

- a narrow runtime adapter shared by modules

## Data Flow Changes

### Before

1. workflow runs search
2. workflow mutates hidden search diagnostics state
3. recovery logic later reads that hidden state

This makes the real dependency implicit.

### After

1. `SearchExecutor` runs search
2. `SearchExecutor` returns `SearchExecutionResult`
3. `RecoveryHandler` consumes that result explicitly

This makes the dependency testable and local.

## Extraction Order

The implementation order is intentional:

1. establish runtime and pure condition helpers
2. eliminate comparison duplication
3. extract `ProfileManager`
4. extract `ComparisonController`
5. extract `SearchExecutor`
6. extract `ConditionRevisionService`
7. extract `RecoveryHandler`
8. extract `ShortlistController`

Why this order:

- low-risk pure and isolated pieces go first
- shared truth is consolidated before new layers are created
- search execution is extracted before recovery so diagnostics can flow explicitly
- the largest interactive surface moves last

## Risks And Mitigations

- Risk: module extraction changes behavior even when signatures stay similar
  Mitigation: every phase has explicit regression gates and should preserve user-visible outputs.

- Risk: runtime adapter grows into a disguised full workflow API
  Mitigation: keep it minimal and add new methods only when a specific extraction requires them.

- Risk: comparison logic remains duplicated during the transition
  Mitigation: make deduplication its own early phase before controller extraction.

- Risk: `SearchExecutor` still leaks hidden mutable state
  Mitigation: require `SearchExecutionResult` as the only diagnostics handoff path before recovery extraction begins.

- Risk: shortlist extraction introduces subtle interaction regressions
  Mitigation: move shortlist last and gate it on the broader workflow/TUI/renderer regression set.

## Acceptance Criteria

This refactor is complete when all of the following are true:

- `workflow.ts` is reduced to orchestration responsibilities
- no extracted module needs the full `SearchWorkflow` instance
- search diagnostics flow explicitly through structured return values
- comparison-building logic has one canonical source
- shortlist-only sort/rerank behavior no longer sits in `SearchExecutor`
- query revision/session mutation no longer sits in `SearchExecutor`
- recovery-boundary augmentation sits with recovery logic
- the CLI workflow test suite passes without user-visible behavioral regressions

## Verification Strategy

Each extraction phase must pass its own targeted regression gate before the next phase begins.

Minimum recurring gate:

- `apps/worker/src/cli/__tests__/workflow.test.ts`
- `apps/worker/src/cli/__tests__/agent-policy.test.ts`
- `apps/worker/src/cli/__tests__/tui.test.ts`

High-risk phase completion gate:

- full `apps/worker/src/cli/__tests__` suite

This keeps the refactor incremental instead of relying on one large final diff.
