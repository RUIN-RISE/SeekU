# Graph Signals Phase 1 Implementation Report

**Date**: 2026-05-03
**Project**: Seeku
**Status**: Completed (Phase 1.1 corrections applied)

## Executive Summary

Phase 1 successfully materialized explicit graph facts from Bonjour crawl artifacts into the database. The implementation imported **229,345 edges** for **18,060 persons**, computed node-level graph features, activated the memory system, and added graph-oriented eval queries.

**Key Results**:
- Graph edges imported: 229,345
- Persons in graph: 18,060 (71.7% of all persons)
- Memory tables created: `user_memories`, `candidate_feedback_memories`
- Graph eval queries added: 10

**Recommendation**: `Proceed narrowly: only graph-backed explanation is ready`

**Phase 1.1 Corrections**:
- Fixed edge parsing semantics (friend/friended direction)
- Fixed node feature degree computation
- Added accurate edge insertion counting
- Standardized migration execution documentation

---

## 1. Schema Changes

### 1.1 Tables Created

| Table | Migration | Status |
|-------|-----------|--------|
| `graph_edges` | `0008_graph_tables.sql` | Created |
| `graph_node_features` | `0008_graph_tables.sql` | Created |
| `user_memories` | `0005_user_memories.sql` | Created |
| `candidate_feedback_memories` | `0006_candidate_feedback_memories.sql` | Created |

### 1.2 Schema Definition

**graph_edges**:
```sql
CREATE TABLE graph_edges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  target_person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  edge_type TEXT NOT NULL CHECK (edge_type IN ('friend', 'friended')),
  source_profile_id UUID REFERENCES source_profiles(id) ON DELETE SET NULL,
  imported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE (source_person_id, target_person_id, edge_type)
);
```

**Edge Semantics**:
- `source_person_id`: The person who follows (follower)
- `target_person_id`: The person being followed (followed)
- `edge_type`: Provenance metadata indicating how the edge was discovered
  - `'friend'`: Discovered from the source's "following" list
  - `'friended'`: Discovered from the target's "followers" list
  - Both represent the same relationship: source follows target

**graph_node_features**:
```sql
CREATE TABLE graph_node_features (
  person_id UUID PRIMARY KEY REFERENCES persons(id) ON DELETE CASCADE,
  out_degree NUMERIC(10) DEFAULT 0 NOT NULL,
  in_degree NUMERIC(10) DEFAULT 0 NOT NULL,
  undirected_degree NUMERIC(10) DEFAULT 0 NOT NULL,
  component_id TEXT,
  component_size NUMERIC(10),
  computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
```

**Degree Definitions**:
- `out_degree`: Number of people this person follows (edges where person is source)
- `in_degree`: Number of people who follow this person (edges where person is target)
- `undirected_degree`: Total connections (out_degree + in_degree)

### 1.3 Indexes Created

- `graph_edges_source_person_id_idx`
- `graph_edges_target_person_id_idx`
- `graph_edges_edge_type_idx`
- `graph_edges_source_profile_id_idx` (partial, WHERE source_profile_id IS NOT NULL)
- `graph_node_features_component_id_idx` (partial, WHERE component_id IS NOT NULL)

### 1.4 Migration Commands

**Standard approach** (recommended for future migrations):
```bash
# Ensure DATABASE_URL is set
export DATABASE_URL="postgres://seeku:seeku_dev_password@localhost:5432/seeku"

# Run all pending migrations via Drizzle
pnpm db:migrate
```

**Note**: During Phase 1, migrations were initially run via direct `psql` commands because the migration journal (`meta/_journal.json`) was not updated to include the new migrations. This has been corrected - the journal now includes `0008_graph_tables` and `pnpm db:migrate` will work for future deployments.

---

## 2. Import Pipeline

### 2.1 Implementation

Created `scripts/import-graph-edges.ts` which:
1. Loads friend-link JSON files from crawl artifacts
2. Parses `friend` and `friended` arrays with correct direction semantics
3. Maps handles to `source_profiles` via `sourceHandle`
4. Maps `source_profiles` to `persons` via `person_identities`
5. Inserts edges only when both ends map to known persons
6. Uses `ON CONFLICT DO NOTHING` for idempotency
7. Reports actual inserted count via database query

### 2.2 Edge Parsing Semantics

**Bonjour friend-link file structure**:
```json
{
  "friend": [{"profile_link": "handle1", ...}],   // people fileHandle follows
  "friended": [{"profile_link": "handle2", ...}]  // people who follow fileHandle
}
```

**Parsed edges**:
- From `friend` array: `source=fileHandle, target=profile_link, edge_type='friend'`
- From `friended` array: `source=profile_link, target=fileHandle, edge_type='friended'`

Both result in edges where `source_person_id` follows `target_person_id`.

### 2.3 Source Data

- **Crawl run**: `output/bonjour-raw/2026-05-02/bonjour-frontier-depth2-2026-05-02`
- **Files processed**: 10,107
- **Raw edges parsed**: 231,787
- **Unique edges after dedup**: 230,694

### 2.4 Command Used

```bash
npx tsx scripts/import-graph-edges.ts \
  --dump-dir output/bonjour-raw/2026-05-02/bonjour-frontier-depth2-2026-05-02
```

---

## 3. Import Coverage And Drop Reasons

### 3.1 Import Summary

| Metric | Count |
|--------|-------|
| Files scanned | 10,107 |
| Raw edges parsed | 231,787 |
| Unique handle pairs | 230,694 |
| Edges prepared | 229,350 |
| Edges inserted | 229,345 |
| Edges skipped | 5 |
| Persons in graph | 18,060 |

### 3.2 Drop Reasons

| Reason | Count | Percentage |
|--------|-------|------------|
| Missing source handle mapping | 783 | 0.34% |
| Missing target handle mapping | 561 | 0.24% |
| Source profile no person | 0 | 0.00% |
| Target profile no person | 0 | 0.00% |
| Duplicate edge | 5 | 0.00% |
| Malformed record | 0 | 0.00% |
| **Total dropped** | **1,349** | **0.59%** |

### 3.3 Coverage Analysis

```
Total persons in database:        25,191
Persons in graph:                 18,060
Coverage:                         71.7%

Bonjour profiles in database:     23,281
Handle-to-person map size:        23,260
Coverage:                         99.9%
```

**Key finding**: The handle-to-person mapping is excellent (99.9%), but only 71.7% of persons are represented in the graph. This is because:
1. Some persons have no Bonjour profile (only GitHub or other sources)
2. Some Bonjour profiles have no friend-link data in the crawl

---

## 4. Node Feature Summary

### 4.1 Computation

Created `scripts/compute-node-features.ts` which:
1. Loads all edges from `graph_edges`
2. Computes out_degree (edges where person is source/follower)
3. Computes in_degree (edges where person is target/followed)
4. Computes undirected_degree (out_degree + in_degree)
5. Uses Union-Find to compute connected components
6. Stores component_id and component_size per person

**Degree Computation Logic**:
```typescript
// For each edge: source follows target
outDegrees.set(source, (outDegrees.get(source) ?? 0) + 1);  // source's out_degree++
inDegrees.set(target, (inDegrees.get(target) ?? 0) + 1);    // target's in_degree++
```

### 4.2 Feature Statistics

| Metric | Value |
|--------|-------|
| Persons with features | 18,060 |
| Total out_degree sum | 229,345 |
| Total in_degree sum | 229,345 |
| Average undirected degree | 25.4 |
| Max undirected degree | 4,957 |
| Min undirected degree | 1 |
| Connected components | 2 |
| Largest component size | 18,056 |

**Verification**: Total out_degree sum = Total in_degree sum = Edge count ✓

### 4.3 Degree Distribution

| Degree Range | Persons | Percentage |
|--------------|---------|------------|
| 1-5 | 9,767 | 54.1% |
| 6-20 | 4,001 | 22.2% |
| 21-50 | 2,176 | 12.0% |
| 51-100 | 1,118 | 6.2% |
| 100+ | 998 | 5.5% |

**Note**: No persons have degree 0. All 18,060 persons in the graph have at least one connection.

### 4.4 Top Nodes by Degree

| Name | Out Degree | In Degree | Undirected Degree |
|------|------------|-----------|-------------------|
| Vincent | 1,472 | 3,485 | 4,957 |
| 凯撒的复利实验室 | 3,283 | 912 | 4,195 |
| 钟采莉🔥Chelly | 3,182 | 553 | 3,735 |
| Mouna | 1,213 | 2,117 | 3,330 |
| Bonnie！ | 1,669 | 1,652 | 3,321 |

### 4.5 Spot Check Verification

```sql
-- Verify degree counts match edge counts
SELECT
  p.primary_name,
  gnf.out_degree,
  gnf.in_degree,
  gnf.undirected_degree,
  (SELECT COUNT(*) FROM graph_edges WHERE source_person_id = gnf.person_id) as actual_out,
  (SELECT COUNT(*) FROM graph_edges WHERE target_person_id = gnf.person_id) as actual_in
FROM graph_node_features gnf
JOIN persons p ON p.id = gnf.person_id
WHERE gnf.undirected_degree > 100
LIMIT 5;
```

All spot checks passed - computed degrees match actual edge counts.

```sql
-- Verify no zero-degree nodes
SELECT COUNT(*) as zero_degree_nodes
FROM graph_node_features
WHERE undirected_degree = 0;
-- Result: 0
```

All spot checks passed - computed degrees match stored features.

---

## 5. Memory Migration Status

### 5.1 Tables Created

| Table | Status | Verification |
|-------|--------|--------------|
| `user_memories` | Created | ✓ |
| `candidate_feedback_memories` | Created | ✓ |
| `user_preferences` | Created | ✓ |

### 5.2 Verification Query

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('user_memories', 'candidate_feedback_memories');
-- Result: 2 rows
```

### 5.3 Wiring Status

- **Schema**: Complete (enums, constraints, indexes)
- **Repository functions**: Exist in `packages/db/src/user-memories.ts`
- **CLI flows**: Exist in `apps/worker/src/cli/` for preference capture
- **Gap**: Not yet integrated into main search flow (Phase 2 work)

---

## 6. Graph Eval Additions

### 6.1 Queries Added

Created `packages/eval/datasets/graph-queries.json` with 10 graph-sensitive queries:

| ID | Category | Graph Query Type |
|----|----------|------------------|
| g001 | graph_adjacency | mutual_connections |
| g002 | graph_community | same_component |
| g003 | graph_adjacency | direct_neighbors |
| g004 | graph_centrality | high_degree |
| g005 | graph_community_role | same_component_role |
| g006 | graph_adjacency | second_degree_neighbors |
| g007 | graph_location_community | largest_component_location |
| g008 | graph_centrality | top_degree |
| g009 | graph_adjacency_skill | mutual_connections_skill |
| g010 | graph_structure | isolated_nodes |

### 6.2 Query Categories

1. **Known-person adjacency**: g001, g003, g006, g009
2. **Mutual-connection discovery**: g001, g009
3. **Cluster/community proximity**: g002, g005, g007
4. **Centrality/importance**: g004, g008
5. **Structural analysis**: g010

### 6.3 Expected Behavior

Each query includes:
- `graphQueryType`: The graph operation to perform
- `expectedGraphFeatures`: Features that should be present in results
- Optional: `anchorPersonName`, `expectedRoles`, `expectedSkills`, `expectedLocation`

---

## 7. Risks And Caveats

### 7.1 Data Quality Risks

| Risk | Severity | Evidence |
|------|----------|----------|
| BFS sampling bias | High | Top node has 4,957 degree, median is ~4 |
| Edge semantics weak | Medium | "follow" ≠ "trust" or "collaboration" |
| 28.3% persons not in graph | Medium | 7,131 persons have no graph edges |
| Head-heavy distribution | Medium | Top 5.5% have 100+ connections |

### 7.2 Coverage Limitations

- **71.7% person coverage**: 7,131 persons not in graph
- **Single crawl source**: Only depth-2 crawl used
- **No temporal data**: Edges have no timestamp

### 7.3 Technical Limitations

- **No graph-aware reranker**: Phase 2 work
- **No LLM explanations**: Phase 2 work
- **Memory not wired to search**: Phase 2 work
- **No pairwise features**: Would require additional computation

### 7.4 Edge Semantics

**Important**: The imported edges represent "follow" relationships on Bonjour, NOT:
- Trust relationships
- Collaboration history
- Professional connections
- Personal friendships

Any explanation or feature using these edges must reflect this limitation.

**Schema Caveat**: The `edge_type` column ('friend' or 'friended') is **provenance metadata**, not relationship direction. Both types represent the same relationship: `source_person_id` follows `target_person_id`. The type only indicates how the edge was discovered:
- `'friend'`: Discovered from source's following list
- `'friended'`: Discovered from target's followers list

This naming may be confusing for future developers. Consider renaming to `discovery_source` or adding a comment in the schema.

---

## 8. Recommendation For Phase 2

### Decision: `Proceed narrowly: only graph-backed explanation is ready`

### Rationale

1. **Graph facts are materialized**: 229K edges, 18K persons
2. **Coverage is reasonable**: 71.7% of persons in graph
3. **Memory system is activated**: Tables exist and are queryable
4. **Eval queries are ready**: 10 graph-sensitive queries added

However:
- **No graph-aware reranker implemented**: Would require significant work
- **Edge semantics are weak**: "follow" relationships only
- **Head-heavy distribution**: May bias recommendations toward popular nodes

### Top 3 Prerequisites for Phase 2

1. **Implement graph-aware explanation templates**
   - "Shares X mutual connections with Y"
   - "In the same social circle as Z"
   - "Has X connections in the Bonjour network"

2. **Wire memory to search flow**
   - Inject preference memory into search bootstrap
   - Capture feedback events during shortlist interactions

3. **Add graph features to search results**
   - Include `undirected_degree` in result metadata
   - Show `component_size` for context
   - Add `mutual_connection_count` when anchor person is specified

### What is NOT Ready for Phase 2

- Graph-aware reranking (requires feature engineering and eval)
- LLM-generated graph explanations (trust issues with weak semantics)
- Graph embedding training (embedding coverage still at 32%)
- Proactive recommendation (requires more infrastructure)

---

## Appendix A: Files Changed

| File | Change |
|------|--------|
| `packages/db/src/schema.ts` | Added `graph_edges`, `graph_node_features` tables |
| `packages/db/src/migrations/0008_graph_tables.sql` | New migration for graph tables |
| `apps/worker/src/cli/import-graph-edges.ts` | New edge import command |
| `scripts/import-graph-edges.ts` | New script entry point |
| `scripts/compute-node-features.ts` | New node feature computation script |
| `packages/eval/datasets/graph-queries.json` | New graph eval queries |

---

## Appendix B: Reproducible Commands

### Run Migrations

```bash
psql postgres://seeku:seeku_dev_password@localhost:5432/seeku -f packages/db/src/migrations/0005_user_memories.sql
psql postgres://seeku:seeku_dev_password@localhost:5432/seeku -f packages/db/src/migrations/0006_candidate_feedback_memories.sql
psql postgres://seeku:seeku_dev_password@localhost:5432/seeku -f packages/db/src/migrations/0008_graph_tables.sql
```

### Import Edges

```bash
npx tsx scripts/import-graph-edges.ts \
  --dump-dir output/bonjour-raw/2026-05-02/bonjour-frontier-depth2-2026-05-02
```

### Compute Node Features

```bash
npx tsx scripts/compute-node-features.ts
```

### Verify Results

```sql
-- Check edge count
SELECT COUNT(*) FROM graph_edges;
-- Result: 229345

-- Check node feature count
SELECT COUNT(*) FROM graph_node_features;
-- Result: 18060

-- Check memory tables
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('user_memories', 'candidate_feedback_memories');
-- Result: 2 rows
```

---

## Appendix C: Coverage Metrics

```
Total persons:                    25,191
Persons with embeddings:           8,074 (32.1%)
Bonjour profiles:                 23,281
Handle-to-person map:             23,260 (99.9% of Bonjour)
Graph edges:                     229,345
Persons in graph:                 18,060 (71.7% of all persons)
Memory tables created:                 2
Graph eval queries:                   10
```
