# 02-PLAN: Mission Loop Policy, Stop Rules, And Course-Correction Protocol

## Goal

Define how a mission continues, when it must stop, and how user interruptions alter the same mission.

## Scope

- allowed loop transitions
- explicit stop reasons
- course-correction classification
- bounded-round behavior

## Tasks

1. Implement or define the allowed transition rules among search, narrowing, comparing, summarizing, and stopped phases.
2. Introduce explicit stop reasons:
   - `enough_shortlist`
   - `enough_compare`
   - `low_marginal_gain`
   - `needs_user_clarification`
3. Classify mid-run user interruptions into:
   - `tighten`
   - `retarget`
   - `stop_or_pause_intent`
4. Ensure a correction stays inside the active mission rather than creating a new one.
5. Add tests showing that missions stop automatically and do not continue indefinitely without explicit justification.

## Validation

- stop-reason selection coverage
- correction classification tests
- bounded-loop tests

## Exit Criteria

- the mission can continue only through approved transitions
- stop reasons are explicit and user-facing
- user interruptions modify the active mission instead of replacing it
