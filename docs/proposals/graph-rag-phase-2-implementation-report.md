# Graph Signals Phase 2 Implementation Report

**Date**: 2026-05-03
**Project**: Seeku
**Status**: Completed (Phase 2a: Graph-backed explanation + metadata exposure)

## Executive Summary

Phase 2a successfully integrated graph features into the candidate display and comparison flow. The implementation adds graph-backed explanations to CLI output, exposes graph metadata to candidates, and provides template-based explanation rendering.

**Key Results**:
- Graph repository module created with feature lookup functions
- Candidate types extended with `graphFeatures` field
- Graph explanation templates implemented with accurate "follow/follower" semantics
- Renderer updated to display graph signals in profile view
- Graceful degradation when no graph data is available

**Recommendation**: `Phase 2a complete. Memory wiring deferred to Phase 2b.`

---

## 1. Files Changed

| File | Change Type |
|------|-------------|
| `packages/db/src/graph-repository.ts` | New file |
| `packages/db/src/index.ts` | Modified (added export) |
| `apps/worker/src/cli/types.ts` | Modified (added `CandidateGraphFeatures`) |
| `apps/worker/src/cli/graph-explanation.ts` | New file |
| `apps/worker/src/cli/graph-enrichment.ts` | New file |
| `apps/worker/src/cli/renderer.ts` | Modified (added graph display) |
| `apps/worker/src/index.ts` | Fixed (removed invalid signal option) |

---

## 2. New Graph Explanation Capabilities

### 2.1 Graph Repository Functions

Created `packages/db/src/graph-repository.ts` with:

| Function | Purpose |
|----------|---------|
| `getGraphNodeFeatures` | Get degree/component info for a single person |
| `getGraphNodeFeaturesBatch` | Batch lookup for multiple persons |
| `getNeighborIds` | Get all direct neighbors of a person |
| `areDirectNeighbors` | Check if two persons are connected |
| `getMutualConnections` | Find mutual connections between two persons |
| `getMutualConnectionsBatch` | Batch mutual connection lookup |
| `getGraphProximity` | Comprehensive proximity info between two persons |
| `getGraphStats` | Graph-wide statistics |

### 2.2 Candidate Graph Features

Added `CandidateGraphFeatures` interface to `types.ts`:

```typescript
interface CandidateGraphFeatures {
  undirectedDegree: number;      // Total connections
  outDegree: number;             // People this candidate follows
  inDegree: number;              // People who follow this candidate
  componentSize: number | null;  // Size of connected component
  mutualConnectionCount?: number; // With anchor person
  isDirectNeighbor?: boolean;     // Of anchor person
  sameComponentAsAnchor?: boolean;
}
```

### 2.3 Explanation Templates

Created `graph-explanation.ts` with template functions:

| Template | Output Example |
|----------|----------------|
| `formatMutualConnectionsExplanation` | "与 Vincent 有 3 个共同 Bonjour 连接（双方都关注的人）" |
| `formatDirectNeighborExplanation` | "与 Vincent 在 Bonjour 上有直接关注关系" |
| `formatSameComponentExplanation` | "与 Vincent 处于同一个 Bonjour 社交圈子" |
| `formatHighDegreeExplanation` | "在 Bonjour 上有 150 个连接" |
| `formatNoGraphDataExplanation` | "暂无 Bonjour 社交关系数据" |

### 2.4 Renderer Integration

Updated `TerminalRenderer` to:

1. Display graph signals in profile view (new "社交信号" section)
2. Show graph badges in shortlist view
3. Gracefully handle missing graph data

Example output with graph data:
```
社交信号：
  🔗 与 Vincent 有 3 个共同 Bonjour 连接（双方都关注的人）
  🔗 与 Vincent 在 Bonjour 上有直接关注关系
  🔗 在 Bonjour 上有 150 个连接
```

**Graceful degradation**: When a candidate has no graph data (28.3% of persons), the "社交信号" section is simply not rendered. No error is shown, and the candidate profile displays normally with other sections.

---

## 3. Memory Wiring Status

**Status**: Deferred to Phase 2b

**Rationale**:
- Memory tables exist and are queryable (Phase 1 verified)
- Memory bootstrap/preference capture code exists in CLI
- Integration would require changes to search bootstrap flow
- Decided to keep Phase 2a narrowly focused on graph explanations

**Recommendation for Phase 2b**:
1. Wire `memory-bootstrap.ts` into search initialization
2. Inject preference memory into query planning
3. Capture feedback events during shortlist interactions

---

## 4. Not Implemented (Deferred)

| Feature | Reason |
|---------|--------|
| Graph-aware reranking | Out of scope for Phase 2a |
| Memory wiring | Requires more changes, deferred |
| Graph embedding training | Phase 3+ work |
| Pairwise graph features | Would require additional computation |
| LLM-generated graph explanations | Trust issues with weak edge semantics |

---

## 5. Remaining Caveats

### 5.1 Edge Semantics (IMPORTANT)

**The imported edges represent "follow" relationships on Bonjour, NOT:**
- Trust relationships
- Collaboration history
- Professional connections
- Personal friendships

All explanation templates accurately reflect this limitation by using precise phrasing:
- "共同 Bonjour 连接（双方都关注的人）" - not "共同好友"
- "在 Bonjour 上有直接关注关系" - not "认识" or "有联系"
- "处于同一个 Bonjour 社交圈子" - clarifies it's based on follow graph

**Do not interpret these signals as indicators of trust, endorsement, or actual relationship strength.**

### 5.2 Coverage

- **71.7% person coverage**: 28.3% of persons have no graph data
- **Single crawl source**: Only depth-2 crawl used
- **No temporal data**: Edges have no timestamp

### 5.3 Schema Naming

The `edge_type` column ('friend' or 'friended') is provenance metadata, not relationship direction. This naming may be confusing for future developers.

### 5.4 BFS Sampling Bias

The graph was crawled via bounded BFS from seed profiles, which over-represents highly connected nodes. High-degree nodes may appear more frequently in results not because they are more relevant, but because they were more likely to be discovered during crawling.

---

## 6. Testing Notes

### Manual Testing

To test graph explanations:

1. Run a search with an anchor person:
   ```
   seeku search "像 Vincent 一样的 AI 工程师"
   ```

2. View candidate profile to see graph signals

3. Compare candidates to see graph proximity explanations

### Expected Behavior

- Candidates with graph data show "社交信号" section
- Candidates without graph data show no graph section (graceful degradation)
- Mutual connections count displays when anchor is available
- High-degree nodes show connection count

---

## 7. Phase Boundary Clarification

### Phase 2a (Completed - This Report)

- Graph repository module for feature lookup
- Candidate type extension with `graphFeatures`
- Graph explanation templates with accurate semantics
- Renderer integration for profile view
- Graceful degradation for missing data

### Phase 2b (Optional Future Work)

- Memory wiring to search initialization
- Preference memory injection into query planning
- Feedback capture during shortlist interactions

**Decision Point**: Phase 2b is optional. The current implementation provides graph-backed explanations without memory integration. Proceed to Phase 2b only if user preference persistence is a priority.

### Phase 3 (Future)

- Graph-aware reranking
- Pairwise graph features (shortest path, PPR)
- Eval harness expansion with graph-sensitive queries
- Graph embedding training (if embedding coverage improves)

---

## Appendix: Usage Example

```typescript
import { enrichCandidatesWithGraphFeatures } from "./graph-enrichment.js";

// After retrieving candidates
await enrichCandidatesWithGraphFeatures(db, candidates, anchorPersonId);

// Candidates now have graphFeatures populated
for (const candidate of candidates) {
  if (candidate.graphFeatures) {
    console.log(`${candidate.name} has ${candidate.graphFeatures.undirectedDegree} connections`);
    if (candidate.graphFeatures.mutualConnectionCount) {
      console.log(`  ${candidate.graphFeatures.mutualConnectionCount} mutual connections with anchor`);
    }
  }
}
```
