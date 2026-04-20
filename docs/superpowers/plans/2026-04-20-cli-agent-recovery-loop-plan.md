# CLI Agent Recovery Loop Plan

Date: 2026-04-20
Project: Seeku
Status: Ready for implementation
Depends on: `docs/superpowers/specs/2026-04-20-cli-agent-recovery-loop-design.md`

## Goal

Implement a bounded recovery loop in the CLI agent so weak or failed search results do not immediately collapse into a terminal `证据不足` outcome.

## Scope

- add explicit recovery-state bookkeeping to the CLI workflow
- diagnose whether a weak search result is caused by missing intent or retrieval failure
- allow one targeted clarification retry or one query rewrite retry
- emit a clearly labeled low-confidence shortlist when bounded recovery still cannot reach a strong result
- make recovery actions visible in CLI status, transcript, and session state

## Out of Scope

- retriever or embedding algorithm redesign
- planner model swap
- web UI parity
- autonomous multi-round recovery beyond one bounded cycle

## Implementation Batches

### Batch 1: Recovery State And Failure Diagnosis

Files:

- `apps/worker/src/cli/types.ts`
- `apps/worker/src/cli/agent-state.ts`
- `apps/worker/src/cli/agent-session-events.ts`
- `apps/worker/src/cli/workflow.ts`

Tasks:

1. Add explicit recovery types and state fields for:
   - recovery status
   - failure reason
   - recovery budget consumption
   - last rewritten query
2. Define a workflow-local diagnosis step that classifies weak search outcomes as:
   - `intent_missing`
   - `retrieval_failed`
3. Base diagnosis on current signals already available in workflow output:
   - zero results
   - all-weak match strength
   - sparse query reasons
   - weak condition-audit posture
4. Record recovery actions in transcript and session events so the CLI can show what happened.

Validation:

- new types compile cleanly
- diagnosis is deterministic for fixed candidate inputs
- session snapshot/event payloads can represent recovery activity without breaking existing consumers

Exit Criteria:

- workflow can represent a recoverable weak-result state explicitly
- weak-result diagnosis no longer depends on ad hoc inline branching alone

### Batch 2: Bounded Recovery Execution

Files:

- `apps/worker/src/cli/agent-policy.ts`
- `apps/worker/src/cli/workflow.ts`
- `apps/worker/src/cli/chat.ts`

Tasks:

1. Extend policy logic to choose a recovery action instead of stopping immediately.
2. Implement bounded recovery order:
   - diagnose
   - targeted clarification when intent is missing
   - otherwise query rewrite retry
   - finally low-confidence shortlist or explicit stop
3. Reuse existing revise/query-edit capability where possible instead of inventing a parallel rewrite system.
4. Enforce budgets:
   - max one recovery clarification
   - max one rewrite retry
   - no infinite loop back into recovery
5. Preserve existing search-core entry points so recovery still routes through planner/retriever/reranker or the existing fallback path.

Validation:

- workflow follows the approved order for both `intent_missing` and `retrieval_failed`
- recovery stops after the allowed budget
- no path silently upgrades a low-confidence shortlist into a recommendation

Exit Criteria:

- weak-result handling is a first-class workflow path
- CLI no longer jumps directly from weak search to terminal insufficiency in the recoverable cases

### Batch 3: Low-Confidence Shortlist Presentation

Files:

- `apps/worker/src/cli/tui.ts`
- `apps/worker/src/cli/renderer.ts`
- `apps/worker/src/cli/workflow.ts`

Tasks:

1. Add compact status framing for recovery actions:
   - missing constraint clarification
   - rewrite retry in progress
   - low-confidence shortlist mode
2. Add a distinct low-confidence shortlist presentation contract that separates:
   - `可先看的人`
   - `为什么我还不能直接推荐`
3. Ensure shortlist warnings and confidence state match the recovery outcome instead of the previous generic weak-match warning only.
4. Preserve current shortlist navigation and detail inspection behavior.

Validation:

- CLI output clearly distinguishes low-confidence shortlist from recommendation output
- recovery status is visible in the session transcript and workboard snapshot
- no regression in normal strong-result shortlist rendering

Exit Criteria:

- users can tell whether the CLI is clarifying, retrying retrieval, or showing a fallback shortlist
- low-confidence output is useful without being mistaken for a final decision

### Batch 4: Targeted Tests

Files:

- `apps/worker/src/cli/__tests__/workflow.test.ts`
- `apps/worker/src/cli/__tests__/agent-policy.test.ts`
- `apps/worker/src/cli/__tests__/renderer.test.ts`
- `apps/worker/src/cli/__tests__/tui.test.ts`

Tasks:

1. Add workflow tests for:
   - zero-result recovery
   - all-weak-result recovery
   - `intent_missing` leading to one clarification
   - `retrieval_failed` leading to one rewrite retry
   - bounded low-confidence shortlist emission
2. Add policy tests for diagnosis-to-action routing.
3. Add renderer/TUI tests proving low-confidence output is labeled distinctly from recommendation output.
4. Preserve existing non-recovery flows with regression coverage where current behavior should remain unchanged.

Validation:

- targeted CLI workflow suite passes
- renderer/TUI snapshots or string assertions cover the new recovery labels
- no regression in existing shortlist / compare / decide tests that should remain stable

Exit Criteria:

- recovery behavior is regression-protected
- the failure mode the user described is covered by executable tests rather than manual inspection only

## Risks And Mitigations

- Risk: diagnosis heuristics are too aggressive and trigger recovery on acceptable shortlists
  Mitigation: keep the first version conservative and require multiple weak signals, not one signal alone.

- Risk: rewrite path diverges from user intent
  Mitigation: reuse existing revise/query-edit machinery and forbid dropping explicit must-haves.

- Risk: low-confidence shortlist is confused with recommendation output
  Mitigation: separate confidence state, labeling, and renderer/TUI sections.

## Suggested Delivery Order

1. Batch 1
2. Batch 2
3. Batch 3
4. Batch 4

This order keeps behavior semantics in place before changing presentation, and keeps tests aligned with the final surfaced UX.

## Final Verification

Before closing the work, verify all of the following in one pass:

- a recoverable weak-result query no longer stops immediately with `证据不足`
- a missing-intent case asks one targeted clarification question
- a sufficiently specified but weak-retrieval case performs one rewrite retry
- a still-weak but somewhat relevant query produces a low-confidence shortlist
- the low-confidence shortlist is visibly distinct from a recommendation
- existing strong-result flows still proceed normally into shortlist / compare / decide
