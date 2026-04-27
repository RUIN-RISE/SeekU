import type { FastifyInstance, FastifyRequest } from "fastify";

import { type SeekuDatabase } from "@seeku/db";
import { createProvider, type LLMProvider } from "@seeku/llm";
import { SearchPipeline, type PipelineProgress, type PipelineWarning, type RerankResult, type RetrieverFilters } from "@seeku/search";
import { classifyMatchStrength, type MatchStrength } from "@seeku/shared";
import { appConfig } from "@seeku/shared/config";

const STREAM_RESULT_LIMIT = appConfig.search.defaultLimit;

interface StreamSearchRequestBody {
  query: string;
  filters?: {
    locations?: string[];
    sources?: string[];
  };
}

interface StreamSearchResultCard {
  personId: string;
  name: string;
  headline: string | null;
  matchScore: number;
  matchStrength: MatchStrength;
  matchReasons: string[];
  evidencePreview: Array<{
    type: string;
    title: string | null;
    url: string | null;
    stars?: number;
  }>;
}

interface SSEEvent {
  event: "progress" | "results" | "warning" | "complete" | "error";
  data: {
    stage?: PipelineProgress["stage"];
    message?: string;
    results?: StreamSearchResultCard[];
    total?: number;
    intent?: unknown;
    error?: string;
    warning?: PipelineWarning;
    warnings?: PipelineWarning[];
  };
}

function parseFilters(input: unknown): RetrieverFilters {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  const value = input as { locations?: unknown; sources?: unknown };
  const normalize = (items: unknown): string[] | undefined => {
    if (!Array.isArray(items)) {
      return undefined;
    }

    const normalized = items
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

    return normalized.length > 0 ? [...new Set(normalized)] : undefined;
  };

  return {
    locations: normalize(value.locations),
    sources: normalize(value.sources)
  };
}

function parseBody(body: unknown): StreamSearchRequestBody {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Request body must be an object.");
  }

  const value = body as Record<string, unknown>;
  const query = typeof value.query === "string" ? value.query.trim() : "";

  if (!query) {
    throw new Error("query is required.");
  }

  return {
    query,
    filters: parseFilters(value.filters)
  };
}

function buildResponseCard(
  result: RerankResult,
  evidence: Array<{ evidenceType: string; title: string | null; url: string | null; metadata?: Record<string, unknown> }>
): StreamSearchResultCard {
  return {
    personId: result.personId,
    name: "Candidate",
    headline: null,
    matchScore: result.finalScore,
    matchStrength: classifyMatchStrength(result.finalScore, result.matchReasons),
    matchReasons:
      result.matchReasons.length > 0
        ? result.matchReasons
        : ["matched by hybrid keyword and semantic retrieval"],
    evidencePreview: evidence.slice(0, 3).map((item) => ({
      type: item.evidenceType,
      title: item.title,
      url: item.url,
      stars:
        typeof item.metadata?.stargazers_count === "number"
          ? item.metadata.stargazers_count
          : undefined
    }))
  };
}

function formatSSE(event: SSEEvent): string {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

export function registerStreamSearchRoutes(
  server: FastifyInstance,
  db: SeekuDatabase,
  provider?: LLMProvider
) {
  server.post("/search/stream", async (request: FastifyRequest, reply) => {
    let body: StreamSearchRequestBody;

    try {
      body = parseBody(request.body);
    } catch (error) {
      return reply.status(400).send({
        error: "invalid_request",
        message: error instanceof Error ? error.message : String(error)
      });
    }

    // Set SSE headers
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no" // Disable nginx buffering
    });

    const llmProvider = provider ?? createProvider();
    const pipeline = new SearchPipeline({
      db,
      provider: llmProvider,
      useCache: true,
      // Cross-encoder is async to first-byte (results stream progressively),
      // so enabling it here improves precision without blocking initial render.
      // Disable per-request via X-Seeku-Cross-Encoder header if cost-sensitive.
      useCrossEncoder: request.headers["x-seeku-cross-encoder"] !== "off",
      // Final response emits up to STREAM_RESULT_LIMIT cards; CE must cover that window or the
      // tail surfaces with heuristic-only scores and can leapfrog CE-scored
      // peers (see PR-1.2 in DIAGNOSTIC_REPORT_2026-04-26).
      crossEncoderLimit: STREAM_RESULT_LIMIT
    });

    // Track results for final emission
    let finalResults: RerankResult[] = [];
    const evidenceMap = new Map<string, Array<{ evidenceType: string; title: string | null; url: string | null; metadata?: Record<string, unknown> }>>();

    // SSE helper
    const sendEvent = (event: SSEEvent) => {
      reply.raw.write(formatSSE(event));
    };

    // Progress callback
    const onProgress = (progress: PipelineProgress) => {
      sendEvent({
        event: "progress",
        data: {
          stage: progress.stage,
          message: progress.message,
          ...progress.data
        }
      });
    };

    // Results callback (for progressive rendering)
    const onResults = (results: RerankResult[]) => {
      const cards = results.slice(0, 10).map((result) =>
        buildResponseCard(result, evidenceMap.get(result.personId) ?? [])
      );

      if (cards.length > 0) {
        sendEvent({
          event: "results",
          data: {
            results: cards,
            total: results.length
          }
        });
      }
    };

    // Warning callback — covers retrieval (vector failure / empty) and planner
    // (LLM parse / validation / timeout). Code prefix lets clients distinguish.
    const onWarning = (warning: PipelineWarning) => {
      sendEvent({
        event: "warning",
        data: { warning }
      });
    };

    try {
      const result = await pipeline.search(body.query, body.filters, {
        onProgress,
        onResults,
        onWarning
      });

      // Update evidence map
      for (const [personId, evidence] of result.evidence) {
        evidenceMap.set(personId, evidence);
      }

      finalResults = result.results;

      // Build final result cards with full evidence
      const finalCards = finalResults.slice(0, STREAM_RESULT_LIMIT).map((r) =>
        buildResponseCard(r, evidenceMap.get(r.personId) ?? [])
      );

      // Send complete event
      sendEvent({
        event: "complete",
        data: {
          results: finalCards,
          total: finalResults.length,
          intent: result.intent,
          warnings: result.warnings
        }
      });
    } catch (error) {
      sendEvent({
        event: "error",
        data: {
          error: error instanceof Error ? error.message : "Pipeline error"
        }
      });
    }

    reply.raw.end();
    return reply;
  });
}
