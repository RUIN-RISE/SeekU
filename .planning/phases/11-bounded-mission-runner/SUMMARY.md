---
phase: "11"
status: completed
started: "2026-04-17"
completed: "2026-04-18"
plans_total: 4
plans_complete: 4
---

# Phase 11: Bounded Mission Runner — Summary

## One-liner

Seeku now has a bounded foreground mission runner inside the chat-first copilot: large-scope candidate search can run for multiple rounds in one session, accept natural-language course correction, and stop explicitly with shortlist-first, compare-first, low-marginal-gain, or clarification posture instead of premature recommendation.

## What Was Built

### 01-PLAN: Mission Object, Session Attachment, And Bounded State Machine Foundation

- Added a first-class mission object to the chat session flow with:
  - `missionId`
  - goal
  - phase
  - status
  - round count
  - timestamps
  - stop reason
  - correction history
- Kept the mission attached to the active session instead of introducing a second top-level runtime surface.
- Preserved the first-version guardrail of one active mission per session.
- Implemented the bounded mission phases:
  - `running_search`
  - `narrowing`
  - `comparing`
  - `summarizing`
  - `stopped`

### 02-PLAN: Mission Loop Policy, Stop Rules, And Course-Correction Protocol

- Implemented a bounded multi-round search loop inside `useChatSession`.
- Extracted stop semantics into a dedicated helper:
  - `apps/web/src/hooks/mission-stop-policy.ts`
- Hardened stop behavior so that:
  - auto-stop is blocked before the exploration floor
  - `reportable` is distinct from `recommendable`
  - default stop posture is `shortlist / compare first`
  - scattered missions route to `needs_user_clarification`
- Added typed course-correction handling for:
  - `tighten`
  - `retarget`
  - `stop_or_pause_intent`

### 03-PLAN: Mission UI Framing Inside Chat And Workboard

- Reused the chat-first copilot surface instead of building a separate mission dashboard.
- Kept mission progression visible in chat with explicit start, convergence, correction, and stop summaries.
- Mapped mission posture into the narrated workboard so `Now`, `Why`, `Movement`, and `Focus` reflect mission state.
- Preserved recommendation honesty by defaulting the right rail to shortlist/compare framing when the mission is only reportable.
- Fixed a UI semantic mismatch found during acceptance:
  - `ChatCopilotWorkboard` no longer renders compare framing for a 1-person compare set

### 04-PLAN: Regression Coverage, Stop-Quality Verification, And Milestone Acceptance

- Added higher-signal mission-quality coverage for:
  - exploration-floor gating
  - compare-first stopping
  - shortlist-first stopping
  - low-marginal-gain stopping
  - clarification stopping
  - user stop/pause intent
  - mid-mission `tighten` correction
  - mid-mission `retarget` correction
- Added workboard regression coverage proving stop semantics render honestly on the right rail.
- Recorded the overnight mission-quality execution package in:
  - `.planning/phases/11-bounded-mission-runner/11-04-MISSION-QUALITY-LONG-TASK-2026-04-18.md`
- Recorded phase acceptance in:
  - `.planning/phases/11-bounded-mission-runner/ACCEPTANCE-2026-04-18.md`

## Requirements Closed

- bounded foreground mission attached to the current chat session
- one-active-mission-per-session guardrail
- bounded multi-round mission loop with explicit stop reasons
- natural-language mission correction without spawning a parallel mission
- shortlist-first / compare-first stop posture instead of premature top1
- explicit clarification stop when the mission remains noisy
- aligned chat and right-rail mission framing
- mission-quality regression coverage and acceptance evidence

## Verification

- `pnpm exec vitest run apps/web/src/hooks/__tests__/useChatSession.test.ts`
- `pnpm exec vitest run apps/web/src/components/__tests__/ChatCopilotWorkboard.test.ts`
- `pnpm exec vitest run apps/web/src/lib/__tests__/chat-session.test.ts apps/web/src/hooks/__tests__/useChatSession.test.ts apps/web/src/hooks/__tests__/useAgentPanelSession.test.ts apps/web/src/components/__tests__/AgentPanel.test.ts apps/web/src/components/__tests__/ChatCopilotWorkboard.test.ts apps/web/src/components/__tests__/DealFlowBoard.test.ts apps/web/src/components/__tests__/Header.test.ts`
- final targeted web regression posture:
  - test files: `7 / 7` pass
  - tests: `43 / 43` pass

## Key Decisions

1. Keep the mission runner foreground-bound inside the chat-first surface rather than turning it into background automation.
2. Separate `reportable` from `recommendable` so the product can stop honestly without pretending it has a final answer.
3. Use explicit stop reasons and readable summary copy instead of opaque convergence heuristics alone.
4. Treat natural-language interruptions as mission corrections on the same mission object, not as a second workflow.
5. Fix semantic mismatches in the UI layer rather than compensating with more stop-policy branches.

## Files Added Or Extended

- `apps/web/src/hooks/useChatSession.ts`
- `apps/web/src/hooks/mission-stop-policy.ts`
- `apps/web/src/hooks/__tests__/useChatSession.test.ts`
- `apps/web/src/components/ChatCopilotWorkboard.tsx`
- `apps/web/src/components/__tests__/ChatCopilotWorkboard.test.ts`
- `.planning/phases/11-bounded-mission-runner/11-04-MISSION-QUALITY-LONG-TASK-2026-04-18.md`
- `.planning/phases/11-bounded-mission-runner/ACCEPTANCE-2026-04-18.md`

## Deferred / Watch Items

- acceptance currently relies on deterministic replay-style mission scenarios rather than replaying live search distributions
- the bounded mission runner is only accepted for the first mission type:
  - large-scope candidate search
- no background continuation, multi-mission management, or durable task history is part of this phase
- worker-side search eval suites (`Q4/Q6/Q8`) remain a carry-forward milestone guardrail and were not rerun in this web-scoped acceptance pass

## Closeout

- Phase 11 is complete.
- Milestone `v1.5 Chat-First Copilot` now has both:
  - the chat-first surface
  - the bounded foreground mission runner
- The next route should be milestone-level wrap-up, archival, or definition of the next milestone rather than extending Phase 11 ad hoc.
