# Seeku CLI Agent Recovery Loop Design

Date: 2026-04-20
Project: Seeku
Status: Approved for implementation planning
Owner: Codex + Ross Cai

## Summary

Seeku should make the CLI agent recover from weak or failed retrieval before concluding that evidence is insufficient.

The current behavior is too eager to stop when the returned candidates do not meet the user goal well enough. That creates the wrong product experience:

- the user asked for the right kind of person
- the system failed to retrieve or assemble a usable set
- the CLI presents that failure as if the market evidence itself were insufficient

The next step is not to redesign the entire search core. It is to add a bounded recovery loop inside the CLI agent so that evidence insufficiency becomes a controlled intermediate state rather than an immediate terminal state.

## Why This Exists

The current CLI agent already has:

- an LLM-backed query planner
- hybrid retrieval
- reranking
- a multi-step agent loop

But from the user’s perspective it still fails in a frustrating way: it often cannot return the right candidates and stops with a weak “证据不足” posture.

That is a workflow problem, not just a retrieval-scoring problem.

Two different failures are being collapsed into one message:

- the user goal is still under-specified
- the retrieval stack failed to surface a usable candidate set for a sufficiently clear goal

Those two cases need different behavior. The CLI agent should diagnose which one happened and recover in a controlled order before it is allowed to stop.

## Product Goal

Add a bounded recovery loop for the CLI agent when search results are missing, too weak, or not decision-usable.

The first version is successful if it does all of the following:

- treats weak or unusable search output as a recoverable state
- distinguishes intent ambiguity from retrieval failure
- asks at most one targeted clarification question when key goal information is missing
- automatically performs one query rewrite retry when the intent is already sufficient
- returns a low-confidence shortlist instead of an empty or prematurely stopped result when some weakly relevant candidates exist
- clearly separates low-confidence shortlist output from final recommendation output
- keeps the loop bounded so it does not become an infinite retry system

## Non-Goals

The first version will not:

- replace the existing planner / retriever / reranker stack
- redesign the embedding or ranking system
- introduce a general-purpose agent framework
- add autonomous multi-round retrieval exploration
- add web-first UX changes
- turn low-confidence shortlist into a hidden recommendation

## Product Definition

### Core Principle

`evidence_insufficient` should no longer mean “stop immediately.”

It should first mean:

- diagnose why the current result set is not good enough
- attempt one bounded recovery path
- only stop after that bounded recovery path still fails

This preserves honesty while avoiding premature failure.

### Recovery Order

The recovery order is fixed:

1. diagnose whether the issue is `intent_missing` or `retrieval_failed`
2. if `intent_missing`, ask one targeted clarification question
3. otherwise, perform one automatic query rewrite and retry retrieval
4. if still insufficient, emit a low-confidence shortlist with explicit uncertainty
5. only stop after the recovery budget is exhausted and no minimally usable shortlist exists

This order is intentional.

It prevents the agent from:

- asking repetitive low-value questions
- endlessly rewriting the query
- confusing a weak shortlist with a recommendation

## Behavioral Model

### Existing Agent Loop

The existing high-level states remain:

1. `clarify`
2. `search`
3. `narrow`
4. `compare`
5. `decide`

The first version should not replace this model.

### New Recovery State

Add a bounded internal sub-state:

- `recover`

`recover` is not a new free-form mode. It is a narrow recovery branch that can only execute a small fixed toolset and a small fixed number of retries.

### Recovery Actions

`recover` may perform only these actions:

- `diagnose_failure`
- `ask_targeted_clarification`
- `rewrite_query`
- `emit_low_confidence_shortlist`

It may not bypass the existing search core or invent candidates outside retrieved evidence.

## Failure Taxonomy

### `intent_missing`

Use this when the user goal is still missing one decisive constraint and retrieval quality is low because the target is too open.

Typical examples:

- no clear role or technical direction
- missing must-have stack or domain focus
- missing location constraint when location is central to the result quality

Expected behavior:

- ask one targeted clarification question
- merge the answer into current search conditions
- rerun search once

### `retrieval_failed`

Use this when the user goal is already sufficiently clear, but the current retrieval path still fails to produce a usable result set.

Typical examples:

- zero results despite a concrete goal
- only weak matches returned
- candidates returned, but most fail condition audit or have hollow query-aware reasons

Expected behavior:

- perform one automatic query rewrite
- rerun search once
- if still weak, emit low-confidence shortlist instead of pretending no one is usable

## State Machine Rules

### Entering Recovery

The agent enters `recover` when the current search attempt is not decision-usable.

This should include:

- zero retrieved results
- only weak matches
- query reasons that are too empty or generic
- condition audit showing most core conditions are not met
- shortlist too noisy to support compare or decision

The trigger should not be based only on `0 results`. The real test is whether the current output is good enough to advance the user toward a credible shortlist or compare set.

### Recovery Budgets

The first version should enforce strict recovery budgets:

- at most 1 targeted clarification inside recovery
- at most 1 query rewrite retry
- at most 1 low-confidence shortlist emission

After the budget is consumed, the agent must either:

- return the low-confidence shortlist
- or stop explicitly with a clear reason

It must not loop indefinitely.

## Query Rewrite Behavior

### Purpose

The rewrite step is not creative paraphrasing for its own sake.

Its job is to produce a more retrieval-effective query that preserves the user’s intent while sharpening the search core’s ability to retrieve relevant evidence.

### Rewrite Scope

The first version should allow the rewrite step to:

- tighten the role wording
- make must-have skills more explicit
- remove filler language
- emphasize the true target task or domain

The first version should not allow the rewrite step to:

- invent new user constraints
- silently broaden the search into a different role
- silently drop explicit must-haves

## Low-Confidence Shortlist

### Purpose

When bounded recovery still cannot reach a strong shortlist, the CLI should still try to be useful.

Instead of returning a hard stop immediately, it should return a low-confidence shortlist when there are at least some weakly relevant candidates worth inspection.

### Display Contract

Low-confidence shortlist output must be clearly separated from recommendation output.

It should present:

- `可先看的人`
- `为什么我还不能直接推荐`

The user should never confuse this state with:

- a final recommendation
- a high-confidence shortlist

### When Not To Emit

Do not emit a low-confidence shortlist if the candidates are effectively unrelated to the request. In that case the correct output is still an honest stop, but only after recovery has been attempted.

## CLI Presentation

The recovery loop should be visible to the user in a compact way.

The CLI should expose what it is doing without dumping internal prompts.

Examples of acceptable status framing:

- `当前不是没有人，而是结果对你的目标不够准。`
- `我还缺一个关键约束，先问你一句。`
- `你的目标已经够清楚，我先自动收敛检索再试一轮。`

The first version should avoid:

- generic “证据不足” with no explanation
- repeated vague clarification questions
- invisible retries that make the CLI feel random

## Architecture Boundary

The recovery loop belongs in the CLI agent orchestration and policy layer.

Likely touch points include:

- CLI workflow state machine
- agent policy
- recovery status rendering
- transcript/session state so recovery actions are visible in session history

The first version should not move the recovery decision down into the retriever itself.

That keeps the retrieval stack reusable and keeps the product behavior in the agent layer where it belongs.

## Testing And Verification

The first version should be accepted only if the behavior changes are observable, not just the prompts.

Acceptance criteria:

- when search returns zero or only weak matches, the CLI does not immediately terminate with `证据不足`
- when the goal is under-specified, the agent asks at most one targeted clarification question
- when the goal is already sufficiently specified, the agent performs one automatic query rewrite retry
- when recovery still fails to reach a strong result, the agent emits a low-confidence shortlist when weakly relevant candidates exist
- low-confidence shortlist output is clearly different from final recommendation output
- the recovery loop does not exceed the one-clarify / one-rewrite budget
- transcript or session state makes the recovery actions visible

## Implementation Notes

The first implementation should stay scoped to the CLI agent behavior layer.

Primary areas to inspect:

- `apps/worker/src/cli/workflow.ts`
- `apps/worker/src/cli/agent-policy.ts`
- `apps/worker/src/cli/tui.ts`
- `apps/worker/src/cli/renderer.ts`

The first version should not widen scope into:

- retriever algorithm redesign
- embedding pipeline redesign
- web UI parity
