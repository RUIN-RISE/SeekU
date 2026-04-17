# Phase 11 Acceptance Pass

Date: 2026-04-18
Phase: `11-bounded-mission-runner`
Plan: `04-PLAN`
Status: Pass for current bounded-search scope with small, explicit residual risk

## Goal

Confirm that the bounded mission runner now stops later, more honestly, and with chat/workboard framing that matches the actual mission posture.

## Baseline

Acceptance started from this verified local baseline:

- stop-policy hardening landed in commit `39f3211 feat(web): harden mission stop policy`
- follow-up mission-quality validation was added on top of that baseline
- one UI semantic mismatch was found during acceptance and fixed:
  - `ChatCopilotWorkboard` no longer treats a 1-person compare set as compare framing

## Commands Run

```bash
pnpm exec vitest run apps/web/src/hooks/__tests__/useChatSession.test.ts

pnpm exec vitest run \
  apps/web/src/lib/__tests__/chat-session.test.ts \
  apps/web/src/hooks/__tests__/useChatSession.test.ts \
  apps/web/src/hooks/__tests__/useAgentPanelSession.test.ts \
  apps/web/src/components/__tests__/AgentPanel.test.ts \
  apps/web/src/components/__tests__/ChatCopilotWorkboard.test.ts \
  apps/web/src/components/__tests__/DealFlowBoard.test.ts \
  apps/web/src/components/__tests__/Header.test.ts
```

## Result Snapshot

- `useChatSession` mission-quality suite: pass
- `apps/web` targeted regression suite: `41 / 41` pass
- no tested scenario populated `recommendedCandidate` prematurely
- chat stop summaries and workboard framing are aligned for the covered stop reasons

## Scenario Matrix

### Covered and passing

- `enough_compare`
  - blocked before exploration floor
  - allowed after exploration floor
  - reports compare-first rather than top1-first
- `enough_shortlist`
  - converging mission stops at shortlist-first
  - workboard stays in shortlist framing even if one strong candidate exists
- `low_marginal_gain`
  - thin but stable shortlist stops cleanly
  - workboard does not drift into recommendation framing
- `needs_user_clarification`
  - scattered late results stop at clarification instead of weak wrap-up
  - workboard copy asks for tighter direction
- `tighten` correction
  - mission stays in one mission object
  - correction count increments and flow completes
- `retarget` correction
  - mission stays in one mission object
  - `conditions_updated` event records `correctionType: retarget`
- `stop_or_pause_intent`
  - user can interrupt and ask for current results
  - mission stops cleanly and returns the current compare/shortlist posture

## Findings During Acceptance

### Fixed

- `ui_semantic_mismatch`
  - symptom:
    - `enough_shortlist` stop could render as `Compare set` when `activeCompareSet.length === 1`
  - fix:
    - compare framing now requires at least `2` compare candidates
  - result:
    - shortlist-first stop semantics now match chat and right rail

### Not observed in the acceptance batch

- `false_stop`
  - not reproduced in current deterministic mission scenarios
- `late_stop`
  - not reproduced in current deterministic mission scenarios
- `wrong_stage_report`
  - not reproduced after the workboard compare-framing fix

## Acceptance Checklist

- [x] The mission does not auto-stop at round `2` solely because compare is technically possible.
- [x] Automatic stop defaults to `shortlist / compare first` rather than premature `top1`.
- [x] `recommendedCandidate` remains withheld in the covered reportable-but-not-final scenarios.
- [x] Noisy missions stop at `needs_user_clarification` instead of weak recommendation posture.
- [x] Mid-mission corrections stay inside one coherent mission object.
- [x] User stop/pause intent produces an explicit, user-readable stop summary.
- [x] Chat and workboard framing agree for the covered stop reasons.
- [x] Targeted `apps/web` regressions remain green.

## Residual Risks

- acceptance still relies on deterministic mocked search rounds rather than replaying real search distributions
- stop quality is covered for the first bounded search mission type only
- saved posture for `Q4`, `Q6`, and `Q8` remains a carry-forward guardrail from prior milestones, but this acceptance pass did not rerun worker-side search evals because the current changes were isolated to the web mission layer

## Verdict

Phase 11 is acceptable for the current bounded foreground search-mission scope.

The recommended next move is:

- write the Phase 11 summary and treat the mission-stop hardening work as acceptance-ready

The recommended non-move is:

- do not add another round of speculative stop-policy branches unless a future replay batch reproduces a repeated `false_stop`, `late_stop`, or `wrong_stage_report` pattern.
