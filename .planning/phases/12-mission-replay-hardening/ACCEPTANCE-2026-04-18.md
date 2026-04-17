# Phase 12 Acceptance Pass

Date: 2026-04-18
Phase: `12-mission-replay-hardening`
Plan: `04-PLAN`
Status: Go for the current replay-hardening scope

## Goal

Confirm that the shipped bounded mission runner now has a replay-backed quality gate that is strong enough for the current mission scope and that replay-driven semantic fixes can be applied without reopening product scope.

## Baseline

Acceptance started from this shipped baseline:

- `v1.5 Chat-First Copilot` archived and accepted
- bounded mission runner already accepted for the first bounded search scope
- deterministic mission-quality coverage already existed for key stop reasons

Phase 12 acceptance was intended to answer a narrower question:

- can Seeku express those mission-quality checks as replay-style cases with explicit failure buckets and use them to drive bounded semantic fixes?

## Replay Coverage

Replay-backed cases currently cover:

- `compare-ready-search`
  - expected stop: `enough_compare`
  - expected focus: `compare`
- `converging-shortlist`
  - expected stop: `enough_shortlist`
  - expected focus: `shortlist`
- `thin-but-stable`
  - expected stop: `low_marginal_gain`
  - expected focus: `shortlist`
- `scattered-clarification`
  - expected stop: `needs_user_clarification`
  - expected focus: `clarification`

Related non-replay hook coverage also remains in place for:

- `tighten` correction
- `retarget` correction
- `stop_or_pause_intent`

## Evidence Model

Replay validation now captures:

- actual stop reason
- actual mission phase
- final assistant summary
- uncertainty copy
- shortlist size
- compare size

Mismatch buckets are explicit:

- `false_stop`
- `late_stop`
- `wrong_stage_report`
- `ui_semantic_mismatch`

## Replay-Driven Fixes Applied

### Fixed

- `ui_semantic_mismatch`
  - symptom:
    - clarification stops could still present shortlist-first focus because shortlist data existed
  - fix:
    - `ChatCopilotWorkboard` now prioritizes `Goal summary` when `mission.stopReason === "needs_user_clarification"`
  - result:
    - right-rail framing now matches clarification-stop posture instead of drifting toward shortlist review

## Current Verdict By Bucket

- `false_stop`: not observed in the replay-backed cases
- `late_stop`: not observed in the replay-backed cases
- `wrong_stage_report`: not observed in the replay-backed cases
- `ui_semantic_mismatch`: reproduced once during Phase 12, fixed locally, no longer reproduces in current replay-backed regression coverage

## Commands Run

```bash
pnpm exec vitest run apps/web/src/hooks/__tests__/useChatSession.test.ts

pnpm exec vitest run apps/web/src/components/__tests__/ChatCopilotWorkboard.test.ts apps/web/src/hooks/__tests__/useChatSession.test.ts

pnpm exec vitest run apps/web/src/lib/__tests__/chat-session.test.ts apps/web/src/hooks/__tests__/useChatSession.test.ts apps/web/src/hooks/__tests__/useAgentPanelSession.test.ts apps/web/src/components/__tests__/AgentPanel.test.ts apps/web/src/components/__tests__/ChatCopilotWorkboard.test.ts apps/web/src/components/__tests__/DealFlowBoard.test.ts apps/web/src/components/__tests__/Header.test.ts
```

## Result Snapshot

- replay-backed hook suite: pass
- clarification-stop workboard regression: pass
- targeted web regression posture: `7 / 7` files, `43 / 43` tests pass

## Residual Risks

- replay cases are still deterministic fixtures, not harvested live-search replays
- replay coverage is still concentrated on the first bounded mission type only:
  - large-scope candidate search
- replay evidence is currently captured inside tests and helpers rather than emitted as a standalone report artifact
- non-replay correction scenarios remain valuable but are not yet expressed in the shared replay-case format

## Verdict

`Go` for the current replay-hardening scope.

Reason:

- replay cases now exist as first-class fixtures
- replay evidence and mismatch buckets are explicit
- at least one replay-driven semantic mismatch was found and fixed without broadening scope
- targeted regressions remain green

## Recommended Next Route

- close milestone `v1.6 Mission Replay Hardening` once Phase 12 summary is written

## Recommended Non-Route

- do not broaden into new mission types, background continuation, or CRM-style workflow from this phase
- do not add new stop-policy branches unless future replay evidence reproduces a repeated failure bucket
