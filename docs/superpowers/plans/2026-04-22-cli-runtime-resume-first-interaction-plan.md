# CLI Runtime Resume-First Interaction Plan

Date: 2026-04-22
Project: Seeku
Status: Ready for implementation
Depends on: discussion consensus from 2026-04-22 on `seeku` CLI/runtime interaction

## Goal

Improve Seeku's CLI/runtime interaction by making `resume` work-item-centric instead of transcript-centric, surfacing explicit runtime status in the terminal, and removing ambiguity around whether a stopped session is resumable.

This plan intentionally prioritizes:

- unified resume entry
- explicit status/runtime state
- mode indicator
- termination reason and resumability

It intentionally does **not** prioritize auto session memory, multi-agent/background work, or a brand-new six-mode state machine in V1.

## Product Decision

V1 is `resume-first interaction`, not `protocol-first`.

The core user-facing object is no longer "a previous conversation". It is "a work item":

- a stopped but resumable runtime task
- an interrupted search/recovery flow
- a read-only historical stopped session
- a new session

The CLI must rank and present these objects explicitly instead of relying on the current split flow:

- launcher list in [`apps/worker/src/cli/index.ts`](../../../../apps/worker/src/cli/index.ts)
- read-only restored transcript view in [`apps/worker/src/cli/tui.ts`](../../../../apps/worker/src/cli/tui.ts)
- workflow-owned runtime state in [`apps/worker/src/cli/workflow.ts`](../../../../apps/worker/src/cli/workflow.ts)

## Scope

- unify the current launcher/attach/restored-session flow into one resume-first entry path
- add explicit runtime state ownership for status, why, and termination reason
- make resumability derive from explicit termination metadata instead of heuristics
- add a CLI mode/status indicator driven by structured runtime fields
- extend the session status graph to cover compare-driven refine/re-search loops
- persist enough denormalized resume metadata so the panel can rank work items without reparsing transcripts

## Out Of Scope

- auto session memory
- general background task infrastructure
- multi-agent orchestration
- web/chat shell changes
- retriever/reranker redesign
- replacing natural-language condition extraction in [`chat.ts`](../../../../apps/worker/src/cli/chat.ts) during V1

## V1 Deliverables

1. One canonical resume path in the CLI entrypoint
2. One canonical runtime state shape for current status, why, and termination
3. One canonical resumability decision derived from persisted metadata
4. One mode indicator shown from structured runtime state
5. One explicit, tested status graph for the CLI runtime

## Ownership Decisions

This section is intentionally explicit so implementation does not bounce between files.

### 1. Shared Runtime Interaction Types

**Owner file:** `apps/worker/src/cli/session-runtime-types.ts` (new)

This file should own **shared runtime interaction contracts** that are consumed by state, snapshot/event, ledger, and TUI layers.

It should define:

- `AgentSessionStatus`
  - move the existing definition out of `agent-session-events.ts`
- `AgentSessionTerminationReason`
  - `completed`
  - `user_exit`
  - `interrupted`
  - `crashed`
- `AgentSessionWhyCode`
  - V1 should start small and only cover runtime-visible causes, for example:
    - `awaiting_user_input`
    - `goal_missing`
    - `conditions_insufficient`
    - `retrieval_zero_hits`
    - `retrieval_all_weak`
    - `recovery_clarify_anchor`
    - `recovery_clarify_role`
    - `recovery_clarify_skill`
    - `recovery_rewrite`
    - `recovery_budget_exhausted`
    - `low_confidence_shortlist`
    - `compare_refine_requested`
- `AgentResumeItemKind`
  - `interrupted_work_item`
  - `stopped_session`
  - `recent_session`
  - `new_session`
- `AgentResumability`
  - `resumable`
  - `read_only`
  - `not_resumable`

Why this belongs in a new file:

- `agent-state.ts` should own mutable runtime state, not cross-layer enums
- `agent-session-events.ts` should own serialization shapes, not the canonical enum source
- `session-ledger.ts` should own persistence, not reusable semantics
- `types.ts` is already a broad search-domain bucket and should not become the CLI runtime contract dump

### 2. In-Memory Runtime State

**Owner file:** `apps/worker/src/cli/agent-state.ts`

This file should own the live mutable state used by the workflow.

Add:

- `AgentSessionRuntimeState`
- `AgentSessionState.runtime: AgentSessionRuntimeState`

Recommended shape:

```ts
interface AgentSessionRuntimeState {
  status: AgentSessionStatus;
  statusSummary: string | null;
  primaryWhyCode?: AgentSessionWhyCode;
  whyCodes: AgentSessionWhyCode[];
  whySummary: string | null;
  terminationReason?: AgentSessionTerminationReason;
  lastStatusAt: Date;
}
```

Rules:

- `status` and `statusSummary` move out of `SearchWorkflow` private fields into `sessionState.runtime`
- `primaryWhyCode` is optional and used for compact display
- `whyCodes` is the full structured list for debugging, workboard, and future protocol use
- `whySummary` is user-facing plain language, not a replacement for `whyCodes`
- `terminationReason` is set only when a session reaches a terminal/stopped state
- `lastStatusAt` gives the resume panel a stable timestamp without consulting transcript tail

Do **not** put these on `SearchRecoveryState`:

- they are broader than recovery
- they apply to clarifying, searching, waiting-input, compare, and stop semantics

### 3. Snapshot And Event Serialization

**Owner file:** `apps/worker/src/cli/agent-session-events.ts`

This file should own serialized external/runtime-facing representations.

Add:

- `AgentSessionRuntimeSnapshot`
- `AgentSessionSnapshot.runtime: AgentSessionRuntimeSnapshot`

Recommended serialized shape:

```ts
interface AgentSessionRuntimeSnapshot {
  status: AgentSessionStatus;
  statusSummary: string | null;
  primaryWhyCode?: AgentSessionWhyCode;
  whyCodes: AgentSessionWhyCode[];
  whySummary: string | null;
  terminationReason?: AgentSessionTerminationReason;
  lastStatusAt: string;
}
```

Implementation notes:

- keep serialization logic in this file
- stop threading raw `status` and `statusSummary` as separate top-level workflow-owned values
- `buildAgentSessionSnapshot()` should serialize from `state.runtime`
- session events can continue to duplicate the current status for convenience, but the canonical source should be the runtime slice

### 4. Persisted Resume Metadata

**Owner file:** `apps/worker/src/cli/session-ledger.ts`

This file should own denormalized persisted fields used by the resume panel.

Add:

- `PersistedCliSessionRecord.resumeMeta`
- `PersistedCliSessionSummary.resumeMeta`

Recommended shape:

```ts
interface PersistedCliResumeMeta {
  kind: AgentResumeItemKind;
  resumability: AgentResumability;
  status: AgentSessionStatus;
  statusSummary: string | null;
  primaryWhyCode?: AgentSessionWhyCode;
  whySummary: string | null;
  terminationReason?: AgentSessionTerminationReason;
  lastStatusAt?: string;
}
```

Rules:

- the ledger should persist this as denormalized summary data for fast listing/ranking
- the source of truth is still `latestSnapshot.runtime`
- `resumability` must be derived when saving, not guessed by the TUI
- launcher list and resume panel should use `resumeMeta`, not transcript inspection

### 5. Resume Ranking Logic

**Owner file:** `apps/worker/src/cli/resume-resolver.ts` (new)

This file should own:

- loading candidate resume items from ledger
- converting persisted records into resume panel rows
- sorting priority
- determining default selection

Do **not** bury ranking rules in `index.ts` or `tui.ts`.

## Runtime Semantics

### Resumability Rules

`resumability` must not be inferred from posture alone.

Required logic:

- `terminationReason = interrupted` -> `resumable`
- `terminationReason = crashed` -> `resumable`
- `terminationReason = user_exit`
  - `resumable` only if runtime status at exit was non-terminal and enough runtime state exists to continue
  - otherwise `read_only`
- `terminationReason = completed` -> `read_only`
- missing termination reason on an old record -> conservative fallback to `read_only`

This is the key fix for the current ambiguity where a stopped session could be:

- finished normally
- intentionally exited
- abruptly interrupted

without the launcher knowing which one it is.

### Why Semantics

`Why` must be structured, not just one string.

V1 rule:

- `primaryWhyCode` is what the compact mode indicator shows
- `whyCodes` preserves all active causes
- `whySummary` is the human-readable line

This handles cases where more than one reason exists, for example:

- missing role axis
- missing skill axis
- waiting for user input after failed retrieval

The compact TUI can show the primary reason while keeping the full array for workboard/debug use.

## Status Graph Requirements

Current transition rules already exist in [`agent-session-transitions.ts`](../../../../apps/worker/src/cli/agent-session-transitions.ts), but V1 must treat them as a first-class runtime contract.

### Required adjustments

1. Move `AgentSessionStatus` import source to `session-runtime-types.ts`
2. Add compare-driven refine/re-search coverage explicitly
3. Keep the graph testable independently from workflow text output

### Required semantic loop

The graph must support the compare refinement loop at runtime:

`comparing -> searching -> recovering -> shortlist/comparing`

Implementation preference:

- prefer the explicit intermediate `searching` step over a hidden compare-to-recovery jump
- only allow direct `comparing -> recovering` if the real code path truly sets that status directly

The graph must not assume a purely one-way linear flow.

### Recommended terminal rule

`completed` remains terminal in the live graph, but stopped records with:

- `terminationReason = interrupted`
- `terminationReason = crashed`

must still appear as resumable work items in the panel.

## Implementation Batches

### Batch 1: Runtime Contract Extraction And Explicit State Ownership

Suggested commit message:

- `refactor(cli): extract runtime interaction contracts`

Files:

- `apps/worker/src/cli/session-runtime-types.ts` (new)
- `apps/worker/src/cli/agent-state.ts`
- `apps/worker/src/cli/agent-session-events.ts`
- `apps/worker/src/cli/agent-session-transitions.ts`
- `apps/worker/src/cli/workflow.ts`

Tasks:

1. Create `session-runtime-types.ts` and move `AgentSessionStatus` there.
2. Add `AgentSessionTerminationReason`, `AgentSessionWhyCode`, `AgentResumeItemKind`, and `AgentResumability`.
3. Add `runtime` to `AgentSessionState`.
4. Remove workflow-private ownership of:
   - `sessionStatus`
   - `sessionStatusSummary`
5. Make `setSessionStatus()` mutate `sessionState.runtime` instead of separate workflow fields.
6. Add a helper to update `primaryWhyCode`, `whyCodes`, and `whySummary` alongside status transitions.

Validation:

- targeted typecheck passes
- snapshot serialization still works
- no status transition assertions regress

Exit criteria:

- runtime status no longer lives in workflow-only private fields
- there is one canonical type owner for status/why/termination semantics

### Batch 2: Unified Resume Entry And Resolver

Suggested commit message:

- `feat(cli): unify resume entry around work items`

Files:

- `apps/worker/src/cli/resume-resolver.ts` (new)
- `apps/worker/src/cli/index.ts`
- `apps/worker/src/cli/session-ledger.ts`
- `apps/worker/src/cli/tui.ts`

Tasks:

1. Introduce `resume-resolver.ts` to:
   - load recent records
   - rank resumable work items
   - produce panel rows
2. Replace the split launcher/read-only-restored flow in `index.ts` with one canonical path:
   - resolve items
   - show panel
   - branch into `new`, `resume`, or `read_only`
3. Add `resumeMeta` to persisted record/summary.
4. Ensure the old `attach <sessionId>` path routes through the same resolver instead of bypassing panel logic.
5. Preserve read-only transcript viewing, but make it a secondary action on a selected work item, not a separate top-level flow.

Validation:

- launcher still supports `new`
- launcher still supports explicit `attach <sessionId>`
- stopped completed sessions are not misclassified as resumable

Exit criteria:

- there is only one user-visible resume decision path
- panel sorting is deterministic and testable

### Batch 3: Termination Reason And Resumability Persistence

Suggested commit message:

- `feat(cli): persist termination reason for session resume`

Files:

- `apps/worker/src/cli/workflow.ts`
- `apps/worker/src/cli/index.ts`
- `apps/worker/src/cli/session-ledger.ts`
- `apps/worker/src/cli/agent-session-events.ts`

Tasks:

1. Record terminal reason when the session stops.
2. Distinguish at minimum:
   - `completed`
   - `user_exit`
   - `interrupted`
   - `crashed`
3. Serialize/persist termination reason through snapshot -> ledger -> summary.
4. Derive `resumability` from terminal reason plus runtime state.
5. Make save paths in `index.ts` use explicit reasoned stop handling instead of only `"active"` / `"stopped"` posture.

Validation:

- normal completed sessions persist `completed`
- explicit quit persists `user_exit`
- abrupt process interruption path can be simulated and persists `interrupted` or `crashed`

Exit criteria:

- resume panel no longer needs to guess whether a stopped session is resumable

### Batch 4: Mode Indicator And Workboard Wiring

Suggested commit message:

- `feat(cli): add runtime mode indicator to workboard`

Files:

- `apps/worker/src/cli/tui.ts`
- `apps/worker/src/cli/workflow.ts`
- `apps/worker/src/cli/agent-session-events.ts`

Tasks:

1. Add a compact mode indicator in the TUI header or workboard region.
2. Use structured runtime fields:
   - `status`
   - `statusSummary`
   - `primaryWhyCode`
   - `whySummary`
3. Keep transcript rendering unchanged except where status framing needs to be clearer.
4. Use `primaryWhyCode` for compact display and `whySummary` for human-readable explanation.

Example:

- `Mode: Recovering`
- `Why: retrieval_all_weak`
- `Summary: 结果偏弱，正在尝试改写搜索`

Validation:

- status indicator updates during clarify/search/recovery/shortlist/compare
- read-only restored session view can still display the latest runtime status cleanly

Exit criteria:

- current runtime state is visible without reading the full transcript

### Batch 5: Tests

Suggested commit message:

- `test(cli): cover resume-first runtime interaction`

Files:

- `apps/worker/src/cli/__tests__/workflow-ledger.test.ts`
- `apps/worker/src/cli/__tests__/workflow-session-events.test.ts`
- `apps/worker/src/cli/__tests__/workflow.test.ts`
- `apps/worker/src/cli/__tests__/tui.test.ts`
- `apps/worker/src/cli/__tests__/session-ledger.test.ts`
- `apps/worker/src/cli/__tests__/resume-resolver.test.ts` (new)

Tasks:

1. Add unit tests for `resume-resolver.ts` ranking:
   - resumable interrupted work item outranks read-only stopped session
   - completed session is `read_only`
   - missing termination reason falls back conservatively
2. Add workflow/session-event tests for runtime serialization:
   - `whyCodes`
   - `primaryWhyCode`
   - `terminationReason`
3. Add transition tests for compare refine loop:
   - `comparing -> searching`
   - `searching -> recovering`
4. Add TUI tests for:
   - mode indicator rendering
   - resume panel row labeling
5. Preserve existing launcher/attach behavior through regression coverage.

Validation:

- targeted suite passes
- no existing resume/read-only behavior regresses unintentionally

Exit criteria:

- V1 behavior is regression-protected at runtime-contract level, not just by manual CLI inspection

## Recommended Field Mapping

This is the concrete answer to "which file owns which field?"

### `terminationReason`

- Type owner: `apps/worker/src/cli/session-runtime-types.ts`
- Live value owner: `apps/worker/src/cli/agent-state.ts` under `AgentSessionState.runtime`
- Serialized owner: `apps/worker/src/cli/agent-session-events.ts`
- Persisted denormalized owner: `apps/worker/src/cli/session-ledger.ts`

### `whyCodes`

- Type owner: `apps/worker/src/cli/session-runtime-types.ts`
- Live value owner: `apps/worker/src/cli/agent-state.ts` under `AgentSessionState.runtime`
- Serialized owner: `apps/worker/src/cli/agent-session-events.ts`
- Persisted summary owner: `apps/worker/src/cli/session-ledger.ts` through `resumeMeta`

### `primaryWhyCode`

- Type owner: `apps/worker/src/cli/session-runtime-types.ts`
- Live value owner: `apps/worker/src/cli/agent-state.ts`
- TUI consumer: `apps/worker/src/cli/tui.ts`

### `status`

- Enum owner: `apps/worker/src/cli/session-runtime-types.ts`
- Live value owner: `apps/worker/src/cli/agent-state.ts`
- Guard owner: `apps/worker/src/cli/agent-session-transitions.ts`
- Serialized owner: `apps/worker/src/cli/agent-session-events.ts`

### `resumability`

- Enum owner: `apps/worker/src/cli/session-runtime-types.ts`
- Derived persisted value owner: `apps/worker/src/cli/session-ledger.ts`
- Ranking consumer: `apps/worker/src/cli/resume-resolver.ts`
- TUI consumer: `apps/worker/src/cli/tui.ts`

### `resume item kind`

- Enum owner: `apps/worker/src/cli/session-runtime-types.ts`
- Derived/persisted owner: `apps/worker/src/cli/session-ledger.ts`
- Ranking owner: `apps/worker/src/cli/resume-resolver.ts`

## Risks And Mitigations

- Risk: V1 grows into a full interaction redesign
  Mitigation: keep V1 limited to resume/status/runtime contracts; defer structured question protocol to V2.

- Risk: moving status into session state causes too many workflow call-site changes
  Mitigation: land Batch 1 first and keep an adapter-style `setSessionStatus()` helper so the call sites change minimally.

- Risk: old records have no termination reason
  Mitigation: treat them as `read_only` by default and only surface resumable behavior for records with explicit metadata.

- Risk: compare-driven refine loop is still under-modeled
  Mitigation: test the semantic loop explicitly and prefer `comparing -> searching -> recovering` as the visible path.

## V2 And V3 Direction

V2:

- replace key `chat.askFreeform()` branches with constrained question calls
- keep natural-language extraction for the initial broad query, but make clarify/recovery branches protocol-driven

V3:

- add worker-layer guardrail middleware for:
  - illegal status transitions
  - recommendation honesty
  - recovery budget exhaustion
  - resume consistency

These are intentionally deferred. They should not block V1.

## Final Verification

Before closing V1, verify all of the following in one pass:

- the CLI has one canonical resume entry path
- a completed stopped session is not presented as resumable
- an interrupted/crashed stopped session is presented as resumable work
- the mode indicator reflects structured runtime state
- `why` is available both as a compact primary code and as a full structured list
- compare-driven refine loops remain representable in the runtime status graph
- no existing read-only restored transcript behavior is lost, only subordinated to the new panel
