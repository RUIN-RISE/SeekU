# Milestones

Earlier milestone history before explicit archival discipline remains in git and the phase summaries under `.planning/phases/`.

## v1.6 Mission Replay Hardening (Shipped: 2026-04-18)

**Phases completed:** 1 phase, 4 plans, 4 delivered batches

**Key accomplishments:**
- Added first-class replay fixtures for the shipped bounded mission runner instead of relying only on scattered deterministic mission mocks.
- Added explicit replay evidence capture and failure taxonomy for `false_stop`, `late_stop`, `wrong_stage_report`, and `ui_semantic_mismatch`.
- Used replay evidence to drive a bounded semantic fix so clarification stops now focus the right rail on goal tightening instead of shortlist-first review.
- Closed the milestone with a replay-backed acceptance verdict while keeping mission scope intentionally narrow.

**Archives:**
- `.planning/milestones/v1.6-ROADMAP.md`
- `.planning/milestones/v1.6-REQUIREMENTS.md`

---

## v1.5 Chat-First Copilot (Shipped: 2026-04-18)

**Phases completed:** 2 phases, 8 plans, 8 delivered batches

**Key accomplishments:**
- Seeku now uses `/chat` as the default primary operator surface instead of splitting the product across chat, panel, and deal-flow first-class entry points.
- Added a narrated, read-only session workboard that folds runtime posture, shortlist/compare state, recommendation posture, and proactive top picks into one session-centric right rail.
- Added a bounded foreground mission runner for large-scope candidate search with explicit phases, stop reasons, and natural-language course correction.
- Hardened mission stop behavior so the product defaults to shortlist-first or compare-first reporting rather than premature top1 recommendation, and routes noisy missions to clarification.

**Archives:**
- `.planning/milestones/v1.5-ROADMAP.md`
- `.planning/milestones/v1.5-REQUIREMENTS.md`

---

## v1.4 Daily Deal Flow (Shipped: 2026-04-17)

**Phases completed:** 1 phase, 4 plans, 4 delivered batches

**Key accomplishments:**
- Seeku now ships a proactive in-product daily deal flow that turns the existing evidence corpus into a ranked list of people worth contacting today instead of waiting for a reactive search.
- Added shared goal-direction modeling, candidate public-expression direction profiling, and a direction-first opportunity scorer above the existing search/runtime foundation.
- Added a dedicated `/deal-flow` surface with actionable candidate cards that explain `why this person`, `why now`, `how to approach`, and how confident the system is.
- Added explicit feedback and implicit interaction capture that measurably change later deal-flow output, including drift-note handling when recent behavior diverges from the explicit long-term goal.

**Archives:**
- `.planning/milestones/v1.4-ROADMAP.md`
- `.planning/milestones/v1.4-REQUIREMENTS.md`

---

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
