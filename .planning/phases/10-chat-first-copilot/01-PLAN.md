# 01-PLAN: Chat-First Shell And Authoritative Session Binding

## Goal

Turn `/chat` into the primary copilot shell and bind it to the existing authoritative session snapshot and event stream.

## Scope

- promote `/chat` to the milestone's main operator surface
- establish the split chat plus right-rail shell
- connect the new surface to the current agent-panel session protocol
- avoid introducing a second browser-owned business-state model

## Tasks

1. Audit the current `/chat` page and supporting chat-session code to isolate what can remain message-oriented and what must defer to the authoritative agent-panel protocol.
2. Define the top-level page composition for:
   - chat thread region
   - right-rail workboard region
   - empty / idle state when no live session is present
3. Add or adapt a session-binding layer that consumes the authoritative session snapshot and event stream already used by the visible copilot.
4. Ensure the chat-first shell can coexist with the old session model during rollout without duplicating shortlist, compare, recommendation, or uncertainty authority.
5. Add route or hook coverage proving `/chat` renders correctly with and without a live session.

## Validation

- route-level tests for `/chat` shell rendering
- hook or state tests for authoritative session binding
- verification that shortlist / compare / recommendation state is not duplicated in a second frontend model

## Exit Criteria

- `/chat` can host the new split-shell copilot layout
- the shell is wired to the authoritative runtime protocol
- no new browser-owned business-state authority is introduced
