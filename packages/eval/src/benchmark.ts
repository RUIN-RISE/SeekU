import { EvalQuery, GoldenSetEntry, EvalResult, BenchmarkSummary } from "./types.js";
import { loadQueries, loadGoldenSet } from "./dataset.js";
import {
  computePrecisionAtK,
  computeCoverage,
  findExpectedPosition,
  SearchResultCard
} from "./metrics.js";

/**
 * Configuration for benchmark execution
 */
export interface BenchmarkConfig {
  /** API base URL (default: http://localhost:3000) */
  apiBaseUrl?: string;
  /** Maximum results to request (default: 50) */
  limit?: number;
  /** Optional: use provided queries instead of loading from dataset */
  queries?: EvalQuery[];
  /** Optional: use provided golden set instead of loading from dataset */
  goldenSet?: GoldenSetEntry[];
}

/**
 * Run evaluation benchmark against search API
 * Executes all queries and computes precision@k and coverage metrics
 * @param config - Benchmark configuration
 * @returns Benchmark summary with aggregate and per-query results
 */
export async function runBenchmark(
  config: BenchmarkConfig = {}
): Promise<BenchmarkSummary> {
  const baseUrl = config.apiBaseUrl ?? "http://localhost:3000";
  const limit = config.limit ?? 50;

  // Load datasets
  const queries = config.queries ?? (await loadQueries());
  const goldenSet = config.goldenSet ?? (await loadGoldenSet());

  // Group golden set by queryId
  const goldenByQuery = new Map<string, string[]>();
  for (const entry of goldenSet) {
    const ids = goldenByQuery.get(entry.queryId) ?? [];
    ids.push(entry.personId);
    goldenByQuery.set(entry.queryId, ids);
  }

  const results: EvalResult[] = [];

  for (const query of queries) {
    const expectedIds = goldenByQuery.get(query.id) ?? [];

    // Call search API
    const response = await fetch(`${baseUrl}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: query.text, limit })
    });

    if (!response.ok) {
      // Skip failed query - record zeros
      results.push({
        queryId: query.id,
        precisionAt5: 0,
        precisionAt10: 0,
        precisionAt20: 0,
        coverage: false,
        expectedInTopK: -1
      });
      continue;
    }

    const data = (await response.json()) as { results: SearchResultCard[] };
    const searchResults = data.results ?? [];

    results.push({
      queryId: query.id,
      precisionAt5: computePrecisionAtK(searchResults, expectedIds, 5),
      precisionAt10: computePrecisionAtK(searchResults, expectedIds, 10),
      precisionAt20: computePrecisionAtK(searchResults, expectedIds, 20),
      coverage: computeCoverage(searchResults, expectedIds),
      expectedInTopK: findExpectedPosition(searchResults, expectedIds)
    });
  }

  return summarizeResultsInternal(results);
}

/**
 * Summarize evaluation results into aggregate metrics
 * Internal function to avoid circular dependency with metrics.ts
 */
function summarizeResultsInternal(results: EvalResult[]): BenchmarkSummary {
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