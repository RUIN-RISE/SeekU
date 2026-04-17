# Seeku Bounded Mission Runner Design

Date: 2026-04-17
Project: Seeku
Status: Approved for planning
Owner: Codex + Ross Cai

## Summary

Seeku should add a first-version `frontstage long-task runner` for large-scope candidate search inside the shipped chat-first copilot.

The first version is not a background job system and not a general autonomous agent loop. It is a bounded mission that runs in the foreground while the user stays in chat, watches progress, and can interrupt with natural-language course corrections.

The mission should:

- execute multiple bounded search and narrowing rounds inside one session
- stop automatically at a clear convergence point
- remain visible through the chat-first workboard
- accept mid-run user steering without spawning a second task

## Why This Exists

Seeku's shipped runtime can already:

- clarify a goal
- search candidates
- narrow toward a shortlist
- compare finalists
- refuse weak recommendations

The current gap is task horizon, not base capability.

Right now, the product is still biased toward shorter interactive loops. The user can ask for a search, watch the agent move, and review proactive output, but there is not yet a first-class product shape for:

- a bigger search mission
- multiple bounded rounds in one run
- explicit convergence and stop decisions
- in-flight natural-language corrections

If Seeku wants to feel more agentic without becoming a background automation system, the next step is a bounded frontstage mission runner.

## Product Goal

Build a `Bounded Mission Runner` for `large-scope candidate search`.

The first version is successful if it does all of the following:

- lets the user start one long-running search mission from chat
- keeps execution in the foreground rather than sending it to a background task center
- shows mission progress in the existing chat-first copilot surface
- allows the user to interrupt the mission with natural-language corrections
- forces the runtime to stop automatically at an explicit convergence point
- preserves current recommendation honesty, compare gating, and bounded-runtime discipline

## Non-Goals

The first version will not:

- become a background job queue
- continue running after the user leaves the page
- support parallel missions in one session
- support general-purpose long tasks outside large candidate search
- create a second web-owned runtime authority
- introduce free-form autonomous tool chains with no bounded step policy
- become a CRM workflow, outreach engine, or task inbox

## Product Definition

### Core Task Type

The first version supports exactly one long-task class:

- `large-scope candidate search`

This means:

- broader search scope than a normal one-shot search turn
- multiple bounded rounds of search, narrowing, and comparison
- a final output that is stronger than "some results appeared"

The target output is:

- a credible shortlist
- a stabilized compare set
- or an explicit stop caused by insufficient evidence or conflicting direction

### Frontstage Execution

The mission runs in the foreground.

The user stays inside the same chat session and sees ongoing mission progress. The system does not shift the task into a background queue or ask the user to come back later.

The mission is therefore:

- visible
- interruptible by chat
- session-bound
- expected to stop during the current interaction window

### Automatic Stop

The mission must stop automatically.

The first version should not require the user to manually halt the run. The runtime is responsible for deciding when the mission has converged enough to report back.

The user may still interrupt with a new direction or ask for the current result, but the default stop behavior is runtime-owned.

### Mid-Run Course Correction

The user may insert natural-language guidance while the mission is running.

Examples:

- `先只看上海`
- `别看 academic-heavy`
- `方向太泛了，再收紧一点`
- `先给我结果`

These inputs are treated as mission-local course corrections, not as new standalone tasks.

## Core Mental Model

The user should feel:

- "I started one mission"
- "the agent is continuing to work on it"
- "I can steer it mid-flight"
- "it will stop on its own when it has something credible"

The user should not feel:

- that they opened a second system
- that the task silently became a background job
- that each interruption creates a brand-new run
- that the runtime can continue forever without an explicit stopping rule

## System Structure

### Session And Mission Relationship

The `session` remains the main conversation thread.

The `mission` is a bounded execution layer attached to the current session.

Important constraints:

- a session may have at most one active mission in the first version
- the mission is not its own primary page
- mission results flow back into the same session
- after stop, the session returns to normal chat posture

### Mission Object

The first version should introduce an explicit `mission` concept with at least:

- `missionId`
- `sessionId`
- `goal`
- `status`
- `currentPhase`
- `roundCount`
- `latestStopReason`
- `courseCorrections`
- `startedAt`
- `stoppedAt`

This object exists so the product can talk about a long task as one thing, rather than faking it through a long event feed.

## Mission State Machine

The mission should use a small bounded state machine.

### Primary States

1. `running_search`
2. `narrowing`
3. `comparing`
4. `summarizing`
5. `stopped`

### State Semantics

`running_search`
- expand the candidate pool
- gather enough breadth for meaningful narrowing

`narrowing`
- reduce noisy or weak candidates
- increase shortlist credibility

`comparing`
- operate on a stronger, smaller set
- decide whether convergence is sufficient

`summarizing`
- prepare the final shortlist or stop explanation
- translate mission output into user-facing result

`stopped`
- mission is complete
- no further automatic execution occurs

### Cross-Cutting Events

The first version should model these as events rather than separate states:

- `course_correction_received`
- `stop_decision_made`

### Allowed Transitions

- `idle session -> running_search`
- `running_search -> narrowing`
- `narrowing -> running_search`
- `narrowing -> comparing`
- `comparing -> running_search`
- `comparing -> narrowing`
- `comparing -> summarizing`
- `summarizing -> stopped`

The runtime may move backward only when it has a clear reason, such as:

- missing evidence
- too much noise
- strong user retargeting

It may not loop indefinitely just because more search is technically possible.

## Stop Rules

The first version should use explicit stop categories rather than an opaque scoring-only stop policy.

Valid stop reasons:

- `enough_shortlist`
- `enough_compare`
- `low_marginal_gain`
- `needs_user_clarification`

### `enough_shortlist`

Stop when the shortlist is credible enough that continuing search would produce low additional value.

### `enough_compare`

Stop when the compare set is stable enough to support a useful phase result.

### `low_marginal_gain`

Stop when another round is unlikely to improve quality meaningfully.

Indicators may include:

- no stronger new candidates
- no meaningful uncertainty reduction
- repeated search expansion with little quality gain

### `needs_user_clarification`

Stop when:

- the goal is too under-specified
- user corrections conflict materially
- continuing execution would mostly amplify noise

In this case, the runtime should stop and ask for better direction instead of pretending more search is useful.

## Course Correction Protocol

The first version should classify mid-run user interruptions into three categories.

### `tighten`

Examples:

- `先只看上海`
- `不要 academic-heavy`

Expected effect:

- mission remains the same mission
- runtime usually returns to `running_search` or `narrowing`
- workboard explains what got tightened

### `retarget`

Examples:

- `现在更想找 agent infra，不看泛 AI founder 了`

Expected effect:

- mission stays active but its internal target changes materially
- runtime updates the mission definition
- execution normally returns to `running_search`

### `stop_or_pause_intent`

Examples:

- `先给我结果`
- `先停一下`

Expected effect:

- runtime stops automatic continuation
- mission enters `summarizing`
- then moves to `stopped`

### Protocol Constraints

- a correction does not create a second mission
- a correction must be visible as a mission event
- the workboard should explain why the correction changed the next phase
- the first version should not support branching or sub-missions

## UI Shape

The mission should live inside the shipped chat-first product shape.

### Main Chat Area

Chat remains the primary thread.

Mission start should be visible through an explicit assistant message such as:

- "I’ll run a broader candidate search, narrow it in rounds, and stop when the shortlist is credible. You can interrupt me at any time."

While the mission is running, the main chat should show only stage-level updates, not raw step-by-step logs.

Examples:

- mission started
- broad search completed
- shortlist is converging
- compare is ready
- mission is stopping with final shortlist

### Right Rail

The existing `Now / Why / Movement / Focus` workboard remains the main visual surface.

The long-task addition should introduce a lightweight `Mission Banner` above or within the workboard state summary.

The banner should show:

- mission name
- mission status: `running`, `converging`, or `stopped`
- a short mission goal
- optional round count

### Workboard Interpretation During Missions

`Now`
- what mission phase is currently active

`Why`
- why the runtime is still continuing or why it changed phase

`Movement`
- what the latest mission round changed

`Focus`
- the most relevant current artifact:
  - pool summary
  - shortlist
  - compare set
  - final shortlist / stop explanation

### User Interruption Behavior

When the user interrupts mid-run:

- the user message stays in chat
- the active mission remains the same mission
- the workboard updates to show a mission correction event
- the mission banner should not reset to a fresh mission id

### Mission Completion

When the mission stops:

- the banner changes to `stopped`
- the main chat shows one coherent completion message
- the workboard focus shifts to the final shortlist, compare result, or explicit stop explanation

## Runtime Guardrails

The first version must preserve existing bounded-runtime principles.

- each round still routes through explicit bounded runtime phases
- no free-form infinite tool chains
- no hidden background continuation
- no weakening of compare gating
- no weakening of recommendation honesty

The mission runner extends horizon, not authority.

## Error Handling And Fallbacks

### Runtime Stall

If the runtime cannot make further progress:

- the mission should stop explicitly
- the stop reason should be visible
- the user should receive a request for clarification or a statement of insufficient evidence

### Over-Correction

If the user issues conflicting corrections:

- the mission should not thrash indefinitely
- the runtime should stop with `needs_user_clarification`

### Excessive Looping

The mission should have an explicit bounded-round policy in implementation.

The first version does not need a user-visible configuration knob, but it should not allow open-ended looping with no visible reason.

## Testing And Verification

The implementation plan should include coverage for:

- mission state transitions
- explicit stop reason selection
- no-mission to active-mission lifecycle
- course-correction classification
- workboard updates during mission runs
- automatic stop behavior without manual halt
- no regression to compare gating and recommendation honesty

Verification should also confirm:

- a session cannot run multiple active missions
- corrections stay inside the same mission
- long-task execution remains foreground and session-bound

## MVP Scope

The MVP should do only the following:

- start one mission from chat
- run bounded large-scope candidate search rounds
- show mission framing inside the chat-first copilot
- allow natural-language course correction while running
- stop automatically at an explicit convergence point
- summarize the result back into the same session

The MVP should explicitly avoid:

- background task persistence
- multi-mission management
- mission inboxes or task dashboards
- post-exit continuation
- outreach workflows
- arbitrary non-search long tasks

## Relationship To Existing Design

This design is downstream of the shipped chat-first copilot design.

The chat-first copilot defines:

- the primary product surface
- the narrated workboard
- the right-rail information architecture

The bounded mission runner adds:

- a longer execution horizon
- a mission object
- a mission state machine
- explicit stop rules
- mid-run course-correction behavior

It should therefore be implemented as an extension of the chat-first copilot, not as a parallel product track.
