# 03-PLAN: Web Copilot Panel And Bounded Interaction Surface

## Goal

Render the approved dual-column copilot panel on top of the local session bridge and expose only the first-version interaction controls.

## Scope

- conversation rail and execution feed
- next-step bar
- session snapshot
- shortlist panel
- compare panel
- recommendation and uncertainty panel
- bounded interaction controls wired to the bridge

## Tasks

1. Add or adapt a chat-oriented web route for the visible agent panel.
2. Build the left-side experience for:
   - conversation rail
   - execution feed
   - next-step bar
3. Build the right-side experience for:
   - session snapshot
   - shortlist
   - compare set
   - recommendation and uncertainty
4. Wire candidate and feedback controls to the intervention API without optimistic business-state mutation.
5. Add component and hook tests for rendering, action availability, and derived-state updates.

## Validation

- UI component tests for panel sections and disabled states
- hook tests for event subscription and derived-state updates
- manual local pass covering add-to-compare, remove-from-shortlist, expand-evidence, and feedback flows

## Exit Criteria

- the browser shows the approved dual-column copilot layout
- the panel updates from authoritative events rather than frontend-only state changes
- all first-version controls work against the bounded intervention contract
