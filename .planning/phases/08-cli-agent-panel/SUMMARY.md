---
phase: "08"
status: completed
started: "2026-04-16"
completed: "2026-04-17"
plans_total: 4
plans_complete: 4
---

# Phase 08: CLI Agent Panel — Summary

## One-liner

Seeku now has a visible local copilot surface for the CLI search agent: the runtime emits structured session events, a local bridge exposes them to the browser, and a bounded web panel visualizes and lightly steers the session without becoming a second source of truth.

## What Was Built

### 01-PLAN: Event Runtime And Session Snapshot Foundation

- Added structured session snapshot and delta event emission on top of the shipped CLI search-agent runtime.
- Serialized authoritative runtime state for:
  - user goal
  - normalized conditions
  - shortlist
  - compare set
  - confidence status
  - recommendation
  - open uncertainties
- Added deterministic event envelopes and stable sequencing for browser-facing consumption.

### 02-PLAN: Local API Bridge For Streaming And Interventions

- Added in-memory session bridge registration for active CLI runtimes.
- Added local API routes for:
  - `GET /agent-panel/:sessionId/events`
  - `POST /agent-panel/:sessionId/interventions`
- Kept interventions tightly bounded to:
  - `add_to_compare`
  - `remove_from_shortlist`
  - `expand_evidence`
  - predefined `apply_feedback(tag)`

### 03-PLAN: Web Copilot Panel And Derived UI State

- Added `/agent-panel/[sessionId]` route in `apps/web`.
- Built a dual-column visible copilot surface with:
  - conversation rail
  - execution feed
  - next-step bar
  - session snapshot
  - shortlist panel
  - compare panel
  - recommendation and uncertainty panel
- Kept the panel as a pure derived view from snapshot + SSE deltas instead of frontend-owned business state.

### 04-PLAN: Hardening, Disconnect Handling, And Regression Coverage

- Added explicit disconnect, reconnecting, and missing-session handling in the session hook and UI.
- Ensured rejected interventions reconcile to runtime-provided snapshots instead of optimistic UI mutation.
- Added regression coverage proving panel-side shortlist actions do not leave stale compare membership or stale recommendations behind.
- Recorded milestone acceptance in:
  - `.planning/phases/08-cli-agent-panel/ACCEPTANCE-2026-04-17.md`

## Requirements Closed

- `PANEL-01`: structured CLI snapshot and delta events
- `PANEL-02`: local SSE + POST bridge for active session interaction
- `PANEL-03`: dual-column web copilot layout
- `PANEL-04`: bounded first-version intervention surface
- `PANEL-05`: frontend remains a derived view only; runtime stays authoritative
- `PANEL-06`: graceful handling for disconnect, rejection, and missing-session states
- `PANEL-07`: preserved Phase 7 quality bar on `Q4/Q6/Q8`

## Verification

- API and worker bridge tests passed for event routing and intervention outcomes.
- Web panel tests passed for:
  - snapshot hydration
  - event application
  - disconnect / reconnect behavior
  - missing-session rendering
  - authoritative rejection handling
- Worker regression tests passed for:
  - compare gating
  - recommendation honesty
  - panel-side shortlist removal clearing stale recommendation state
- `agent-eval --json` passed with:
  - acceptance: `12 / 12`
  - regression: `3 / 3`
  - `Q4`: `watch-but-stable`
  - `Q6`: `pass`
  - `Q8`: `pass`
- `pnpm --filter @seeku/worker typecheck`: pass
- `pnpm --filter @seeku/web typecheck`: still blocked by pre-existing issues outside agent-panel scope in:
  - `apps/web/src/components/CandidateDetailModal.tsx`
  - `apps/web/src/components/ClaimForm.tsx`

## Key Decisions

1. Keep the CLI runtime as the only source of truth and make the web panel a projection layer.
2. Use SSE plus POST for the first local bridge instead of introducing WebSocket orchestration.
3. Expose only bounded shortlist / compare / evidence / feedback interventions in v1.3.
4. Preserve the shipped Phase 7 quality posture as a milestone guardrail, not just a best-effort regression check.

## Files Added Or Extended

- `apps/worker/src/cli/agent-session-events.ts`
- `apps/worker/src/cli/agent-session-bridge.ts`
- `apps/worker/src/cli/workflow.ts`
- `apps/api/src/routes/agent-panel.ts`
- `apps/web/src/lib/agent-panel.ts`
- `apps/web/src/hooks/useAgentPanelSession.ts`
- `apps/web/src/components/AgentPanel.tsx`
- `apps/web/src/app/agent-panel/[sessionId]/page.tsx`
- `.planning/phases/08-cli-agent-panel/ACCEPTANCE-2026-04-17.md`

## Deferred / Watch Items

- The panel still relies on direct `sessionId` routing; a session discovery surface is not part of v1.3.
- `Q4` remains the active watch query even though the saved regression posture held.
- Existing `apps/web` typecheck debt remains outside this milestone's write scope.

## Closeout

- Phase 08 is complete.
- Milestone `v1.3 Visible Agent Copilot` is complete.
- The next route is milestone archival and definition of the next milestone rather than extending Phase 08 ad hoc.
