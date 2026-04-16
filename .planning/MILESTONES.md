# Milestones

Earlier milestone history before explicit archival discipline remains in git and the phase summaries under `.planning/phases/`.

## v1.3 Visible Agent Copilot (Shipped: 2026-04-17)

**Phases completed:** 1 phase, 4 plans, 4 delivered batches

**Key accomplishments:**
- Seeku now exposes the CLI agent as a visible local copilot with structured session events, a browser-facing bridge, and a dual-column panel for execution progress and candidate-state visibility.
- Added bounded intervention support for compare membership, shortlist removal, evidence expansion, and predefined corrective feedback without giving the web UI business-state ownership.
- Hardened disconnect, reconnect, missing-session, and rejected-intervention flows so the panel degrades safely and stays aligned to authoritative runtime state.
- Preserved the shipped Phase 7 quality bar with passing acceptance coverage plus saved `Q4/Q6/Q8` regression posture.

**Archives:**
- `.planning/milestones/v1.3-ROADMAP.md`
- `.planning/milestones/v1.3-REQUIREMENTS.md`

---

## v1.2 Agentic Search CLI (Shipped: 2026-04-16)

**Phases completed:** 1 phase, 4 plans, 4 delivered batches

**Key accomplishments:**
- Seeku CLI now runs as a bounded, evidence-driven search agent that can clarify briefly, search, narrow, compare 2-3 candidates, gate recommendations by confidence, and validate itself against saved acceptance and regression baselines.
- Added explicit agent-callable tool contracts and centralized session state above the existing `planner / retriever / reranker` search core.
- Added structured compare outcomes and confidence gates so unsupported recommendations are blocked unless shortlist membership, evidence traceability, and confidence all pass.
- Added a bounded free-form agent policy that chooses between `clarify`, `search`, `narrow`, `compare`, and `decide` without falling into form-like interrogation.
- Added an `agent-eval` harness with `12/12` acceptance fixtures and `3/3` saved regression checks while preserving `Q4` `watch-but-stable`, `Q6` `pass`, and `Q8` `pass`.

**Archives:**
- `.planning/milestones/v1.2-ROADMAP.md`
- `.planning/milestones/v1.2-REQUIREMENTS.md`

---
