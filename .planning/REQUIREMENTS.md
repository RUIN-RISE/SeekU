# Requirements — Seeku v1.5

Milestone: `v1.5 Chat-First Copilot`
Status: Active
Started: 2026-04-17

## Active Requirements

- [ ] `COPILOT-01` — `/chat` becomes Seeku's default primary operator surface for the next milestone instead of treating `/deal-flow` or `/agent-panel/[sessionId]` as parallel main entry points.
- [ ] `COPILOT-02` — The `/chat` surface renders a split `chat + right rail` layout where chat remains the only primary control thread.
- [ ] `COPILOT-03` — The right rail is a read-only `Narrated Workboard` with fixed sections: `Now`, `Why`, `Movement`, and `Focus`.
- [ ] `COPILOT-04` — The workboard translates the authoritative runtime modes `clarify`, `search`, `narrow`, `compare`, and `decide` into stable human-readable narration instead of exposing a raw event timeline.
- [ ] `COPILOT-05` — The workboard consumes the existing authoritative session snapshot and event stream rather than inventing a second browser-owned business-state model.
- [ ] `COPILOT-06` — The `Focus` section can render current-session outputs including goal summary, shortlist summary, compare summary, and `Top 3 today` / recommendation posture without making deal flow a separate runtime mode.
- [ ] `COPILOT-07` — The right rail remains observation-only in v1.5; steering and state changes continue to happen through natural-language chat rather than direct workboard controls.
- [ ] `COPILOT-08` — Persistent signals such as drift and uncertainty may appear only when they materially affect the current session and must not turn the surface into a CRM or memory console.
- [ ] `COPILOT-09` — The product degrades safely for no-live-session, partial snapshot, and event disconnect states without fabricating progress or stale candidate state.
- [ ] `COPILOT-10` — Transitional `/agent-panel/[sessionId]` and `/deal-flow` routes remain compatible during rollout, but product behavior progressively reuses the new chat-first workboard rendering logic.
- [ ] `COPILOT-11` — The milestone preserves CLI runtime authority, compare gating, recommendation honesty, and saved search-quality posture including `Q4` `watch-but-stable`, `Q6` `pass`, and `Q8` `pass`.

## Milestone Notes

- This milestone unifies the shipped visible agent copilot and daily deal flow into one chat-first session product.
- The milestone intentionally excludes right-rail interventions, durable memory controls, CRM workflow, external outreach, and background autonomous loops.
- Implementation should prefer reuse of the existing `agent-panel` protocol and candidate/recommendation snapshot shapes.
