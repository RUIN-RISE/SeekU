import type { LLMProvider } from "./provider.js";

interface EmbeddingCache {
  get(key: string): number[] | undefined;
  set(key: string, embedding: number[]): void;
}

// Simple in-memory cache for development
const memoryCache = new Map<string, number[]>();

export const defaultCache: EmbeddingCache = {
  get: (key) => memoryCache.get(key),
  set: (key, embedding) => memoryCache.set(key, embedding)
};

/**
 * Generate a stable cache key for embedding
 */
function makeCacheKey(text: string): string {
  // Use first 50 chars + length as a stable fingerprint
  const fingerprint = text.slice(0, 50).replace(/\s+/g, " ").trim();
  return `embed:${fingerprint}:${text.length}`;
}

/**
 * Generate embedding for a single text with caching
 */
export async function generateEmbedding(
  provider: LLMProvider,
  text: string,
  cache?: EmbeddingCache,
  options: { signal?: AbortSignal } = {}
): Promise<number[]> {
  const cacheKey = makeCacheKey(text);

  if (cache) {
    const cached = cache.get(cacheKey);
    if (cached) return cached;
  }

  const response = await provider.embed(text, { signal: options.signal });

  if (cache) {
    cache.set(cacheKey, response.embedding);
  }

  return response.embedding;
}

/**
 * Generate embeddings for multiple texts with caching and batching
 */
export async function generateEmbeddings(
  provider: LLMProvider,
  texts: string[],
  cache?: EmbeddingCache,
  options: { signal?: AbortSignal } = {}
): Promise<number[][]> {
  // Check cache for each text
  const uncachedIndices: number[] = [];
  const results: (number[] | undefined)[] = texts.map((text, i) => {
    const cacheKey = makeCacheKey(text);
    const cached = cache?.get(cacheKey);
    if (cached) return cached;
    uncachedIndices.push(i);
    return undefined;
  });

  // Batch generate uncached embeddings
  if (uncachedIndices.length > 0) {
    const uncachedTexts = uncachedIndices.map(i => texts[i]);
    const embeddings = await provider.embedBatch(uncachedTexts, { signal: options.signal });

    for (let j = 0; j < uncachedIndices.length; j++) {
      const embedding = embeddings[j];
      results[uncachedIndices[j]] = embedding.embedding;

      // Cache the result
      const text = texts[uncachedIndices[j]];
      const cacheKey = makeCacheKey(text);
      cache?.set(cacheKey, embedding.embedding);
    }
  }

  return results as number[][];
}

/**
 * Clear the in-memory cache
 */
export function clearCache(): void {
  memoryCache.clear();
}
