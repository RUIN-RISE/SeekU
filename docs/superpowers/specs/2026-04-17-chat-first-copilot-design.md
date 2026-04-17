# Seeku Chat-First Copilot Design

Date: 2026-04-17
Project: Seeku
Status: Approved for planning
Owner: Codex + Ross Cai

## Summary

Seeku should unify its shipped conversational surfaces into one chat-first copilot experience.

The next milestone is not a new dashboard and not a more autonomous hidden runtime. It is a single primary product surface where:

- chat remains the main thread
- the right side shows a narrated, read-only workboard for the current session
- deal flow becomes one of the session outputs instead of a separate product surface

The first version should reuse the existing visible agent runtime and daily deal flow foundation. It should not introduce a second business-state model in the web app.

## Why This Exists

Seeku has already shipped three meaningful layers:

- an evidence-driven search core
- a bounded search-agent runtime with `clarify`, `search`, `narrow`, `compare`, and `decide`
- visible execution and proactive deal flow surfaces in the web product

What is still fragmented is the user experience. The user can search in chat, inspect an agent panel, or open a dedicated deal-flow page, but those surfaces do not yet feel like one continuous copilot.

The next product move should therefore be:

- from separate surfaces to one session-centric surface
- from status mirroring to narrated agent progress
- from a standalone deal-flow page to a chat-attached session output

## Product Goal

Build a `chat-first session copilot` for Seeku.

The first version is successful if it does all of the following:

- makes `/chat` the default primary surface
- keeps natural-language interaction as the only control thread
- shows what the agent is doing now without exposing a raw debug log
- shows the most relevant session outputs in a stable right rail
- folds deal-flow output into the same session experience
- preserves the current runtime authority and recommendation-quality posture

## Non-Goals

The first version will not:

- create a second autonomous runtime in the browser
- turn the product into a dashboard-first operator console
- expose full reasoning traces or chain-of-thought
- provide right-rail editing or direct orchestration controls
- become a CRM or cross-session pipeline manager
- add long-lived background autonomy, external outreach, or notifications
- replace the current runtime protocol with a brand-new frontend state model

## Product Definition

### Core Mental Model

The product should feel like one agent that the user talks to in natural language while watching it progress through meaningful work.

The user should not feel like they are switching among:

- a chat page
- an agent-monitoring page
- a deal-flow page

Instead, the user should feel that:

- chat is the collaboration thread
- the right rail is the narrated session workboard
- the candidate and deal-flow artifacts are outputs of that same session

### Interaction Model

The first version is explicitly a `session copilot`, not a persistent relationship manager.

That means:

- the main unit of work is the current session
- the right rail primarily reflects current-session state
- persistent signals may appear only when they materially affect the current session
- steering happens through natural-language messages, not control widgets

### Read-Only Right Rail

The right rail should be `observation-only` in the first version.

It may reveal:

- current mode
- current goal
- session progress
- shortlist and compare posture
- top picks and recommendation posture
- uncertainty and drift notes when relevant

It should not support direct actions such as:

- add to compare
- remove from shortlist
- apply feedback tags
- trigger mode changes

Those actions remain out of scope for the MVP because they weaken the single-threaded chat-first product feel.

## Recommended Surface

Use `A. Chat Main + Right Rail` as the product default.

### Main Area

The main area remains chat-first and message-first.

It should contain:

- user messages
- assistant replies
- a small number of system notices when the session state changes materially

It should not contain persistent shortlist cards, compare trays, or deal-flow boards inline by default. Those belong in the right rail.

### Right Rail

The right rail should use the `Narrated Workboard` layout rather than a pure status column or a rolling event timeline.

The workboard has four fixed sections:

1. `Now`
2. `Why`
3. `Movement`
4. `Focus`

This structure is preferred because it makes the agent feel active without turning the UI into a debugger.

## Workboard Information Architecture

### `Now`

Shows the one current runtime posture for the session.

Examples:

- `Clarifying goal`
- `Searching candidates`
- `Narrowing shortlist`
- `Comparing finalists`
- `Forming recommendation`

Constraints:

- only one primary state is visible at a time
- it may update in near real time
- it should stay short and glanceable

### `Why`

Explains why the runtime is currently in that posture.

Examples:

- current constraints are still too weak for a credible shortlist
- there are enough constraints to search without more questions
- the pool is broad enough that the system should narrow before comparing
- evidence is strong enough to move from compare to decision

Constraints:

- sentence-length only
- updates only when mode or conclusion materially changes
- avoids verbose reasoning dumps

### `Movement`

Explains what changed because of the latest meaningful step.

Examples:

- shortlist grew from `2` to `6`
- compare set is now ready
- top picks were refreshed
- confidence posture improved from `low` to `medium`

Constraints:

- only the latest meaningful change is shown
- not a scrollback timeline
- can update event-by-event when the change is materially visible to the user

### `Focus`

Shows the current session artifact the user most needs to see.

Priority order:

1. `Top 3 today`
2. shortlist summary
3. compare summary
4. recommendation posture

`Focus` is where the session-scoped deal-flow output appears. Deal flow is therefore not a separate runtime mode. It is one form of session output.

## Runtime Mode To Workboard Mapping

The workboard should not invent a second set of business states. It should translate the existing authoritative runtime modes into user-readable narration.

### `clarify`

`Now`
- clarifying the goal

`Why`
- current constraints are not yet sufficient for a credible shortlist

`Movement`
- newly extracted constraints or removed ambiguity

`Focus`
- current goal summary and missing constraint summary

### `search`

`Now`
- searching candidates

`Why`
- there is enough signal to search before asking more

`Movement`
- result count, shortlist growth, or obvious exclusions

`Focus`
- emerging top picks or shortlist summary

### `narrow`

`Now`
- narrowing the shortlist

`Why`
- the candidate pool is broad enough that signal must be improved before compare

`Movement`
- shortlist reduction or confidence improvement

`Focus`
- shortlist entries and one-line inclusion reasons

### `compare`

`Now`
- comparing finalists

`Why`
- the system has enough strong candidates for a structured decision gate

`Movement`
- compare set is ready, changed, or clarified

`Focus`
- side-by-side finalist summary

### `decide`

`Now`
- forming recommendation

`Why`
- evidence is now sufficient for a recommendation, conditional recommendation, or explicit non-recommendation

`Movement`
- recommendation posture or confidence posture changes

`Focus`
- `Top 1` or `Top 3 today`, recommendation rationale, and uncertainty note

## State Ownership And Data Boundary

### Source Of Truth

The existing session runtime remains authoritative.

The new chat-first surface should reuse the current agent-panel session model rather than inventing a separate browser-native business state. In particular, the primary source should remain the current session snapshot and event stream already represented by:

- `AgentPanelSessionSnapshot`
- `AgentPanelSessionEvent`
- existing session status and recommendation fields

This matters because the current web chat state model is still closer to the older conversational search flow, while the agent-panel protocol already matches the bounded runtime that the user wants to visualize.

### Update Cadence

The right rail should distinguish between data that can move continuously and data that should stay stable within a mode.

Near-real-time updates:

- `Now`
- the latest `Movement`
- the current `Focus` artifact

Mode-change or conclusion-change updates:

- `Why`
- top-level goal summary
- uncertainty wording
- drift wording

This boundary prevents the workboard from feeling like a noisy event console.

### Persistent Signals

The first version may surface persistent signals only when they materially affect the current session.

Examples:

- a drift note that slightly reweights today’s top picks
- a short confidence caveat derived from prior feedback

Persistent signals should not become standalone control panels or editable memory views in the MVP.

## Route Strategy

### Primary Route

`/chat` becomes the default primary product surface.

### Existing Agent Panel Route

`/agent-panel/[sessionId]` may remain temporarily for compatibility, internal debugging, and rollout safety, but it should progressively reuse the same workboard-oriented rendering logic rather than evolve as a parallel product surface.

### Existing Deal Flow Route

`/deal-flow` may remain as a compatibility or transitional route in the first implementation cycle, but product definition should treat it as a derived view, not the main product entry point.

## Component Direction

The first version should preserve the existing visual and data boundaries where they help implementation speed.

### Main Chat Surface

Retain the chat page as the main shell, but evolve it from a full-width conversation surface to a split layout:

- left: chat thread
- right: narrated workboard

### Narrated Workboard

The workboard should be a new composition layer, not a new state authority.

Suggested internal sections:

- session summary header
- `Now`
- `Why`
- `Movement`
- `Focus`

### Focus Subviews

`Focus` can switch among a small number of read-only subviews depending on session stage:

- goal summary
- shortlist summary
- compare summary
- top picks and recommendation summary

These subviews should consume the existing candidate and recommendation snapshot shapes wherever possible.

## Error Handling And Fallbacks

The product should degrade cleanly when runtime data is missing or incomplete.

### No Live Session

If there is no active or restorable session:

- the chat surface remains usable
- the right rail shows an idle onboarding state
- the product does not render stale shortlist or recommendation blocks as if they are live

### Partial Snapshot

If the session snapshot is present but some fields are empty:

- `Now` still renders the best available status
- `Why` falls back to a neutral explanation
- `Focus` falls back to whichever artifact is available without fabrication

### Event Delay Or Disconnect

If live event delivery drops:

- preserve the last known stable workboard
- show a mild connection-state warning
- avoid inventing progress that is not confirmed by snapshot or event data

## Testing And Verification

The first implementation plan should include coverage for:

- runtime mode to workboard mapping correctness
- stable rendering when the session snapshot is partial
- no duplicate business-state divergence between chat page and agent-panel data
- route-level rendering for `/chat` with and without a live session
- compatibility behavior for transitional `/agent-panel/[sessionId]` and `/deal-flow` routes

Verification should also confirm that the product still respects existing quality guardrails:

- recommendation honesty remains intact
- compare gating remains visible
- saved search-quality posture is not weakened

## MVP Scope

The MVP should do only the following:

- make `/chat` the primary entry point
- add a read-only narrated workboard right rail to `/chat`
- reuse the current authoritative session snapshot and event stream
- show top picks, shortlist, compare posture, recommendation posture, and uncertainty in `Focus`
- keep steering in natural-language chat only

The MVP should explicitly avoid:

- right-rail intervention buttons
- persistent memory controls
- CRM-like cross-session management
- long event timelines
- multi-task or background autonomous loops
- external delivery, outreach, or notifications

## Open Implementation Bias

The design intentionally favors reuse over reinvention.

Implementation should bias toward:

- reusing the current agent-panel protocol
- reusing current candidate and recommendation snapshot types
- replacing dedicated standalone surfaces gradually rather than in one disruptive cut

This is the safest path because Seeku already has a bounded runtime and visible panel foundation. The next milestone should unify those assets into one product surface, not restart them under a different UI label.
