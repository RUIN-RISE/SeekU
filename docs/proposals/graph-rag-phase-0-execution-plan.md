# Graph Signals Phase 0 Execution Plan

Date: 2026-05-03
Project: Seeku
Status: Draft for execution
Depends on:
- [graph-rag-integration.md](/Users/rosscai/seeku/docs/proposals/graph-rag-integration.md)
- [graph-rag-review.md](/Users/rosscai/seeku/docs/proposals/graph-rag-review.md)

## Goal

Establish the real data state and the current retrieval baseline before any graph model training, GraphTranslator exploration, or memU-style memory expansion.

Phase 0 should answer four questions with evidence:

1. How complete is the Bonjour friend-link graph in the current system?
2. How complete is embedding coverage across `persons` and searchable candidates?
3. What is the current retrieval quality baseline?
4. Is graph work justified enough to proceed to an explicit graph facts layer and graph-aware reranking?

## Non-Goals

- no GraphTranslator implementation
- no GraphSAGE or Node2Vec training
- no new graph tables or production schema changes beyond lightweight audit helpers if absolutely needed
- no graph-aware reranker changes yet
- no memU integration
- no proactive recommendation workflows

## Required Deliverables

Phase 0 is complete only when all of the following exist:

1. a written audit report under `docs/proposals/`
2. reproducible commands or scripts used to generate the audit
3. a baseline metrics report for current retrieval
4. a recommendation section with explicit go / no-go criteria for Phase 1

Recommended output files:

- `docs/proposals/graph-rag-phase-0-audit-report.md`
- `docs/proposals/graph-rag-phase-0-baseline-results.md`

Optional supporting artifacts:

- `scripts/graph-audit/` for reproducible queries or ETL helpers
- exported CSV or JSON summaries under a clearly named temp or artifact path

## Success Criteria

We should be able to state, with concrete numbers:

- total `persons`
- total Bonjour-linked profiles
- total `search_embeddings`
- embedding coverage as a percentage of `persons`
- number of profiles with friend-link preview data
- estimated number of usable graph edges
- number of connected components
- isolated node count
- degree distribution summary
- current retrieval baseline using agreed ranking metrics

## Decision Gates

### Continue to Phase 1 only if

- graph coverage is high enough to support explicit graph facts work
- the crawl/import path is reproducible enough to maintain
- retrieval baseline leaves clear room for graph-based improvement

### Stop or defer graph work if

- friend-link coverage is too sparse or too biased to trust
- edge semantics are too weak to support explanations
- retrieval baseline is already strong enough that expected graph lift is marginal
- the effort required to improve graph coverage is disproportionate to likely ranking gains

## Workstreams

### Workstream A: Data Inventory

Goal:
- establish the ground truth for search, profile, and embedding coverage

Tasks:
1. count total `persons`
2. count total `source_profiles`
3. count Bonjour `source_profiles`
4. count searchable candidates in `search_documents`
5. count rows in `search_embeddings`
6. compute embedding coverage percentages across:
   - all `persons`
   - Bonjour-backed `persons`
   - search-indexed `persons`

Questions to answer:
- is the current denominator in prior docs wrong?
- are embeddings missing because indexing has not run, because data is incomplete, or because some persons are intentionally excluded?

Acceptance criteria:
- numbers are documented
- query definitions are documented
- discrepancies with existing proposal text are called out explicitly

### Workstream B: Friend-Link Coverage Audit

Goal:
- determine how much usable social graph data actually exists today

Tasks:
1. count profiles containing `authFriendLinkPreview`
2. inspect the shape of stored preview data
3. determine whether friend-link data is only preview metadata or whether usable edge lists exist in stored crawl outputs
4. locate the authoritative crawl/import artifacts and commands
5. measure current coverage by:
   - count of profiles with friend-link payloads
   - count of distinct handles observed in crawl output
   - estimated edge count from raw crawl data if possible

Questions to answer:
- is the current repo state missing imports, missing crawls, or both?
- what part of the graph is sampled by bounded BFS rather than comprehensively ingested?
- what is the likely bias introduced by the current crawl strategy?

Acceptance criteria:
- coverage percentage is documented
- data provenance is documented
- import gap vs crawl gap is explicitly identified

### Workstream C: Graph Shape Audit

Goal:
- estimate whether the available graph is structurally useful

Tasks:
1. reconstruct a temporary edge list from available crawl output if feasible
2. compute:
   - node count
   - edge count
   - average degree
   - top-degree nodes
   - connected component count
   - giant component size
   - isolated node count
3. inspect edge-type semantics:
   - `friend`
   - `friended`
4. document whether the graph should be treated as directed, undirected, or both depending on the feature

Questions to answer:
- is there a usable giant component?
- is the graph too fragmented for rerank features to matter?
- do `friend` and `friended` have distinct product meaning or should v1 collapse them for some metrics?

Acceptance criteria:
- graph structure summary is documented
- risks from sparsity and BFS bias are documented

### Workstream D: Retrieval Baseline

Goal:
- quantify current retrieval quality before graph changes

Tasks:
1. inspect the current eval dataset and harness
2. decide whether the existing evaluation set is sufficient for graph-sensitive scenarios
3. define baseline metrics:
   - `Precision@5`
   - `Precision@10`
   - `NDCG@10`
   - query coverage
4. run the current retrieval pipeline and record results
5. identify query buckets where graph signals might plausibly help:
   - known-person expansion
   - community proximity
   - warm intro / trust adjacency
   - alumni / institutional clusters

Questions to answer:
- is the current eval set mostly content-only search?
- do we need a supplemental graph-oriented query set before Phase 1?
- where is the baseline weak enough that graph signals are worth testing?

Acceptance criteria:
- baseline metrics are written down
- query categories are documented
- candidate graph-sensitive eval gaps are documented

### Workstream E: Memory Readiness Check

Goal:
- confirm whether existing memory work is ready to be activated instead of introducing memU

Tasks:
1. verify the presence of current migrations and code paths
2. check whether migrations have been run in the target database
3. verify whether current CLI flows reference the memory system in real usage paths
4. document gaps between "schema/code exists" and "feature is operational"

Questions to answer:
- is the main blocker migration state, wiring, or UX completeness?
- what is the smallest Phase 3 path to activate memory usefully?

Acceptance criteria:
- a short readiness summary exists
- memU remains explicitly unjustified unless a concrete gap is found

## Suggested Execution Order

1. Data Inventory
2. Friend-Link Coverage Audit
3. Graph Shape Audit
4. Retrieval Baseline
5. Memory Readiness Check
6. Final synthesis report

This order matters because later work depends on earlier truth:

- graph audit depends on knowing where data actually lives
- baseline interpretation depends on understanding coverage gaps
- phase recommendations depend on both graph quality and current retrieval quality

## Deliverable Structure

The main audit report should include these sections:

1. Executive Summary
2. Data Coverage Snapshot
3. Friend-Link Coverage And Provenance
4. Graph Shape Summary
5. Retrieval Baseline
6. Memory Readiness
7. Risks And Unknowns
8. Recommendation
9. Phase 1 Prerequisites

## Reporting Rules

- do not hand-wave with approximate language when exact counts are available
- distinguish observed facts from inference
- include the exact commands or SQL used
- call out contradictions with prior docs explicitly
- prioritize engineering consequences over academic novelty

## Preferred Evidence Sources

Use, in order:

1. live database queries
2. repository code and migrations
3. local crawl artifacts and dumps
4. existing eval harness outputs

Do not rely on prior proposal claims unless verified.

## Risks To Watch During Phase 0

- bounded BFS may create a misleading graph that overrepresents head nodes
- raw payload presence may not equal usable edge availability
- `persons`, `source_profiles`, and `search_embeddings` may use different effective denominators
- retrieval baseline may mix workflow quality and pure ranking quality
- memory code may exist but not be wired into the dominant user path

## Final Recommendation Format

The final Phase 0 recommendation must end with exactly one of these outcomes:

1. `Proceed to Phase 1: graph facts layer is justified`
2. `Proceed narrowly: only explicit graph facts and explanation work are justified`
3. `Defer graph work: data quality is insufficient`
4. `Defer graph work: baseline does not justify expected cost`

If recommending proceed, include the top 3 concrete prerequisites.
