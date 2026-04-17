# Phase 10: Chat-First Copilot - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning
**Source:** Approved design spec and milestone kickoff

<domain>
## Phase Boundary

This phase turns Seeku's shipped chat, visible copilot, and daily deal flow into one chat-first session product.

The phase covers:

- promoting `/chat` to the default primary product surface
- adding a read-only `Narrated Workboard` right rail
- translating authoritative runtime modes into `Now`, `Why`, `Movement`, and `Focus`
- reusing the existing session snapshot and event protocol from the shipped visible copilot
- folding shortlist, compare, recommendation posture, and `Top 3 today` into the session workboard
- keeping `/agent-panel/[sessionId]` and `/deal-flow` compatible while shifting product definition to the chat-first surface

This phase does not cover:

- right-rail intervention controls
- durable memory or CRM management
- background autonomous loops
- outbound delivery or outreach
- replacing the existing CLI/runtime authority with a browser-native state machine

</domain>

<decisions>
## Implementation Decisions

### Product Shape
- Seeku's next surface is a `chat-first session copilot`, not a dashboard-first operator console.
- Chat remains the only primary collaboration and steering thread.
- The right rail is read-only in this milestone.

### Session Framing
- The product is session-centric, not cross-session pipeline-centric.
- Persistent signals may appear only when they materially affect the current session.
- Deal flow becomes a session-scoped artifact inside `Focus`, not a separate runtime mode.

### State Ownership
- The existing session runtime remains authoritative.
- The web app should reuse the current `agent-panel` snapshot and event protocol rather than creating a new browser-owned business state.
- The older chat-session model is not the authority for the new workboard.

### UI Contract
- The workboard must expose `Now`, `Why`, `Movement`, and `Focus`.
- `Why` should update on mode or conclusion changes, not on every event.
- `Movement` should show the latest meaningful progress, not become a running log.

### Quality
- Preserve CLI runtime authority, compare gating, and recommendation honesty.
- Preserve saved posture for `Q4`, `Q6`, and `Q8`.
- Avoid product drift into memory-console or CRM semantics.

</decisions>

<canonical_refs>
## Canonical References

**Downstream planning and implementation must read these before working.**

### Product and planning anchors
- `.planning/STATE.md`
- `.planning/ROADMAP.md`
- `.planning/PROJECT.md`
- `.planning/REQUIREMENTS.md`

### Approved design
- `docs/superpowers/specs/2026-04-17-chat-first-copilot-design.md`

### Prior milestone outcomes
- `.planning/phases/08-cli-agent-panel/CONTEXT.md`
- `.planning/phases/08-cli-agent-panel/SUMMARY.md`
- `.planning/phases/09-daily-deal-flow/CONTEXT.md`
- `.planning/phases/09-daily-deal-flow/04-SUMMARY.md`

### Existing runtime and protocol
- `apps/worker/src/cli/agent-policy.ts`
- `apps/worker/src/cli/agent-session-events.ts`
- `apps/web/src/lib/agent-panel.ts`
- `apps/web/src/components/AgentPanel.tsx`

### Existing web surfaces
- `apps/web/src/app/chat/page.tsx`
- `apps/web/src/app/agent-panel/[sessionId]/page.tsx`
- `apps/web/src/app/deal-flow/page.tsx`
- `apps/web/src/components/ChatInterface.tsx`
- `apps/web/src/components/DealFlowBoard.tsx`
- `apps/web/src/lib/chat-session.ts`

</canonical_refs>

<specifics>
## Specific Ideas

- Build the new workboard as a composition layer that consumes existing session protocol types instead of cloning panel logic ad hoc.
- Keep the main chat area message-first and move persistent state summaries into the right rail.
- Make `Focus` switch among a small number of read-only subviews tied to session stage: goal summary, shortlist summary, compare summary, and top picks / recommendation summary.
- Preserve route compatibility during rollout by reusing new workboard sections inside transitional routes where practical.

</specifics>

<deferred>
## Deferred Ideas

- Workboard editing or intervention actions
- Cross-session opportunity pool management
- Explicit memory management UI
- External notifications, outreach assistance, or CRM workflow
- Full event replay timeline or debugging console

</deferred>

---

*Phase: 10-chat-first-copilot*
*Context gathered: 2026-04-17 from approved spec and milestone kickoff*
