import { EvalResult, BenchmarkSummary } from "./types.js";

/**
 * Search result card from the API response
 */
export interface SearchResultCard {
  personId: string;
  name: string;
  matchScore: number;
  matchReasons: string[];
}

/**
 * Compute precision at K: fraction of expected items found in top K results
 * @param results - Search results from API
 * @param expectedIds - IDs of expected relevant items
 * @param k - Number of top results to consider
 * @returns Precision score between 0.0 and 1.0
 */
export function computePrecisionAtK(
  results: SearchResultCard[],
  expectedIds: string[],
  k: number
): number {
  if (expectedIds.length === 0 || k === 0) {
    return 0;
  }
  const topK = results.slice(0, k);
  const matches = topK.filter((r) => expectedIds.includes(r.personId));
  return matches.length / k;
}

/**
 * Compute coverage: whether any expected item was found in results
 * @param results - Search results from API
 * @param expectedIds - IDs of expected relevant items
 * @returns true if at least one expected item is in results
 */
export function computeCoverage(
  results: SearchResultCard[],
  expectedIds: string[]
): boolean {
  if (expectedIds.length === 0) {
    return false;
  }
  return results.some((r) => expectedIds.includes(r.personId));
}

/**
 * Find position of first expected item in results
 * @param results - Search results from API
 * @param expectedIds - IDs of expected relevant items
 * @returns 1-based position of first match, or -1 if not found
 */
export function findExpectedPosition(
  results: SearchResultCard[],
  expectedIds: string[]
): number {
  for (let i = 0; i < results.length; i++) {
    if (expectedIds.includes(results[i].personId)) {
      return i + 1; // 1-based position
    }
  }
  return -1; // Not found
}

/**
 * Summarize evaluation results into aggregate metrics
 * @param results - Per-query evaluation results
 * @returns Benchmark summary with aggregate metrics
 */
export function summarizeResults(results: EvalResult[]): BenchmarkSummary {
  if (results.length === 0) {
    return {
      totalQueries: 0,
      avgPrecisionAt5: 0,
      avgPrecisionAt10: 0,
      avgPrecisionAt20: 0,
      coverageRate: 0,
      results: []
    };
  }

  const sumP5 = results.reduce((sum, r) => sum + r.precisionAt5, 0);
  const sumP10 = results.reduce((sum, r) => sum + r.precisionAt10, 0);
  const sumP20 = results.reduce((sum, r) => sum + r.precisionAt20, 0);
  const coverageCount = results.filter((r) => r.coverage).length;

  return {
    totalQueries: results.length,
    avgPrecisionAt5: sumP5 / results.length,
    avgPrecisionAt10: sumP10 / results.length,
    avgPrecisionAt20: sumP20 / results.length,
    coverageRate: coverageCount / results.length,
    results
  };
}