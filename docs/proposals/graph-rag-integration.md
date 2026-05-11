# Seeku Graph Signals And Memory RFC v2

**Status**: Proposed
**Last updated**: 2026-05-03
**Supersedes**: previous GraphTranslator-first draft

---

## 1. Executive Summary

Seeku should **not** start with GraphTranslator or memU.

The pragmatic path is:

1. audit the real state of Bonjour friend-link data and embedding coverage
2. establish offline and workflow-level eval baselines
3. integrate explicit graph signals as rerank features and explanations
4. activate and enhance the existing SQL-based memory system

This RFC replaces the earlier "Graph RAG + GraphTranslator + memU" framing with a staged plan optimized for engineering ROI, lower integration risk, and measurable decision points.

---

## 2. Why This RFC Changed

The original proposal assumed:

- the Bonjour social graph was already available as a usable retrieval layer
- GraphTranslator was a reasonable first implementation step
- memU would add missing memory capabilities

Review findings show these assumptions are not strong enough yet:

- social graph coverage is incomplete and not materialized as a first-class graph table
- only a minority of persons currently have vector embeddings
- Seeku already has memory schema and CLI-side memory flows designed
- current retrieval is more mature than the original proposal acknowledged

Because of that, the first job is to establish data truth and a measurable baseline, not to introduce a research-heavy graph-to-language model.

---

## 3. Current Reality

### 3.1 Product context

Seeku is an evidence-driven AI talent search engine. Its primary value is not open-ended graph QA. Its primary value is high-quality candidate retrieval, ranking, comparison, and decision support.

That means any graph integration must first prove it improves:

- ranking quality
- recall for hard talent-search queries
- explanation quality
- user trust

### 3.2 Known system facts

Based on the current repository and review:

- retrieval already uses a hybrid design with keyword and vector scoring
- memory schema already exists in SQL migrations
- memory-related CLI flows already exist in code
- Bonjour friend-link ingestion exists as tooling, but the graph is not yet a complete queryable layer
- embedding coverage is incomplete, so graph models that require node features are currently constrained

### 3.3 Implications

These facts shift the design priorities:

- explanation v1 should come from explicit graph evidence, not LLM-generated summaries
- graph value should be tested through features and reranking before graph model training
- memory work should extend the current architecture instead of introducing a second memory stack

---

## 4. Goals

### 4.1 Primary goals

1. improve candidate ranking with graph-derived features where graph data is available
2. provide evidence-based explanations for graph-influenced recommendations
3. support persistent user preference memory using the current Seeku memory architecture
4. make every major step measurable with clear stop/go criteria

### 4.2 Non-goals for v1

- no GraphTranslator training
- no graph-to-language alignment pipeline
- no memU integration
- no online Python graph inference service
- no open-ended graph QA experience

---

## 5. Design Principles

### 5.1 Evidence over generation

If Seeku says a graph signal matters, the system must be able to point to explicit supporting evidence such as:

- direct friend/friended links
- shared neighbors
- graph-derived proximity scores
- shared institutions or tags supported by indexed profile evidence

### 5.2 Baseline before optimization

We do not train graph models or add new memory subsystems before we know:

- what the current retrieval baseline is
- what graph coverage actually is
- whether simpler graph heuristics help

### 5.3 Extend existing architecture

Seeku already has:

- hybrid retrieval logic
- SQL-backed data storage
- planned memory tables and flows

New work should fit those boundaries unless there is a strong measured reason not to.

### 5.4 Stage complexity

The cheapest credible experiment comes first:

- explicit graph features
- then simple graph embeddings if needed
- then learned graph models only if the earlier stages prove graph signals matter enough

---

## 6. Proposed Architecture

### 6.1 High-level flow

```text
User query
  -> existing hybrid retrieval
  -> optional graph feature enrichment for candidate set
  -> rerank with graph-aware features
  -> explanation layer with explicit graph evidence
  -> shortlist / compare flow

User actions
  -> existing feedback + preference capture
  -> SQL-backed user memory
  -> bootstrap and refinement support in future searches
```

### 6.2 Architecture changes for v1

Add:

- a first-class graph facts layer in Postgres
- offline graph feature computation jobs
- graph-aware rerank features in the search pipeline
- explicit graph explanation rendering
- activation of current memory migrations and query-time use

Do not add:

- Translator training pipeline
- graph-to-LLM alignment layer
- separate memory runtime or file-based memory system

---

## 7. Data Model Direction

### 7.1 Graph facts layer

We should materialize graph edges explicitly instead of relying on partial raw payload presence.

Recommended tables:

```sql
CREATE TABLE graph_edges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_person_id UUID NOT NULL REFERENCES persons(id),
  target_person_id UUID NOT NULL REFERENCES persons(id),
  edge_type TEXT NOT NULL CHECK (edge_type IN ('friend', 'friended')),
  source_profile_id UUID REFERENCES source_profiles(id),
  imported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (source_person_id, target_person_id, edge_type)
);

CREATE INDEX idx_graph_edges_source ON graph_edges(source_person_id);
CREATE INDEX idx_graph_edges_target ON graph_edges(target_person_id);
```

### 7.2 Graph feature storage

V1 should store precomputed graph features, not model outputs:

```sql
CREATE TABLE graph_node_features (
  person_id UUID PRIMARY KEY REFERENCES persons(id),
  out_degree INTEGER DEFAULT 0 NOT NULL,
  in_degree INTEGER DEFAULT 0 NOT NULL,
  undirected_degree INTEGER DEFAULT 0 NOT NULL,
  pagerank DOUBLE PRECISION,
  component_id TEXT,
  component_size INTEGER,
  computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
```

Optional later:

```sql
CREATE TABLE graph_pair_features (
  query_anchor_person_id UUID NOT NULL REFERENCES persons(id),
  candidate_person_id UUID NOT NULL REFERENCES persons(id),
  common_neighbor_count INTEGER DEFAULT 0 NOT NULL,
  shortest_path_length INTEGER,
  ppr_score DOUBLE PRECISION,
  computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
```

### 7.3 Memory

Use the current Seeku memory design as the canonical memory contract:

- `user_memories`
- `candidate_feedback_memories`
- existing scope and source semantics

No parallel memory abstraction should be introduced in v1.

---

## 8. Retrieval Strategy

### 8.1 Baseline

Keep the current hybrid retrieval path as the base candidate generator.

### 8.2 Graph-aware rerank

Apply graph features only after a candidate set has already been retrieved by the existing search system.

Candidate v1 features:

- `neighbor_count`
- `pagerank`
- `shared_neighbor_count`
- `same_component`
- `shortest_path_length` when the query references a known person
- source confidence adjustments for sparse or partial graph data

### 8.3 Why rerank first

Rerank-first is the right first step because it:

- fits the current TypeScript retrieval stack
- keeps graph work off the hot path except for cheap lookups
- is easy to A/B against the current retriever
- produces interpretable evidence

---

## 9. Explanation Strategy

### 9.1 V1 explanation rules

Explanations must be built from explicit graph facts, for example:

- "Shares 4 mutual Bonjour connections with X"
- "Appears in the same local graph component as Y"
- "Has unusually strong graph centrality within the candidate cluster"

### 9.2 What v1 explanations must not do

They must not claim:

- collaboration without evidence
- project co-work without evidence
- closeness or trust beyond the graph semantics
- skill strength inferred only from network position

### 9.3 Why no LLM explanation layer yet

The first problem is trust, not expressiveness. Template-driven explanations are safer and easier to audit than generated graph narratives.

---

## 10. Memory Strategy

### 10.1 Decision

Enhance the existing memory system. Do not integrate memU.

### 10.2 Why

The current repo already contains:

- schema for explicit and inferred user memory
- schema for candidate feedback events
- bootstrap logic for memory-aware search defaults
- capture logic for preference and feedback flows

That means the practical gap is execution and integration depth, not absence of a memory design.

### 10.3 Scope for v1

1. run and verify the existing memory migrations
2. ensure preference capture and retrieval work in the real search flow
3. use explicit memory to seed defaults
4. keep inferred memory informational unless validated further

### 10.4 Out of scope

- proactive recommendation daemon
- external memory runtime
- file-system memory design

---

## 11. Training Strategy

### 11.1 No graph model training in v1

We should not begin with GraphSAGE or GraphTranslator training.

### 11.2 If graph learning becomes necessary

Recommended order:

1. heuristic graph features
2. Node2Vec or similar unsupervised graph embeddings
3. GraphSAGE only if:
   - graph coverage is strong enough
   - embedding coverage is materially improved
   - eval shows simpler graph signals provide meaningful lift

### 11.3 Why GraphSAGE is not first

Today it is blocked by multiple uncertainties:

- incomplete graph coverage
- incomplete node feature coverage
- unclear supervised objective
- unclear incremental ROI over heuristics

### 11.4 GraphTranslator status

GraphTranslator is explicitly deferred.

It may be revisited only if:

- graph signal value is proven in earlier stages
- product scope expands toward open-ended graph reasoning
- a clear, high-value alignment use case appears that heuristic explanations cannot satisfy

---

## 12. Tech Stack Recommendation

### 12.1 Recommended stack

Use:

- **Python** for offline graph ETL, analytics, and optional future graph embedding training
- **TypeScript** for online retrieval, reranking, explanation rendering, and memory integration
- **PostgreSQL** as the canonical storage layer for graph facts, features, and memory

### 12.2 Why this fits Seeku

- the online system is already TypeScript-first
- graph training and analysis libraries are strongest in Python
- v1 does not require online graph model inference
- precomputed features can be read cheaply from Postgres

### 12.3 Not recommended

- full TypeScript graph training stack
- separate Python inference service for v1
- ONNX investment before a proven graph model use case exists

---

## 13. Delivery Plan

### Phase 0: Data Audit And Baseline

**Goal**

Establish the true shape of graph coverage, embedding coverage, and current retrieval quality.

**Outputs**

- real friend-link coverage report
- real edge count and graph density summary
- embedding coverage report by person/source
- eval baseline for current retrieval quality

**Key tasks**

1. materialize graph import status from existing Bonjour crawl artifacts
2. measure connected components, isolated nodes, and degree distribution
3. define eval metrics for retrieval and ranking
4. run the current system against the agreed evaluation set

**Exit criteria**

- we can quantify graph coverage
- we can quantify current retrieval quality

### Phase 1: Graph Facts Layer

**Goal**

Create a stable graph storage and feature computation layer.

**Outputs**

- `graph_edges`
- `graph_node_features`
- repeatable ETL job

**Key tasks**

1. import friend/friended edges into explicit tables
2. deduplicate and validate edge semantics
3. compute node-level graph statistics

**Exit criteria**

- graph facts are queryable without inspecting raw payloads

### Phase 2: Graph Feature Rerank

**Goal**

Measure whether graph signals improve ranking quality enough to justify more investment.

**Outputs**

- graph-aware rerank features in search
- explicit explanation templates
- offline comparison report vs baseline

**Key tasks**

1. add graph features to candidate scoring
2. add graph evidence to result explanations
3. compare against baseline using agreed metrics

**Exit criteria**

- measurable quality lift or a justified decision to stop

### Phase 3: Memory Activation And Enhancement

**Goal**

Operationalize the current memory architecture in the product flow.

**Outputs**

- verified migrations applied
- preference memory in search bootstrap
- feedback capture connected to real usage

**Key tasks**

1. apply and validate memory migrations
2. verify end-to-end preference capture and retrieval
3. confirm explicit vs inferred memory behavior

**Exit criteria**

- users can benefit from remembered preferences without a second memory stack

### Phase 4: Optional Graph Learning

**Goal**

Only if earlier phases show value, test whether learned graph embeddings outperform feature-based reranking.

**Candidate work**

- Node2Vec
- simple unsupervised graph embeddings
- later GraphSAGE if justified

**Not included**

- GraphTranslator unless separately approved after a new RFC

---

## 14. Evaluation Plan

### 14.1 Retrieval metrics

Define and track at minimum:

- Precision@5
- Precision@10
- NDCG@10
- query coverage rate
- workflow-level shortlist usefulness where applicable

### 14.2 Explanation metrics

Evaluate:

- correctness of graph explanation
- user trust in explanation
- frequency of explanation suppression due to insufficient evidence

### 14.3 Memory metrics

Evaluate:

- explicit preference capture rate
- acceptance of memory-seeded defaults
- frequency of ignored or rejected remembered preferences

### 14.4 Evaluation principle

No claims such as "+15-25% accuracy" should remain in the plan unless backed by measured baseline and experiment results.

---

## 15. Risks

### 15.1 Data risks

- incomplete friend-link coverage
- BFS sampling bias from graph crawl strategy
- incomplete embedding coverage
- identity resolution errors producing wrong edges

### 15.2 Modeling risks

- graph signals may not improve ranking enough to matter
- high-degree nodes may receive unfair boosts
- graph centrality may proxy popularity instead of relevance

### 15.3 Product risks

- graph explanations may confuse users if edge semantics are weak
- remembered preferences may feel invasive if over-applied
- active recommendation should not be introduced before opt-in and relevance are validated

### 15.4 Architecture risks

- repeated investment in a second memory system
- premature addition of research-heavy graph alignment components
- extra operational burden from unnecessary online services

---

## 16. Kill Criteria

Stop graph-learning escalation if any of the following is true:

- graph coverage remains too low to support reliable ranking features
- graph feature rerank shows little or no meaningful lift
- explanation quality is low because edge semantics are not trustworthy
- the cost of maintaining graph ETL outweighs observed search benefit

Stop any GraphTranslator exploration unless:

- graph features already demonstrate strong value
- a specific product requirement cannot be met by explicit graph explanations
- the new requirement justifies alignment/training complexity

Stop memU consideration unless:

- the current SQL memory model is proven insufficient for a clearly defined need
- that need cannot be solved by extending the current schema and flows

---

## 17. Decision Log

### Accepted

- use graph signals as features before graph models
- use explicit evidence for explanations before generation
- extend current memory system before evaluating new memory frameworks
- keep online serving in TypeScript

### Deferred

- GraphTranslator
- GraphSAGE
- memU
- proactive candidate push workflows

### Rejected for v1

- graph-to-language alignment as a first milestone
- free-form LLM-generated graph explanations
- parallel memory architecture
