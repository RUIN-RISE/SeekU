# Agent Product Memory + Task Model Implementation Plan

Date: 2026-04-22
Project: Seeku
Status: Draft for discussion
Depends on:
- `2026-04-22-cli-runtime-resume-first-interaction-plan.md`
- product discussion on user memory and task-centric agent UX

## Goal

Evolve Seeku from a stateful CLI into a task-centric agent product by introducing:

1. user-level memory
2. task/work-item modeling
3. next-best-action guidance
4. task-centric resume and workboard UX

This plan intentionally treats `resume-first runtime interaction` as the foundation, not the destination.

## Non-Goals

- broad background-agent orchestration
- push notifications or general proactive alerting
- autonomous multi-agent planning
- replacing current retrieval/rerank stack
- introducing opaque ML-based memory inference in V1
- changing web/chat shell behavior in this phase

## Product Decisions

### 1. Primary Product Object

The primary product object is a `work item`, not a `session`.

- a session is an execution container
- a work item is the user-visible task
- resume should default to continuing a work item

### 2. Memory Scope

User memory is user-scoped and cross-session.

- session state remains separate
- memory augments context
- memory must not overwrite task truth

### 3. Blocker Semantics

`blocked` is not a primary task stage.

Use:

```ts
interface TaskStageState {
  stage: TaskStage;
  blocked: boolean;
  blockerReason?: string;
}
```

Examples:

- shortlist-ready but blocked waiting for more evidence
- compare-ready but blocked by unresolved confidence

### 4. Migration Strategy

Use gradual migration.

- new sessions create or attach to work items
- legacy sessions remain session-centric
- resume panel supports both:
  - work-item rows
  - legacy session rows
- do not auto-upgrade all historical sessions into work items

### 5. Next-Best-Action Confidence

Do not gate actions by confidence in V1.

- always show the action
- include reason/source
- gather usage data before introducing confidence-based filtering

## Phase A

Phase A makes the system recognize the user.

### A1. Memory Contract

Goal:
- define memory types
- define storage contract
- define identity source

Owner files:
- `packages/db/src/schema.ts`
- `packages/db/src/user-memories.ts` (new)
- `packages/db/src/migrations/0005_user_memories.sql` (new)
- `apps/worker/src/cli/user-memory-types.ts` (new)
- `apps/worker/src/cli/user-memory-store.ts` (new)
- `apps/worker/src/cli/user-identity-provider.ts` (new)

Required decisions:
- `user_id` must come from `UserIdentityProvider`
- `scope` must be structured, not free-form strings
- `pause memory` must be persisted as a user preference, not process-local state

Structured scope suggestion:

```ts
type MemoryScope =
  | { kind: "global" }
  | { kind: "role"; role: string }
  | { kind: "location"; location: string }
  | { kind: "work_item"; workItemId: string };
```

Validation:
- explicit and inferred memory separation
- expiration handling
- user identity resolution consistency

### A2. Explicit Preference Capture

Goal:
- capture explicit preferences from user language
- ask for confirmation before persistence

Owner files:
- `apps/worker/src/cli/preference-capture.ts` (new)
- `apps/worker/src/cli/workflow.ts`

Rules:
- only persist after explicit confirmation
- save as `source = explicit`
- never silently upgrade an inferred preference into explicit memory

Validation:
- extract preference candidates from clarify/refine flows
- confirm/save flow
- skip flow leaves memory unchanged

### A3. Feedback Memory

Goal:
- store positive/negative/neutral user feedback on candidates
- derive low-confidence inferred preference candidates from repeated patterns

Owner files:
- `packages/db/src/schema.ts`
- `packages/db/src/migrations/0006_candidate_feedback_memories.sql` (new)
- `packages/db/src/user-memories.ts`
- `apps/worker/src/cli/feedback-capture.ts` (new)
- `apps/worker/src/cli/shortlist-controller.ts`
- `apps/worker/src/cli/comparison-controller.ts`

Inference guardrails:
- require thresholded repetition
- require time window
- make inferred preferences reversible

Initial inference defaults:
- minimum repeated signal count: 3
- time window: 30 days
- inferred confidence < explicit confidence

Validation:
- feedback writes
- repeated negative feedback produces inferred preference candidate
- inferred preference can be deleted/revoked cleanly

### A4. Memory-Aware Session Bootstrap

Goal:
- hydrate user context at session start
- allow user to adopt or reject memory-backed defaults

Owner files:
- `apps/worker/src/cli/workflow.ts`
- `apps/worker/src/cli/tui.ts`

Rules:
- show concise memory summary
- allow:
  - use memory
  - ignore for this session
  - inspect full memory
- memory should seed conditions, not lock them

Validation:
- summary rendering
- hydrate conditions from confirmed memory
- ignore path leaves session unseeded

### A5. Memory Management UI

Goal:
- let users inspect, delete, pause, and resume memory usage

Owner files:
- `apps/worker/src/cli/memory-command.ts` (new)
- `apps/worker/src/cli/tui.ts`
- `apps/worker/src/cli/index.ts`

Rules:
- grouped by memory kind
- show explicit vs inferred source
- allow delete by id
- allow pause/resume via persisted user preference

Validation:
- grouped rendering
- delete path
- pause/resume path

## Phase B

Phase B makes the system understand the task.

### B1. Work Item Contract

Goal:
- introduce task/work-item as the primary user-visible object

Owner files:
- `packages/db/src/schema.ts`
- `packages/db/src/work-items.ts` (new)
- `packages/db/src/migrations/0007_work_items.sql` (new)
- `apps/worker/src/cli/work-item-types.ts` (new)
- `apps/worker/src/cli/work-item-store.ts` (new)

Required table additions:
- `work_items`
- `agent_sessions.work_item_id`

Compatibility rules:
- new sessions create or attach to work items
- legacy sessions remain valid without `work_item_id`
- resume layer must support both models during migration

Validation:
- create and load work items
- attach session to work item
- list work items by user
- completed work items remain read-only

Consumes from Phase A:
- `UserIdentityProvider`
- optional memory summary for work-item title/goal shaping

### B2. Task Progress Derivation

Goal:
- derive user-meaningful task progress from session/runtime state

Owner files:
- `apps/worker/src/cli/task-progress-deriver.ts` (new)
- `apps/worker/src/cli/work-item-types.ts`
- `apps/worker/src/cli/work-item-store.ts`
- `apps/worker/src/cli/workflow.ts`

Primary stages:
- `goal_defined`
- `criteria_grounded`
- `search_executed`
- `shortlist_ready`
- `compare_ready`
- `decision_ready`
- `completed`

Blocker is a modifier:
- `blocked: boolean`
- `blockerReason?: string`

Validation:
- runtime blocked maps to task blocked modifier
- shortlist and compare scenarios map correctly
- recommendation-ready scenario maps to `decision_ready`

Consumes from Phase A:
- memory may enrich explanation
- memory must not override derived task stage

### B3. Next-Best-Action Engine

Goal:
- produce a clear next-step recommendation for each work item

Owner files:
- `apps/worker/src/cli/next-best-action.ts` (new)
- `apps/worker/src/cli/work-item-types.ts`
- `apps/worker/src/cli/work-item-store.ts`

Initial action types:
- `clarify_requirement`
- `relax_constraint`
- `tighten_constraint`
- `inspect_candidate`
- `compare_candidates`
- `collect_missing_evidence`
- `confirm_preference`
- `close_task`

Rules:
- use deterministic rule-based derivation in V1
- always show the top action
- include reason and derivation source

Validation:
- blocked scenarios produce clarify/relax actions
- shortlist-ready produces compare action
- repeated memory-backed ambiguity can produce confirm-preference action

Consumes from Phase A:
- explicit preferences
- inferred preferences
- feedback memories
- hiring context

### B4. Workboard Redesign

Goal:
- make workboard task-centric instead of runtime-centric

Owner files:
- `apps/worker/src/cli/tui.ts`
- `apps/worker/src/cli/workboard-presenter.ts` (new)
- `apps/worker/src/cli/index.ts`
- `apps/worker/src/cli/workflow.ts`

New workboard sections:
- Work Item
- Goal
- Progress
- Blockers
- Open Decisions
- Next Best Action
- Using Memory

Rules:
- transcript becomes secondary
- workboard must stand on its own
- memory is shown as supporting context only

Validation:
- workboard readability without transcript
- blocker rendering
- memory rendering distinct from task truth

Consumes from Phase A:
- `Using Memory` summary

### B5. Resume Panel Re-ranking Around Work Items

Goal:
- rank and display work items instead of raw sessions where possible

Owner files:
- `apps/worker/src/cli/resume-resolver.ts`
- `apps/worker/src/cli/work-item-store.ts`
- `apps/worker/src/cli/tui.ts`
- `apps/worker/src/cli/index.ts`

Rules:
- one row per work item when `work_item_id` exists
- collapse multiple sessions into one work-item row
- show legacy session rows for old data

Suggested order:
1. resumable `compare_ready`
2. resumable `shortlist_ready`
3. blocked but actionable
4. read-only recent completed work items
5. legacy historical sessions

Validation:
- work-item collapse
- legacy compatibility
- attach path still works for explicit session ids

Consumes from Phase A:
- memory may improve row summary copy only

### B6. Task-Centric Tests

Goal:
- protect the task model as a product contract, not just runtime mechanics

Owner files:
- `apps/worker/src/cli/__tests__/work-item-store.test.ts`
- `apps/worker/src/cli/__tests__/task-progress-deriver.test.ts`
- `apps/worker/src/cli/__tests__/next-best-action.test.ts`
- `apps/worker/src/cli/__tests__/workboard-presenter.test.ts`
- `apps/worker/src/cli/__tests__/resume-resolver-work-items.test.ts`
- `apps/worker/src/cli/__tests__/workflow-task-integration.test.ts`

Validation themes:
- same work item across resumed sessions
- task stage derivation correctness
- next-best-action correctness
- memory as context, not truth
- task-centric workboard correctness

Consumes from Phase A:
- integration tests must cover memory + task coexistence

## Data Model Summary

Phase A tables:
- `user_memories`
- `candidate_feedback_memories`

Phase B tables:
- `work_items`
- `agent_sessions.work_item_id`

## Execution Order

Roadmap-level sequence:

1. complete Phase A first so user memory is a stable product layer
2. introduce Phase B task/work-item contracts only after A1 is landed
3. build next-best-action and task-centric UX on top of those contracts

See `Implementation Sequencing Recommendation` below for the dependency-safe execution waves.

## Validation Plan

Required engineering validation:
- targeted unit suites for all new contracts
- worker typecheck
- full `apps/worker` Vitest run

Required product validation:
- user can continue a task without reading transcript
- memory can be inspected and cleared
- legacy sessions remain usable
- work-item resume feels task-centric, not session-centric

## Rollout Notes

- ship behind gradual activation if needed
- keep legacy session-centric fallback until work-item behavior stabilizes
- do not auto-migrate old sessions into work items in V1
- log action/reason usage so Phase C can calibrate confidence and proactivity

## Default Decisions For Execution

These defaults are recommended so implementation can proceed without reopening product ambiguity during coding.

### 1. User Identity Source

Use an explicit `UserIdentityProvider` abstraction.

V1 local CLI behavior:
- resolve user identity from persisted CLI profile/config if present
- otherwise create and persist a stable local anonymous user id
- do not pass raw ad hoc string literals through workflow call sites

This keeps memory user-scoped without requiring account systems in V1.

### 2. Expiration Policy

Use different defaults for explicit vs inferred memory.

- explicit memory: no default expiration unless the memory kind requires one
- inferred memory: expires by default after 30 days
- inferred memory should be refreshed on repeated confirming signals

This keeps explicit user intent durable while making soft inference decay naturally.

### 3. Completed Work Item Semantics

Do not auto-reopen completed work items in V1.

- new user input after completion creates a new work item
- the old completed work item remains immutable history
- future phases may add explicit reopen semantics, but V1 should avoid hidden state reversal

This preserves a reliable task timeline and avoids ambiguous progress state.

### 4. Legacy Session Continuation

When a legacy session is resumed and meaningfully continued, create a fresh work item for the continuation.

- the legacy session remains readable as historical state
- the new continuation session attaches to the new work item
- resume UI may indicate that the legacy session has been continued as a work item

This allows gradual migration without rewriting historical data.

## Implementation Sequencing Recommendation

The roadmap remains valid, but coding should proceed in dependency-safe waves rather than strict calendar weeks.

Wave 1:
- A1 Memory Contract

Wave 2:
- A2 Explicit Preference Capture
- A3 Feedback Memory

Wave 3:
- A4 Memory-Aware Session Bootstrap
- A5 Memory Management UI

Wave 4:
- B1 Work Item Contract
- B2 Task Progress Derivation

Wave 5:
- B3 Next-Best-Action Engine
- B4 Workboard Redesign

Wave 6:
- B5 Resume Panel Re-ranking Around Work Items
- B6 Task-Centric Tests

If execution capacity supports parallel work, `B1` can begin once `A1` lands, but Phase A remains the priority lane.
