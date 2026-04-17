# 03-PLAN: Focus Views, Transitional Route Reuse, And UI Integration

## Goal

Integrate session outputs into `Focus` and align existing `/agent-panel/[sessionId]` and `/deal-flow` routes with the new chat-first product shape.

## Scope

- read-only `Focus` subviews
- shortlist / compare / top-picks / recommendation presentation
- reuse or extraction of existing panel and deal-flow UI pieces
- transitional route compatibility during rollout

## Tasks

1. Define the small set of `Focus` subviews for:
   - goal summary
   - shortlist summary
   - compare summary
   - `Top 3 today` and recommendation posture
2. Reuse existing candidate and recommendation snapshot shapes where possible instead of creating parallel display contracts.
3. Integrate the new workboard into `/chat` and decide which shared rendering pieces should also back `/agent-panel/[sessionId]` and `/deal-flow` during the transition period.
4. Keep the main chat column message-first and ensure `Focus` carries session outputs without turning the page back into a dashboard.
5. Add component tests for `Focus` rendering across major session stages and transitional route compatibility.

## Validation

- component tests for `Focus` subviews
- route tests for compatible rendering on `/chat`, `/agent-panel/[sessionId]`, and `/deal-flow`
- review that deal-flow output is treated as a session artifact rather than a second runtime mode

## Exit Criteria

- `Focus` can show the current session artifact cleanly across major modes
- existing routes remain usable during rollout
- the product shape is visibly chat-first rather than page-fragmented
