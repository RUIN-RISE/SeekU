# Graph Signals Phase 2b Execution Plan

Date: 2026-05-03
Project: Seeku
Status: Draft for execution
Depends on:
- [graph-rag-phase-1-implementation-report.md](/Users/rosscai/seeku/docs/proposals/graph-rag-phase-1-implementation-report.md)
- [graph-rag-phase-2-implementation-report.md](/Users/rosscai/seeku/docs/proposals/graph-rag-phase-2-implementation-report.md)

## Goal

Verify and finish the **minimal memory wiring** path for the interactive Seeku CLI, reusing the existing in-repo memory system.

Phase 2b is intentionally narrow:

1. verify what is already wired
2. fix only real gaps
3. prove behavior with tests and a written implementation report

This phase is **not** a greenfield memory build, and it must not expand into reranking, graph modeling, or `memU`.

## Important Current-State Note

Before writing any code, treat the following as a hypothesis that must be verified against the live codebase:

- `workflow.ts` already appears to call `runMemoryBootstrap()` at session start
- seeded memory conditions already appear to merge into `runClarifyLoop()`
- explicit preference capture already appears to run before search
- shortlist removal already appears to record negative candidate feedback
- inferred preference generation already appears to exist for repeated negative patterns
- memory overlay/management already appears to be reachable from launcher and shortlist flows

Because of this, Phase 2b should start with **verification-first**, not “implement from scratch”.

## Non-Goals

- no `memU`
- no GraphTranslator
- no GraphSAGE / Node2Vec / graph embedding work
- no graph-aware reranking
- no production ranking logic changes
- no broad retrieval refactor
- no silent memory adoption without explicit user choice
- no inferred preference defaulting during bootstrap
- no one-shot CLI redesign unless a concrete bug proves it is required

## Required Deliverables

Phase 2b is complete only when all of the following exist:

1. verified statement of what memory wiring already exists
2. code fixes for any real missing wiring or broken behavior
3. tests covering the verified Phase 2b behavior
4. a written implementation report

Recommended output file:

- `docs/proposals/graph-rag-phase-2b-implementation-report.md`

Likely code areas:

- `apps/worker/src/cli/workflow.ts`
- `apps/worker/src/cli/memory-bootstrap.ts`
- `apps/worker/src/cli/preference-capture.ts`
- `apps/worker/src/cli/feedback-capture.ts`
- `apps/worker/src/cli/shortlist-controller.ts`
- `apps/worker/src/cli/index.ts`
- `apps/worker/src/cli/__tests__/`

## Success Criteria

We should be able to prove, with code references and tests:

1. memory bootstrap is offered only in the interactive workflow when memory exists and is not paused
2. explicit memory can be adopted as defaults, and user input still overrides it
3. inferred memory is visible during bootstrap but is **not** seeded into defaults
4. explicit preferences can be captured from user-stated clarify/refine text
5. shortlist negative feedback is persisted as candidate feedback events
6. repeated negative feedback can create inferred preferences under the documented threshold rules
7. pause/resume disables both memory usage and memory capture paths
8. if a search path intentionally does **not** use memory, that boundary is documented explicitly

## Decision Gates

### Phase 2b is successful if

- the interactive CLI memory loop is verified end-to-end
- any remaining gaps are small and closed without changing product scope
- behavior is documented clearly enough that future phases do not re-litigate memory status

### Stop or narrow further if

- the remaining issues are mostly UX polish rather than wiring gaps
- the only missing path is outside the agreed interactive CLI scope
- fixing a gap would require changing ranking or query planning behavior beyond seeded defaults

## Workstreams

### Workstream A: Verification First

Goal:
- determine what Phase 2b work is already done in code

Tasks:
1. inspect session-start bootstrap flow
2. inspect clarify/refine preference capture flow
3. inspect shortlist feedback capture flow
4. inspect pause/resume guards
5. inspect launcher and overlay entrypoints

Questions to answer:
- is Phase 2b mostly already implemented?
- which behaviors are code-complete but undocumented?
- which behaviors are tested vs untested?

Acceptance criteria:
- a concise “already present vs missing” inventory exists before edits begin

### Workstream B: Bootstrap Behavior Verification

Goal:
- validate the session-start memory adoption path

Tasks:
1. verify `runMemoryBootstrap()` is called from the interactive workflow
2. verify bootstrap is skipped when memory is paused
3. verify bootstrap is skipped when no preferences exist
4. verify explicit preferences seed defaults
5. verify inferred preferences are shown but not defaulted
6. verify empty input or ignore path does not seed memory

Acceptance criteria:
- bootstrap behavior is covered by tests or expanded tests

### Workstream C: Explicit Preference Capture

Goal:
- confirm that user-stated preferences are captured without polluting memory from carried-forward state

Tasks:
1. verify extraction is based on user utterance text, not accumulated conditions
2. verify capture prompt appears only for non-empty explicit candidates
3. verify confirmed preferences persist as `source = explicit`
4. verify rejected or skipped capture does not change current session behavior

Acceptance criteria:
- tests prove “explicit only” capture semantics

### Workstream D: Feedback And Inference

Goal:
- confirm that shortlist feedback creates usable memory signals

Tasks:
1. verify negative shortlist removal records candidate feedback events
2. verify optional reason capture behaves correctly
3. verify inference threshold logic is enforced
4. verify inferred preferences never overwrite conflicting explicit preferences
5. verify inferred preferences expire as designed

Acceptance criteria:
- tests or manual verification prove the event-to-inference path

### Workstream E: Gap Fixes Only

Goal:
- patch real missing or broken wiring, without widening scope

Examples of acceptable fixes:

- a bootstrap call is present but not reachable
- a pause/resume guard is missing in one path
- preference capture is invoked at the wrong moment
- feedback is recorded but inference never runs
- tests are missing for already-implemented behavior

Examples of unacceptable scope creep:

- adding rerank logic
- changing retrieval ordering based on memory
- rewriting intent parsing with LLMs
- extending memory to unrelated surfaces without a verified need

Acceptance criteria:
- only Phase 2b-scoped fixes are landed

### Workstream F: Report And Boundary Clarification

Goal:
- leave behind a stable source of truth for memory status

The implementation report should state:

1. what was already present before Phase 2b execution
2. what code changed during Phase 2b
3. what behaviors are now verified
4. what remains intentionally out of scope
5. whether Phase 2b is complete or partially complete

Acceptance criteria:
- future reviewers can answer “is memory wired yet?” from one document

## Suggested Execution Order

1. verification inventory
2. bootstrap verification
3. explicit preference capture verification
4. feedback/inference verification
5. minimal code fixes
6. targeted tests
7. implementation report

Why this order:

- current evidence suggests memory wiring may already exist
- verification first avoids duplicate implementation
- tests should reflect the verified contract, not guessed requirements

## Scope Boundary Clarification

### In scope for Phase 2b

- interactive CLI memory bootstrap
- explicit preference capture
- candidate feedback recording
- inferred preference generation from repeated feedback
- pause/resume memory controls
- tests and implementation report

### Out of scope for Phase 2b

- graph-aware reranking
- graph embeddings
- memory-driven proactive recommendation delivery
- `memU`
- large UX redesign
- extending memory to every non-interactive entrypoint unless specifically required

## Reporting Rules

- distinguish **already implemented** from **implemented in this phase**
- prefer exact file/function references over broad claims
- do not claim one-shot `search-cli.ts` is memory-aware unless verified
- do not widen “memory wired” to mean reranking or personalization is complete
- preserve the product rule: explicit memory can seed defaults, but user input wins
- preserve the product rule: inferred memory is informational during bootstrap, not silently defaulted
