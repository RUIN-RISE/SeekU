# Milestone v1.5: Chat-First Copilot

**Status:** ACTIVE
**Started:** 2026-04-17
**Phase range:** 10-11

## Overview

This milestone unifies Seeku's shipped conversational surfaces into one chat-first copilot. The goal is to keep natural-language interaction as the only operator control thread while turning the visible agent panel and daily deal flow into a narrated, read-only right rail attached to the current session.

The milestone should make `/chat` the default primary surface, reuse the existing authoritative session runtime and event stream, and fold session outputs such as shortlist, compare posture, and `Top 3 today` into a single session workboard.

## Included Phase

### Phase 10: Chat-First Copilot

**Goal:** Turn `/chat` into the primary copilot surface with a read-only narrated workboard that reuses the existing runtime protocol and absorbs deal-flow/session artifacts without weakening runtime authority.

**Depends on:** Phase 08 `cli-agent-panel`, Phase 09 `daily-deal-flow`

**Plans:**
- [ ] `10-01-PLAN.md` — Chat-first shell and authoritative session binding
- [ ] `10-02-PLAN.md` — Narrated workboard state mapping and read-only information architecture
- [ ] `10-03-PLAN.md` — Focus views, transitional route reuse, and UI integration
- [ ] `10-04-PLAN.md` — Fallback handling, regression coverage, and milestone acceptance

### Phase 11: Bounded Mission Runner

**Goal:** Add a foreground, bounded long-task runner for large-scope candidate search inside the chat-first copilot, with explicit stop rules and in-flight course correction.

**Depends on:** Phase 10 `chat-first-copilot`

**Plans:**
- [ ] `11-01-PLAN.md` — Mission object, session attachment, and bounded state machine foundation
- [ ] `11-02-PLAN.md` — Mission loop policy, stop rules, and course-correction protocol
- [ ] `11-03-PLAN.md` — Mission UI framing inside chat and workboard
- [ ] `11-04-PLAN.md` — Regression coverage, stop-quality verification, and milestone acceptance

## Milestone Guardrails

- Keep the CLI/runtime layer as the single source of truth.
- Do not add right-rail controls or parallel orchestration surfaces in this milestone.
- Do not turn persistent signals into a memory dashboard or CRM.
- Preserve recommendation honesty and compare gating.
- Keep the mission runner foreground-bound and single-mission-per-session.
- Do not reopen GitHub expansion, external delivery, or corpus expansion by default.

## Planned Outcome

- `/chat` becomes the primary surface
- the session workboard shows `Now`, `Why`, `Movement`, and `Focus`
- deal flow appears as a session-scoped output inside `Focus`
- one bounded foreground mission can run inside a chat session for larger candidate-search tasks
- `/agent-panel/[sessionId]` and `/deal-flow` remain compatible during rollout but no longer define the core product shape

## References

- `docs/superpowers/specs/2026-04-17-chat-first-copilot-design.md`
- `docs/superpowers/specs/2026-04-17-bounded-mission-runner-design.md`
- `.planning/phases/08-cli-agent-panel/SUMMARY.md`
- `.planning/phases/09-daily-deal-flow/04-SUMMARY.md`
- `.planning/MILESTONES.md`
