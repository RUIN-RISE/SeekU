# 01-PLAN: Event Runtime And Session Snapshot Foundation

## Goal

Expose the shipped CLI search-agent runtime as an event-emitting session source without changing its decision authority.

## Scope

- define the runtime event schema and initial snapshot contract
- wrap key CLI session transitions with event emission
- serialize authoritative session state for browser reconstruction
- preserve existing shortlist, compare, recommendation, and confidence behavior

## Tasks

1. Define a minimal structured event contract for:
   - session lifecycle
   - goal and conditions
   - task progression
   - shortlist and compare state
   - recommendation and uncertainty state
2. Add an initial session snapshot payload that can fully reconstruct panel state on subscription.
3. Refactor CLI workflow transitions to emit authoritative events at meaningful state boundaries.
4. Ensure intervention acknowledgement and rejection events have machine-readable reasons and human-readable summaries.
5. Add worker tests that verify event ordering and state completeness.

## Validation

- event contract tests for snapshot and delta shape
- worker tests covering search, shortlist updates, compare updates, and recommendation changes
- non-regression on existing Phase 7 state and recommendation behavior

## Exit Criteria

- the CLI runtime can produce an initial snapshot plus incremental events for a live session
- emitted events are sufficient to reconstruct current goal, conditions, shortlist, compare set, recommendation, uncertainty, and status
- no recommendation or compare-gating behavior regresses
