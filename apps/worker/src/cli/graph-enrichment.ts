/**
 * Graph feature enrichment for candidates.
 *
 * This module provides functions to attach graph features to candidates
 * after retrieval, enabling graph-backed explanations in the UI.
 */

import type { SeekuDatabase } from "@seeku/db";
import {
  getGraphNodeFeaturesBatch,
  getMutualConnectionsBatch,
  getGraphProximity
} from "@seeku/db";
import type { ScoredCandidate, CandidateGraphFeatures } from "./types.js";

/**
 * Enrich candidates with graph features.
 *
 * This function:
 * 1. Fetches node features (degree, component) for all candidates
 * 2. If an anchor person is provided, computes proximity features (mutual connections, direct neighbor, same component)
 * 3. Attaches graphFeatures to each candidate
 *
 * @param db Database connection
 * @param candidates Candidates to enrich (modified in place)
 * @param anchorPersonId Optional anchor person ID for proximity calculations
 */
export async function enrichCandidatesWithGraphFeatures(
  db: SeekuDatabase,
  candidates: ScoredCandidate[],
  anchorPersonId?: string
): Promise<void> {
  if (candidates.length === 0) {
    return;
  }

  const personIds = candidates.map((c) => c.personId);

  // Fetch node features for all candidates
  const nodeFeaturesMap = await getGraphNodeFeaturesBatch(db, personIds);

  // If anchor is provided, compute proximity features
  let proximityMap: Map<string, { mutualCount: number; isDirectNeighbor: boolean; sameComponent: boolean }> = new Map();
  if (anchorPersonId) {
    // Get mutual connections for all candidates against anchor
    const mutualConnectionsMap = await getMutualConnectionsBatch(db, anchorPersonId, personIds);

    // Get anchor's features for component comparison
    const anchorFeatures = await getGraphNodeFeaturesBatch(db, [anchorPersonId]);
    const anchorComponentId = anchorFeatures.get(anchorPersonId)?.componentId;

    // Check direct neighbor status for each candidate
    for (const candidate of candidates) {
      const candidateId = candidate.personId;
      const mutualCount = mutualConnectionsMap.get(candidateId) ?? 0;
      const candidateFeatures = nodeFeaturesMap.get(candidateId);

      // Check if direct neighbor (expensive, so we do it per candidate)
      let isDirectNeighbor = false;
      try {
        isDirectNeighbor = await getGraphProximity(db, anchorPersonId, candidateId)
          .then((p) => p.isDirectNeighbor);
      } catch {
        // If check fails, assume not a direct neighbor
        isDirectNeighbor = false;
      }

      const sameComponent = Boolean(
        anchorComponentId &&
        candidateFeatures?.componentId &&
        anchorComponentId === candidateFeatures.componentId
      );

      proximityMap.set(candidateId, {
        mutualCount,
        isDirectNeighbor,
        sameComponent
      });
    }
  }

  // Attach features to candidates
  for (const candidate of candidates) {
    const nodeFeatures = nodeFeaturesMap.get(candidate.personId);

    if (!nodeFeatures) {
      // No graph data for this candidate
      continue;
    }

    const proximity = proximityMap.get(candidate.personId);

    const graphFeatures: CandidateGraphFeatures = {
      undirectedDegree: nodeFeatures.undirectedDegree,
      outDegree: nodeFeatures.outDegree,
      inDegree: nodeFeatures.inDegree,
      componentSize: nodeFeatures.componentSize,
      ...(proximity && {
        mutualConnectionCount: proximity.mutualCount,
        isDirectNeighbor: proximity.isDirectNeighbor,
        sameComponentAsAnchor: proximity.sameComponent
      })
    };

    candidate.graphFeatures = graphFeatures;
  }
}

/**
 * Get graph explanation for a candidate.
 * Returns a human-readable explanation string or null if no graph data.
 */
export function getGraphExplanationForCandidate(
  candidate: ScoredCandidate,
  anchorName?: string
): string | null {
  if (!candidate.graphFeatures) {
    return null;
  }

  const features = candidate.graphFeatures;

  // Build explanation based on available features
  const parts: string[] = [];

  // Mutual connections (most interesting)
  if (anchorName && features.mutualConnectionCount && features.mutualConnectionCount > 0) {
    if (features.mutualConnectionCount === 1) {
      parts.push(`与 ${anchorName} 有 1 个共同 Bonjour 连接`);
    } else {
      parts.push(`与 ${anchorName} 有 ${features.mutualConnectionCount} 个共同 Bonjour 连接`);
    }
  }

  // Direct neighbor
  if (anchorName && features.isDirectNeighbor) {
    parts.push(`与 ${anchorName} 在 Bonjour 上有直接关注关系`);
  }

  // Same component
  if (anchorName && features.sameComponentAsAnchor) {
    parts.push(`与 ${anchorName} 处于同一个 Bonjour 社交圈子`);
  }

  // High degree (only for very high degree nodes)
  if (features.undirectedDegree >= 100) {
    parts.push(`在 Bonjour 上有 ${features.undirectedDegree} 个连接`);
  }

  if (parts.length === 0) {
    return null;
  }

  return `社交信号：${parts.join("；")}`;
}

/**
 * Get a short graph badge for display in shortlist.
 */
export function getGraphBadgeForCandidate(
  candidate: ScoredCandidate,
  anchorName?: string
): string | null {
  if (!candidate.graphFeatures) {
    return null;
  }

  const features = candidate.graphFeatures;

  // Mutual connections badge
  if (anchorName && features.mutualConnectionCount && features.mutualConnectionCount > 0) {
    return `🔗 ${features.mutualConnectionCount} 共同连接`;
  }

  // Direct neighbor badge
  if (anchorName && features.isDirectNeighbor) {
    return `🔗 直接连接`;
  }

  // High degree badge
  if (features.undirectedDegree >= 100) {
    return `🔗 ${features.undirectedDegree} 连接`;
  }

  return null;
}
