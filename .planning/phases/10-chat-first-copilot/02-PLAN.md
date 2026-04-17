# 02-PLAN: Narrated Workboard State Mapping And Read-Only Information Architecture

## Goal

Implement the `Narrated Workboard` contract that translates runtime state into `Now`, `Why`, `Movement`, and `Focus`.

## Scope

- mode-to-workboard mapping
- stable read-only workboard sections
- update-cadence rules for fast vs stable fields
- human-readable summaries that avoid timeline/debugger behavior

## Tasks

1. Define the derived workboard view model for:
   - `Now`
   - `Why`
   - `Movement`
   - `Focus`
2. Map authoritative runtime modes `clarify`, `search`, `narrow`, `compare`, and `decide` into stable narrated summaries.
3. Encode update-cadence rules so:
   - `Now`, latest `Movement`, and current `Focus` may move in near real time
   - `Why` and higher-level explanation fields update only on meaningful stage or conclusion changes
4. Keep the workboard observation-only and explicitly exclude intervention affordances.
5. Add derived-state tests confirming that runtime events do not degrade the workboard into a rolling event log.

## Validation

- unit tests for mode-to-workboard mapping
- component tests for fixed section rendering
- regression checks ensuring right-rail sections stay read-only

## Exit Criteria

- the workboard renders the approved `Now / Why / Movement / Focus` contract
- runtime posture is understandable without exposing a raw event timeline
- no direct control widgets are added to the workboard
