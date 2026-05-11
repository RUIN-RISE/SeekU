# Requirements — Seeku v1.9

Milestone: `v1.9 Graph Signals Reranking`
Status: Complete
Started: 2026-05-03
Completed: 2026-05-03

## Active Requirements

### Rerank Integration

- [x] `GRAPH-RERANK-01` — The existing hybrid retriever remains the base candidate generator.
- [x] `GRAPH-RERANK-02` — Graph signals are applied only as a rerank layer after retrieval.
- [x] `GRAPH-RERANK-03` — The first graph rerank feature set uses explicit graph facts only.

### Feature Semantics

- [x] `GRAPH-FEAT-01` — Graph features preserve Bonjour follow/follower semantics and do not imply trust or collaboration.
- [x] `GRAPH-FEAT-02` — Missing graph data degrades safely without breaking ranking or display.
- [x] `GRAPH-FEAT-03` — Pairwise graph signals are only used when an anchor person or equivalent comparison context is available.

### Evaluation And Decision

- [x] `GRAPH-EVAL-01` — Graph-sensitive eval queries exist for rerank validation.
- [x] `GRAPH-EVAL-02` — The rerank path is measured against the current baseline with explicit metrics.
- [x] `GRAPH-EVAL-03` — The milestone ends with a go / no-go recommendation for keeping or extending graph reranking.

## Milestone Notes

- This milestone is about graph-aware reranking, not graph-model training.
- Memory wiring is considered complete for the interactive CLI based on Phase 2b verification.
- GraphTranslator, GraphSAGE, Node2Vec, and `memU` remain out of scope unless a later milestone explicitly reopens them.
