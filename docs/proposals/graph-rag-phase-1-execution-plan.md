# Graph Signals Phase 1 Execution Plan

Date: 2026-05-03
Project: Seeku
Status: Draft for execution
Depends on:
- [graph-rag-integration.md](/Users/rosscai/seeku/docs/proposals/graph-rag-integration.md)
- [graph-rag-phase-0-audit-report.md](/Users/rosscai/seeku/docs/proposals/graph-rag-phase-0-audit-report.md)
- [graph-rag-phase-0-baseline-results.md](/Users/rosscai/seeku/docs/proposals/graph-rag-phase-0-baseline-results.md)

## Goal

Materialize explicit graph facts from existing Bonjour crawl artifacts into the database, compute minimal node-level graph facts, and close the Phase 0 gaps that block graph-aware explanation and later rerank work.

Phase 1 is intentionally narrow. It should turn "graph data exists in files" into "graph data is queryable, reproducible, and measurable in the product data layer."

## Non-Goals

- no graph-aware reranker yet
- no result ranking changes in production search
- no GraphTranslator
- no Node2Vec / GraphSAGE / graph model training
- no LLM-generated graph explanations
- no graph pairwise scoring service
- no broad refactor of retrieval architecture

## Required Deliverables

Phase 1 is complete only when all of the following exist:

1. database schema for graph facts
2. repeatable import path from crawl artifacts into DB
3. minimal node-level graph statistics persisted in DB
4. graph-oriented eval query additions for future Phase 2 use
5. documentation of operational commands, coverage, and caveats

Recommended output files:

- `docs/proposals/graph-rag-phase-1-implementation-report.md`
- `docs/proposals/graph-rag-phase-1-graph-eval-additions.md`

Expected code/artifact areas:

- `packages/db/src/schema.ts`
- `packages/db/src/migrations/`
- `packages/db/src/repositories.ts` or a focused graph repository module
- `apps/worker/src/cli/` for import or audit commands if CLI entrypoints are appropriate
- `scripts/graph-audit/` or a similarly scoped scripts directory for import helpers if that fits the repo better
- `packages/eval/datasets/` if graph-oriented eval examples are added there

## Success Criteria

We should be able to answer, with code and database evidence:

- how many `graph_edges` were imported
- how many distinct `persons` are represented in the graph facts layer
- what percentage of crawl-discovered handles mapped to known persons
- how many edges were dropped and why
- basic node-level graph statistics for mapped persons
- what graph-oriented eval queries were added for the next phase

## Decision Gates

### Phase 1 is successful if

- graph facts are materialized in a repeatable way
- the import path is reproducible and operationally understandable
- graph coverage over mapped persons is good enough to support explicit explanation work
- graph-oriented eval coverage exists for Phase 2

### Stop or narrow further if

- handle-to-person mapping is too lossy
- crawl artifacts are too inconsistent to support a reliable importer
- edge semantics are too weak to justify even explanation work
- operational cost of maintaining import exceeds likely product value

## Workstreams

### Workstream A: Graph Schema

Goal:
- add durable database storage for explicit graph facts

Required schema:

1. `graph_edges`
2. `graph_node_features`

Suggested minimum shape:

```sql
CREATE TABLE graph_edges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_person_id UUID NOT NULL REFERENCES persons(id),
  target_person_id UUID NOT NULL REFERENCES persons(id),
  edge_type TEXT NOT NULL CHECK (edge_type IN ('friend', 'friended')),
  source_profile_id UUID REFERENCES source_profiles(id),
  imported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE (source_person_id, target_person_id, edge_type)
);

CREATE TABLE graph_node_features (
  person_id UUID PRIMARY KEY REFERENCES persons(id),
  out_degree INTEGER DEFAULT 0 NOT NULL,
  in_degree INTEGER DEFAULT 0 NOT NULL,
  undirected_degree INTEGER DEFAULT 0 NOT NULL,
  component_id TEXT,
  component_size INTEGER,
  computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
```

Tasks:
1. add schema definitions
2. add migrations
3. ensure indexes exist for source, target, and feature lookup

Acceptance criteria:
- migration applies cleanly
- tables are queryable in the target database

### Workstream B: Edge Import Pipeline

Goal:
- import usable graph edges from authoritative crawl artifacts

Tasks:
1. choose the authoritative crawl run or merging strategy across runs
2. parse `friend` and `friended` arrays from crawl files
3. map handles to `source_profiles`
4. map `source_profiles` to `persons`
5. insert edges only when both ends map to known persons
6. deduplicate repeated observations
7. record import counts and drop reasons

Drop-reason categories should include at minimum:

- missing source handle mapping
- missing target handle mapping
- source profile exists but no person mapping
- target profile exists but no person mapping
- duplicate edge
- malformed record

Questions to answer:
- what percentage of crawl data can be mapped to `persons`?
- should edges from multiple crawl runs be merged or should one run be canonical?
- should repeated sightings be discarded, counted, or preserved in a future metadata column?

Acceptance criteria:
- importer is repeatable
- import summary is documented
- mapped vs dropped percentages are documented

### Workstream C: Node Feature Computation

Goal:
- compute the minimum graph facts needed for explicit explanation and future rerank work

Required v1 features:

- `out_degree`
- `in_degree`
- `undirected_degree`
- `component_id`
- `component_size`

Optional only if cheap and reliable:

- simple centrality summary

Tasks:
1. compute features from imported edges
2. persist them in `graph_node_features`
3. validate counts against direct SQL aggregations

Questions to answer:
- do components over mapped `persons` remain large enough to matter?
- is the head-heavy structure preserved after person mapping?

Acceptance criteria:
- node features are stored for mapped persons
- spot checks confirm feature correctness

### Workstream D: Memory Activation

Goal:
- remove the obvious dormant-memory blocker discovered in Phase 0

Tasks:
1. run `pnpm db:migrate`
2. verify `user_memories` and `candidate_feedback_memories` exist
3. document whether the tables are now usable by current CLI flows

Questions to answer:
- did migration apply cleanly in the actual target DB?
- is there any follow-up wiring gap after table creation?

Acceptance criteria:
- memory tables exist in DB
- verification commands and results are documented

### Workstream E: Graph-Oriented Eval Additions

Goal:
- add a small, explicit set of graph-sensitive eval prompts so Phase 2 can measure graph-aware explanation and ranking changes

Suggested categories:

1. known-person adjacency
2. mutual-connection discovery
3. cluster/community proximity
4. alumni or institution adjacency when backed by graph facts

Tasks:
1. inspect current eval dataset format
2. add a small graph-oriented supplement rather than redesigning the whole harness
3. document expected behavior for each new query

Acceptance criteria:
- graph-oriented eval additions are stored in-repo
- future Phase 2 work has at least a minimal graph-sensitive benchmark

## Suggested Execution Order

1. Graph Schema
2. Memory Activation
3. Edge Import Pipeline
4. Node Feature Computation
5. Graph-Oriented Eval Additions
6. Final implementation report

Why this order:

- schema must land before import
- memory activation is low-cost and removes a parallel blocker
- import must complete before node features can be computed
- eval additions should reflect what graph facts actually exist after import

## Deliverable Structure

The Phase 1 implementation report should include:

1. Executive Summary
2. Schema Changes
3. Import Pipeline
4. Import Coverage And Drop Reasons
5. Node Feature Summary
6. Memory Migration Status
7. Graph Eval Additions
8. Risks And Caveats
9. Recommendation For Phase 2

## Reporting Rules

- distinguish raw crawl counts from person-mapped graph counts
- document all drop reasons explicitly
- do not over-claim edge semantics
- do not frame imported edges as trust or collaboration
- include exact commands for migration and import
- prefer idempotent import behavior where feasible

## Preferred Evidence Sources

Use, in order:

1. database queries after migration/import
2. repository schema and migration files
3. authoritative crawl artifacts
4. eval dataset diffs and harness outputs

## Risks To Watch During Phase 1

- person mapping may be much lower than crawl handle coverage
- duplicate observations across multiple crawl runs may inflate counts
- `friend`/`friended` direction may be easy to invert incorrectly
- imported graph may still reflect BFS hub bias strongly enough to distort future features
- memory migrations may reveal latent code-path assumptions

## Final Recommendation Format

The final Phase 1 recommendation must end with exactly one of these outcomes:

1. `Proceed to Phase 2: graph-aware rerank is ready to test`
2. `Proceed narrowly: only graph-backed explanation is ready`
3. `Defer Phase 2: mapped graph coverage is insufficient`
4. `Defer Phase 2: graph facts exist but eval readiness is insufficient`

If recommending proceed, include the top 3 concrete prerequisites for Phase 2.
