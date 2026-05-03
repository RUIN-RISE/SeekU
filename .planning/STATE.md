---
gsd_state_version: 1.0
milestone: v1.9
milestone_name: Graph Signals Reranking
status: milestone complete; Phase 15.2 canary prep complete
stopped_at: Phase 15.2 complete - ready for canary
last_updated: "2026-05-03T16:00:00+08:00"
progress:
  total_phases: 1
  completed_phases: 1
  total_plans: 3
  completed_plans: 3
---

# Project State

## Project Reference

See:
- `.planning/PROJECT.md`
- `.planning/ROADMAP.md`
- `.planning/MILESTONES.md`

**Core value:** Find the right AI talent through what they've done, not what they claim. Evidence-based matching over profile text matching.
**Current focus:** v1.9 Graph Signals Reranking is complete. Next step is canary rollout execution and monitoring.

## Current Position

- Active milestone: `v1.9 Graph Signals Reranking` - **COMPLETE**
- Current phase: `Phase 15: Graph Signals Reranking` - **COMPLETE**
- Status: canary prep complete, rollout checklist ready
- Last activity: 2026-05-03 — completed rollout prep and canary readiness docs

## Latest Shipped Milestone

- milestone: `v1.8 CLI-First Session Ledger`
- roadmap: `.planning/ROADMAP.md`
- requirements: `.planning/REQUIREMENTS.md`
- phase summary:
  - `.planning/phases/14-cli-first-session-ledger/01-SUMMARY.md`
  - `.planning/phases/14-cli-first-session-ledger/02-SUMMARY.md`
  - `.planning/phases/14-cli-first-session-ledger/03-SUMMARY.md`
  - `.planning/phases/14-cli-first-session-ledger/04-SUMMARY.md`
- verification:
  - 53 tests pass (session-ledger, resume-resolver, workflow-ledger)
  - 11/11 requirements PASS
  - 5 residual risks documented

## Current Milestone Context

- graph facts are materialized in DB (`graph_edges`, `graph_node_features`)
- graph explanation and candidate graph metadata are already present in the CLI
- interactive CLI memory bootstrap / capture / feedback / inference are verified complete
- graph embedding training remains blocked by low embedding coverage and is intentionally deferred
- the next valid experiment is rerank-only graph lift using explicit features and evals

## Carry-forward Quality Guardrails

- Preserve current search-quality posture:
  - `Q4`: `watch-but-stable`
  - `Q6`: `pass`
  - `Q8`: `pass`
- Do not reopen discovery or GitHub expansion by default.
- Keep recommendation honesty, compare gating, and CLI runtime authority intact.
- Keep CLI runtime authority single-sourced and do not reintroduce browser-owned interaction as a formal product dependency.
- Keep restore scope bounded to chat history and workboard snapshot until a later batch explicitly expands it.
- Transcript model event-entry writes deferred to future milestone.
- Keep graph work interpretable and template-backed; do not imply trust, collaboration, or friendship from Bonjour follow edges.
- Keep graph work off the retrieval hot path until rerank-only value is demonstrated.

## Residual Risks (from v1.8)

1. Transcript model is message-only in writes — event entries parsed but not generated.
2. Cache files are unversioned — no schema migration path, relies on coercion.
3. DB schema still evolving — agent_sessions may need migration.
4. Single-user assumption — no concurrent-session locking.
5. Restore scope is narrow — only chat history and latest workboard snapshot.

## Previous Shipped Milestone Snapshot

- milestone: `v1.7 Runtime-Backed Chat Agent Integration`
- roadmap archive: `.planning/milestones/v1.7-ROADMAP.md`
- requirements archive: `.planning/milestones/v1.7-REQUIREMENTS.md`
- phase summary:
  - `.planning/phases/13-runtime-backed-chat-agent-integration/04-SUMMARY.md`

## Session Continuity

Last session: 2026-05-03
Phase 15 complete. Recommendation: **Proceed with canary**.

### Phase 15 Deliverables

1. **15-01**: Graph feature contract defined (pairwise only, conservative boosts)
2. **15-02**: Reranker extended with graph boost computation
3. **15-03**: Eval executed, recommendation produced

### Key Results

- Graph-sensitive queries: 75% feature coverage, 15 boosts applied
- Non-graph queries: 0% feature coverage, identical baseline/experiment
- No regressions on baseline queries
- Recommendation: Proceed with graph rerank
