---
phase: "12"
status: completed
started: "2026-04-18"
completed: "2026-04-18"
plans_total: 4
plans_complete: 4
---

# Phase 12: Mission Replay Hardening — Summary

## One-liner

Seeku now has a first replay-backed quality gate for the shipped bounded mission runner: mission stop scenarios are expressed as reusable replay cases, classified by explicit failure buckets, and can drive bounded semantic fixes without reopening product scope.

## What Was Built

### 01-PLAN: Replay Case Inventory, Fixture Format, And Harness Foundation

- Added a reusable mission replay case format covering:
  - prompt
  - per-round candidate inputs
  - expected stop posture
  - expected rendered framing
- Extracted key bounded-mission scenarios into a shared fixture file:
  - `apps/web/src/hooks/__tests__/mission-replay-fixtures.ts`
- Replaced several branch-heavy hook test paths with replay-driven `it.each(...)` coverage.

### 02-PLAN: Replay Runner, Failure Taxonomy, And Evidence Capture

- Extended replay cases with expected phase and uncertainty posture.
- Added structured replay evidence capture for:
  - stop reason
  - mission phase
  - final assistant summary
  - uncertainty copy
  - shortlist size
  - compare size
- Added explicit replay mismatch buckets:
  - `false_stop`
  - `late_stop`
  - `wrong_stage_report`
  - `ui_semantic_mismatch`

### 03-PLAN: Replay-Driven Semantic Fixes And Stop-Quality Alignment

- Used replay-driven reasoning to identify a workboard semantic mismatch:
  - clarification stops could still visually drift into shortlist framing
- Applied a bounded UI-layer fix in `ChatCopilotWorkboard` so `needs_user_clarification` prioritizes `Goal summary` and a direction-tightening prompt.
- Added regression coverage confirming the workboard no longer shows shortlist-first focus in that stop posture.

### 04-PLAN: Replay-Backed Acceptance, Residual-Risk Report, And Milestone Close

- Recorded replay-backed acceptance in:
  - `.planning/phases/12-mission-replay-hardening/ACCEPTANCE-2026-04-18.md`
- Documented current residual risks and gave an explicit `Go` verdict for the current replay-hardening scope.

## Requirements Closed

- `REPLAY-01` through `REPLAY-04`
- `GATE-01` through `GATE-04`
- `SCOPE-01`
- `SCOPE-02`

## Verification

- `pnpm exec vitest run apps/web/src/hooks/__tests__/useChatSession.test.ts`
- `pnpm exec vitest run apps/web/src/components/__tests__/ChatCopilotWorkboard.test.ts apps/web/src/hooks/__tests__/useChatSession.test.ts`
- `pnpm exec vitest run apps/web/src/lib/__tests__/chat-session.test.ts apps/web/src/hooks/__tests__/useChatSession.test.ts apps/web/src/hooks/__tests__/useAgentPanelSession.test.ts apps/web/src/components/__tests__/AgentPanel.test.ts apps/web/src/components/__tests__/ChatCopilotWorkboard.test.ts apps/web/src/components/__tests__/DealFlowBoard.test.ts apps/web/src/components/__tests__/Header.test.ts`
- final targeted web regression posture:
  - test files: `7 / 7` pass
  - tests: `43 / 43` pass

## Key Decisions

1. Move mission-quality checks toward replay fixtures before widening product scope.
2. Make failure taxonomy explicit instead of burying mismatch meaning in one-off assertions.
3. Prefer bounded semantic fixes over speculative stop-policy branching.
4. Keep Phase 12 scoped to the shipped first mission type and avoid turning replay hardening into product expansion.

## Files Added Or Extended

- `apps/web/src/hooks/__tests__/mission-replay-fixtures.ts`
- `apps/web/src/hooks/__tests__/useChatSession.test.ts`
- `apps/web/src/components/ChatCopilotWorkboard.tsx`
- `apps/web/src/components/__tests__/ChatCopilotWorkboard.test.ts`
- `.planning/phases/12-mission-replay-hardening/01-SUMMARY.md`
- `.planning/phases/12-mission-replay-hardening/02-SUMMARY.md`
- `.planning/phases/12-mission-replay-hardening/03-SUMMARY.md`
- `.planning/phases/12-mission-replay-hardening/ACCEPTANCE-2026-04-18.md`

## Deferred / Watch Items

- replay cases are still deterministic fixtures rather than harvested live-search replays
- replay evidence is still test-local rather than emitted as a standalone machine-readable artifact
- correction scenarios such as `retarget` and `stop_or_pause_intent` are still covered outside the shared replay-case inventory

## Closeout

- Phase 12 is complete.
- The next route should be milestone-level closeout for `v1.6 Mission Replay Hardening`, not further ad hoc expansion of replay scope.
