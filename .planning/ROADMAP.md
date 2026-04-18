# Milestone v1.8: CLI-First Session Ledger

**Status:** ACTIVE
**Started:** 2026-04-18
**Phase range:** 14

## Overview

This milestone pulls the formal agent interaction loop back into the CLI. The goal is not to improve the browser shell further, but to make the CLI the only formal surface for session start, restore, attach, resume, and workboard inspection.

## Included Phase

### Phase 14: CLI-First Session Ledger

**Goal:** Add a CLI-owned session ledger with durable restore, startup session selection, read-only attach, explicit resume, and folded workboard inspection.

**Depends on:** Phase 7 `cli-search-agent-orchestration`, Phase 8 `cli-agent-panel`, Phase 10 `chat-first-copilot`, Phase 13 `runtime-backed-chat-agent-integration`

**Plans:**
- [x] `14-01-PLAN.md` — Ledger foundation, startup picker, local cache, and read-only attach shell
- [ ] `14-02-PLAN.md` — Database-backed session storage, transcript model, and same-session resume flow
- [ ] `14-03-PLAN.md` — Folded CLI workboard, command surface tightening, and non-web runtime ownership cleanup
- [ ] `14-04-PLAN.md` — Acceptance coverage, residual-risk report, and milestone closeout

## Milestone Guardrails

- CLI is the only formal product entry point.
- Do not treat the web chat shell as a required user path.
- Restore support is limited to CLI-created sessions.
- Resume must remain explicit and must not auto-trigger from free-form input.
- Keep the first durable restore scope narrow:
  - chat history
  - latest workboard snapshot

## Planned Outcome

- startup enters a CLI-first session launcher
- users can restore stopped CLI sessions by `sessionId`
- restored sessions open read-only and require `resume`
- workboard inspection moves into the CLI surface
- browser-owned interaction is no longer required for normal agent use

## References

- `.planning/PROJECT.md`
- `.planning/STATE.md`
- `.planning/REQUIREMENTS.md`
- `docs/superpowers/specs/2026-04-18-cli-first-session-ledger-design.md`
- `.planning/phases/13-runtime-backed-chat-agent-integration/04-SUMMARY.md`
