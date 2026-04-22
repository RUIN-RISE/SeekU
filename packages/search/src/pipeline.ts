/**
 * Search Pipeline Orchestrator — coordinates all search components in a unified flow.
 *
 * Provides a single entry point for search that orchestrates:
 * 1. Query parsing (QueryPlanner)
 * 2. Query cache lookup (QueryCache)
 * 3. Hybrid retrieval (HybridRetriever)
 * 4. Evidence & document loading
 * 5. Heuristic reranking (Reranker)
 * 6. Optional cross-encoder scoring (CrossEncoder)
 *
 * Supports progressive callbacks for streaming results.
 *
 * @module search/pipeline
 */

import type { EvidenceItem, SearchDocument, SeekuDatabase } from "@seeku/db";
import type { ChatMessage, ChatOptions, ChatResponse, EmbeddingResponse, LLMProvider } from "@seeku/llm";
import { QueryPlanner, type QueryIntent } from "./planner.js";
import { HybridRetriever, type RetrieverFilters, type SearchResult } from "./retriever.js";
import { Reranker, type RerankResult, type RerankerConfig } from "./reranker.js";
import { QueryCache } from "./query-cache.js";
import {
  CrossEncoder,
  extractCandidateSummary,
  type CrossEncoderConfig,
  type CrossEncoderScore,
  type CandidateSummary
} from "./cross-encoder.js";

export interface PipelineConfig {
  db: SeekuDatabase;
  provider: PipelineProvider;
  /** Enable query cache (default: true) */
  useCache?: boolean;
  /** Enable cross-encoder scoring (default: false) */
  useCrossEncoder?: boolean;
  /** Planner model override */
  plannerModel?: string;
  /** Cross-encoder model override */
  crossEncoderModel?: string;
  /** Reranker configuration */
  rerankerConfig?: Partial<RerankerConfig>;
  /** Maximum candidates to retrieve before reranking */
  retrievalLimit?: number;
  /** Maximum candidates to score with cross-encoder */
  crossEncoderLimit?: number;
}

export interface PipelineProgress {
  stage: "intent" | "cache" | "retrieve" | "load" | "rerank" | "cross_encoder" | "complete";
  message: string;
  data?: Record<string, unknown>;
}

export interface PipelineCallbacks {
  /** Called when pipeline stage changes */
  onProgress?: (progress: PipelineProgress) => void;
  /** Called when results are ready (for streaming) */
  onResults?: (results: RerankResult[]) => void;
}

export interface PipelineSearchOptions {
  signal?: AbortSignal;
}

export interface PipelineResult {
  results: RerankResult[];
  intent: QueryIntent;
  totalCandidates: number;
  cachedIntent: boolean;
  crossEncoderUsed: boolean;
  documents: Map<string, SearchDocument>;
  evidence: Map<string, EvidenceItem[]>;
}

interface PipelineProvider {
  readonly name: string;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  embed(text: string, options?: { model?: string; signal?: AbortSignal }): Promise<EmbeddingResponse>;
  embedBatch(texts: string[], options?: { model?: string; signal?: AbortSignal }): Promise<EmbeddingResponse[]>;
}

/**
 * Search Pipeline Orchestrator
 */
export class SearchPipeline {
  private readonly db: SeekuDatabase;
  private readonly provider: PipelineProvider;
  private readonly planner: QueryPlanner;
  private readonly retriever: HybridRetriever;
  private readonly reranker: Reranker;
  private readonly cache: QueryCache;
  private readonly crossEncoder?: CrossEncoder;

  private readonly useCache: boolean;
  private readonly useCrossEncoder: boolean;
  private readonly rerankerConfig: Partial<RerankerConfig>;
  private readonly retrievalLimit: number;
  private readonly crossEncoderLimit: number;

  constructor(config: PipelineConfig) {
    this.db = config.db;
    this.provider = config.provider;
    this.useCache = config.useCache ?? true;
    this.useCrossEncoder = config.useCrossEncoder ?? false;
    this.rerankerConfig = config.rerankerConfig ?? {};
    this.retrievalLimit = config.retrievalLimit ?? 100;
    this.crossEncoderLimit = config.crossEncoderLimit ?? 20;

    this.planner = new QueryPlanner({
      provider: this.provider,
      model: config.plannerModel
    });

    this.retriever = new HybridRetriever({
      db: this.db,
      provider: this.provider,
      limit: this.retrievalLimit
    });

    this.reranker = new Reranker(this.rerankerConfig);
    this.cache = new QueryCache();

    if (this.useCrossEncoder) {
      this.crossEncoder = new CrossEncoder({
        provider: this.provider,
        model: config.crossEncoderModel,
        batchSize: 5,
        timeoutMs: 5000
      });
    }
  }

  /**
   * Execute the full search pipeline.
   */
  async search(
    query: string,
    filters?: RetrieverFilters,
    callbacks?: PipelineCallbacks,
    options: PipelineSearchOptions = {}
  ): Promise<PipelineResult> {
    if (options.signal?.aborted) {
      throw options.signal.reason ?? new Error("Search pipeline aborted.");
    }

    const emit = (stage: PipelineProgress["stage"], message: string, data?: Record<string, unknown>) => {
      callbacks?.onProgress?.({ stage, message, data });
    };

    // Stage 1: Parse query intent
    emit("intent", "Parsing query intent");
    const intent = await this.planner.parse(query, { signal: options.signal });

    // Stage 2: Get query embedding and check cache
    emit("cache", "Checking query cache");
    const queryEmbedding = await this.provider.embed(intent.rawQuery, { signal: options.signal });
    let cachedIntent = false;

    const cached = this.cache.get(queryEmbedding.embedding);
    if (cached && this.useCache) {
      cachedIntent = true;
      emit("cache", "Using cached intent", { similarity: "high" });
    } else {
      this.cache.set(queryEmbedding.embedding, intent);
    }

    // Stage 3: Retrieve candidates
    emit("retrieve", "Retrieving candidates");
    const retrieved = await this.retriever.retrieve(intent, {
      filters,
      embedding: queryEmbedding.embedding,
      signal: options.signal
    });

    emit("retrieve", `Found ${retrieved.length} candidates`, { count: retrieved.length });

    if (retrieved.length === 0) {
      emit("complete", "No candidates found");
      return {
        results: [],
        intent,
        totalCandidates: 0,
        cachedIntent,
        crossEncoderUsed: false,
        documents: new Map(),
        evidence: new Map()
      };
    }

    // Stage 4: Load documents and evidence
    emit("load", "Loading documents and evidence");
    const personIds = retrieved.map((item) => item.personId);
    const { documents, evidence, persons } = await this.loadDocumentsAndEvidence(personIds);

    // Stage 5: Rerank with heuristics
    emit("rerank", "Reranking candidates");
    let reranked = this.reranker.rerank(retrieved, intent, documents, evidence);

    // Emit intermediate results for streaming
    callbacks?.onResults?.(reranked);

    // Stage 6: Optional cross-encoder scoring
    let crossEncoderScores: Map<string, CrossEncoderScore> | undefined;
    let crossEncoderUsed = false;

    if (this.useCrossEncoder && this.crossEncoder) {
      emit("cross_encoder", "Cross-encoder scoring");

      // Take top candidates for cross-encoder (expensive operation)
      const topCandidates = reranked.slice(0, this.crossEncoderLimit);
      const candidateSummaries = topCandidates.map((result) =>
        extractCandidateSummary(
          documents.get(result.personId),
          evidence.get(result.personId) ?? [],
          result.personId,
          persons.get(result.personId)
        )
      );

      const scores = await this.crossEncoder.scoreBatch(intent, candidateSummaries, {
        signal: options.signal
      });
      crossEncoderScores = new Map(scores.map((score) => [score.personId, score]));
      crossEncoderUsed = true;

      // Re-rerank with cross-encoder scores
      reranked = this.reranker.rerank(
        retrieved,
        intent,
        documents,
        evidence,
        crossEncoderScores
      );

      emit("cross_encoder", `Scored ${scores.length} candidates`, { count: scores.length });
    }

    emit("complete", "Pipeline complete", {
      results: reranked.length,
      crossEncoderUsed
    });

    return {
      results: reranked,
      intent,
      totalCandidates: retrieved.length,
      cachedIntent,
      crossEncoderUsed,
      documents,
      evidence
    };
  }

  private async loadDocumentsAndEvidence(personIds: string[]): Promise<{
    documents: Map<string, SearchDocument>;
    evidence: Map<string, EvidenceItem[]>;
    persons: Map<string, { primaryName: string; primaryHeadline: string | null }>;
  }> {
    // Import at runtime to avoid circular dependencies
    const { searchDocuments, evidenceItems, persons, eq, and, inArray } = await import("@seeku/db");

    const [docs, ev, people] = await Promise.all([
      this.db.select().from(searchDocuments).where(inArray(searchDocuments.personId, personIds)),
      this.db.select().from(evidenceItems).where(inArray(evidenceItems.personId, personIds)),
      this.db
        .select({
          id: persons.id,
          primaryName: persons.primaryName,
          primaryHeadline: persons.primaryHeadline
        })
        .from(persons)
        .where(and(eq(persons.searchStatus, "active"), inArray(persons.id, personIds)))
    ]);

    const documents = new Map(docs.map((doc) => [doc.personId, doc]));
    const evidence = new Map<string, EvidenceItem[]>();

    for (const item of ev) {
      const current = evidence.get(item.personId) ?? [];
      current.push(item);
      evidence.set(item.personId, current);
    }

    const personsMap = new Map(people.map((person) => [person.id, person]));

    return { documents, evidence, persons: personsMap };
  }

  /**
   * Clear the query cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics.
   */
  getCacheStats(): { size: number } {
    return { size: this.cache.size };
  }
}

/**
 * Execute a search pipeline in one call.
 */
export async function search(
  config: PipelineConfig,
  query: string,
  filters?: RetrieverFilters,
  callbacks?: PipelineCallbacks,
  options: PipelineSearchOptions = {}
): Promise<PipelineResult> {
  const pipeline = new SearchPipeline(config);
  return pipeline.search(query, filters, callbacks, options);
}
