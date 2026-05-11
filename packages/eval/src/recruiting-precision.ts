import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { createDatabaseConnection, type EvidenceItem, type SearchDocument } from "@seeku/db";
import { createProvider, type LLMProvider } from "@seeku/llm";
import { SearchPipeline } from "@seeku/search";

const RecruitingPrecisionQuerySchema = z.object({
  id: z.string(),
  text: z.string(),
  mustRoles: z.array(z.string()).default([]),
  mustSkills: z.array(z.string()).default([]),
  mustLocations: z.array(z.string()).default([]),
  forbiddenTerms: z.array(z.string()).default([]),
  minTop5Precision: z.number().min(0).max(1).default(0.4),
  notes: z.string().optional()
});

export type RecruitingPrecisionQuery = z.infer<typeof RecruitingPrecisionQuerySchema>;

export interface RecruitingPrecisionCandidate {
  personId: string;
  finalScore: number;
  roleHit: boolean;
  skillHit: boolean;
  locationHit: boolean;
  forbiddenHit: boolean;
  passed: boolean;
  reasons: string[];
  facetRole: string[];
  facetTags: string[];
  facetLocation: string[];
}

export interface RecruitingPrecisionQueryResult {
  queryId: string;
  text: string;
  top5Precision: number;
  top10Precision: number;
  passedGate: boolean;
  candidates: RecruitingPrecisionCandidate[];
}

export interface RecruitingPrecisionSummary {
  totalQueries: number;
  passedQueries: number;
  avgTop5Precision: number;
  avgTop10Precision: number;
  results: RecruitingPrecisionQueryResult[];
}

export interface RecruitingPrecisionRunOptions {
  queries?: RecruitingPrecisionQuery[];
  queryIds?: string[];
  limit?: number;
  provider?: LLMProvider;
  useCrossEncoder?: boolean;
}

function datasetPath() {
  return resolve(import.meta.dirname, "..", "datasets", "recruiting-precision-queries.json");
}

export async function loadRecruitingPrecisionQueries(): Promise<RecruitingPrecisionQuery[]> {
  const content = await readFile(datasetPath(), "utf-8");
  return z.array(RecruitingPrecisionQuerySchema).parse(JSON.parse(content));
}

export function selectRecruitingPrecisionQueries(
  queries: RecruitingPrecisionQuery[],
  queryIds?: string[]
): RecruitingPrecisionQuery[] {
  if (!queryIds || queryIds.length === 0) {
    return queries;
  }

  const requested = new Set(queryIds.map((queryId) => normalize(queryId)));
  const selected = queries.filter((query) => requested.has(normalize(query.id)));
  const found = new Set(selected.map((query) => normalize(query.id)));
  const missing = queryIds.filter((queryId) => !found.has(normalize(queryId)));

  if (missing.length > 0) {
    throw new Error(`Unknown recruiting precision query id(s): ${missing.join(", ")}`);
  }

  return selected;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function containsAny(haystack: string, terms: string[]) {
  const normalizedHaystack = normalize(haystack);
  return terms.some((term) => normalizedHaystack.includes(normalize(term)));
}

function buildCandidateText(document: SearchDocument | undefined, evidence: EvidenceItem[]) {
  return [
    document?.docText ?? "",
    ...(document?.facetRole ?? []),
    ...(document?.facetTags ?? []),
    ...(document?.facetLocation ?? []),
    ...evidence.flatMap((item) => [item.title ?? "", item.description ?? ""])
  ].join("\n");
}

export function scoreRecruitingCandidate(
  query: RecruitingPrecisionQuery,
  candidate: {
    personId: string;
    finalScore: number;
    document?: SearchDocument;
    evidence?: EvidenceItem[];
  }
): RecruitingPrecisionCandidate {
  const document = candidate.document;
  const evidence = candidate.evidence ?? [];
  const candidateText = buildCandidateText(document, evidence);
  const roleHit = query.mustRoles.length === 0 || containsAny([...(document?.facetRole ?? []), candidateText].join("\n"), query.mustRoles);
  const skillHit = query.mustSkills.length === 0 || containsAny([...(document?.facetTags ?? []), candidateText].join("\n"), query.mustSkills);
  const locationHit = query.mustLocations.length === 0 || containsAny([...(document?.facetLocation ?? []), candidateText].join("\n"), query.mustLocations);
  const forbiddenHit = query.forbiddenTerms.length > 0 && containsAny(candidateText, query.forbiddenTerms);
  const reasons = [
    roleHit ? "role" : "",
    skillHit ? "skill" : "",
    locationHit ? "location" : "",
    forbiddenHit ? "forbidden" : ""
  ].filter(Boolean);

  return {
    personId: candidate.personId,
    finalScore: candidate.finalScore,
    roleHit,
    skillHit,
    locationHit,
    forbiddenHit,
    passed: roleHit && skillHit && locationHit && !forbiddenHit,
    reasons,
    facetRole: document?.facetRole ?? [],
    facetTags: document?.facetTags ?? [],
    facetLocation: document?.facetLocation ?? []
  };
}

function precisionAt(candidates: RecruitingPrecisionCandidate[], k: number) {
  if (k <= 0) return 0;
  const topK = candidates.slice(0, k);
  if (topK.length === 0) return 0;
  return topK.filter((candidate) => candidate.passed).length / topK.length;
}

export function summarizeRecruitingPrecision(results: RecruitingPrecisionQueryResult[]): RecruitingPrecisionSummary {
  const totalQueries = results.length;
  const passedQueries = results.filter((result) => result.passedGate).length;
  return {
    totalQueries,
    passedQueries,
    avgTop5Precision: totalQueries === 0
      ? 0
      : results.reduce((sum, result) => sum + result.top5Precision, 0) / totalQueries,
    avgTop10Precision: totalQueries === 0
      ? 0
      : results.reduce((sum, result) => sum + result.top10Precision, 0) / totalQueries,
    results
  };
}

export async function runRecruitingPrecisionEval(
  options: RecruitingPrecisionRunOptions = {}
): Promise<RecruitingPrecisionSummary> {
  const loadedQueries = options.queries ?? await loadRecruitingPrecisionQueries();
  const queries = selectRecruitingPrecisionQueries(loadedQueries, options.queryIds);
  const limit = options.limit ?? 10;
  const provider = options.provider ?? createProvider();
  const { db, close } = createDatabaseConnection();

  try {
    const pipeline = new SearchPipeline({
      db,
      provider,
      useCache: false,
      // Recruiting precision should measure the same high-precision path that
      // users see in one-shot search, so cross-encoder is enabled by default.
      useCrossEncoder: options.useCrossEncoder ?? true,
      retrievalLimit: Math.max(50, limit * 5),
      crossEncoderLimit: Math.max(15, limit * 2)
    });

    const results: RecruitingPrecisionQueryResult[] = [];
    for (const query of queries) {
      const searchResult = await pipeline.search(query.text);
      const candidates = searchResult.results.slice(0, limit).map((candidate) =>
        scoreRecruitingCandidate(query, {
          personId: candidate.personId,
          finalScore: candidate.finalScore,
          document: searchResult.documents.get(candidate.personId),
          evidence: searchResult.evidence.get(candidate.personId)
        })
      );
      const top5Precision = precisionAt(candidates, 5);
      const top10Precision = precisionAt(candidates, 10);

      results.push({
        queryId: query.id,
        text: query.text,
        top5Precision,
        top10Precision,
        passedGate: top5Precision >= query.minTop5Precision,
        candidates
      });
    }

    return summarizeRecruitingPrecision(results);
  } finally {
    await close();
  }
}
