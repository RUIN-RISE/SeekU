# 02-PLAN: Local API Bridge And Intervention Routing

## Goal

Create the local API bridge that streams the CLI runtime to the browser and routes bounded intervention commands back to the active session.

## Scope

- SSE endpoint for event streaming
- POST endpoint for intervention commands
- session lookup and lifecycle rules for local panel attachment
- rejection and missing-session behavior

## Tasks

1. Add an API route that subscribes the browser to a live session stream and sends the initial snapshot before deltas.
2. Add an API route for `add_to_compare`, `remove_from_shortlist`, `expand_evidence`, and `apply_feedback(tag)`.
3. Define stable session-not-found, invalid-command, and rejected-intervention responses.
4. Connect intervention handling back to the CLI runtime so authoritative state changes are emitted as follow-up events.
5. Add integration tests for SSE subscription, intervention routing, and failure modes.

## Validation

- API integration tests for snapshot + incremental stream behavior
- API tests for invalid session and invalid command responses
- end-to-end check that accepted interventions yield authoritative state updates through follow-up events

## Exit Criteria

- a browser can subscribe to a live CLI session through SSE
- a bounded intervention command set can be POSTed to the active session
- rejected or invalid interventions return explicit structured failures without mutating panel state
