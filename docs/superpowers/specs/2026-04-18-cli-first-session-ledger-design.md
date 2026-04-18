# Seeku CLI-First Session Ledger Design

Date: 2026-04-18
Project: Seeku
Status: Approved for planning
Owner: Codex + Ross Cai

## Summary

Seeku should make the CLI the only formal product surface for agent interaction.

The next step is not to improve the web chat shell. It is to move the remaining chat, workboard, attach, and resume responsibilities into the CLI so the product no longer depends on a browser-owned interaction path.

The first version should:

- keep `CLI` as the only formal entry point
- allow a stopped CLI-created session to be restored by `sessionId`
- restore only the smallest useful state:
  - chat history
  - workboard snapshot
- open restored sessions in a read-only posture
- require explicit `resume` before execution can continue
- keep the original `sessionId` when execution resumes

## Why This Exists

Seeku already has a capable CLI runtime and has recently added runtime-backed chat and session attachment on the web side.

That web path exposed two product problems:

- it creates a second interaction surface that competes with the CLI mental model
- it introduces browser-side failure modes that are not part of the desired product shape

The intended product direction is simpler:

- one formal interaction surface
- one session model
- one place where the user starts, inspects, resumes, and steers agent work

That surface should be the CLI.

## Product Goal

Build a `CLI-first session ledger` that makes the CLI the only formal place to:

- start a session
- view recent sessions
- attach to a prior session
- inspect the latest workboard
- resume a stopped session
- continue steering the same session after an explicit resume step

The first version is successful if it does all of the following:

- shows a recent-session picker at CLI startup
- defaults to `new session`
- supports `attach <sessionId>` for CLI-created sessions
- restores a stopped session from persistent storage
- opens restored sessions in read-only mode
- forces an explicit `resume`
- asks one short confirmation question before execution continues
- keeps the same `sessionId`
- avoids using the web app as part of the normal interaction path

## Non-Goals

The first version will not:

- keep the web app as a co-equal formal entry point
- restore historical web-created sessions
- replay a full runtime event stream with exact execution fidelity
- restore the full internal mission state machine
- auto-resume a stopped session without user confirmation
- build a cross-device collaborative session inbox
- add a rich session browser with long summaries, labels, or filters

## Product Definition

### Single Formal Surface

The CLI is the only formal interaction surface for the agent product.

This means:

- starting from the desktop launcher should enter the CLI flow
- the web app is no longer required for standard product use
- session steering, correction, attach, and resume all happen in the CLI

The web app may remain in the repository as compatibility or internal tooling, but it is not the formal user-facing product path.

### Session Lifecycle

The CLI session lifecycle should be:

1. start CLI
2. see recent sessions plus `new session`
3. choose `new session` or attach an existing session
4. if attached to a stopped session, view it read-only
5. explicitly run `resume`
6. answer one short continuation prompt
7. continue execution inside the same `sessionId`

### Recovery Scope

The first recovery scope is intentionally narrow.

A restored session only needs:

- chat history
- latest workboard snapshot

It does not need to reconstruct the entire execution engine state. The restored session is primarily a readable collaboration artifact that can be turned back into an active session by explicit user action.

## User Experience

### Startup Picker

CLI startup should show a lightweight recent-session picker.

The picker should:

- list recent sessions
- default highlight to `new session`
- allow selection of an existing session

Each listed session shows only:

- `sessionId`
- recent timestamp

This keeps the startup view compact and avoids turning startup into a dashboard.

### Restored Session Posture

A restored stopped session opens in read-only mode.

In read-only mode the user may:

- read chat history
- inspect the workboard snapshot
- decide whether to continue

In read-only mode the user may not:

- continue execution by sending free-form natural language
- silently create a new active branch
- trigger implicit resume through ordinary input

If the user types ordinary natural-language input before `resume`, the CLI should reject execution and direct the user to use `resume`.

### Resume Behavior

`resume` is explicit and required.

After `resume`, the CLI should ask:

- `Based on this history, what do you want to continue with?`

Only after that answer does the session return to an active execution posture.

The resumed interaction keeps the original `sessionId`.

### Workboard

The workboard is part of the CLI experience, but it is not always visible.

The first version should:

- keep the workboard folded by default
- expose it through the explicit `workboard` command

This keeps the CLI focused on the conversational thread while preserving access to the structured session summary.

## Command Model

The CLI remains primarily natural-language driven, but a minimal explicit command layer is required.

Required explicit commands:

- `attach <sessionId>`
- `resume`
- `workboard`

Command roles:

- `attach <sessionId>` restores a known CLI-created session
- `resume` upgrades a read-only restored session into a continuation flow
- `workboard` toggles or reveals the structured workboard view

All other normal interaction should remain natural language unless a later phase expands the command surface.

## Session Identity And Ownership

### Allowed Restore Targets

The first version only restores sessions that were created by the CLI-ledger flow itself.

This excludes:

- historical web-created sessions
- legacy runtime sessions without the required snapshot format
- any source that cannot be confidently identified as CLI-owned

If a session is unknown, non-CLI, or structurally incomplete, the CLI should reject attach explicitly rather than guessing.

### Session Identity On Resume

Resuming a restored stopped session keeps the original `sessionId`.

The product should feel like the same session is being continued, not forked. That makes the ledger easier to reason about and avoids unnecessary branch semantics in the first version.

## Persistence Model

### Source Of Truth

Persistent storage should be two-layered:

- database as the source of truth
- local file cache as a convenience layer for recent session access

The database ledger stores formal session records.

The local cache stores:

- recent session copies
- all retained local session snapshots until manual cleanup

### Stored Data

The first version should persist, at minimum:

- `sessionId`
- source marker showing the session is CLI-owned
- created and updated timestamps
- stopped / active posture
- chat history
- latest workboard snapshot

Optional metadata may be added later, but the first design should not depend on richer fields.

### Local Cache Policy

Local cache policy is:

- retain all cached sessions
- manual cleanup only

The system should not silently delete older local snapshots in the first version.

## Architectural Shape

The preferred implementation is a thin CLI-first layer around the existing workflow core rather than a full rewrite.

### Components

Recommended new or clarified components:

- `CLI Entry Shell`
  - startup picker
  - command routing
  - read-only vs active posture
- `Session Ledger`
  - create, list, load, save session records
- `Session Snapshot Model`
  - persistent representation of chat history and workboard
- `Resume Coordinator`
  - read-only attach
  - explicit `resume`
  - continuation prompt
- `Workflow Adapter`
  - reconnects a resumed session to the existing `SearchWorkflow`

### Design Principle

Do not rewrite the whole agent runtime to achieve CLI-first recovery.

Instead:

- keep existing search and workflow primitives
- add a durable session wrapper around them
- move interaction ownership into the CLI shell

This keeps scope bounded and avoids destabilizing the working agent core.

## Error Handling

The first version must handle these failure cases explicitly.

### Missing Session

If `attach <sessionId>` cannot find a session in the database or local cache:

- show a direct not-found message
- do not fabricate a partial session

### Non-CLI Session

If the session exists but is not marked as CLI-owned:

- reject attach
- explain that only CLI-created sessions are supported

### Partial Recovery

If chat history exists but the workboard snapshot does not:

- restore the chat history
- show an empty or unavailable workboard state
- do not fail the entire attach flow

### Read-Only Input Guard

If the user sends natural-language input to a restored read-only session:

- do not execute it
- instruct the user to run `resume`

## Rollout Guardrails

- CLI remains the only formal user path
- web is not required for mainline operation
- restore support is limited to CLI-created sessions
- read-only attach is required before continuation
- `resume` always asks for a fresh continuation prompt
- resumed execution keeps the same `sessionId`
- first-version persistence stays minimal and readable

## Acceptance Criteria

The first version is acceptable only if all of the following are true:

- CLI startup shows recent sessions and `new session`
- `new session` is the default highlighted option
- a CLI-created stopped session can be restored by `sessionId`
- a restored session opens read-only
- chat history is visible after restore
- workboard snapshot is visible through `workboard`
- natural-language input does not resume execution implicitly
- `resume` is required and available
- `resume` asks one continuation question before the workflow continues
- the resumed session keeps the same `sessionId`
- non-CLI sessions are explicitly rejected

## Open Follow-On Work

The following work is intentionally deferred beyond this design:

- richer session list metadata
- session labels, search, or grouping
- full mission-state rehydration
- compatibility migration for historical web sessions
- cross-device shared attach semantics
- larger explicit command surface beyond `attach`, `resume`, and `workboard`

## Recommendation

Implement this as a light CLI-first orchestration layer above the existing workflow core.

That path is preferred because it:

- matches the product direction you chose
- removes the web app from the formal interaction path
- delivers session recovery without pretending the product needs a second surface
- keeps scope bounded enough for one coherent implementation cycle
