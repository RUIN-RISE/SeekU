# 03-PLAN: Deal Flow Surface And Feedback Capture

## Goal

Expose the daily deal flow through a dedicated web surface that drives action rather than passive browsing.

## Scope

- deal flow page or panel
- top-three and more-opportunities rendering
- candidate card contract
- explicit feedback actions
- basic interaction telemetry hooks

## Tasks

1. Build a dedicated web entry point for the daily deal flow that is separate from the reactive chat/search flow.
2. Implement the card presentation for `name`, `headline`, `bucket`, `direction match summary`, `why now`, `approach path`, `confidence`, and actions.
3. Wire explicit feedback actions: `感兴趣`, `不感兴趣`, `已联系`, and `稍后再看`.
4. Capture basic high-signal implicit behavior such as detail opens, evidence expansion, repeat views, and dwell time where feasible.
5. Ensure the surface remains operational when a daily list is sparse or contains more low-confidence entries than expected.

## Validation

- web tests for page rendering and card action flows
- API / hook tests for feedback submission and retrieval
- manual verification that the surface feels distinct from search results

## Exit Criteria

- the user can open a daily deal flow and act on candidates
- explicit feedback is recorded successfully
- the surface communicates actionability and uncertainty without collapsing into a generic feed
