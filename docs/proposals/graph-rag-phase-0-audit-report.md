# Graph Signals Phase 0 Audit Report

**Date**: 2026-05-03
**Project**: Seeku
**Status**: Completed

## Executive Summary

This audit establishes the real data state for Seeku's Graph Signals and Memory RFC. The findings reveal significant gaps between proposal assumptions and actual data coverage.

**Key Findings**:
1. Friend-link data exists in crawl artifacts but is NOT imported as usable graph edges
2. Embedding coverage is only 32.1%, blocking graph model training
3. Memory schema exists but migrations have NOT been executed
4. Current retrieval baseline is reasonable (11/12 acceptance tests pass)

**Recommendation**: `Proceed narrowly: only explicit graph facts and explanation work are justified`

---

## 1. Data Coverage Snapshot

### 1.1 Core Counts

| Metric | Count | Notes |
|--------|-------|-------|
| Total `persons` | 25,191 | All active status |
| Total `source_profiles` | 26,061 | - |
| Bonjour `source_profiles` | 23,281 | 89.4% of all profiles |
| Total `search_documents` | 25,191 | 1:1 with persons |
| Total `search_embeddings` | 8,074 | **32.1% coverage** |

### 1.2 Embedding Coverage

| Category | Count | Percentage |
|----------|-------|------------|
| Persons with embeddings | 8,074 | 32.1% of all persons |
| Bonjour-linked persons | 22,497 | 89.3% of all persons |
| Bonjour persons with embeddings | 7,928 | 35.2% of Bonjour persons |

**Gap**: 68% of persons lack vector embeddings, blocking graph model training that requires node features.

### 1.3 SQL Queries Used

```sql
-- Total persons
SELECT COUNT(*) FROM persons;
-- Result: 25191

-- Total source profiles
SELECT COUNT(*) FROM source_profiles;
-- Result: 26061

-- Bonjour profiles
SELECT COUNT(*) FROM source_profiles WHERE source = 'bonjour';
-- Result: 23281

-- Total embeddings
SELECT COUNT(*) FROM search_embeddings;
-- Result: 8074

-- Persons linked to Bonjour profiles
SELECT COUNT(DISTINCT pi.person_id)
FROM person_identities pi
JOIN source_profiles sp ON pi.source_profile_id = sp.id
WHERE sp.source = 'bonjour';
-- Result: 22497
```

---

## 2. Friend-Link Coverage And Provenance

### 2.1 Current Database State

| Metric | Count |
|--------|-------|
| Profiles with `authFriendLinkPreview` in raw_payload | 2,430 |
| Friend-link profiles linked to persons | 2,408 |
| Usable edge data in database | **0** |

**Critical Finding**: The `authFriendLinkPreview` data in `raw_payload` contains only preview metadata (handle, name, avatar, edgeTypes, sightings), NOT actual edge lists.

Sample structure:
```json
{
  "name": null,
  "avatar": null,
  "handle": "3zzwb6",
  "edgeTypes": ["friended"],
  "sightings": 1,
  "importedAt": "2026-04-14T15:39:26.483Z",
  "sourceFiles": ["2gy47l.json"]
}
```

### 2.2 Crawl Artifact State

Friend-link data EXISTS in crawl output files but has NOT been imported:

| Metric | Value |
|--------|-------|
| Unique profiles with friend-links data in crawl artifacts | 16,411 |
| Total direct (friend) edges in crawl | 127,338 |
| Total reverse (friended) edges in crawl | 131,938 |
| Estimated total edges (undirected) | ~129,000 |

### 2.3 Crawl Artifact Locations

```
output/bonjour-raw/2026-05-02/bonjour-frontier-2026-05-02/friend-links-index.json
output/bonjour-raw/2026-05-02/bonjour-frontier-depth1-2026-05-02/friend-links-index.json
output/bonjour-raw/2026-05-02/bonjour-frontier-depth2-2026-05-02/friend-links-index.json
... (multiple historical runs)
```

### 2.4 Degree Distribution from Crawl Data

| Neighbor Count | Profiles | Percentage |
|----------------|----------|------------|
| 0 | 120 | 0.7% |
| 1-5 | 9,110 | 55.5% |
| 6-20 | 4,372 | 26.6% |
| 21-50 | 1,740 | 10.6% |
| 51-100 | 676 | 4.1% |
| 100+ | 393 | 2.4% |

**Median degree**: 4 neighbors

### 2.5 Import Gap Analysis

- **Import script exists**: `apps/worker/src/cli/import-bonjour-friend-links.ts`
- **What it does**: Imports mini-profile metadata, NOT edge lists
- **What's missing**: No script to materialize edges into a graph table
- **Effort to fix**: Requires new ETL to parse friend/friended arrays and create edge records

---

## 3. Graph Shape Summary

### 3.1 Estimated Graph Structure (from crawl artifacts)

| Metric | Value |
|--------|-------|
| Estimated nodes | 16,411 unique handles |
| Estimated directed edges | 259,276 (127,338 + 131,938) |
| Estimated undirected edges | ~129,000 |
| Average degree (undirected) | ~15.7 |
| Median degree | 4 |
| Max degree | 6,218 |

### 3.2 Structural Concerns

1. **BFS Sampling Bias**: The graph was crawled via bounded BFS from seed profiles, over-representing highly connected nodes
2. **Head-heavy distribution**: Top profiles have 6,000+ neighbors while median is 4
3. **No graph tables exist**: The database has no `graph_edges` or `graph_node_features` tables

### 3.3 Edge Semantics

- `friend`: A follows B (outgoing edge)
- `friended`: B is followed by A (incoming edge)
- These are NOT symmetric relationships
- Semantics are weak: "follow" ≠ "know" or "trust"

---

## 4. Retrieval Baseline

### 4.1 Eval Harness Status

- **Acceptance tests**: 11/12 passing (91.7%)
- **Regression tests**: 3/3 passing (100%)
- **Eval harness location**: `apps/worker/src/cli/agent-eval.ts`

### 4.2 Acceptance Test Results

| ID | Goal | Result | Action |
|----|------|--------|--------|
| A1 | 杭州看看人选 | PASS | clarify |
| A2 | 杭州做 Python 后端 | PASS | search |
| A3 | 随便看看 | PASS | search |
| A4 | GitHub 上活跃的 ML engineer | PASS | search -> compare |
| A5 | 开源 AI founder | FAIL | conditional vs clear recommendation |
| A6 | RAG / 检索工程师 | PASS | search -> compare |
| A7 | 多模态视觉工程师 | PASS | search -> narrow |
| A8 | AI infra / backend builder | PASS | search -> narrow |
| A9 | 证据不够别推荐 | PASS | search -> compare |
| A10 | Python 后端 builder | PASS | search -> compare |
| A11 | 比较两个 Python 候选人 | PASS | search -> compare |
| A12 | 像 shortlist 2 号但更偏后端 | PASS | search |

### 4.3 Regression Test Results

| Query | Expected | Result | Top3 GitHub | Top5 GitHub |
|-------|----------|--------|-------------|-------------|
| Q4: RAG 检索工程师 | watch-but-stable | PASS | 2 | 3 |
| Q6: GitHub 上活跃的 ML engineer | pass | PASS | 3 | 5 |
| Q8: 开源 AI founder 或 tech lead | pass | PASS | 3 | 5 |

### 4.4 Baseline Assessment

- Current retrieval is **functional but not exceptional**
- One acceptance test fails on recommendation mode
- Graph-sensitive queries (like "who knows X") are NOT in the eval set
- No graph-oriented query benchmarks exist

---

## 5. Memory Readiness

### 5.1 Schema Status

| Table | Migration File | Database Status |
|-------|----------------|-----------------|
| `user_memories` | `0005_user_memories.sql` | **NOT CREATED** |
| `candidate_feedback_memories` | `0006_candidate_feedback_memories.sql` | **NOT CREATED** |

### 5.2 Verification Query

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name LIKE '%memor%';
-- Result: 0 rows
```

### 5.3 Gap Analysis

- **Schema designed**: Yes, comprehensive design with `user_memory_kind`, `scope_kind`, `source` enums
- **Migrations written**: Yes, files exist in `packages/db/src/migrations/`
- **Migrations executed**: **NO** - tables do not exist in database
- **CLI flows exist**: Yes, memory-related code in CLI
- **Wiring complete**: Unknown - depends on table creation

### 5.4 Blocker

The main blocker is **migration execution**, not design. Running migrations 0005 and 0006 would activate the memory system.

---

## 6. Risks And Unknowns

### 6.1 Data Risks

| Risk | Severity | Evidence |
|------|----------|----------|
| BFS sampling bias | High | Top profiles have 6,000+ neighbors, median is 4 |
| Edge semantics weak | High | "follow" ≠ "trust" or "collaboration" |
| Embedding coverage gap | High | 68% of persons lack embeddings |
| Identity resolution errors | Medium | Same person may have multiple Bonjour handles |

### 6.2 Modeling Risks

| Risk | Severity | Evidence |
|------|----------|----------|
| Graph signals may not improve ranking | Medium | No graph-oriented eval to test |
| High-degree nodes may dominate | Medium | Power-law distribution observed |
| No ground truth for graph relevance | High | No labeled graph-sensitive queries |

### 6.3 Product Risks

| Risk | Severity | Evidence |
|------|----------|----------|
| Graph explanations may confuse users | Medium | Edge semantics are weak |
| Memory tables not created | High | Migrations not executed |

---

## 7. Recommendation

### Decision: `Proceed narrowly: only explicit graph facts and explanation work are justified`

### Rationale

1. **Graph data exists but is not materialized**: 129K+ edges in crawl artifacts, but no graph tables
2. **Embedding coverage too low for graph models**: 32% coverage blocks GraphSAGE/Node2Vec training
3. **Memory system blocked on migration execution**: Simple fix, run migrations 0005 and 0006
4. **Retrieval baseline is reasonable**: 91.7% acceptance tests pass, but no graph-oriented eval

### Top 3 Prerequisites for Phase 1

1. **Materialize graph edges**: Create `graph_edges` table and import from crawl artifacts
2. **Run memory migrations**: Execute `0005_user_memories.sql` and `0006_candidate_feedback_memories.sql`
3. **Create graph-oriented eval set**: Add queries like "who has mutual connections with X" to eval harness

### What is NOT Justified

- GraphSAGE or Node2Vec training (embedding coverage insufficient)
- GraphTranslator integration (no proven need for graph-to-language alignment)
- memU integration (existing memory schema is adequate)

---

## 8. Phase 1 Prerequisites

### Must Complete Before Phase 1

| Task | Effort | Blocking |
|------|--------|----------|
| Create `graph_edges` table | 1 day | Yes |
| Import edges from crawl artifacts | 2-3 days | Yes |
| Run memory migrations | 1 hour | Yes |
| Add graph-sensitive eval queries | 1 day | Recommended |

### Recommended Phase 1 Scope

1. Materialize explicit graph edges in Postgres
2. Compute node-level features (degree, component membership)
3. Add graph evidence to result explanations
4. Activate memory system via migration execution

### Success Criteria for Phase 1

- `graph_edges` table populated with 100K+ edges
- Memory tables created and accessible
- At least one graph-aware explanation template working
- Graph-sensitive eval queries added to harness

---

## Appendix A: Reproducible Commands

### Data Inventory

```bash
# Connect to database
psql postgres://seeku:seeku_dev_password@localhost:5432/seeku

# Core counts
SELECT COUNT(*) FROM persons;
SELECT COUNT(*) FROM source_profiles;
SELECT COUNT(*) FROM source_profiles WHERE source = 'bonjour';
SELECT COUNT(*) FROM search_embeddings;
SELECT COUNT(*) FROM source_profiles WHERE raw_payload::text LIKE '%authFriendLinkPreview%';
```

### Friend-Link Analysis

```bash
# Aggregate stats from crawl artifacts
python3 << 'EOF'
import json
from pathlib import Path

raw_base = Path("output/bonjour-raw")
unique_profiles = {}

for index_file in raw_base.glob("*/*/friend-links-index.json"):
    with open(index_file) as f:
        data = json.load(f)
        for entry in data:
            handle = entry["handle"]
            total = entry.get("totalNeighbors", 0)
            if handle not in unique_profiles or total > unique_profiles[handle].get("totalNeighbors", 0):
                unique_profiles[handle] = entry

print(f"Unique profiles: {len(unique_profiles)}")
print(f"Total direct edges: {sum(e.get('direct', 0) for e in unique_profiles.values())}")
print(f"Total reverse edges: {sum(e.get('reverse', 0) for e in unique_profiles.values())}")
EOF
```

### Eval Harness

```bash
# Run acceptance and regression tests
node -e "
const { runAgentEvalCli } = require('./apps/worker/dist/cli/agent-eval.js');
runAgentEvalCli().then(() => {}).catch(e => console.error(e));
"
```

---

## Appendix B: File References

| File | Purpose |
|------|---------|
| `docs/proposals/graph-rag-integration.md` | RFC v2 proposal |
| `docs/proposals/graph-rag-review.md` | Technical review |
| `docs/proposals/graph-rag-phase-0-execution-plan.md` | This audit's plan |
| `apps/worker/src/cli/import-bonjour-friend-links.ts` | Friend-link import script |
| `apps/worker/src/cli/agent-eval.ts` | Eval harness |
| `packages/db/src/migrations/0005_user_memories.sql` | Memory schema |
| `packages/db/src/migrations/0006_candidate_feedback_memories.sql` | Feedback schema |
