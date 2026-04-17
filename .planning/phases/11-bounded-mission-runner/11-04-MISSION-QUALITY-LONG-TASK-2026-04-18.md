# Mission Quality Long Task

Date: 2026-04-18
Owner: Codex
Mode: Overnight long run
Status: planned

## Objective

Turn Phase 11 from "rule-correct in local tests" into "acceptance-ready under realistic mission behavior" by running a deeper mission-quality batch around stop timing, report framing, and chat/workboard consistency.

This long task is specifically for the current state where:

- the bounded mission runner is already implemented
- stop-policy hardening landed in commit `39f3211`
- local regression tests are green
- the remaining risk has shifted from missing branches to misaligned mission quality under more realistic task shapes

## Verified Baseline

Verified local baseline at long-task start:

- `39f3211 feat(web): harden mission stop policy` is the latest committed product change for stop policy
- local follow-up validation added higher-signal mission-quality tests for:
  - `enough_shortlist`
  - `enough_compare`
  - `low_marginal_gain`
  - `needs_user_clarification`
- a UI semantic mismatch was found during validation and fixed locally:
  - `ChatCopilotWorkboard` now requires at least `2` candidates before using compare framing
- current targeted web regression status:
  - `apps/web` test suite: `41 / 41` passing

Primary references:

- `.planning/phases/11-bounded-mission-runner/04-PLAN.md`
- `docs/superpowers/specs/2026-04-17-bounded-mission-runner-design.md`
- `docs/superpowers/specs/2026-04-17-mission-stop-policy-design.md`
- `apps/web/src/hooks/mission-stop-policy.ts`
- `apps/web/src/hooks/useChatSession.ts`
- `apps/web/src/components/ChatCopilotWorkboard.tsx`

## Why This Long Task Exists

The next quality gap is no longer "does the runner stop at all" or "does each stop reason have one unit test."

The next gap is whether the bounded mission feels like a reliable operator-facing collaborator across realistic task shapes:

- does it stop too early
- does it stop too late
- does it report at the wrong stage
- does the chat summary agree with the right rail
- does course correction preserve one coherent mission

This task is designed to answer those questions before adding more stop-policy rules.

## Scope

In scope:

- realistic mission-quality scenario design
- deterministic replay or fixture-driven mission validation
- stop-reason to UI-framing consistency checks
- acceptance reporting for Phase 11 quality gates
- minimal corrective fixes only when validation finds repeated semantic errors

Out of scope:

- new mission types
- background jobs or durable queues
- adding more stop-policy branches without repeated evidence
- CRM, outreach, memory, or right-rail controls
- reopening corpus expansion or search-quality discovery work

## Task Shapes To Cover

The overnight batch should cover at least these mission shapes:

1. Converging search:
   - enough evidence for a reportable shortlist
   - should stop at `shortlist first`, not jump to `top1`
2. Compare-ready search:
   - enough evidence for side-by-side comparison
   - should stop at `compare first`, not recommendation
3. Thin but stable search:
   - shortlist stops improving materially
   - should stop at `low_marginal_gain`
4. Scattered search:
   - exploration continues but results stay noisy
   - should stop at `needs_user_clarification`
5. Course correction:
   - user tightens or retargets mid-mission
   - mission should stay coherent instead of spawning a second flow
6. User stop/pause intent:
   - user asks to stop and show current results
   - system should stop cleanly and summarize current posture
7. UI framing sync:
   - workboard `Focus` and `Why` should match the mission stop reason
   - no single-candidate compare framing

## Workstreams

### Workstream A: Scenario Pack And Replay Harness

Goal:

- turn current hand-written happy-path tests into a reusable mission-quality scenario pack
- make each case explicit about:
  - prompt shape
  - per-round search responses
  - expected stop reason
  - expected chat framing
  - expected workboard framing

Write scope:

- `apps/web/src/hooks/__tests__/useChatSession.test.ts`
- optional new helper or fixture file under `apps/web/src/hooks/__tests__/`

Success criteria:

- each key task shape has a deterministic scenario
- scenario intent is readable without reverse-engineering mock branches

### Workstream B: Stop Semantics And UI Alignment

Goal:

- verify that mission stop semantics are rendered honestly in the workboard
- ensure `shortlist`, `compare`, and `clarification` framing stay aligned with actual stop posture

Write scope:

- `apps/web/src/components/ChatCopilotWorkboard.tsx`
- `apps/web/src/components/__tests__/ChatCopilotWorkboard.test.ts`

Success criteria:

- `enough_shortlist` never renders as compare because of a 1-person compare set
- `low_marginal_gain` still reads as shortlist-first, not recommendation
- `needs_user_clarification` reads as blocked direction, not weak recommendation

### Workstream C: Acceptance Matrix And Residual Risk Report

Goal:

- produce a dated acceptance artifact for Phase 11
- classify validation findings into:
  - `false_stop`
  - `late_stop`
  - `wrong_stage_report`
  - `ui_semantic_mismatch`
- record whether each issue was fixed, deferred, or judged acceptable for v1

Write scope:

- `.planning/phases/11-bounded-mission-runner/ACCEPTANCE-2026-04-18.md`

Success criteria:

- one acceptance doc exists with explicit verdict
- all tested mission shapes are summarized in one matrix
- residual risks are concrete and bounded

### Workstream D: Phase 11 Closeout Recommendation

Goal:

- decide whether Phase 11 can be treated as acceptance-ready after the mission-quality batch
- if not, produce the smallest coherent follow-up instead of reopening broad design

Write scope:

- `.planning/phases/11-bounded-mission-runner/SUMMARY.md` if and only if acceptance is achieved
- otherwise append follow-up recommendation to `.planning/phases/11-bounded-mission-runner/ACCEPTANCE-2026-04-18.md`

Success criteria:

- next route is unambiguous:
  - `accept and summarize`
  - or `create one follow-up batch`

## Coordination Rules

1. Bias toward additive verification before policy edits.
2. Do not add a new stop-policy branch unless the same failure mode repeats across multiple realistic scenarios.
3. Preserve the existing honesty posture:
   - no premature `top1`
   - no compare without enough candidates
   - no fake confidence when direction remains noisy
4. Keep the mission single-session and foreground-bound.
5. Prefer small semantic fixes over broad refactors.
6. Do not rewrite planning history; add dated acceptance artifacts instead.

## Suggested Execution Order

1. Freeze current local baseline and rerun the existing `apps/web` suite.
2. Expand the mission-quality scenario pack.
3. Run the scenario pack and inspect failures by bucket instead of by file.
4. Apply only minimal fixes required by repeated failures.
5. Re-run the full `apps/web` suite.
6. Write the acceptance matrix and residual-risk note.
7. Decide whether Phase 11 is summary-ready.

## Verification Commands

Primary commands:

```bash
pnpm exec vitest run apps/web/src/hooks/__tests__/useChatSession.test.ts
pnpm exec vitest run apps/web/src/components/__tests__/ChatCopilotWorkboard.test.ts
pnpm exec vitest run \
  apps/web/src/lib/__tests__/chat-session.test.ts \
  apps/web/src/hooks/__tests__/useChatSession.test.ts \
  apps/web/src/hooks/__tests__/useAgentPanelSession.test.ts \
  apps/web/src/components/__tests__/AgentPanel.test.ts \
  apps/web/src/components/__tests__/ChatCopilotWorkboard.test.ts \
  apps/web/src/components/__tests__/DealFlowBoard.test.ts \
  apps/web/src/components/__tests__/Header.test.ts
```

Optional follow-up if the overnight batch adds broader coverage:

```bash
pnpm exec tsc -p apps/web/tsconfig.json --noEmit
```

## Acceptance Gates

This long task is successful only if all are true:

1. Each mission stop reason has at least one realistic, deterministic scenario.
2. Chat summaries and workboard framing agree for each tested stop reason.
3. No tested scenario recommends a top candidate before compare gating is satisfied.
4. Mid-mission correction remains inside one coherent mission object.
5. Targeted `apps/web` regressions remain green after fixes.
6. A dated acceptance artifact exists with explicit go or hold recommendation for Phase 11.

## Stop Rules

Stop with `go` if:

- mission-quality coverage is strong enough
- failures are either fixed or explicitly low-risk
- the phase can be summarized without inventing another rule pass

Stop with `hold` if:

- repeated `false_stop`, `late_stop`, or `wrong_stage_report` failures remain
- UI framing and mission semantics still diverge after bounded fixes

Stop immediately and do not expand scope if:

- the batch starts requiring new mission types
- the fixes would introduce background orchestration or durable task concepts
- the work drifts into search-quality or corpus-quality debugging instead of mission behavior

## Expected End State

Best case:

- Phase 11 gets a clean acceptance package with realistic mission-quality evidence
- any remaining debt is explicitly bounded and non-blocking

Fallback case:

- one small follow-up batch is defined with precise failure buckets
- the product avoids another round of speculative stop-policy tuning
