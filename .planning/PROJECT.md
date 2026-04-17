# Seeku

## What This Is

Seeku is an evidence-driven AI talent search engine. Its current primary operator surface is a CLI-first search agent that can clarify a hiring/search goal, search candidates, narrow a shortlist, compare 2-3 people, and only recommend when evidence and confidence are strong enough.

## Core Value

**Find the right AI talent through what they've done, not what they claim.** Evidence-based matching over profile text matching.

## Current State

- Current milestone: `v1.4 Daily Deal Flow`
- Latest shipped milestone: `v1.3 Visible Agent Copilot`
- Previous shipped milestone: `v1.2 Agentic Search CLI`
- Milestone archives:
  - `.planning/milestones/v1.3-ROADMAP.md`
  - `.planning/milestones/v1.2-ROADMAP.md`
- Requirements archives:
  - `.planning/milestones/v1.3-REQUIREMENTS.md`
  - `.planning/milestones/v1.2-REQUIREMENTS.md`
- Current status: `v1.4` planned and ready to execute
- Current focus: validate a proactive daily cofounder deal flow above the shipped search-agent and visible-copilot baseline

## Current Milestone: v1.4 Daily Deal Flow

**Goal:** Turn Seeku into a proactive daily cofounder opportunity product that understands the user's goal direction and assembles a daily list of people worth contacting.

**Target features:**
- daily in-product deal flow generated from the existing Seeku corpus
- goal-direction scoring and candidate public-expression profiling
- actionable candidate cards with `why this person`, `why now`, `how to approach`, and confidence
- explicit and implicit feedback loops that affect subsequent lists
- short drift-note handling when recent behavior diverges from explicit long-term goals

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
- `v1.4` should validate the proactive opportunity loop before adding external delivery, CRM, or corpus expansion.

## Next Milestone Goals

`v1.4 Daily Deal Flow` is now the active milestone.

The milestone should prove:

- proactive daily opportunity generation from the existing corpus
- direction-first cofounder matching
- feedback-driven next-day list evolution
- honest uncertainty handling for low-confidence opportunities

## Key Decisions

- Continue building on the shipped CLI search-agent runtime instead of replacing it with a separate web-native runtime.
- Use a dual-column copilot panel rather than a pure timeline or dashboard-only surface.
- Prefer SSE plus POST for the first local bridge instead of introducing WebSocket orchestration immediately.
- Keep first-version interventions narrow and structured.
- Keep milestone boundaries tight: ship the visible copilot before deciding whether to broaden it into a richer operator console.
- Treat `Daily Deal Flow` as a new proactive layer above the shipped runtime, not as a replacement for reactive search.
- Prioritize `goal-direction match` over richer but less reliable first-version signals such as broad personality inference or global reachability.

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
*Last updated: 2026-04-17 after starting milestone v1.4 Daily Deal Flow*
