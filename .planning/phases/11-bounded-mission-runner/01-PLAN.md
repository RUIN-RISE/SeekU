# 01-PLAN: Mission Object, Session Attachment, And Bounded State Machine Foundation

## Goal

Introduce a first-class mission object attached to the current session and define the bounded mission state machine.

## Scope

- mission object model
- session-to-mission attachment rules
- primary mission phases
- one-active-mission-per-session guardrail

## Tasks

1. Define the minimal mission object shape with identifiers, phase, goal, round count, timestamps, and stop metadata.
2. Attach mission ownership to the active session without creating a second browser-owned runtime authority.
3. Implement or define the bounded primary phases:
   - `running_search`
   - `narrowing`
   - `comparing`
   - `summarizing`
   - `stopped`
4. Enforce the first-version rule that one session may have at most one active mission.
5. Add tests or fixtures that prove state transitions are structurally valid and mission identity survives course correction.

## Validation

- mission model tests
- state transition tests
- session guard tests for single active mission

## Exit Criteria

- a mission exists as a first-class execution object
- a session can own one active mission
- the bounded mission state machine is defined and testable
