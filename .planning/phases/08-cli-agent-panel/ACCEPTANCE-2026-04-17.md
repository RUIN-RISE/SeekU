# Phase 08 Acceptance Pass

Date: 2026-04-17
Phase: `08-cli-agent-panel`
Plan: `04-PLAN`
Status: Pass with known pre-existing web typecheck debt outside the agent-panel scope

## Goal

Confirm the visible copilot milestone degrades safely, preserves authoritative runtime state, and does not regress the shipped Phase 7 search-agent quality bar.

## Commands Run

```bash
pnpm exec vitest run \
  apps/web/src/hooks/__tests__/useAgentPanelSession.test.ts \
  apps/web/src/components/__tests__/AgentPanel.test.ts \
  apps/worker/src/cli/__tests__/agent-session-bridge.test.ts

pnpm exec vitest run \
  apps/worker/src/cli/__tests__/agent-eval.test.ts \
  apps/worker/src/cli/__tests__/workflow-session-events.test.ts \
  apps/worker/src/cli/__tests__/workflow.test.ts \
  apps/worker/src/cli/__tests__/agent-state.test.ts

pnpm exec tsx apps/worker/src/cli.ts agent-eval --json

pnpm --filter @seeku/worker typecheck
pnpm --filter @seeku/web typecheck
```

## Result Snapshot

- web hook/component hardening tests: pass
- worker regression and policy tests: pass
- `agent-eval` acceptance fixtures: `12 / 12` pass
- `agent-eval` saved regressions:
  - `Q4`: pass as `watch-but-stable`
  - `Q6`: pass
  - `Q8`: pass
- `@seeku/worker` typecheck: pass
- `@seeku/web` typecheck: fails on pre-existing issues outside the agent-panel files:
  - `apps/web/src/components/CandidateDetailModal.tsx`
  - `apps/web/src/components/ClaimForm.tsx`

## Acceptance Checklist

- [x] Disconnect state keeps the last authoritative snapshot visible while the panel marks the stream as interrupted.
- [x] Reconnect path transitions through an explicit reconnecting state and returns to live once SSE resumes.
- [x] Missing-session recovery is handled both on first load and after a reconnect attempt.
- [x] Rejected interventions keep frontend state aligned to the runtime-provided snapshot instead of optimistic local drift.
- [x] Removing a recommended shortlist candidate through the panel clears stale compare membership and recommendation state.
- [x] Phase 7 compare gating and recommendation honesty remain covered by worker policy tests and the acceptance harness.
- [x] Saved regression posture remains intact for `Q4`, `Q6`, and `Q8`.

## Notes

- This pass closes the implementation scope of milestone `v1.3 Visible Agent Copilot`.
- Remaining web typecheck failures are older repo debt and were not introduced by the panel hardening work.
