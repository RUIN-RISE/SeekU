# Seeku

## What This Is

Seeku is an evidence-driven AI talent search engine. Its current primary shipped operator surface is a CLI-first search agent that can clarify a hiring/search goal, search candidates, narrow a shortlist, compare 2-3 people, and only recommend when evidence and confidence are strong enough.

## Core Value

**Find the right AI talent through what they've done, not what they claim.** Evidence-based matching over profile text matching.

## Current State

- Latest shipped milestone: `v1.2 Agentic Search CLI`
- Milestone archive: `.planning/milestones/v1.2-ROADMAP.md`
- Requirements archive: `.planning/milestones/v1.2-REQUIREMENTS.md`
- Current status: between milestones
- Default next move: `$gsd-new-milestone`

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
- New product work should open as a new milestone instead of extending the archived v1.2 lane.
- Top-level `.planning` anchors remain the operational source of truth.

## Next Milestone Goals

Not defined yet.

When the next milestone is opened, the first routing task should be to decide whether the work is:
- a search-core quality milestone
- a new operator / agent surface milestone
- a separate ingestion / discovery milestone

That decision should happen in `$gsd-new-milestone`, not by appending more plans to Phase 7.

---
*Last updated: 2026-04-16 after v1.2 milestone archive*
