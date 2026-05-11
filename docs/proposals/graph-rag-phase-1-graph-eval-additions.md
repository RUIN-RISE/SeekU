# Graph Signals Phase 1 Graph Eval Additions

**Date**: 2026-05-03
**Project**: Seeku

## Summary

This document describes the graph-oriented evaluation queries added to support Phase 2 testing of graph-aware features.

---

## 1. Query Categories

### 1.1 Known-Person Adjacency

Queries that test the system's ability to find candidates with direct or indirect connections to a known person.

| ID | Query | Graph Operation |
|----|-------|-----------------|
| g001 | 找出与凯撒的复利实验室有共同好友的候选人 | mutual_connections |
| g003 | 找出Vincent的一度人脉 | direct_neighbors |
| g006 | 找出与Charles有二度关系的AI研究员 | second_degree_neighbors |
| g009 | 推荐与Mouna有共同好友的开源贡献者 | mutual_connections + skill_filter |

### 1.2 Mutual-Connection Discovery

Queries that test the system's ability to discover and explain shared connections.

| ID | Query | Expected Behavior |
|----|-------|-------------------|
| g001 | 找出与凯撒的复利实验室有共同好友的候选人 | Return candidates with mutual_connection_count > 0 |
| g009 | 推荐与Mouna有共同好友的开源贡献者 | Return candidates with mutual connections AND open-source skill |

### 1.3 Cluster/Community Proximity

Queries that test the system's ability to identify candidates in the same social circle.

| ID | Query | Graph Operation |
|----|-------|-----------------|
| g002 | 推荐在同一个社交圈子里的AI工程师 | same_component |
| g005 | 找出与钟采莉🔥Chelly在同一个社交圈子的产品经理 | same_component + role_filter |
| g007 | 推荐在最大社交圈子里的杭州候选人 | largest_component + location_filter |

### 1.4 Centrality/Importance

Queries that test the system's ability to identify influential nodes in the network.

| ID | Query | Expected Behavior |
|----|-------|-------------------|
| g004 | 推荐社交网络中影响力较大的候选人 | Return candidates with high undirected_degree |
| g008 | 找出社交网络中连接数最多的前10位候选人 | Return top 10 by degree |

### 1.5 Structural Analysis

Queries that test the system's ability to analyze graph structure.

| ID | Query | Expected Behavior |
|----|-------|-------------------|
| g010 | 找出社交网络中的孤立节点 | Return candidates with undirected_degree = 0 |

---

## 2. Query Schema

Each query in `packages/eval/datasets/graph-queries.json` follows this schema:

```typescript
interface GraphEvalQuery {
  id: string;                    // Query identifier (e.g., "g001")
  text: string;                  // Natural language query
  category: string;              // Query category
  graphQueryType: string;        // Graph operation type
  anchorPersonName?: string;     // Name of anchor person for adjacency queries
  expectedRoles?: string[];      // Expected role matches
  expectedSkills?: string[];     // Expected skill matches
  expectedLocation?: string;     // Expected location match
  expectedGraphFeatures: string[]; // Expected graph features in results
}
```

### Graph Query Types

| Type | Description | Implementation Notes |
|------|-------------|---------------------|
| `mutual_connections` | Find candidates sharing connections with anchor | Requires computing intersection of neighbor sets |
| `direct_neighbors` | Find 1-hop neighbors of anchor | Simple edge lookup |
| `second_degree_neighbors` | Find 2-hop neighbors | Requires graph traversal |
| `same_component` | Find candidates in same connected component | Use component_id from graph_node_features |
| `same_component_role` | Same component + role filter | Combine component lookup with role matching |
| `largest_component_location` | Largest component + location filter | Filter by component_size + location |
| `high_degree` | High centrality nodes | Filter by undirected_degree threshold |
| `top_degree` | Top N by degree | ORDER BY undirected_degree DESC LIMIT N |
| `mutual_connections_skill` | Mutual connections + skill filter | Combine neighbor intersection with skill matching |
| `isolated_nodes` | Nodes with no edges | Filter by undirected_degree = 0 |

---

## 3. Expected Graph Features

Each query specifies expected graph features that should be present in results:

| Feature | Description |
|---------|-------------|
| `mutual_connection_count > 0` | Result should have at least one mutual connection with anchor |
| `is_direct_neighbor` | Result should be directly connected to anchor |
| `second_degree_connection` | Result should be 2 hops from anchor |
| `same_component_as_known_person` | Result should be in same component as some known person |
| `same_component_as_anchor` | Result should be in same component as specified anchor |
| `high_undirected_degree` | Result should have above-average degree |
| `top_10_degree` | Result should be in top 10 by degree |
| `in_largest_component` | Result should be in the giant component |
| `undirected_degree = 0` | Result should have no connections |

---

## 4. Anchor Persons

The queries reference specific anchor persons that exist in the database:

| Anchor Name | Person ID | Degree | Notes |
|-------------|-----------|--------|-------|
| 凯撒的复利实验室 | (UUID) | 3,283 | Highest degree node |
| 钟采莉🔥Chelly | (UUID) | 3,182 | Second highest degree |
| Vincent | (UUID) | 1,472 | High degree, common name |
| Charles | (UUID) | 1,321 | High degree, common name |
| Mouna | (UUID) | 1,213 | High degree |

These anchors were chosen because:
1. They have high degree (many neighbors to test with)
2. They exist in the database (verified via query)
3. They represent different name patterns (Chinese, English, mixed)

---

## 5. Integration with Eval Harness

### 5.1 Current State

The graph queries are stored in `packages/eval/datasets/graph-queries.json` but are NOT yet integrated into the main eval harness (`apps/worker/src/cli/agent-eval.ts`).

### 5.2 Phase 2 Integration

To integrate graph queries into the eval harness:

1. **Add graph query detection**: Identify when a query requires graph features
2. **Implement graph feature extraction**: Query `graph_edges` and `graph_node_features`
3. **Add graph-aware scoring**: Include graph features in match scoring
4. **Generate graph explanations**: Create explanation templates for graph features

### 5.3 Example Integration

```typescript
// In agent-eval.ts or similar
async function evaluateGraphQuery(query: GraphEvalQuery): Promise<GraphEvalResult> {
  if (query.graphQueryType === 'mutual_connections') {
    const anchor = await findPersonByName(query.anchorPersonName);
    const neighbors = await getNeighbors(anchor.id);
    const mutualConnections = await findMutualConnections(anchor.id, neighbors);
    return {
      queryId: query.id,
      results: mutualConnections,
      features: ['mutual_connection_count > 0']
    };
  }
  // ... handle other query types
}
```

---

## 6. Expected Results

### 6.1 Query g001: Mutual Connections

**Query**: "找出与凯撒的复利实验室有共同好友的候选人"

**Expected**:
- Anchor: 凯撒的复利实验室 (degree 3,283)
- Results: Candidates who share at least one neighbor with anchor
- Feature: `mutual_connection_count > 0`

**SQL Approximation**:
```sql
SELECT
  p.id,
  p.primary_name,
  COUNT(DISTINCT ge2.source_person_id) as mutual_count
FROM persons p
JOIN graph_edges ge1 ON ge1.target_person_id = p.id
JOIN graph_edges ge2 ON ge2.target_person_id = ge1.target_person_id
WHERE ge2.source_person_id = (SELECT id FROM persons WHERE primary_name = '凯撒的复利实验室')
GROUP BY p.id
HAVING COUNT(DISTINCT ge2.source_person_id) > 0;
```

### 6.2 Query g003: Direct Neighbors

**Query**: "找出Vincent的一度人脉"

**Expected**:
- Anchor: Vincent (degree 1,472)
- Results: All persons directly connected to Vincent
- Feature: `is_direct_neighbor`

**SQL Approximation**:
```sql
SELECT DISTINCT
  p.id,
  p.primary_name
FROM persons p
JOIN graph_edges ge ON (ge.target_person_id = p.id OR ge.source_person_id = p.id)
WHERE ge.source_person_id = (SELECT id FROM persons WHERE primary_name = 'Vincent')
   OR ge.target_person_id = (SELECT id FROM persons WHERE primary_name = 'Vincent');
```

### 6.3 Query g004: High Degree

**Query**: "推荐社交网络中影响力较大的候选人"

**Expected**:
- Results: Candidates with high `undirected_degree`
- Feature: `high_undirected_degree`

**SQL Approximation**:
```sql
SELECT
  p.id,
  p.primary_name,
  gnf.undirected_degree
FROM graph_node_features gnf
JOIN persons p ON p.id = gnf.person_id
WHERE gnf.undirected_degree > (SELECT AVG(undirected_degree) FROM graph_node_features)
ORDER BY gnf.undirected_degree DESC
LIMIT 20;
```

---

## 7. Limitations

### 7.1 No Golden Set

Unlike the existing eval queries, graph queries do not have a golden set with labeled relevance. This is intentional for Phase 1 - the queries are designed to test graph feature extraction, not ranking quality.

### 7.2 Anchor Person Resolution

Queries reference persons by name, which may be ambiguous. The implementation should:
1. Use exact match first
2. Fall back to fuzzy match if no exact match
3. Return error if multiple matches exist

### 7.3 Graph Feature Computation

Some features (e.g., `second_degree_connection`) require graph traversal that is not yet implemented. These queries are placeholders for Phase 2.

---

## 8. Future Work

### Phase 2

1. Implement graph feature extraction for all query types
2. Add graph features to search results
3. Create explanation templates for graph features
4. Add golden set with labeled relevance

### Phase 3

1. Add pairwise graph features (shortest path, PPR score)
2. Implement graph-aware reranking
3. Add temporal graph features (edge timestamps)
4. Expand query set with more complex scenarios
