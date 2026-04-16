# Seeku CLI Agent Panel Design

Date: 2026-04-16
Status: Approved for planning
Owner: Codex + Ross Cai

## Summary

Build a first-version local copilot panel for Seeku's CLI search agent. The user continues interacting in natural language through the CLI, while a web panel visualizes the agent's task progress, current shortlist and compare state, recommendation posture, and a small set of intervention actions.

The panel is not a second agent runtime and not a full operator console. The CLI agent remains the single source of truth. The panel subscribes to structured execution events and sends a narrow set of structured intervention commands back to the CLI session.

## Why This Exists

Seeku's shipped `v1.2 Agentic Search CLI` can already clarify, search, narrow, compare, and recommend with confidence gates. What it lacks is visible task execution. The next step toward a more agentic experience is not more hidden autonomy. It is an observable runtime that lets the operator see what the agent is doing and lightly steer the candidate set without dropping out of natural-language interaction.

## Product Goal

Make the CLI agent feel like a visible working copilot:

- The user can see the agent progress through meaningful task stages.
- The user can see the current shortlist, compare set, recommendation, and uncertainty state without reading raw terminal output.
- The user can lightly intervene on candidate state and search direction without turning the product into a full control room.

## Non-Goals

- Full chain-of-thought or raw reasoning trace exposure
- A fully web-native replacement for the CLI interaction loop
- Arbitrary strategy switching, pause/resume orchestration, or general runtime control
- Multi-task orchestration, batch search operations, or long-lived background agents
- A second business-state model maintained independently in the web app

## User Experience

### Interaction Model

The user enters natural-language requests in the CLI. A local web panel, opened separately, mirrors the same session and updates in near real time.

The first version supports:

- observing agent task progress
- observing current goal and parsed conditions
- observing shortlist, compare set, recommendation, and uncertainty
- adding a candidate to compare
- removing a candidate from shortlist
- expanding candidate evidence
- sending a small set of corrective feedback tags such as "more engineering-manager leaning" or "exclude academic-heavy profiles"

### Recommended Surface

Use a dual-column copilot layout.

Left column:

- conversation rail
- execution feed
- next-step bar

Right column:

- session snapshot
- shortlist panel
- compare panel
- recommendation and uncertainty panel

This layout is preferred over a pure timeline or dashboard because it preserves natural-language interaction while keeping the candidate state continuously visible.

## Information Architecture

### Left Column

#### Conversation Rail

Shows:

- user messages
- assistant responses
- compact system notices when the session state changes materially

Purpose:

- preserve the natural-language copilot feel
- keep the user's request history understandable without mixing in all execution details

#### Execution Feed

Shows only high-value execution events, for example:

- goal parsed
- search started
- search completed
- shortlist updated
- compare updated
- recommendation changed
- uncertainty changed

Purpose:

- answer "what is the agent doing now?"
- avoid turning the message list into a debugging log

#### Next-Step Bar

Shows one current suggested next action from the agent, such as:

- continue searching
- compare current three candidates
- clarify one missing constraint
- avoid recommending yet due to weak evidence

Purpose:

- convert system state into an operator-readable task posture

### Right Column

#### Session Snapshot

Shows:

- current user goal
- extracted conditions
- current session phase
- confidence posture

Purpose:

- give the operator one persistent, glanceable state summary

#### Shortlist Panel

Shows the current shortlist and candidate cards with lightweight actions:

- add to compare
- remove from shortlist
- expand evidence

Purpose:

- make candidate set manipulation concrete and low-friction

#### Compare Panel

Shows:

- the current compare set, capped at three
- compare readiness
- compare outcome state

Purpose:

- make pre-recommendation convergence visible

#### Recommendation And Uncertainty Panel

Shows:

- current recommendation status: clear, conditional, none
- recommendation rationale summary
- top uncertainty items
- corrective feedback chips

Purpose:

- make confidence gating visible
- give the user small but meaningful steering input

## State Ownership

The CLI session remains the only source of truth for business state.

Authoritative state lives in the existing CLI runtime, especially:

- `AgentSessionState`
- shortlist membership
- compare membership
- recommendation status
- confidence and uncertainty state

The web panel must not keep an independent business-state model. It only keeps a derived view state built from server events.

## Event Model

### Principle

The CLI emits structured events. The panel renders those events. Interventions travel back as structured commands. The CLI decides whether to apply them, updates authoritative state, and emits the resulting state-change events.

### Core Event Families

Session lifecycle:

- `session_started`
- `session_restored`
- `status_changed`

Goal and condition state:

- `goal_updated`
- `conditions_updated`

Task progression:

- `clarify_started`
- `search_started`
- `search_completed`
- `narrow_started`
- `compare_started`
- `decision_started`

Candidate state:

- `shortlist_updated`
- `compare_updated`
- `evidence_expanded`

Decision state:

- `recommendation_updated`
- `uncertainty_updated`

Intervention state:

- `intervention_received`
- `intervention_applied`
- `intervention_rejected`

### Event Payload Shape

Each event should carry:

- `sessionId`
- `timestamp`
- `type`
- `summary`
- `status`
- `data`

The `summary` field is optimized for human-facing event feed rendering. The `data` field is structured for deterministic UI updates.

### Initial Event Requirements

The first version should emit enough data to reconstruct:

- current goal
- current conditions
- current shortlist
- current compare set
- current recommendation status
- current uncertainty list
- current session status

This can be done either by:

- an initial snapshot event on subscription, followed by deltas

or

- a replayable event log for the current session

For the first version, prefer an initial snapshot plus incremental updates.

## Intervention Model

### Allowed Commands In v1

- `add_to_compare(candidateId)`
- `remove_from_shortlist(candidateId)`
- `expand_evidence(candidateId)`
- `apply_feedback(tag)`

### Feedback Tags

Feedback tags should be predefined, not free-form prompt injection. Examples:

- `more_engineering_manager`
- `less_academic`
- `more_hands_on_builder`
- `prefer_recent_execution`

These tags can later map onto structured condition or reranking adjustments.

### Command Rules

- Commands do not mutate frontend state directly.
- Every command is sent to the CLI bridge.
- The CLI validates applicability.
- If applied, the CLI updates session state and emits resulting state-change events.
- If rejected, the CLI emits `intervention_rejected` with a machine-readable reason and a short human summary.

## Architecture

### Worker Layer

`apps/worker` should expose an event-emitting agent runtime on top of the existing CLI workflow instead of reimplementing the agent.

Expected responsibilities:

- wrap key state transitions with event emission
- serialize the current session snapshot
- receive and apply validated intervention commands
- preserve current recommendation and confidence gates

Likely touchpoints:

- `apps/worker/src/cli/workflow.ts`
- `apps/worker/src/cli/agent-state.ts`
- `apps/worker/src/cli/agent-tools.ts`
- `apps/worker/src/cli/agent-policy.ts`

### API Layer

`apps/api` should host a local session bridge that connects the panel to the CLI runtime.

Recommended endpoints:

- `GET /agent-panel/:sessionId/events`
- `POST /agent-panel/:sessionId/interventions`

Transport choice:

- SSE for server-to-browser event streaming
- POST for browser-to-runtime intervention commands

Reason:

- the repo already uses SSE-style streaming in `search-stream`
- this is simpler to debug than introducing WebSocket session management immediately

### Web Layer

`apps/web` should either upgrade the current chat page or add a panel-oriented variant that reuses existing session patterns.

Expected new UI modules:

- `AgentExecutionFeed`
- `AgentSessionSnapshot`
- `ShortlistPanel`
- `ComparePanel`
- `RecommendationPanel`
- `InterventionBar` or embedded panel actions

Existing surfaces that can be reused:

- `ChatInterface`
- current chat session concepts
- candidate card patterns

## Failure Handling

### Stream Failure

If the SSE stream disconnects:

- show an explicit disconnected state
- preserve last known rendered state
- allow manual reconnect
- explain that CLI interaction can continue even while visualization is offline

### Intervention Failure

If an intervention is rejected:

- do not optimistically mutate the panel state
- show the rejection summary in the event feed or local notice area
- wait for the next authoritative event from the CLI

### Missing Session

If the session no longer exists:

- show the panel as disconnected and read-only
- allow returning to a new or active session

### Drift Prevention

Whenever a fresh authoritative snapshot is received, the web panel must reconcile to it even if local derived state differs.

## Testing Strategy

### Worker Tests

Add tests that verify:

- event emission order around search, shortlist, compare, and recommendation transitions
- intervention application logic
- intervention rejection logic
- recommendation state remains gated after interventions

### API Tests

Add tests that verify:

- SSE subscription returns initial snapshot and incremental events
- intervention POSTs route to the correct session
- invalid commands return stable errors
- disconnected or missing sessions return explicit failure modes

### Web Tests

Add tests that verify:

- event feed rendering from structured events
- snapshot hydration
- shortlist and compare panels update from events
- actions disable or hide correctly when unavailable
- disconnected state rendering

## Scope Check

This design is intentionally narrow enough for a single implementation plan.

Included:

- local visible panel for a live CLI agent session
- structured event streaming
- narrow intervention commands
- dual-column copilot UI

Excluded:

- general multi-agent control
- arbitrary operator workflows
- broad runtime introspection
- replacement of the CLI input loop

## Open Decisions Already Resolved

- Surface: local web side panel, not a pure web chat replacement
- Control level: light intervention, not a full operator console
- Layout: dual-column copilot
- State truth: CLI runtime
- Transport: SSE plus POST

## Planning Handoff

The next step should create an implementation plan that breaks this into:

- worker event runtime extraction
- API session bridge
- web copilot panel
- integration and regression coverage

That plan should preserve the current `v1.2` agent behavior and evaluation posture while adding visibility and a small intervention loop.
