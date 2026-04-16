# GSD Workstream Migration Cleanup Issue

Date: 2026-04-15
Owner: Codex
Status: resolved on 2026-04-16

## Problem

A first `gsd-tools workstream create` call moved the repo from flat mode into workstream mode and migrated the top-level planning anchors into:

- `.planning/workstreams/milestone/ROADMAP.md`
- `.planning/workstreams/milestone/STATE.md`
- `.planning/workstreams/milestone/REQUIREMENTS.md`
- `.planning/workstreams/milestone/phases/`

The top-level anchors were then copied back to keep the repo’s established routing intact.

Original result:

- top-level anchors existed again
- workstream copies also still existed
- `.planning/active-workstream` pointed at a stub workstream rather than the real current mainline state

## Why This Is Risky

1. Future GSD commands without explicit workstream routing can read the wrong active context.
2. Top-level anchors and workstream copies can drift apart.
3. A hurried full rollback during `v1.1` mainline work would create more churn than value.

## Resolution

On 2026-04-16 the repo was explicitly cleaned back to flat-mode operation:

- removed `.planning/workstreams/`
- removed `.planning/active-workstream`
- kept top-level anchors as the only operational routing source

Current operating source of truth:

- `.planning/STATE.md`
- `.planning/ROADMAP.md`
- `.planning/PROJECT.md`
- `.planning/REQUIREMENTS.md`

## Historical Recommendation

Treat this as a separate cleanup issue.

Do **not** keep pushing workstream mode as the repo’s live operating model during the current `v1.1 controlled-open` cycle.

Do **not** do a full rollback right now either.

This file is kept only as a record of the migration failure mode and the eventual cleanup choice.

## Remaining Out Of Scope

- no return to workstream mode unless a future milestone intentionally reintroduces it
