import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  and,
  evidenceItems,
  eq,
  inArray,
  not,
  persons,
  searchDocuments,
  type EvidenceItem,
  type SearchDocument,
  type SeekuDatabase,
  type SearchStatus
} from "@seeku/db";
import { createProvider, type LLMProvider } from "@seeku/llm";
import {
  buildDisambiguationNotes,
  HybridRetriever,
  QueryPlanner,
  Reranker,
  type QueryIntent,
  type RerankResult,
  type RetrieverFilters
} from "@seeku/search";
import { classifyMatchStrength, type MatchStrength } from "@seeku/shared";
import { appConfig } from "@seeku/shared/config";
import { QueryCache } from "@seeku/search";

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

interface SearchResponseBody {
  results: SearchResultCard[];
  total: number;
  intent: QueryIntent;
  resultWarning?: string;
}

export interface SearchServices {
  provider: LLMProvider;
  planner: QueryPlanner;
  retriever: HybridRetriever;
  reranker: Reranker;
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
  const services: SearchServices = {
    provider,
    planner: new QueryPlanner({ provider }),
    retriever: new HybridRetriever({ db, provider, limit: MAX_LIMIT }),
    reranker: new Reranker()
  };

  serviceCache.set(db, services);
  return services;
}

function groupEvidence(items: EvidenceItem[]): Map<string, EvidenceItem[]> {
  const grouped = new Map<string, EvidenceItem[]>();

  for (const item of items) {
    const current = grouped.get(item.personId) ?? [];
    current.push(item);
    grouped.set(item.personId, current);
  }

  return grouped;
}

function buildApiResultWarning(results: Array<Pick<SearchResultCard, "matchStrength">>) {
  if (results.length === 0 || results.some((result) => result.matchStrength === "strong")) {
    return undefined;
  }

  if (results.some((result) => result.matchStrength === "medium")) {
    return "没有找到强匹配，当前结果以中等相关候选人为主。建议继续补充必须项、关键技术或放宽来源过滤。";
  }

  return "没有找到强匹配，只找到了弱相关候选人。建议继续补充必须项、关键技术或放宽来源过滤。";
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
  const intent = await services.planner.parse(body.query);
  const queryEmbedding = await services.provider.embed(intent.rawQuery);
  const retrieved = await services.retriever.retrieve(intent, {
    filters: body.filters,
    embedding: queryEmbedding.embedding
  });

  if (retrieved.length === 0) {
    return {
      results: [],
      total: 0,
      intent
    };
  }

  const personIds = retrieved.map((item) => item.personId);
  const [documents, evidence, people] = await Promise.all([
    db.select().from(searchDocuments).where(inArray(searchDocuments.personId, personIds)),
    db.select().from(evidenceItems).where(inArray(evidenceItems.personId, personIds)),
    db
      .select({
        id: persons.id,
        primaryName: persons.primaryName,
        primaryHeadline: persons.primaryHeadline,
        searchStatus: persons.searchStatus
      })
      .from(persons)
      .where(and(not(eq(persons.searchStatus, "hidden")), inArray(persons.id, personIds)))
  ]);

  const documentMap = new Map<string, SearchDocument>(
    documents.map((document) => [document.personId, document])
  );
  const evidenceMap = groupEvidence(evidence);
  const personMap = new Map(people.map((person) => [person.id, person]));
  const reranked = services.reranker.rerank(retrieved, intent, documentMap, evidenceMap);
  const disambiguationNotes = buildDisambiguationNotes(
    body.query,
    reranked.slice(0, Math.max((body.offset ?? 0) + (body.limit ?? DEFAULT_LIMIT), 10)).map((result) => ({
      personId: result.personId,
      name: personMap.get(result.personId)?.primaryName ?? "Unknown",
      headline: personMap.get(result.personId)?.primaryHeadline ?? null,
      matchReasons: result.matchReasons,
      document: documentMap.get(result.personId)
    }))
  );
  const offset = body.offset ?? 0;
  const limit = body.limit ?? DEFAULT_LIMIT;

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

  return {
    results: responseCards,
    total: reranked.length,
    intent,
    resultWarning: buildApiResultWarning(responseCards)
  };
}

export function registerSearchRoutes(
  server: FastifyInstance,
  db: SeekuDatabase,
  options: SearchRouteOptions = {}
) {
  server.post("/search", async (request, reply) => handleSearch(db, options, request, reply));
}
