# Requirements — Seeku v1.8

Milestone: `v1.8 CLI-First Session Ledger`
Status: Active
Started: 2026-04-18

## Active Requirements

### CLI Ownership

- [ ] `CLI-01` — CLI becomes the only formal agent interaction surface.
- [ ] `CLI-02` — The browser chat shell is no longer required for standard product use.
- [ ] `CLI-03` — Attach, resume, and workboard inspection all exist in the CLI.

### Session Ledger

- [ ] `LEDGER-01` — CLI-created sessions are durably recorded with a stable `sessionId`.
- [ ] `LEDGER-02` — The session ledger stores at least:
  - chat history
  - latest workboard snapshot
- [ ] `LEDGER-03` — The system uses database storage as the formal ledger and local file cache as a convenience layer.
- [ ] `LEDGER-04` — Local session cache is retained until manual cleanup.

### Restore And Resume

- [ ] `RESTORE-01` — CLI startup shows recent sessions and defaults to `new session`.
- [ ] `RESTORE-02` — `attach <sessionId>` can restore a stopped CLI-created session.
- [ ] `RESTORE-03` — Restored sessions open in a read-only posture.
- [ ] `RESTORE-04` — Free-form input does not implicitly resume a restored session.
- [ ] `RESTORE-05` — `resume` is explicit, asks a continuation question, and continues on the same `sessionId`.

## Milestone Notes

- This milestone is about CLI product ownership, not broader multi-surface UX.
- Restore scope is intentionally minimal in the first version.
- Historical web-created sessions remain out of scope.
