# Seeku

## What This Is

Seeku is an evidence-driven AI talent search engine. Its current primary operator surface is a CLI-first search agent that can clarify a hiring/search goal, search candidates, narrow a shortlist, compare 2-3 people, and only recommend when evidence and confidence are strong enough.

## Core Value

**Find the right AI talent through what they've done, not what they claim.** Evidence-based matching over profile text matching.

## Current State

- Active milestone: `v1.3 Visible Agent Copilot`
- Previous shipped milestone: `v1.2 Agentic Search CLI`
- Milestone archive: `.planning/milestones/v1.2-ROADMAP.md`
- Requirements archive: `.planning/milestones/v1.2-REQUIREMENTS.md`
- Current status: planning Phase 08
- Current focus: make the CLI agent observable and lightly steerable through a local web panel without weakening the shipped search-agent quality bar

## Shipped In v1.2

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
- The first visible panel is a local copilot surface, not a full operator console and not a second runtime.

## Next Milestone Goals

`v1.3 Visible Agent Copilot` is the next operator-surface milestone.

It should deliver:

- a structured event model for the live CLI agent session
- a local API bridge for session streaming and light intervention commands
- a web panel that visualizes execution progress and current candidate state
- bounded intervention actions that can influence compare membership and evidence exploration without bypassing CLI authority
- regression coverage that preserves the shipped `v1.2` quality posture

## Key Decisions

- Continue building on the shipped CLI search-agent runtime instead of replacing it with a separate web-native runtime.
- Use a dual-column copilot panel rather than a pure timeline or dashboard-only surface.
- Prefer SSE plus POST for the first local bridge instead of introducing WebSocket orchestration immediately.
- Keep first-version interventions narrow and structured.

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
*Last updated: 2026-04-16 for milestone v1.3 kickoff*
