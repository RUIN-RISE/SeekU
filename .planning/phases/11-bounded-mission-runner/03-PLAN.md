# 03-PLAN: Mission UI Framing Inside Chat And Workboard

## Goal

Expose the bounded mission as a visible chat-first experience without turning the interface into a dashboard or raw event log.

## Scope

- mission start and completion messages in chat
- mission banner in the workboard
- mission-aware `Now / Why / Movement / Focus`
- user-visible course-correction handling

## Tasks

1. Define or implement the mission banner with mission name, status, short goal, and optional round count.
2. Add mission-aware chat messaging for:
   - mission start
   - convergence updates
   - mission stop summary
3. Extend the workboard so `Now / Why / Movement / Focus` reflect mission progress when a mission is active.
4. Ensure mid-run user corrections appear as mission-local steering rather than as detached new tasks.
5. Add UI tests for active, converging, corrected, and stopped mission states.

## Validation

- component tests for mission banner and mission-aware workboard
- chat rendering tests for mission start and stop states
- correction visibility tests

## Exit Criteria

- the mission is visibly framed inside the chat-first copilot
- the user can understand what the mission is doing and why
- the UI remains chat-first rather than dashboard-first
