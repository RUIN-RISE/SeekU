# Seeku

## What This Is

Seeku is an evidence-driven AI talent search engine. Its current primary operator surface is a chat-first copilot that can steer candidate search in natural language, expose a narrated session workboard, narrow a shortlist, compare 2-3 people, and only recommend when evidence and confidence are strong enough.

## Core Value

**Find the right AI talent through what they've done, not what they claim.** Evidence-based matching over profile text matching.

## Current State

- Current milestone: none active
- Latest shipped milestone: `v1.7 Runtime-Backed Chat Agent Integration`
- Previous shipped milestone: `v1.6 Mission Replay Hardening`
- Milestone archives:
  - `.planning/milestones/v1.7-ROADMAP.md`
  - `.planning/milestones/v1.7-REQUIREMENTS.md`
  - `.planning/milestones/v1.6-ROADMAP.md`
  - `.planning/milestones/v1.6-REQUIREMENTS.md`
  - `.planning/milestones/v1.5-ROADMAP.md`
  - `.planning/milestones/v1.5-REQUIREMENTS.md`
  - `.planning/milestones/v1.4-ROADMAP.md`
  - `.planning/milestones/v1.4-REQUIREMENTS.md`
  - `.planning/milestones/v1.3-ROADMAP.md`
  - `.planning/milestones/v1.2-ROADMAP.md`
- Requirements archives:
  - `.planning/milestones/v1.7-REQUIREMENTS.md`
  - `.planning/milestones/v1.6-REQUIREMENTS.md`
  - `.planning/milestones/v1.5-REQUIREMENTS.md`
  - `.planning/milestones/v1.4-REQUIREMENTS.md`
  - `.planning/milestones/v1.3-REQUIREMENTS.md`
  - `.planning/milestones/v1.2-REQUIREMENTS.md`
- Current status: `v1.7` archived as shipped
- Current focus: define the next milestone on top of the runtime-backed chat copilot foundation

## Shipped In v1.7

- `/chat` now starts and observes a real runtime/API-backed mission path instead of relying on front-end simulated execution as the primary authority
- attached runtime sessions project into the shipped chat-first workboard contract without giving the browser business-state ownership
- bounded attached-chat correction now routes through the existing runtime intervention surface and remains runtime-derived
- degraded attached states are explicit and safe:
  - `missing`
  - `disconnected`
  - `error`
- milestone acceptance now records rollout guardrails for the first bounded runtime-backed chat scope

## Shipped In v1.6

- replayable mission-case fixtures now cover key bounded-mission stop shapes
- replay evidence now explicitly captures:
  - stop reason
  - mission phase
  - summary copy
  - uncertainty copy
  - shortlist and compare posture
- replay mismatch buckets now classify:
  - `false_stop`
  - `late_stop`
  - `wrong_stage_report`
  - `ui_semantic_mismatch`
- clarification-stop framing in the right rail now correctly prioritizes `Goal summary` and tighter direction rather than shortlist-first review

## Shipped In v1.5

- `/chat` is now the default primary operator surface
- a narrated, read-only session workboard shows:
  - `Now`
  - `Why`
  - `Movement`
  - `Focus`
- shortlist, compare posture, recommendation posture, and proactive top picks now live inside one session-centric chat-first surface
- legacy `/agent-panel/[sessionId]` routes now redirect into the chat-first shell
- a bounded foreground mission runner now supports:
  - one active mission per session
  - multi-round large-scope candidate search
  - natural-language `tighten`, `retarget`, and stop/pause correction
  - explicit stop reasons:
    - `enough_shortlist`
    - `enough_compare`
    - `low_marginal_gain`
    - `needs_user_clarification`
- mission stop posture now defaults to shortlist-first / compare-first rather than premature `top1`

## Shipped In v1.4

- Shared direction taxonomy, candidate direction profiling, and user goal modeling in the search domain layer
- Interpretable opportunity scoring and daily curation with direction-first ranking semantics
- Dedicated `/deal-flow` page with:
  - top-three daily priorities
  - more-opportunities queue
  - `why this person`
  - `why now`
  - `how to approach`
  - confidence and uncertainty cues
- Explicit and implicit feedback capture that changes later deal-flow output
- Drift-note handling when recent behavior diverges from the explicit long-term goal

## Shipped In v1.3

- Structured session snapshot and delta events for the CLI search agent
- Local SSE + POST bridge for visible agent session streaming and bounded interventions
- Dual-column browser copilot panel for execution feed, session state, shortlist, compare, and recommendation posture
- Disconnect / reconnect / missing-session handling that keeps runtime state authoritative
- Regression coverage preserving:
  - `Q4`: `watch-but-stable`
  - `Q6`: `pass`
  - `Q8`: `pass`

## Previously Shipped In v1.2

- Free-form CLI agent loop for clarify/search/narrow/compare/decide
- Explicit tool contracts and session state for agent decision flow
- Structured 2-3 person compare with confidence-gated recommendation
- Honest low-confidence behavior that returns a conditional answer or refusal instead of unsupported certainty
- Agent eval harness that preserves:
  - `Q4`: `watch-but-stable`
  - `Q6`: `pass`
  - `Q8`: `pass`

## Current Constraints

- GitHub expansion discovery remains paused by default.
- `Q4` is still a watch item even though the sustain gate is clear.
- The CLI runtime must remain the single source of truth for shortlist, compare, recommendation, and uncertainty state.
- The shipped visible panel is a local copilot surface, not a full operator console and not a second runtime.
- The shipped daily deal flow is still process-local in its learning loop and does not yet persist user-state durably.
- External delivery, CRM, and corpus expansion are still out of scope until the next milestone explicitly pulls them in.

## Next Milestone Goals

- not defined yet
- open the next milestone with a fresh `REQUIREMENTS.md`
- decide whether the next step is:
  - broader attached-chat runtime command coverage beyond bounded feedback tags
  - mission expansion beyond the first runtime-backed bounded search scope
  - operator workflow on top of the now-runtime-backed chat-first surface

## Key Decisions

- Continue building on the shipped CLI search-agent runtime instead of replacing it with a separate web-native runtime.
- Use a dual-column copilot panel rather than a pure timeline or dashboard-only surface.
- Prefer SSE plus POST for the first local bridge instead of introducing WebSocket orchestration immediately.
- Keep first-version interventions narrow and structured.
- Keep milestone boundaries tight: ship the visible copilot before deciding whether to broaden it into a richer operator console.
- Treat `Daily Deal Flow` as a new proactive layer above the shipped runtime, not as a replacement for reactive search.
- Prioritize `goal-direction match` over richer but less reliable first-version signals such as broad personality inference or global reachability.
- Unify shipped chat, panel, and deal-flow surfaces through a session-centric chat-first shell before expanding into durable memory, CRM, or external delivery.

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition:**
1. Requirements invalidated? Move them out with a reason.
2. Requirements validated? Record where they were closed.
3. New requirements emerged? Add them explicitly.
4. Decisions to log? Add them here.

**After each milestone:**
1. Review whether the active operator surface still matches the product direction.
2. Re-check current constraints and watch items.
3. Archive requirements and roadmap before opening the next milestone.

---
*Last updated: 2026-04-18 after shipping milestone v1.7 Runtime-Backed Chat Agent Integration*
