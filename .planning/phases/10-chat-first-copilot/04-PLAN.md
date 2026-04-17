# 04-PLAN: Fallback Handling, Regression Coverage, And Milestone Acceptance

## Goal

Harden the chat-first copilot so it degrades safely and preserves the shipped search/runtime quality bar.

## Scope

- no-live-session behavior
- partial snapshot fallback behavior
- disconnect handling for event delivery
- preserved recommendation honesty and compare gating
- milestone acceptance coverage

## Tasks

1. Implement clear fallback states for:
   - no active or restorable session
   - partial snapshot data
   - disconnected or delayed event delivery
2. Ensure the workboard never fabricates movement, stale shortlist data, or recommendation certainty when runtime data is missing.
3. Add regression coverage confirming that integrating the chat-first surface does not weaken compare gating, recommendation honesty, or saved query posture for `Q4`, `Q6`, and `Q8`.
4. Define a milestone acceptance pass that covers the end-to-end chat-first session experience, including transitional route safety.
5. Document any residual debt that remains out of scope for the milestone.

## Validation

- integration tests for idle, partial, and disconnected workboard states
- regression coverage for recommendation honesty and compare gating
- preserved saved posture on `Q4`, `Q6`, and `Q8`
- milestone acceptance checklist pass

## Exit Criteria

- the chat-first copilot degrades safely when runtime data is absent or interrupted
- no fabricated or stale business state is presented as live
- the milestone preserves the shipped quality bar while changing the primary product surface
