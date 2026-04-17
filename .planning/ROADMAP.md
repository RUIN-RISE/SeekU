# Roadmap

## Active Milestone: v1.4 Daily Deal Flow

**Status:** Planned
**Started:** 2026-04-17
**Phase range:** 09
**Total planned phases:** 1

## Overview

This milestone moves Seeku from a purely reactive search copilot toward a proactive operator product. The first version adds a daily in-product cofounder deal flow that models the user's goal direction, scores existing candidates by direction match, and delivers a daily list of people worth contacting today.

The milestone stays intentionally narrow:

- build on the shipped search-agent and visible-panel foundation
- keep the daily list inside Seeku
- prioritize actionability over full relationship management
- validate that user feedback can shape the next day's list

## Included Phase

### Phase 09: Daily Deal Flow

**Goal:** Add a proactive daily cofounder deal flow that ranks existing Seeku candidates by goal-direction match, explains why each person is worth contacting, and learns from explicit and implicit feedback.

**Plans:**
- [x] `09-01-PLAN.md` — Goal model and candidate direction foundation
- [x] `09-02-PLAN.md` — Opportunity scoring and daily curation pipeline
- [ ] `09-03-PLAN.md` — Deal flow surface and feedback capture
- [ ] `09-04-PLAN.md` — Drift logic, learning loop, and acceptance

## Milestone Guardrails

- Keep the shipped CLI/runtime foundations authoritative instead of replacing them.
- Use the existing Seeku corpus for v1.4; do not bundle corpus expansion with product validation.
- Preserve recommendation honesty and the saved `Q4/Q6/Q8` watch posture.
- Keep the first proactive surface inside Seeku and do not add external push or auto-outreach behavior in this milestone.

## Success Shape

The milestone is considered successful if it can:

- produce a daily deal flow reliably
- explain `why this person`, `why now`, `how to approach`, and `how sure`
- record user feedback and visibly change subsequent lists
- feel like a proactive opportunity pipeline rather than a re-skinned search page

## References

- `.planning/REQUIREMENTS.md`
- `.planning/phases/09-daily-deal-flow/CONTEXT.md`
- `docs/superpowers/specs/2026-04-17-daily-deal-flow-design.md`
- `.planning/phases/08-cli-agent-panel/SUMMARY.md`

---
*Last updated: 2026-04-17 after approving the Daily Deal Flow design spec*
