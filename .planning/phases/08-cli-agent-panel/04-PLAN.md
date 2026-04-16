# 04-PLAN: Integration Hardening, Disconnect Handling, And Regression Coverage

## Goal

Harden the visible copilot flow so it fails safely and preserves the shipped search-agent quality posture.

## Scope

- disconnect and reconnection behavior
- missing-session and rejected-intervention UX
- regression coverage for Phase 7 recommendation honesty and saved search baselines
- milestone acceptance pass

## Tasks

1. Implement disconnected, reconnecting, and missing-session panel states.
2. Ensure rejected interventions surface clear operator feedback without frontend drift.
3. Add regression tests that confirm Phase 7 compare gating and recommendation honesty still hold after the panel integration.
4. Re-run saved quality checks or equivalent coverage for `Q4`, `Q6`, and `Q8`.
5. Define and run a milestone acceptance pass for the full CLI-plus-panel flow.

## Validation

- integration tests for disconnect and rejection flows
- regression coverage for recommendation honesty and compare gating
- preserved saved posture on `Q4`, `Q6`, and `Q8`
- milestone acceptance checklist pass

## Exit Criteria

- the panel degrades gracefully when the session stream disconnects or disappears
- rejected interventions never cause frontend-authoritative state drift
- the milestone preserves the shipped v1.2 search-agent quality bar
