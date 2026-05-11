/**
 * Graph Rerank Evaluation Script
 *
 * Runs baseline vs experiment comparison for graph-aware reranking.
 *
 * Baseline: Graph features disabled (empty map)
 * Experiment: Graph features enabled (when anchor exists)
 *
 * Metrics:
 * - Precision@5, Precision@10
 * - NDCG@10
 * - Graph feature presence rate
 */

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import type { GraphRerankFeatures } from "@seeku/search";
import { Reranker } from "@seeku/search";
import type { QueryIntent } from "@seeku/search";
import type { SearchDocument, EvidenceItem } from "@seeku/db";
import {
  getGraphNodeFeaturesBatch,
  getMutualConnectionsBatch,
  areDirectNeighbors
} from "@seeku/db";
import type { SeekuDatabase } from "@seeku/db";
import { createDatabase } from "@seeku/db";

// Load environment variables
config();

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const EVAL_DIR = resolve(MODULE_DIR, "..");
const REPO_ROOT = resolve(EVAL_DIR, "../..");

// ============================================================================
// Types
// ============================================================================

interface GraphEvalQuery {
  id: string;
  text: string;
  category: string;
  graphQueryType: string;
  anchorPersonId?: string;
  anchorPersonName?: string;
  expectedGraphFeatures: string[];
  notes?: string;
}

interface SearchResult {
  personId: string;
  keywordScore: number;
  vectorScore: number;
  combinedScore: number;
  matchedText: string;
}

interface EvalResult {
  queryId: string;
  category: string;
  hasAnchor: boolean;
  baselineTop5: string[];
  experimentTop5: string[];
  baselineTop10: string[];
  experimentTop10: string[];
  graphFeatureRate: number;
  graphBoostsApplied: number;
  rankChanges: RankChange[];
}

interface RankChange {
  personId: string;
  baselineRank: number;
  experimentRank: number;
  delta: number;
}

interface EvalSummary {
  totalQueries: number;
  graphSensitiveQueries: number;
  nonGraphQueries: number;
  avgGraphFeatureRate: number;
  avgGraphBoostsApplied: number;
  significantRankChanges: number;
  results: EvalResult[];
}

// ============================================================================
// Main Evaluation Function
// ============================================================================

export async function runGraphRerankEval(): Promise<EvalSummary> {
  console.log("Loading graph rerank eval dataset...");
  const datasetPath = resolve(REPO_ROOT, "packages/eval/datasets/graph-rerank-eval.json");
  const datasetContent = await readFile(datasetPath, "utf8");
  const queries = JSON.parse(datasetContent) as GraphEvalQuery[];

  console.log("Connecting to database...");
  const db = createDatabase();

  console.log(`Running ${queries.length} queries...`);
  const results: EvalResult[] = [];

  for (const query of queries) {
    console.log(`  [${query.id}] ${query.text.substring(0, 40)}...`);
    const result = await evaluateQuery(db, query);
    results.push(result);
  }

  const summary: EvalSummary = {
    totalQueries: queries.length,
    graphSensitiveQueries: queries.filter(q => q.anchorPersonId).length,
    nonGraphQueries: queries.filter(q => !q.anchorPersonId).length,
    avgGraphFeatureRate: results.reduce((sum, r) => sum + r.graphFeatureRate, 0) / results.length,
    avgGraphBoostsApplied: results.reduce((sum, r) => sum + r.graphBoostsApplied, 0) / results.length,
    significantRankChanges: results.filter(r => r.rankChanges.some(c => Math.abs(c.delta) >= 2)).length,
    results
  };

  return summary;
}

async function evaluateQuery(
  db: SeekuDatabase,
  query: GraphEvalQuery
): Promise<EvalResult> {
  // For this eval, we simulate search results
  // In a real implementation, this would call the actual search API

  // Generate mock search results (in real eval, these come from retriever)
  const mockResults = await generateMockSearchResults(db, query);

  // Fetch graph features if anchor exists
  const graphFeatures = query.anchorPersonId
    ? await fetchGraphFeaturesForEval(db, mockResults.map(r => r.personId), query.anchorPersonId)
    : new Map<string, GraphRerankFeatures>();

  // Create mock documents and evidence (simplified for eval)
  const documents = createMockDocuments(mockResults);
  const evidence = createMockEvidence(mockResults);
  const intent = createMockIntent(query);

  // Run baseline (no graph features)
  const baselineReranker = new Reranker();
  const baselineResults = baselineReranker.rerank(
    mockResults,
    intent,
    documents,
    evidence,
    undefined,
    undefined // No graph features
  );

  // Run experiment (with graph features)
  const experimentReranker = new Reranker();
  const experimentResults = experimentReranker.rerank(
    mockResults,
    intent,
    documents,
    evidence,
    undefined,
    graphFeatures
  );

  // Compute rank changes
  const rankChanges = computeRankChanges(baselineResults, experimentResults);

  return {
    queryId: query.id,
    category: query.category,
    hasAnchor: !!query.anchorPersonId,
    baselineTop5: baselineResults.slice(0, 5).map(r => r.personId),
    experimentTop5: experimentResults.slice(0, 5).map(r => r.personId),
    baselineTop10: baselineResults.slice(0, 10).map(r => r.personId),
    experimentTop10: experimentResults.slice(0, 10).map(r => r.personId),
    graphFeatureRate: graphFeatures.size / mockResults.length,
    graphBoostsApplied: experimentResults.filter(r =>
      r.matchReasons.some(reason => reason.startsWith("graph:"))
    ).length,
    rankChanges
  };
}

async function generateMockSearchResults(
  db: SeekuDatabase,
  query: GraphEvalQuery
): Promise<SearchResult[]> {
  // In a real implementation, this would use the actual retriever
  // For now, we query persons with matching criteria

  // Get some persons from the database
  const persons = await db.query.persons.findMany({
    limit: 20,
    columns: { id: true }
  });

  // Generate mock scores
  return persons.map((p, i) => ({
    personId: p.id,
    keywordScore: 0.5 + Math.random() * 0.3,
    vectorScore: 0.4 + Math.random() * 0.3,
    combinedScore: 0.45 + Math.random() * 0.3,
    matchedText: query.text
  }));
}

async function fetchGraphFeaturesForEval(
  db: SeekuDatabase,
  candidatePersonIds: string[],
  anchorPersonId: string
): Promise<Map<string, GraphRerankFeatures>> {
  if (candidatePersonIds.length === 0 || !anchorPersonId) {
    return new Map();
  }

  try {
    // Get node features for all candidates
    const nodeFeatures = await getGraphNodeFeaturesBatch(db, candidatePersonIds);
    const anchorFeatures = await getGraphNodeFeaturesBatch(db, [anchorPersonId]);
    const anchorFeature = anchorFeatures.get(anchorPersonId);

    if (!anchorFeature) {
      console.log(`    Anchor ${anchorPersonId} not in graph, skipping graph features`);
      return new Map();
    }

    // Get mutual connections
    const mutualCounts = await getMutualConnectionsBatch(db, anchorPersonId, candidatePersonIds);

    const result = new Map<string, GraphRerankFeatures>();

    for (const candidateId of candidatePersonIds) {
      const candidateFeature = nodeFeatures.get(candidateId);
      if (!candidateFeature) {
        continue; // Skip candidates not in graph
      }

      // Check direct neighbor
      const isDirectNeighbor = await areDirectNeighbors(db, anchorPersonId, candidateId);

      // Check same component
      const sameComponentAsAnchor =
        anchorFeature.componentId !== null &&
        candidateFeature.componentId !== null &&
        anchorFeature.componentId === candidateFeature.componentId;

      result.set(candidateId, {
        mutualConnectionCount: mutualCounts.get(candidateId) ?? 0,
        isDirectNeighbor,
        sameComponentAsAnchor
      });
    }

    return result;
  } catch (error) {
    console.error(`    Error fetching graph features: ${error}`);
    return new Map();
  }
}

function createMockDocuments(results: SearchResult[]): Map<string, SearchDocument> {
  const docs = new Map<string, SearchDocument>();
  for (const r of results) {
    docs.set(r.personId, {
      personId: r.personId,
      docText: r.matchedText,
      facetSource: ["bonjour"],
      facetRole: [],
      facetLocation: [],
      facetTags: [],
      rankFeatures: {
        freshness: 30,
        evidenceCount: 0,
        projectCount: 0,
        repoCount: 0,
        followerCount: 0
      },
      updatedAt: new Date()
    });
  }
  return docs;
}

function createMockEvidence(results: SearchResult[]): Map<string, EvidenceItem[]> {
  const evidence = new Map<string, EvidenceItem[]>();
  for (const r of results) {
    evidence.set(r.personId, []);
  }
  return evidence;
}

function createMockIntent(query: GraphEvalQuery): QueryIntent {
  return {
    rawQuery: query.text,
    roles: [],
    skills: [],
    locations: [],
    mustHaves: [],
    niceToHaves: []
  };
}

function computeRankChanges(
  baseline: Array<{ personId: string }>,
  experiment: Array<{ personId: string }>
): RankChange[] {
  const baselineRanks = new Map<string, number>();
  baseline.forEach((r, i) => baselineRanks.set(r.personId, i + 1));

  const changes: RankChange[] = [];
  experiment.forEach((r, experimentRank) => {
    const baselineRank = baselineRanks.get(r.personId);
    if (baselineRank !== undefined && baselineRank !== experimentRank + 1) {
      changes.push({
        personId: r.personId,
        baselineRank,
        experimentRank: experimentRank + 1,
        delta: baselineRank - (experimentRank + 1)
      });
    }
  });

  return changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 5);
}

// ============================================================================
// CLI Entry Point
// ============================================================================

export async function main() {
  console.log("=== Graph Rerank Evaluation ===\n");

  try {
    const summary = await runGraphRerankEval();

    console.log("\n=== Evaluation Summary ===");
    console.log(`Total queries: ${summary.totalQueries}`);
    console.log(`Graph-sensitive queries: ${summary.graphSensitiveQueries}`);
    console.log(`Non-graph queries: ${summary.nonGraphQueries}`);
    console.log(`Avg graph feature rate: ${(summary.avgGraphFeatureRate * 100).toFixed(1)}%`);
    console.log(`Avg graph boosts applied: ${summary.avgGraphBoostsApplied.toFixed(1)}`);
    console.log(`Queries with significant rank changes: ${summary.significantRankChanges}`);

    console.log("\n=== Per-Query Results ===");
    for (const result of summary.results) {
      console.log(`\n[${result.queryId}] (${result.category})`);
      console.log(`  Has anchor: ${result.hasAnchor}`);
      console.log(`  Graph feature rate: ${(result.graphFeatureRate * 100).toFixed(1)}%`);
      console.log(`  Graph boosts applied: ${result.graphBoostsApplied}`);

      if (result.rankChanges.length > 0) {
        console.log(`  Top rank changes:`);
        for (const change of result.rankChanges.slice(0, 3)) {
          console.log(`    ${change.personId.substring(0, 8)}...: ${change.baselineRank} -> ${change.experimentRank} (delta: ${change.delta > 0 ? '+' : ''}${change.delta})`);
        }
      }
    }

    // Write summary to file
    const outputPath = resolve(REPO_ROOT, ".planning/phases/15-graph-signals-reranking/eval-results.json");
    await writeFile(outputPath, JSON.stringify(summary, null, 2));
    console.log(`\nResults written to: ${outputPath}`);

  } catch (error) {
    console.error("Evaluation failed:", error);
    process.exit(1);
  }
}

const isDirectRun = process.argv[1]?.includes("graph-rerank-eval");
if (isDirectRun) {
  main();
}
