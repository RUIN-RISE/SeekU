import { and, eq, inArray, sql } from "drizzle-orm";

import type { SeekuDatabase } from "./index.js";
import { graphEdges, graphNodeFeatures, persons } from "./schema.js";

// ============================================================================
// Types
// ============================================================================

export interface GraphNodeFeatures {
  personId: string;
  outDegree: number;
  inDegree: number;
  undirectedDegree: number;
  componentId: string | null;
  componentSize: number | null;
}

export interface MutualConnectionResult {
  mutualConnectionCount: number;
  mutualConnectionIds: string[];
}

export interface GraphProximityResult {
  isDirectNeighbor: boolean;
  sameComponent: boolean;
  mutualConnectionCount: number;
}

// ============================================================================
// Node Features
// ============================================================================

/**
 * Get graph node features for a single person.
 * Returns null if the person has no graph data.
 */
export async function getGraphNodeFeatures(
  db: SeekuDatabase,
  personId: string
): Promise<GraphNodeFeatures | null> {
  const rows = await db
    .select()
    .from(graphNodeFeatures)
    .where(eq(graphNodeFeatures.personId, personId))
    .limit(1);

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    personId: row.personId,
    outDegree: Number(row.outDegree),
    inDegree: Number(row.inDegree),
    undirectedDegree: Number(row.undirectedDegree),
    componentId: row.componentId,
    componentSize: row.componentSize ? Number(row.componentSize) : null
  };
}

/**
 * Get graph node features for multiple persons.
 * Returns a map from personId to features.
 */
export async function getGraphNodeFeaturesBatch(
  db: SeekuDatabase,
  personIds: string[]
): Promise<Map<string, GraphNodeFeatures>> {
  if (personIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select()
    .from(graphNodeFeatures)
    .where(inArray(graphNodeFeatures.personId, personIds));

  const result = new Map<string, GraphNodeFeatures>();
  for (const row of rows) {
    result.set(row.personId, {
      personId: row.personId,
      outDegree: Number(row.outDegree),
      inDegree: Number(row.inDegree),
      undirectedDegree: Number(row.undirectedDegree),
      componentId: row.componentId,
      componentSize: row.componentSize ? Number(row.componentSize) : null
    });
  }

  return result;
}

// ============================================================================
// Edge Queries
// ============================================================================

/**
 * Get all neighbor IDs for a person (both followers and followed).
 * Returns a set of person IDs that are directly connected.
 */
export async function getNeighborIds(
  db: SeekuDatabase,
  personId: string
): Promise<Set<string>> {
  const outgoing = await db
    .select({ targetId: graphEdges.targetPersonId })
    .from(graphEdges)
    .where(eq(graphEdges.sourcePersonId, personId));

  const incoming = await db
    .select({ sourceId: graphEdges.sourcePersonId })
    .from(graphEdges)
    .where(eq(graphEdges.targetPersonId, personId));

  const neighbors = new Set<string>();
  for (const row of outgoing) {
    neighbors.add(row.targetId);
  }
  for (const row of incoming) {
    neighbors.add(row.sourceId);
  }

  return neighbors;
}

/**
 * Check if two persons are direct neighbors.
 */
export async function areDirectNeighbors(
  db: SeekuDatabase,
  personIdA: string,
  personIdB: string
): Promise<boolean> {
  const edges = await db
    .select({ id: graphEdges.id })
    .from(graphEdges)
    .where(
      sql`(
        (${graphEdges.sourcePersonId} = ${personIdA} AND ${graphEdges.targetPersonId} = ${personIdB})
        OR
        (${graphEdges.sourcePersonId} = ${personIdB} AND ${graphEdges.targetPersonId} = ${personIdA})
      )`
    )
    .limit(1);

  return edges.length > 0;
}

// ============================================================================
// Mutual Connections
// ============================================================================

/**
 * Find mutual connections between two persons.
 * Returns the count and list of person IDs who are neighbors of both.
 */
export async function getMutualConnections(
  db: SeekuDatabase,
  personIdA: string,
  personIdB: string
): Promise<MutualConnectionResult> {
  // Get neighbors of A
  const neighborsA = await getNeighborIds(db, personIdA);

  // Get neighbors of B
  const neighborsB = await getNeighborIds(db, personIdB);

  // Find intersection
  const mutual = [...neighborsA].filter((id) => neighborsB.has(id));

  return {
    mutualConnectionCount: mutual.length,
    mutualConnectionIds: mutual
  };
}

/**
 * Get mutual connection count for multiple candidates against an anchor person.
 * Returns a map from candidate personId to mutual connection count.
 */
export async function getMutualConnectionsBatch(
  db: SeekuDatabase,
  anchorPersonId: string,
  candidatePersonIds: string[]
): Promise<Map<string, number>> {
  if (candidatePersonIds.length === 0) {
    return new Map();
  }

  // Get all neighbors of anchor
  const anchorNeighbors = await getNeighborIds(db, anchorPersonId);

  const result = new Map<string, number>();

  for (const candidateId of candidatePersonIds) {
    const candidateNeighbors = await getNeighborIds(db, candidateId);
    const mutualCount = [...anchorNeighbors].filter((id) =>
      candidateNeighbors.has(id)
    ).length;
    result.set(candidateId, mutualCount);
  }

  return result;
}

// ============================================================================
// Graph Proximity
// ============================================================================

/**
 * Get comprehensive graph proximity information between two persons.
 */
export async function getGraphProximity(
  db: SeekuDatabase,
  personIdA: string,
  personIdB: string
): Promise<GraphProximityResult> {
  // Check direct neighbor relationship
  const isDirectNeighbor = await areDirectNeighbors(db, personIdA, personIdB);

  // Get features for both to check component
  const featuresA = await getGraphNodeFeatures(db, personIdA);
  const featuresB = await getGraphNodeFeatures(db, personIdB);

  const sameComponent =
    featuresA?.componentId !== null &&
    featuresB?.componentId !== null &&
    featuresA?.componentId === featuresB?.componentId;

  // Get mutual connections
  const mutualConnections = await getMutualConnections(db, personIdA, personIdB);

  return {
    isDirectNeighbor,
    sameComponent,
    mutualConnectionCount: mutualConnections.mutualConnectionCount
  };
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Get graph statistics summary.
 */
export async function getGraphStats(db: SeekuDatabase): Promise<{
  totalEdges: number;
  totalNodesWithFeatures: number;
  averageDegree: number;
  maxDegree: number;
}> {
  const edgeCount = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(graphEdges);

  const nodeCount = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(graphNodeFeatures);

  const degreeStats = await db
    .select({
      avg: sql<number>`AVG(undirected_degree)`,
      max: sql<number>`MAX(undirected_degree)`
    })
    .from(graphNodeFeatures);

  return {
    totalEdges: Number(edgeCount[0]?.count ?? 0),
    totalNodesWithFeatures: Number(nodeCount[0]?.count ?? 0),
    averageDegree: Number(degreeStats[0]?.avg ?? 0),
    maxDegree: Number(degreeStats[0]?.max ?? 0)
  };
}
