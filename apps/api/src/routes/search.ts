import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  and,
  eq,
  inArray,
  not,
  persons,
  type EvidenceItem,
  type SeekuDatabase,
  type SearchStatus
} from "@seeku/db";
import { createProvider, type LLMProvider } from "@seeku/llm";
import {
  buildDisambiguationNotes,
  SearchPipeline,
  type QueryIntent,
  type RerankResult,
  type RetrievalWarning,
  type PlannerWarning,
  type PipelineWarning,
  type RetrieverFilters
} from "@seeku/search";
import { classifyMatchStrength, type MatchStrength } from "@seeku/shared";
import { appConfig } from "@seeku/shared/config";

interface SearchRequestBody {
  query: string;
  limit?: number;
  offset?: number;
  filters?: {
    locations?: string[];
    sources?: string[];
  };
}

interface SearchResultCard {
  personId: string;
  name: string;
  headline: string | null;
  matchScore: number;
  matchStrength: MatchStrength;
  matchReasons: string[];
  disambiguation?: string;
  evidencePreview: Array<{
    type: string;
    title: string | null;
    url: string | null;
    stars?: number;
  }>;
  searchStatus?: SearchStatus;
}

export type SearchResultWarningCode =
  | "no_results"
  | "no_strong_match_medium"
  | "no_strong_match_weak";

export interface SearchResultWarning {
  code: SearchResultWarningCode;
  topMatchStrength: MatchStrength | "none";
  /** Human-readable message — kept for backward compat with current UI. */
  message: string;
  /** Suggested next-step hint codes. UI should localize from these, not message. */
  suggestionCodes: string[];
}

interface SearchResponseBody {
  results: SearchResultCard[];
  total: number;
  intent: QueryIntent;
  /** Backward-compat string warning. Prefer `resultWarningDetail`. */
  resultWarning?: string;
  resultWarningDetail?: SearchResultWarning;
  /** Retrieval-stage warnings from pipeline (e.g. vector_search_failed). */
  retrievalWarnings?: RetrievalWarning[];
  /** Planner-stage warnings from pipeline (e.g. llm_parse_failed). */
  plannerWarnings?: PlannerWarning[];
}

export interface SearchServices {
  provider: LLMProvider;
  pipeline: SearchPipeline;
}

interface SearchRouteOptions {
  services?: SearchServices;
}

const DEFAULT_LIMIT = appConfig.search.defaultLimit;
const MAX_LIMIT = appConfig.search.maxLimit;
const serviceCache = new WeakMap<SeekuDatabase, SearchServices>();

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

function parseBody(body: unknown): SearchRequestBody {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Request body must be an object.");
  }

  const value = body as Record<string, unknown>;
  const query = typeof value.query === "string" ? value.query.trim() : "";
  const limit = typeof value.limit === "number" ? value.limit : DEFAULT_LIMIT;
  const offset = typeof value.offset === "number" ? value.offset : 0;

  if (!query) {
    throw new Error("query is required.");
  }

  return {
    query,
    limit: Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit))),
    offset: Math.max(0, Math.floor(offset)),
    filters: parseFilters(value.filters)
  };
}

function getSearchServices(db: SeekuDatabase, overrides?: SearchServices): SearchServices {
  if (overrides) {
    return overrides;
  }

  const cached = serviceCache.get(db);
  if (cached) {
    return cached;
  }

  const provider = createProvider();
  const pipeline = new SearchPipeline({
    db,
    provider,
    useCache: true,
    // Web's one-shot REST endpoint pays the cross-encoder cost for precision.
    useCrossEncoder: true,
    retrievalLimit: MAX_LIMIT,
    // CE coverage must span the full result window the API can return; default
    // 15 leaves the tail of a 50-row response unscored, which lets unscored
    // candidates leapfrog scored ones (heuristic=0.6 beats heuristic=0.8 *
    // 0.7 + low-CE * 0.3 = 0.59 — see PR-1.2 in DIAGNOSTIC_REPORT_2026-04-26).
    crossEncoderLimit: MAX_LIMIT
  });
  const services: SearchServices = {
    provider,
    pipeline
  };

  serviceCache.set(db, services);
  return services;
}

function buildStructuredWarning(
  results: Array<Pick<SearchResultCard, "matchStrength">>
): SearchResultWarning | undefined {
  if (results.length === 0) {
    return {
      code: "no_results",
      topMatchStrength: "none",
      message: "没有找到任何候选人。建议放宽必须项或调整关键词。",
      suggestionCodes: ["broaden_must_haves", "broaden_query"]
    };
  }

  if (results.some((result) => result.matchStrength === "strong")) {
    return undefined;
  }

  if (results.some((result) => result.matchStrength === "medium")) {
    return {
      code: "no_strong_match_medium",
      topMatchStrength: "medium",
      message:
        "没有找到强匹配，当前结果以中等相关候选人为主。建议继续补充必须项、关键技术或放宽来源过滤。",
      suggestionCodes: ["add_must_haves", "broaden_sources"]
    };
  }

  return {
    code: "no_strong_match_weak",
    topMatchStrength: "weak",
    message:
      "没有找到强匹配，只找到了弱相关候选人。建议继续补充必须项、关键技术或放宽来源过滤。",
    suggestionCodes: ["clarify_role", "clarify_skill", "broaden_sources"]
  };
}

function buildResponseCard(
  result: RerankResult,
  person: { primaryName: string; primaryHeadline: string | null; searchStatus: SearchStatus } | undefined,
  evidence: EvidenceItem[],
  disambiguation?: string
): SearchResultCard {
  const matchReasons =
    result.matchReasons.length > 0
      ? result.matchReasons
      : ["matched by hybrid keyword and semantic retrieval"];

  return {
    personId: result.personId,
    name: person?.primaryName ?? "Unknown",
    headline: person?.primaryHeadline ?? null,
    matchScore: result.finalScore,
    matchStrength: classifyMatchStrength(result.finalScore, result.matchReasons),
    matchReasons: disambiguation ? [...matchReasons, disambiguation] : matchReasons,
    disambiguation,
    evidencePreview: evidence.slice(0, 3).map((item) => ({
      type: item.evidenceType,
      title: item.title ?? null,
      url: item.url ?? null,
      stars:
        typeof item.metadata?.stargazers_count === "number"
          ? item.metadata.stargazers_count
          : undefined
    })),
    searchStatus: person?.searchStatus ?? "active"
  };
}

async function handleSearch(
  db: SeekuDatabase,
  options: SearchRouteOptions,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<SearchResponseBody | ReturnType<FastifyReply["status"]>> {
  let body: SearchRequestBody;

  try {
    body = parseBody(request.body);
  } catch (error) {
    return reply.status(400).send({
      error: "invalid_request",
      message: error instanceof Error ? error.message : String(error)
    });
  }

  const services = getSearchServices(db, options.services);
  const retrievalWarnings: RetrievalWarning[] = [];
  const plannerWarnings: PlannerWarning[] = [];

  const pipelineResult = await services.pipeline.search(
    body.query,
    body.filters,
    {
      onWarning: (warning: PipelineWarning) => {
        if (warning.code.startsWith("llm_")) {
          plannerWarnings.push(warning as PlannerWarning);
        } else {
          retrievalWarnings.push(warning as RetrievalWarning);
        }
      }
    }
  );

  const reranked = pipelineResult.results;

  if (reranked.length === 0) {
    return {
      results: [],
      total: 0,
      intent: pipelineResult.intent,
      resultWarning: "没有找到任何候选人。建议放宽必须项或调整关键词。",
      resultWarningDetail: buildStructuredWarning([]),
      retrievalWarnings: retrievalWarnings.length > 0 ? retrievalWarnings : undefined,
      plannerWarnings: plannerWarnings.length > 0 ? plannerWarnings : undefined
    };
  }

  // Pipeline already loaded persons via active-status filter; we re-fetch here
  // to also surface non-hidden but non-active candidates (matches legacy semantics).
  const personIds = reranked.map((item) => item.personId);
  const people = await db
    .select({
      id: persons.id,
      primaryName: persons.primaryName,
      primaryHeadline: persons.primaryHeadline,
      searchStatus: persons.searchStatus
    })
    .from(persons)
    .where(and(not(eq(persons.searchStatus, "hidden")), inArray(persons.id, personIds)));

  const personMap = new Map(people.map((person) => [person.id, person]));
  const documentMap = pipelineResult.documents;
  const evidenceMap = pipelineResult.evidence;

  const offset = body.offset ?? 0;
  const limit = body.limit ?? DEFAULT_LIMIT;
  const disambiguationNotes = buildDisambiguationNotes(
    body.query,
    reranked.slice(0, Math.max(offset + limit, 10)).map((result) => ({
      personId: result.personId,
      name: personMap.get(result.personId)?.primaryName ?? "Unknown",
      headline: personMap.get(result.personId)?.primaryHeadline ?? null,
      matchReasons: result.matchReasons,
      document: documentMap.get(result.personId)
    }))
  );

  if (offset >= reranked.length && reranked.length > 0) {
    request.log.warn({ offset, total: reranked.length }, "Search offset exceeds total results");
  }

  const paged = reranked.slice(offset, offset + limit);
  const responseCards = paged.map((result) =>
    buildResponseCard(
      result,
      personMap.get(result.personId),
      evidenceMap.get(result.personId) ?? [],
      disambiguationNotes.get(result.personId)
    )
  );

  const detail = buildStructuredWarning(responseCards);

  return {
    results: responseCards,
    total: reranked.length,
    intent: pipelineResult.intent,
    resultWarning: detail?.message,
    resultWarningDetail: detail,
    retrievalWarnings: retrievalWarnings.length > 0 ? retrievalWarnings : undefined,
    plannerWarnings: plannerWarnings.length > 0 ? plannerWarnings : undefined
  };
}

export function registerSearchRoutes(
  server: FastifyInstance,
  db: SeekuDatabase,
  options: SearchRouteOptions = {}
) {
  server.post("/search", async (request, reply) => handleSearch(db, options, request, reply));
}
