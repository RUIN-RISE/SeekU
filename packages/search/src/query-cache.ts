/**
 * Semantic Query Cache — stores parsed QueryIntents keyed by embedding similarity.
 *
 * When a new query arrives, its embedding is compared against cached entries.
 * If cosine similarity exceeds the threshold (default 0.95), the cached intent
 * is reused, saving an LLM planner call.
 *
 * Uses in-memory LRU with configurable max entries and TTL.
 *
 * @module search/query-cache
 */

import type { QueryIntent } from "./planner.js";

interface CacheEntry {
  embedding: number[];
  intent: QueryIntent;
  insertedAt: number; // Date.now()
}

export interface QueryCacheConfig {
  /** Maximum cache entries (default: 100) */
  maxEntries?: number;
  /** Cosine similarity threshold for cache hits (default: 0.95) */
  similarityThreshold?: number;
  /** TTL in milliseconds (default: 3600000 = 1 hour) */
  ttlMs?: number;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export class QueryCache {
  private readonly entries: Map<string, CacheEntry> = new Map();
  private readonly maxEntries: number;
  private readonly similarityThreshold: number;
  private readonly ttlMs: number;

  constructor(config?: QueryCacheConfig) {
    this.maxEntries = config?.maxEntries ?? 100;
    this.similarityThreshold = config?.similarityThreshold ?? 0.95;
    this.ttlMs = config?.ttlMs ?? 3_600_000; // 1 hour
  }

  /**
   * Look up a cached intent by embedding similarity.
   * Returns the cached intent if a match above threshold is found.
   */
  get(queryEmbedding: number[]): QueryIntent | null {
    this.evictStale();

    let bestScore = -1;
    let bestEntry: CacheEntry | null = null;

    for (const entry of this.entries.values()) {
      const score = cosineSimilarity(queryEmbedding, entry.embedding);
      if (score > bestScore) {
        bestScore = score;
        bestEntry = entry;
      }
    }

    if (bestEntry && bestScore >= this.similarityThreshold) {
      return bestEntry.intent;
    }

    return null;
  }

  /**
   * Store a parsed intent with its query embedding.
   */
  set(queryEmbedding: number[], intent: QueryIntent): void {
    // Evict stale entries first
    this.evictStale();

    // Generate a simple hash key from the embedding
    const key = this.computeKey(queryEmbedding);

    // If at capacity, evict the oldest entry
    if (this.entries.size >= this.maxEntries && !this.entries.has(key)) {
      const firstKey = this.entries.keys().next().value;
      if (firstKey) this.entries.delete(firstKey);
    }

    this.entries.set(key, {
      embedding: queryEmbedding,
      intent,
      insertedAt: Date.now()
    });
  }

  /** Current number of cached entries */
  get size(): number {
    return this.entries.size;
  }

  /** Remove all entries */
  clear(): void {
    this.entries.clear();
  }

  private evictStale(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (now - entry.insertedAt > this.ttlMs) {
        this.entries.delete(key);
      }
    }
  }

  private computeKey(embedding: number[]): string {
    // Simple hash: use first 8 dimensions + length as key
    const sample = embedding.slice(0, 8).map(v => v.toFixed(4)).join(",");
    return `${embedding.length}:${sample}`;
  }
}
