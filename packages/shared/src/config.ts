/**
 * Centralized application configuration for Seeku.
 *
 * All hardcoded batch sizes, timeouts, limits, and thresholds are defined here.
 * Each value can be overridden via environment variables.
 * Validated at load time with Zod — fails fast on invalid values.
 *
 * @module shared/config
 */

import { z } from "zod";

// ── Search ──────────────────────────────────────────────────────────────────
const SearchConfigSchema = z.object({
  /** Default number of results per search page */
  defaultLimit: z.coerce.number().int().min(1).max(200).default(20),
  /** Maximum allowed results per page */
  maxLimit: z.coerce.number().int().min(1).max(200).default(50),
  /** Planner: max input query length before truncation */
  maxQueryLength: z.coerce.number().int().min(100).max(10000).default(10000),
  /** Planner: max structured intent parse length */
  maxParseLength: z.coerce.number().int().min(100).max(50000).default(10000),
  /** Planner: LLM timeout in ms */
  plannerTimeoutMs: z.coerce.number().int().min(5000).max(120000).default(30000),
  /** Retriever: max candidates fetched from hybrid search */
  retrieverLimit: z.coerce.number().int().min(10).max(200).default(50),
});

// ── Embedding ───────────────────────────────────────────────────────────────
const EmbeddingConfigSchema = z.object({
  /** Batch size for embedding API calls */
  batchSize: z.coerce.number().int().min(1).max(100).default(50),
});

// ── Sync / Pipeline ─────────────────────────────────────────────────────────
const SyncConfigSchema = z.object({
  /** Default number of items to sync per batch */
  defaultBatchSize: z.coerce.number().int().min(1).max(500).default(20),
  /** Max items to process in a single identity resolution pass */
  identityResolutionLimit: z.coerce.number().int().min(10).max(5000).default(500),
  /** Number of profiles to enrich per worker run */
  enrichmentBatchSize: z.coerce.number().int().min(1).max(100).default(10),
  /** Social graph mining batch size */
  socialGraphBatchSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ── Crawler ─────────────────────────────────────────────────────────────────
const CrawlerConfigSchema = z.object({
  /** Fast fetch timeout in ms */
  fastTimeoutMs: z.coerce.number().int().min(1000).max(60000).default(10000),
  /** Jina Reader fallback timeout in ms */
  jinaTimeoutMs: z.coerce.number().int().min(5000).max(120000).default(30000),
  /** Max length of cleaned HTML content */
  maxCleanedLength: z.coerce.number().int().min(1000).max(50000).default(8000),
  /** Max length of Jina Reader content */
  maxJinaLength: z.coerce.number().int().min(1000).max(100000).default(15000),
});

// ── Cache ───────────────────────────────────────────────────────────────────
const CacheConfigSchema = z.object({
  /** Profile cache TTL in days */
  ttlDays: z.coerce.number().int().min(1).max(365).default(7),
});

// ── Retry (defaults, can be overridden per-call) ────────────────────────────
const RetryConfigSchema = z.object({
  maxRetries: z.coerce.number().int().min(0).max(10).default(3),
  baseDelayMs: z.coerce.number().int().min(100).max(60000).default(1000),
  maxDelayMs: z.coerce.number().int().min(1000).max(120000).default(30000),
});

// ── Coverage ────────────────────────────────────────────────────────────────
const CoverageConfigSchema = z.object({
  /** Number of random samples for coverage estimation */
  sampleSize: z.coerce.number().int().min(10).max(1000).default(100),
});

// ── Master schema ───────────────────────────────────────────────────────────
const AppConfigSchema = z.object({
  search: SearchConfigSchema,
  embedding: EmbeddingConfigSchema,
  sync: SyncConfigSchema,
  crawler: CrawlerConfigSchema,
  cache: CacheConfigSchema,
  retry: RetryConfigSchema,
  coverage: CoverageConfigSchema,
});

const rawConfig = {
  search: {
    defaultLimit: process.env.SEEKU_SEARCH_DEFAULT_LIMIT,
    maxLimit: process.env.SEEKU_SEARCH_MAX_LIMIT,
    maxQueryLength: process.env.SEEKU_SEARCH_MAX_QUERY_LENGTH,
    maxParseLength: process.env.SEEKU_SEARCH_MAX_PARSE_LENGTH,
    plannerTimeoutMs: process.env.SEEKU_PLANNER_TIMEOUT_MS,
    retrieverLimit: process.env.SEEKU_RETRIEVER_LIMIT,
  },
  embedding: {
    batchSize: process.env.SEEKU_EMBEDDING_BATCH_SIZE,
  },
  sync: {
    defaultBatchSize: process.env.SEEKU_SYNC_BATCH_SIZE,
    identityResolutionLimit: process.env.SEEKU_IDENTITY_LIMIT,
    enrichmentBatchSize: process.env.SEEKU_ENRICHMENT_BATCH_SIZE,
    socialGraphBatchSize: process.env.SEEKU_SOCIAL_GRAPH_BATCH_SIZE,
  },
  crawler: {
    fastTimeoutMs: process.env.SEEKU_CRAWLER_FAST_TIMEOUT,
    jinaTimeoutMs: process.env.SEEKU_CRAWLER_JINA_TIMEOUT,
    maxCleanedLength: process.env.SEEKU_CRAWLER_MAX_CLEANED,
    maxJinaLength: process.env.SEEKU_CRAWLER_MAX_JINA,
  },
  cache: {
    ttlDays: process.env.SEEKU_CACHE_TTL,
  },
  retry: {
    maxRetries: process.env.SEEKU_RETRY_MAX,
    baseDelayMs: process.env.SEEKU_RETRY_BASE_DELAY,
    maxDelayMs: process.env.SEEKU_RETRY_MAX_DELAY,
  },
  coverage: {
    sampleSize: process.env.SEEKU_COVERAGE_SAMPLE_SIZE,
  },
};

/**
 * Validated application configuration singleton.
 * Fails fast at import time if any env var has an invalid value.
 */
export const appConfig = AppConfigSchema.parse(rawConfig);

export type AppConfig = z.infer<typeof AppConfigSchema>;
