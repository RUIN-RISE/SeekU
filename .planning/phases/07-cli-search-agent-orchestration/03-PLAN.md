# 03-PLAN: Free-Form CLI Agent Policy And Interaction Loop

## Goal

Make the CLI behave like a free-form search agent while keeping its action space bounded and decision-oriented.

## Scope

- implement the internal clarify/search/narrow/compare/decide loop
- let the agent choose the next action instead of requiring a rigid user-led flow
- preserve CLI usability and avoid form-like over-questioning

## Tasks

1. Introduce an agent policy layer that can choose among clarify, search, narrow, compare, and decide actions.
2. Cap clarification depth and bias toward early search when enough information exists.
3. Integrate the new policy with current CLI interaction surfaces.
4. Ensure the agent converges toward compare instead of drifting into open-ended conversation.
5. Add tests for decision flow, stopping rules, and user-facing trajectory.

## Validation

- CLI flow tests showing sensible next-action choices
- manual smoke tests for broad goals, structured goals, and weak-evidence cases
- checks that compare remains the default convergence point

## Exit Criteria

- the CLI can autonomously advance through the bounded action loop
- the agent still feels free-form to the user
- the loop stops at compare/recommend or honest refusal instead of lingering unnecessarily
