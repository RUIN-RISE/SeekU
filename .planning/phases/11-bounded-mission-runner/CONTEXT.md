# Phase 11: Bounded Mission Runner - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning
**Source:** Approved design spec and milestone follow-on

<domain>
## Phase Boundary

This phase adds a bounded foreground mission runner for large-scope candidate search inside Seeku's chat-first copilot.

The phase covers:

- an explicit mission object attached to the active session
- bounded mission phases for frontstage long-task execution
- explicit stop rules and stop reasons
- natural-language course correction while a mission is running
- mission framing inside the existing chat-first copilot surface
- verification that mission execution does not weaken honesty or compare gating

This phase does not cover:

- background jobs or persistent task queues
- multiple simultaneous missions
- non-search long tasks
- post-exit continuation
- right-rail intervention controls
- CRM or outreach workflow

</domain>

<decisions>
## Implementation Decisions

### Product Shape
- The first long-task runner is a `Bounded Mission Runner`, not a background automation layer.
- The mission runs in the foreground while the user stays in chat.
- The first mission type is `large-scope candidate search` only.

### Session Relationship
- A mission is attached to the current session rather than creating a second top-level product surface.
- A session supports at most one active mission in the first version.
- User interruptions modify the active mission instead of spawning a new task.

### State Model
- The mission uses a bounded state machine with phases such as `running_search`, `narrowing`, `comparing`, `summarizing`, and `stopped`.
- The runtime may loop only through approved transitions and only with explicit justification.
- The mission must stop automatically with an explicit stop reason.

### Stop Policy
- The first version uses explicit stop categories:
  - `enough_shortlist`
  - `enough_compare`
  - `low_marginal_gain`
  - `needs_user_clarification`
- The mission may not continue indefinitely just because more search is possible.

### Quality
- Preserve compare gating and recommendation honesty.
- Preserve saved posture for `Q4`, `Q6`, and `Q8`.
- Keep mission execution foreground-bound and visible.

</decisions>

<canonical_refs>
## Canonical References

**Downstream planning and implementation must read these before working.**

### Product and planning anchors
- `.planning/STATE.md`
- `.planning/ROADMAP.md`
- `.planning/PROJECT.md`
- `.planning/REQUIREMENTS.md`

### Approved designs
- `docs/superpowers/specs/2026-04-17-chat-first-copilot-design.md`
- `docs/superpowers/specs/2026-04-17-bounded-mission-runner-design.md`

### Existing session and runtime foundations
- `apps/worker/src/cli/agent-policy.ts`
- `apps/worker/src/cli/agent-session-events.ts`
- `apps/web/src/lib/agent-panel.ts`
- `apps/web/src/components/ChatCopilotWorkboard.tsx`

### Prior phase outputs
- `.planning/phases/10-chat-first-copilot/CONTEXT.md`
- `.planning/phases/10-chat-first-copilot/01-PLAN.md`
- `.planning/phases/10-chat-first-copilot/02-PLAN.md`
- `.planning/phases/10-chat-first-copilot/03-PLAN.md`
- `.planning/phases/10-chat-first-copilot/04-PLAN.md`

</canonical_refs>

<specifics>
## Specific Ideas

- Model the mission as a first-class object instead of faking it through a long event list.
- Reuse the chat-first workboard rather than creating a mission dashboard.
- Treat user interruptions as typed mission corrections: tighten, retarget, or stop/pause intent.
- Keep mission start, convergence updates, and stop summary visible in chat, but avoid log spam.

</specifics>

<deferred>
## Deferred Ideas

- Background continuation after page exit
- Multi-mission management
- Mission inboxes or task history centers
- Non-search mission types
- Outreach, CRM, or durable workflow follow-up

</deferred>

---

*Phase: 11-bounded-mission-runner*
*Context gathered: 2026-04-17 from approved spec and milestone follow-on*
