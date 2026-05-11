# Milestone v1.9: Graph Signals Reranking

**Status:** COMPLETE
**Started:** 2026-05-03
**Completed:** 2026-05-03
**Phase range:** 15

## Overview

This milestone turns the already-materialized Bonjour graph into a measurable ranking signal. The goal is not to train graph models yet, but to test whether explicit graph features improve candidate ordering on top of the current hybrid retriever and existing graph-backed explanation layer.

## Included Phase

### Phase 15: Graph Signals Reranking

**Goal:** Add rerank-only graph features, measure quality lift with graph-sensitive evals, and preserve trustworthy explanation semantics.

**Depends on:** graph facts materialized in DB, Phase 2a graph explanation complete, Phase 2b memory verification complete

**Plans:**
- [x] `15-01-PLAN.md` — graph feature definitions, search-stack integration point, and eval contract
- [x] `15-02-PLAN.md` — rerank implementation, candidate metadata plumbing, and tests
- [x] `15-03-PLAN.md` — eval execution, quality analysis, and go / no-go recommendation

## Milestone Guardrails

- keep current hybrid retrieval as the base candidate generator
- add graph only after retrieval, not as a replacement retriever
- preserve accurate follow/follower semantics
- do not imply trust, collaboration, or friendship
- do not introduce graph-model training in this milestone
- do not widen “memory complete” into personalization claims beyond verified CLI behavior

## Planned Outcome

- graph features participate in candidate reranking
- graph-sensitive eval queries can measure lift
- the team can decide from evidence whether graph reranking is worth keeping or extending

## References

- `.planning/PROJECT.md`
- `.planning/STATE.md`
- `.planning/REQUIREMENTS.md`
- `docs/proposals/graph-rag-review.md`
- `docs/proposals/graph-rag-integration.md`
- `docs/proposals/graph-rag-phase-1-implementation-report.md`
- `docs/proposals/graph-rag-phase-2-implementation-report.md`
- `docs/proposals/graph-rag-phase-2b-implementation-report.md`
