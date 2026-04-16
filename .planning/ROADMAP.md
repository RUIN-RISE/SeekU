# Milestone v1.3: Visible Agent Copilot

**Status:** ACTIVE
**Started:** 2026-04-16
**Phase range:** 08
**Total plans:** 4

## Overview

This milestone turns Seeku's CLI-first search agent into a visible working copilot. The user still drives the session with natural language through the CLI, while a local web panel shows the agent's execution progress, current shortlist and compare state, recommendation posture, and a narrow set of intervention actions.

The milestone deliberately keeps the CLI runtime as the single source of truth. The web layer is a local panel, not a second agent runtime and not a full operator console.

## Included Phase

### Phase 08: CLI Agent Panel

**Goal:** Add a local dual-column copilot panel for the CLI search agent, backed by structured runtime events and light intervention commands, without regressing the shipped v1.2 search-agent quality bar.

**Plans:**
- [ ] `08-01-PLAN.md` — Event-emitting CLI runtime and session snapshot foundation
- [ ] `08-02-PLAN.md` — Local API bridge for SSE event streaming and intervention commands
- [ ] `08-03-PLAN.md` — Web copilot panel with execution feed, shortlist, compare, and recommendation views
- [ ] `08-04-PLAN.md` — Integration hardening, disconnect handling, and regression coverage

## Success Criteria

- The CLI runtime emits structured session snapshot and delta events that are sufficient to reconstruct goal, conditions, shortlist, compare state, recommendation, uncertainty, and current status.
- A local API bridge streams the runtime state to a web panel through SSE and accepts a bounded intervention command set through POST.
- The web panel renders the approved dual-column copilot surface:
  - left rail: conversation, execution feed, next-step bar
  - right rail: session snapshot, shortlist, compare, recommendation and uncertainty
- Supported interventions are limited to:
  - `add_to_compare`
  - `remove_from_shortlist`
  - `expand_evidence`
  - `apply_feedback(tag)`
- The panel never becomes the source of truth; every visible state change comes from authoritative CLI events.
- Disconnect and missing-session states degrade gracefully.
- The shipped v1.2 search posture remains intact, including:
  - `Q4`: `watch-but-stable`
  - `Q6`: `pass`
  - `Q8`: `pass`

## Dependencies And Guardrails

- Build on top of the shipped v1.2 CLI search agent instead of replacing it.
- Do not reopen discovery or GitHub expansion during this milestone.
- Preserve recommendation honesty and compare gating behavior from Phase 7.
- Reuse existing `apps/web` and `apps/api` surfaces where possible instead of creating a new standalone app.

## References

- `docs/superpowers/specs/2026-04-16-cli-agent-panel-design.md`
- `.planning/phases/07-cli-search-agent-orchestration/SUMMARY.md`
- `.planning/milestones/v1.2-ROADMAP.md`
- `.planning/milestones/v1.2-REQUIREMENTS.md`

---
*Last updated: 2026-04-16 for milestone v1.3 kickoff*
