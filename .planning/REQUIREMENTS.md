# Requirements — Seeku

## Active Milestone

`v1.3 Visible Agent Copilot`

## Active Requirements

- [ ] `PANEL-01` — The CLI search agent emits structured snapshot and delta events for goal, conditions, shortlist, compare set, recommendation, uncertainty, and runtime status.
- [ ] `PANEL-02` — A local API bridge exposes the active CLI session to the browser through SSE and accepts structured intervention commands through POST.
- [ ] `PANEL-03` — The web UI renders a dual-column copilot panel with conversation rail, execution feed, next-step bar, session snapshot, shortlist, compare, and recommendation views.
- [ ] `PANEL-04` — The first-version intervention surface is limited to `add_to_compare`, `remove_from_shortlist`, `expand_evidence`, and predefined `apply_feedback(tag)` commands.
- [ ] `PANEL-05` — The web panel remains a derived view only; authoritative state changes come from the CLI runtime, and rejected interventions do not mutate UI state optimistically.
- [ ] `PANEL-06` — The panel degrades cleanly for disconnect, rejected intervention, and missing-session states.
- [ ] `PANEL-07` — The milestone preserves Phase 7 search-agent behavior and saved regression posture, including `Q4` `watch-but-stable`, `Q6` `pass`, and `Q8` `pass`.

## Requirement Notes

- This milestone extends Seeku's operator surface, not the search-core ranking architecture.
- Free-form chain-of-thought exposure is out of scope.
- Arbitrary operator controls such as pause/resume orchestration, strategy switching, or multi-task control-room behavior are out of scope.
- Feedback tags must remain predefined and structured in v1.

## Planned Requirement Coverage

| Requirement | Planned coverage |
|-------------|------------------|
| `PANEL-01` | Phase 08 / `01-PLAN` |
| `PANEL-02` | Phase 08 / `02-PLAN` |
| `PANEL-03` | Phase 08 / `03-PLAN` |
| `PANEL-04` | Phase 08 / `02-PLAN`, `03-PLAN` |
| `PANEL-05` | Phase 08 / `01-PLAN`, `02-PLAN`, `03-PLAN` |
| `PANEL-06` | Phase 08 / `04-PLAN` |
| `PANEL-07` | Phase 08 / `04-PLAN` |

## Carry-forward Guardrails

- Preserve search-quality posture from the saved controlled-open checkpoint:
  - `Q4`: `watch-but-stable`
  - `Q6`: `pass`
  - `Q8`: `pass`
- Do not reopen discovery by default.
- Reuse the shipped v1.2 CLI runtime instead of building a separate agent stack.

## Design Contract

- `docs/superpowers/specs/2026-04-16-cli-agent-panel-design.md`

---
*Last updated: 2026-04-16 for milestone v1.3 kickoff*
