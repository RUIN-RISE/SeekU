# Phase 08: CLI Agent Panel - Context

**Gathered:** 2026-04-16
**Status:** Ready for execution
**Source:** Approved design spec and milestone kickoff

<domain>
## Phase Boundary

This phase adds a local visual copilot panel for Seeku's shipped CLI search agent.

The phase covers:

- event emission from the CLI runtime for session snapshot and state deltas
- a local API bridge for SSE event streaming and structured intervention commands
- a dual-column web panel that visualizes task progress and current candidate state
- bounded intervention actions over shortlist, compare, evidence expansion, and predefined feedback tags
- resilience and regression coverage that preserve the v1.2 search-agent posture

This phase does not cover:

- a second web-native agent runtime
- full control-room style orchestration
- chain-of-thought exposure
- multi-session background operations
- reopening discovery or GitHub expansion

</domain>

<decisions>
## Implementation Decisions

### Product Shape
- Seeku remains an evidence-driven talent search engine, not a workflow automation console.
- The first visible agent surface is a local copilot panel attached to the CLI session.

### Runtime Authority
- The CLI runtime remains the single source of truth.
- The web panel is a derived view only.
- Interventions must go back through structured commands and authoritative runtime acknowledgement.

### Transport
- Use SSE for runtime-to-browser event delivery.
- Use POST for browser-to-runtime intervention commands.
- Avoid WebSocket orchestration in v1 unless SSE proves insufficient.

### Interaction Scope
- Support only `add_to_compare`, `remove_from_shortlist`, `expand_evidence`, and predefined `apply_feedback(tag)` commands.
- Keep corrective feedback tags structured rather than free-form.

### Quality
- Preserve Phase 7 recommendation honesty and compare gating.
- Preserve saved regression posture for `Q4`, `Q6`, and `Q8`.

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
- `docs/superpowers/specs/2026-04-16-cli-agent-panel-design.md`

### Existing CLI agent runtime
- `apps/worker/src/cli/workflow.ts`
- `apps/worker/src/cli/agent-state.ts`
- `apps/worker/src/cli/agent-tools.ts`
- `apps/worker/src/cli/agent-policy.ts`

### Existing web and API surfaces
- `apps/web/src/app/chat/page.tsx`
- `apps/web/src/components/ChatInterface.tsx`
- `apps/web/src/hooks/useChatSession.ts`
- `apps/api/src/routes/search-stream.ts`

### Quality baseline
- `.planning/phases/07-cli-search-agent-orchestration/SUMMARY.md`
- `.planning/github-expansion/WS4-CONTROLLED-OPEN-CHECKPOINT-2026-04-15.md`

</canonical_refs>

<specifics>
## Specific Ideas

- Introduce an event bus or event emission layer around meaningful CLI session transitions rather than logging raw internals.
- Treat initial snapshot plus incremental updates as the core browser state contract.
- Reuse existing web chat patterns and candidate-card affordances where possible.
- Keep the panel focused on observability and bounded steering, not debugging.

</specifics>

<deferred>
## Deferred Ideas

- Web-native primary input instead of CLI input
- Arbitrary operator control surfaces such as pause, retry, strategy switching, and multi-task queues
- Free-form intervention prompting
- Full runtime replay console or chain-of-thought viewer
- Multi-user or remote session attachment

</deferred>

---

*Phase: 08-cli-agent-panel*
*Context gathered: 2026-04-16 from approved spec and milestone kickoff*
