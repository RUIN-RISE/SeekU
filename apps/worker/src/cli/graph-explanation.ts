/**
 * Graph explanation templates for Seeku CLI.
 *
 * All explanations use accurate "follow/follower" semantics from Bonjour.
 * These are NOT trust, collaboration, or friendship relationships.
 */

import type { CandidateGraphFeatures } from "./types.js";

// ============================================================================
// Explanation Templates
// ============================================================================

/**
 * Format explanation for mutual connections with an anchor person.
 * Uses "follow" semantics accurately.
 */
export function formatMutualConnectionsExplanation(
  mutualConnectionCount: number,
  anchorName: string
): string | null {
  if (mutualConnectionCount <= 0) {
    return null;
  }

  if (mutualConnectionCount === 1) {
    return `与 ${anchorName} 有 1 个共同 Bonjour 连接（双方都关注的人）`;
  }

  return `与 ${anchorName} 有 ${mutualConnectionCount} 个共同 Bonjour 连接（双方都关注的人）`;
}

/**
 * Format explanation for direct neighbor relationship.
 * Uses "follow" semantics accurately.
 */
export function formatDirectNeighborExplanation(
  anchorName: string,
  direction?: "follows" | "followed-by" | "unknown"
): string {
  if (direction === "follows") {
    return `在 Bonjour 上关注 ${anchorName}`;
  }

  if (direction === "followed-by") {
    return `被 ${anchorName} 在 Bonjour 上关注`;
  }

  // When direction is unknown, use neutral phrasing
  return `与 ${anchorName} 在 Bonjour 上有直接关注关系`;
}

/**
 * Format explanation for being in the same component as anchor.
 * Uses "social circle" metaphor but clarifies it's based on follow relationships.
 */
export function formatSameComponentExplanation(
  anchorName: string,
  componentSize?: number | null
): string {
  if (componentSize && componentSize > 100) {
    return `与 ${anchorName} 处于同一个 Bonjour 社交圈子（该圈子有 ${componentSize} 人）`;
  }

  return `与 ${anchorName} 处于同一个 Bonjour 社交圈子`;
}

/**
 * Format explanation for high degree (highly connected nodes).
 * Uses "connection" terminology, not "influence" or "importance".
 */
export function formatHighDegreeExplanation(
  undirectedDegree: number,
  percentile?: number
): string | null {
  // Only show explanation for nodes with significant connections
  if (undirectedDegree < 50) {
    return null;
  }

  if (percentile && percentile >= 95) {
    return `在 Bonjour 上有 ${undirectedDegree} 个连接（位于前 5% 高连接度用户）`;
  }

  if (percentile && percentile >= 90) {
    return `在 Bonjour 上有 ${undirectedDegree} 个连接（位于前 10% 高连接度用户）`;
  }

  if (undirectedDegree >= 100) {
    return `在 Bonjour 上有 ${undirectedDegree} 个连接（连接度较高）`;
  }

  return `在 Bonjour 上有 ${undirectedDegree} 个连接`;
}

/**
 * Format explanation when no graph data is available.
 */
export function formatNoGraphDataExplanation(): string {
  return "暂无 Bonjour 社交关系数据";
}

/**
 * Format a comprehensive graph explanation for a candidate.
 * Combines multiple signals into a single explanation string.
 */
export function formatGraphExplanation(
  graphFeatures: CandidateGraphFeatures,
  anchorName?: string
): string | null {
  const parts: string[] = [];

  // Mutual connections (most interesting signal)
  if (anchorName && graphFeatures.mutualConnectionCount && graphFeatures.mutualConnectionCount > 0) {
    parts.push(formatMutualConnectionsExplanation(graphFeatures.mutualConnectionCount, anchorName)!);
  }

  // Direct neighbor
  if (anchorName && graphFeatures.isDirectNeighbor) {
    parts.push(formatDirectNeighborExplanation(anchorName));
  }

  // Same component
  if (anchorName && graphFeatures.sameComponentAsAnchor) {
    parts.push(formatSameComponentExplanation(anchorName, graphFeatures.componentSize));
  }

  // High degree (only for very high degree nodes)
  const degreeExplanation = formatHighDegreeExplanation(graphFeatures.undirectedDegree);
  if (degreeExplanation) {
    parts.push(degreeExplanation);
  }

  if (parts.length === 0) {
    return null;
  }

  return parts.join("；");
}

/**
 * Format a short graph badge for display in shortlist.
 * Returns a compact string suitable for inline display.
 */
export function formatGraphBadge(
  graphFeatures: CandidateGraphFeatures,
  anchorName?: string
): string | null {
  // Mutual connections badge
  if (anchorName && graphFeatures.mutualConnectionCount && graphFeatures.mutualConnectionCount > 0) {
    return `🔗 ${graphFeatures.mutualConnectionCount} 共同连接`;
  }

  // Direct neighbor badge
  if (anchorName && graphFeatures.isDirectNeighbor) {
    return `🔗 直接连接`;
  }

  // High degree badge
  if (graphFeatures.undirectedDegree >= 100) {
    return `🔗 ${graphFeatures.undirectedDegree} 连接`;
  }

  return null;
}

// ============================================================================
// Caveat Warnings
// ============================================================================

/**
 * Get caveat warning about graph semantics.
 * Should be displayed when graph explanations are shown.
 */
export function getGraphSemanticsCaveat(): string {
  return "注意：Bonjour \"关注\" 关系不等同于信任、合作或实际社交关系。";
}

/**
 * Check if caveat should be shown for a given explanation.
 */
export function shouldShowGraphCaveat(graphFeatures: CandidateGraphFeatures): boolean {
  // Show caveat whenever we have graph data
  return graphFeatures.undirectedDegree > 0;
}